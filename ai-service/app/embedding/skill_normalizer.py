"""Skill names mapped to the catalogue (PRD GĐ2 step 3, US-2.5 AC-3, AC-4, AC-10, CONTEXT D39).

1. A name whose key (`skill_match_key`) equals the key of a catalogue name or alias maps to that
   skill: ALIAS.
2. Otherwise its embedding is compared with the catalogue's; the closest skill maps it when the
   cosine similarity reaches the threshold (SKILL_MATCH_THRESHOLD, 0.85 by default): EMBEDDING.
3. Otherwise it is NEW: it keeps its name, and the backend queues it for ADMIN (FR-13).

No LLM takes part (ARCHITECTURE › Pipeline CV Parser, step 6). The catalogue is read on every call,
so a skill approved or merged a moment ago maps at once (AC-10). Approved skills without an
embedding of the current model and row version are embedded first and stored in ai.embeddings;
the embeddings they supersede are deleted then.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any

from app.config import DEFAULT_SKILL_MATCH_THRESHOLD
from app.contracts.skill_match import SkillMatch
from app.parsing.pii import has_mask_token

from .catalog import SkillCatalog, names_by_key
from .model import Embedder
from .skill_key import skill_match_key
from .store import EmbeddingRow, EmbeddingStore


@dataclass(frozen=True)
class SkillMapping:
    name: str
    """As written."""
    canonical_name: str | None
    """The catalogue skill; None when NEW."""
    match: SkillMatch

    def as_json(self) -> dict[str, Any]:
        """A CvSkill of the stored profile."""
        return {"name": self.name, "canonical_name": self.canonical_name, "match": self.match.value}


class SkillNormalizer:
    def __init__(
        self,
        *,
        catalog: SkillCatalog,
        store: EmbeddingStore,
        embedder: Embedder,
        threshold: float = DEFAULT_SKILL_MATCH_THRESHOLD,
    ) -> None:
        self._catalog = catalog
        self._store = store
        self._embedder = embedder
        self._threshold = threshold

    async def normalize(self, names: Sequence[str]) -> list[SkillMapping]:
        """One mapping per name, in order."""
        if not names:
            return []
        by_key = names_by_key(await self._catalog.approved())
        unmatched: dict[str, str] = {}
        for name in names:
            key = skill_match_key(name)
            if key and key not in by_key:
                unmatched.setdefault(key, name)
        by_embedding = await self._nearest(unmatched) if unmatched else {}

        mappings = []
        for name in names:
            key = skill_match_key(name)
            if key in by_key:
                mappings.append(SkillMapping(name, by_key[key], SkillMatch.ALIAS))
            elif key in by_embedding:
                mappings.append(SkillMapping(name, by_embedding[key], SkillMatch.EMBEDDING))
            else:
                mappings.append(SkillMapping(name, None, SkillMatch.NEW))
        return mappings

    async def embed_catalogue(self) -> int:
        """Embeds the approved skills that have no vector of this model and version, then deletes
        the vectors they supersede; how many it embedded."""
        missing = await self._store.skills_without_embedding(self._embedder.model)
        if not missing:
            return 0
        vectors = await self._embedder.embed([skill.canonical_name for skill in missing])
        await self._store.upsert(
            "skill",
            self._embedder.model,
            [
                EmbeddingRow(skill.skill_id, skill.version, vector)
                for skill, vector in zip(missing, vectors, strict=True)
            ],
        )
        await self._store.prune_skill_embeddings(self._embedder.model)
        return len(missing)

    async def _nearest(self, unmatched: dict[str, str]) -> dict[str, str]:
        """Canonical name per key whose closest catalogue skill reaches the threshold."""
        await self.embed_catalogue()
        keys = list(unmatched)
        vectors = await self._embedder.embed([unmatched[key] for key in keys])
        nearest = await self._store.nearest_skills(vectors, self._embedder.model)
        return {
            keys[row.ordinal - 1]: row.canonical_name
            for row in nearest
            if row.similarity >= self._threshold
        }


def new_skill_names(names: Iterable[str]) -> list[str]:
    """The `new_skills` of a result: one name per key, in order, without a blank key or a masked
    value (BR-03: these names are stored in core.skills and sent to the LLM)."""
    seen: set[str] = set()
    distinct = []
    for name in names:
        key = skill_match_key(name)
        if key and key not in seen and not has_mask_token(name):
            seen.add(key)
            distinct.append(name)
    return distinct
