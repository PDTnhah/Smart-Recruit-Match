"""US-2.2 AC-5: what the AI Service writes matches the ai.llm_calls migration (Invariant 11).

The table is created by a Drizzle migration in apps/api. This test reads that SQL, so a column or
CHECK value changed on one side only fails here, without a database.
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


def check_values(sql: str, constraint: str) -> list[str]:
    match = re.search(rf'"{constraint}" CHECK \([^)]* in \(([^)]*)\)\)', sql)
    assert match, f"{constraint} not found"
    return re.findall(r"'([A-Z_]+)'", match.group(1))


def test_nfr11_written_columns_exist_in_the_migration():
    columns = table_columns(migration_sql())
    assert columns[0] == "id" and columns[-1] == "created_at"
    assert list(LLM_CALL_COLUMNS) == columns[1:-1]
    assert INSERT_SQL.count("%s") == len(LLM_CALL_COLUMNS)


def test_nfr11_enumerations_match_the_check_constraints():
    sql = migration_sql()
    assert check_values(sql, "llm_calls_provider_check") == [p.value for p in Provider]
    assert check_values(sql, "llm_calls_effort_check") == [e.upper() for e in EFFORTS]
    assert check_values(sql, "llm_calls_outcome_check") == [o.value for o in Outcome]
    assert check_values(sql, "llm_calls_stop_reason_check") == [s.value for s in StopReason]
