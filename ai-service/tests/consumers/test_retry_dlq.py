"""NFR-10, AC-6, AC-7: retries in the worker, then FAILED and the DLQ (CONTEXT D33)."""

import json
from uuid import UUID, uuid4

import pytest
from cv_output import fake_cv_output

from app.consumers.base import JobRunner, Settle
from app.consumers.errors import PermanentError, RetryableError, flag_hidden_text
from app.consumers.kinds import JOB_KINDS
from app.contracts.ai_result_message import AiResultMessage
from app.contracts.cv_parse_output import CvParseOutput

pytestmark = pytest.mark.anyio

OUTPUT = fake_cv_output()


def cv_job(**overrides: object) -> dict[str, object]:
    return {
        "job_id": str(uuid4()),
        "cv_id": 457,
        "cv_version": 2,
        "file_key": "cv-files/457-2.pdf",
        **overrides,
    }


def body_of(job: dict[str, object]) -> bytes:
    return json.dumps(job).encode()


def row_of(store, job: dict[str, object]) -> dict[str, object]:
    return store.rows[UUID(str(job["job_id"]))]


class Script:
    """A handler that raises the given errors in order, then returns OUTPUT."""

    def __init__(self, *errors: Exception) -> None:
        self.errors = list(errors)
        self.calls = 0

    async def __call__(self, job: object) -> CvParseOutput:
        self.calls += 1
        if self.errors:
            raise self.errors.pop(0)
        return OUTPUT


def runner(handler, store, outbox, sleep) -> JobRunner:
    return JobRunner(JOB_KINDS["CV_PARSE"], handler, store, outbox, sleep=sleep)


def assert_envelope(message: dict[str, object], job: dict[str, object]) -> None:
    """What the Zod superRefine checks on the backend (status, result and error agree)."""
    AiResultMessage.model_validate(message)
    assert message["job_id"] == job["job_id"]
    assert message["job"] == job
    assert message["type"] == "CV_PARSE"
    if message["status"] == "FAILED":
        assert message["result"] is None and message["error"] is not None
    else:
        assert message["result"] is not None and message["error"] is None


async def test_nfr10_retry_3_times_then_dlq(store, outbox, sleep) -> None:
    job = cv_job()
    handler = Script(
        RetryableError("timeout"), RetryableError("timeout"), RetryableError("timeout")
    )

    settle = await runner(handler, store, outbox, sleep).process(body_of(job))

    assert settle is Settle.ACK
    assert handler.calls == 3
    assert sleep.delays == [2, 10]
    row = row_of(store, job)
    assert row["status"] == "FAILED"
    assert row["attempts"] == 3
    assert row["last_error"].startswith("RETRIES_EXHAUSTED: RetryableError: timeout")
    [result] = outbox.results
    assert_envelope(result, job)
    assert result["status"] == "FAILED"
    assert result["error"]["code"] == "RETRIES_EXHAUSTED"
    assert result["error"]["needs_human"] is True
    [dead] = outbox.dead_letters
    assert dead["queue"] == "ai.cv.parse"
    assert dead["body"] == body_of(job)
    assert dead["attempts"] == 3


async def test_nfr10_succeeds_on_retry_no_dlq(store, outbox, sleep) -> None:
    job = cv_job()
    handler = Script(RetryableError("rate limited"))

    assert await runner(handler, store, outbox, sleep).process(body_of(job)) is Settle.ACK

    assert handler.calls == 2
    assert sleep.delays == [2]
    row = row_of(store, job)
    assert row["status"] == "SUCCEEDED"
    assert row["attempts"] == 2
    [result] = outbox.results
    assert_envelope(result, job)
    assert result["status"] == "SUCCEEDED"
    assert result["result"] == OUTPUT.model_dump(mode="json")
    assert outbox.dead_letters == []


async def test_nfr10_unclassified_error_is_retried(store, outbox, sleep) -> None:
    handler = Script(KeyError("surprise"))
    assert await runner(handler, store, outbox, sleep).process(body_of(cv_job())) is Settle.ACK
    assert handler.calls == 2
    assert outbox.results[0]["status"] == "SUCCEEDED"


async def test_nfr10_permanent_error_fails_without_retry(store, outbox, sleep) -> None:
    job = cv_job()
    handler = Script(PermanentError("LLM refused the CV", code="LLM_REFUSAL"))

    assert await runner(handler, store, outbox, sleep).process(body_of(job)) is Settle.ACK

    assert handler.calls == 1
    assert sleep.delays == []
    [result] = outbox.results
    assert_envelope(result, job)
    assert result["error"] == {
        "code": "LLM_REFUSAL",
        "message": "LLM refused the CV",
        "needs_human": True,
        "hidden_text_detected": None,
    }
    assert outbox.dead_letters == []
    row = row_of(store, job)
    assert (row["status"], row["attempts"]) == ("FAILED", 1)


@pytest.mark.parametrize(
    "body",
    [
        b"not json",
        json.dumps({"cv_id": 1, "cv_version": 1, "file_key": "k"}).encode(),
        json.dumps(cv_job(job_id="42")).encode(),
        json.dumps(cv_job(profile={"name": "Nguyen Van A"})).encode(),
    ],
    ids=["not-json", "no-job-id", "job-id-not-uuid", "extra-field"],
)
async def test_nfr10_invalid_payload_to_dlq(store, outbox, sleep, body: bytes) -> None:
    handler = Script()

    assert await runner(handler, store, outbox, sleep).process(body) is Settle.ACK

    assert handler.calls == 0
    assert store.rows == {}
    assert outbox.results == []
    [dead] = outbox.dead_letters
    assert dead["body"] == body
    assert dead["reason"].startswith("INVALID_MESSAGE")


async def test_nfr10_redelivery_after_the_last_attempt_goes_to_dlq(store, outbox, sleep) -> None:
    # The worker died during attempt 3; the broker delivers the job again.
    job = cv_job()
    handler = Script()
    await store.claim(UUID(str(job["job_id"])), "CV_PARSE")
    row_of(store, job)["attempts"] = 3

    assert await runner(handler, store, outbox, sleep).process(body_of(job)) is Settle.ACK

    assert handler.calls == 0
    assert outbox.results[0]["error"]["code"] == "RETRIES_EXHAUSTED"
    assert outbox.dead_letters[0]["attempts"] == 3
    assert row_of(store, job)["status"] == "FAILED"


async def test_ad5_infrastructure_failure_requeues(store, outbox, sleep) -> None:
    store.down = True
    handler = Script()

    assert await runner(handler, store, outbox, sleep).process(body_of(cv_job())) is Settle.REQUEUE

    assert handler.calls == 0
    assert outbox.results == []
    assert outbox.dead_letters == []


def flagged(error: Exception) -> Exception:
    flag_hidden_text(error)
    return error


async def test_ac12_failed_result_keeps_the_hidden_text_flag(store, outbox, sleep) -> None:
    """US-2.3 AC-12: a file whose hidden text was removed stays flagged when the job fails."""
    permanent = cv_job()
    await runner(
        Script(flagged(PermanentError("refused", code="LLM_REFUSED"))), store, outbox, sleep
    ).process(body_of(permanent))
    exhausted = cv_job()
    errors = [flagged(RetryableError("outage")) for _ in range(3)]
    await runner(Script(*errors), store, outbox, sleep).process(body_of(exhausted))
    plain = cv_job()
    await runner(Script(PermanentError("bad file", code="BAD")), store, outbox, sleep).process(
        body_of(plain)
    )

    by_job = {message["job_id"]: message for message in outbox.results}
    assert by_job[permanent["job_id"]]["error"]["hidden_text_detected"] is True
    assert by_job[exhausted["job_id"]]["error"]["code"] == "RETRIES_EXHAUSTED"
    assert by_job[exhausted["job_id"]]["error"]["hidden_text_detected"] is True
    assert by_job[plain["job_id"]]["error"]["hidden_text_detected"] is None
    for job in (permanent, exhausted, plain):
        assert_envelope(by_job[job["job_id"]], job)
