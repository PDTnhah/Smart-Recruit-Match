"""US-3.2 AC-8: quotes of the project score are checked against the CV; the score is kept (D46)."""

import re
import unicodedata
from pathlib import Path

import pytest
from matching_support import (
    FABRICATED_QUOTE,
    MASKED_TEXT,
    PROFILE,
    TRUE_QUOTE,
    Harness,
    answer,
    assessment_json,
    items_of,
    key,
    match_job,
    ref,
)

from app.agents.matching.evidence import (
    EVIDENCE_MATCH_MIN_SCORE,
    check_evidence,
    evidence_source,
)

CONTRACTS = Path(__file__).resolve().parents[4] / "packages" / "shared" / "contracts"


def test_gd3_true_evidence_matched() -> None:
    [check] = check_evidence([TRUE_QUOTE], evidence_source(MASKED_TEXT, PROFILE))
    assert check.matched is True
    assert check.score == 100
    assert check.quote == TRUE_QUOTE


def test_gd3_case_and_space_only_matched() -> None:
    quote = "XÂY DỰNG  REST API\nbằng spring boot"
    nfd = unicodedata.normalize("NFD", TRUE_QUOTE)
    checks = check_evidence([quote, nfd], evidence_source(MASKED_TEXT, PROFILE))
    assert [c.matched for c in checks] == [True, True]
    assert checks[0].quote == quote  # stored as the LLM wrote it


def test_gd3_scanned_cv_checked_against_the_masked_profile() -> None:
    [check] = check_evidence(["Backend developer"], evidence_source(None, PROFILE))
    assert check.matched is True


def test_gd3_fabricated_quote_scores_below_the_threshold() -> None:
    [check] = check_evidence([FABRICATED_QUOTE], evidence_source(MASKED_TEXT, PROFILE))
    assert check.matched is False
    assert check.score < EVIDENCE_MATCH_MIN_SCORE


def test_gd3_threshold_is_the_contract_constant() -> None:
    source = (CONTRACTS / "matching.ts").read_text(encoding="utf-8")
    match = re.search(r"EVIDENCE_MATCH_MIN_SCORE = (\d+)", source)
    assert match and int(match.group(1)) == EVIDENCE_MATCH_MIN_SCORE


@pytest.mark.anyio
async def test_gd3_fabricated_evidence_flagged_score_kept() -> None:
    worker = Harness()
    reply = answer(assessment_json(score=4, quotes=[TRUE_QUOTE, FABRICATED_QUOTE]))
    worker.provider.script = {key(1, 10): [reply]}
    await worker.agent(match_job(ref(1, 10)))
    await worker.drain()

    item = items_of(worker.outbox.results)[key(1, 10)]
    assert item["assessment"]["project_relevance"]["score_0_4"] == 4
    assert [(c["quote"], c["matched"]) for c in item["evidence_check"]] == [
        (TRUE_QUOTE, True),
        (FABRICATED_QUOTE, False),
    ]
