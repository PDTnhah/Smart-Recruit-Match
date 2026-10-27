"""JD Analyzer: one structured LLM call that proposes the normalised requirements of a JD
(US-2.3, PRD GĐ1 step 2, FR-9, ARCHITECTURE › AI Service và các AI Agent).

1. Read the JD through core.v_ai_jd_source; read its original file from jd-files, if any.
2. Extract the file's visible text; hidden spans never reach the prompt (AC-12).
3. Put title, description and file text in one <jd_document> block (AGENTS › Invariant 6).
4. Call the LLMClient with effort low and the JdAnalysis schema (AD-10, AD-12).
5. Map each skill to the catalogue and write it under its catalogue name; a skill that two names
   map to is kept once. Names the catalogue lacks go to `new_skills` (US-2.5).

The agent only proposes: HR confirms, and the backend stores the result without changing the JD's
state (AD-1, CONTEXT D28). Every stored proposal names its model and prompt (Invariant 12).
"""

import logging
from collections.abc import Callable
from typing import Any, Self

import anyio
from pydantic import ConfigDict, model_validator

from app.consumers.errors import PermanentError, flag_hidden_text
from app.contracts.jd_analysis import JdAnalysis
from app.contracts.jd_analyze_job import JdAnalyzeJob
from app.contracts.jd_analyze_output import JdAnalyzeOutput
from app.contracts.jd_requirements import JdRequirements
from app.contracts.skill_match import SkillMatch
from app.embedding import SkillNormalizer, new_skill_names, skill_match_key
from app.llm.client import LLMClient
from app.llm.effort import EFFORT_BY_AGENT
from app.parsing import DocumentError, ExtractedText, RemovedSpan, clean_text, extract_text
from app.prompts.registry import PromptRegistry
from app.storage import JD_FILES_BUCKET, ObjectReader

from .source import JdSource, JdSourceRepo

logger = logging.getLogger(__name__)

AGENT = "jd_analyzer"
MAX_JD_CHARACTERS = 30_000
"""A JD is a page or two; anything longer is cut, so a padded file cannot inflate the cost."""
MAX_LOGGED_SPAN = 200
SKILL_GROUPS = ("must_have", "nice_to_have")


class CheckedJdAnalysis(JdAnalysis):
    """The generated contract plus what Zod checks and JSON Schema cannot carry: texts are trimmed
    before their length is checked (`.trim().min(1)`), and a skill appears once across both groups
    (superRefine). An answer that breaks either is invalid output, so the LLMClient asks again
    (US-2.2 AC-4) instead of the backend refusing the whole proposal. Zod compares skills by the
    catalogue key; two spellings of one skill ("React", "React.js") pass here and are merged after
    normalization (`_distinct_skills`), so they cost no second call."""

    # The schema sent to the LLM keeps the contract's description, not this docstring.
    model_config = ConfigDict(
        title="JdAnalysis",
        json_schema_extra={"description": "Structured output of the JD Analyzer"},
    )

    @model_validator(mode="after")
    def _as_zod_reads_it(self) -> Self:
        requirements = self.requirements
        conditions = requirements.hard_conditions
        texts = [
            *(item.skill for item in (*requirements.must_have, *requirements.nice_to_have)),
            *(major.root for major in conditions.majors),
            *(language.root for language in conditions.required_languages),
        ]
        if any(not text.strip() for text in texts):
            raise ValueError("skills, majors and languages must not be blank")
        seen: set[str] = set()
        for item in (*requirements.must_have, *requirements.nice_to_have):
            key = item.skill.strip().lower()
            if key in seen:
                raise ValueError(f"skill {item.skill!r} is listed more than once")
            seen.add(key)
        return self


class JdAnalyzer:
    """The JD_ANALYZE handler: called with the job, returns the result for ai.results."""

    def __init__(
        self,
        *,
        sources: JdSourceRepo,
        files: ObjectReader,
        llm: LLMClient,
        prompts: PromptRegistry,
        skills: SkillNormalizer,
        extract: Callable[[bytes], ExtractedText] = extract_text,
    ) -> None:
        self._sources = sources
        self._files = files
        self._llm = llm
        self._prompts = prompts
        self._skills = skills
        self._extract = extract

    async def __call__(self, job: JdAnalyzeJob) -> JdAnalyzeOutput:
        source = await self._sources.fetch(job.jd_id, job.jd_version)
        if source is None:
            raise PermanentError(
                f"JD {job.jd_id} v{job.jd_version} is no longer awaiting analysis",
                code="JD_SOURCE_NOT_FOUND",
            )
        extracted = await self._read_file(source) if source.file_key else None
        jd_text, removed = compose_jd_text(source, extracted)
        if removed:
            _log_removed(source, removed)
        try:
            if not jd_text:
                raise PermanentError(f"JD {source.jd_id} has no readable text", code="JD_NO_TEXT")
            prompt = self._prompts.render(AGENT, {"jd_text": jd_text})
            result = await self._llm.generate(
                prompt=prompt,
                output_model=CheckedJdAnalysis,
                effort=EFFORT_BY_AGENT[AGENT],
                job_id=job.job_id,
            )
        except Exception as error:
            # A failed analysis still tells staff the file hid text (AC-12).
            if removed:
                flag_hidden_text(error)
            raise
        requirements, new_skills = await self._normalised(result.data.requirements)
        return JdAnalyzeOutput(
            prompt_version=result.prompt_version,
            model=result.model,
            jd_id=job.jd_id,
            jd_version=job.jd_version,
            requirements=requirements,
            position_group=result.data.position_group,
            new_skills=new_skills,
            hidden_text_detected=bool(removed),
        )

    async def _normalised(self, requirements: JdRequirements) -> tuple[JdRequirements, list[str]]:
        """Skills under their catalogue names, each once, and the names the catalogue lacks."""
        data = requirements.model_dump(mode="json")
        items = [item for group in SKILL_GROUPS for item in data[group]]
        mappings = await self._skills.normalize([item["skill"] for item in items])
        for item, mapping in zip(items, mappings, strict=True):
            item["skill"] = mapping.canonical_name or mapping.name
        new_skills = new_skill_names(m.name for m in mappings if m.match is SkillMatch.NEW)
        return JdRequirements.model_validate(_distinct_skills(data)), new_skills

    async def _read_file(self, source: JdSource) -> ExtractedText:
        assert source.file_key is not None
        data = await self._files.get_bytes(JD_FILES_BUCKET, source.file_key)
        try:
            return await anyio.to_thread.run_sync(self._extract, data)
        except DocumentError as error:
            raise PermanentError(
                f"JD {source.jd_id}: {error}", code="JD_FILE_UNREADABLE"
            ) from error


def _distinct_skills(requirements: dict[str, Any]) -> dict[str, Any]:
    """One entry per skill key, so two names of one skill do not break the contract rule: the
    must-have copy wins over the nice-to-have one, and within a group the higher weight wins."""
    seen: dict[str, tuple[str, int]] = {}
    distinct: dict[str, list[dict[str, Any]]] = {group: [] for group in SKILL_GROUPS}
    for group in SKILL_GROUPS:
        for item in requirements[group]:
            key = skill_match_key(item["skill"])
            if key not in seen:
                seen[key] = (group, len(distinct[group]))
                distinct[group].append(item)
                continue
            first_group, index = seen[key]
            if first_group == group and item["weight"] > distinct[group][index]["weight"]:
                distinct[group][index] = item
    return {**requirements, **distinct}


def compose_jd_text(
    source: JdSource, extracted: ExtractedText | None
) -> tuple[str, tuple[RemovedSpan, ...]]:
    """The text that goes inside <jd_document>, and every hidden span dropped on the way.

    Empty when there is nothing but a title: a title alone is not enough to propose requirements.
    A file without a text layer (a scan) adds nothing (CONTEXT D35: HR enters them by hand).
    """
    title, title_removed = clean_text(source.title.strip(), "title")
    description, description_removed = clean_text((source.raw_text or "").strip(), "description")
    removed = (*title_removed, *description_removed)
    body = [description]
    if extracted is not None:
        body.append(extracted.text)
        removed = (*removed, *extracted.removed)
    body_text = "\n\n".join(part for part in body if part.strip())
    if not body_text:
        return "", removed
    text = f"# {title}\n\n{body_text}"
    if len(text) > MAX_JD_CHARACTERS:
        logger.warning(
            "jd %s: text cut from %d to %d characters", source.jd_id, len(text), MAX_JD_CHARACTERS
        )
        text = text[:MAX_JD_CHARACTERS]
    return text, removed


def _log_removed(source: JdSource, removed: tuple[RemovedSpan, ...]) -> None:
    """The job log keeps what was dropped, for staff; the prompt never sees it (US-2.4 AC-2)."""
    logger.warning(
        "jd %s v%s: removed %d hidden span(s): %s",
        source.jd_id,
        source.version,
        len(removed),
        "; ".join(
            f"[{span.reason} {span.location}] {span.text[:MAX_LOGGED_SPAN]!r}" for span in removed
        ),
    )
