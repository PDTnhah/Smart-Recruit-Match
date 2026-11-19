"""Part C checking: a verdict per answer against the CV entry its question asks about (US-4.8
AC-5, AD-2).

1. Read the questions and answers of the closed session through
   core.v_ai_cv_verification_answers, and the CV version through core.v_ai_cv_profile_masked.
2. A blank answer is NO_ANSWER, set here; it never reaches the LLM. When every answer is blank
   no LLM is called and the result has no model or prompt.
3. The other answers go in one call, effort medium: CONSISTENT, PARTIAL or INCONSISTENT, each
   with a reason and, for the first two, a quote copied from the answer.
4. The quote is looked for in the answer (RapidFuzz ≥ 85, matching/evidence.py); a quote longer
   than the answer is compared whole. CONSISTENT or PARTIAL without a quote found there counts as
   INCONSISTENT (Invariant 5).

The trust index is computed by the backend from the verdicts, never by the LLM.
"""

from rapidfuzz import fuzz

from app.agents.matching.evidence import EVIDENCE_MATCH_MIN_SCORE, normalize
from app.consumers.errors import PermanentError
from app.contracts.cv_verdict import CvVerdict
from app.contracts.cv_verification_check_item import CvVerificationCheckItem
from app.contracts.cv_verification_evaluation_item import CvVerificationEvaluationItem
from app.contracts.cv_verify_evaluate_job import CvVerifyEvaluateJob
from app.contracts.cv_verify_evaluate_output import CvVerifyEvaluateOutput
from app.llm.client import LLMClient
from app.llm.effort import EFFORT_BY_AGENT
from app.llm.types import RenderedPrompt
from app.prompts.registry import PromptRegistry

from .claims import claim_key_of, claims_of
from .schemas import QUOTED_VERDICTS, check_model
from .source import AnswerRow, CvVerificationSourceRepo

CHECK_AGENT = "cv_verification_check"
MAX_REASON = 1000
NO_ANSWER_REASON = "Sinh viên bỏ trống câu này."
UNQUOTED_NOTE = "Trích dẫn không có trong câu trả lời nên không được tính là khớp."


class CvVerificationEvaluator:
    """The CV_VERIFY_EVALUATE handler: called with the job, returns the result for ai.results."""

    def __init__(
        self, *, sources: CvVerificationSourceRepo, llm: LLMClient, prompts: PromptRegistry
    ) -> None:
        self._sources = sources
        self._llm = llm
        self._prompts = prompts

    async def __call__(self, job: CvVerifyEvaluateJob) -> CvVerifyEvaluateOutput:
        rows = await self._sources.answers(job.preference_id)
        if not rows:
            raise PermanentError(
                f"preference {job.preference_id} has no part C of a closed session",
                code="ANSWERS_NOT_FOUND",
            )
        answered = [row for row in rows if answer_of(row) is not None]
        checked: dict[int, CvVerificationEvaluationItem] = {}
        prompt_version = model = None
        if answered:
            prompt = await self._prompt(job, answered)
            result = await self._llm.generate(
                prompt=prompt,
                output_model=check_model(row.question_id for row in answered),
                effort=EFFORT_BY_AGENT[CHECK_AGENT],
                job_id=job.job_id,
            )
            prompt_version, model = result.prompt_version, result.model
            items = {item.question_id: item for item in result.data.items}
            for row in answered:
                checked[row.question_id] = checked_item(items[row.question_id], answer_of(row))
        return CvVerifyEvaluateOutput(
            prompt_version=prompt_version,
            model=model,
            preference_id=job.preference_id,
            items=[checked.get(row.question_id) or no_answer_item(row) for row in rows],
        )

    async def _prompt(self, job: CvVerifyEvaluateJob, answered: list[AnswerRow]) -> RenderedPrompt:
        cv = await self._sources.cv(job.cv_id, job.cv_version)
        if cv is None:
            raise PermanentError(
                f"CV {job.cv_id} v{job.cv_version} is no longer the confirmed, active one",
                code="CV_SOURCE_NOT_FOUND",
            )
        claims = {claim.key: claim for claim in claims_of(cv.profile_masked)}
        questions = []
        for row in answered:
            claim = claims.get(claim_key_of(row.claim_ref))
            if claim is None:
                raise PermanentError(
                    f"question {row.question_id} asks about an entry CV {job.cv_id} lacks",
                    code="CLAIM_NOT_FOUND",
                )
            questions.append(
                {"question_id": row.question_id, "stem": row.stem, **claim.prompt_item()}
            )
        return self._prompts.render(
            CHECK_AGENT,
            {
                "questions": questions,
                "answers": [
                    {"question_id": row.question_id, "text": answer_of(row)} for row in answered
                ],
            },
        )


def answer_of(row: AnswerRow) -> str | None:
    """The answer, or None when the student left it blank."""
    text = (row.answer_text or "").strip()
    return text or None


def checked_item(item: CvVerificationCheckItem, answer: str | None) -> CvVerificationEvaluationItem:
    """The LLM's verdict after the quote check (AC-5)."""
    quote = item.quote.root.strip() if item.quote is not None else ""
    score = quote_score(quote, answer or "") if quote else None
    verdict = CvVerdict(item.verdict.value)
    reason = item.reason.strip()
    if item.verdict in QUOTED_VERDICTS and (score is None or score < EVIDENCE_MATCH_MIN_SCORE):
        verdict = CvVerdict.INCONSISTENT
        reason = f"{UNQUOTED_NOTE} {reason}"[:MAX_REASON]
    return CvVerificationEvaluationItem(
        question_id=item.question_id,
        llm_verdict=item.verdict,
        verdict=verdict,
        quote=quote or None,
        quote_score=score,
        reason=reason,
    )


def quote_score(quote: str, answer: str) -> float:
    """How well the quote is found in the answer, 0–100, both normalised as matching/evidence.py
    does. partial_ratio scores the shorter text inside the longer, so a made-up quote that merely
    contains a short answer would score 100: a quote longer than the answer is compared whole."""
    text, source = normalize(quote), normalize(answer)
    if not source:
        return 0.0
    scorer = fuzz.partial_ratio if len(text) <= len(source) else fuzz.ratio
    return round(scorer(text, source), 2)


def no_answer_item(row: AnswerRow) -> CvVerificationEvaluationItem:
    return CvVerificationEvaluationItem(
        question_id=row.question_id,
        llm_verdict=None,
        verdict=CvVerdict.NO_ANSWER,
        quote=None,
        quote_score=None,
        reason=NO_ANSWER_REASON,
    )
