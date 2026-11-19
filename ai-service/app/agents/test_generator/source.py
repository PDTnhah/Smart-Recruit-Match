"""The bank to fill, read through three views of AD-4 only (US-4.1 AC-6, US-4.11 AC-4, CONTEXT
D49, D60).

- core.v_ai_question_banks: the banks not locked yet, with their blueprint;
- core.v_ai_jd_requirements: the approved requirements of the JD, for the prompt;
- core.v_ai_question_rejections: the drafts CENTER rejected by hand, with the reasons, while the
  bank is not locked.

A bank missing from the join (locked by the Validator, or its JD is no longer approved) is not an
error to retry: the backend stores nothing for a locked bank anyway.
"""

from dataclasses import dataclass
from typing import Any, Protocol

from psycopg.rows import class_row
from psycopg_pool import AsyncConnectionPool

from app.contracts.exam_blueprint import ExamBlueprint

BANK_SQL = (
    "SELECT b.bank_id, b.jd_id, b.jd_version, b.blueprint, "
    "r.version AS requirements_version, r.position_group, r.requirements "
    "FROM core.v_ai_question_banks b "
    "JOIN core.v_ai_jd_requirements r ON r.jd_id = b.jd_id "
    "WHERE b.bank_id = %s"
)
REJECTIONS_SQL = "SELECT draft_id, reasons FROM core.v_ai_question_rejections WHERE bank_id = %s"


@dataclass(frozen=True)
class BankRow:
    bank_id: int
    jd_id: int
    jd_version: int
    blueprint: dict[str, Any]
    requirements_version: int
    position_group: str | None
    requirements: dict[str, Any]


@dataclass(frozen=True)
class BankSource:
    bank_id: int
    jd_id: int
    jd_version: int
    """Version of the requirements the blueprint was built from."""
    requirements_version: int
    """Version the view has now; newer when HR changed the requirements since (US-4.2)."""
    blueprint: ExamBlueprint
    position_group: str | None
    requirements: dict[str, Any]
    """As stored; only the skill groups are read, so a row written before a later field of the
    contract still reads."""


@dataclass(frozen=True)
class _RejectionRow:
    draft_id: int
    reasons: list[str]


class BankSourceRepo(Protocol):
    async def fetch(self, bank_id: int) -> BankSource | None: ...

    async def rejections(self, bank_id: int) -> dict[int, tuple[str, ...]]:
        """Reasons (QUESTION_REJECT_REASONS codes) of each draft CENTER rejected by hand, by draft
        id: none once the bank is locked."""
        ...


class PostgresBankSourceRepo:
    def __init__(self, pool: AsyncConnectionPool) -> None:
        self._pool = pool

    async def fetch(self, bank_id: int) -> BankSource | None:
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=class_row(BankRow)) as cursor,
        ):
            await cursor.execute(BANK_SQL, (bank_id,))
            row = await cursor.fetchone()
        if row is None:
            return None
        return BankSource(
            bank_id=row.bank_id,
            jd_id=row.jd_id,
            jd_version=row.jd_version,
            requirements_version=row.requirements_version,
            blueprint=ExamBlueprint.model_validate(row.blueprint),
            position_group=row.position_group,
            requirements=row.requirements,
        )

    async def rejections(self, bank_id: int) -> dict[int, tuple[str, ...]]:
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=class_row(_RejectionRow)) as cursor,
        ):
            await cursor.execute(REJECTIONS_SQL, (bank_id,))
            rows = await cursor.fetchall()
        return {row.draft_id: tuple(row.reasons) for row in rows}
