"""In-memory stand-ins for the skill catalogue, ai.embeddings and the embedding model (US-2.5).

`MemoryEmbeddingStore` answers like PostgresEmbeddingStore: only embeddings of the current version
of an approved skill count, and similarity is the cosine (vectors are unit length). `TableEmbedder`
returns the vector a test chose for a text, so a test sets the similarity it needs, and the hashing
vector for any other text.
"""

import math
from collections.abc import Sequence

from app.embedding import (
    EMBEDDING_DIMENSIONS,
    CatalogSkill,
    EmbeddingRow,
    HashingEmbedder,
    NearestSkill,
    SkillCandidate,
    SkillNormalizer,
    SkillText,
)


def unit(*coordinates: float) -> list[float]:
    """A 1024-dimension vector starting with `coordinates`, scaled to length 1."""
    vector = [*coordinates, *[0.0] * (EMBEDDING_DIMENSIONS - len(coordinates))]
    norm = math.sqrt(sum(value * value for value in vector))
    return [value / norm for value in vector]


def at_similarity(similarity: float) -> list[float]:
    """A vector whose cosine with `unit(1)` is exactly `similarity`."""
    return unit(similarity, math.sqrt(1 - similarity * similarity))


def skill(skill_id: int, name: str, *aliases: str, group: str = "TOOL", version: int = 0):
    return CatalogSkill(skill_id, name, list(aliases), group, version)


class MemoryCatalog:
    def __init__(
        self, skills: Sequence[CatalogSkill] = (), candidates: Sequence[SkillCandidate] = ()
    ) -> None:
        self.skills = list(skills)
        self.pending = list(candidates)
        self.reads = 0

    async def approved(self) -> list[CatalogSkill]:
        self.reads += 1
        return list(self.skills)

    async def candidates(self, skill_ids: Sequence[int]) -> list[SkillCandidate]:
        return [c for c in self.pending if c.skill_id in skill_ids]


class MemoryEmbeddingStore:
    def __init__(self, catalog: MemoryCatalog) -> None:
        self.catalog = catalog
        self.rows: dict[tuple[str, int, int, str], list[float]] = {}
        self.writes: list[tuple[str, int, int, str]] = []

    async def upsert(self, owner_type: str, model: str, rows: Sequence[EmbeddingRow]) -> None:
        for row in rows:
            key = (owner_type, row.owner_id, row.version, model)
            self.rows[key] = list(row.embedding)
            self.writes.append(key)

    async def skills_without_embedding(self, model: str) -> list[SkillText]:
        return [
            SkillText(s.skill_id, s.version, s.canonical_name)
            for s in self.catalog.skills
            if ("skill", s.skill_id, s.version, model) not in self.rows
        ]

    async def prune_skill_embeddings(self, model: str) -> None:
        current = {(s.skill_id, s.version) for s in self.catalog.skills}
        for key in [
            key
            for key in self.rows
            if key[0] == "skill" and (key[3] != model or (key[1], key[2]) not in current)
        ]:
            del self.rows[key]

    async def nearest_skills(
        self, vectors: Sequence[Sequence[float]], model: str
    ) -> list[NearestSkill]:
        current = [
            (s, self.rows[("skill", s.skill_id, s.version, model)])
            for s in self.catalog.skills
            if ("skill", s.skill_id, s.version, model) in self.rows
        ]
        if not current:
            return []
        nearest = []
        for ordinal, vector in enumerate(vectors, start=1):
            best, similarity = max(
                ((s, sum(a * b for a, b in zip(vector, e, strict=True))) for s, e in current),
                key=lambda pair: pair[1],
            )
            nearest.append(NearestSkill(ordinal, best.skill_id, best.canonical_name, similarity))
        return nearest


class TableEmbedder:
    def __init__(self, vectors: dict[str, list[float]] | None = None, model: str = "table-v1"):
        self.vectors = vectors or {}
        self._model = model
        self.calls: list[list[str]] = []

    @property
    def model(self) -> str:
        return self._model

    async def load(self) -> None:
        return None

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        others = await HashingEmbedder().embed(texts)
        return [self.vectors.get(text, other) for text, other in zip(texts, others, strict=True)]


CATALOGUE = [
    skill(1, "Java", group="LANGUAGE"),
    skill(2, "Spring Boot", "SpringBoot", group="FRAMEWORK"),
    skill(3, "PostgreSQL", "Postgres", group="DATABASE"),
    skill(4, "Docker", group="CLOUD_DEVOPS"),
    skill(5, "SQL", group="LANGUAGE"),
    skill(6, "React", "ReactJS", group="FRAMEWORK"),
    skill(7, "TypeScript", "TS", group="LANGUAGE"),
    skill(8, "Python", group="LANGUAGE"),
]
"""A small catalogue for the agent tests; Git, Redis and Rust embedded are not in it."""


class CatalogueHarness:
    """A SkillNormalizer over CATALOGUE with the hashing vectors, and its in-memory parts."""

    def __init__(self) -> None:
        self.catalog = MemoryCatalog(CATALOGUE)
        self.store = MemoryEmbeddingStore(self.catalog)
        self.embedder = TableEmbedder(model="hashing-v1")
        self.normalizer = SkillNormalizer(
            catalog=self.catalog, store=self.store, embedder=self.embedder
        )
