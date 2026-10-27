"""US-2.5 AC-2, AC-5: the SQL of app/embedding matches the migrations of ai.embeddings and the
catalogue views (Invariant 11).

The tables and views come from Drizzle migrations in apps/api. This test reads that SQL, so a
column, constraint or owner type changed on one side only fails here, without a database.
"""

import re
import typing
from pathlib import Path

from app.embedding.catalog import APPROVED_SQL, CANDIDATES_SQL
from app.embedding.model import EMBEDDING_DIMENSIONS
from app.embedding.store import (
    NEAREST_SKILLS_SQL,
    PRUNE_SKILL_EMBEDDINGS_SQL,
    SKILLS_WITHOUT_EMBEDDING_SQL,
    UPSERT_SQL,
    OwnerType,
)

MIGRATIONS = Path(__file__).resolve().parents[3] / "apps" / "api" / "drizzle"


def migration(suffix: str) -> str:
    paths = sorted(MIGRATIONS.glob(f"*_{suffix}.sql"))
    assert len(paths) == 1, f"expected one *_{suffix}.sql in {MIGRATIONS} (monorepo checkout)"
    return paths[0].read_text(encoding="utf-8")


def view_columns(sql: str, view: str) -> list[str]:
    body = sql.split(f"CREATE OR REPLACE VIEW {view} WITH (security_barrier) AS", 1)[1]
    select = body.split("FROM", 1)[0].replace("SELECT", "", 1)
    return [re.split(r"\s+AS\s+", column.strip())[-1].strip('"') for column in select.split(",")]


def test_ad11_upsert_targets_the_unique_owner_key():
    sql = migration("skills_embeddings")
    assert (
        'CONSTRAINT "embeddings_owner_key" UNIQUE("owner_type","owner_id","version","model")' in sql
    )
    assert f'"embedding" vector({EMBEDDING_DIMENSIONS}) NOT NULL' in sql
    assert "ON CONFLICT ON CONSTRAINT embeddings_owner_key" in UPSERT_SQL
    columns = re.search(r"\(([^)]*)\) VALUES", UPSERT_SQL)
    assert columns and columns.group(1).split(", ") == [
        "owner_type",
        "owner_id",
        "version",
        "model",
        "embedding",
    ]


def test_ad11_owner_types_match_the_check_and_each_has_a_partial_hnsw_index():
    sql = migration("skills_embeddings")
    check = re.search(r'"embeddings_owner_type_check" CHECK \([^)]* in \(([^)]*)\)\)', sql)
    assert check, "embeddings_owner_type_check not found"
    owner_types = re.findall(r"'([a-z]+)'", check.group(1))
    assert owner_types == list(typing.get_args(OwnerType))
    for owner_type in owner_types:
        assert (
            f'USING hnsw ("embedding" vector_cosine_ops) '
            f'WHERE "ai"."embeddings"."owner_type" = \'{owner_type}\''
        ) in sql
    # A constant, not a parameter: the planner then uses the skill index (CONTEXT D39).
    for query in (SKILLS_WITHOUT_EMBEDDING_SQL, NEAREST_SKILLS_SQL, PRUNE_SKILL_EMBEDDINGS_SQL):
        assert "e.owner_type = 'skill'" in query


def test_fr13_catalogue_reads_only_the_view_columns():
    sql = migration("ai_skill_views_seed")
    assert view_columns(sql, "core.v_ai_skills") == [
        "skill_id",
        "canonical_name",
        "aliases",
        "group",
        "version",
    ]
    assert view_columns(sql, "core.v_ai_skill_candidates") == ["skill_id", "name"]
    assert "WHERE status IN ('APPROVED')" in sql.split("core.v_ai_skill_candidates", 1)[0]
    assert 'SELECT skill_id, canonical_name, aliases, "group", version FROM core.v_ai_skills' in (
        APPROVED_SQL
    )
    assert "SELECT skill_id, name FROM core.v_ai_skill_candidates" in CANDIDATES_SQL
    assert "GRANT SELECT ON core.v_ai_skills, core.v_ai_skill_candidates TO ai_service" in sql
