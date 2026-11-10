"""What the Grader reads: core.v_ai_essay_answers only (US-4.4 AC-3, AD-4, BR-03).

One row per answered essay of a closed session that has no final score yet: the question (stem,
rubric, sample answer) and the answer text. The view has no column about the student, so nothing
of who wrote the answer can reach the prompt. An answer gone from the view (a human graded it
meanwhile) is simply not graded.

Each answer is graded twice; a request of the batch is keyed `s{session}-q{question}-p{pass}-v{N}`
(`N` from the prompt version), which fits the `BATCH_KEY` rule of app/llm/batch.py (CONTEXT D53).
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any, Protocol

from psycopg.rows import class_row
from psycopg_pool import AsyncConnectionPool

from app.llm.types import PROMPT_VERSION

ANSWERS_SQL = (
    "SELECT session_id, question_id, stem, rubric, sample_answer, answer_text "
    "FROM core.v_ai_essay_answers WHERE session_id = ANY(%s::bigint[])"
)
KEY = re.compile(r"^s(?P<session>\d+)-q(?P<question>\d+)-p(?P<pass_no>\d+)-v(?P<version>\d+)$")


@dataclass(frozen=True)
class AnswerRow:
    session_id: int
    question_id: int
    stem: str | None
    rubric: Any
    """`[{criterion, max_points}]` as stored with the question (RubricCriterion)."""
    sample_answer: str | None
    answer_text: str | None


@dataclass(frozen=True)
class AnswerRef:
    """One pass over one answer: what a batch key names."""

    session_id: int
    question_id: int
    pass_no: int


def answer_key(session_id: int, question_id: int, pass_no: int, prompt_version: str) -> str:
    match = PROMPT_VERSION.match(prompt_version)
    if match is None:
        raise ValueError(f"not a prompt version: {prompt_version!r}")
    return f"s{session_id}-q{question_id}-p{pass_no}-v{match['number']}"


def ref_of(key: str) -> AnswerRef:
    match = KEY.match(key)
    if match is None:
        raise ValueError(f"not a Grader batch key: {key!r}")
    return AnswerRef(int(match["session"]), int(match["question"]), int(match["pass_no"]))


class EssayAnswerRepo(Protocol):
    async def answers(self, session_ids: Iterable[int]) -> list[AnswerRow]: ...


class PostgresEssayAnswerRepo:
    """As the ai_service role, which may only SELECT the view (AD-4)."""

    def __init__(self, pool: AsyncConnectionPool) -> None:
        self._pool = pool

    async def answers(self, session_ids: Iterable[int]) -> list[AnswerRow]:
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=class_row(AnswerRow)) as cursor,
        ):
            await cursor.execute(ANSWERS_SQL, (sorted(set(session_ids)),))
            return await cursor.fetchall()
