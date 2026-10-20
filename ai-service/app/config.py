"""Settings from the environment (CONTEXT D33). Compose sets them; see DEPLOY.md."""

import os
from collections.abc import Mapping

from pydantic import BaseModel, ConfigDict, Field, ValidationError


class Settings(BaseModel):
    model_config = ConfigDict(frozen=True)

    ai_database_url: str = Field(pattern=r"^postgres(ql)?://")
    """The ai_service role: reads the core.v_ai_* views, reads and writes schema ai (AD-4)."""
    rabbitmq_url: str = Field(pattern=r"^amqps?://")
    log_level: str = "INFO"


def load_settings(environ: Mapping[str, str] = os.environ) -> Settings:
    """Reads AI_DATABASE_URL, RABBITMQ_URL and LOG_LEVEL; an empty value counts as unset."""
    values = {
        "ai_database_url": environ.get("AI_DATABASE_URL") or None,
        "rabbitmq_url": environ.get("RABBITMQ_URL") or None,
        "log_level": (environ.get("LOG_LEVEL") or "INFO").upper(),
    }
    try:
        return Settings.model_validate({k: v for k, v in values.items() if v is not None})
    except ValidationError as error:
        raise RuntimeError(f"Invalid environment variables:\n{error}") from error
