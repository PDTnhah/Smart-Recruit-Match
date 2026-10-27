"""Embedding of a CV profile (ARCHITECTURE › Pipeline CV Parser step 8, US-2.5 AC-9, BR-03).

Built from `profile_masked` only, never from `pii`: the text holds the skills (catalogue names
first), the summary, projects, experience, education, certificates and languages, in a fixed order,
so the same profile always gives the same vector. US-3.2 compares it with JD embeddings to pick
the top-M JDs before matching.
"""

from typing import Any

from app.contracts.cv_profile import CvProfile

from .model import Embedder
from .store import EmbeddingRow, EmbeddingStore

MAX_PROFILE_TEXT = 4000
"""Characters; the model reads 512 tokens anyway, and skills come first."""


def profile_text(profile: CvProfile) -> str:
    data = profile.model_dump(mode="json")
    parts: list[str] = []
    skills = [skill["canonical_name"] or skill["name"] for skill in data["skills"]]
    if skills:
        parts.append("Skills: " + ", ".join(skills))
    if data["summary"]:
        parts.append(data["summary"])
    for project in data["projects"]:
        technologies = ", ".join(project["technologies"])
        parts.append(_line(project["name"], project["role"], technologies, project["description"]))
    for job in data["experience"]:
        parts.append(_line(job["position"], job["organization"], job["description"]))
    for school in data["education"]:
        parts.append(_line(school["degree"], school["major"], school["institution"]))
    certificates = ", ".join(certificate["name"] for certificate in data["certificates"])
    if certificates:
        parts.append("Certificates: " + certificates)
    for language in data["languages"]:
        parts.append(_line(language["language"], language["level"]))
    return "\n".join(parts)[:MAX_PROFILE_TEXT]


def _line(*values: Any) -> str:
    return " - ".join(value for value in values if value)


class ProfileEmbeddings:
    def __init__(self, *, store: EmbeddingStore, embedder: Embedder) -> None:
        self._store = store
        self._embedder = embedder

    async def store_cv(self, cv_id: int, cv_version: int, profile_masked: CvProfile) -> None:
        """Upserts the vector of (cv, cv_id, cv_version, model) (AC-9)."""
        [vector] = await self._embedder.embed([profile_text(profile_masked)])
        await self._store.upsert(
            "cv", self._embedder.model, [EmbeddingRow(cv_id, cv_version, vector)]
        )
