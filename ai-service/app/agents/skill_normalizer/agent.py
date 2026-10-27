"""Skill normalizer: suggestions for the new skills awaiting ADMIN (US-2.5 AC-6, FR-13, PRD GĐ2
step 3, ARCHITECTURE › Bản đồ sử dụng LLM theo giai đoạn).

1. Read the skills of the job that still await review (core.v_ai_skill_candidates) and the
   catalogue (core.v_ai_skills). Skills reviewed since the job was sent are skipped.
2. Call the LLMClient with effort low: names and catalogue are data blocks (AGENTS › Invariant 6).
3. Keep what the guardrails accept: a suggestion for a skill of the job, once; similar skills that
   are in the catalogue, under their catalogue names.

The LLM only suggests (AD-2): the backend stores the suggestion with its model and prompt, and
ADMIN decides. Names the catalogue already has never reach this agent: the catalogue maps them
without an LLM (app/embedding/skill_normalizer.py).
"""

import logging
from typing import Any

from annotated_types import MaxLen
from pydantic import ConfigDict, model_validator

from app.consumers.errors import PermanentError
from app.contracts.skill_normalize_job import SkillNormalizeJob
from app.contracts.skill_normalize_output import SkillNormalizeOutput
from app.contracts.skill_suggestion import SkillSuggestion
from app.contracts.skill_suggestions import SkillSuggestions
from app.embedding import (
    CatalogSkill,
    SkillCandidate,
    SkillCatalog,
    names_by_key,
    skill_match_key,
)
from app.llm.client import LLMClient
from app.llm.effort import EFFORT_BY_AGENT
from app.prompts.registry import PromptRegistry

logger = logging.getLogger(__name__)

AGENT = "skill_normalizer"
MAX_SIMILAR_SKILLS = next(
    rule.max_length
    for rule in SkillSuggestion.model_fields["similar_skills"].metadata
    if isinstance(rule, MaxLen)
)
"""The contract's limit (packages/shared/contracts/skills.ts), read from the generated model."""


class CheckedSkillSuggestions(SkillSuggestions):
    """The generated contract read as Zod reads it: names are trimmed before their length is
    checked (`.trim().min(1)`), so a blank name is invalid output and the LLMClient asks again
    (US-2.2 AC-4)."""

    # The schema sent to the LLM keeps the contract's description, not this docstring.
    model_config = ConfigDict(
        title="SkillSuggestions",
        json_schema_extra={"description": "Structured output of the skill normalizer"},
    )

    @model_validator(mode="before")
    @classmethod
    def _trimmed(cls, data: Any) -> Any:
        if not isinstance(data, dict) or not isinstance(data.get("suggestions"), list):
            return data
        suggestions = []
        for item in data["suggestions"]:
            if isinstance(item, dict):
                item = {
                    **item,
                    "canonical_name": _strip(item.get("canonical_name")),
                    "similar_skills": [_strip(name) for name in item.get("similar_skills") or []],
                }
            suggestions.append(item)
        return {**data, "suggestions": suggestions}


class SkillNormalizerAgent:
    """The SKILL_NORMALIZE handler: called with the job, returns the result for ai.results."""

    def __init__(self, *, catalog: SkillCatalog, llm: LLMClient, prompts: PromptRegistry) -> None:
        self._catalog = catalog
        self._llm = llm
        self._prompts = prompts

    async def __call__(self, job: SkillNormalizeJob) -> SkillNormalizeOutput:
        candidates = await self._catalog.candidates([skill_id.root for skill_id in job.skill_ids])
        if not candidates:
            # Every skill was reviewed meanwhile; the backend ignores a failed suggestion job.
            raise PermanentError(
                f"no skill of job {job.job_id} awaits review", code="SKILLS_NOT_PENDING"
            )
        catalogue = await self._catalog.approved()
        prompt = self._prompts.render(
            AGENT,
            {
                "catalogue": [{"name": s.canonical_name, "group": s.group} for s in catalogue],
                "skills": [{"skill_id": c.skill_id, "name": c.name} for c in candidates],
            },
        )
        result = await self._llm.generate(
            prompt=prompt,
            output_model=CheckedSkillSuggestions,
            effort=EFFORT_BY_AGENT[AGENT],
            job_id=job.job_id,
        )
        return SkillNormalizeOutput(
            prompt_version=result.prompt_version,
            model=result.model,
            suggestions=guarded(result.data.suggestions, candidates, catalogue),
        )


def guarded(
    suggestions: list[SkillSuggestion],
    candidates: list[SkillCandidate],
    catalogue: list[CatalogSkill],
) -> list[SkillSuggestion]:
    """Guardrails on the LLM answer (PRD › Kiểm soát rủi ro AI): a suggestion only for a skill of
    the job, the first one if repeated; similar skills only from the catalogue, by catalogue name,
    each once. A canonical name that is a catalogue skill's spelling names that skill as similar."""
    wanted = {candidate.skill_id for candidate in candidates}
    by_key = names_by_key(catalogue)
    kept: dict[int, SkillSuggestion] = {}
    dropped = 0
    for suggestion in suggestions:
        if suggestion.skill_id not in wanted or suggestion.skill_id in kept:
            dropped += 1
            continue
        names = [suggestion.canonical_name, *(name.root for name in suggestion.similar_skills)]
        similar = list(
            dict.fromkeys(by_key[key] for key in map(skill_match_key, names) if key in by_key)
        )
        kept[suggestion.skill_id] = SkillSuggestion.model_validate(
            {**suggestion.model_dump(mode="json"), "similar_skills": similar[:MAX_SIMILAR_SKILLS]}
        )
    if dropped:
        logger.warning("skill normalizer: dropped %d suggestion(s) for unknown skills", dropped)
    return [kept[skill_id] for skill_id in sorted(kept)]


def _strip(value: Any) -> Any:
    return value.strip() if isinstance(value, str) else value
