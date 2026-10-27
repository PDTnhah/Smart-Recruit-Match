"""AD-5, AC-5: a job delivered twice runs once; wiring of subscribers, results and DLQ."""

import json
from typing import Any
from uuid import uuid4

import pytest
from cv_output import fake_cv_output
from faststream.rabbit import RabbitBroker, TestRabbitBroker
from faststream.rabbit.annotations import RabbitMessage

from app.consumers.outbox import RabbitOutbox
from app.contracts.cv_parse_job import CvParseJob
from app.contracts.cv_parse_output import CvParseOutput
from app.contracts.jd_analyze_job import JdAnalyzeJob
from app.contracts.jd_analyze_output import JdAnalyzeOutput
from app.contracts.skill_normalize_job import SkillNormalizeJob
from app.contracts.skill_normalize_output import SkillNormalizeOutput
from app.handlers import build_handlers
from app.queues import QUEUES
from app.worker import build_runners, subscribe_all

pytestmark = pytest.mark.anyio

JD_OUTPUT = {
    "prompt_version": "jd_analyzer/v1",
    "model": "fixture",
    "requirements": {
        "must_have": [{"skill": "Java", "level": "BASIC", "weight": 3.0}],
        "nice_to_have": [],
        "hard_conditions": {
            "majors": [],
            "min_study_year": None,
            "min_gpa": None,
            "required_languages": [],
        },
    },
    "position_group": "BACKEND",
    "new_skills": [],
    "hidden_text_detected": False,
}


async def stub_jd_analyze(job: JdAnalyzeJob) -> JdAnalyzeOutput:
    """Stands in for the JD Analyzer, which has its own tests (tests/agents)."""
    return JdAnalyzeOutput.model_validate(
        {**JD_OUTPUT, "jd_id": job.jd_id, "jd_version": job.jd_version}
    )


async def stub_cv_parse(job: CvParseJob) -> CvParseOutput:
    """Stands in for the CV Parser, which has its own tests (tests/agents)."""
    return fake_cv_output(job.cv_id, job.cv_version)


async def stub_skill_normalize(job: SkillNormalizeJob) -> SkillNormalizeOutput:
    """Stands in for the skill normalizer, which has its own tests (tests/agents)."""
    return SkillNormalizeOutput(
        prompt_version="skill_normalizer/v1", model="fixture", suggestions=[]
    )


STUBS = {
    "cv_parser": stub_cv_parse,
    "jd_analyzer": stub_jd_analyze,
    "skill_normalizer": stub_skill_normalize,
}
HANDLERS = build_handlers(**STUBS, fake_file_keys=True)


def wired_broker(store, handlers) -> tuple[RabbitBroker, list[Any], list[Any]]:
    """A broker with the real subscribers, plus listeners on ai.results and ai.cv.parse.dlq."""
    broker = RabbitBroker()
    subscribe_all(broker, build_runners(store, RabbitOutbox(broker), handlers))
    results: list[Any] = []
    dead: list[Any] = []

    @broker.subscriber(QUEUES.rabbit_queue(QUEUES.results))
    async def on_result(body: dict[str, Any]) -> None:
        results.append(body)

    @broker.subscriber(QUEUES.rabbit_queue(QUEUES.dlq_of(QUEUES.jobs["CV_PARSE"])))
    async def on_dead(body: dict[str, Any], msg: RabbitMessage) -> None:
        dead.append((body, msg.headers))

    return broker, results, dead


def cv_job() -> dict[str, Any]:
    return {"job_id": str(uuid4()), "cv_id": 7, "cv_version": 1, "file_key": "cv-files/7-1.pdf"}


async def test_ad5_duplicate_job_id_processed_once(store) -> None:
    calls: list[str] = []

    async def counting(job: CvParseJob) -> CvParseOutput:
        calls.append(str(job.job_id))
        return fake_cv_output(job.cv_id, job.cv_version)

    broker, results, dead = wired_broker(store, {**HANDLERS, "CV_PARSE": counting})
    job = cv_job()
    async with TestRabbitBroker(broker) as test_broker:
        await test_broker.publish(json.dumps(job), queue=QUEUES.jobs["CV_PARSE"])
        await test_broker.publish(json.dumps(job), queue=QUEUES.jobs["CV_PARSE"])

    assert calls == [job["job_id"]]
    assert len(results) == 1
    assert results[0]["status"] == "SUCCEEDED"
    assert results[0]["job"] == job
    assert dead == []
    [row] = store.rows.values()
    assert (row["status"], row["attempts"]) == ("SUCCEEDED", 1)


async def test_ad5_both_job_types_reach_their_handler(store) -> None:
    broker, results, _ = wired_broker(store, HANDLERS)
    jd = {"job_id": str(uuid4()), "jd_id": 3, "jd_version": 2}
    async with TestRabbitBroker(broker) as test_broker:
        await test_broker.publish(json.dumps(cv_job()), queue=QUEUES.jobs["CV_PARSE"])
        await test_broker.publish(json.dumps(jd), queue=QUEUES.jobs["JD_ANALYZE"])

    by_type = {r["type"]: r for r in results}
    assert sorted(by_type) == ["CV_PARSE", "JD_ANALYZE"]
    assert by_type["CV_PARSE"]["result"] == fake_cv_output(7, 1).model_dump(mode="json")
    assert by_type["JD_ANALYZE"]["result"] == {**JD_OUTPUT, "jd_id": 3, "jd_version": 2}
    assert all(r["error"] is None for r in results)


async def test_nfr10_permanent_marker_fails_without_dlq(store) -> None:
    broker, results, dead = wired_broker(store, HANDLERS)
    job = {**cv_job(), "file_key": "__fake__/permanent/cv.pdf"}
    async with TestRabbitBroker(broker) as test_broker:
        await test_broker.publish(json.dumps(job), queue=QUEUES.jobs["CV_PARSE"])

    [result] = results
    assert result["status"] == "FAILED"
    assert result["error"]["code"] == "FAKE_PERMANENT"
    assert dead == []


async def test_nfr10_invalid_job_reaches_the_dlq_with_headers(store) -> None:
    broker, results, dead = wired_broker(store, HANDLERS)
    async with TestRabbitBroker(broker) as test_broker:
        await test_broker.publish(json.dumps({"cv_id": 1}), queue=QUEUES.jobs["CV_PARSE"])

    assert results == []
    [(body, headers)] = dead
    assert body == {"cv_id": 1}
    assert headers["x-srm-source-queue"] == "ai.cv.parse"
    assert headers["x-srm-attempts"] == 0
    assert headers["x-srm-dlq-reason"].startswith("INVALID_MESSAGE")


def test_ad5_every_queue_has_a_consumer() -> None:
    runners = build_runners(object(), object(), HANDLERS)  # type: ignore[arg-type]
    assert {r.kind.queue for r in runners} == set(QUEUES.jobs.values())


async def test_us24_fake_markers_only_when_the_test_setting_is_on(store) -> None:
    """Without AI_FAKE_FILE_KEYS a marker is an ordinary key, read by the real handler."""
    handlers = build_handlers(**STUBS)
    broker, results, _ = wired_broker(store, handlers)
    job = {**cv_job(), "file_key": "__fake__/permanent/cv.pdf"}
    async with TestRabbitBroker(broker) as test_broker:
        await test_broker.publish(json.dumps(job), queue=QUEUES.jobs["CV_PARSE"])

    [result] = results
    assert result["status"] == "SUCCEEDED"


def test_ad5_a_job_type_without_handler_fails_at_startup() -> None:
    with pytest.raises(RuntimeError, match="JD_ANALYZE"):
        build_runners(object(), object(), {"CV_PARSE": HANDLERS["CV_PARSE"]})  # type: ignore[arg-type]
