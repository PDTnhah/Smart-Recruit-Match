"""US-3.2 AC-17: a batch survives restarts and several replicas (CONTEXT D46)."""

import asyncio
from datetime import timedelta

import pytest
from matching_support import Harness, final_of, items_of, key, match_job, ref

from app.consumers.base import DEFERRED
from app.llm.batch import BatchState, BatchStatus
from app.llm.types import ProviderCallError

pytestmark = pytest.mark.anyio

PAIRS = (ref(1, 10), ref(2, 10), ref(1, 20))


async def test_gd3_ack_after_submit_resume_after_restart() -> None:
    first = Harness(owner="worker-1")
    job = match_job(*PAIRS)

    assert await first.agent(job) is DEFERRED
    [row] = first.store.rows.values()
    assert (row["status"], row["round"], row["part"]) == ("SUBMITTED", 1, 1)
    assert first.store.jobs[job.job_id] == "PROCESSING"
    assert first.outbox.results == []

    # The broker delivers the job again (the ack was lost): nothing is submitted twice.
    assert await first.agent(job) is DEFERRED
    assert len(first.provider.submitted) == 1

    # The worker restarts: a new process reads the batch from ai.llm_batches and finishes the job.
    restarted = Harness(
        store=first.store, objects=first.objects, provider=first.provider, owner="worker-1b"
    )
    await restarted.drain()
    assert sorted(items_of(restarted.outbox.results)) == sorted(
        key(r.cv_id, r.jd_id) for r in PAIRS
    )
    final = final_of(restarted.outbox.results)
    assert (final["status"], final["result"]["failed_pairs"]) == ("SUCCEEDED", [])
    assert restarted.store.jobs[job.job_id] == "SUCCEEDED"
    assert len(first.provider.submitted) == 1


async def test_gd3_worker_dead_before_submit_leaves_a_row_the_poller_submits() -> None:
    first = Harness(owner="worker-1")
    first.provider.fail_submit = RuntimeError("worker killed")
    job = match_job(*PAIRS)
    with pytest.raises(RuntimeError):
        await first.agent(job)
    [row] = first.store.rows.values()
    assert row["status"] == "PREPARING"

    first.provider.fail_submit = None
    other = Harness(store=first.store, objects=first.objects, provider=first.provider)
    # The lease of the dead worker still holds: nobody else submits yet.
    assert await other.coordinator.poll_once() is False
    first.store.now += timedelta(minutes=16)
    await other.drain()
    assert len(first.provider.submitted) == 1
    assert first.store.jobs[job.job_id] == "SUCCEEDED"


async def test_gd3_provider_down_at_submit_is_retried_by_the_poller() -> None:
    worker = Harness()
    worker.provider.fail_submit = ProviderCallError("overloaded", retryable=True, status=529)
    job = match_job(*PAIRS)
    assert await worker.agent(job) is DEFERRED
    assert worker.provider.submitted == []

    worker.provider.fail_submit = None
    await worker.drain()
    assert len(worker.provider.submitted) == 1
    assert worker.store.jobs[job.job_id] == "SUCCEEDED"


async def test_gd3_two_replicas_one_batch() -> None:
    a = Harness(owner="replica-a")
    b = Harness(store=a.store, objects=a.objects, provider=a.provider, owner="replica-b")
    job = match_job(*PAIRS)
    await a.agent(job)
    a.store.now += timedelta(minutes=2)

    claimed = await asyncio.gather(a.coordinator.poll_once(), b.coordinator.poll_once())
    assert sorted(claimed) == [False, True]

    published = items_of(a.outbox.results) | items_of(b.outbox.results)
    finals = [r for r in a.outbox.results + b.outbox.results if r["result"]["final"]]
    assert len(published) == len(PAIRS)
    assert len(a.outbox.results + b.outbox.results) == 2  # one chunk of items, one final
    assert len(finals) == 1
    assert len(a.provider.submitted) == 1


async def test_gd3_long_read_keeps_its_lease() -> None:
    # A short lease, so it is renewed every 10 ms while the read below is held.
    a = Harness(owner="replica-a", lease_seconds=0.03)
    b = Harness(store=a.store, objects=a.objects, provider=a.provider, owner="replica-b")
    job = match_job(*PAIRS)
    await a.agent(job)
    a.store.now += timedelta(minutes=2)
    a.provider.gate = asyncio.Event()

    step = asyncio.create_task(a.coordinator.poll_once())
    await a.provider.reading.wait()
    # Far past the lease taken at claim: only the renewals keep the row with replica A.
    a.store.now += timedelta(hours=1)
    await asyncio.sleep(0.05)
    assert await b.coordinator.poll_once() is False

    a.provider.gate.set()
    assert await step is True
    assert len(a.outbox.results) == 2
    assert b.outbox.results == []
    assert a.store.jobs[job.job_id] == "SUCCEEDED"


async def test_gd3_running_batch_is_polled_again_later() -> None:
    worker = Harness()
    job = match_job(*PAIRS)
    await worker.agent(job)
    [(batch_id, _)] = worker.provider.submitted
    worker.provider.states[batch_id] = BatchStatus(BatchState.RUNNING, "in_progress")
    worker.store.now += timedelta(minutes=2)

    assert await worker.coordinator.poll_once() is True
    [row] = worker.store.rows.values()
    assert row["status"] == "SUBMITTED"
    assert row["next_poll_at"] > worker.store.now
    assert worker.outbox.results == []

    del worker.provider.states[batch_id]
    await worker.drain()
    assert worker.store.jobs[job.job_id] == "SUCCEEDED"


async def test_gd3_round_split_into_parts_finishes_once() -> None:
    worker = Harness()
    worker.provider.max_requests = 2
    worker.provider.script = {key(2, 20): ["expired"]}
    pairs = (ref(1, 10), ref(2, 10), ref(1, 20), ref(2, 20), ref(3, 20))
    job = match_job(*pairs)

    await worker.agent(job)
    assert [len(keys) for _, keys in worker.provider.submitted] == [2, 2, 1]
    await worker.drain()

    final = final_of(worker.outbox.results)
    assert [(p["cv_id"], p["jd_id"], p["code"]) for p in final["result"]["failed_pairs"]] == [
        (2, 20, "EXPIRED")
    ]
    assert len(items_of(worker.outbox.results)) == 4
    rounds = sorted((r["round"], r["part"]) for r in worker.store.rows.values())
    assert rounds == [(1, 1), (1, 2), (1, 3), (2, 1), (3, 1)]
    assert worker.store.jobs[job.job_id] == "PARTIAL"
