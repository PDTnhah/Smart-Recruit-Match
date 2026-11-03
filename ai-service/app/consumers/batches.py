"""Provider batches of a job in ai.llm_batches (US-3.2 AC-9, AC-17, CONTEXT D46).

A round of requests is split into parts, one row and one provider batch each. A row is
PREPARING until the provider accepts it, SUBMITTED while it runs, then PROCESSED or FAILED. Its
`failures` list the requests left without a valid answer: `retry` ones go to the next round, at
most MAX_ROUNDS.

Workers coordinate through the rows only. A poller leases one due row at a time (`FOR UPDATE SKIP
LOCKED`, then `lease_until`, renewed while it works), so two replicas never work on the same
batch. Settling a row locks
every row of its job, so the last part of a round to settle is the one that starts the next round
or finishes the job, in the same transaction that marks ai.jobs.
"""

from collections.abc import AsyncIterator, Sequence
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Any, Protocol
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import class_row
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from app.consumers.jobs_repo import FINISH_SQL

MAX_ROUNDS = 3
"""The first round plus at most 2 resends (AC-9); the CHECK of ai.llm_batches.round agrees."""
OPEN = frozenset({"PREPARING", "SUBMITTED"})


@dataclass(frozen=True)
class Failure:
    """A request of a batch left without a valid answer, and whether a resend may help."""

    key: str
    code: str
    retry: bool
    needs_review: bool = False

    def as_json(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "code": self.code,
            "retry": self.retry,
            "needs_review": self.needs_review,
        }

    @classmethod
    def from_json(cls, value: dict[str, Any]) -> "Failure":
        return cls(value["key"], value["code"], value["retry"], value.get("needs_review", False))


def requests_key(agent: str, job_id: UUID, round_number: int, part: int) -> str:
    """Where the prompts of one part are kept in the llm-logs bucket."""
    return f"{agent}/batches/{job_id}/r{round_number}-p{part}.json"


@dataclass(frozen=True)
class BatchRow:
    id: int
    job_id: UUID
    job_type: str
    job_payload: dict[str, Any]
    agent: str
    prompt_version: str
    provider: str
    model: str
    round: int
    part: int
    status: str
    provider_batch_id: str | None
    request_count: int
    failures: list[dict[str, Any]] | None
    submitted_at: datetime | None

    @property
    def requests_key(self) -> str:
        return requests_key(self.agent, self.job_id, self.round, self.part)

    def failure_list(self) -> list[Failure]:
        return [Failure.from_json(value) for value in self.failures or []]


@dataclass(frozen=True)
class NewBatch:
    job_id: UUID
    job_type: str
    job_payload: dict[str, Any]
    agent: str
    prompt_version: str
    provider: str
    model: str
    round: int
    part: int
    request_count: int
    failures: Sequence[Failure] = ()
    """Requests already failed before the batch, e.g. a pair whose data is gone."""


class JobBatches(Protocol):
    """Every row of one job, locked until the end of the transaction."""

    rows: list[BatchRow]

    async def settle(
        self, row_id: int, status: str, failures: Sequence[Failure], error: str | None
    ) -> None: ...

    async def insert(self, batches: Sequence[NewBatch]) -> None: ...

    async def finish_job(self, status: str, error: str | None) -> None: ...


class BatchStore(Protocol):
    async def started(self, job_id: UUID) -> bool:
        """Whether the job already has batches: a redelivered job message submits nothing."""
        ...

    async def start(
        self, batches: Sequence[NewBatch], *, owner: str, lease_seconds: float
    ) -> list[BatchRow] | None:
        """Inserts round 1, leased to `owner`; None when another delivery inserted it first."""
        ...

    async def claim(self, *, owner: str, lease_seconds: float) -> BatchRow | None:
        """Leases the open row due first that no live lease holds."""
        ...

    async def submitted(
        self, row_id: int, provider_batch_id: str, *, poll_seconds: int
    ) -> None: ...

    async def renew(self, row_id: int, *, owner: str, lease_seconds: float) -> bool:
        """Extends the lease `owner` holds on an open row; False when it holds it no more."""
        ...

    async def later(self, row_id: int, *, owner: str, poll_seconds: int) -> None:
        """Gives back the lease `owner` holds; the row is due again after `poll_seconds`."""
        ...

    def locked(self, job_id: UUID) -> AbstractAsyncContextManager[JobBatches]: ...


COLUMNS = (
    "id, job_id, job_type, job_payload, agent, prompt_version, provider, model, round, part, "
    "status, provider_batch_id, request_count, failures, submitted_at"
)
INSERT_COLUMNS = (
    "job_id, job_type, job_payload, agent, prompt_version, provider, model, round, part, "
    "status, request_count, failures"
)
INSERT_SQL = f"""
INSERT INTO ai.llm_batches ({INSERT_COLUMNS}, lease_owner, lease_until)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'PREPARING', %s, %s, %s,
        now() + make_interval(secs => %s))
ON CONFLICT (job_id, round, part) DO NOTHING
RETURNING {COLUMNS}
"""
STARTED_SQL = "SELECT EXISTS (SELECT FROM ai.llm_batches WHERE job_id = %s)"
CLAIM_SQL = f"""
UPDATE ai.llm_batches
SET lease_owner = %s, lease_until = now() + make_interval(secs => %s)
WHERE id = (
  SELECT id FROM ai.llm_batches
  WHERE status IN ('PREPARING', 'SUBMITTED') AND next_poll_at <= now()
    AND (lease_until IS NULL OR lease_until < now())
  ORDER BY next_poll_at, id
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING {COLUMNS}
"""
SUBMITTED_SQL = """
UPDATE ai.llm_batches
SET status = 'SUBMITTED', provider_batch_id = %s, submitted_at = now(),
    next_poll_at = now() + make_interval(secs => %s), lease_owner = NULL, lease_until = NULL
WHERE id = %s AND status = 'PREPARING'
"""
RENEW_SQL = """
UPDATE ai.llm_batches SET lease_until = now() + make_interval(secs => %s)
WHERE id = %s AND lease_owner = %s AND status IN ('PREPARING', 'SUBMITTED')
"""
LATER_SQL = """
UPDATE ai.llm_batches
SET next_poll_at = now() + make_interval(secs => %s), lease_owner = NULL, lease_until = NULL
WHERE id = %s AND lease_owner = %s
"""
LOCK_SQL = f"SELECT {COLUMNS} FROM ai.llm_batches WHERE job_id = %s ORDER BY round, part FOR UPDATE"
SETTLE_SQL = """
UPDATE ai.llm_batches
SET status = %s, failures = %s, error_message = %s, finished_at = now(),
    lease_owner = NULL, lease_until = NULL
WHERE id = %s
"""


def _insert_values(batch: NewBatch) -> tuple[Any, ...]:
    return (
        batch.job_id,
        batch.job_type,
        Jsonb(batch.job_payload),
        batch.agent,
        batch.prompt_version,
        batch.provider,
        batch.model,
        batch.round,
        batch.part,
        batch.request_count,
        Jsonb([failure.as_json() for failure in batch.failures]),
    )


class PostgresBatchStore:
    """As the ai_service role, which reads and writes schema ai (AD-4)."""

    def __init__(self, pool: AsyncConnectionPool) -> None:
        self._pool = pool

    async def started(self, job_id: UUID) -> bool:
        async with self._pool.connection() as conn:
            row = await (await conn.execute(STARTED_SQL, (job_id,))).fetchone()
        return bool(row and row[0])

    async def start(
        self, batches: Sequence[NewBatch], *, owner: str, lease_seconds: float
    ) -> list[BatchRow] | None:
        rows: list[BatchRow] = []
        async with (
            self._pool.connection() as conn,
            conn.transaction(),
            conn.cursor(row_factory=class_row(BatchRow)) as cursor,
        ):
            for batch in batches:
                await cursor.execute(INSERT_SQL, (*_insert_values(batch), owner, lease_seconds))
                row = await cursor.fetchone()
                if row is None:
                    # Part 1 goes first, so a conflict means nothing of this call was written.
                    return None
                rows.append(row)
        return rows

    async def claim(self, *, owner: str, lease_seconds: float) -> BatchRow | None:
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=class_row(BatchRow)) as cursor,
        ):
            await cursor.execute(CLAIM_SQL, (owner, lease_seconds))
            return await cursor.fetchone()

    async def submitted(self, row_id: int, provider_batch_id: str, *, poll_seconds: int) -> None:
        async with self._pool.connection() as conn:
            await conn.execute(SUBMITTED_SQL, (provider_batch_id, poll_seconds, row_id))

    async def renew(self, row_id: int, *, owner: str, lease_seconds: float) -> bool:
        async with self._pool.connection() as conn:
            cursor = await conn.execute(RENEW_SQL, (lease_seconds, row_id, owner))
            return cursor.rowcount == 1

    async def later(self, row_id: int, *, owner: str, poll_seconds: int) -> None:
        async with self._pool.connection() as conn:
            await conn.execute(LATER_SQL, (poll_seconds, row_id, owner))

    @asynccontextmanager
    async def locked(self, job_id: UUID) -> AsyncIterator[JobBatches]:
        async with (
            self._pool.connection() as conn,
            conn.transaction(),
            conn.cursor(row_factory=class_row(BatchRow)) as cursor,
        ):
            await cursor.execute(LOCK_SQL, (job_id,))
            yield _PostgresJobBatches(conn, job_id, await cursor.fetchall())


class _PostgresJobBatches:
    def __init__(self, conn: AsyncConnection, job_id: UUID, rows: list[BatchRow]) -> None:
        self._conn = conn
        self._job_id = job_id
        self.rows = rows

    async def settle(
        self, row_id: int, status: str, failures: Sequence[Failure], error: str | None
    ) -> None:
        values = [failure.as_json() for failure in failures]
        await self._conn.execute(SETTLE_SQL, (status, Jsonb(values), error, row_id))
        self.rows = [
            replace(row, status=status, failures=values) if row.id == row_id else row
            for row in self.rows
        ]

    async def insert(self, batches: Sequence[NewBatch]) -> None:
        async with self._conn.cursor(row_factory=class_row(BatchRow)) as cursor:
            for batch in batches:
                # No lease: the poller submits the new round.
                await cursor.execute(INSERT_SQL, (*_insert_values(batch), None, 0))
                row = await cursor.fetchone()
                if row is not None:
                    self.rows.append(row)

    async def finish_job(self, status: str, error: str | None) -> None:
        await self._conn.execute(FINISH_SQL, (status, error, self._job_id))
