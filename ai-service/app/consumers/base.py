"""The job runner every AI job type shares (AD-5, NFR-10, CONTEXT D33).

A handler only turns a job payload into an output model. The runner does the rest:
- validates the payload with the generated contract; an invalid one goes to the DLQ;
- claims the job in ai.jobs, so a job that already finished is skipped (idempotent by job_id);
- retries in process: RetryableError and any unclassified error wait 2 s, then 10 s; the third
  failure publishes a FAILED result and moves the message to `<queue>.dlq`;
- a PermanentError fails the job at once with `needs_human` set (AC-7);
- order: publish the result (confirmed by the broker), mark ai.jobs, then ack. A crash in between
  redelivers the job, so delivery is at least once and the backend absorbs duplicates.
"""

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from enum import Enum
from typing import Any

from pydantic import BaseModel, ValidationError

from app.consumers.errors import PermanentError
from app.consumers.jobs_repo import JobStore
from app.consumers.outbox import Outbox
from app.contracts.ai_job_error import AiJobError
from app.contracts.ai_result_status import AiResultStatus
from app.queues import QUEUES, QueueManifest

logger = logging.getLogger(__name__)

RETRIES_EXHAUSTED = "RETRIES_EXHAUSTED"
MAX_ERROR_LENGTH = 1000

Handler = Callable[[Any], Awaitable[BaseModel]]
"""Takes the validated job payload, returns the output model of its job type."""


class Settle(Enum):
    ACK = "ack"
    REQUEUE = "requeue"


@dataclass(frozen=True)
class JobKind:
    """One job type: its queue and the generated models of its payload and result message."""

    type: str
    queue: str
    job_model: type[BaseModel]
    result_model: type[BaseModel]


def _job_id_of(body: bytes) -> str:
    try:
        value = json.loads(body).get("job_id")
    except (ValueError, AttributeError):
        return "unknown"
    return value if isinstance(value, str) else "unknown"


class JobRunner:
    def __init__(
        self,
        kind: JobKind,
        handler: Handler,
        store: JobStore,
        outbox: Outbox,
        *,
        manifest: QueueManifest = QUEUES,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self.kind = kind
        self._handler = handler
        self._store = store
        self._outbox = outbox
        self._manifest = manifest
        self._sleep = sleep

    async def process(self, body: bytes) -> Settle:
        """Handles one delivery and says how to settle it. Never raises."""
        try:
            try:
                job = self.kind.job_model.model_validate_json(body)
            except ValidationError as error:
                logger.warning(
                    "job %s: invalid %s message moved to its DLQ: %s",
                    _job_id_of(body),
                    self.kind.queue,
                    error,
                )
                await self._outbox.dead_letter(
                    self.kind.queue, body, f"INVALID_MESSAGE: {error}", attempts=0
                )
                return Settle.ACK
            return await self._run(job, body)
        except Exception:
            # Database or broker trouble, not the job's fault: deliver it again later.
            logger.exception("job %s: infrastructure failure, message requeued", _job_id_of(body))
            return Settle.REQUEUE

    async def _run(self, job: Any, body: bytes) -> Settle:
        attempt = await self._store.claim(job.job_id, self.kind.type)
        if attempt is None:
            logger.info("job %s: already finished, duplicate delivery skipped", job.job_id)
            return Settle.ACK
        max_attempts = self._manifest.max_attempts
        if attempt > max_attempts:
            # Every earlier delivery died mid-job (worker crash): the retry budget is spent.
            await self._fail(
                job,
                body,
                attempt - 1,
                RETRIES_EXHAUSTED,
                "the worker stopped during every earlier attempt",
                dead_letter=True,
            )
            return Settle.ACK
        while True:
            try:
                output = await self._handler(job)
            except PermanentError as error:
                logger.warning("job %s: permanent failure: %s", job.job_id, error)
                await self._fail(job, body, attempt, error.code, str(error), dead_letter=False)
                return Settle.ACK
            except Exception as error:  # RetryableError, and anything not classified
                message = f"{type(error).__name__}: {error}"
                if attempt >= max_attempts:
                    logger.error(
                        "job %s: attempt %d failed, giving up: %s", job.job_id, attempt, message
                    )
                    await self._fail(
                        job, body, attempt, RETRIES_EXHAUSTED, message, dead_letter=True
                    )
                    return Settle.ACK
                delay = self._manifest.retry_delays_seconds[attempt - 1]
                logger.warning(
                    "job %s: attempt %d failed, retrying in %d s: %s",
                    job.job_id,
                    attempt,
                    delay,
                    message,
                )
                await self._sleep(delay)
                attempt = await self._store.retry(job.job_id, message[:MAX_ERROR_LENGTH])
                continue
            result = self._result(job, AiResultStatus.SUCCEEDED, output, None)
            await self._outbox.publish_result(result, str(job.job_id))
            await self._store.finish(job.job_id, AiResultStatus.SUCCEEDED.value, None)
            return Settle.ACK

    async def _fail(
        self, job: Any, body: bytes, attempts: int, code: str, message: str, *, dead_letter: bool
    ) -> None:
        # Retries are spent or cannot help either way: staff must look at the CV or JD.
        error = AiJobError(code=code, message=message[:MAX_ERROR_LENGTH], needs_human=True)
        await self._outbox.publish_result(
            self._result(job, AiResultStatus.FAILED, None, error), str(job.job_id)
        )
        if dead_letter:
            # Before marking ai.jobs: a crash here repeats the DLQ copy rather than losing it.
            await self._outbox.dead_letter(self.kind.queue, body, f"{code}: {message}", attempts)
        await self._store.finish(
            job.job_id, AiResultStatus.FAILED.value, f"{code}: {message}"[:MAX_ERROR_LENGTH]
        )

    def _result(
        self, job: Any, status: AiResultStatus, output: BaseModel | None, error: AiJobError | None
    ) -> BaseModel:
        """The ai.results message; `job` echoes the payload so FAILED still names the item."""
        return self.kind.result_model(
            job_id=job.job_id,
            type=self.kind.type,
            status=status,
            job=job,
            result=output,
            error=error,
        )
