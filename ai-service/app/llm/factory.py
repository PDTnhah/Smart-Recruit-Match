"""Builds the LLMClient and its MinIO stores from LlmSettings (CONTEXT D34, D35).

app/worker.py builds them once at startup; evals/smoke_llm.py builds its own.
"""

from minio import Minio

from app.llm.providers import LLMProvider
from app.llm.providers.anthropic_provider import AnthropicProvider, build_anthropic_client
from app.llm.providers.fixture_provider import FixtureProvider
from app.llm.providers.gemini_provider import GeminiProvider, build_gemini_client
from app.llm.recorder import CallRecorder, LlmCallStore, MinioObjectStore, ObjectStore
from app.llm.settings import LlmSettings
from app.llm.structured import StructuredLLMClient
from app.prompts.files import load_active, load_manifest
from app.prompts.registry import PromptRegistry
from app.storage import MinioObjectReader, minio_client


def build_provider(settings: LlmSettings) -> LLMProvider:
    if settings.provider == "gemini":
        assert settings.gemini_api_key is not None  # checked by LlmSettings
        client = build_gemini_client(settings.gemini_api_key.get_secret_value())
        return GeminiProvider(client, settings.model)
    if settings.provider == "anthropic":
        assert settings.anthropic_api_key is not None
        client = build_anthropic_client(settings.anthropic_api_key.get_secret_value())
        return AnthropicProvider(client, settings.model)
    assert settings.fixtures_dir is not None
    return FixtureProvider(settings.fixtures_dir, settings.model)


def build_llm_client(
    settings: LlmSettings, *, objects: ObjectStore, calls: LlmCallStore
) -> StructuredLLMClient:
    return StructuredLLMClient(
        build_provider(settings),
        CallRecorder(objects, calls),
        pricing=settings.pricing,
        max_output_tokens=settings.max_output_tokens,
    )


def build_log_store(settings: LlmSettings) -> MinioObjectStore:
    return MinioObjectStore(_minio(settings), settings.log_bucket)


def build_file_reader(settings: LlmSettings) -> MinioObjectReader:
    """Uploaded files (jd-files), read with the same MinIO account as the llm-logs bucket."""
    return MinioObjectReader(_minio(settings))


def _minio(settings: LlmSettings) -> Minio:
    if not (settings.minio_endpoint and settings.minio_access_key and settings.minio_secret_key):
        raise RuntimeError("MINIO_ENDPOINT, MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required")
    return minio_client(
        settings.minio_endpoint,
        settings.minio_access_key,
        settings.minio_secret_key.get_secret_value(),
    )


def build_prompt_registry(settings: LlmSettings) -> PromptRegistry:
    """Production prompts: only released, unchanged files render, even when
    LLM_PROMPT_VERSIONS points elsewhere (AD-12)."""
    return PromptRegistry(
        active={**load_active(), **settings.prompt_versions}, manifest=load_manifest()
    )
