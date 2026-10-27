"""State of each job in ai.jobs: the only table the AI Service writes for a job (AD-4, AD-5)."""

from typing import Protocol
from uuid import UUID

from psycopg_pool import AsyncConnectionPool

# A new job starts at attempt 1. A redelivered job still PROCESSING (the worker died, or another
# replica holds a duplicate) starts its next attempt. A finished job returns no row: skip it.
CLAIM_SQL = """
INSERT INTO ai.jobs (job_id, type, status, attempts) VALUES (%s, %s, 'PROCESSING', 1)
ON CONFLICT (job_id) DO UPDATE SET attempts = ai.jobs.attempts + 1
WHERE ai.jobs.status = 'PROCESSING'
RETURNING attempts
"""

RETRY_SQL = """
UPDATE ai.jobs SET attempts = attempts + 1, last_error = %s
WHERE job_id = %s AND status = 'PROCESSING'
RETURNING attempts
"""

FINISH_SQL = """
UPDATE ai.jobs SET status = %s, last_error = %s, finished_at = now()
WHERE job_id = %s AND status = 'PROCESSING'
"""


class JobStore(Protocol):
    async def claim(self, job_id: UUID, job_type: str) -> int | None:
        """The number of this attempt, or None when the job has already finished."""
        ...

    async def retry(self, job_id: UUID, error: str) -> int:
        """Records a failed attempt and returns the number of the next one."""
        ...

    async def finish(self, job_id: UUID, status: str, error: str | None) -> None:
        """SUCCEEDED, PARTIAL or FAILED; a finished job is never claimed again."""
        ...


class PostgresJobStore:
    def __init__(self, pool: AsyncConnectionPool) -> None:
        self._pool = pool

    async def claim(self, job_id: UUID, job_type: str) -> int | None:
        async with self._pool.connection() as conn:
            row = await (await conn.execute(CLAIM_SQL, (job_id, job_type))).fetchone()
        return None if row is None else int(row[0])

    async def retry(self, job_id: UUID, error: str) -> int:
        async with self._pool.connection() as conn:
            row = await (await conn.execute(RETRY_SQL, (error, job_id))).fetchone()
        if row is None:
            raise RuntimeError(f"job {job_id} is no longer PROCESSING")
        return int(row[0])

    async def finish(self, job_id: UUID, status: str, error: str | None) -> None:
        async with self._pool.connection() as conn:
            await conn.execute(FINISH_SQL, (status, error, job_id))
