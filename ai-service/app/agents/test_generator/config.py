"""Limits of the Test Generator (US-4.1 AC-5, CONTEXT D49).

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
"""A cell is covered once it holds this many drafts per question it draws (3×)."""
TARGET_FACTOR: int = _MANIFEST["factors"]["target"]
"""What a round asks the LLM to reach for a cell (4×)."""
MAX_FACTOR: int = _MANIFEST["factors"]["max"]
"""A cell takes no draft past this (5×): CELL_FULL."""
MCQ_OPTION_COUNT: int = _MANIFEST["mcq_option_count"]
RUBRIC_MAX_CRITERIA: int = _MANIFEST["rubric_max_criteria"]
MAX_DRAFTS: int = _MANIFEST["max_drafts"]
"""Drafts of one bank, the most one result can carry: BANK_FULL past it."""
PART_TYPES: dict[str, str] = _MANIFEST["part_types"]
"""Part of the blueprint → the question type it draws (EXAM_PART_TYPES): A → MCQ, B → ESSAY."""

MAX_ROUNDS = 12
"""LLM rounds of one attempt of a job; the job ends PARTIAL when cells are still short."""
MAX_TOKENS_PER_JOB = 400_000
"""No round starts once the job has spent this many tokens: every LLM attempt counts, and so do
the earlier attempts of a retried job (ai.llm_calls)."""
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
