"""US-3.2 AC-14: every request of a batch writes one ai.llm_calls row and one llm-logs file."""

from decimal import Decimal

import pytest
from matching_support import Harness, key, match_job, ref

pytestmark = pytest.mark.anyio


async def test_gd3_each_batch_request_logged() -> None:
    worker = Harness()
    worker.provider.script = {key(2, 10): ["expired"]}
    job = match_job(ref(1, 10), ref(2, 10))

    await worker.agent(job)
    await worker.drain()

    rows = worker.calls.rows
    # Round 1: two requests; round 2: the expired one again; round 3: once more.
    assert len(rows) == 4
    by_round = {}
    for record in rows:
        by_round.setdefault(record.attempt, []).append(record)
    assert sorted(by_round) == [1, 2, 3]
    batch_ids = {r["round"]: r["id"] for r in worker.store.rows.values()}
    assert {record.attempt: record.batch_id for record in rows} == batch_ids

    succeeded = next(r for r in rows if r.outcome == "SUCCEEDED")
    assert (succeeded.agent, succeeded.prompt_version, succeeded.effort) == (
        "matching",
        "matching/v1",
        "medium",
    )
    assert (succeeded.provider, succeeded.model) == ("ANTHROPIC", "claude-opus-5-5")
    assert succeeded.stop_reason == "END_TURN"
    assert (succeeded.usage.cache_read_tokens, succeeded.usage.output_tokens) == (900, 200)
    # Batch prices: 300 x 2 + 900 x 0.10 + 200 x 10 USD per million tokens.
    assert succeeded.cost_usd == Decimal("0.002690")

    expired = [r for r in rows if r.outcome == "API_ERROR"]
    assert len(expired) == 3
    assert all(r.stop_reason is None and r.cost_usd is None for r in expired)

    for record in rows:
        log = worker.objects.files[record.log_key]
        assert log["call_id"] == str(record.call_id)
        assert log["batch"]["id"] == record.batch_id
        assert log["request"]["prompt_version"] == "matching/v1"
    assert worker.objects.files[succeeded.log_key]["response"]["model"] == "claude-opus-5-5"
    assert worker.objects.files[expired[0].log_key]["error"] == "expired"
