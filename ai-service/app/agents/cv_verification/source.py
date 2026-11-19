"""What part C reads, through the masked views of AD-4 only (US-4.8 AC-2, AC-3, AC-5, BR-03).

- core.v_ai_cv_profile_masked: the confirmed, active CV version, PII already masked;
- core.v_ai_jd_requirements: the approved requirements of the JD, to pick the entries that matter;
- core.v_ai_cv_verification_answers: the questions and answers of part C once the session closed.
  The view has no column about the student.

A row gone from its view (a newer CV version, a session still open) is not an error worth
retrying: the job fails for good and the backend shows the preference without part C.
"""

from dataclasses import dataclass
from typing import Any, Protocol

from psycopg.rows import class_row
from psycopg_pool import AsyncConnectionPool

CV_SQL = (
    "SELECT cv_id, version, profile_masked FROM core.v_ai_cv_profile_masked "
    "WHERE cv_id = %s AND version = %s"
)
JD_SQL = (
    "SELECT jd_id, position_group, requirements FROM core.v_ai_jd_requirements WHERE jd_id = %s"
)
ANSWERS_SQL = (
    "SELECT question_id, no, stem, claim_ref, answer_text "
    "FROM core.v_ai_cv_verification_answers WHERE preference_id = %s ORDER BY no"
)


@dataclass(frozen=True)
class CvRow:
    cv_id: int
    version: int
    profile_masked: dict[str, Any]


@dataclass(frozen=True)
class JdRow:
    jd_id: int
    position_group: str | None
    requirements: dict[str, Any]


@dataclass(frozen=True)
class AnswerRow:
    question_id: int
    no: int
    stem: str
    claim_ref: dict[str, Any]
    """`{section, index}` as the drafting step stored it (CvClaimRef)."""
    answer_text: str | None
    """None when the student left the question blank."""


class CvVerificationSourceRepo(Protocol):
    async def cv(self, cv_id: int, version: int) -> CvRow | None: ...

    async def jd(self, jd_id: int) -> JdRow | None: ...

    async def answers(self, preference_id: int) -> list[AnswerRow]: ...


class PostgresCvVerificationSourceRepo:
    """As the ai_service role, which may only SELECT the views (AD-4)."""

    def __init__(self, pool: AsyncConnectionPool) -> None:
        self._pool = pool

    async def cv(self, cv_id: int, version: int) -> CvRow | None:
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=class_row(CvRow)) as cursor,
        ):
            await cursor.execute(CV_SQL, (cv_id, version))
            return await cursor.fetchone()

    async def jd(self, jd_id: int) -> JdRow | None:
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=class_row(JdRow)) as cursor,
        ):
            await cursor.execute(JD_SQL, (jd_id,))
            return await cursor.fetchone()

    async def answers(self, preference_id: int) -> list[AnswerRow]:
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=class_row(AnswerRow)) as cursor,
        ):
            await cursor.execute(ANSWERS_SQL, (preference_id,))
            return await cursor.fetchall()
