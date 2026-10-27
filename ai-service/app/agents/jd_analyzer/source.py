"""The JD to analyse, read through core.v_ai_jd_source (AD-4, CONTEXT D35).

The ai_service role sees only this view: JDs awaiting analysis, without the rest of the row. A JD
that has left the view (HR entered the requirements, or a newer version exists) is not an error
worth retrying: the backend ignores a late result anyway.
"""

from dataclasses import dataclass
from typing import Protocol

from psycopg.rows import class_row
from psycopg_pool import AsyncConnectionPool

SOURCE_SQL = (
    "SELECT jd_id, version, title, raw_text, file_key FROM core.v_ai_jd_source "
    "WHERE jd_id = %s AND version = %s"
)


@dataclass(frozen=True)
class JdSource:
    jd_id: int
    version: int
    title: str
    raw_text: str | None
    file_key: str | None
    """Object key in the jd-files bucket when HR uploaded the original file."""


class JdSourceRepo(Protocol):
    async def fetch(self, jd_id: int, version: int) -> JdSource | None: ...


class PostgresJdSourceRepo:
    def __init__(self, pool: AsyncConnectionPool) -> None:
        self._pool = pool

    async def fetch(self, jd_id: int, version: int) -> JdSource | None:
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=class_row(JdSource)) as cursor,
        ):
            await cursor.execute(SOURCE_SQL, (jd_id, version))
            return await cursor.fetchone()
