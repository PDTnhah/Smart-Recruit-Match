"""ai.question_drafts and their vectors in ai.embeddings (US-4.1 AC-6, AC-8, CONTEXT D49).

The only tables the Test Generator writes. A draft and its vector are written in one transaction,
so a draft never lacks the vector the duplicate check compares with. Vectors are read with a join
on `bank_id` through the unique keys of both tables, never through the HNSW index: a bank holds a
few hundred drafts, and a filter after an index scan could miss some (LESSONS §24). The owner type
is a constant in the SQL, as app/embedding/store.py writes it.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import UUID

from pgvector import Vector
from psycopg.rows import class_row
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from app.embedding import EmbeddingRow
from app.embedding.store import UPSERT_SQL

from .config import QUESTION_EMBEDDING_VERSION

DRAFTS_SQL = (
    "SELECT id AS draft_id, type, skill, skill_key, difficulty, stem_key, payload, model, "
    "prompt_version FROM ai.question_drafts WHERE bank_id = %s ORDER BY id"
)
VECTORS_SQL = (
    "SELECT e.owner_id AS draft_id, e.embedding FROM ai.embeddings e "
    "JOIN ai.question_drafts d ON d.id = e.owner_id "
    "WHERE e.owner_type = 'question' AND e.version = %s AND e.model = %s AND d.bank_id = %s"
)
INSERT_SQL = (
    "INSERT INTO ai.question_drafts (bank_id, job_id, type, skill, skill_key, difficulty, "
    "stem_key, payload, model, prompt_version) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
    "ON CONFLICT ON CONSTRAINT question_drafts_bank_stem_key DO NOTHING RETURNING id"
)


@dataclass(frozen=True)
class Draft:
    """A draft the bank holds. `payload` is the question as GeneratedQuestion writes it, without
    `draft_id`, `model` and `prompt_version`, which are columns."""

    draft_id: int
    type: str
    skill: str
    skill_key: str
    difficulty: str
    stem_key: str
    payload: dict[str, Any]
    model: str
    prompt_version: str


@dataclass(frozen=True)
class NewDraft:
    bank_id: int
    job_id: UUID
    type: str
    skill: str
    skill_key: str
    difficulty: str
    stem_key: str
    payload: dict[str, Any]
    model: str
    prompt_version: str
    embedding: list[float]


@dataclass(frozen=True)
class _VectorRow:
    draft_id: int
    embedding: Vector


class QuestionDraftRepo(Protocol):
    async def drafts(self, bank_id: int) -> list[Draft]:
        """Every draft of the bank, oldest first."""
        ...

    async def vectors(self, bank_id: int, model: str) -> dict[int, list[float]]:
        """Draft id → vector of `model`, for the drafts of the bank that have one."""
        ...

    async def insert(self, drafts: Sequence[NewDraft], model: str) -> list[int | None]:
        """Each draft with its vector, in one transaction. The new id per draft, in order, or None
        when the bank already holds its stem (another job got there first)."""
        ...

    async def add_vectors(self, model: str, rows: Sequence[EmbeddingRow]) -> None:
        """Vectors for drafts that lack one of `model` (written with another embedder)."""
        ...


class PostgresQuestionDraftRepo:
    def __init__(self, pool: AsyncConnectionPool) -> None:
        self._pool = pool

    async def drafts(self, bank_id: int) -> list[Draft]:
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=class_row(Draft)) as cursor,
        ):
            await cursor.execute(DRAFTS_SQL, (bank_id,))
            return await cursor.fetchall()

    async def vectors(self, bank_id: int, model: str) -> dict[int, list[float]]:
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=class_row(_VectorRow)) as cursor,
        ):
            await cursor.execute(VECTORS_SQL, (QUESTION_EMBEDDING_VERSION, model, bank_id))
            rows = await cursor.fetchall()
        return {row.draft_id: row.embedding.to_list() for row in rows}

    async def insert(self, drafts: Sequence[NewDraft], model: str) -> list[int | None]:
        if not drafts:
            return []
        ids: list[int | None] = []
        async with self._pool.connection() as conn, conn.transaction(), conn.cursor() as cursor:
            for draft in drafts:
                await cursor.execute(
                    INSERT_SQL,
                    (
                        draft.bank_id,
                        draft.job_id,
                        draft.type,
                        draft.skill,
                        draft.skill_key,
                        draft.difficulty,
                        draft.stem_key,
                        Jsonb(draft.payload),
                        draft.model,
                        draft.prompt_version,
                    ),
                )
                row = await cursor.fetchone()
                if row is None:
                    ids.append(None)
                    continue
                draft_id = int(row[0])
                ids.append(draft_id)
                await cursor.execute(
                    UPSERT_SQL,
                    (
                        "question",
                        draft_id,
                        QUESTION_EMBEDDING_VERSION,
                        model,
                        Vector(draft.embedding),
                    ),
                )
        return ids

    async def add_vectors(self, model: str, rows: Sequence[EmbeddingRow]) -> None:
        if not rows:
            return
        async with self._pool.connection() as conn, conn.cursor() as cursor:
            await cursor.executemany(
                UPSERT_SQL,
                [
                    ("question", row.owner_id, row.version, model, Vector(row.embedding))
                    for row in rows
                ],
            )
