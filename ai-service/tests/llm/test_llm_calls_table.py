"""US-2.2 AC-5: what the AI Service writes matches the ai.llm_calls migration (Invariant 11).

The table is created by a Drizzle migration in apps/api, and later migrations add columns to it
(`batch_id`, US-3.2) or redefine a CHECK (`provider`, US-2.9). This test reads that SQL, so a
column or CHECK value changed on one side only fails here, without a database.
"""

import re
from pathlib import Path

from app.llm.recorder import INSERT_SQL, LLM_CALL_COLUMNS
from app.llm.types import EFFORTS, Outcome, Provider, StopReason

MIGRATIONS = Path(__file__).resolve().parents[3] / "apps" / "api" / "drizzle"


def migration_sql() -> str:
    paths = sorted(MIGRATIONS.glob("*_ai_llm_calls.sql"))
    assert len(paths) == 1, f"expected one *_ai_llm_calls.sql in {MIGRATIONS} (monorepo checkout)"
    return paths[0].read_text(encoding="utf-8")


def table_columns(sql: str) -> list[str]:
    body = sql.split('CREATE TABLE "ai"."llm_calls" (', 1)[1].split("\n);", 1)[0]
    return re.findall(r'^\t"([a-z_]+)" ', body, flags=re.MULTILINE)


def added_columns() -> list[str]:
    """Columns later migrations add, in migration order."""
    return [
        column
        for path in sorted(MIGRATIONS.glob("*.sql"))
        for column in re.findall(
            r'ALTER TABLE "ai"\."llm_calls" ADD COLUMN "([a-z_]+)"',
            path.read_text(encoding="utf-8"),
        )
    ]


def check_values(sql: str, constraint: str) -> list[str]:
    match = re.search(rf'"{constraint}" CHECK \([^)]* in \(([^)]*)\)\)', sql)
    assert match, f"{constraint} not found"
    return re.findall(r"'([A-Z_]+)'", match.group(1))


def latest_check_values(constraint: str) -> list[str]:
    """The values of the last migration that defines the CHECK, as a migration that adds a value
    drops and recreates it."""
    sqls = [path.read_text(encoding="utf-8") for path in sorted(MIGRATIONS.glob("*.sql"))]
    return check_values([sql for sql in sqls if f'"{constraint}" CHECK' in sql][-1], constraint)


def test_nfr11_written_columns_exist_in_the_migration():
    columns = table_columns(migration_sql())
    assert columns[0] == "id" and columns[-1] == "created_at"
    assert added_columns() == ["batch_id"]
    assert list(LLM_CALL_COLUMNS) == [*columns[1:-1], *added_columns()]
    assert INSERT_SQL.count("%s") == len(LLM_CALL_COLUMNS)


def test_nfr11_enumerations_match_the_check_constraints():
    assert latest_check_values("llm_calls_provider_check") == [p.value for p in Provider]
    assert latest_check_values("llm_batches_provider_check") == [p.value for p in Provider]
    assert latest_check_values("llm_calls_effort_check") == [e.upper() for e in EFFORTS]
    assert latest_check_values("llm_calls_outcome_check") == [o.value for o in Outcome]
    assert latest_check_values("llm_calls_stop_reason_check") == [s.value for s in StopReason]
