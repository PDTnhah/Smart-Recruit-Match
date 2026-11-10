"""Grader: grades each answered essay twice, criterion by criterion, through the provider's batch
(US-4.4, PRD GĐ6, FR-22, AD-2, AD-12, CONTEXT D46, D53).

The ESSAY_GRADE handler:

1. reads the answers of the job's sessions through core.v_ai_essay_answers (AC-3, BR-03);
2. renders two prompts per answer with the pinned version, or the active one for a first job:
   instructions in `system`, the question, rubric and sample answer in `shared` (cached across the
   answers to one question), the answer inside `untrusted("bai_lam")` and the pass number in
   `user`, so the two passes are separate requests (Invariant 6);
3. sorts the requests by question, then session, so requests sharing a question are neighbours;
4. hands them to the BatchCoordinator and returns DEFERRED: the poller publishes the grades
   (completion.py). A redelivered job finds its batches and submits nothing.

The LLM never returns the points of an answer or decides anything (AD-2): the backend adds the
criterion points, compares the two passes and decides which answers go to a human grader.
"""

import logging
from collections.abc import Sequence
from typing import Self

from pydantic import ConfigDict, ValidationError, model_validator

from app.consumers.base import DEFERRED, Deferred
from app.consumers.batch_poller import BatchCoordinator
from app.consumers.batches import Failure
from app.consumers.errors import PermanentError
from app.contracts.essay_grade_failed_item import EssayGradeFailedItem
from app.contracts.essay_grade_job import EssayGradeJob
from app.contracts.essay_grade_output import EssayGradeOutput
from app.contracts.grading_result import GradingResult
from app.contracts.rubric_criterion import RubricCriterion
from app.llm.batch import BatchRequest
from app.llm.types import RenderedPrompt
from app.prompts.registry import PromptRegistry

from .source import AnswerRow, EssayAnswerRepo, answer_key, ref_of

logger = logging.getLogger(__name__)

AGENT = "grader"
JOB_TYPE = "ESSAY_GRADE"
PASSES = (1, 2)
"""packages/shared/contracts/essay-grade.ts › ESSAY_GRADE_PASSES."""
CHUNK_MAX = 500
"""packages/shared/contracts/essay-grade.ts › ESSAY_GRADE_CHUNK_MAX: items, and failed passes,
per message."""
SOURCE_INVALID = "SOURCE_INVALID"
OUT_OF_RANGE = "GRADING_OUT_OF_RANGE"


class CheckedGradingResult(GradingResult):
    """The generated contract plus what Zod checks and JSON Schema cannot carry: every reason is
    trimmed before its length is checked (`.trim().min(1)`). A blank one is invalid output, sent
    again like any other, instead of a message the backend refuses."""

    # The schema sent to the LLM keeps the contract's description, not this docstring.
    model_config = ConfigDict(
        title="GradingResult",
        json_schema_extra={
            "description": "The Grader's grade of one essay answer, criterion by criterion"
        },
    )

    @model_validator(mode="after")
    def _as_zod_reads_it(self) -> Self:
        if any(not criterion.reason.strip() for criterion in self.criteria):
            raise ValueError("every criterion needs a reason")
        return self


def parse_rubric(value: object) -> list[RubricCriterion] | None:
    """The stored rubric, or None when it is not a list of criteria."""
    if not isinstance(value, list) or not value:
        return None
    try:
        return [RubricCriterion.model_validate(item) for item in value]
    except ValidationError:
        return None


def rubric_problem(grading: GradingResult, rubric: Sequence[RubricCriterion]) -> str | None:
    """Why a grade does not fit its rubric, or None. A grade has one criterion per rubric line, in
    rubric order, each within its max_points (US-4.4 AC-4). Schema validation cannot say this, as
    the bounds differ per question."""
    indexes = [criterion.index for criterion in grading.criteria]
    if indexes != list(range(len(rubric))):
        return f"criteria {indexes} do not follow the {len(rubric)} rubric criteria"
    for criterion in grading.criteria:
        most = rubric[criterion.index].max_points
        if criterion.points > most:
            return f"criterion {criterion.index}: {criterion.points} points of at most {most}"
    return None


def failed_item(failure: Failure) -> EssayGradeFailedItem:
    ref = ref_of(failure.key)
    return EssayGradeFailedItem(
        session_id=ref.session_id,
        question_id=ref.question_id,
        pass_no=ref.pass_no,
        code=failure.code[:50],
        needs_review=failure.needs_review,
    )


class EssayGrader:
    """The ESSAY_GRADE handler: called with the job, returns DEFERRED once its batches are
    submitted."""

    def __init__(
        self, *, sources: EssayAnswerRepo, prompts: PromptRegistry, batches: BatchCoordinator
    ) -> None:
        self._sources = sources
        self._prompts = prompts
        self._batches = batches

    async def __call__(self, job: EssayGradeJob) -> EssayGradeOutput | Deferred:
        if await self._batches.started(job.job_id):
            logger.info("job %s: batches already submitted, nothing to do", job.job_id)
            return DEFERRED
        prompt_version = (
            job.prompt_version.root if job.prompt_version else self._prompts.active_version(AGENT)
        )
        rows = await self._sources.answers(session.root for session in job.exam_session_ids)
        requests, failures = self.requests(rows, prompt_version)
        if not requests:
            # Nothing to grade: the result is final at once, in a single message.
            if len(failures) > CHUNK_MAX:
                raise PermanentError(
                    f"{len(failures)} unreadable answer passes, more than one message carries",
                    code=SOURCE_INVALID,
                )
            return EssayGradeOutput(
                prompt_version=prompt_version,
                final=True,
                items=[],
                failed=[failed_item(failure) for failure in failures],
            )
        await self._batches.start(
            job_id=job.job_id,
            job_type=JOB_TYPE,
            job_payload=job.model_dump(mode="json"),
            requests=requests,
            failures=failures,
        )
        return DEFERRED

    def requests(
        self, rows: Sequence[AnswerRow], prompt_version: str
    ) -> tuple[list[BatchRequest], list[Failure]]:
        """Two requests per readable answer, sorted by question then session; the passes of a
        broken row as failures."""
        requests: list[BatchRequest] = []
        failures: list[Failure] = []
        for row in sorted(rows, key=lambda r: (r.question_id, r.session_id)):
            keys = {
                pass_no: answer_key(row.session_id, row.question_id, pass_no, prompt_version)
                for pass_no in PASSES
            }
            rubric = parse_rubric(row.rubric)
            stem, text = (row.stem or "").strip(), (row.answer_text or "").strip()
            if rubric is None or not stem or not text:
                # The backend stores no blank essay answer and a locked question has its rubric:
                # a row like this is broken data, which a resend cannot fix.
                logger.error(
                    "answer s%s-q%s has no stem, rubric or text", row.session_id, row.question_id
                )
                failures.extend(Failure(key, SOURCE_INVALID, retry=False) for key in keys.values())
                continue
            for pass_no, key in keys.items():
                requests.append(
                    BatchRequest(key, self._render(row, rubric, pass_no, prompt_version))
                )
        return requests, failures

    def _render(
        self, row: AnswerRow, rubric: Sequence[RubricCriterion], pass_no: int, prompt_version: str
    ) -> RenderedPrompt:
        return self._prompts.render(
            AGENT,
            {
                "question": {
                    "stem": row.stem,
                    "rubric": [
                        {"index": index, "criterion": item.criterion, "max_points": item.max_points}
                        for index, item in enumerate(rubric)
                    ],
                    "sample_answer": row.sample_answer,
                },
                "answer": row.answer_text,
                "pass_no": pass_no,
            },
            version=prompt_version,
        )
