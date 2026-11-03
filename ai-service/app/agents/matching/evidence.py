"""Checks that the quotes of a project score are found in the CV (US-3.2 AC-8, Invariant 5).

Quote and CV text are both NFC, lower case, with every run of whitespace turned into one space;
then `rapidfuzz.fuzz.partial_ratio` scores the best matching window of the CV text. A quote matches
at EVIDENCE_MATCH_MIN_SCORE or more. The CV text is `masked_text`, the text of the uploaded file
with PII replaced, followed by the strings of the masked profile: the LLM reads the profile, whose
descriptions the CV Parser may have reworded, and a scanned CV has no `masked_text` at all.

The score of the project is left as the LLM gave it, matched or not (CONTEXT D46): the check is
stored for staff and for US-6.3 to measure, until that measurement decides whether it should lower
the score.
"""

import unicodedata
from collections.abc import Iterable, Sequence
from typing import Any

from rapidfuzz import fuzz

from app.contracts.evidence_check import EvidenceCheck

EVIDENCE_MATCH_MIN_SCORE = 85
"""packages/shared/contracts/matching.ts › EVIDENCE_MATCH_MIN_SCORE."""


def normalize(text: str) -> str:
    return " ".join(unicodedata.normalize("NFC", text).lower().split())


def evidence_source(masked_text: str | None, profile_masked: dict[str, Any]) -> str:
    """The text quotes are looked for in, normalised once per CV."""
    return normalize("\n".join([masked_text or "", *_strings(profile_masked)]))


def check_evidence(quotes: Sequence[str], source: str) -> list[EvidenceCheck]:
    """One check per quote, in the order of the quotes."""
    checks = []
    for quote in quotes:
        score = round(fuzz.partial_ratio(normalize(quote), source), 2) if source else 0.0
        checks.append(
            EvidenceCheck(quote=quote, score=score, matched=score >= EVIDENCE_MATCH_MIN_SCORE)
        )
    return checks


def _strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _strings(item)
