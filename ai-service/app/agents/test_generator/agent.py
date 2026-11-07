"""Test Generator: a loop driven by code that fills the question bank of one JD (US-4.1 AC-5 to
AC-10, US-4.2 AC-4, PRD GĐ5, FR-18, ARCHITECTURE › Pipeline › Test Generator, CONTEXT D49, D50).

1. Read the bank and the JD requirements through core.v_ai_question_banks and
   core.v_ai_jd_requirements; load the bank's drafts, their vectors and the Validator's verdicts.
2. The drafts of the short cells still waiting for a verdict go to the Validator first: those of a
   run before the Validator existed, or of an attempt that stopped between two steps. A cell sends
   only what could take it to 4×, oldest first; the others wait until it needs them.
3. Each round: `get_blueprint_coverage()`; stop when no cell is short of 3× VALIDATED drafts. Take
   the short cells of one part, the parts taking turns while both have some; the cells asked for in
   the fewest rounds go first, in blueprint order on a tie. Each asks for what it lacks up to 4×,
   the drafts waiting for a verdict counted in, at most 15 in all. So a cell that never fills holds
   up neither the other cells nor the other part.
4. One `LLMClient.generate` call, effort high: the requirements in `shared`; the cells, the stems
   they hold, those the Validator rejected with the reasons, and the questions code refused in the
   part's round before in `user`.
5. `submit_questions()` checks each question, refuses duplicates and stores the others.
6. The Validator checks the drafts the round stored, and any still waiting (app/agents/validator).
   A round whose short cells only lack verdicts skips step 4 and 5. A draft sent
   MAX_CHECKS_PER_DRAFT times without a verdict is given up for the job: its cell asks for another.
7. Stop at MAX_ROUNDS, or once MAX_TOKENS_PER_JOB are spent: no LLM call starts past it. The tokens
   of the Validator and of earlier attempts of the job count, read from ai.llm_calls. The result
   lists the cells still short and the job is PARTIAL (`questions_status` in
   app/consumers/kinds.py).

The result carries every draft of the bank with its verdict, or none while it waits, so drafts of
an earlier job that failed reach the backend too. A refusal of the Generator raises
NeedsHumanReview: the job fails, and the drafts and verdicts stored so far are kept for the next
run. The LLM writes and checks questions only; code picks the cells, checks every question, decides
every verdict and counts coverage (AD-2).
"""

import logging
from collections import Counter
from collections.abc import Iterable, MutableMapping, Sequence
from typing import Any
from uuid import UUID

from app.agents.validator import Validator, Verdict, batches
from app.consumers.errors import PermanentError
from app.contracts.generated_question import GeneratedQuestion
from app.contracts.missing_cell import MissingCell
from app.contracts.question_validation import QuestionValidation, Reason, Status
from app.contracts.questions_generate_job import QuestionsGenerateJob
from app.contracts.questions_generate_output import QuestionsGenerateOutput
from app.embedding import Embedder, skill_match_key
from app.llm.client import LLMClient
from app.llm.effort import EFFORT_BY_AGENT
from app.llm.recorder import LlmSpend
from app.prompts.registry import PromptRegistry

from .config import (
    AGENT,
    MAX_CHECKS_PER_DRAFT,
    MAX_ESSAYS_PER_CALL,
    MAX_QUESTIONS_PER_CALL,
    MAX_ROUNDS,
    MAX_TOKENS_PER_JOB,
    PROMPT_STEM_CHARACTERS,
)
from .drafts import Draft, QuestionDraftRepo
from .schemas import QuestionProposalBatch
from .source import BankSource, BankSourceRepo
from .tools import (
    CellCoverage,
    CellKey,
    PartName,
    Rejection,
    RejectReason,
    load_bank_tools,
)

logger = logging.getLogger(__name__)

SKILL_GROUPS = ("must_have", "nice_to_have")
REASON_TEXT: dict[RejectReason, str] = {
    RejectReason.UNKNOWN_CELL: "type, skill and difficulty match no cell of the request",
    RejectReason.INVALID_STEM: "the stem is empty",
    RejectReason.INVALID_MCQ_OPTIONS: "an MCQ needs exactly 4 different, non-empty options",
    RejectReason.NOT_ONE_CORRECT: "an MCQ needs exactly one correct option",
    RejectReason.MISSING_EXPLANATION: "the explanation is empty",
    RejectReason.INVALID_RUBRIC: "an essay needs 1 to 10 criteria, each worth 1 to 100 points",
    RejectReason.MISSING_SAMPLE_ANSWER: "an essay needs a sample answer",
    RejectReason.TEXT_TOO_LONG: "a text is longer than allowed",
    RejectReason.CELL_FULL: "the cell already has enough questions",
    RejectReason.BANK_FULL: "the bank already has enough questions",
    RejectReason.DUPLICATE: "it repeats an existing question or another one of the answer",
}
"""What the next prompt tells the LLM about a question code refused."""
VERDICT_TEXT: dict[Reason, str] = {
    Reason.ANSWER_MISMATCH: "solving it, the reviewer did not reach the option marked correct",
    Reason.MULTIPLE_CORRECT: "the reviewer found more than one correct option",
    Reason.OFF_SKILL: "it does not test the skill of its cell",
    Reason.ANSWER_LEAKED: "the stem or the options give the answer away",
    Reason.WEAK_DISTRACTORS: "a wrong option is not a mistake a student would make",
    Reason.UNCLEAR: "it is ambiguous, or lacks what is needed to answer it",
    Reason.RUBRIC_MISMATCH: "the rubric criteria do not fit what the task asks",
    Reason.DIFFICULTY_MISMATCH: "its difficulty is two levels away from its cell's",
    Reason.DUPLICATE: "it asks the same as another question checked with it",
    Reason.VALIDATOR_REFUSAL: "the reviewer refused to read it",
}
"""What the next prompt tells the LLM about a question the Validator rejected."""


class TestGenerator:
    """The QUESTIONS_GENERATE handler: called with the job, returns the result for ai.results."""

    __test__ = False  # not a pytest class, despite the name

    def __init__(
        self,
        *,
        sources: BankSourceRepo,
        drafts: QuestionDraftRepo,
        validator: Validator,
        embedder: Embedder,
        llm: LLMClient,
        prompts: PromptRegistry,
        spend: LlmSpend,
    ) -> None:
        self._sources = sources
        self._drafts = drafts
        self._validator = validator
        self._embedder = embedder
        self._llm = llm
        self._prompts = prompts
        self._spend = spend

    async def __call__(self, job: QuestionsGenerateJob) -> QuestionsGenerateOutput:
        bank = await self._sources.fetch(job.bank_id)
        if bank is None:
            raise PermanentError(
                f"bank {job.bank_id} is locked, gone, or its JD is no longer approved",
                code="QUESTION_BANK_NOT_FOUND",
            )
        if bank.requirements_version != bank.jd_version:
            logger.warning(
                "bank %s: blueprint from requirements v%s, the JD has v%s now (US-4.2)",
                bank.bank_id,
                bank.jd_version,
                bank.requirements_version,
            )
        drafts = list(await self._drafts.drafts(bank.bank_id))
        verdicts = await self._validator.stored(bank.bank_id)
        checks = _Checks(verdicts)
        tools = await load_bank_tools(
            bank=bank,
            drafts=drafts,
            verdicts=verdicts,
            repo=self._drafts,
            embedder=self._embedder,
            job_id=job.job_id,
            unchecked=checks.given_up,
        )
        jd = _jd_for_prompt(bank)
        levels = _levels(bank)
        # A retried job goes on from the drafts stored and the tokens spent so far.
        tokens = await self._spend.tokens_spent(job.job_id)
        if tokens:
            logger.info("job %s: %d tokens spent by earlier attempts", job.job_id, tokens)
        tokens, checked = await self._check(
            drafts, tools.get_blueprint_coverage(), checks, job.job_id, tokens
        )
        if checked:
            logger.info(
                "bank %s: %d waiting draft(s) checked before the first round: %s",
                bank.bank_id,
                len(checked),
                _verdict_summary(checked),
            )
        rounds = 0
        part: PartName | None = None
        asked: Counter[CellId] = Counter()
        refused: dict[PartName, list[Rejection]] = {}
        missing = tools.get_blueprint_coverage()
        while missing and rounds < MAX_ROUNDS and tokens < MAX_TOKENS_PER_JOB:
            rounds += 1
            short = [cell for cell in missing if cell.wanted > 0]
            stored = "no question asked: the short cells wait for verdicts"
            if short:
                part = _round_part(short, part)
                cells = _round_cells(short, part, asked)
                round_cells = [cell for cell, _ in cells]
                prompt = self._prompts.render(
                    AGENT,
                    {
                        "jd": jd,
                        "cells": [_cell_for_prompt(cell, ask, levels) for cell, ask in cells],
                        "existing": _existing_for_prompt(round_cells),
                        "rejected": _failed_for_prompt(round_cells),
                        "refused": [_refusal_for_prompt(r) for r in refused.get(part, [])],
                    },
                )
                result = await self._llm.generate(
                    prompt=prompt,
                    output_model=QuestionProposalBatch,
                    effort=EFFORT_BY_AGENT[AGENT],
                    job_id=job.job_id,
                )
                asked.update(_cell_id(cell) for cell in round_cells)
                report = await tools.submit_questions(
                    result.data.questions, model=result.model, prompt_version=result.prompt_version
                )
                refused[part] = list(report.rejected)
                drafts.extend(report.drafts)
                tokens = await self._spend.tokens_spent(job.job_id)
                reasons = ", ".join(sorted({r.reason for r in report.rejected})) or "-"
                stored = (
                    f"{sum(ask for _, ask in cells)} asked, {len(report.accepted)} stored, "
                    f"{len(report.rejected)} refused ({reasons})"
                )
            tokens, checked = await self._check(
                drafts, tools.get_blueprint_coverage(), checks, job.job_id, tokens
            )
            logger.info(
                "bank %s round %d: %s; %d checked: %s; %d tokens so far",
                bank.bank_id,
                rounds,
                stored,
                len(checked),
                _verdict_summary(checked),
                tokens,
            )
            missing = tools.get_blueprint_coverage()
        if missing:
            logger.warning(
                "bank %s: %d cell(s) still short after %d round(s) and %d tokens",
                bank.bank_id,
                len(missing),
                rounds,
                tokens,
            )
        # The rows as stored: a draft another attempt checked first keeps that verdict.
        final = await self._validator.stored(bank.bank_id)
        return QuestionsGenerateOutput(
            bank_id=bank.bank_id,
            questions=[
                _generated(draft, final.get(draft.draft_id))
                for draft in await self._drafts.drafts(bank.bank_id)
            ],
            missing_cells=[
                MissingCell(
                    type=cell.type,
                    skill=cell.skill,
                    difficulty=cell.difficulty,
                    drafted=cell.drafted,
                    validated=cell.validated,
                    required=cell.required,
                )
                for cell in missing
            ],
            rounds=rounds,
        )

    async def _check(
        self,
        drafts: Sequence[Draft],
        short: Sequence[CellCoverage],
        checks: "_Checks",
        job_id: UUID,
        tokens: int,
    ) -> tuple[int, list[Verdict]]:
        """Sends the waiting drafts of the short cells to the Validator, a group a call, while the
        budget lasts; each cell sends what could take it to 4×, oldest first. Drafts of a full cell,
        or of a cell no longer in the blueprint, are not sent: no exam needs them. Returns the
        tokens spent."""
        of_cell: dict[CellKey, list[Draft]] = {}
        for draft in drafts:
            if checks.waiting(draft.draft_id):
                of_cell.setdefault((draft.type, draft.skill_key, draft.difficulty), []).append(
                    draft
                )
        waiting = [
            draft for cell in short for draft in of_cell.get(cell.key, [])[: cell.worth_checking]
        ]

        async def within_budget() -> bool:
            return await self._spend.tokens_spent(job_id) < MAX_TOKENS_PER_JOB

        checked: list[Verdict] = []
        for group in batches(waiting):
            if tokens >= MAX_TOKENS_PER_JOB:
                break
            found = await self._validator.check(group, job_id=job_id, within_budget=within_budget)
            checks.record(group, found)
            checked.extend(found)
            tokens = await self._spend.tokens_spent(job_id)
        return tokens, checked


class _Checks:
    """The verdicts of the job's drafts, and how many times the job sent each one still without a
    verdict (MAX_CHECKS_PER_DRAFT)."""

    def __init__(self, verdicts: MutableMapping[int, QuestionValidation]) -> None:
        self.verdicts = verdicts
        self.given_up: set[int] = set()
        self._sent: Counter[int] = Counter()

    def waiting(self, draft_id: int) -> bool:
        return draft_id not in self.verdicts and draft_id not in self.given_up

    def record(self, group: Sequence[Draft], found: Sequence[Verdict]) -> None:
        self.verdicts.update((verdict.draft_id, verdict.validation) for verdict in found)
        for draft in group:
            if draft.draft_id in self.verdicts:
                continue
            self._sent[draft.draft_id] += 1
            if self._sent[draft.draft_id] >= MAX_CHECKS_PER_DRAFT:
                self.given_up.add(draft.draft_id)


CellId = tuple[str, str, str]
"""(part, skill as the blueprint writes it, difficulty): one cell across the rounds of a job."""


def _cell_id(cell: CellCoverage) -> CellId:
    return (cell.part, cell.skill, cell.difficulty)


def _round_part(short: Sequence[CellCoverage], last: PartName | None) -> PartName:
    """The part a round asks for: part A first, then the parts take turns while both have short
    cells. A part per round keeps one kind of question per answer."""
    parts = sorted({cell.part for cell in short})
    if len(parts) > 1 and last in parts:
        return next(part for part in parts if part != last)
    return parts[0]


def _round_cells(
    short: Sequence[CellCoverage], part: PartName, asked: Counter[CellId]
) -> list[tuple[CellCoverage, int]]:
    """Short cells of `part`, those asked for in the fewest rounds first (blueprint order on a
    tie), each with the questions to ask for: at most MAX_QUESTIONS_PER_CALL in all,
    MAX_ESSAYS_PER_CALL for part B."""
    room = MAX_QUESTIONS_PER_CALL if part == "A" else MAX_ESSAYS_PER_CALL
    of_part = sorted(
        (cell for cell in short if cell.part == part), key=lambda c: asked[_cell_id(c)]
    )
    cells = []
    for cell in of_part:
        if room == 0:
            break
        ask = min(cell.wanted, room)
        cells.append((cell, ask))
        room -= ask
    return cells


def _jd_for_prompt(bank: BankSource) -> dict[str, Any]:
    """The skills of the requirements: the questions test them. Hard conditions play no part."""
    requirements = bank.requirements
    return {
        "position_group": bank.position_group,
        **{group: requirements.get(group, []) for group in SKILL_GROUPS},
    }


def _levels(bank: BankSource) -> dict[str, str]:
    """Skill key → level the requirements ask; the must-have level wins over the other."""
    levels: dict[str, str] = {}
    for group in reversed(SKILL_GROUPS):
        for item in bank.requirements.get(group, []):
            levels[skill_match_key(item["skill"])] = item["level"]
    return levels


def _cell_for_prompt(cell: CellCoverage, ask: int, levels: dict[str, str]) -> dict[str, Any]:
    return {
        "type": cell.type,
        "skill": cell.skill,
        "difficulty": cell.difficulty,
        "level": levels.get(skill_match_key(cell.skill)),
        "questions_to_write": ask,
    }


def _existing_for_prompt(cells: Iterable[CellCoverage]) -> list[dict[str, str]]:
    return [
        {
            "type": cell.type,
            "skill": cell.skill,
            "difficulty": cell.difficulty,
            "stem": stem[:PROMPT_STEM_CHARACTERS],
        }
        for cell in cells
        for stem in cell.stems
    ]


def _failed_for_prompt(cells: Iterable[CellCoverage]) -> list[dict[str, Any]]:
    return [
        {
            "type": cell.type,
            "skill": cell.skill,
            "difficulty": cell.difficulty,
            "stem": failed.stem[:PROMPT_STEM_CHARACTERS],
            "reasons": [VERDICT_TEXT[Reason(reason)] for reason in failed.reasons],
        }
        for cell in cells
        for failed in cell.rejected
    ]


def _refusal_for_prompt(rejection: Rejection) -> dict[str, str]:
    return {
        "stem": rejection.stem[:PROMPT_STEM_CHARACTERS],
        "reason": REASON_TEXT[rejection.reason],
    }


def _verdict_summary(verdicts: Sequence[Verdict]) -> str:
    rejected = [v.validation for v in verdicts if v.validation.status is Status.REJECTED]
    reasons = Counter(reason.value for validation in rejected for reason in validation.reasons)
    counted = ", ".join(f"{reason} ×{n}" for reason, n in sorted(reasons.items())) or "-"
    return f"{len(verdicts) - len(rejected)} validated, {len(rejected)} rejected ({counted})"


def _generated(draft: Draft, validation: QuestionValidation | None) -> GeneratedQuestion:
    return GeneratedQuestion.model_validate(
        {
            **draft.payload,
            "draft_id": draft.draft_id,
            "model": draft.model,
            "prompt_version": draft.prompt_version,
            "validation": None if validation is None else validation.model_dump(mode="json"),
        }
    )
