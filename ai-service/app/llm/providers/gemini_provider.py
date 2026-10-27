"""Gemini through google-genai `generate_content` (CONTEXT D34).

`generate_content` keeps no state at Google, unlike the Interactions API whose default is
`store=true`. Field names were checked against google-genai 2.28.0 (story Implementation notes).
A document goes inline (`inline_data`, raw bytes) in the user turn before the prompt text, not
through the Files API, which would keep the file at Google for 48 hours (US-2.4, CONTEXT D37).
"""

from collections.abc import Mapping, Sequence
from typing import Any

import httpx
from google import genai
from google.genai import errors, types

from app.llm.providers import document_placeholder, fill_documents
from app.llm.types import (
    Document,
    Effort,
    LLMRequest,
    Provider,
    ProviderCallError,
    ProviderResponse,
    StopReason,
    Usage,
)

THINKING_LEVELS: Mapping[Effort, str] = {"low": "LOW", "medium": "MEDIUM", "high": "HIGH"}
"""gemini-3.8-flash accepts all three; a model without MEDIUM needs another mapping."""

REFUSAL_FINISH_REASONS = frozenset(
    {
        "SAFETY",
        "RECITATION",
        "BLOCKLIST",
        "PROHIBITED_CONTENT",
        "SPII",
        "IMAGE_SAFETY",
        "IMAGE_PROHIBITED_CONTENT",
        "IMAGE_RECITATION",
    }
)
UNSPECIFIED = frozenset({"FINISH_REASON_UNSPECIFIED", "BLOCKED_REASON_UNSPECIFIED"})
RETRYABLE_STATUS = frozenset({408, 429})

# The SDK does not retry unless told to. 3 attempts match the Anthropic SDK's default.
RETRY_ATTEMPTS = 3
TIMEOUT_MS = 600_000


def build_gemini_client(api_key: str) -> genai.Client:
    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(
            timeout=TIMEOUT_MS,
            retry_options=types.HttpRetryOptions(attempts=RETRY_ATTEMPTS),
        ),
    )


class GeminiProvider:
    name = Provider.GEMINI

    def __init__(
        self,
        client: Any,
        model: str,
        thinking_levels: Mapping[Effort, str] = THINKING_LEVELS,
    ) -> None:
        self._client = client
        self.model = model
        self._thinking_levels = thinking_levels

    def build_params(self, request: LLMRequest) -> dict[str, Any]:
        return {
            "model": self.model,
            "contents": _contents(request),
            "config": {
                "system_instruction": request.system,
                "response_mime_type": "application/json",
                "response_json_schema": request.output_schema,
                "thinking_config": {"thinking_level": self._thinking_levels[request.effort]},
                "max_output_tokens": request.max_output_tokens,
            },
        }

    async def send(
        self, params: dict[str, Any], documents: Sequence[Document] = ()
    ) -> ProviderResponse:
        call = fill_documents(params, documents, lambda data: data)
        try:
            response = await self._client.aio.models.generate_content(**call)
        except errors.APIError as error:
            status = error.code or 0
            retryable = status in RETRYABLE_STATUS or status >= 500
            raise ProviderCallError(str(error), retryable=retryable, status=status) from error
        except httpx.TransportError as error:
            raise ProviderCallError(f"network: {error!r}", retryable=True) from error
        return to_provider_response(response, self.model)


def _contents(request: LLMRequest) -> str | list[dict[str, Any]]:
    """The prompt alone, or one user turn with each document before the prompt text."""
    if not request.documents:
        return request.user
    parts: list[dict[str, Any]] = [
        {"inline_data": {"mime_type": ref.media_type, "data": document_placeholder(ref)}}
        for ref in request.documents
    ]
    parts.append({"text": request.user})
    return [{"role": "user", "parts": parts}]


def to_provider_response(response: types.GenerateContentResponse, model: str) -> ProviderResponse:
    common = {
        "model": response.model_version or model,
        "usage": _usage(response.usage_metadata),
        "raw_response": response.model_dump(
            mode="json", exclude_none=True, exclude={"sdk_http_response"}
        ),
    }
    feedback = response.prompt_feedback
    blocked = _code(feedback.block_reason) if feedback else None
    if blocked and blocked not in UNSPECIFIED:
        # The prompt itself was blocked: there is no candidate to read.
        return ProviderResponse(
            stop_reason=StopReason.REFUSAL,
            raw_stop_reason=f"BLOCKED_{blocked}",
            stop_category=blocked,
            **common,
        )
    candidate = response.candidates[0] if response.candidates else None
    finish = _code(candidate.finish_reason) if candidate else None
    if finish in REFUSAL_FINISH_REASONS:
        return ProviderResponse(
            stop_reason=StopReason.REFUSAL, raw_stop_reason=finish, stop_category=finish, **common
        )
    stop_reason = {"STOP": StopReason.END_TURN, "MAX_TOKENS": StopReason.MAX_TOKENS}.get(
        finish or "", StopReason.OTHER
    )
    return ProviderResponse(
        stop_reason=stop_reason, raw_stop_reason=finish, text=_text(candidate), **common
    )


def _code(value: Any) -> str | None:
    if value is None:
        return None
    return str(getattr(value, "value", value))


def _text(candidate: types.Candidate | None) -> str | None:
    """The answer's text parts; thought parts are reasoning, not the answer."""
    if candidate is None or candidate.content is None or not candidate.content.parts:
        return None
    parts = [part.text for part in candidate.content.parts if part.text and not part.thought]
    return "".join(parts) if parts else None


def _usage(metadata: types.GenerateContentResponseUsageMetadata | None) -> Usage:
    if metadata is None:
        return Usage()
    prompt = metadata.prompt_token_count or 0
    cached = metadata.cached_content_token_count or 0
    return Usage(
        # prompt_token_count includes the cached part.
        input_tokens=max(prompt - cached, 0),
        cache_read_tokens=cached,
        output_tokens=(metadata.candidates_token_count or 0) + (metadata.thoughts_token_count or 0),
    )
