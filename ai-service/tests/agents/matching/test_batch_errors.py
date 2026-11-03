"""US-3.2 AC-9: per-pair errors of a batch, resends and the PARTIAL result."""

import pytest
from matching_support import (
    Harness,
    ScriptedSyncProvider,
    answer,
    final_of,
    items_of,
    key,
    match_job,
    ref,
    refusal,
)

from app.llm.batch import BatchState, BatchStatus
from app.llm.types import StopReason

pytestmark = pytest.mark.anyio


def failed(final: dict) -> list[tuple[int, int, str, bool]]:
    return [
        (p["cv_id"], p["jd_id"], p["code"], p["needs_review"])
        for p in final["result"]["failed_pairs"]
    ]


async def test_gd3_errored_expired_invalid_resubmitted() -> None:
    truncated = answer('{"project_relevance": {', stop_reason=StopReason.MAX_TOKENS)
    worker = Harness()
    worker.provider.script = {
        key(1, 10): ["expired", answer()],
        key(2, 10): ["overloaded_error: busy", answer()],
        key(3, 10): [answer('{"summary": "thiếu trường"}'), answer()],
        key(1, 20): [truncated],
        key(2, 20): ["invalid_request_error: bad params"],
    }
    pairs = (ref(1, 10), ref(2, 10), ref(3, 10), ref(1, 20), ref(2, 20))
    job = match_job(*pairs)

    await worker.agent(job)
    await worker.drain()

    rounds = [keys for _, keys in worker.provider.submitted]
    assert rounds == [
        [key(1, 10), key(2, 10), key(3, 10), key(1, 20), key(2, 20)],
        [key(1, 10), key(2, 10), key(3, 10), key(1, 20)],
        [key(1, 20)],
    ]
    assert sorted(items_of(worker.outbox.results)) == [key(1, 10), key(2, 10), key(3, 10)]
    final = final_of(worker.outbox.results)
    assert final["status"] == "PARTIAL"
    assert failed(final) == [(2, 20, "LLM_BAD_REQUEST", False), (1, 20, "TRUNCATED", False)]
    assert worker.store.jobs[job.job_id] == "PARTIAL"


async def test_gd3_refusal_resent_sync_then_needs_review() -> None:
    worker = Harness(
        sync=ScriptedSyncProvider(refusal(), answer(model="claude-opus-5")),
    )
    worker.provider.script = {key(1, 10): [refusal()], key(2, 10): [refusal()]}
    job = match_job(ref(1, 10), ref(2, 10), ref(3, 10))

    await worker.agent(job)
    await worker.drain()

    # Refused pairs are resent one by one, never in a batch round of their own.
    assert len(worker.provider.submitted) == 1
    assert len(worker.sync.sent) == 2
    items = items_of(worker.outbox.results)
    assert sorted(items) == [key(2, 10), key(3, 10)]
    assert items[key(2, 10)]["model"] == "claude-opus-5"
    final = final_of(worker.outbox.results)
    assert failed(final) == [(1, 10, "LLM_REFUSAL", True)]
    assert final["status"] == "PARTIAL"


async def test_gd3_partial_lists_failed_pairs() -> None:
    worker = Harness()
    worker.sources.missing_pairs.add(key(3, 10))
    job = match_job(ref(1, 10), ref(2, 10), ref(3, 10))

    await worker.agent(job)
    await worker.drain()

    assert worker.provider.submitted[0][1] == [key(1, 10), key(2, 10)]
    assert sorted(items_of(worker.outbox.results)) == [key(1, 10), key(2, 10)]
    final = final_of(worker.outbox.results)
    assert (final["status"], failed(final)) == ("PARTIAL", [(3, 10, "SOURCE_MISSING", False)])
    assert final["job"]["job_id"] == str(job.job_id)
    assert worker.store.jobs[job.job_id] == "PARTIAL"


async def test_gd3_every_pair_without_data_ends_the_job_at_once() -> None:
    worker = Harness()
    worker.sources.missing_pairs.update({key(1, 10), key(2, 10)})
    output = await worker.agent(match_job(ref(1, 10), ref(2, 10)))

    assert output.final is True
    assert [p.code for p in output.failed_pairs] == ["SOURCE_MISSING", "SOURCE_MISSING"]
    assert worker.provider.submitted == []
    assert worker.store.rows == {}


async def test_gd3_whole_batch_failed_is_sent_again() -> None:
    worker = Harness()
    job = match_job(ref(1, 10), ref(2, 10))
    await worker.agent(job)
    [(first_batch, _)] = worker.provider.submitted
    worker.provider.states[first_batch] = BatchStatus(BatchState.FAILED, "JOB_STATE_EXPIRED")

    await worker.drain()

    assert len(worker.provider.submitted) == 2
    rows = sorted(worker.store.rows.values(), key=lambda r: r["round"])
    assert [(r["round"], r["status"]) for r in rows] == [(1, "FAILED"), (2, "PROCESSED")]
    assert rows[0]["error_message"] == "JOB_STATE_EXPIRED"
    assert final_of(worker.outbox.results)["status"] == "SUCCEEDED"
    assert worker.store.jobs[job.job_id] == "SUCCEEDED"
