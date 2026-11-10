"""What the Grader does with an ended batch (US-4.4 AC-4, AC-5, AC-7, CONTEXT D46, D53).

For each pass of the part:
- a valid answer is checked against the rubric of its question (agent.rubric_problem): one grade
  per criterion, in order, within max_points. A grade that does not fit is left to the next round,
  like invalid output; after the last round the pass fails with GRADING_OUT_OF_RANGE. A valid
  grade is published with the model that wrote it;
- a refusal is resent on its own through LLMClient, where Claude has its server-side fallback
  (batches have none). Refused again, the pass fails with `needs_review`. Any other outcome of
  that resend, a grade outside the rubric included, fails the pass: the resend was its last try;
- an invalid, truncated, errored or expired answer is left to the next round (batch_poller.py).

Grades go to ai.results in messages of at most CHUNK_MAX items, `final = false`. `finish` sends
the failed passes in messages of at most CHUNK_MAX too; the last one is `final = true`, and
PARTIAL when the job has any failed pass. The backend stores each pass once, whatever order the
messages are handled in (LESSONS §33).
"""

import logging
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.consumers.batches import BatchRow, Failure
from app.consumers.errors import NeedsHumanReview, PermanentError
from app.consumers.outbox import Outbox
from app.contracts.ai_result_status import AiResultStatus
from app.contracts.essay_grade_failed_item import EssayGradeFailedItem
from app.contracts.essay_grade_item import EssayGradeItem
from app.contracts.essay_grade_job import EssayGradeJob
from app.contracts.essay_grade_output import EssayGradeOutput
from app.contracts.essay_grade_result import EssayGradeResult
from app.contracts.grading_result import GradingResult
from app.llm.batch import BatchAnswer, BatchFailure, BatchOutcome, BatchRefusal, BatchRequest
from app.llm.client import LLMClient
from app.llm.effort import EFFORT_BY_AGENT
from app.llm.types import RenderedPrompt

from .agent import (
    AGENT,
    CHUNK_MAX,
    JOB_TYPE,
    OUT_OF_RANGE,
    CheckedGradingResult,
    failed_item,
    parse_rubric,
    rubric_problem,
)
from .source import EssayAnswerRepo, ref_of

logger = logging.getLogger(__name__)

REFUSED = "LLM_REFUSED"
"""NeedsHumanReview code of a refusal (app/llm/structured.py)."""
SOURCE_MISSING = "SOURCE_MISSING"


@dataclass(frozen=True)
class _Grade:
    grading: GradingResult
    model: str
    resent: bool


class GraderCompletion:
    """The ESSAY_GRADE part of the batch flow (BatchJob of batch_poller.py)."""

    job_type = JOB_TYPE
    output_model = CheckedGradingResult
    effort = EFFORT_BY_AGENT[AGENT]

    def __init__(self, *, sources: EssayAnswerRepo, llm: LLMClient, outbox: Outbox) -> None:
        self._sources = sources
        self._llm = llm
        self._outbox = outbox

    async def complete(
        self,
        row: BatchRow,
        requests: Sequence[BatchRequest],
        outcomes: Mapping[str, BatchOutcome],
    ) -> list[Failure]:
        job = EssayGradeJob.model_validate(row.job_payload)
        prompts = {request.key: request.prompt for request in requests}
        grades: dict[str, _Grade] = {}
        failures: list[Failure] = []
        for key, outcome in outcomes.items():
            if isinstance(outcome, BatchAnswer):
                grades[key] = _Grade(outcome.data, outcome.model, resent=False)
            elif isinstance(outcome, BatchRefusal):
                grade = await self._resend(job, key, prompts[key], failures)
                if grade is not None:
                    grades[key] = grade
            else:
                assert isinstance(outcome, BatchFailure)
                failures.append(Failure(key, outcome.code, retry=outcome.retry))
        items = await self._items(job, grades, failures)
        for start in range(0, len(items), CHUNK_MAX):
            chunk = items[start : start + CHUNK_MAX]
            await self._publish(job, row.prompt_version, AiResultStatus.SUCCEEDED, chunk, [])
        logger.info(
            "job %s: round %d part %d: %d grade(s) published, %d failed",
            job.job_id,
            row.round,
            row.part,
            len(items),
            len(failures),
        )
        return failures

    async def finish(self, row: BatchRow, failures: Sequence[Failure]) -> AiResultStatus:
        job = EssayGradeJob.model_validate(row.job_payload)
        failed = [failed_item(failure) for failure in failures]
        status = AiResultStatus.PARTIAL if failed else AiResultStatus.SUCCEEDED
        chunks = [failed[start : start + CHUNK_MAX] for start in range(0, len(failed), CHUNK_MAX)]
        *earlier, last = chunks or [[]]
        for chunk in earlier:
            await self._publish(job, row.prompt_version, AiResultStatus.SUCCEEDED, [], chunk)
        await self._publish(job, row.prompt_version, status, [], last, final=True)
        return status

    async def _resend(
        self, job: EssayGradeJob, key: str, prompt: RenderedPrompt, failures: list[Failure]
    ) -> _Grade | None:
        try:
            result = await self._llm.generate(
                prompt=prompt,
                output_model=CheckedGradingResult,
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
            # RetryableError or anything unclassified: the pass fails for this job; the backend
            # sends the answer to a human grader.
            logger.warning("job %s: resend of refused pass %s failed: %s", job.job_id, key, error)
            failures.append(Failure(key, "LLM_UNAVAILABLE", retry=False))
            return None
        return _Grade(result.data, result.model, resent=True)

    async def _items(
        self, job: EssayGradeJob, grades: Mapping[str, _Grade], failures: list[Failure]
    ) -> list[EssayGradeItem]:
        refs = {key: ref_of(key) for key in grades}
        rows = {
            (row.session_id, row.question_id): row
            for row in await self._sources.answers({ref.session_id for ref in refs.values()})
        }
        items = []
        for key, grade in grades.items():
            ref = refs[key]
            row = rows.get((ref.session_id, ref.question_id))
            rubric = parse_rubric(row.rubric) if row else None
            if rubric is None:
                # Graded by a human meanwhile: the answer left the view.
                failures.append(Failure(key, SOURCE_MISSING, retry=False))
                continue
            problem = rubric_problem(grade.grading, rubric)
            if problem is not None:
                logger.warning(
                    "job %s: pass %s does not fit the rubric: %s", job.job_id, key, problem
                )
                failures.append(Failure(key, OUT_OF_RANGE, retry=not grade.resent))
                continue
            items.append(
                EssayGradeItem(
                    session_id=ref.session_id,
                    question_id=ref.question_id,
                    pass_no=ref.pass_no,
                    model=grade.model,
                    grading=GradingResult.model_validate(grade.grading.model_dump()),
                )
            )
        return items

    async def _publish(
        self,
        job: EssayGradeJob,
        prompt_version: str,
        status: AiResultStatus,
        items: list[EssayGradeItem],
        failed: list[EssayGradeFailedItem],
        *,
        final: bool = False,
    ) -> None:
        message = EssayGradeResult(
            job_id=job.job_id,
            type="ESSAY_GRADE",
            status=status,
            job=job,
            result=EssayGradeOutput(
                prompt_version=prompt_version, final=final, items=items, failed=failed
            ),
            error=None,
        )
        await self._outbox.publish_result(message, str(job.job_id))
