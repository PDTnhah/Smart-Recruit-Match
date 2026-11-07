"""Limits of the Test Generator (US-4.1 AC-5, US-4.2 AC-4, CONTEXT D49, D50).

The bank factors, the MCQ and rubric sizes and the question type of each part come from
app/contracts/question_bank.json, which `pnpm contracts:gen` writes from
packages/shared/contracts/questions.ts, so the backend counts coverage with the same numbers (AD-6).
"""

import json
from importlib.resources import files

AGENT = "test_generator"

_MANIFEST = json.loads(
    files("app.contracts").joinpath("question_bank.json").read_text(encoding="utf-8")
)

MIN_FACTOR: int = _MANIFEST["factors"]["min"]
"""A cell is covered once it holds this many VALIDATED drafts per question it draws (3×)."""
TARGET_FACTOR: int = _MANIFEST["factors"]["target"]
"""What a round asks the LLM to reach for a cell (4×), the drafts waiting for a verdict counted."""
MAX_FACTOR: int = _MANIFEST["factors"]["max"]
"""A cell takes no draft past this (5×), the rejected ones not counted: CELL_FULL."""
MCQ_OPTION_COUNT: int = _MANIFEST["mcq_option_count"]
RUBRIC_MAX_CRITERIA: int = _MANIFEST["rubric_max_criteria"]
MAX_DRAFTS: int = _MANIFEST["max_drafts"]
"""Drafts of one bank, the most one result can carry: BANK_FULL past it."""
PART_TYPES: dict[str, str] = _MANIFEST["part_types"]
"""Part of the blueprint → the question type it draws (EXAM_PART_TYPES): A → MCQ, B → ESSAY."""

MAX_ROUNDS = 12
"""Rounds of one attempt of a job, each writing questions and checking them; the job ends PARTIAL
when cells are still short."""
MAX_TOKENS_PER_JOB = 600_000
"""No LLM call starts once the job has spent this many tokens: every attempt of the Generator and
of the Validator counts, and so do the earlier attempts of a retried job (ai.llm_calls). A first
figure, to measure again with `evals/smoke_llm.py --bank` (D50)."""
MAX_CHECKS_PER_DRAFT = 2
"""Times one job sends a draft to the Validator. A draft that still has no verdict then takes no
room in its cell, which asks for another in its place; the next job tries it again."""
MAX_QUESTIONS_PER_CALL = 15
"""Questions one round asks for."""
MAX_ESSAYS_PER_CALL = 5
"""Essays one round asks for: with rubric and sample answer, five fit the LLM_MAX_OUTPUT_TOKENS
default (16K) beside the reasoning of effort high. The Anthropic SDK refuses more than about 21K
output tokens without streaming, so the limit is the number of questions, not the tokens."""
DUPLICATE_COSINE = 0.9
"""Two stems this similar or more are one question (AC-8)."""
SIMILAR_K = 3
"""Questions find_similar_questions returns."""
QUESTION_EMBEDDING_VERSION = 1
"""`version` of a draft's vector in ai.embeddings: a draft never changes."""
PROMPT_STEM_CHARACTERS = 300
"""Characters of an existing or rejected stem the next prompt shows."""
