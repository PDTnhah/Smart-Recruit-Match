"""Validator: checks draft questions in a context of their own, without their answers (US-4.2 AC-1
to AC-3, PRD GĐ5 step 2, ARCHITECTURE › Pipeline › Validator, CONTEXT D50).

The Test Generator calls it within the QUESTIONS_GENERATE job: the drafts each round stores, and
before the first round the drafts of earlier runs that wait for a verdict. `batches` groups them by
type, at most MAX_MCQ_PER_CALL multiple-choice questions or MAX_ESSAYS_PER_CALL essays a call.
`check` sends one group in one `LLMClient.generate` call, effort high, with prompt validator/vN:
a call of its own, so it carries nothing the Generator wrote but the questions. Code then decides
each verdict (`verdict.py`) and stores it in ai.question_validations.

- A refused group is sent again one question at a time; a question still refused alone is rejected
  with VALIDATOR_REFUSAL, unread.
- Output that stays invalid after the LLMClient's retries (cut at max_output_tokens, say) splits the
  group in two halves, each sent again; a question still invalid alone gets no verdict and waits.
  The job goes on.
- No call starts once `within_budget` says no: the questions not sent wait.
"""

import logging
from collections.abc import Awaitable, Callable, Sequence
from uuid import UUID

from app.consumers.errors import NeedsHumanReview
from app.contracts.question_validation import QuestionValidation
from app.llm.client import LLMClient
from app.llm.effort import EFFORT_BY_AGENT
from app.prompts.registry import PromptRegistry

from .config import AGENT, MAX_ESSAYS_PER_CALL, MAX_MCQ_PER_CALL
from .repo import QuestionValidationRepo
from .request import QuestionDraft, request_items
from .schemas import ValidationBatch
from .verdict import Verdict, decide, refused

logger = logging.getLogger(__name__)

Budget = Callable[[], Awaitable[bool]]
"""Whether one more call may start: the Test Generator passes one that reads MAX_TOKENS_PER_JOB."""


async def _unlimited() -> bool:
    return True


def batches[D: QuestionDraft](drafts: Sequence[D]) -> list[list[D]]:
    """The drafts in groups of one type, multiple choice first, each in the order given."""
    groups = []
    for kind, size in (("MCQ", MAX_MCQ_PER_CALL), ("ESSAY", MAX_ESSAYS_PER_CALL)):
        of_kind = [draft for draft in drafts if draft.type == kind]
        groups.extend(of_kind[start : start + size] for start in range(0, len(of_kind), size))
    return groups


class Validator:
    def __init__(
        self, *, llm: LLMClient, prompts: PromptRegistry, repo: QuestionValidationRepo
    ) -> None:
        self._llm = llm
        self._prompts = prompts
        self._repo = repo

    async def stored(self, bank_id: int) -> dict[int, QuestionValidation]:
        """Draft id → verdict of the bank's drafts checked by earlier jobs or attempts."""
        return await self._repo.validations(bank_id)

    async def check(
        self,
        drafts: Sequence[QuestionDraft],
        *,
        job_id: UUID,
        within_budget: Budget = _unlimited,
    ) -> list[Verdict]:
        """Checks one group from `batches` and stores the verdicts; drafts without one wait.
        `within_budget` is asked before each call that sends part of a group again."""
        verdicts = await self._judge(drafts, job_id, within_budget)
        await self._repo.insert(job_id, verdicts)
        return verdicts

    async def _judge(
        self, drafts: Sequence[QuestionDraft], job_id: UUID, within_budget: Budget
    ) -> list[Verdict]:
        prompt = self._prompts.render(AGENT, {"questions": request_items(drafts)})
        try:
            result = await self._llm.generate(
                prompt=prompt,
                output_model=ValidationBatch,
                effort=EFFORT_BY_AGENT[AGENT],
                job_id=job_id,
            )
        except NeedsHumanReview as error:
            if error.code not in ("LLM_INVALID_OUTPUT", "LLM_REFUSED"):
                raise
            invalid = error.code == "LLM_INVALID_OUTPUT"
            if len(drafts) > 1:
                half = (len(drafts) + 1) // 2
                parts = [drafts[:half], drafts[half:]] if invalid else [[d] for d in drafts]
                logger.warning(
                    "job %s: %s for %d draft(s) together; checking them in %d part(s)",
                    job_id,
                    "no valid output" if invalid else "the model refused",
                    len(drafts),
                    len(parts),
                )
                verdicts: list[Verdict] = []
                for part in parts:
                    if not await within_budget():
                        break
                    verdicts.extend(await self._judge(part, job_id, within_budget))
                return verdicts
            if invalid:
                logger.warning(
                    "job %s: no valid check of draft %s; it waits", job_id, drafts[0].draft_id
                )
                return []
            logger.warning(
                "job %s: the model refused draft %s (%s)",
                job_id,
                drafts[0].draft_id,
                error.category,
            )
            return [
                refused(
                    drafts[0].draft_id,
                    model=error.model or "unknown",
                    prompt_version=prompt.prompt_version,
                    category=error.category,
                )
            ]
        verdicts = decide(
            drafts, result.data.results, model=result.model, prompt_version=result.prompt_version
        )
        if len(verdicts) < len(drafts):
            logger.warning(
                "job %s: %d of %d draft(s) got no usable result; they wait for the next round",
                job_id,
                len(drafts) - len(verdicts),
                len(drafts),
            )
        return verdicts
