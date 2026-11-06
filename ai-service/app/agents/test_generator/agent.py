"""Test Generator: a loop driven by code that fills the question bank of one JD (US-4.1 AC-5 to
AC-10, PRD GĐ5, FR-18, ARCHITECTURE › Pipeline › Test Generator, CONTEXT D49).

1. Read the bank and the JD requirements through core.v_ai_question_banks and
   core.v_ai_jd_requirements; load the bank's drafts and their vectors.
2. Each round: `get_blueprint_coverage()`; stop when no cell is short of 3×. Take the short cells of
   one part, the parts taking turns while both have some; the cells asked for in the fewest rounds
   go first, in blueprint order on a tie. Each asks for what it lacks up to 4×, at most 15 in all.
   So a cell that never fills holds up neither the other cells nor the other part.
3. One `LLMClient.generate` call, effort high: the requirements in `shared`; the cells, the stems
   they hold and the questions refused in the part's round before in `user`.
4. `submit_questions()` checks each question, refuses duplicates and stores the others.
5. Stop at MAX_ROUNDS or once MAX_TOKENS_PER_JOB are spent, with the tokens of earlier attempts of
   the job read from ai.llm_calls: the result lists the cells still short and the job is PARTIAL
   (`questions_status` in app/consumers/kinds.py).

The result carries every draft of the bank, so drafts of an earlier job that failed reach the
backend too. A refusal raises NeedsHumanReview: the job fails, and the drafts stored so far are
kept for the next run. The LLM writes questions only; code picks the cells, checks every question
and counts coverage (AD-2).
"""

import logging
from collections import Counter
from collections.abc import Sequence
from typing import Any

from app.consumers.errors import PermanentError
from app.contracts.generated_question import GeneratedQuestion
from app.contracts.missing_cell import MissingCell
from app.contracts.questions_generate_job import QuestionsGenerateJob
from app.contracts.questions_generate_output import QuestionsGenerateOutput
from app.embedding import Embedder, skill_match_key
from app.llm.client import LLMClient
from app.llm.effort import EFFORT_BY_AGENT
from app.llm.recorder import LlmSpend
from app.prompts.registry import PromptRegistry

from .config import (
    AGENT,
    MAX_ESSAYS_PER_CALL,
    MAX_QUESTIONS_PER_CALL,
    MAX_ROUNDS,
    MAX_TOKENS_PER_JOB,
    PROMPT_STEM_CHARACTERS,
)
from .drafts import Draft, QuestionDraftRepo
from .schemas import QuestionProposalBatch
from .source import BankSource, BankSourceRepo
from .tools import CellCoverage, PartName, Rejection, RejectReason, load_bank_tools

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
"""What the next prompt tells the LLM about a refused question."""


class TestGenerator:
    """The QUESTIONS_GENERATE handler: called with the job, returns the result for ai.results."""

    __test__ = False  # not a pytest class, despite the name

    def __init__(
        self,
        *,
        sources: BankSourceRepo,
        drafts: QuestionDraftRepo,
        embedder: Embedder,
        llm: LLMClient,
        prompts: PromptRegistry,
        spend: LlmSpend,
    ) -> None:
        self._sources = sources
        self._drafts = drafts
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
        tools = await load_bank_tools(
            bank=bank, repo=self._drafts, embedder=self._embedder, job_id=job.job_id
        )
        jd = _jd_for_prompt(bank)
        levels = _levels(bank)
        # A retried job goes on from the drafts stored and the tokens spent so far.
        tokens = await self._spend.tokens_spent(job.job_id)
        if tokens:
            logger.info("job %s: %d tokens spent by earlier attempts", job.job_id, tokens)
        rounds = 0
        part: PartName | None = None
        asked: Counter[CellId] = Counter()
        rejected: dict[PartName, list[Rejection]] = {}
        missing = tools.get_blueprint_coverage()
        while missing and rounds < MAX_ROUNDS and tokens < MAX_TOKENS_PER_JOB:
            part = _round_part(missing, part)
            cells = _round_cells(missing, part, asked)
            prompt = self._prompts.render(
                AGENT,
                {
                    "jd": jd,
                    "cells": [_cell_for_prompt(cell, ask, levels) for cell, ask in cells],
                    "existing": _existing_for_prompt(cell for cell, _ in cells),
                    "rejected": [_rejection_for_prompt(r) for r in rejected.get(part, [])],
                },
            )
            result = await self._llm.generate(
                prompt=prompt,
                output_model=QuestionProposalBatch,
                effort=EFFORT_BY_AGENT[AGENT],
                job_id=job.job_id,
            )
            rounds += 1
            tokens += result.usage.total_tokens
            asked.update(_cell_id(cell) for cell, _ in cells)
            report = await tools.submit_questions(
                result.data.questions, model=result.model, prompt_version=result.prompt_version
            )
            rejected[part] = list(report.rejected)
            logger.info(
                "bank %s round %d: %d asked, %d accepted, %d refused (%s), %d tokens so far",
                bank.bank_id,
                rounds,
                sum(ask for _, ask in cells),
                len(report.accepted),
                len(report.rejected),
                ", ".join(sorted({rejection.reason for rejection in report.rejected})) or "-",
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
        drafts = await self._drafts.drafts(bank.bank_id)
        return QuestionsGenerateOutput(
            bank_id=bank.bank_id,
            questions=[_generated(draft) for draft in drafts],
            missing_cells=[
                MissingCell(
                    type=cell.type,
                    skill=cell.skill,
                    difficulty=cell.difficulty,
                    drafted=cell.drafted,
                    required=cell.required,
                )
                for cell in missing
            ],
            rounds=rounds,
        )


CellId = tuple[str, str, str]
"""(part, skill as the blueprint writes it, difficulty): one cell across the rounds of a job."""


def _cell_id(cell: CellCoverage) -> CellId:
    return (cell.part, cell.skill, cell.difficulty)


def _round_part(missing: Sequence[CellCoverage], last: PartName | None) -> PartName:
    """The part a round asks for: part A first, then the parts take turns while both have short
    cells. A part per round keeps one kind of question per answer."""
    parts = sorted({cell.part for cell in missing})
    if len(parts) > 1 and last in parts:
        return next(part for part in parts if part != last)
    return parts[0]


def _round_cells(
    missing: Sequence[CellCoverage], part: PartName, asked: Counter[CellId]
) -> list[tuple[CellCoverage, int]]:
    """Short cells of `part`, those asked for in the fewest rounds first (blueprint order on a
    tie), each with the questions to ask for: at most MAX_QUESTIONS_PER_CALL in all,
    MAX_ESSAYS_PER_CALL for part B."""
    room = MAX_QUESTIONS_PER_CALL if part == "A" else MAX_ESSAYS_PER_CALL
    short = sorted(
        (cell for cell in missing if cell.part == part), key=lambda c: asked[_cell_id(c)]
    )
    cells = []
    for cell in short:
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


def _existing_for_prompt(cells: Any) -> list[dict[str, str]]:
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


def _rejection_for_prompt(rejection: Rejection) -> dict[str, str]:
    return {
        "stem": rejection.stem[:PROMPT_STEM_CHARACTERS],
        "reason": REASON_TEXT[rejection.reason],
    }


def _generated(draft: Draft) -> GeneratedQuestion:
    return GeneratedQuestion.model_validate(
        {
            **draft.payload,
            "draft_id": draft.draft_id,
            "model": draft.model,
            "prompt_version": draft.prompt_version,
        }
    )
