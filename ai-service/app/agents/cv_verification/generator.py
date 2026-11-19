"""Part C drafting: 2–3 questions about entries the student's CV claims (US-4.8 AC-2, FR-25).

1. Read the CV version through core.v_ai_cv_profile_masked and the JD's requirements through
   core.v_ai_jd_requirements (AD-4, BR-03).
2. List the entries a question may ask about (claims.py); none means no part C (NO_CLAIMS).
3. Ask for min(question_count, entries) questions, effort medium, structured output (AD-10). A
   draft naming an entry the CV lacks, or two questions on one entry, is invalid output.
4. Label each question with its entry's name, written by code from the profile.

The questions carry no expected answer: the checking step compares an answer with the CV entry.
"""

from app.consumers.errors import PermanentError
from app.contracts.cv_verification_question import CvVerificationQuestion
from app.contracts.cv_verify_generate_job import CvVerifyGenerateJob
from app.contracts.cv_verify_generate_output import CvVerifyGenerateOutput
from app.llm.client import LLMClient
from app.llm.effort import EFFORT_BY_AGENT
from app.prompts.registry import PromptRegistry

from .claims import claim_key_of, claims_of
from .schemas import draft_model
from .source import CvVerificationSourceRepo

AGENT = "cv_verification"
JD_SKILL_GROUPS = ("must_have", "nice_to_have")


class CvVerificationGenerator:
    """The CV_VERIFY_GENERATE handler: called with the job, returns the result for ai.results."""

    def __init__(
        self, *, sources: CvVerificationSourceRepo, llm: LLMClient, prompts: PromptRegistry
    ) -> None:
        self._sources = sources
        self._llm = llm
        self._prompts = prompts

    async def __call__(self, job: CvVerifyGenerateJob) -> CvVerifyGenerateOutput:
        cv = await self._sources.cv(job.cv_id, job.cv_version)
        if cv is None:
            raise PermanentError(
                f"CV {job.cv_id} v{job.cv_version} is no longer the confirmed, active one",
                code="CV_SOURCE_NOT_FOUND",
            )
        jd = await self._sources.jd(job.jd_id)
        if jd is None:
            raise PermanentError(
                f"JD {job.jd_id} has no approved requirements", code="JD_SOURCE_NOT_FOUND"
            )
        claims = claims_of(cv.profile_masked)
        if not claims:
            raise PermanentError(
                f"CV {job.cv_id} lists no project, experience or skill to ask about",
                code="NO_CLAIMS",
            )
        count = min(job.question_count, len(claims))
        prompt = self._prompts.render(
            AGENT,
            {
                "jd": {
                    "position_group": jd.position_group,
                    **{group: jd.requirements.get(group, []) for group in JD_SKILL_GROUPS},
                },
                "entries": [claim.prompt_item() for claim in claims],
                "question_count": count,
            },
        )
        result = await self._llm.generate(
            prompt=prompt,
            output_model=draft_model(claims, count),
            effort=EFFORT_BY_AGENT[AGENT],
            job_id=job.job_id,
        )
        labels = {claim.key: claim.label for claim in claims}
        return CvVerifyGenerateOutput(
            prompt_version=result.prompt_version,
            model=result.model,
            preference_id=job.preference_id,
            questions=[
                CvVerificationQuestion(
                    claim_ref=question.claim_ref,
                    claim_label=labels[claim_key_of(question.claim_ref)],
                    stem=question.stem.strip(),
                )
                for question in result.data.questions
            ],
        )
