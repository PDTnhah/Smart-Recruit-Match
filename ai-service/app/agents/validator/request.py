"""What the Validator sees of a draft (US-4.2 AC-1, ARCHITECTURE › Pipeline › Validator, D50).

A question is shown as a student and a grader would meet it, never with its answer:
- MCQ: the stem and the options labelled A to D, without the `correct` flags or the explanation;
- ESSAY: the stem and the names of the rubric criteria, without their points, the sample answer or
  the explanation.

`ref` is the position of the question in the request, from 1; the results name questions by it.
"""

from collections.abc import Sequence
from typing import Any, Protocol, get_args

from .schemas import OptionLabel

OPTION_LABELS: tuple[str, ...] = get_args(OptionLabel)
"""Labels of the options, in the order the draft stores them."""


class QuestionDraft(Protocol):
    """A draft to check: what ai.question_drafts holds (test_generator.Draft)."""

    @property
    def draft_id(self) -> int: ...
    @property
    def type(self) -> str: ...
    @property
    def skill(self) -> str: ...
    @property
    def difficulty(self) -> str: ...
    @property
    def payload(self) -> dict[str, Any]:
        """The question as GeneratedQuestion writes it, answer included."""
        ...


def request_items(drafts: Sequence[QuestionDraft]) -> list[dict[str, Any]]:
    return [_item(ref, draft) for ref, draft in enumerate(drafts, start=1)]


def _item(ref: int, draft: QuestionDraft) -> dict[str, Any]:
    item: dict[str, Any] = {
        "ref": ref,
        "type": draft.type,
        "skill": draft.skill,
        "difficulty": draft.difficulty,
        "stem": draft.payload["stem"],
    }
    if draft.type == "MCQ":
        item["options"] = [
            {"label": label, "text": option["text"]}
            for label, option in zip(OPTION_LABELS, draft.payload["options"], strict=True)
        ]
    else:
        item["criteria"] = [criterion["criterion"] for criterion in draft.payload["rubric"]]
    return item


def answer_key(draft: QuestionDraft) -> int:
    """Index of the option marked correct; submit_questions stores an MCQ with exactly one."""
    [index] = [i for i, option in enumerate(draft.payload["options"]) if option["correct"]]
    return index
