"""Embeddings and the skill catalogue (AD-11, US-2.5, CONTEXT D39).

`model` turns text into vectors (bge-m3, or the hashing fake), `store` keeps them in ai.embeddings
and finds the nearest ones, `skill_normalizer` maps skill names to the catalogue, and `profile`
embeds a masked CV profile. US-3.2, US-4.1 and US-4.7 reuse the embedder and the store.
"""

from .catalog import (
    CatalogSkill,
    PostgresSkillCatalog,
    SkillCandidate,
    SkillCatalog,
    names_by_key,
)
from .model import (
    BGE_M3,
    EMBEDDING_DIMENSIONS,
    HASHING,
    BgeM3Embedder,
    Embedder,
    HashingEmbedder,
    build_embedder,
)
from .profile import ProfileEmbeddings, profile_text
from .skill_key import skill_match_key
from .skill_normalizer import SkillMapping, SkillNormalizer, new_skill_names
from .store import (
    EmbeddingRow,
    EmbeddingStore,
    NearestSkill,
    PostgresEmbeddingStore,
    SkillText,
    configure_connection,
)

__all__ = [
    "BGE_M3",
    "EMBEDDING_DIMENSIONS",
    "HASHING",
    "BgeM3Embedder",
    "CatalogSkill",
    "Embedder",
    "EmbeddingRow",
    "EmbeddingStore",
    "HashingEmbedder",
    "NearestSkill",
    "PostgresEmbeddingStore",
    "PostgresSkillCatalog",
    "ProfileEmbeddings",
    "SkillCandidate",
    "SkillCatalog",
    "SkillMapping",
    "SkillNormalizer",
    "SkillText",
    "build_embedder",
    "configure_connection",
    "names_by_key",
    "new_skill_names",
    "profile_text",
    "skill_match_key",
]
