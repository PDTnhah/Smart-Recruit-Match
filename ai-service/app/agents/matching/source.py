"""What the Matching Agent reads, through the three views of AD-4 only (US-3.2 AC-5, BR-03).

- core.v_ai_match_pairs: the pending pairs of a run, with the verdicts the backend computed;
- core.v_ai_cv_profile_masked: the confirmed, active CV, PII already masked (`profile_masked`,
  `masked_text`);
- core.v_ai_jd_requirements: the approved requirements of the JD.

A pair, CV or JD missing from its view (the CV was replaced, the JD has a new version, the pair got
its result) is not an error to retry: the pair is reported as SOURCE_MISSING.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from psycopg.rows import class_row
from psycopg_pool import AsyncConnectionPool

from app.contracts.match_pair_ref import MatchPairRef

PAIRS_SQL = """
SELECT p.cv_id, p.cv_version, p.jd_id, p.jd_version, p.criteria
FROM core.v_ai_match_pairs p
JOIN unnest(%s::bigint[], %s::integer[], %s::bigint[], %s::integer[])
  AS wanted(cv_id, cv_version, jd_id, jd_version)
  USING (cv_id, cv_version, jd_id, jd_version)
WHERE p.campaign_id = %s AND p.rules_version = %s
"""
CVS_SQL = (
    "SELECT cv_id, version, profile_masked, masked_text FROM core.v_ai_cv_profile_masked "
    "WHERE cv_id = ANY(%s::bigint[])"
)
JDS_SQL = (
    "SELECT jd_id, version, position_group, requirements FROM core.v_ai_jd_requirements "
    "WHERE jd_id = ANY(%s::bigint[])"
)


@dataclass(frozen=True)
class PairRow:
    cv_id: int
    cv_version: int
    jd_id: int
    jd_version: int
    criteria: dict[str, Any]
    """Verdicts of the code part (MatchCodeCriteria): skills, education, language, zones, gaps."""


@dataclass(frozen=True)
class CvRow:
    cv_id: int
    version: int
    profile_masked: dict[str, Any]
    masked_text: str | None
    """Text of the uploaded file with PII replaced; None for a scanned CV."""


@dataclass(frozen=True)
class JdRow:
    jd_id: int
    version: int
    position_group: str | None
    requirements: dict[str, Any]


def pair_key(pair: MatchPairRef | PairRow) -> str:
    """Batch key of a pair: it names the pair and fits `^[a-zA-Z0-9_-]{1,64}$` (AC-7)."""
    return f"{pair.cv_id}_{pair.cv_version}_{pair.jd_id}_{pair.jd_version}"


def pair_of(key: str) -> MatchPairRef:
    cv_id, cv_version, jd_id, jd_version = (int(part) for part in key.split("_"))
    return MatchPairRef(cv_id=cv_id, cv_version=cv_version, jd_id=jd_id, jd_version=jd_version)


class MatchSourceRepo(Protocol):
    async def pairs(
        self, campaign_id: int, rules_version: str, refs: Sequence[MatchPairRef]
    ) -> list[PairRow]: ...

    async def cvs(self, cv_ids: Iterable[int]) -> dict[int, CvRow]: ...

    async def jds(self, jd_ids: Iterable[int]) -> dict[int, JdRow]: ...


class PostgresMatchSourceRepo:
    def __init__(self, pool: AsyncConnectionPool) -> None:
        self._pool = pool

    async def pairs(
        self, campaign_id: int, rules_version: str, refs: Sequence[MatchPairRef]
    ) -> list[PairRow]:
        columns = (
            [ref.cv_id for ref in refs],
            [ref.cv_version for ref in refs],
            [ref.jd_id for ref in refs],
            [ref.jd_version for ref in refs],
        )
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=class_row(PairRow)) as cursor,
        ):
            await cursor.execute(PAIRS_SQL, (*columns, campaign_id, rules_version))
            return await cursor.fetchall()

    async def cvs(self, cv_ids: Iterable[int]) -> dict[int, CvRow]:
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=class_row(CvRow)) as cursor,
        ):
            await cursor.execute(CVS_SQL, (sorted(set(cv_ids)),))
            return {row.cv_id: row for row in await cursor.fetchall()}

    async def jds(self, jd_ids: Iterable[int]) -> dict[int, JdRow]:
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=class_row(JdRow)) as cursor,
        ):
            await cursor.execute(JDS_SQL, (sorted(set(jd_ids)),))
            return {row.jd_id: row for row in await cursor.fetchall()}
