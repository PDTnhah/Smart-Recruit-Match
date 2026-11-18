"""The two LLM outputs of part D, checked against the job they answer (US-4.8 AC-2, AC-5).

The generated contracts check shape and limits only. What makes an answer usable depends on the
job: the entries of this CV, the number of questions asked, the answers sent. A model class is
built per job with those checks, so a draft that names an entry the CV lacks, or a verdict on a
question nobody asked, is invalid output and the LLMClient asks again (US-2.2 AC-4). The schema
sent to the LLM is the contract's, whatever the job.
"""

from collections.abc import Iterable
from typing import Self

from pydantic import ConfigDict, model_validator

from app.contracts.cv_llm_verdict import CvLlmVerdict
from app.contracts.cv_verification_check import CvVerificationCheck
from app.contracts.cv_verification_draft import CvVerificationDraft

from .claims import Claim, claim_key_of

QUOTED_VERDICTS = frozenset({CvLlmVerdict.CONSISTENT, CvLlmVerdict.PARTIAL})
"""Verdicts that need words of the answer behind them (AGENTS › Invariant 5)."""


def draft_model(claims: Iterable[Claim], count: int) -> type[CvVerificationDraft]:
    """`count` questions, each about a different entry of `claims`."""
    allowed = frozenset(claim.key for claim in claims)

    class CheckedCvVerificationDraft(CvVerificationDraft):
        model_config = ConfigDict(
            title="CvVerificationDraft",
            json_schema_extra={
                "description": "Structured output of the CV verification drafting step"
            },
        )

        @model_validator(mode="after")
        def _asks_about_this_cv(self) -> Self:
            if len(self.questions) != count:
                raise ValueError(f"expected {count} question(s), got {len(self.questions)}")
            seen: set[object] = set()
            for question in self.questions:
                if not question.stem.strip():
                    raise ValueError("a question stem is blank")
                key = claim_key_of(question.claim_ref)
                name = f"{key[0].value}[{key[1]}]"
                if key not in allowed:
                    raise ValueError(f"claim_ref {name} is not an entry listed in <cv_entries>")
                if key in seen:
                    raise ValueError(f"two questions ask about {name}")
                seen.add(key)
            return self

    return CheckedCvVerificationDraft


def check_model(question_ids: Iterable[int]) -> type[CvVerificationCheck]:
    """One verdict per question sent, each with a reason, and a quote behind CONSISTENT/PARTIAL."""
    expected = sorted(question_ids)

    class CheckedCvVerificationCheck(CvVerificationCheck):
        model_config = ConfigDict(
            title="CvVerificationCheck",
            json_schema_extra={
                "description": "Structured output of the CV verification checking step"
            },
        )

        @model_validator(mode="after")
        def _answers_each_question(self) -> Self:
            given = sorted(item.question_id for item in self.items)
            if given != expected:
                raise ValueError(f"expected one item per question {expected}, got {given}")
            for item in self.items:
                if not item.reason.strip():
                    raise ValueError(f"question {item.question_id}: reason is blank")
                quote = item.quote.root.strip() if item.quote is not None else ""
                if item.verdict in QUOTED_VERDICTS and not quote:
                    raise ValueError(
                        f"question {item.question_id}: {item.verdict.value} needs a quote"
                    )
            return self

    return CheckedCvVerificationCheck
