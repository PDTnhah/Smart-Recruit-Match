"""What the Matching Agent does with an ended batch (US-3.2 AC-8, AC-9, AC-10, CONTEXT D46).

For each pair of the part:
- a valid answer gets its quotes checked against the CV (evidence.py) and is published with the
  model that wrote it;
- a refusal is resent on its own through LLMClient, where Claude has its server-side fallback
  (batches have none). Refused again, the pair gets `needs_review`: staff look at it and later runs
  skip it. Any other outcome of that resend fails the pair for this run;
- an invalid, truncated, errored or expired answer is left to the next round (batch_poller.py).

Answers go to ai.results in messages of at most MATCH_RESULT_CHUNK_MAX items, `final = false`. The
last message is `final = true`, lists every pair left without an assessment, and is PARTIAL when
there is one (AC-9).
"""

import logging
from collections.abc import Mapping, Sequence

from app.consumers.batches import BatchRow, Failure
from app.consumers.errors import NeedsHumanReview, PermanentError
from app.consumers.outbox import Outbox
from app.contracts.ai_result_status import AiResultStatus
from app.contracts.match_assessment import MatchAssessment
from app.contracts.match_assessment_item import MatchAssessmentItem
from app.contracts.match_run_job import MatchRunJob
from app.contracts.match_run_output import MatchRunOutput
from app.contracts.match_run_result import MatchRunResult
from app.llm.batch import BatchAnswer, BatchFailure, BatchOutcome, BatchRefusal, BatchRequest
from app.llm.client import LLMClient
from app.llm.effort import EFFORT_BY_AGENT

from .agent import AGENT, JOB_TYPE, CheckedMatchAssessment, failed_pair
from .evidence import check_evidence, evidence_source
from .source import MatchSourceRepo, pair_of

logger = logging.getLogger(__name__)

MATCH_RESULT_CHUNK_MAX = 500
"""packages/shared/contracts/envelope.ts › MATCH_RESULT_CHUNK_MAX."""
REFUSED = "LLM_REFUSED"
"""NeedsHumanReview code of a refusal (app/llm/structured.py)."""


class MatchCompletion:
    """The MATCH part of the batch flow (BatchJob of batch_poller.py)."""

    job_type = JOB_TYPE
    output_model = CheckedMatchAssessment
    effort = EFFORT_BY_AGENT[AGENT]

    def __init__(self, *, sources: MatchSourceRepo, llm: LLMClient, outbox: Outbox) -> None:
        self._sources = sources
        self._llm = llm
        self._outbox = outbox

    async def complete(
        self,
        row: BatchRow,
        requests: Sequence[BatchRequest],
        outcomes: Mapping[str, BatchOutcome],
    ) -> list[Failure]:
        job = MatchRunJob.model_validate(row.job_payload)
        prompts = {request.key: request.prompt for request in requests}
        answers: dict[str, tuple[MatchAssessment, str]] = {}
        failures: list[Failure] = []
        for key, outcome in outcomes.items():
            if isinstance(outcome, BatchAnswer):
                answers[key] = (outcome.data, outcome.model)
            elif isinstance(outcome, BatchRefusal):
                answer = await self._resend(job, key, prompts[key], failures)
                if answer is not None:
                    answers[key] = answer
            else:
                assert isinstance(outcome, BatchFailure)
                failures.append(Failure(key, outcome.code, retry=outcome.retry))
        items = await self._items(answers, failures)
        for start in range(0, len(items), MATCH_RESULT_CHUNK_MAX):
            chunk = items[start : start + MATCH_RESULT_CHUNK_MAX]
            await self._publish(job, row.prompt_version, AiResultStatus.SUCCEEDED, chunk, [])
        logger.info(
            "job %s: round %d part %d: %d assessment(s) published, %d failed",
            job.job_id,
            row.round,
            row.part,
            len(items),
            len(failures),
        )
        return failures

    async def finish(self, row: BatchRow, failures: Sequence[Failure]) -> AiResultStatus:
        job = MatchRunJob.model_validate(row.job_payload)
        status = AiResultStatus.PARTIAL if failures else AiResultStatus.SUCCEEDED
        await self._publish(
            job, row.prompt_version, status, [], [failed_pair(f) for f in failures], final=True
        )
        return status

    async def _resend(
        self, job: MatchRunJob, key: str, prompt, failures: list[Failure]
    ) -> tuple[MatchAssessment, str] | None:
        try:
            result = await self._llm.generate(
                prompt=prompt,
                output_model=CheckedMatchAssessment,
                effort=self.effort,
                job_id=job.job_id,
            )
        except NeedsHumanReview as error:
            refused = error.code == REFUSED
            code = "LLM_REFUSAL" if refused else error.code
            failures.append(Failure(key, code, retry=False, needs_review=refused))
            return None
        except PermanentError as error:
            failures.append(Failure(key, error.code, retry=False))
            return None
        except Exception as error:
            # RetryableError or anything unclassified: this run goes on without the pair; the next
            # run sends it again.
            logger.warning("job %s: resend of refused pair %s failed: %s", job.job_id, key, error)
            failures.append(Failure(key, "LLM_UNAVAILABLE", retry=False))
            return None
        return result.data, result.model

    async def _items(
        self, answers: Mapping[str, tuple[MatchAssessment, str]], failures: list[Failure]
    ) -> list[MatchAssessmentItem]:
        cvs = await self._sources.cvs(pair_of(key).cv_id for key in answers)
        sources: dict[int, str] = {}
        items = []
        for key, (assessment, model) in answers.items():
            pair = pair_of(key)
            cv = cvs.get(pair.cv_id)
            if cv is None or cv.version != pair.cv_version:
                failures.append(Failure(key, "SOURCE_MISSING", retry=False))
                continue
            if cv.cv_id not in sources:
                sources[cv.cv_id] = evidence_source(cv.masked_text, cv.profile_masked)
            quotes = [quote.root for quote in assessment.project_relevance.evidence]
            items.append(
                MatchAssessmentItem(
                    **pair.model_dump(),
                    model=model,
                    assessment=MatchAssessment.model_validate(assessment.model_dump()),
                    evidence_check=check_evidence(quotes, sources[cv.cv_id]),
                )
            )
        return items

    async def _publish(
        self,
        job: MatchRunJob,
        prompt_version: str,
        status: AiResultStatus,
        items: list[MatchAssessmentItem],
        failed: list,
        *,
        final: bool = False,
    ) -> None:
        message = MatchRunResult(
            job_id=job.job_id,
            type="MATCH",
            status=status,
            job=job,
            result=MatchRunOutput(
                prompt_version=prompt_version, final=final, items=items, failed_pairs=failed
            ),
            error=None,
        )
        await self._outbox.publish_result(message, str(job.job_id))
