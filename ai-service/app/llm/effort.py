"""Reasoning depth per agent, from ARCHITECTURE › Bản đồ sử dụng LLM theo giai đoạn (AD-10).

Agents pass `effort=EFFORT_BY_AGENT[...]` explicitly; LLMClient has no default (AC-2). Claude
takes it as `output_config.effort`, Gemini as `thinking_level` (CONTEXT D34).
"""

from types import MappingProxyType

from app.llm.types import Effort

EFFORT_BY_AGENT: MappingProxyType[str, Effort] = MappingProxyType(
    {
        "jd_analyzer": "low",
        "cv_parser": "low",
        "skill_normalizer": "low",
        "hr_summary": "low",
        "rejection_summary": "low",
        "matching": "medium",
        "cv_verification": "medium",
        "test_generator": "high",
        "validator": "high",
        "grader": "high",
    }
)
