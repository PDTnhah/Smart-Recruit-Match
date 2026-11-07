"""Limits of the Validator (US-4.2 AC-2, AC-3, CONTEXT D50).

The order of the reject reasons comes from app/contracts/question_bank.json, which
`pnpm contracts:gen` writes from QUESTION_REJECT_REASONS in packages/shared/contracts/questions.ts,
so a verdict lists its reasons as the backend and the database CHECK know them (AD-6).
"""

import json
from importlib.resources import files

AGENT = "validator"

_MANIFEST = json.loads(
    files("app.contracts").joinpath("question_bank.json").read_text(encoding="utf-8")
)

REJECT_REASONS: tuple[str, ...] = tuple(_MANIFEST["reject_reasons"])
"""Every reason a verdict can give, in the order it lists them."""
MCQ_OPTION_COUNT: int = _MANIFEST["mcq_option_count"]

MAX_MCQ_PER_CALL = 15
"""Multiple-choice questions one call checks: what one round of the Test Generator writes."""
MAX_ESSAYS_PER_CALL = 5
"""Essays one call checks: what one round of part B writes."""
DIFFICULTY_LEVELS = ("EASY", "MEDIUM", "HARD")
DIFFICULTY_REJECT_GAP = 2
"""Levels between the label and the Validator's estimate that reject a question: EASY ↔ HARD. One
level is kept, with the estimate in the verdict (CONTEXT D50)."""
NOTE_CHARACTERS = 2000
"""Characters of the Validator's note a verdict keeps (QuestionValidation.note)."""
