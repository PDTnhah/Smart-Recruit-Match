"""Validator (US-4.2 AC-1 to AC-3), with recorded or scripted LLM replies, never a real API.

The fixture in tests/fixtures/llm/validator for CASES answers six multiple-choice drafts whose
verdicts cover the checks of verdict.py; it pins the released prompt validator/v1 and the request
the agent builds. The three Validator calls of bank 41 are pinned by the Test Generator flow
(test_test_generator.py). Other tests script the replies (generator_support).
"""

import re
from pathlib import Path
from typing import get_args

import pytest
from generator_support import (
    JOB_ID,
    MODEL,
    MemoryCalls,
    MemoryDrafts,
    MemoryObjects,
    MemoryValidations,
    RecordingFixtureProvider,
    ScriptedProvider,
    block,
    check,
    essay,
    mcq,
    passes,
    refusal,
    verdicts,
)

from app.agents.test_generator import Draft
from app.agents.validator import (
    AGENT,
    DIFFICULTY_REJECT_GAP,
    OPTION_LABELS,
    QuestionCheck,
    Validator,
    batches,
    decide,
    failed_checks,
    stored_validation,
)
from app.agents.validator.config import (
    MAX_ESSAYS_PER_CALL,
    MAX_MCQ_PER_CALL,
    MCQ_OPTION_COUNT,
    REJECT_REASONS,
)
from app.agents.validator.repo import INSERT_SQL, VALIDATIONS_SQL
from app.contracts.question_validation import Reason, Status
from app.llm.recorder import CallRecorder
from app.llm.structured import StructuredLLMClient
from app.llm.types import Outcome, ProviderResponse, StopReason, Usage
from app.llm.usage import DEFAULT_PRICES
from app.prompts.files import load_active, load_manifest
from app.prompts.registry import PromptRegistry

pytestmark = pytest.mark.anyio

MIGRATIONS = Path(__file__).resolve().parents[3] / "apps" / "api" / "drizzle"

CASES = (
    mcq(
        "Java",
        "EASY",
        "Từ khóa nào khai báo một biến không thể gán lại sau lần gán đầu tiên trong Java?",
        ("final", "static", "const", "volatile"),
        explanation="final cấm gán lại; static gắn với lớp; const là từ khóa dành riêng.",
    ),
    mcq(
        "Java",
        "EASY",
        "Kiểu dữ liệu nguyên thủy nào của Java chiếm 8 byte?",
        ("int", "short", "long", "char"),
        explanation="Giải thích của người viết, ghi sai đáp án.",
    ),
    mcq(
        "Java",
        "MEDIUM",
        "Cách nào tạo một List không sửa được từ hai phần tử a và b?",
        (
            "List.of(a, b)",
            "Collections.unmodifiableList(Arrays.asList(a, b))",
            "new ArrayList<>(List.of(a, b))",
            "Arrays.asList(a, b)",
        ),
    ),
    mcq(
        "Java",
        "EASY",
        "Phương thức equals() so sánh nội dung hai đối tượng. Phương thức nào so sánh nội dung hai"
        " String?",
        ("equals()", "toán tử ==", "compareTo() == 1", "hashCode()"),
    ),
    mcq(
        "Java",
        "EASY",
        'Đoạn code sau in ra gì?\n```java\nString s = "a";\ns.concat("b");\n'
        "System.out.println(s);\n```",
        ("a", "ab", "b", "Lỗi biên dịch"),
    ),
    mcq(
        "Java",
        "EASY",
        "Hai luồng cùng tăng count++ trên một biến int dùng chung, mỗi luồng 1000 lần. Vì sao kết"
        " quả có thể nhỏ hơn 2000, và cách sửa nào đúng?",
        (
            "count++ không nguyên tử; dùng AtomicInteger",
            "Biến int bị tràn; đổi sang long",
            "JVM bỏ qua một số lệnh; khai báo volatile",
            "Hai luồng chạy tuần tự; không cần sửa",
        ),
    ),
)
"""Six drafts, each with option A marked correct: a pass, a wrong key, two correct options, a
leaked answer, a difficulty one level off and one two levels off."""


class Checker:
    def __init__(self, provider: ScriptedProvider | RecordingFixtureProvider) -> None:
        self.provider = provider
        self.drafts = MemoryDrafts()
        self.validations = MemoryValidations(self.drafts)
        self.calls = MemoryCalls()
        llm = StructuredLLMClient(
            provider,
            CallRecorder(MemoryObjects(), self.calls),
            pricing=DEFAULT_PRICES,
            max_output_tokens=4000,
        )
        prompts = PromptRegistry(active=load_active(), manifest=load_manifest())
        self.validator = Validator(llm=llm, prompts=prompts, repo=self.validations)

    def add(self, *questions: dict) -> list[Draft]:
        ids = {self.drafts.seed(41, question) for question in questions}
        return [draft for draft in self.drafts.rows if draft.draft_id in ids]

    async def check(self, *questions: dict):
        drafts = self.add(*questions)
        return drafts, await self.validator.check(drafts, job_id=JOB_ID)

    def questions_sent(self, call: int = 1) -> list[dict]:
        return block(self.provider.sent[call - 1]["user"], "questions")


def java(n: int, difficulty: str = "EASY") -> dict:
    return mcq("Java", difficulty, f"Câu hỏi Java số {n}?")


# --- AC-1: the request carries no answer ----------------------------------------------------------


async def test_gd5_mcq_request_shows_the_options_without_the_answer():
    checker = Checker(RecordingFixtureProvider())
    await checker.check(*CASES)

    [params] = checker.provider.sent
    sent = checker.questions_sent()
    assert [item["ref"] for item in sent] == [1, 2, 3, 4, 5, 6]
    assert {key for item in sent for key in item} == {
        "ref",
        "type",
        "skill",
        "difficulty",
        "stem",
        "options",
    }
    assert sent[1] == {
        "ref": 2,
        "type": "MCQ",
        "skill": "Java",
        "difficulty": "EASY",
        "stem": "Kiểu dữ liệu nguyên thủy nào của Java chiếm 8 byte?",
        "options": [
            {"label": "A", "text": "int"},
            {"label": "B", "text": "short"},
            {"label": "C", "text": "long"},
            {"label": "D", "text": "char"},
        ],
    }
    for text in (params["system"], params["user"]):
        assert '"correct"' not in text and "Giải thích" not in text and "explanation" not in text


async def test_gd5_essay_request_names_the_criteria_only():
    """D50: an essay goes with its criteria, not their points, the sample answer or explanation."""
    checker = Checker(ScriptedProvider(passes(1, "MEDIUM", essays=True)))
    task = essay(
        "SQL",
        "MEDIUM",
        "Thiết kế bảng cho đơn hàng và giải thích khóa ngoại.",
        (("Có khóa chính và khóa ngoại đúng", 7), ("Giải thích được ràng buộc", 3)),
        sample_answer="BÀI MẪU: orders(id PK, customer_id FK)…",
        explanation="GIẢI THÍCH: kiểm tra chuẩn hóa.",
    )
    await checker.check(task)

    [item] = checker.questions_sent()
    assert item == {
        "ref": 1,
        "type": "ESSAY",
        "skill": "SQL",
        "difficulty": "MEDIUM",
        "stem": "Thiết kế bảng cho đơn hàng và giải thích khóa ngoại.",
        "criteria": ["Có khóa chính và khóa ngoại đúng", "Giải thích được ràng buộc"],
    }
    user = checker.provider.sent[0]["user"]
    assert "BÀI MẪU" not in user and "GIẢI THÍCH" not in user and "max_points" not in user


# --- AC-2: one fresh call per group --------------------------------------------------------------


async def test_gd5_each_group_is_one_fresh_call_effort_high():
    """AC-2: the released prompt validator/v1, effort high, nothing but the questions: no `shared`
    block, no message of the Generator; ai.llm_calls logs the call as the Validator's."""
    checker = Checker(RecordingFixtureProvider())
    await checker.check(*CASES)

    [params] = checker.provider.sent
    assert (params["agent"], params["prompt_version"], params["effort"]) == (
        AGENT,
        "validator/v1",
        "high",
    )
    assert "shared" not in params
    assert re.fullmatch(r"Check these questions\.\n\n<questions>\n.*\n</questions>", params["user"])
    assert "Java" not in params["system"]
    assert set(params["output_schema"]["properties"]) == {"results"}
    [row] = checker.calls.rows
    assert (row.agent, row.effort, row.outcome, row.job_id) == (
        AGENT,
        "high",
        Outcome.SUCCEEDED,
        JOB_ID,
    )


def test_gd5_groups_hold_one_type_fifteen_mcq_or_five_essays():
    drafts = MemoryDrafts()
    for n in range(17):
        drafts.seed(41, java(n))
    for n in range(6):
        drafts.seed(41, essay("Java", "MEDIUM", f"Bài tự luận số {n}"))
    groups = batches(drafts.rows)

    assert [len(group) for group in groups] == [MAX_MCQ_PER_CALL, 2, MAX_ESSAYS_PER_CALL, 1]
    assert [{draft.type for draft in group} for group in groups] == [{"MCQ"}] * 2 + [{"ESSAY"}] * 2
    assert [draft.draft_id for group in groups for draft in group] == [
        draft.draft_id for draft in drafts.rows
    ]


async def test_gd5_refused_group_is_checked_one_at_a_time():
    """AC-2: a refused group goes again question by question; one still refused alone is rejected
    unread, with the model that refused and the prompt (Invariant 12)."""
    checker = Checker(ScriptedProvider(refusal(), passes(1), refusal(), passes(1)))
    drafts, found = await checker.check(java(1), java(2), java(3))

    assert [len(checker.questions_sent(call)) for call in (1, 2, 3, 4)] == [3, 1, 1, 1]
    assert [row.outcome for row in checker.calls.rows] == [
        Outcome.REFUSED,
        Outcome.SUCCEEDED,
        Outcome.REFUSED,
        Outcome.SUCCEEDED,
    ]
    assert [(v.draft_id, v.validation.status) for v in found] == [
        (drafts[0].draft_id, Status.VALIDATED),
        (drafts[1].draft_id, Status.REJECTED),
        (drafts[2].draft_id, Status.VALIDATED),
    ]
    refused = found[1]
    assert refused.validation.model_dump(mode="json") == {
        "status": "REJECTED",
        "reasons": ["VALIDATOR_REFUSAL"],
        "correct_options": None,
        "estimated_difficulty": None,
        "note": None,
        "model": MODEL,
        "prompt_version": "validator/v1",
    }
    assert refused.answer == {"refused": True, "category": "HARM_CATEGORY_DANGEROUS_CONTENT"}
    assert set(checker.validations.rows) == {draft.draft_id for draft in drafts}


async def test_gd5_invalid_output_splits_the_group_and_a_draft_invalid_alone_waits():
    """AC-2: output still invalid after the LLMClient's retries (cut at max_output_tokens, say)
    sends the group again in two halves; a question still invalid alone gets no verdict, and no
    error."""
    invalid = ProviderResponse(
        stop_reason=StopReason.END_TURN, text='{"results": "none"}', model=MODEL, usage=Usage()
    )
    checker = Checker(ScriptedProvider(*[invalid] * 3, passes(2), *[invalid] * 3))
    drafts, found = await checker.check(java(1), java(2), java(3))

    assert [len(checker.questions_sent(call)) for call in range(1, 8)] == [3, 3, 3, 2, 1, 1, 1]
    assert [v.draft_id for v in found] == [drafts[0].draft_id, drafts[1].draft_id]
    assert set(checker.validations.rows) == {drafts[0].draft_id, drafts[1].draft_id}
    assert [row.outcome for row in checker.calls.rows] == [
        *[Outcome.INVALID_OUTPUT] * 3,
        Outcome.SUCCEEDED,
        *[Outcome.INVALID_OUTPUT] * 3,
    ]


async def test_gd5_no_part_of_a_group_is_sent_again_past_the_budget():
    """AC-2, AC-4: `within_budget` is asked before each part of a refused or invalid group is sent
    again; once it says no, the parts not sent wait."""
    asked = 0

    async def once() -> bool:
        nonlocal asked
        asked += 1
        return asked == 1

    checker = Checker(ScriptedProvider(refusal(), passes(1)))
    drafts = checker.add(java(1), java(2), java(3))
    found = await checker.validator.check(drafts, job_id=JOB_ID, within_budget=once)

    assert [len(checker.questions_sent(call)) for call in (1, 2)] == [3, 1]
    assert len(checker.provider.sent) == 2
    assert [v.draft_id for v in found] == [drafts[0].draft_id]
    assert asked == 2


async def test_gd5_a_result_that_matches_no_single_question_leaves_it_waiting():
    """D50: a question needs exactly one result with its ref; an unknown ref is ignored."""
    reply = verdicts(check(1), check(1, ["B"]), check(3), check(9))
    checker = Checker(ScriptedProvider(reply))
    drafts, found = await checker.check(java(1), java(2), java(3))

    assert [v.draft_id for v in found] == [drafts[2].draft_id]


# --- AC-3: code decides ---------------------------------------------------------------------------


async def test_gd5_fixture_verdicts_follow_the_checks():
    """AC-3 on a recorded answer: only the first and the one-level-off question pass."""
    checker = Checker(RecordingFixtureProvider())
    drafts, found = await checker.check(*CASES)

    assert [v.draft_id for v in found] == [draft.draft_id for draft in drafts]
    assert [
        (v.validation.status.value, [r.value for r in v.validation.reasons]) for v in found
    ] == [
        ("VALIDATED", []),
        ("REJECTED", ["ANSWER_MISMATCH"]),
        ("REJECTED", ["MULTIPLE_CORRECT"]),
        ("REJECTED", ["ANSWER_LEAKED"]),
        ("VALIDATED", []),
        ("REJECTED", ["DIFFICULTY_MISMATCH"]),
    ]
    dumped = [v.validation.model_dump(mode="json") for v in found]
    assert [d["correct_options"] for d in dumped][:3] == [[0], [2], [0, 1]]
    assert found[4].validation.estimated_difficulty == "MEDIUM"
    assert found[5].validation.estimated_difficulty == "HARD"
    assert {(v.validation.model, v.validation.prompt_version) for v in found} == {
        (MODEL, "validator/v1")
    }
    assert {job for job, _ in checker.validations.rows.values()} == {JOB_ID}


def stored_draft(question: dict) -> Draft:
    drafts = MemoryDrafts()
    drafts.seed(41, question)
    return drafts.rows[0]


MCQ_EASY = stored_draft(java(1))
ESSAY_MEDIUM = stored_draft(essay("Java", "MEDIUM", "Bài tự luận"))


@pytest.mark.parametrize(
    ("draft", "found", "reasons"),
    [
        (MCQ_EASY, {}, []),
        (MCQ_EASY, {"correct_options": []}, [Reason.ANSWER_MISMATCH]),
        (MCQ_EASY, {"correct_options": ["C"]}, [Reason.ANSWER_MISMATCH]),
        (MCQ_EASY, {"correct_options": ["A", "D"]}, [Reason.MULTIPLE_CORRECT]),
        (
            MCQ_EASY,
            {"correct_options": ["B", "C"]},
            [Reason.ANSWER_MISMATCH, Reason.MULTIPLE_CORRECT],
        ),
        (MCQ_EASY, {"on_skill": False}, [Reason.OFF_SKILL]),
        (MCQ_EASY, {"answer_leaked": True}, [Reason.ANSWER_LEAKED]),
        (MCQ_EASY, {"distractors_plausible": False}, [Reason.WEAK_DISTRACTORS]),
        (MCQ_EASY, {"clear": False}, [Reason.UNCLEAR]),
        (MCQ_EASY, {"gradeable_by_criteria": False}, []),
        (MCQ_EASY, {"estimated_difficulty": "MEDIUM"}, []),
        (MCQ_EASY, {"estimated_difficulty": "HARD"}, [Reason.DIFFICULTY_MISMATCH]),
        (ESSAY_MEDIUM, {"correct_options": []}, []),
        (ESSAY_MEDIUM, {"correct_options": ["B"]}, []),
        (ESSAY_MEDIUM, {"gradeable_by_criteria": False}, [Reason.RUBRIC_MISMATCH]),
        (ESSAY_MEDIUM, {"distractors_plausible": False}, []),
        (ESSAY_MEDIUM, {"answer_leaked": True}, [Reason.ANSWER_LEAKED]),
        (ESSAY_MEDIUM, {"estimated_difficulty": "HARD"}, []),
        (ESSAY_MEDIUM, {"estimated_difficulty": "EASY"}, []),
    ],
)
def test_gd5_each_check_maps_to_its_reason(draft, found, reasons):
    """AC-3; DIFFICULTY_REJECT_GAP = 2: one level off passes, EASY ↔ HARD does not."""
    result = QuestionCheck.model_validate({**check(1, difficulty=draft.difficulty), **found})
    assert sorted(failed_checks(draft, result), key=REJECT_REASONS.index) == reasons


def test_gd5_every_reason_failed_is_listed_in_contract_order():
    found = QuestionCheck.model_validate(
        check(
            1,
            ["B"],
            difficulty="HARD",
            on_skill=False,
            answer_leaked=True,
            distractors_plausible=False,
            clear=False,
            note="  Nhiều lỗi.  ",
        )
    )
    [verdict] = decide([MCQ_EASY], [found], model=MODEL, prompt_version="validator/v1")

    assert [reason.value for reason in verdict.validation.reasons] == [
        "ANSWER_MISMATCH",
        "OFF_SKILL",
        "ANSWER_LEAKED",
        "WEAK_DISTRACTORS",
        "UNCLEAR",
        "DIFFICULTY_MISMATCH",
    ]
    assert verdict.validation.model_dump(mode="json")["note"] == "Nhiều lỗi."
    assert verdict.answer == found.model_dump(mode="json")


def test_gd5_duplicate_only_of_an_earlier_question_that_passed():
    """AC-3: 2 repeats 1, which passed; 4 repeats 3, which failed; 5 names a later ref; 6 itself."""
    drafts = MemoryDrafts()
    for n in range(6):
        drafts.seed(41, java(n))
    found = [
        check(1),
        check(2, duplicate_of=1),
        check(3, clear=False),
        check(4, duplicate_of=3),
        check(5, duplicate_of=6),
        check(6, duplicate_of=6),
    ]
    decided = decide(
        drafts.rows,
        [QuestionCheck.model_validate(result) for result in found],
        model=MODEL,
        prompt_version="validator/v1",
    )

    assert [[r.value for r in v.validation.reasons] for v in decided] == [
        [],
        ["DUPLICATE"],
        ["UNCLEAR"],
        [],
        [],
        [],
    ]


def test_gd5_note_is_cut_to_the_contract_and_empty_is_none():
    long_note = QuestionCheck.model_validate(check(1, note="x" * 2500))
    empty = QuestionCheck.model_validate(check(1, note="   "))
    [long_verdict] = decide([MCQ_EASY], [long_note], model=MODEL, prompt_version="validator/v1")
    [empty_verdict] = decide([MCQ_EASY], [empty], model=MODEL, prompt_version="validator/v1")

    assert long_verdict.validation.model_dump(mode="json")["note"] == "x" * 2000
    assert empty_verdict.validation.note is None


async def test_gd5_stored_verdict_reads_back_as_decided():
    """A later job and the backend read the verdict this job decided, a refusal included."""
    checker = Checker(ScriptedProvider(verdicts(check(1, ["C"]), check(2)), refusal()))
    drafts, found = await checker.check(java(1), java(2))
    [refused] = (await checker.check(java(3)))[1]

    stored = await checker.validations.validations(41)
    assert stored == {v.draft_id: v.validation for v in [*found, refused]}
    for verdict in [*found, refused]:
        draft_type = "MCQ"
        assert (
            stored_validation(
                draft_type=draft_type,
                reasons=[r.value for r in verdict.validation.reasons],
                answer=verdict.answer,
                model=verdict.validation.model,
                prompt_version=verdict.validation.prompt_version,
            )
            == verdict.validation
        )


def test_gd5_stored_verdict_of_an_earlier_schema_still_loads():
    """A row written under another QuestionCheck (a field fewer, one more) reads back: only the
    fields a verdict keeps are read from the stored answer."""
    answer = {
        "ref": 1,
        "correct_options": ["B"],
        "estimated_difficulty": "HARD",
        "note": " x ",
        "x": 1,
    }
    validation = stored_validation(
        draft_type="MCQ",
        reasons=["ANSWER_MISMATCH"],
        answer=answer,
        model=MODEL,
        prompt_version="validator/v1",
    )
    assert validation.model_dump(mode="json") == {
        "status": "REJECTED",
        "reasons": ["ANSWER_MISMATCH"],
        "correct_options": [1],
        "estimated_difficulty": "HARD",
        "note": "x",
        "model": MODEL,
        "prompt_version": "validator/v1",
    }


# --- Contract and SQL against the migrations (Invariant 11) ---------------------------------------


def test_gd5_reasons_options_and_gap_follow_the_contract():
    assert REJECT_REASONS == tuple(reason.value for reason in Reason)
    assert len(OPTION_LABELS) == MCQ_OPTION_COUNT
    assert get_args(QuestionCheck.model_fields["estimated_difficulty"].annotation) == (
        "EASY",
        "MEDIUM",
        "HARD",
    )
    assert DIFFICULTY_REJECT_GAP == 2


def test_gd5_validation_sql_matches_the_migration():
    [path] = sorted(MIGRATIONS.glob("*_question_validation_bank_status.sql"))
    sql = path.read_text(encoding="utf-8")
    table = sql.split('CREATE TABLE "ai"."question_validations" (', 1)[1].split(");", 1)[0]
    columns = re.search(r"\(([^)]*)\) VALUES", INSERT_SQL)
    assert columns
    for column in columns.group(1).split(", "):
        assert f'"{column}"' in table, column
    assert 'CONSTRAINT "question_validations_draft_id_key" UNIQUE("draft_id")' in table
    assert "ON CONFLICT ON CONSTRAINT question_validations_draft_id_key DO NOTHING" in INSERT_SQL
    listed = re.search(r'"reasons" <@ array\[([^\]]*)\]', table)
    assert listed
    assert tuple(re.findall(r"'(\w+)'", listed.group(1))) == REJECT_REASONS
    assert "JOIN ai.question_drafts d ON d.id = v.draft_id" in VALIDATIONS_SQL
    assert VALIDATIONS_SQL.endswith("WHERE d.bank_id = %s")
