"""The CV entries part C may ask about, taken from `profile_masked` (US-4.8 AC-2, AC-3, BR-03).

A claim is one project, one work experience or one listed skill, named by its list and position:
`{section: PROJECT, index: 0}` is the first project. Only the fields below reach a prompt, so a
field added to the profile later stays out until someone adds it here. The label shown to staff
is written by code from the same entry, never by the LLM.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from app.contracts.cv_claim_ref import CvClaimRef
from app.contracts.cv_claim_section import CvClaimSection

SECTION_LISTS = {
    CvClaimSection.PROJECT: "projects",
    CvClaimSection.EXPERIENCE: "experience",
    CvClaimSection.SKILLS_LIST: "skills",
}
"""The list of `profile_masked` each claim section indexes."""
PROJECT_FIELDS = ("name", "role", "description", "technologies", "start", "end")
EXPERIENCE_FIELDS = ("organization", "position", "description", "start", "end")
MAX_INDEX = 99
"""CvClaimRef.index ≤ 99: entries past it cannot be named."""


@dataclass(frozen=True)
class Claim:
    section: CvClaimSection
    index: int
    label: str
    entry: dict[str, Any]
    """What a prompt shows of the entry."""

    @property
    def key(self) -> tuple[CvClaimSection, int]:
        return (self.section, self.index)

    @property
    def ref(self) -> CvClaimRef:
        return CvClaimRef(section=self.section, index=self.index)

    def prompt_item(self) -> dict[str, Any]:
        return {"section": self.section.value, "index": self.index, "entry": self.entry}


def claims_of(profile_masked: Mapping[str, Any]) -> list[Claim]:
    """Every entry with a name, projects first, then experience, then skills."""
    claims: list[Claim] = []
    for section, list_name in SECTION_LISTS.items():
        for index, item in enumerate(profile_masked.get(list_name) or []):
            if index > MAX_INDEX or not isinstance(item, Mapping):
                break
            claim = _claim(section, index, item)
            if claim is not None:
                claims.append(claim)
    return claims


def claim_key_of(ref: Mapping[str, Any] | CvClaimRef) -> tuple[CvClaimSection, int]:
    if isinstance(ref, CvClaimRef):
        return (ref.section, ref.index)
    return (CvClaimSection(ref["section"]), int(ref["index"]))


def _claim(section: CvClaimSection, index: int, item: Mapping[str, Any]) -> Claim | None:
    match section:
        case CvClaimSection.PROJECT:
            label = _text(item.get("name"))
            entry = {field: item.get(field) for field in PROJECT_FIELDS}
        case CvClaimSection.EXPERIENCE:
            organization = _text(item.get("organization"))
            position = _text(item.get("position"))
            label = f"{position} · {organization}" if position and organization else organization
            entry = {field: item.get(field) for field in EXPERIENCE_FIELDS}
        case CvClaimSection.SKILLS_LIST:
            label = _text(item.get("name"))
            entry = {"name": item.get("name")}
    return Claim(section, index, label, entry) if label else None


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""
