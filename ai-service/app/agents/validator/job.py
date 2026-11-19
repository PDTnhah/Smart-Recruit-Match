"""QUESTIONS_VALIDATE: the Validator on the drafts CENTER sends it (US-4.10 AC-2, AC-3, D60).

CENTER presses "Kiểm câu bằng AI"; the backend lists the DRAFT questions of the bank's cells by
draft id, so this job never reads the state of core.questions (AD-4). The drafts come from
ai.question_drafts, and those of another bank are left unchecked.

1. Drafts with a verdict in ai.question_validations are not sent again: a retried attempt, or an
   earlier AI check whose result was lost, already decided them.
2. `batches` groups the others, MCQ first, and `Validator.check` sends each group in one call, as
   in D50: no answer in the request, effort high, a refusal sent again one draft at a time, invalid
   output split in halves, `verdict.py` deciding.
3. Drafts still without a verdict are grouped and sent again, MAX_CHECKS_PER_DRAFT times in all, so
   a group that fails for its own content is not sent unchanged (LESSONS §37).
4. No call starts once the job has spent MAX_TOKENS_PER_JOB, its earlier attempts included.

The job writes no draft and asks for none: CENTER presses "Sinh câu còn thiếu" when a cell is short
after the check. The result carries the verdict of every draft of the job that has one and lists
the others; it is PARTIAL when some are left (`validate_status` in app/consumers/kinds.py).
"""

import logging
from collections.abc import Sequence
from typing import Protocol

from app.contracts.question_verdict import QuestionVerdict
from app.contracts.questions_validate_job import QuestionsValidateJob
from app.contracts.questions_validate_output import QuestionsValidateOutput
from app.llm.recorder import LlmSpend

from .agent import Validator, batches
from .config import MAX_CHECKS_PER_DRAFT, MAX_TOKENS_PER_JOB
from .request import QuestionDraft

logger = logging.getLogger(__name__)


class DraftSource(Protocol):
    async def drafts(self, bank_id: int) -> Sequence[QuestionDraft]:
        """Every draft of the bank, oldest first (test_generator.QuestionDraftRepo)."""
        ...


class BankValidator:
    """The QUESTIONS_VALIDATE handler: called with the job, returns the result for ai.results."""

    def __init__(self, *, drafts: DraftSource, validator: Validator, spend: LlmSpend) -> None:
        self._drafts = drafts
        self._validator = validator
        self._spend = spend

    async def __call__(self, job: QuestionsValidateJob) -> QuestionsValidateOutput:
        wanted = list(dict.fromkeys(draft_id.root for draft_id in job.draft_ids))
        of_bank = {draft.draft_id: draft for draft in await self._drafts.drafts(job.bank_id)}
        unknown = [draft_id for draft_id in wanted if draft_id not in of_bank]
        if unknown:
            logger.warning(
                "job %s: %d draft(s) not of bank %s: %s",
                job.job_id,
                len(unknown),
                job.bank_id,
                unknown[:10],
            )
        stored = await self._validator.stored(job.bank_id)
        waiting = [of_bank[i] for i in wanted if i in of_bank and i not in stored]
        if len(waiting) < len(wanted) - len(unknown):
            logger.info(
                "job %s: %d draft(s) already have a verdict",
                job.job_id,
                len(wanted) - len(unknown) - len(waiting),
            )

        async def within_budget() -> bool:
            return await self._spend.tokens_spent(job.job_id) < MAX_TOKENS_PER_JOB

        checked = 0
        for _ in range(MAX_CHECKS_PER_DRAFT):
            if not waiting:
                break
            for group in batches(waiting):
                if not await within_budget():
                    break
                found = await self._validator.check(
                    group, job_id=job.job_id, within_budget=within_budget
                )
                stored.update((verdict.draft_id, verdict.validation) for verdict in found)
                checked += len(found)
            waiting = [draft for draft in waiting if draft.draft_id not in stored]
            if not await within_budget():
                break

        # The rows as stored: a draft another attempt checked first keeps that verdict.
        final = await self._validator.stored(job.bank_id)
        verdicts = [
            QuestionVerdict(draft_id=draft_id, validation=final[draft_id])
            for draft_id in wanted
            if draft_id in final
        ]
        unchecked = [draft_id for draft_id in wanted if draft_id not in final]
        logger.info(
            "job %s: bank %s, %d checked now, %d with a verdict, %d left unchecked; %d tokens",
            job.job_id,
            job.bank_id,
            checked,
            len(verdicts),
            len(unchecked),
            await self._spend.tokens_spent(job.job_id),
        )
        return QuestionsValidateOutput.model_validate(
            {
                "bank_id": job.bank_id,
                "verdicts": [verdict.model_dump(mode="json") for verdict in verdicts],
                "unchecked": unchecked,
            }
        )
