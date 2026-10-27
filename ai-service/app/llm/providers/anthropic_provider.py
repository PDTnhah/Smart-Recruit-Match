"""Claude through the Anthropic SDK `beta.messages.create` (AD-10, CONTEXT D34).

Parameters follow the claude-api skill, checked against anthropic 1.11.0: effort and JSON schema
in `output_config`, no `temperature` (Opus 5.5 rejects sampling parameters), no `tool_choice`, and
server-side `fallbacks="default"` so a declined request is retried on Anthropic's fallback model.
A document is a base64 `document` block placed before the text block of the user turn; citations
stay off, as they cannot be combined with `output_config.format` (US-2.4, CONTEXT D37).
"""

import base64
from collections.abc import Sequence
from typing import Any

import anthropic

from app.llm.providers import document_placeholder, fill_documents
from app.llm.types import (
    Document,
    LLMRequest,
    Provider,
    ProviderCallError,
    ProviderResponse,
    StopReason,
    Usage,
)

FALLBACK_BETA = "server-side-fallback-2026-07-01"
MAX_RETRIES = 2
RETRYABLE_STATUS = frozenset({408, 409, 429})


def build_anthropic_client(api_key: str) -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=api_key, max_retries=MAX_RETRIES)


class AnthropicProvider:
    name = Provider.ANTHROPIC

    def __init__(self, client: Any, model: str) -> None:
        self._client = client
        self.model = model

    def build_params(self, request: LLMRequest) -> dict[str, Any]:
        return {
            "model": self.model,
            "max_tokens": request.max_output_tokens,
            "betas": [FALLBACK_BETA],
            "fallbacks": "default",
            "output_config": {
                "effort": request.effort,
                "format": {"type": "json_schema", "schema": request.output_schema},
            },
            "system": request.system,
            "messages": [{"role": "user", "content": _content(request)}],
        }

    async def send(
        self, params: dict[str, Any], documents: Sequence[Document] = ()
    ) -> ProviderResponse:
        call = fill_documents(params, documents, _base64)
        try:
            message = await self._client.beta.messages.create(**call)
        except anthropic.APIStatusError as error:
            status = error.status_code
            retryable = status in RETRYABLE_STATUS or status >= 500
            raise ProviderCallError(str(error), retryable=retryable, status=status) from error
        except anthropic.APIConnectionError as error:
            raise ProviderCallError(f"network: {error!r}", retryable=True) from error
        return to_provider_response(message)


def _content(request: LLMRequest) -> str | list[dict[str, Any]]:
    """The prompt alone, or a `document` block per document followed by the prompt text."""
    if not request.documents:
        return request.user
    blocks: list[dict[str, Any]] = [
        {
            "type": "document",
            "source": {
                "type": "base64",
                "media_type": ref.media_type,
                "data": document_placeholder(ref),
            },
        }
        for ref in request.documents
    ]
    blocks.append({"type": "text", "text": request.user})
    return blocks


def _base64(data: bytes) -> str:
    """Standard base64 without line breaks, as the API requires."""
    return base64.standard_b64encode(data).decode("ascii")


def to_provider_response(message: Any) -> ProviderResponse:
    usage = message.usage
    common = {
        "model": message.model,
        "raw_stop_reason": message.stop_reason,
        "usage": Usage(
            input_tokens=usage.input_tokens or 0,
            cache_read_tokens=usage.cache_read_input_tokens or 0,
            cache_write_tokens=usage.cache_creation_input_tokens or 0,
            output_tokens=usage.output_tokens or 0,
        ),
        "raw_response": message.model_dump(mode="json", exclude_none=True),
    }
    # Check the refusal before touching content (AGENTS › Gọi LLM).
    if message.stop_reason == "refusal":
        details = message.stop_details
        category = getattr(details, "category", None) if details else None
        return ProviderResponse(stop_reason=StopReason.REFUSAL, stop_category=category, **common)
    stop_reason = {"end_turn": StopReason.END_TURN, "max_tokens": StopReason.MAX_TOKENS}.get(
        message.stop_reason, StopReason.OTHER
    )
    text = next((block.text for block in message.content if block.type == "text"), None)
    return ProviderResponse(stop_reason=stop_reason, text=text, **common)
