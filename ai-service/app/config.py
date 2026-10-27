"""Settings from the environment (CONTEXT D33). Compose sets them; see DEPLOY.md."""

import os
from collections.abc import Mapping
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

# Compose shares LOG_LEVEL with the API, whose pino levels include trace, fatal and silent.
PINO_TO_PYTHON = {"TRACE": "DEBUG", "FATAL": "CRITICAL", "SILENT": "CRITICAL"}

DEFAULT_SKILL_MATCH_THRESHOLD = 0.85
"""ARCHITECTURE › Pipeline CV Parser, measured with bge-m3 in CONTEXT D39."""


class Settings(BaseModel):
    model_config = ConfigDict(frozen=True)

    ai_database_url: str = Field(pattern=r"^postgres(ql)?://")
    """The ai_service role: reads the core.v_ai_* views, reads and writes schema ai (AD-4)."""
    rabbitmq_url: str = Field(pattern=r"^amqps?://")
    log_level: str = Field(default="INFO", pattern=r"^(DEBUG|INFO|WARNING|WARN|ERROR|CRITICAL)$")
    cv_mask_contacts: bool = True
    """Mask emails and phone numbers of a CV before the LLM (US-2.4 AC-5, NFR-3)."""
    fake_file_keys: bool = False
    """Let `__fake__/...` file keys fail on purpose, for the end-to-end test of retries and the
    DLQ only (US-2.1, CONTEXT D37). Never set in compose."""
    embedding_provider: Literal["bge-m3", "hashing"] = "bge-m3"
    """BAAI/bge-m3 (AD-11), or the deterministic fake that needs no model; compose defaults to
    the fake, as it does LLM_PROVIDER=fixture, and the image to the provider it was built with
    (US-2.5, CONTEXT D39)."""
    skill_match_threshold: float = Field(default=DEFAULT_SKILL_MATCH_THRESHOLD, gt=0, le=1)
    """Lowest cosine similarity that maps a skill name to the catalogue (US-2.5 AC-4)."""


def load_settings(environ: Mapping[str, str] = os.environ) -> Settings:
    """Reads AI_DATABASE_URL, RABBITMQ_URL, LOG_LEVEL, CV_MASK_CONTACTS, AI_FAKE_FILE_KEYS,
    EMBEDDING_PROVIDER and SKILL_MATCH_THRESHOLD; an empty value counts as unset."""
    values = {
        "ai_database_url": environ.get("AI_DATABASE_URL") or None,
        "rabbitmq_url": environ.get("RABBITMQ_URL") or None,
        "log_level": _python_level(environ.get("LOG_LEVEL") or "INFO"),
        "cv_mask_contacts": environ.get("CV_MASK_CONTACTS") or None,
        "fake_file_keys": environ.get("AI_FAKE_FILE_KEYS") or None,
        "embedding_provider": (environ.get("EMBEDDING_PROVIDER") or "").lower() or None,
        "skill_match_threshold": environ.get("SKILL_MATCH_THRESHOLD") or None,
    }
    try:
        return Settings.model_validate({k: v for k, v in values.items() if v is not None})
    except ValidationError as error:
        raise RuntimeError(f"Invalid environment variables:\n{error}") from error


def _python_level(value: str) -> str:
    level = value.upper()
    return PINO_TO_PYTHON.get(level, level)
