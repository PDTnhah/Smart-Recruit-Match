"""Part D of the test (US-4.8 AC-2, AC-3, AC-5, AC-8, FR-25), with recorded LLM replies only.

The fixtures in tests/fixtures/llm/cv_verification and cv_verification_check are keyed by the
exact request, so they also pin the released prompts and what the agents send of each sample CV.
"""

import copy
import json
import re
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest

from app.agents.cv_verification import (
    AGENT,
    CHECK_AGENT,
    AnswerRow,
    CvRow,
    CvVerificationEvaluator,
    CvVerificationGenerator,
    JdRow,
    source,
)
from app.agents.cv_verification.evaluator import NO_ANSWER_REASON, UNQUOTED_NOTE, checked_item
from app.consumers.errors import NeedsHumanReview, PermanentError
from app.contracts.cv_verification_check_item import CvVerificationCheckItem
from app.contracts.cv_verify_evaluate_job import CvVerifyEvaluateJob
from app.contracts.cv_verify_evaluate_output import CvVerifyEvaluateOutput
from app.contracts.cv_verify_generate_job import CvVerifyGenerateJob
from app.contracts.cv_verify_generate_output import CvVerifyGenerateOutput
from app.llm.providers.fixture_provider import FixtureProvider
from app.llm.recorder import CallRecord, CallRecorder
from app.llm.structured import StructuredLLMClient
from app.llm.usage import DEFAULT_PRICES
from app.prompts.files import load_active, load_manifest
from app.prompts.registry import PromptRegistry

pytestmark = pytest.mark.anyio

LLM_FIXTURES = Path(__file__).parents[1] / "fixtures" / "llm"
JOB_ID = UUID("7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f")
MODEL = "gemini-3.8-flash"

PROFILE: dict[str, Any] = {
    "summary": "Sinh viên năm 3 ngành Công nghệ thông tin, thích phát triển backend.",
    "education": [
        {
            "institution": "Trường Đại học [ORG]",
            "degree": "Kỹ sư",
            "major": "Công nghệ thông tin",
            "start": "2023-09",
            "end": None,
            "gpa": None,
        }
    ],
    "skills": [
        {"name": "Java", "canonical_name": "Java", "match": "ALIAS"},
        {"name": "Docker", "canonical_name": "Docker", "match": "ALIAS"},
    ],
    "projects": [
        {
            "name": "Hệ thống quản lý thư viện",
            "role": "Backend developer",
            "description": "Xây dựng REST API bằng Spring Boot cho 200 người dùng thử nghiệm; "
            "thiết kế CSDL MySQL.",
            "technologies": ["Java", "Spring Boot", "MySQL"],
            "start": "2025-02",
            "end": "2025-06",
        },
        {
            "name": "Ứng dụng đặt lịch khám",
            "role": "Frontend developer",
            "description": "Làm giao diện React cho chức năng đặt lịch khám.",
            "technologies": ["React", "TypeScript"],
            "start": None,
            "end": None,
        },
    ],
    "experience": [
        {
            "organization": "Công ty [ORG]",
            "position": "Thực tập sinh Backend",
            "description": "Viết API thanh toán bằng Node.js.",
            "start": "2025-07",
            "end": "2025-09",
        }
    ],
    "languages": [{"language": "Tiếng Anh", "level": "TOEIC 650"}],
    "certificates": [],
}
EMPTY_PROFILE: dict[str, Any] = {
    "summary": None,
    "education": [],
    "skills": [],
    "projects": [],
    "experience": [],
    "languages": [],
    "certificates": [],
}
ONE_SKILL = {
    **EMPTY_PROFILE,
    "skills": [{"name": "Java", "canonical_name": "Java", "match": "ALIAS"}],
}
REFUSED = {
    **EMPTY_PROFILE,
    "projects": [{**PROFILE["projects"][0], "description": "Mô tả bị từ chối (ca kiểm thử)."}],
}
REQUIREMENTS = {
    "must_have": [
        {"skill": "Java", "level": "BASIC", "weight": 3},
        {"skill": "Spring Boot", "level": "BASIC", "weight": 2},
    ],
    "nice_to_have": [{"skill": "Docker", "level": "BASIC", "weight": 1}],
    "hard_conditions": {
        "majors": ["Công nghệ thông tin"],
        "min_study_year": 3,
        "min_gpa": None,
        "required_languages": [],
    },
    "preferred_languages": [],
}

CVS = {
    (41, 1): CvRow(41, 1, PROFILE),
    (42, 1): CvRow(42, 1, ONE_SKILL),
    (43, 1): CvRow(43, 1, REFUSED),
    (44, 1): CvRow(44, 1, EMPTY_PROFILE),
}
JDS = {51: JdRow(51, "BACKEND", REQUIREMENTS)}

LIBRARY_STEM = "Trong dự án Hệ thống quản lý thư viện, bạn đã tự thiết kế những bảng nào và vì sao?"
INTERNSHIP_STEM = "Khi thực tập ở Công ty [ORG], bạn xử lý trường hợp thanh toán thất bại ra sao?"
DOCKER_STEM = "Bạn đã dùng Docker để làm gì trong các dự án của mình?"
BOOKING_STEM = "Trong Ứng dụng đặt lịch khám, bạn đã tự làm những màn hình nào?"
LIBRARY_ANSWER = (
    "Em tự thiết kế ba bảng books, members và loans trong MySQL. Bảng loans có khóa ngoại tới "
    "hai bảng kia để biết ai mượn sách nào và hạn trả."
)
INTERNSHIP_ANSWER = (
    "Ở công ty em chủ yếu làm giao diện bằng Vue, không viết API. Phần thanh toán do anh trưởng "
    "nhóm làm."
)
BOOKING_ANSWER = "Em làm phần giao diện đặt lịch bằng React, có form chọn bác sĩ và ngày khám."
FABRICATED_QUOTE = "Em dùng Redux Toolkit để quản lý trạng thái toàn ứng dụng."


def answer_row(question_id: int, no: int, section: str, index: int, stem: str, text: str | None):
    return AnswerRow(question_id, no, stem, {"section": section, "index": index}, text)


ANSWERS = {
    # A consistent answer, a contradicting one and a blank one (whitespace only).
    31: [
        answer_row(9001, 1, "PROJECT", 0, LIBRARY_STEM, LIBRARY_ANSWER),
        answer_row(9002, 2, "EXPERIENCE", 0, INTERNSHIP_STEM, INTERNSHIP_ANSWER),
        answer_row(9003, 3, "SKILLS_LIST", 1, DOCKER_STEM, "   "),
    ],
    # A PARTIAL verdict whose quote is not in the answer.
    32: [answer_row(9011, 1, "PROJECT", 1, BOOKING_STEM, BOOKING_ANSWER)],
    # Every answer blank.
    33: [
        answer_row(9021, 1, "PROJECT", 0, LIBRARY_STEM, None),
        answer_row(9022, 2, "SKILLS_LIST", 0, DOCKER_STEM, None),
    ],
}
PII_FIELDS = (
    "pii",
    "full_name",
    "email",
    "phone",
    "photo",
    "avatar",
    "gender",
    "date_of_birth",
    "birth",
    "hometown",
    "address",
    "religion",
    "marital",
)


class MemorySources:
    def __init__(self, cvs: dict[tuple[int, int], CvRow] = CVS) -> None:
        self._cvs = cvs
        self.read: list[str] = []

    async def cv(self, cv_id: int, version: int) -> CvRow | None:
        self.read.append(f"cv {cv_id}")
        return self._cvs.get((cv_id, version))

    async def jd(self, jd_id: int) -> JdRow | None:
        self.read.append(f"jd {jd_id}")
        return JDS.get(jd_id)

    async def answers(self, preference_id: int) -> list[AnswerRow]:
        self.read.append(f"answers {preference_id}")
        return ANSWERS.get(preference_id, [])


class MemoryObjects:
    async def put_json(self, key: str, document: dict[str, Any]) -> None:
        pass


class MemoryCalls:
    def __init__(self) -> None:
        self.rows: list[CallRecord] = []

    async def insert(self, record: CallRecord) -> None:
        self.rows.append(record)


class RecordingFixtureProvider(FixtureProvider):
    def __init__(self) -> None:
        super().__init__(LLM_FIXTURES, model="fixture")
        self.sent: list[dict[str, Any]] = []

    async def send(self, params: dict[str, Any], documents=()):
        self.sent.append(params)
        return await super().send(params, documents)


class Harness:
    def __init__(self, cvs: dict[tuple[int, int], CvRow] = CVS) -> None:
        self.sources = MemorySources(cvs)
        self.provider = RecordingFixtureProvider()
        self.calls = MemoryCalls()
        llm = StructuredLLMClient(
            self.provider,
            CallRecorder(MemoryObjects(), self.calls),
            pricing=DEFAULT_PRICES,
            max_output_tokens=4000,
        )
        # The production registry: only released, unchanged prompts render (AD-12).
        prompts = PromptRegistry(active=load_active(), manifest=load_manifest())
        self.generator = CvVerificationGenerator(sources=self.sources, llm=llm, prompts=prompts)
        self.evaluator = CvVerificationEvaluator(sources=self.sources, llm=llm, prompts=prompts)

    async def draft(self, cv_id: int, question_count: int = 2) -> CvVerifyGenerateOutput:
        job = CvVerifyGenerateJob(
            job_id=JOB_ID,
            preference_id=31,
            cv_id=cv_id,
            cv_version=1,
            jd_id=51,
            question_count=question_count,
        )
        return await self.generator(job)

    async def check(self, preference_id: int) -> CvVerifyEvaluateOutput:
        job = CvVerifyEvaluateJob(
            job_id=JOB_ID, preference_id=preference_id, cv_id=41, cv_version=1
        )
        return await self.evaluator(job)


def tagged(text: str, tag: str) -> str:
    return text.split(f"<{tag}>\n", 1)[1].split(f"\n</{tag}>", 1)[0]


async def test_fr25_drafts_questions_about_entries_of_the_cv():
    """AC-2: masked CV and JD from the views, effort medium, labels written by code."""
    harness = Harness()
    output = await harness.draft(41)

    assert harness.sources.read == ["cv 41", "jd 51"]
    [params] = harness.provider.sent
    assert (params["agent"], params["prompt_version"], params["effort"]) == (
        AGENT,
        "cv_verification/v1",
        "medium",
    )
    assert (
        json.loads(tagged(params["shared"], "jd_requirements"))["must_have"][0]["skill"] == "Java"
    )
    entries = json.loads(tagged(params["user"], "cv_entries"))
    assert [(e["section"], e["index"]) for e in entries] == [
        ("PROJECT", 0),
        ("PROJECT", 1),
        ("EXPERIENCE", 0),
        ("SKILLS_LIST", 0),
        ("SKILLS_LIST", 1),
    ]
    assert CvVerifyGenerateOutput.model_validate_json(output.model_dump_json()) == output
    assert (output.prompt_version, output.model, output.preference_id) == (
        "cv_verification/v1",
        MODEL,
        31,
    )
    assert [(q.claim_ref.section, q.claim_ref.index, q.claim_label) for q in output.questions] == [
        ("PROJECT", 0, "Hệ thống quản lý thư viện"),
        ("EXPERIENCE", 0, "Thực tập sinh Backend · Công ty [ORG]"),
    ]
    assert [q.stem for q in output.questions] == [LIBRARY_STEM, INTERNSHIP_STEM]
    assert [(row.job_id, row.outcome) for row in harness.calls.rows] == [(JOB_ID, "SUCCEEDED")]


async def test_fr25_fewer_entries_than_asked_and_an_unknown_entry_is_asked_again():
    """AC-2: one entry gives one question; a draft naming an entry the CV lacks is invalid."""
    harness = Harness()
    output = await harness.draft(42, question_count=3)

    assert "Write 1 question(s)" in harness.provider.sent[0]["user"]
    assert [row.outcome for row in harness.calls.rows] == ["INVALID_OUTPUT", "SUCCEEDED"]
    [question] = output.questions
    assert (question.claim_ref.section, question.claim_ref.index, question.claim_label) == (
        "SKILLS_LIST",
        0,
        "Java",
    )


async def test_fr25_refusal_fails_the_draft():
    """AC-2: a refusal is permanent; the backend marks the row FAILED and part D is skipped."""
    harness = Harness()
    with pytest.raises(NeedsHumanReview) as failure:
        await harness.draft(43)

    assert failure.value.code == "LLM_REFUSED"
    assert [row.outcome for row in harness.calls.rows] == ["REFUSED"]


async def test_fr25_cv_without_entries_never_reaches_the_llm():
    harness = Harness()
    with pytest.raises(PermanentError) as failure:
        await harness.draft(44)

    assert failure.value.code == "NO_CLAIMS"
    assert harness.provider.sent == []


async def test_fr25_verdicts_checked_against_the_answers():
    """AC-5: a consistent answer keeps its verdict and quote; a contradicting one is INCONSISTENT;
    a blank one is NO_ANSWER without reaching the LLM."""
    harness = Harness()
    output = await harness.check(31)

    [params] = harness.provider.sent
    assert (params["agent"], params["prompt_version"], params["effort"]) == (
        CHECK_AGENT,
        "cv_verification_check/v1",
        "medium",
    )
    questions = json.loads(tagged(params["user"], "cv_questions"))
    assert [q["question_id"] for q in questions] == [9001, 9002]
    assert questions[0]["entry"]["name"] == "Hệ thống quản lý thư viện"
    assert params["user"].count("<cau_tra_loi>") == 2
    assert CvVerifyEvaluateOutput.model_validate_json(output.model_dump_json()) == output
    assert (output.prompt_version.root, output.model.root) == ("cv_verification_check/v1", MODEL)
    consistent, contradicting, blank = output.items
    assert (consistent.question_id, consistent.llm_verdict, consistent.verdict) == (
        9001,
        "CONSISTENT",
        "CONSISTENT",
    )
    assert consistent.quote_score.root >= 85
    assert (contradicting.llm_verdict, contradicting.verdict) == ("INCONSISTENT", "INCONSISTENT")
    assert (blank.question_id, blank.llm_verdict, blank.verdict, blank.quote) == (
        9003,
        None,
        "NO_ANSWER",
        None,
    )
    assert blank.reason == NO_ANSWER_REASON


async def test_fr25_quote_not_in_the_answer_lowers_the_verdict():
    """AC-5, Invariant 5: PARTIAL whose quote is not in the answer counts as INCONSISTENT."""
    harness = Harness()
    output = await harness.check(32)

    [item] = output.items
    assert (item.llm_verdict, item.verdict) == ("PARTIAL", "INCONSISTENT")
    assert item.quote.root == FABRICATED_QUOTE
    assert item.quote_score.root < 85
    assert item.reason.startswith(UNQUOTED_NOTE)


def test_fr25_quote_longer_than_the_answer_is_not_found_in_it():
    """AC-5, Invariant 5: a made-up quote that merely contains a short answer does not match it."""

    def consistent(quote: str) -> CvVerificationCheckItem:
        return CvVerificationCheckItem.model_validate(
            {"question_id": 9031, "verdict": "CONSISTENT", "quote": quote, "reason": "Khớp dự án."}
        )

    made_up = consistent("Em làm API. Em đã thiết kế kiến trúc microservice với Kafka và Redis.")
    checked = checked_item(made_up, "Em làm API.")
    assert (checked.llm_verdict, checked.verdict) == ("CONSISTENT", "INCONSISTENT")
    assert checked.quote_score.root < 85
    # The answer quoted whole still matches.
    whole = checked_item(consistent("em làm API"), "Em làm API.")
    assert (whole.verdict, whole.quote_score.root) == ("CONSISTENT", 100)


async def test_fr25_all_answers_blank_calls_no_llm():
    harness = Harness()
    output = await harness.check(33)

    assert harness.provider.sent == []
    assert harness.sources.read == ["answers 33"]
    assert (output.prompt_version, output.model) == (None, None)
    assert [(i.question_id, i.verdict) for i in output.items] == [
        (9021, "NO_ANSWER"),
        (9022, "NO_ANSWER"),
    ]


def test_br03_reads_only_the_masked_views():
    """AC-3: the masked profile, the JD requirements and part D; never pii, raw or masked text."""
    sql = " ".join([source.CV_SQL, source.JD_SQL, source.ANSWERS_SQL])
    tables = set(re.findall(r"\b(?:FROM|JOIN)\s+([a-z_]+\.[a-z_]+)", sql))
    assert tables == {
        "core.v_ai_cv_profile_masked",
        "core.v_ai_jd_requirements",
        "core.v_ai_cv_verification_answers",
    }
    assert not re.search(r"\bpii\b|\bprofile\b(?!_masked)|\braw_text\b|\bmasked_text\b", sql)


async def test_br03_requests_carry_no_personal_data():
    """AC-3: only listed fields of each entry reach the LLM, at both steps. A key the profile
    should never hold is dropped, so the request (and its fixture) stays the same."""
    leaked = copy.deepcopy(PROFILE)
    leaked["projects"][0]["email"] = "sv.lan@example.com"
    leaked["experience"][0]["date_of_birth"] = "2004-05-06"
    harness = Harness({**CVS, (41, 1): CvRow(41, 1, leaked)})
    await harness.draft(41)
    await harness.check(31)

    assert len(harness.provider.sent) == 2
    for params in harness.provider.sent:
        text = json.dumps(params, ensure_ascii=False)
        for value in ("sv.lan@example.com", "2004-05-06", PROFILE["summary"], "Trường Đại học"):
            assert value not in text
        for tag in ("cv_entries", "cv_questions"):
            if f"<{tag}>" in params["user"]:
                items = json.loads(tagged(params["user"], tag))
                fields = {key for item in items for key in item["entry"]}
                assert not [f for f in fields if any(p in f for p in PII_FIELDS)]
