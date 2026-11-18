"""OpenAI and DeepSeek through the `openai` SDK's Chat Completions (AD-10, CONTEXT D34, D58).

DeepSeek's API is compatible with Chat Completions, so one adapter serves both; `dialect` picks the
parameters that differ. Checked on 2026-11-19 against openai 3.46.0 and both providers' docs:

- OpenAI: `response_format` `json_schema`, strict only when every object lists all its properties in
  `required` (a rule of strict mode; Pydantic validates every answer either way). `reasoning_effort`
  low/medium/high, `max_completion_tokens`, `store: false` so OpenAI keeps no copy for distillation
  or evals. A `shared` block ends with an explicit `prompt_cache_breakpoint`, so requests that
  repeat it read `system` + `shared` from the cache (CONTEXT D46). A document is a `file` part whose
  `file_data` is a `data:application/pdf;base64,` URL.
- DeepSeek: `response_format` `json_object` only, which checks that the answer is JSON but not its
  schema, and needs the word "json" in the prompt. A second, fixed system message after the
  prompt's own carries the JSON Schema, so the versioned prompt stays unchanged and the cached
  prefix stays free of per-call data. The user message is one string, as DeepSeek documents it: the
  `shared` block, then the prompt. `reasoning_effort` has no `medium` (DeepSeek reads it as `high`,
  sent as such so the logs say what ran), `max_tokens`, no `store`. DeepSeek reads PDFs only
  through its Files API (`file_id`), so a request with a document is refused before it is sent.
- The refusal is checked before the content: `message.refusal` (DeepSeek fills it when an attached
  file fails its safety review) or `finish_reason: content_filter`. DeepSeek's
  `insufficient_system_resource` and `aborted` are interruptions on its side: a retryable error.
- No `temperature` and no tools (D34).
"""

import base64
import json
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from typing import Any

import openai

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

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
MAX_RETRIES = 2
TIMEOUT_SECONDS = 600
RETRYABLE_STATUS = frozenset({408, 409, 429})
BILLING_ERROR_CODES = frozenset(
    {
        "insufficient_quota",
        "credit_balance_exhausted",
        "organization_spend_limit_exceeded",
        "project_spend_limit_exceeded",
        "organization_usage_limit_exceeded",
    }
)
"""429s that a retry cannot fix: the account is out of credit or over its spend limit."""
INTERRUPTED = frozenset({"insufficient_system_resource", "aborted"})
"""DeepSeek finish reasons for a generation its servers cut short."""
DEEPSEEK_EFFORT: dict[Effort, str] = {"low": "low", "medium": "high", "high": "high"}
SCHEMA_INSTRUCTION = (
    "Reply with a single json object and no other text. The object must follow this JSON Schema:\n"
)
PDF_DATA_URL = "data:application/pdf;base64,"

DIALECTS = (Provider.OPENAI, Provider.DEEPSEEK)


def build_openai_client(api_key: str) -> openai.AsyncOpenAI:
    return openai.AsyncOpenAI(api_key=api_key, max_retries=MAX_RETRIES, timeout=TIMEOUT_SECONDS)


def build_deepseek_client(api_key: str) -> openai.AsyncOpenAI:
    return openai.AsyncOpenAI(
        api_key=api_key,
        base_url=DEEPSEEK_BASE_URL,
        max_retries=MAX_RETRIES,
        timeout=TIMEOUT_SECONDS,
    )


class ChatCompletionsProvider:
    def __init__(self, client: Any, model: str, dialect: Provider) -> None:
        if dialect not in DIALECTS:
            raise ValueError(f"Chat Completions dialect must be one of {DIALECTS}, got {dialect}")
        self._client = client
        self.model = model
        self.name = dialect

    def build_params(self, request: LLMRequest) -> dict[str, Any]:
        messages: list[dict[str, Any]] = [{"role": "system", "content": request.system}]
        if self.name is Provider.DEEPSEEK:
            messages.append({"role": "system", "content": schema_instruction(request)})
        messages.append({"role": "user", "content": self._user_content(request)})
        if self.name is Provider.DEEPSEEK:
            return {
                "model": self.model,
                "messages": messages,
                "response_format": {"type": "json_object"},
                "reasoning_effort": DEEPSEEK_EFFORT[request.effort],
                "max_tokens": request.max_output_tokens,
            }
        return {
            "model": self.model,
            "messages": messages,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": request.agent,
                    "schema": request.output_schema,
                    "strict": lists_every_property(request.output_schema),
                },
            },
            "reasoning_effort": request.effort,
            "max_completion_tokens": request.max_output_tokens,
            "store": False,
        }

    async def send(
        self, params: dict[str, Any], documents: Sequence[Document] = ()
    ) -> ProviderResponse:
        if documents and self.name is Provider.DEEPSEEK:
            raise ProviderCallError(
                "DeepSeek reads PDFs only through its Files API; a scanned CV needs "
                "LLM_PROVIDER=openai, gemini or anthropic",
                retryable=False,
            )
        call = fill_documents(params, documents, _pdf_data_url)
        async with api_errors():
            completion = await self._client.chat.completions.create(**call)
        return to_provider_response(completion)

    def _user_content(self, request: LLMRequest) -> str | list[dict[str, Any]]:
        """The prompt alone, or the `shared` block, a `file` part per document and the prompt text,
        in that order. DeepSeek takes one string; its prefix cache matches bytes, so the shared
        block stays cached without a breakpoint."""
        if self.name is Provider.DEEPSEEK:
            return request.user if request.shared is None else f"{request.shared}\n\n{request.user}"
        if not request.documents and request.shared is None:
            return request.user
        parts: list[dict[str, Any]] = []
        if request.shared is not None:
            parts.append(
                {
                    "type": "text",
                    "text": request.shared,
                    "prompt_cache_breakpoint": {"mode": "explicit"},
                }
            )
        parts += [
            {
                "type": "file",
                "file": {
                    "filename": f"{ref.sha256[:16]}.pdf",
                    "file_data": document_placeholder(ref),
                },
            }
            for ref in request.documents
        ]
        parts.append({"type": "text", "text": request.user})
        return parts


def schema_instruction(request: LLMRequest) -> str:
    """The fixed system message that gives DeepSeek the agent's output schema. Sorted keys keep it
    byte-identical across calls, so it stays in the cached prefix."""
    schema = json.dumps(request.output_schema, sort_keys=True, ensure_ascii=False)
    return SCHEMA_INSTRUCTION + schema


def lists_every_property(schema: dict[str, Any]) -> bool:
    """Whether OpenAI's strict mode accepts the schema: every object must list all of its
    properties in `required`. strict_json_schema keeps Pydantic's `required`, so a model with a
    default value fails this and is sent with `strict: false`."""
    properties = schema.get("properties", {})
    if set(schema.get("required", ())) != set(properties):
        return False
    children = [*properties.values(), *schema.get("anyOf", ())]
    if "items" in schema:
        children.append(schema["items"])
    return all(lists_every_property(child) for child in children)


def is_retryable(status: int | None, code: Any, error_type: Any) -> bool:
    """408, 409, 429, 5xx and no status at all (the request never ran) are worth another try,
    except a 429 for an exhausted balance or spend limit. 400, 401, 402 (DeepSeek: no balance
    left) and 422 are not. Shared by synchronous calls and batch result lines."""
    if code in BILLING_ERROR_CODES or error_type == "insufficient_quota":
        return False
    return status is None or status in RETRYABLE_STATUS or status >= 500


@asynccontextmanager
async def api_errors() -> AsyncIterator[None]:
    """Turns the SDK's API and connection errors into ProviderCallError."""
    try:
        yield
    except openai.APIStatusError as error:
        status = error.status_code
        retryable = is_retryable(status, error.code, error.type)
        raise ProviderCallError(str(error), retryable=retryable, status=status) from error
    except openai.APIConnectionError as error:
        raise ProviderCallError(f"network: {error!r}", retryable=True) from error


def to_provider_response(completion: Any) -> ProviderResponse:
    if not completion.choices:
        raise ProviderCallError("reply has no choices", retryable=True)
    choice = completion.choices[0]
    finish_reason = choice.finish_reason
    if finish_reason in INTERRUPTED:
        raise ProviderCallError(f"generation interrupted: {finish_reason}", retryable=True)
    common = {
        "model": completion.model,
        "raw_stop_reason": finish_reason,
        "usage": usage_of(completion.usage),
        # warnings=False: DeepSeek's own finish reasons are outside the SDK's Literal.
        "raw_response": completion.model_dump(mode="json", exclude_none=True, warnings=False),
    }
    # Check the refusal before touching content (AGENTS › Gọi LLM).
    if choice.message.refusal is not None or finish_reason == "content_filter":
        category = "content_filter" if finish_reason == "content_filter" else None
        return ProviderResponse(stop_reason=StopReason.REFUSAL, stop_category=category, **common)
    stop_reason = {"stop": StopReason.END_TURN, "length": StopReason.MAX_TOKENS}.get(
        finish_reason, StopReason.OTHER
    )
    return ProviderResponse(stop_reason=stop_reason, text=choice.message.content, **common)


def usage_of(usage: Any) -> Usage:
    """`prompt_tokens` counts every input token, cached or not. OpenAI reports cache reads in
    `prompt_tokens_details.cached_tokens` and writes in `cache_write_tokens`; DeepSeek reports
    reads in `prompt_cache_hit_tokens` (and the same number in `cached_tokens`) and bills no
    writes. `completion_tokens` includes reasoning tokens, billed as output by both."""
    if usage is None:
        return Usage()
    details = usage.prompt_tokens_details
    cache_read = _count(details, "cached_tokens") or _count(usage, "prompt_cache_hit_tokens")
    cache_write = _count(details, "cache_write_tokens")
    return Usage(
        input_tokens=max(usage.prompt_tokens - cache_read - cache_write, 0),
        cache_read_tokens=cache_read,
        cache_write_tokens=cache_write,
        output_tokens=usage.completion_tokens or 0,
    )


def _count(node: Any, name: str) -> int:
    return (getattr(node, name, None) or 0) if node is not None else 0


def _pdf_data_url(data: bytes) -> str:
    """Documents are PDFs only (DocumentType)."""
    return PDF_DATA_URL + base64.standard_b64encode(data).decode("ascii")
