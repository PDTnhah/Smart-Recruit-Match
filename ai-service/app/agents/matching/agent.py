"""Matching Agent: scores the projects of each CV × JD pair 0–4 and comments on the fit
(US-3.2, PRD GĐ3, FR-14, AD-2, AD-12, CONTEXT D42, D46).

The backend has already run the hard filter and scored skills, language and major by code; only the
pairs it sends need the LLM. The MATCH handler:

1. reads the pairs, CVs and JDs through the three views (AC-5);
2. renders one prompt per pair with the pinned version, or the active one for a first run (AC-4):
   rubric in `system`, the JD requirements in `shared` (cached across the CVs of one JD), the
   masked profile and the code verdicts in `user`, all data inside `untrusted` tags (Invariant 6);
3. sorts the requests by JD, then CV, so requests sharing a JD are neighbours (AC-7);
4. hands them to the BatchCoordinator and returns DEFERRED: the poller publishes the results
   (completion.py). A redelivered job finds its batches and submits nothing (AC-17).

The LLM never returns a total score or a verdict on skills (AD-2): the backend computes S_cv.
"""

import logging
from typing import Self

from pydantic import ConfigDict, model_validator

from app.consumers.base import DEFERRED, Deferred
from app.consumers.batch_poller import BatchCoordinator
from app.consumers.batches import Failure
from app.contracts.match_assessment import MatchAssessment
from app.contracts.match_failed_pair import MatchFailedPair
from app.contracts.match_run_job import MatchRunJob
from app.contracts.match_run_output import MatchRunOutput
from app.llm.batch import BatchRequest
from app.prompts.registry import PromptRegistry

from .source import CvRow, JdRow, MatchSourceRepo, PairRow, pair_key, pair_of

logger = logging.getLogger(__name__)

AGENT = "matching"
JOB_TYPE = "MATCH"
VERDICT_FIELDS = ("must_have", "nice_to_have", "education", "language", "gaps")
"""What the prompt shows of the code verdicts; zone coverage is for the backend's explanation."""


class CheckedMatchAssessment(MatchAssessment):
    """The generated contract plus what Zod checks and JSON Schema cannot carry: every text is
    trimmed before its length is checked (`.trim().min(1)`). A blank one is invalid output, sent
    again like any other, instead of a message the backend refuses."""

    # The schema sent to the LLM keeps the contract's description, not this docstring.
    model_config = ConfigDict(
        title="MatchAssessment",
        json_schema_extra={
            "description": "Project score and comments of the Matching Agent for one pair"
        },
    )

    @model_validator(mode="after")
    def _as_zod_reads_it(self) -> Self:
        project = self.project_relevance
        texts = [
            project.reason,
            self.summary,
            *(quote.root for quote in project.evidence),
            *(item.root for item in self.strengths),
            *(item.root for item in self.suggestions),
        ]
        if any(not text.strip() for text in texts):
            raise ValueError("reason, summary, quotes and comments must not be blank")
        return self


def failed_pair(failure: Failure) -> MatchFailedPair:
    return MatchFailedPair(
        **pair_of(failure.key).model_dump(),
        code=failure.code[:50],
        needs_review=failure.needs_review,
    )


class MatchingAgent:
    """The MATCH handler: called with the job, returns DEFERRED once its batches are submitted."""

    def __init__(
        self, *, sources: MatchSourceRepo, prompts: PromptRegistry, batches: BatchCoordinator
    ) -> None:
        self._sources = sources
        self._prompts = prompts
        self._batches = batches

    async def __call__(self, job: MatchRunJob) -> MatchRunOutput | Deferred:
        if await self._batches.started(job.job_id):
            logger.info("job %s: batches already submitted, nothing to do", job.job_id)
            return DEFERRED
        prompt_version = (
            job.prompt_version.root if job.prompt_version else self._prompts.active_version(AGENT)
        )
        requests, failures = await self._requests(job, prompt_version)
        if not requests:
            # Every pair lost its data: the result is final at once, nothing to submit.
            return MatchRunOutput(
                prompt_version=prompt_version,
                final=True,
                items=[],
                failed_pairs=[failed_pair(failure) for failure in failures],
            )
        await self._batches.start(
            job_id=job.job_id,
            job_type=JOB_TYPE,
            job_payload=job.model_dump(mode="json"),
            requests=requests,
            failures=failures,
        )
        return DEFERRED

    async def _requests(
        self, job: MatchRunJob, prompt_version: str
    ) -> tuple[list[BatchRequest], list[Failure]]:
        refs = sorted(job.pairs, key=lambda ref: (ref.jd_id, ref.cv_id, ref.cv_version))
        pairs = {
            pair_key(pair): pair
            for pair in await self._sources.pairs(job.campaign_id, job.rules_version, refs)
        }
        cvs = await self._sources.cvs(ref.cv_id for ref in refs)
        jds = await self._sources.jds(ref.jd_id for ref in refs)
        requests: list[BatchRequest] = []
        failures: list[Failure] = []
        for ref in refs:
            key = pair_key(ref)
            pair = pairs.get(key)
            cv = cvs.get(ref.cv_id)
            jd = jds.get(ref.jd_id)
            if (
                pair is None
                or cv is None
                or cv.version != ref.cv_version
                or jd is None
                or jd.version != ref.jd_version
            ):
                failures.append(Failure(key, "SOURCE_MISSING", retry=False))
                continue
            requests.append(BatchRequest(key, self._render(pair, cv, jd, prompt_version)))
        if failures:
            logger.warning(
                "job %s: %d pair(s) left the views before scoring", job.job_id, len(failures)
            )
        return requests, failures

    def _render(self, pair: PairRow, cv: CvRow, jd: JdRow, prompt_version: str):
        return self._prompts.render(
            AGENT,
            {
                "jd": {"position_group": jd.position_group, "requirements": jd.requirements},
                "cv_profile": cv.profile_masked,
                "verdicts": {field: pair.criteria.get(field) for field in VERDICT_FIELDS},
            },
            version=prompt_version,
        )
