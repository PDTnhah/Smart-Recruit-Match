"""US-2.5 AC-3: skill_match_key gives the keys of the cases shared with skillMatchKey (TS)."""

import json
from pathlib import Path

import pytest

from app.embedding import skill_match_key

SHARED = Path(__file__).resolve().parents[3] / "packages/shared/contracts"
CASES = SHARED / "fixtures/skill-key-cases.json"


def cases() -> list[dict[str, str]]:
    return json.loads(CASES.read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", cases(), ids=lambda case: case["name"])
def test_gd2_shared_key_cases(case: dict[str, str]) -> None:
    assert skill_match_key(case["name"]) == case["key"]


def test_gd2_reactjs_spellings_share_one_key() -> None:
    assert len({skill_match_key(name) for name in ("ReactJS", "React.js", "react js")}) == 1
    assert skill_match_key("C++") != skill_match_key("C#") != skill_match_key("C")
