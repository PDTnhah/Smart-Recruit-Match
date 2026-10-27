"""ai.embeddings through the pgvector adapter for psycopg (AD-11, US-2.5 AC-2, CONTEXT D33, D39).

One vector per (owner_type, owner_id, version, model); writing the same key again replaces it.
Owner types are written into the SQL, not passed as parameters: each one has its own partial HNSW
index, which the planner only uses when the query names the type as a constant.
The pool registers the vector type on each connection (`configure_connection`).
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal, Protocol

from pgvector import Vector
from pgvector.psycopg import register_vector_async
from psycopg import AsyncConnection
from psycopg.rows import class_row
from psycopg_pool import AsyncConnectionPool

OwnerType = Literal["cv", "jd", "question", "skill", "essay"]

UPSERT_SQL = (
    "INSERT INTO ai.embeddings (owner_type, owner_id, version, model, embedding) "
    "VALUES (%s, %s, %s, %s, %s) "
    "ON CONFLICT ON CONSTRAINT embeddings_owner_key "
    "DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = now()"
)
SKILLS_WITHOUT_EMBEDDING_SQL = (
    "SELECT s.skill_id, s.version, s.canonical_name FROM core.v_ai_skills s "
    "WHERE NOT EXISTS (SELECT 1 FROM ai.embeddings e WHERE e.owner_type = 'skill' "
    "AND e.owner_id = s.skill_id AND e.version = s.version AND e.model = %s) "
    "ORDER BY s.skill_id"
)
PRUNE_SKILL_EMBEDDINGS_SQL = (
    "DELETE FROM ai.embeddings e WHERE e.owner_type = 'skill' AND (e.model <> %s "
    "OR NOT EXISTS (SELECT 1 FROM core.v_ai_skills s "
    "WHERE s.skill_id = e.owner_id AND s.version = e.version))"
)
"""Skill embeddings no query can use: an older row version, or another model. Left in the skill
index, they would crowd the candidates its scan returns before the version and model filters run,
so a name could find no skill at all."""
NEAREST_SKILLS_SQL = (
    "SELECT q.ordinal, n.skill_id, n.canonical_name, 1 - n.distance AS similarity "
    "FROM unnest(%s::vector[]) WITH ORDINALITY AS q(embedding, ordinal) "
    "CROSS JOIN LATERAL ("
    "SELECT s.skill_id, s.canonical_name, e.embedding <=> q.embedding AS distance "
    "FROM ai.embeddings e "
    "JOIN core.v_ai_skills s ON s.skill_id = e.owner_id AND s.version = e.version "
    "WHERE e.owner_type = 'skill' AND e.model = %s "
    "ORDER BY e.embedding <=> q.embedding LIMIT 1"
    ") n ORDER BY q.ordinal"
)
"""For each query vector, the closest current embedding of an approved skill."""


@dataclass(frozen=True)
class EmbeddingRow:
    owner_id: int
    version: int
    embedding: list[float]


@dataclass(frozen=True)
class SkillText:
    """An approved skill whose current version has no embedding of the model yet."""

    skill_id: int
    version: int
    canonical_name: str


@dataclass(frozen=True)
class NearestSkill:
    ordinal: int
    """1-based index of the query vector."""
    skill_id: int
    canonical_name: str
    similarity: float
    """Cosine similarity, from -1 to 1."""


class EmbeddingStore(Protocol):
    async def upsert(
        self, owner_type: OwnerType, model: str, rows: Sequence[EmbeddingRow]
    ) -> None: ...

    async def skills_without_embedding(self, model: str) -> list[SkillText]: ...

    async def prune_skill_embeddings(self, model: str) -> None:
        """Deletes the skill embeddings of older row versions and of other models."""
        ...

    async def nearest_skills(
        self, vectors: Sequence[Sequence[float]], model: str
    ) -> list[NearestSkill]:
        """One row per query vector while the catalogue has an embedding of `model`; none when it
        has not."""
        ...


async def configure_connection(conn: AsyncConnection) -> None:
    """`configure` of the pool: pgvector's types, then back to idle as the pool requires."""
    await register_vector_async(conn)
    await conn.commit()


class PostgresEmbeddingStore:
    def __init__(self, pool: AsyncConnectionPool) -> None:
        self._pool = pool

    async def upsert(self, owner_type: OwnerType, model: str, rows: Sequence[EmbeddingRow]) -> None:
        if not rows:
            return
        async with self._pool.connection() as conn, conn.cursor() as cursor:
            await cursor.executemany(
                UPSERT_SQL,
                [
                    (owner_type, row.owner_id, row.version, model, Vector(row.embedding))
                    for row in rows
                ],
            )

    async def skills_without_embedding(self, model: str) -> list[SkillText]:
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=class_row(SkillText)) as cursor,
        ):
            await cursor.execute(SKILLS_WITHOUT_EMBEDDING_SQL, (model,))
            return await cursor.fetchall()

    async def prune_skill_embeddings(self, model: str) -> None:
        async with self._pool.connection() as conn:
            await conn.execute(PRUNE_SKILL_EMBEDDINGS_SQL, (model,))

    async def nearest_skills(
        self, vectors: Sequence[Sequence[float]], model: str
    ) -> list[NearestSkill]:
        if not vectors:
            return []
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=class_row(NearestSkill)) as cursor,
        ):
            await cursor.execute(
                NEAREST_SKILLS_SQL, ([Vector(list(vector)) for vector in vectors], model)
            )
            return await cursor.fetchall()
