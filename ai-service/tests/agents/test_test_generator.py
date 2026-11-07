"""Test Generator (US-4.1 AC-5 to AC-8, AC-10; US-4.2 AC-4), with recorded or scripted LLM
replies, never a real API.

The fixtures in tests/fixtures/llm/test_generator and tests/fixtures/llm/validator answer the three
rounds of BANK, each a Generator call and a Validator call. They are keyed by the exact request, so
they pin the released prompts test_generator/v2 and validator/v1 and the cells, stems, refusals,
rejections and questions the agent sends. Other tests script the replies (generator_support).
"""

import inspect
import math
import re
from collections import Counter
from pathlib import Path

import pytest
from embedding_support import TableEmbedder, at_similarity, unit
from generator_support import (
    BANK,
    JOB_ID,
    MODEL,
    Harness,
    MemoryDrafts,
    RecordingFixtureProvider,
    ScriptedProvider,
    answer,
    bank,
    check,
    essay,
    mcq,
    passes,
    refusal,
    verdicts,
)

from app.agents.test_generator import (
    AGENT,
    FailedDraft,
    QuestionBankTools,
    QuestionProposalBatch,
    RejectReason,
    load_bank_tools,
    stem_key,
)
from app.agents.test_generator.agent import VERDICT_TEXT
from app.agents.test_generator.config import (
    DUPLICATE_COSINE,
    MAX_CHECKS_PER_DRAFT,
    MAX_ESSAYS_PER_CALL,
    MAX_QUESTIONS_PER_CALL,
    MAX_ROUNDS,
    MAX_TOKENS_PER_JOB,
)
from app.agents.test_generator.drafts import DRAFTS_SQL, INSERT_SQL, VECTORS_SQL
from app.agents.test_generator.source import BANK_SQL
from app.consumers.errors import NeedsHumanReview, PermanentError
from app.consumers.kinds import questions_status
from app.contracts.ai_result_status import AiResultStatus
from app.contracts.question_validation import QuestionValidation, Reason
from app.contracts.questions_generate_output import QuestionsGenerateOutput
from app.embedding import HashingEmbedder
from app.llm.types import Outcome, ProviderResponse, StopReason, Usage

pytestmark = pytest.mark.anyio

MIGRATIONS = Path(__file__).resolve().parents[3] / "apps" / "api" / "drizzle"
EMPTY = answer()


async def tools_for(
    bank_source=BANK,
    drafts: MemoryDrafts | None = None,
    embedder=None,
    verdicts: dict[int, QuestionValidation] | None = None,
) -> tuple[QuestionBankTools, MemoryDrafts]:
    drafts = drafts or MemoryDrafts()
    tools = await load_bank_tools(
        bank=bank_source,
        drafts=await drafts.drafts(bank_source.bank_id),
        verdicts={} if verdicts is None else verdicts,
        repo=drafts,
        embedder=embedder or HashingEmbedder(),
        job_id=JOB_ID,
    )
    return tools, drafts


def judged(*reasons: str) -> QuestionValidation:
    """A verdict of the Validator: VALIDATED without reasons."""
    return QuestionValidation.model_validate(
        {
            "status": "REJECTED" if reasons else "VALIDATED",
            "reasons": list(reasons),
            "correct_options": [0],
            "estimated_difficulty": "EASY",
            "note": None,
            "model": MODEL,
            "prompt_version": "validator/v1",
        }
    )


def proposals(*questions) -> list:
    return QuestionProposalBatch.model_validate({"questions": list(questions)}).questions


async def submit(tools: QuestionBankTools, *questions):
    return await tools.submit_questions(
        proposals(*questions), model=MODEL, prompt_version="test_generator/v1"
    )


def java_easy(number: int) -> dict:
    """Distinct Java EASY questions: the hashing vectors of their stems stay far apart."""
    topics = [
        "phạm vi của biến cục bộ trong một khối lệnh",
        "giá trị mặc định của một trường int chưa gán",
        "khác nhau giữa lớp trừu tượng và interface",
        "ý nghĩa của từ khóa this trong constructor",
        "cách bắt một ngoại lệ bằng try và catch",
        "vai trò của bộ gom rác trong JVM",
        "ép kiểu từ double sang int",
    ]
    return mcq("Java", "EASY", f"Câu hỏi về {topics[number]}?")


# --- AC-5: the loop -------------------------------------------------------------------------------


async def test_gd5_generates_until_every_cell_has_three_times_validated():
    """US-4.1 AC-5, US-4.2 AC-2 and AC-4: coverage → one generate per group of short cells →
    submit → one Validator call on what the round stored, until every cell has 3× VALIDATED drafts.
    Round 1 asks part A for 4× of each cell: code refuses two questions and the Validator rejects
    one more. Round 2, part B's turn, fills the essay cell. Round 3 asks SQL for the three it
    lacks, with the refusals of round 1 and the rejection. The fixtures pin all six requests."""
    harness = Harness(BANK, provider=RecordingFixtureProvider())
    output = await harness.run()

    assert output.rounds == 3
    assert output.missing_cells == []
    assert questions_status(output) is AiResultStatus.SUCCEEDED
    assert [params["agent"] for params in harness.provider.sent] == [AGENT, "validator"] * 3
    assert harness.sent_block(1, "cells") == [
        {
            "type": "MCQ",
            "skill": "Java",
            "difficulty": "EASY",
            "level": "INTERMEDIATE",
            "questions_to_write": 4,
        },
        {
            "type": "MCQ",
            "skill": "SQL",
            "difficulty": "MEDIUM",
            "level": "BASIC",
            "questions_to_write": 4,
        },
    ]
    assert harness.sent_block(1, "refused_questions") is None
    assert harness.sent_block(1, "rejected_questions") is None
    # AC-2: each Validator call holds the drafts its round stored, of one type.
    checked = [harness.sent_block(n, "questions", "validator") for n in (1, 2, 3)]
    assert [len(questions) for questions in checked] == [6, 3, 2]
    assert [{q["type"] for q in questions} for questions in checked] == [
        {"MCQ"},
        {"ESSAY"},
        {"MCQ"},
    ]
    assert harness.sent_block(2, "cells")[0]["type"] == "ESSAY"
    assert harness.sent_block(2, "refused_questions") is None
    # AC-4: SQL holds one VALIDATED draft and one rejected: round 3 asks for 4 - 1.
    assert harness.sent_block(3, "cells") == [
        {
            "type": "MCQ",
            "skill": "SQL",
            "difficulty": "MEDIUM",
            "level": "BASIC",
            "questions_to_write": 3,
        },
    ]
    assert [r["reason"] for r in harness.sent_block(3, "refused_questions")] == [
        "an MCQ needs exactly one correct option",
        "it repeats an existing question or another one of the answer",
    ]
    [rejected] = harness.sent_block(3, "rejected_questions")
    assert rejected["stem"].startswith("Khi nối bảng employees với departments")
    assert rejected["reasons"] == [VERDICT_TEXT[Reason.WEAK_DISTRACTORS]]
    assert [q["skill"] for q in harness.sent_block(3, "existing_questions")] == ["SQL"]

    by_cell = Counter(
        (q.root.type, q.root.skill, q.root.difficulty, q.root.validation.status.value)
        for q in output.questions
    )
    assert by_cell == {
        ("MCQ", "Java", "EASY", "VALIDATED"): 4,
        ("MCQ", "SQL", "MEDIUM", "VALIDATED"): 3,
        ("MCQ", "SQL", "MEDIUM", "REJECTED"): 1,
        ("ESSAY", "Java", "MEDIUM", "VALIDATED"): 3,
    }
    assert {(q.root.model, q.root.prompt_version) for q in output.questions} == {
        (MODEL, "test_generator/v2")
    }
    checks = [q.root.validation for q in output.questions]
    assert {(v.model, v.prompt_version) for v in checks} == {(MODEL, "validator/v1")}
    # One level off is kept, with the estimate (D50); an essay has no options to solve.
    [harder] = [
        q.root
        for q in output.questions
        if q.root.difficulty == "EASY" and q.root.validation.estimated_difficulty == "MEDIUM"
    ]
    assert harder.validation.status.value == "VALIDATED"
    assert {q.root.validation.correct_options is None for q in output.questions} == {True, False}
    assert all(
        q.root.validation.correct_options is None
        for q in output.questions
        if q.root.type == "ESSAY"
    )
    assert set(harness.drafts.job_of.values()) == {JOB_ID}
    assert {job for job, _ in harness.validations.rows.values()} == {JOB_ID}
    QuestionsGenerateOutput.model_validate(output.model_dump(mode="json"))


async def test_gd5_prompt_puts_requirements_in_shared_and_effort_high():
    """AC-10: one LLMClient call per round, effort high, the released prompt; the requirements go
    in `shared` (skills only, no hard conditions); `system` holds no data."""
    harness = Harness(BANK, provider=RecordingFixtureProvider())
    await harness.run()

    generator = harness.sent_to(AGENT)
    assert len(generator) == 3
    for params in generator:
        assert (params["agent"], params["prompt_version"], params["effort"]) == (
            AGENT,
            "test_generator/v2",
            "high",
        )
        assert params["shared"].startswith("Requirements of the position:\n\n<jd_requirements>")
        assert "majors" not in params["shared"] and "Công nghệ thông tin" not in params["shared"]
        assert "Java" not in params["system"] and "must_have" not in params["system"]
        assert set(params["output_schema"]["properties"]) == {"questions"}
    # Byte-identical on every round, so it stays cacheable (AGENTS › Gọi LLM).
    assert len({params["system"] for params in generator}) == 1
    assert [row.agent for row in harness.calls.rows] == [AGENT, "validator"] * 3
    assert {row.effort for row in harness.calls.rows} == {"high"}


async def test_gd5_round_asks_one_part_at_most_fifteen_questions():
    """A round takes the short cells of one part in blueprint order, each up to 4×, 15 in all."""
    wide = bank((("Java", "EASY", 2), ("Java", "MEDIUM", 3), ("SQL", "HARD", 2)))
    harness = Harness(wide, provider=ScriptedProvider(*[EMPTY] * MAX_ROUNDS))
    await harness.run(wide.bank_id)

    cells = harness.sent_block(1, "cells")
    assert [(c["skill"], c["difficulty"], c["questions_to_write"]) for c in cells] == [
        ("Java", "EASY", 8),
        ("Java", "MEDIUM", 7),
    ]
    assert sum(c["questions_to_write"] for c in cells) == MAX_QUESTIONS_PER_CALL
    assert {c["type"] for c in cells} == {"MCQ"}


async def test_gd5_essay_round_asks_at_most_five():
    """Part B rounds ask for fewer questions: an essay answer is long (MAX_ESSAYS_PER_CALL)."""
    two_essays = bank(b_cells=(("Java", "MEDIUM", 1), ("SQL", "MEDIUM", 1)))
    harness = Harness(two_essays, provider=ScriptedProvider(*[EMPTY] * MAX_ROUNDS))
    for n in range(3):
        harness.seed_checked(41, java_easy(n), vector=unit(1, n))
        harness.seed_checked(41, mcq("SQL", "MEDIUM", f"Câu SQL số {n}?"), vector=unit(0, 1, n))
    await harness.run()

    cells = harness.sent_block(1, "cells")
    assert [(c["type"], c["skill"], c["questions_to_write"]) for c in cells] == [
        ("ESSAY", "Java", 4),
        ("ESSAY", "SQL", 1),
    ]
    assert sum(c["questions_to_write"] for c in cells) == MAX_ESSAYS_PER_CALL


async def test_gd5_stops_at_max_rounds_and_reports_missing_cells():
    """AC-5: 12 rounds without a usable question end the job PARTIAL with every short cell."""
    harness = Harness(BANK, provider=ScriptedProvider(*[EMPTY] * MAX_ROUNDS))
    output = await harness.run()

    assert output.rounds == MAX_ROUNDS
    assert len(harness.provider.sent) == MAX_ROUNDS
    assert [
        (c.type, c.skill, c.difficulty, c.drafted, c.validated, c.required)
        for c in output.missing_cells
    ] == [
        ("MCQ", "Java", "EASY", 0, 0, 3),
        ("MCQ", "SQL", "MEDIUM", 0, 0, 3),
        ("ESSAY", "Java", "MEDIUM", 0, 0, 3),
    ]
    assert questions_status(output) is AiResultStatus.PARTIAL


async def test_gd5_stops_once_the_token_budget_is_spent():
    """AC-5: no round starts after MAX_TOKENS_PER_JOB; the tokens of invalid attempts count."""
    invalid = ProviderResponse(
        stop_reason=StopReason.END_TURN,
        text='{"questions": "none"}',
        model=MODEL,
        usage=Usage(input_tokens=250_000, output_tokens=50_000),
    )
    spent = Usage(input_tokens=100_000, output_tokens=50_000)
    harness = Harness(
        BANK, provider=ScriptedProvider(invalid, answer(usage=spent), answer(usage=spent))
    )
    output = await harness.run()

    # Round 1: 300K invalid + 150K valid; round 2: 150K more reaches the 600K budget.
    assert output.rounds == 2
    assert [row.outcome for row in harness.calls.rows] == [
        Outcome.INVALID_OUTPUT,
        Outcome.SUCCEEDED,
        Outcome.SUCCEEDED,
    ]
    assert questions_status(output) is AiResultStatus.PARTIAL


async def test_gd5_retried_job_counts_the_tokens_of_its_earlier_attempts():
    """AC-5: an attempt that fails is run again with the same job id; the budget is the job's, so
    the retry reads what ai.llm_calls logged for it and stops sooner."""
    spent = Usage(input_tokens=150_000, output_tokens=50_000)
    harness = Harness(BANK, provider=ScriptedProvider(*[answer(usage=spent)] * 4))
    harness.drafts.fail_inserts = 2  # A store that is down: the first attempt dies in round 2.
    with pytest.raises(ConnectionError):
        await harness.run()

    output = await harness.run()

    # 400K before the retry: one more round reaches the 600K budget, not two.
    assert output.rounds == 1
    assert len(harness.calls.rows) == 3
    assert questions_status(output) is AiResultStatus.PARTIAL


async def test_gd5_parts_take_turns_and_the_least_asked_cells_go_first():
    """A cell that never fills holds up no other: part B gets every other round, and in part A the
    cells left out of a round open the next one."""
    wide = bank((("Java", "EASY", 2), ("Java", "MEDIUM", 3), ("SQL", "HARD", 2)))
    harness = Harness(wide, provider=ScriptedProvider(*[EMPTY] * MAX_ROUNDS))
    await harness.run(wide.bank_id)

    def asked(round_number: int) -> list[tuple[str, str, int]]:
        cells = harness.sent_block(round_number, "cells")
        return [(c["skill"], c["difficulty"], c["questions_to_write"]) for c in cells]

    assert [harness.sent_block(n, "cells")[0]["type"] for n in range(1, 7)] == [
        "MCQ",
        "ESSAY",
    ] * 3
    assert asked(1) == [("Java", "EASY", 8), ("Java", "MEDIUM", 7)]
    assert asked(3) == [("SQL", "HARD", 8), ("Java", "EASY", 7)]
    assert asked(5) == [("Java", "MEDIUM", 12), ("SQL", "HARD", 3)]


async def test_gd5_refusal_fails_with_llm_call_logged():
    """AC-10: a refusal fails the job for a person to look at, and ai.llm_calls has the attempt;
    the drafts of the round before stay for the next run."""
    first = answer(*(java_easy(n) for n in range(3)))
    harness = Harness(BANK, provider=ScriptedProvider(first, passes(3), refusal()))

    with pytest.raises(NeedsHumanReview) as raised:
        await harness.run()

    assert raised.value.code == "LLM_REFUSED"
    refused = harness.calls.rows[-1]
    assert (refused.agent, refused.effort, refused.outcome) == (AGENT, "high", Outcome.REFUSED)
    assert refused.job_id == JOB_ID
    assert len(harness.drafts.rows) == 3
    assert len(harness.validations.rows) == 3


async def test_gd5_bank_locked_or_gone_fails_at_once():
    harness = Harness(provider=ScriptedProvider())

    with pytest.raises(PermanentError) as raised:
        await harness.run(999)

    assert raised.value.code == "QUESTION_BANK_NOT_FOUND"
    assert harness.provider.sent == []


async def test_gd5_result_carries_every_draft_of_the_bank():
    """D49: the result lists the drafts of earlier jobs too, those of cells no longer in the
    blueprint included, so a draft of a failed job still reaches the backend; each carries its
    verdict, and a draft of a cell no longer in the blueprint is never checked (D50). A draft
    without a vector of the current embedder gets one when the job loads the bank."""
    harness = Harness(BANK, provider=ScriptedProvider())
    seeded = (
        [harness.seed_checked(41, java_easy(n), vector=unit(1, n)) for n in range(3)]
        + [harness.seed_checked(41, mcq("SQL", "MEDIUM", f"Câu SQL số {n}?")) for n in range(3)]
        + [
            harness.seed_checked(41, essay("Java", "MEDIUM", f"Bài tự luận số {n}"))
            for n in range(3)
        ]
    )
    orphan = harness.drafts.seed(41, mcq("Docker", "HARD", "Câu Docker đã bỏ khỏi ma trận?"))
    harness.drafts.seed(99, java_easy(0), vector=unit(1))

    output = await harness.run()

    assert output.rounds == 0 and output.missing_cells == []
    assert harness.provider.sent == []
    assert [q.root.draft_id for q in output.questions] == [*seeded, orphan]
    assert harness.drafts.added == [*seeded[3:], orphan]
    essay_draft = output.questions[6].root
    assert essay_draft.type == "ESSAY"
    assert essay_draft.sample_answer == "Bài làm mẫu đủ mọi tiêu chí."
    assert [q.root.validation is not None for q in output.questions] == [True] * 9 + [False]
    QuestionsGenerateOutput.model_validate(output.model_dump(mode="json"))


# --- US-4.2 AC-4: the Validator in the loop -------------------------------------------------------


async def test_gd5_waiting_drafts_are_checked_before_the_first_round():
    """US-4.2 AC-4: drafts of a run before the Validator are checked first; the round then asks
    only for what the VALIDATED ones lack, and shows the rejected one with its reason."""
    first_check = verdicts(check(1), check(2), check(3, ["B"]))
    harness = Harness(BANK, provider=ScriptedProvider(first_check, *[EMPTY] * MAX_ROUNDS))
    waiting = [harness.drafts.seed(41, java_easy(n), vector=unit(1, n)) for n in range(3)]
    orphan = harness.drafts.seed(41, mcq("Docker", "HARD", "Câu Docker đã bỏ khỏi ma trận?"))
    output = await harness.run()

    assert harness.provider.sent[0]["agent"] == "validator"
    assert len(harness.sent_to("validator")) == 1
    assert [q["stem"] for q in harness.sent_block(1, "questions", "validator")] == [
        java_easy(n)["stem"] for n in range(3)
    ]
    java = harness.sent_block(1, "cells")[0]
    assert (java["skill"], java["difficulty"], java["questions_to_write"]) == ("Java", "EASY", 2)
    [rejected] = harness.sent_block(1, "rejected_questions")
    assert rejected == {
        "type": "MCQ",
        "skill": "Java",
        "difficulty": "EASY",
        "stem": java_easy(2)["stem"],
        "reasons": [VERDICT_TEXT[Reason.ANSWER_MISMATCH]],
    }
    by_id = {q.root.draft_id: q.root.validation for q in output.questions}
    assert [by_id[draft_id].status.value for draft_id in waiting] == [
        "VALIDATED",
        "VALIDATED",
        "REJECTED",
    ]
    assert by_id[orphan] is None
    assert (output.missing_cells[0].drafted, output.missing_cells[0].validated) == (3, 2)


async def test_gd5_drafts_without_a_valid_check_are_checked_again_next_round():
    """AC-2, AC-4: invalid output splits the group; drafts still invalid alone wait and the job
    goes on. They count toward the cell's 4×, so the next round asks for nothing and only checks
    them again."""
    small = bank((("Java", "EASY", 1),))
    invalid = ProviderResponse(
        stop_reason=StopReason.END_TURN, text='{"results": 3}', model=MODEL, usage=Usage()
    )
    script = [
        answer(*(java_easy(n) for n in range(4))),
        *[invalid] * 3,  # the four drafts
        passes(2),  # the first half
        *[invalid] * 9,  # the second half, then each of its two drafts alone
        passes(2),  # round 2: the two drafts again
    ]
    harness = Harness(small, provider=ScriptedProvider(*script))
    for n in range(3):
        harness.seed_checked(41, essay("Java", "MEDIUM", f"Bài tự luận số {n}"))
    output = await harness.run()

    assert (output.rounds, output.missing_cells) == (2, [])
    assert [params["agent"] for params in harness.provider.sent] == [AGENT] + ["validator"] * 14
    assert [q["stem"] for q in harness.sent_block(14, "questions", "validator")] == [
        java_easy(n)["stem"] for n in (2, 3)
    ]
    assert len(harness.validations.rows) == 7


async def test_gd5_a_draft_sent_twice_without_a_verdict_is_given_up_for_the_job():
    """AC-4: a draft that gets no verdict from MAX_CHECKS_PER_DRAFT checks takes no room in its
    cell for the rest of the job: the cell asks for another in its place."""
    small = bank((("Java", "EASY", 1),))
    script = [
        answer(*(java_easy(n) for n in range(4))),
        verdicts(check(1), check(2)),  # no result for the last two
        verdicts(check(9)),  # round 2 asks for nothing and checks them again: still none
        answer(java_easy(4), java_easy(5)),
        passes(2),
    ]
    harness = Harness(small, provider=ScriptedProvider(*script))
    for n in range(3):
        harness.seed_checked(41, essay("Java", "MEDIUM", f"Bài tự luận số {n}"))
    output = await harness.run()

    assert MAX_CHECKS_PER_DRAFT == 2
    assert (output.rounds, output.missing_cells) == (3, [])
    assert [params["agent"] for params in harness.provider.sent] == [
        AGENT,
        "validator",
        "validator",
        AGENT,
        "validator",
    ]
    [java] = harness.sent_block(2, "cells")
    assert java["questions_to_write"] == 2
    assert [q["stem"] for q in harness.sent_block(3, "questions", "validator")] == [
        java_easy(n)["stem"] for n in (4, 5)
    ]
    checked = {q.root.stem: q.root.validation is not None for q in output.questions}
    assert [checked[java_easy(n)["stem"]] for n in range(6)] == [
        True,
        True,
        False,
        False,
        True,
        True,
    ]


async def test_gd5_only_the_drafts_a_short_cell_needs_are_checked():
    """AC-4: before the first round a cell sends the waiting drafts that could take it to 4×,
    oldest first; a cell already at 3× VALIDATED sends none."""
    small = bank((("Java", "EASY", 1),))
    harness = Harness(small, provider=ScriptedProvider(passes(4), *[EMPTY] * MAX_ROUNDS))
    waiting = [harness.drafts.seed(41, java_easy(n), vector=unit(1, n)) for n in range(5)]
    for n in range(3):
        harness.seed_checked(41, essay("Java", "MEDIUM", f"Bài tự luận số {n}"))
    harness.drafts.seed(41, essay("Java", "MEDIUM", "Bài tự luận còn chờ"))
    output = await harness.run()

    assert len(harness.sent_to("validator")) == 1
    assert [q["stem"] for q in harness.sent_block(1, "questions", "validator")] == [
        java_easy(n)["stem"] for n in range(4)
    ]
    assert (output.rounds, output.missing_cells) == (0, [])
    assert waiting[4] not in harness.validations.rows


async def test_gd5_validator_tokens_count_toward_the_budget():
    """US-4.2 AC-4: the Validator spends from the job's MAX_TOKENS_PER_JOB too."""
    heavy = Usage(input_tokens=500_000, output_tokens=100_000)
    harness = Harness(
        BANK,
        provider=ScriptedProvider(
            answer(*(java_easy(n) for n in range(4))),
            verdicts(*(check(ref) for ref in range(1, 5)), usage=heavy),
        ),
    )
    output = await harness.run()

    assert output.rounds == 1
    assert questions_status(output) is AiResultStatus.PARTIAL


async def test_gd5_no_check_starts_past_the_budget():
    """No LLM call starts once the budget is spent: the round's drafts wait for the next job."""
    harness = Harness(
        BANK,
        provider=ScriptedProvider(
            answer(*(java_easy(n) for n in range(4)), usage=Usage(input_tokens=MAX_TOKENS_PER_JOB))
        ),
    )
    output = await harness.run()

    assert [params["agent"] for params in harness.provider.sent] == [AGENT]
    assert [q.root.validation for q in output.questions] == [None] * 4
    assert output.missing_cells[0].drafted == 4


def test_gd5_every_validator_reason_has_a_text_for_the_generator():
    assert set(VERDICT_TEXT) == set(Reason)


# --- AC-6: the tools ------------------------------------------------------------------------------


def test_gd5_tools_expose_exactly_three():
    public = {
        name
        for name, member in inspect.getmembers(QuestionBankTools)
        if not name.startswith("_") and callable(member)
    }
    assert public == {"get_blueprint_coverage", "find_similar_questions", "submit_questions"}


async def test_gd5_coverage_lists_cells_below_three_times_validated():
    """US-4.2 AC-4: a cell is covered by 3× VALIDATED drafts. Waiting drafts count toward what a
    round asks for (4×); rejected ones do not, and the cell lists them with their reasons."""
    found: dict[int, QuestionValidation] = {}
    tools, _ = await tools_for(verdicts=found)
    assert [
        (c.skill, c.difficulty, c.drafted, c.validated, c.required)
        for c in tools.get_blueprint_coverage()
    ] == [("Java", "EASY", 0, 0, 3), ("SQL", "MEDIUM", 0, 0, 3), ("Java", "MEDIUM", 0, 0, 3)]

    report = await submit(tools, *(java_easy(n) for n in range(4)))

    def java() -> object:
        [cell] = [c for c in tools.get_blueprint_coverage() if c.difficulty == "EASY"]
        return cell

    assert (java().drafted, java().validated, java().pending, java().wanted) == (4, 0, 4, 0)
    first, second, third, fourth = report.accepted
    found.update({first: judged(), second: judged(), third: judged("UNCLEAR", "DUPLICATE")})
    cell = java()
    assert (cell.drafted, cell.validated, cell.pending, cell.wanted) == (4, 2, 1, 1)
    assert cell.stems == tuple(java_easy(n)["stem"] for n in (0, 1, 3))
    assert cell.rejected == (FailedDraft(java_easy(2)["stem"], ("UNCLEAR", "DUPLICATE")),)

    found[fourth] = judged()

    assert [(c.skill, c.difficulty) for c in tools.get_blueprint_coverage()] == [
        ("SQL", "MEDIUM"),
        ("Java", "MEDIUM"),
    ]


async def test_gd5_cells_match_skills_by_key():
    """Two spellings of one skill are one cell (CONTEXT D39): the draft keeps the blueprint's."""
    tools, drafts = await tools_for(bank((("Spring Boot", "EASY", 1),)))
    report = await submit(tools, mcq("spring-boot", "EASY", "Annotation nào khởi động ứng dụng?"))

    assert len(report.accepted) == 1
    assert drafts.rows[0].skill == "Spring Boot"
    assert drafts.rows[0].payload["skill"] == "Spring Boot"


def toward_query(similarity: float, axis: int) -> list[float]:
    """Cosine `similarity` with unit(1); two such vectors on other axes share only that part."""
    return unit(similarity, *[0.0] * (axis - 1), math.sqrt(1 - similarity * similarity))


async def test_gd5_find_similar_questions_returns_the_closest_three():
    texts = {f"Câu {n}": toward_query(s, n + 1) for n, s in enumerate((0.2, 0.8, 0.5, 0.7))}
    embedder = TableEmbedder({"truy vấn": unit(1), **texts}, model="hashing-v1")
    tools, drafts = await tools_for(embedder=embedder)
    report = await submit(tools, *(mcq("Java", "EASY", text) for text in texts))
    similar = await tools.find_similar_questions("truy vấn")

    assert len(report.accepted) == 4
    assert [(s.stem, round(s.similarity, 6)) for s in similar] == [
        ("Câu 1", 0.8),
        ("Câu 3", 0.7),
        ("Câu 2", 0.5),
    ]
    assert [s.draft_id for s in similar] == [report.accepted[i] for i in (1, 3, 2)]


# --- AC-7: one bad question is refused alone ----------------------------------------------------


@pytest.mark.parametrize(
    ("question", "reason"),
    [
        (mcq("Java", "EASY", "Ba phương án?", ("a", "b", "c")), RejectReason.INVALID_MCQ_OPTIONS),
        (
            mcq("Java", "EASY", "Hai phương án giống?", ("a", "b", "b ", "c")),
            RejectReason.INVALID_MCQ_OPTIONS,
        ),
        (
            mcq("Java", "EASY", "Phương án rỗng?", ("a", " ", "c", "d")),
            RejectReason.INVALID_MCQ_OPTIONS,
        ),
        (mcq("Java", "EASY", "Hai đáp án đúng?", correct=(0, 1)), RejectReason.NOT_ONE_CORRECT),
        (mcq("Java", "EASY", "Không đáp án đúng?", correct=()), RejectReason.NOT_ONE_CORRECT),
        (
            mcq("Java", "EASY", "Thiếu giải thích?", explanation="  "),
            RejectReason.MISSING_EXPLANATION,
        ),
        (mcq("Java", "EASY", "   "), RejectReason.INVALID_STEM),
        (mcq("Java", "EASY", "x" * 4001), RejectReason.TEXT_TOO_LONG),
        (
            mcq("Java", "EASY", "Phương án quá dài?", ("a" * 1001, "b", "c", "d")),
            RejectReason.INVALID_MCQ_OPTIONS,
        ),
        (essay("Java", "MEDIUM", "Không có rubric", ()), RejectReason.INVALID_RUBRIC),
        (
            essay("Java", "MEDIUM", "Tiêu chí 0 điểm", (("Ý chính", 0),)),
            RejectReason.INVALID_RUBRIC,
        ),
        (
            essay("Java", "MEDIUM", "Tiêu chí 101 điểm", (("Ý chính", 101),)),
            RejectReason.INVALID_RUBRIC,
        ),
        (
            essay("Java", "MEDIUM", "Mười một tiêu chí", [(f"Ý {n}", 1) for n in range(11)]),
            RejectReason.INVALID_RUBRIC,
        ),
        (essay("Java", "MEDIUM", "Tiêu chí rỗng", ((" ", 5),)), RejectReason.INVALID_RUBRIC),
        (
            essay("Java", "MEDIUM", "Thiếu bài mẫu", sample_answer=""),
            RejectReason.MISSING_SAMPLE_ANSWER,
        ),
        (
            essay("Java", "MEDIUM", "Tự luận thiếu giải thích", explanation=""),
            RejectReason.MISSING_EXPLANATION,
        ),
        (mcq("Python", "EASY", "Kỹ năng ngoài ma trận?"), RejectReason.UNKNOWN_CELL),
        (mcq("Java", "HARD", "Độ khó ngoài ma trận?"), RejectReason.UNKNOWN_CELL),
        (essay("Java", "EASY", "Tự luận cho ô trắc nghiệm"), RejectReason.UNKNOWN_CELL),
    ],
)
async def test_gd5_submit_refuses_a_bad_question_and_keeps_the_rest(question, reason):
    tools, drafts = await tools_for()
    report = await submit(tools, java_easy(0), question, java_easy(1))

    assert [(r.index, r.reason) for r in report.rejected] == [(1, reason)]
    assert len(report.accepted) == 2
    assert drafts.stems(41) == [java_easy(0)["stem"], java_easy(1)["stem"]]


async def test_gd5_stored_draft_is_the_trimmed_question():
    """The payload is the question as GeneratedQuestion writes it, its texts trimmed."""
    tools, drafts = await tools_for()
    await submit(tools, mcq("java", "EASY", "  Câu hỏi?  ", (" a", "b ", "c", "d")))

    [draft] = drafts.rows
    assert draft.payload == {
        "type": "MCQ",
        "skill": "Java",
        "difficulty": "EASY",
        "stem": "Câu hỏi?",
        "explanation": "Giải thích đáp án.",
        "options": [
            {"text": "a", "correct": True},
            {"text": "b", "correct": False},
            {"text": "c", "correct": False},
            {"text": "d", "correct": False},
        ],
    }
    assert (draft.skill_key, draft.stem_key) == ("java", stem_key("câu hỏi?"))


async def test_gd5_cell_full_past_five_times():
    """AC-7: a cell takes at most 5× its count, within one batch too."""
    tools, drafts = await tools_for()
    report = await submit(tools, *(java_easy(n) for n in range(7)))

    assert len(report.accepted) == 5
    assert [(r.index, r.reason) for r in report.rejected] == [
        (5, RejectReason.CELL_FULL),
        (6, RejectReason.CELL_FULL),
    ]
    assert len(drafts.rows) == 5


async def test_gd5_cell_full_does_not_count_rejected_drafts():
    """US-4.2 AC-4 (D50): a rejected draft takes no room, so the cell takes its replacement."""
    found: dict[int, QuestionValidation] = {}
    tools, _ = await tools_for(verdicts=found)
    first = await submit(tools, *(java_easy(n) for n in range(5)))
    found.update({draft_id: judged("ANSWER_MISMATCH") for draft_id in first.accepted[:2]})

    second = await submit(
        tools, java_easy(5), java_easy(6), mcq("Java", "EASY", "Cách khai báo mảng hai chiều?")
    )

    assert len(second.accepted) == 2
    assert [(r.index, r.reason) for r in second.rejected] == [(2, RejectReason.CELL_FULL)]


async def test_gd5_bank_full_at_the_most_drafts_one_result_carries(monkeypatch):
    """AC-7: past MAX_DRAFTS the bank takes no draft, so the result still fits its contract."""
    monkeypatch.setattr("app.agents.test_generator.tools.MAX_DRAFTS", 3)
    tools, drafts = await tools_for()
    report = await submit(tools, *(java_easy(n) for n in range(4)))

    assert len(report.accepted) == 3
    assert [(r.index, r.reason) for r in report.rejected] == [(3, RejectReason.BANK_FULL)]
    assert len(drafts.rows) == 3


# --- AC-8: duplicates -----------------------------------------------------------------------------


async def test_gd5_duplicate_by_text_or_cosine_names_the_nearest_draft():
    """AC-8: the same stem after whitespace and case, or a cosine of 0.9 or more, is a duplicate,
    against the bank and within the batch; 0.89 is not."""
    embedder = TableEmbedder(
        {
            "Java là gì?": unit(1),
            "Gần như Java là gì": at_similarity(0.9),
            "Khá giống Java là gì": at_similarity(0.89),
            "Câu mới A": unit(0, 0, 1),
            "Câu mới A, nói khác": unit(0, 0, 1),
        },
        model="hashing-v1",
    )
    drafts = MemoryDrafts()
    existing = drafts.seed(41, mcq("Java", "EASY", "Java là gì?"), vector=unit(1))
    tools, _ = await tools_for(drafts=drafts, embedder=embedder)

    report = await submit(
        tools,
        mcq("Java", "EASY", "  JAVA   là   gì? "),
        mcq("Java", "EASY", "Gần như Java là gì"),
        mcq("Java", "EASY", "Khá giống Java là gì"),
        mcq("SQL", "MEDIUM", "Câu mới A"),
        mcq("SQL", "MEDIUM", "Câu mới A, nói khác"),
    )

    assert [(r.index, r.reason, r.nearest_draft_id) for r in report.rejected] == [
        (0, RejectReason.DUPLICATE, existing),
        (1, RejectReason.DUPLICATE, existing),
        (4, RejectReason.DUPLICATE, None),
    ]
    assert drafts.stems(41) == ["Java là gì?", "Khá giống Java là gì", "Câu mới A"]
    vectors = list(drafts.vectors_of.values())
    worst = max(
        sum(a * b for a, b in zip(vectors[i], vectors[j], strict=True))
        for i in range(len(vectors))
        for j in range(i + 1, len(vectors))
    )
    assert worst < 0.9


async def test_gd5_stem_stored_by_another_job_meanwhile_is_a_duplicate():
    """The unique (bank_id, stem_key) of ai.question_drafts decides when two jobs race."""
    tools, drafts = await tools_for()
    drafts.seed(41, java_easy(0), vector=unit(1))  # written after this job loaded the bank

    report = await submit(tools, java_easy(0), java_easy(1))

    assert [(r.index, r.reason) for r in report.rejected] == [(0, RejectReason.DUPLICATE)]
    assert len(report.accepted) == 1


def test_gd5_stem_key_ignores_case_and_spacing_and_fits_an_index():
    assert stem_key("  Câu   HỎI\n về Java ") == stem_key("câu hỏi về java")
    assert stem_key("Câu hỏi về Java") != stem_key("Câu hỏi về Jav")
    assert re.fullmatch(r"[0-9a-f]{64}", stem_key("x" * 4000))


# --- SQL against the migrations (Invariant 11) ----------------------------------------------------


def migration(suffix: str) -> str:
    [path] = sorted(MIGRATIONS.glob(f"*_{suffix}.sql"))
    return path.read_text(encoding="utf-8")


def test_gd5_draft_sql_matches_the_migration():
    sql = migration("question_banks")
    table = sql.split('CREATE TABLE "ai"."question_drafts" (', 1)[1].split(");", 1)[0]
    columns = re.search(r"\(([^)]*)\) VALUES", INSERT_SQL)
    assert columns
    for column in columns.group(1).split(", "):
        assert f'"{column}"' in table, column
    assert 'CONSTRAINT "question_drafts_bank_stem_key" UNIQUE("bank_id","stem_key")' in table
    assert "ON CONFLICT ON CONSTRAINT question_drafts_bank_stem_key DO NOTHING" in INSERT_SQL
    assert "FROM ai.question_drafts WHERE bank_id = %s" in DRAFTS_SQL
    # A constant owner type, joined by bank: no HNSW scan (LESSONS §24).
    assert "e.owner_type = 'question'" in VECTORS_SQL and "ORDER BY" not in VECTORS_SQL


def view_columns(sql: str, view: str) -> set[str]:
    body = sql.split(f"CREATE OR REPLACE VIEW {view} WITH (security_barrier) AS", 1)[1]
    select = body.split("FROM", 1)[0].replace("SELECT", "", 1)
    return {re.split(r"\s+AS\s+", column.strip())[-1] for column in select.split(",")}


def test_gd5_bank_sql_reads_only_the_two_views():
    """AD-4: unlocked banks and approved requirements, through their views only."""
    banks_view = migration("ai_question_banks_view")
    banks = view_columns(banks_view, "core.v_ai_question_banks")
    jds = view_columns(migration("ai_views_roles"), "core.v_ai_jd_requirements")
    assert set(re.findall(r"core\.\w+", BANK_SQL)) == {
        "core.v_ai_question_banks",
        "core.v_ai_jd_requirements",
    }
    assert set(re.findall(r"\bb\.(\w+)", BANK_SQL)) <= banks
    assert set(re.findall(r"\br\.(\w+)", BANK_SQL)) <= jds
    assert "WHERE locked_at IS NULL" in banks_view


def test_gd5_limits_follow_d49():
    assert (MAX_ROUNDS, MAX_TOKENS_PER_JOB, MAX_QUESTIONS_PER_CALL) == (12, 600_000, 15)
    assert MAX_ESSAYS_PER_CALL == 5
    assert DUPLICATE_COSINE == 0.9
