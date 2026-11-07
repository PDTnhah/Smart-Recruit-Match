"""Code decides VALIDATED or REJECTED from what the Validator found (US-4.2 AC-3, AD-2, D50).

A question is rejected with every check it fails, in the order of REJECT_REASONS:
- ANSWER_MISMATCH: an MCQ whose marked answer is not among the options the Validator found correct
  (none found included);
- MULTIPLE_CORRECT: an MCQ the Validator found two or more correct options in;
- OFF_SKILL, ANSWER_LEAKED, UNCLEAR; WEAK_DISTRACTORS for an MCQ; RUBRIC_MISMATCH for an essay;
- DIFFICULTY_MISMATCH: the estimate is DIFFICULTY_REJECT_GAP levels from the label or more;
- DUPLICATE: `duplicate_of` names an earlier question of the request that passed.
A question that fails none is VALIDATED. A question without exactly one result in the answer gets no
verdict: it waits for the next round.

`stored_validation` rebuilds a verdict from its row of ai.question_validations with the same rules,
so a later job and the backend read what this job decided. It reads only the fields a verdict keeps
from the stored answer, so the rows of an earlier validator/vN still load after QuestionCheck
changes.
"""

from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from app.contracts.question_validation import QuestionValidation, Reason, Status

from .config import DIFFICULTY_LEVELS, DIFFICULTY_REJECT_GAP, NOTE_CHARACTERS, REJECT_REASONS
from .request import OPTION_LABELS, QuestionDraft, answer_key
from .schemas import QuestionCheck

REFUSED = "refused"
"""Key of the stored answer of a question the model refused to check."""


@dataclass(frozen=True)
class Verdict:
    draft_id: int
    validation: QuestionValidation
    answer: dict[str, Any]
    """ai.question_validations.verdict: the model's result for the question as it came back, or
    the refusal, so a new threshold can be measured without calling the model again (US-6.3)."""


def decide(
    drafts: Sequence[QuestionDraft],
    checks: Sequence[QuestionCheck],
    *,
    model: str,
    prompt_version: str,
) -> list[Verdict]:
    """Verdicts of the drafts of one request, in request order; drafts without one are left out."""
    seen = Counter(check.ref for check in checks)
    by_ref = {check.ref: check for check in checks if seen[check.ref] == 1}
    passed: set[int] = set()
    verdicts = []
    for ref, draft in enumerate(drafts, start=1):
        check = by_ref.get(ref)
        if check is None:
            continue
        reasons = failed_checks(draft, check)
        # `passed` holds earlier refs only: a question repeats one that came before it.
        if check.duplicate_of in passed:
            reasons.add(Reason.DUPLICATE)
        answer = check.model_dump(mode="json")
        validation = _validation(draft.type, reasons, answer, model, prompt_version)
        if validation.status is Status.VALIDATED:
            passed.add(ref)
        verdicts.append(Verdict(draft.draft_id, validation, answer))
    return verdicts


def failed_checks(draft: QuestionDraft, check: QuestionCheck) -> set[Reason]:
    """The checks of one question it fails, DUPLICATE aside: that one compares questions."""
    reasons: set[Reason] = set()
    if draft.type == "MCQ":
        solved = _solved(check.correct_options)
        if answer_key(draft) not in solved:
            reasons.add(Reason.ANSWER_MISMATCH)
        if len(solved) > 1:
            reasons.add(Reason.MULTIPLE_CORRECT)
        if not check.distractors_plausible:
            reasons.add(Reason.WEAK_DISTRACTORS)
    elif not check.gradeable_by_criteria:
        reasons.add(Reason.RUBRIC_MISMATCH)
    if not check.on_skill:
        reasons.add(Reason.OFF_SKILL)
    if check.answer_leaked:
        reasons.add(Reason.ANSWER_LEAKED)
    if not check.clear:
        reasons.add(Reason.UNCLEAR)
    if difficulty_gap(draft.difficulty, check.estimated_difficulty) >= DIFFICULTY_REJECT_GAP:
        reasons.add(Reason.DIFFICULTY_MISMATCH)
    return reasons


def difficulty_gap(label: str, estimate: str) -> int:
    return abs(DIFFICULTY_LEVELS.index(label) - DIFFICULTY_LEVELS.index(estimate))


def refused(draft_id: int, *, model: str, prompt_version: str, category: str | None) -> Verdict:
    """A question the model still refused when sent alone: rejected unread (AC-2)."""
    validation = _validation("", {Reason.VALIDATOR_REFUSAL}, None, model, prompt_version)
    return Verdict(draft_id, validation, {REFUSED: True, "category": category})


def stored_validation(
    *,
    draft_type: str,
    reasons: Sequence[str],
    answer: Mapping[str, Any],
    model: str,
    prompt_version: str,
) -> QuestionValidation:
    """The verdict as `decide` or `refused` made it, from its row of ai.question_validations."""
    found = None if answer.get(REFUSED) else answer
    return _validation(
        draft_type, {Reason(reason) for reason in reasons}, found, model, prompt_version
    )


def _validation(
    draft_type: str,
    reasons: set[Reason],
    found: Mapping[str, Any] | None,
    model: str,
    prompt_version: str,
) -> QuestionValidation:
    """`found`: the model's result for the question as QuestionCheck dumps it; None if refused."""
    ordered = sorted(reasons, key=lambda reason: REJECT_REASONS.index(reason.value))
    note = str(found.get("note") or "").strip()[:NOTE_CHARACTERS] if found else ""
    solved = _solved(found.get("correct_options") or []) if found and draft_type == "MCQ" else None
    return QuestionValidation.model_validate(
        {
            "status": Status.REJECTED if ordered else Status.VALIDATED,
            "reasons": ordered,
            "correct_options": sorted(solved) if solved is not None else None,
            "estimated_difficulty": found.get("estimated_difficulty") if found else None,
            "note": note or None,
            "model": model,
            "prompt_version": prompt_version,
        }
    )


def _solved(labels: Sequence[str]) -> set[int]:
    return {OPTION_LABELS.index(label) for label in labels}
