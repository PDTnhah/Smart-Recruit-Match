"""US-2.2 AC-1: the output schema both providers accept (CONTEXT D34)."""

from datetime import date
from typing import Annotated, Literal

import pytest
from pydantic import BaseModel, Field

from app.llm.schema import strict_json_schema


class Evidence(BaseModel):
    quote: str = Field(min_length=1, description="Exact text from the CV")
    page: int | None = Field(default=None, ge=1)


class Criterion(BaseModel):
    verdict: Literal["MET", "PARTIAL", "NOT_MET"]
    kind: Literal["skill"]
    evidence: list[Evidence] = Field(max_length=5)
    checked_on: date


class Tree(BaseModel):
    children: list["Tree"]


def test_ad10_refs_inlined_and_objects_closed():
    schema = strict_json_schema(Criterion)
    assert "$defs" not in str(schema) and "$ref" not in str(schema)
    assert schema["additionalProperties"] is False
    evidence = schema["properties"]["evidence"]["items"]
    assert evidence["additionalProperties"] is False
    assert evidence["properties"]["quote"] == {
        "type": "string",
        "description": "Exact text from the CV",
    }
    assert schema["properties"]["verdict"]["enum"] == ["MET", "PARTIAL", "NOT_MET"]
    assert schema["properties"]["kind"]["enum"] == ["skill"], "const becomes a one-value enum"
    assert schema["properties"]["checked_on"] == {"type": "string", "format": "date"}
    assert set(schema["required"]) == {"verdict", "kind", "evidence", "checked_on"}


def test_ad10_constraints_and_defaults_are_dropped_but_still_validated():
    page = strict_json_schema(Evidence)["properties"]["page"]
    assert page == {"anyOf": [{"type": "integer"}, {"type": "null"}]}
    text = str(strict_json_schema(Criterion))
    for keyword in ("minLength", "maxItems", "minimum", "default", "title"):
        assert keyword not in text
    with pytest.raises(ValueError):
        Evidence.model_validate({"quote": "", "page": 0})


def test_recursive_and_free_form_models_are_rejected():
    with pytest.raises(ValueError, match="recursive"):
        strict_json_schema(Tree)

    class FreeForm(BaseModel):
        scores: dict[str, int]

    with pytest.raises(ValueError, match="free-form"):
        strict_json_schema(FreeForm)


class Met(BaseModel):
    kind: Literal["MET"]
    evidence: str


class NotMet(BaseModel):
    kind: Literal["NOT_MET"]


class Verdict(BaseModel):
    verdict: Annotated[Met | NotMet, Field(discriminator="kind")]


def test_discriminated_union_becomes_any_of():
    verdict = strict_json_schema(Verdict)["properties"]["verdict"]
    assert "oneOf" not in verdict and "discriminator" not in verdict
    assert [option["properties"]["kind"]["enum"] for option in verdict["anyOf"]] == [
        ["MET"],
        ["NOT_MET"],
    ]
    assert all(option["additionalProperties"] is False for option in verdict["anyOf"])


def test_structures_outside_the_subset_are_rejected():
    class Pair(BaseModel):
        span: tuple[int, int]

    with pytest.raises(ValueError, match="prefixItems"):
        strict_json_schema(Pair)
