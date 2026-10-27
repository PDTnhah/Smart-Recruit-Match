"""LLM settings from the environment (CONTEXT D34), in the style of app/config.py.

API keys live only in the AI Service (ARCHITECTURE › Security architecture). Only the key of the
selected provider is required, so tests and CI run with none (AC-11).
"""

import json
import os
from collections.abc import Mapping
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, ValidationError, model_validator

from app.llm.usage import DEFAULT_PRICES, ModelPrice

ProviderName = Literal["gemini", "anthropic", "fixture"]

DEFAULT_MODELS: Mapping[str, str] = {
    "gemini": "gemini-3.8-flash",
    "anthropic": "claude-opus-5-5",
    "fixture": "fixture",
}
DEFAULT_LOG_BUCKET = "llm-logs"


class LlmSettings(BaseModel):
    model_config = ConfigDict(frozen=True)

    provider: ProviderName = "gemini"
    model: str = Field(min_length=1)
    gemini_api_key: SecretStr | None = None
    anthropic_api_key: SecretStr | None = None
    max_output_tokens: int = Field(default=16_000, ge=1)
    pricing: dict[str, ModelPrice]
    prompt_versions: dict[str, str] = {}
    """Overrides of app/prompts/active.json, e.g. {"cv_parser": "cv_parser/v2"}."""
    fixtures_dir: Path | None = None
    log_bucket: str = Field(default=DEFAULT_LOG_BUCKET, min_length=3)
    minio_endpoint: str | None = Field(default=None, pattern=r"^https?://")
    minio_access_key: str | None = None
    minio_secret_key: SecretStr | None = None

    @model_validator(mode="after")
    def _key_of_selected_provider(self) -> "LlmSettings":
        if self.provider == "gemini" and self.gemini_api_key is None:
            raise ValueError("GEMINI_API_KEY is required when LLM_PROVIDER=gemini")
        if self.provider == "anthropic" and self.anthropic_api_key is None:
            raise ValueError("ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic")
        if self.provider == "fixture" and self.fixtures_dir is None:
            raise ValueError("LLM_FIXTURES_DIR is required when LLM_PROVIDER=fixture")
        return self


def load_llm_settings(environ: Mapping[str, str] = os.environ) -> LlmSettings:
    """Reads the LLM_*, GEMINI_API_KEY, ANTHROPIC_API_KEY and MINIO_* variables (DEPLOY.md).

    An empty value counts as unset, because compose passes unset optional variables as "".
    """

    def get(name: str) -> str | None:
        return environ.get(name) or None

    provider = (get("LLM_PROVIDER") or "gemini").lower()
    try:
        values = {
            "provider": provider,
            "model": get("LLM_MODEL") or DEFAULT_MODELS.get(provider, ""),
            "gemini_api_key": get("GEMINI_API_KEY"),
            "anthropic_api_key": get("ANTHROPIC_API_KEY"),
            "max_output_tokens": get("LLM_MAX_OUTPUT_TOKENS"),
            "pricing": {**DEFAULT_PRICES, **_json_object(get("LLM_PRICING"), "LLM_PRICING")},
            "prompt_versions": _json_object(get("LLM_PROMPT_VERSIONS"), "LLM_PROMPT_VERSIONS"),
            "fixtures_dir": get("LLM_FIXTURES_DIR"),
            "log_bucket": get("LLM_LOG_BUCKET"),
            "minio_endpoint": get("MINIO_ENDPOINT"),
            "minio_access_key": get("MINIO_ACCESS_KEY"),
            "minio_secret_key": get("MINIO_SECRET_KEY"),
        }
        return LlmSettings.model_validate({k: v for k, v in values.items() if v is not None})
    except (ValidationError, ValueError) as error:
        raise RuntimeError(f"Invalid environment variables:\n{error}") from error


def _json_object(raw: str | None, name: str) -> dict[str, object]:
    if raw is None:
        return {}
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError(f"{name} must be a JSON object")
    return value
