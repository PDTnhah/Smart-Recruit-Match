"""The skill catalogue, read through core.v_ai_skills and core.v_ai_skill_candidates (AD-4,
US-2.5, CONTEXT D39).

The ai_service role sees approved skills (the catalogue) and the names awaiting ADMIN, nothing
else of core.skills. A name the AI Service finds outside the catalogue reaches the backend through
ai.results; only the backend writes core.skills.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Protocol

from psycopg.rows import class_row
from psycopg_pool import AsyncConnectionPool

from .skill_key import skill_match_key

APPROVED_SQL = (
    'SELECT skill_id, canonical_name, aliases, "group", version FROM core.v_ai_skills '
    "ORDER BY skill_id"
)
CANDIDATES_SQL = (
    "SELECT skill_id, name FROM core.v_ai_skill_candidates WHERE skill_id = ANY(%s) "
    "ORDER BY skill_id"
)


@dataclass(frozen=True)
class CatalogSkill:
    skill_id: int
    canonical_name: str
    aliases: list[str]
    group: str
    version: int
    """core.skills.row_version: an embedding of an older version is stale."""


@dataclass(frozen=True)
class SkillCandidate:
    skill_id: int
    name: str
    """As the CV or JD wrote it."""


def names_by_key(catalogue: Iterable[CatalogSkill]) -> dict[str, str]:
    """The canonical name for the key of each catalogue name and alias. The database keeps a key
    to one skill (trigger skills_keys_distinct); were it not, the lowest skill_id would win."""
    by_key: dict[str, str] = {}
    for skill in catalogue:
        for spelling in (skill.canonical_name, *skill.aliases):
            by_key.setdefault(skill_match_key(spelling), skill.canonical_name)
    return by_key


class SkillCatalog(Protocol):
    async def approved(self) -> list[CatalogSkill]: ...

    async def candidates(self, skill_ids: Sequence[int]) -> list[SkillCandidate]:
        """Those of `skill_ids` still awaiting review."""
        ...


class PostgresSkillCatalog:
    def __init__(self, pool: AsyncConnectionPool) -> None:
        self._pool = pool

    async def approved(self) -> list[CatalogSkill]:
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=class_row(CatalogSkill)) as cursor,
        ):
            await cursor.execute(APPROVED_SQL)
            return await cursor.fetchall()

    async def candidates(self, skill_ids: Sequence[int]) -> list[SkillCandidate]:
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=class_row(SkillCandidate)) as cursor,
        ):
            await cursor.execute(CANDIDATES_SQL, (list(skill_ids),))
            return await cursor.fetchall()
