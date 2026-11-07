"""ai.question_validations: one verdict per draft, written once (US-4.2 AC-5, CONTEXT D50).

The AI Service may only insert into the table (migration 0031 revokes UPDATE and DELETE). A draft
checked again, by a retried attempt that raced the first one, keeps its first verdict: the insert
does nothing on the unique `draft_id`. Verdicts are read with their draft's type, which decides how
the stored answer reads back.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import UUID

from psycopg.rows import class_row
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from app.contracts.question_validation import QuestionValidation

from .verdict import Verdict, stored_validation

VALIDATIONS_SQL = (
    "SELECT v.draft_id, d.type, v.reasons, v.verdict, v.model, v.prompt_version "
    "FROM ai.question_validations v JOIN ai.question_drafts d ON d.id = v.draft_id "
    "WHERE d.bank_id = %s"
)
INSERT_SQL = (
    "INSERT INTO ai.question_validations (draft_id, job_id, status, reasons, verdict, model, "
    "prompt_version) VALUES (%s, %s, %s, %s, %s, %s, %s) "
    "ON CONFLICT ON CONSTRAINT question_validations_draft_id_key DO NOTHING"
)


class QuestionValidationRepo(Protocol):
    async def validations(self, bank_id: int) -> dict[int, QuestionValidation]:
        """Draft id → verdict, for the drafts of the bank checked so far."""
        ...

    async def insert(self, job_id: UUID, verdicts: Sequence[Verdict]) -> None:
        """The verdicts, in one transaction; a draft that has one already keeps it."""
        ...


@dataclass(frozen=True)
class _Row:
    draft_id: int
    type: str
    reasons: list[str]
    verdict: dict[str, Any]
    model: str
    prompt_version: str


class PostgresQuestionValidationRepo:
    def __init__(self, pool: AsyncConnectionPool) -> None:
        self._pool = pool

    async def validations(self, bank_id: int) -> dict[int, QuestionValidation]:
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=class_row(_Row)) as cursor,
        ):
            await cursor.execute(VALIDATIONS_SQL, (bank_id,))
            rows = await cursor.fetchall()
        return {
            row.draft_id: stored_validation(
                draft_type=row.type,
                reasons=row.reasons,
                answer=row.verdict,
                model=row.model,
                prompt_version=row.prompt_version,
            )
            for row in rows
        }

    async def insert(self, job_id: UUID, verdicts: Sequence[Verdict]) -> None:
        if not verdicts:
            return
        async with self._pool.connection() as conn, conn.transaction(), conn.cursor() as cursor:
            await cursor.executemany(
                INSERT_SQL,
                [
                    (
                        verdict.draft_id,
                        job_id,
                        verdict.validation.status.value,
                        [reason.value for reason in verdict.validation.reasons],
                        Jsonb(verdict.answer),
                        verdict.validation.model,
                        verdict.validation.prompt_version,
                    )
                    for verdict in verdicts
                ],
            )
