"""Limits of the Validator (US-4.2 AC-2, AC-3, US-4.10 AC-3, CONTEXT D50, D60).

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
MAX_CHECKS_PER_DRAFT = 2
"""Times one QUESTIONS_VALIDATE job sends a draft. A draft still without a verdict then stays
unchecked for the job, and the next AI check CENTER runs sends it again."""
MAX_TOKENS_PER_JOB = 300_000
"""No LLM call of a QUESTIONS_VALIDATE job starts once the job has spent this many tokens, its
earlier attempts included (ai.llm_calls): about 8 calls for the 96 drafts of a bank, with room for
refusals and splits. A first figure, to measure with `evals/smoke_llm.py --bank` (US-4.10 AC-6)."""
DIFFICULTY_LEVELS = ("EASY", "MEDIUM", "HARD")
DIFFICULTY_REJECT_GAP = 2
"""Levels between the label and the Validator's estimate that reject a question: EASY ↔ HARD. One
level is kept, with the estimate in the verdict (CONTEXT D50)."""
NOTE_CHARACTERS = 2000
"""Characters of the Validator's note a verdict keeps (QuestionValidation.note)."""
