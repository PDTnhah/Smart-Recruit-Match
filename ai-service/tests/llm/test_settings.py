"""US-2.2 TASK-2.2.2.4: LLM settings from the environment (CONTEXT D34)."""

import json
from pathlib import Path

import pytest

from app.llm.settings import load_llm_settings
from app.llm.usage import DEFAULT_PRICES


def test_defaults_to_gemini_with_its_model():
    settings = load_llm_settings({"GEMINI_API_KEY": "g-key"})
    assert (settings.provider, settings.model) == ("gemini", "gemini-3.8-flash")
    assert settings.gemini_api_key.get_secret_value() == "g-key"
    assert (settings.max_output_tokens, settings.log_bucket) == (16000, "llm-logs")
    assert settings.pricing == dict(DEFAULT_PRICES)


def test_anthropic_uses_claude_by_default():
    settings = load_llm_settings({"LLM_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "a-key"})
    assert settings.model == "claude-opus-5-5"


def test_only_the_selected_provider_needs_a_key():
    with pytest.raises(RuntimeError, match="GEMINI_API_KEY is required"):
        load_llm_settings({})
    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY is required"):
        load_llm_settings({"LLM_PROVIDER": "anthropic", "GEMINI_API_KEY": "g-key"})
    with pytest.raises(RuntimeError, match="LLM_FIXTURES_DIR is required"):
        load_llm_settings({"LLM_PROVIDER": "fixture"})


def test_empty_values_count_as_unset():
    # Compose passes unset optional variables as "" (LESSONS §14).
    settings = load_llm_settings(
        {"GEMINI_API_KEY": "g-key", "LLM_MODEL": "", "MINIO_ENDPOINT": "", "LLM_PRICING": ""}
    )
    assert settings.model == "gemini-3.8-flash"
    assert settings.minio_endpoint is None


def test_compose_defaults_start_without_a_key():
    """deploy/docker-compose.yml with an empty deploy/.env (US-2.3, CONTEXT D35)."""
    settings = load_llm_settings(
        {
            "LLM_PROVIDER": "fixture",
            "LLM_MODEL": "",
            "GEMINI_API_KEY": "",
            "ANTHROPIC_API_KEY": "",
            "LLM_FIXTURES_DIR": "/tmp/llm-fixtures",
            "MINIO_ENDPOINT": "http://minio:9000",
            "MINIO_ACCESS_KEY": "srm-minio",
            "MINIO_SECRET_KEY": "change-me-minio",
        }
    )
    assert (settings.provider, settings.model) == ("fixture", "fixture")
    assert settings.gemini_api_key is None


def test_overrides_from_the_environment(tmp_path: Path):
    settings = load_llm_settings(
        {
            "LLM_PROVIDER": "FIXTURE",
            "LLM_FIXTURES_DIR": str(tmp_path),
            "LLM_MODEL": "gemini-3.8-flash",
            "LLM_MAX_OUTPUT_TOKENS": "8000",
            "LLM_PRICING": json.dumps(
                {"gemini-3.8-flash": {"input": 1.5, "output": 7.5, "cache_read": 0.15}}
            ),
            "LLM_PROMPT_VERSIONS": '{"cv_parser": "cv_parser/v2"}',
            "MINIO_ENDPOINT": "http://minio:9000",
        }
    )
    assert settings.provider == "fixture"
    assert settings.max_output_tokens == 8000
    assert settings.pricing["gemini-3.8-flash"].input == 1.5
    assert "claude-opus-5-5" in settings.pricing
    assert settings.prompt_versions == {"cv_parser": "cv_parser/v2"}


def test_secrets_do_not_leak_in_repr():
    settings = load_llm_settings({"GEMINI_API_KEY": "g-secret-key"})
    assert "g-secret-key" not in repr(settings)


@pytest.mark.parametrize(
    "environ",
    [
        {"GEMINI_API_KEY": "k", "LLM_PROVIDER": "openai"},
        {"GEMINI_API_KEY": "k", "LLM_PRICING": "[1, 2]"},
        {"GEMINI_API_KEY": "k", "LLM_PRICING": "{not json"},
        {"GEMINI_API_KEY": "k", "MINIO_ENDPOINT": "minio:9000"},
        {"GEMINI_API_KEY": "k", "LLM_MAX_OUTPUT_TOKENS": "0"},
    ],
)
def test_invalid_values_are_reported(environ):
    with pytest.raises(RuntimeError, match="Invalid environment variables"):
        load_llm_settings(environ)
