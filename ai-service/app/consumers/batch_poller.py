"""Runs jobs that go through provider batches (US-3.2 AC-9, AC-17, CONTEXT D46).

The job handler calls `start`: the round-1 rows go into ai.llm_batches, leased to this worker, then
each part is submitted and the handler returns DEFERRED, so the job message is acked within seconds
although the batch may run for hours. A redelivered message finds the rows and submits nothing.

`run` is the background task of every worker. It leases one due row at a time and:
- PREPARING (never accepted, e.g. the worker stopped or the provider was down): submits it;
- SUBMITTED: asks the provider; when the batch has ended, reads the results through the
  StructuredBatchClient and lets the job type publish its answers (`BatchJob.complete`).
Settling the last part of a round either submits the requests worth a resend as the next round,
or lets the job type publish its final result (`BatchJob.finish`) and marks ai.jobs, in one
transaction.
A crash before that commit leaves the row open: another poller reads the results again, and the
backend absorbs the repeated messages.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable, Mapping, Sequence
from typing import Protocol
from uuid import UUID

from pydantic import BaseModel

from app.consumers.batches import (
    MAX_ROUNDS,
    OPEN,
    BatchRow,
    BatchStore,
    Failure,
    NewBatch,
    requests_key,
)
from app.contracts.ai_result_status import AiResultStatus
from app.llm.batch import BatchOutcome, BatchRequest, BatchState, StructuredBatchClient
from app.llm.types import Effort, ProviderCallError

logger = logging.getLogger(__name__)

LEASE_SECONDS = 15 * 60
"""How long a claimed row stays with its poller. A step renews it every third of that, so only a
poller that stopped loses the row; an expired lease frees it for another one."""


class BatchJob(Protocol):
    """What a job type that runs in batches adds to the shared flow."""

    job_type: str
    output_model: type[BaseModel]
    effort: Effort

    async def complete(
        self,
        row: BatchRow,
        requests: Sequence[BatchRequest],
        outcomes: Mapping[str, BatchOutcome],
    ) -> list[Failure]:
        """Publishes the answers of one ended part; returns the requests left without one."""
        ...

    async def finish(self, row: BatchRow, failures: Sequence[Failure]) -> AiResultStatus:
        """Publishes the final result of the job, which names every failure."""
        ...


class BatchCoordinator:
    def __init__(
        self,
        store: BatchStore,
        client: StructuredBatchClient,
        jobs: Mapping[str, BatchJob],
        *,
        owner: str,
        poll_seconds: int,
        lease_seconds: float = LEASE_SECONDS,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._store = store
        self._client = client
        self._jobs = jobs
        self._owner = owner
        self._poll_seconds = poll_seconds
        self._lease_seconds = lease_seconds
        self._sleep = sleep

    async def started(self, job_id: UUID) -> bool:
        return await self._store.started(job_id)

    async def start(
        self,
        *,
        job_id: UUID,
        job_type: str,
        job_payload: dict,
        requests: Sequence[BatchRequest],
        failures: Sequence[Failure] = (),
    ) -> None:
        """Submits round 1. `failures` are requests that failed before any batch."""
        if not requests:
            raise ValueError("a batch needs at least one request")
        job = self._jobs[job_type]
        prompt = requests[0].prompt
        parts = self._client.split(requests, output_model=job.output_model, effort=job.effort)
        for number, part in enumerate(parts, 1):
            await self._client.save_requests(requests_key(prompt.agent, job_id, 1, number), part)
        rows = await self._store.start(
            [
                NewBatch(
                    job_id=job_id,
                    job_type=job_type,
                    job_payload=job_payload,
                    agent=prompt.agent,
                    prompt_version=prompt.prompt_version,
                    provider=self._client.provider.value,
                    model=self._client.model,
                    round=1,
                    part=number,
                    request_count=len(part),
                    failures=failures if number == 1 else (),
                )
                for number, part in enumerate(parts, 1)
            ],
            owner=self._owner,
            lease_seconds=self._lease_seconds,
        )
        if rows is None:
            logger.info("job %s: batches already started by another delivery", job_id)
            return
        for row, part in zip(rows, parts, strict=True):
            await self._submit(row, part)

    async def run(self) -> None:
        """Polls until cancelled; an idle poll waits `poll_seconds`."""
        while True:
            try:
                busy = await self.poll_once()
            except Exception:
                logger.exception("batch poller: poll failed")
                busy = False
            if not busy:
                await self._sleep(self._poll_seconds)

    async def poll_once(self) -> bool:
        """Works on one due row; False when none is due."""
        row = await self._store.claim(owner=self._owner, lease_seconds=self._lease_seconds)
        if row is None:
            return False
        keeper = asyncio.create_task(self._keep_lease(row))
        try:
            await self._step(row)
        except Exception:
            logger.exception(
                "batch %s (job %s): step failed, tried again later", row.id, row.job_id
            )
            await self._later(row)
        finally:
            keeper.cancel()
        return True

    async def _keep_lease(self, row: BatchRow) -> None:
        """Renews the lease while a step runs: reading a large batch, or resending its refusals one
        by one, may outlast one lease, and another poller must not read the same batch meanwhile."""
        while True:
            await asyncio.sleep(self._lease_seconds / 3)
            try:
                held = await self._store.renew(
                    row.id, owner=self._owner, lease_seconds=self._lease_seconds
                )
            except Exception:
                logger.exception("batch %s (job %s): lease not renewed", row.id, row.job_id)
                continue
            if not held:
                logger.warning("batch %s (job %s): lease lost", row.id, row.job_id)
                return

    async def _later(self, row: BatchRow) -> None:
        await self._store.later(row.id, owner=self._owner, poll_seconds=self._poll_seconds)

    async def _step(self, row: BatchRow) -> None:
        if row.status == "PREPARING":
            await self._submit(row)
            return
        assert row.provider_batch_id is not None
        status = await self._client.status(row.provider_batch_id)
        if status.state is BatchState.RUNNING:
            await self._later(row)
            return
        requests = await self._client.load_requests(row.requests_key)
        if status.state is BatchState.FAILED:
            logger.warning("batch %s (job %s) failed: %s", row.id, row.job_id, status.detail)
            failures = [Failure(r.key, "BATCH_FAILED", retry=True) for r in requests]
            await self._settle(row, "FAILED", failures, status.detail or "batch failed")
            return
        job = self._jobs[row.job_type]
        outcomes = await self._client.collect(
            row.provider_batch_id,
            requests,
            output_model=job.output_model,
            effort=job.effort,
            job_id=row.job_id,
            batch_row_id=row.id,
            round_number=row.round,
            submitted_at=row.submitted_at,
        )
        failures = await job.complete(row, requests, outcomes)
        await self._settle(row, "PROCESSED", failures, None)

    async def _submit(self, row: BatchRow, requests: Sequence[BatchRequest] | None = None) -> None:
        requests = requests or await self._client.load_requests(row.requests_key)
        job = self._jobs[row.job_type]
        try:
            batch_id = await self._client.submit(
                requests,
                output_model=job.output_model,
                effort=job.effort,
                display_name=f"{row.job_type.lower()}-{row.job_id}-r{row.round}-p{row.part}",
            )
        except ProviderCallError as error:
            if error.retryable:
                logger.warning(
                    "batch %s (job %s): submit failed, retried: %s", row.id, row.job_id, error
                )
                await self._later(row)
                return
            failures = [Failure(r.key, "LLM_BAD_REQUEST", retry=False) for r in requests]
            await self._settle(row, "FAILED", failures, str(error))
            return
        await self._store.submitted(row.id, batch_id, poll_seconds=self._poll_seconds)
        logger.info(
            "job %s: round %d part %d submitted as %s (%d requests)",
            row.job_id,
            row.round,
            row.part,
            batch_id,
            len(requests),
        )

    async def _settle(
        self, row: BatchRow, status: str, failures: Sequence[Failure], error: str | None
    ) -> None:
        job = self._jobs[row.job_type]
        async with self._store.locked(row.job_id) as batches:
            current = next((r for r in batches.rows if r.id == row.id), None)
            if current is None or current.status not in OPEN:
                return  # another poller settled it first
            await batches.settle(row.id, status, [*current.failure_list(), *failures], error)
            rows = batches.rows
            this_round = [r for r in rows if r.round == row.round]
            if any(r.status in OPEN for r in this_round) or any(r.round > row.round for r in rows):
                return
            retry = {f.key for r in this_round for f in r.failure_list() if f.retry}
            if retry and row.round < MAX_ROUNDS:
                await batches.insert(await self._next_round(row, this_round, retry))
                return
            final = [
                f for r in rows for f in r.failure_list() if not f.retry or r.round == row.round
            ]
            result = await job.finish(row, final)
            await batches.finish_job(result.value, None)
            logger.info("job %s: finished %s after round %d", row.job_id, result, row.round)

    async def _next_round(
        self, row: BatchRow, this_round: Sequence[BatchRow], retry: set[str]
    ) -> list[NewBatch]:
        job = self._jobs[row.job_type]
        requests = [
            request
            for part in this_round
            for request in await self._client.load_requests(part.requests_key)
            if request.key in retry
        ]
        parts = self._client.split(requests, output_model=job.output_model, effort=job.effort)
        number = row.round + 1
        batches = []
        for part_number, part in enumerate(parts, 1):
            await self._client.save_requests(
                requests_key(row.agent, row.job_id, number, part_number), part
            )
            batches.append(
                NewBatch(
                    job_id=row.job_id,
                    job_type=row.job_type,
                    job_payload=row.job_payload,
                    agent=row.agent,
                    prompt_version=row.prompt_version,
                    provider=self._client.provider.value,
                    model=self._client.model,
                    round=number,
                    part=part_number,
                    request_count=len(part),
                )
            )
        logger.info("job %s: %d request(s) resent as round %d", row.job_id, len(requests), number)
        return batches
