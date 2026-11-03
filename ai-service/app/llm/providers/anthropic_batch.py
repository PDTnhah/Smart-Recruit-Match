"""Claude through the Message Batches API (US-3.2 AC-7, AC-9, CONTEXT D46).

Checked against the claude-api skill and the Batch processing page on 2026-11-03, for anthropic
1.11.0 (`client.messages.batches`, no beta):
- each request is `{custom_id, params}`; `custom_id` matches `^[a-zA-Z0-9_-]{1,64}$`; a batch holds
  at most 100,000 requests or 256 MB, and expires 24 hours after creation;
- `params` are those of the synchronous adapter without `betas` and `fallbacks`: server-side
  fallback is not available in batches, so a refused request is resent on its own through
  LLMClient;
- the shared block is cached with the 1-hour TTL, because the requests of a batch can run more than
  5 minutes apart; cache hits are best-effort;
- results come as JSONL in any order: `succeeded` (a refusal is a succeeded message with
  `stop_reason: "refusal"`), `errored`, `canceled` or `expired`; only `succeeded` is billed.
"""

from collections.abc import Mapping, Sequence
from typing import Any

import anthropic

from app.llm.batch import BatchItemResult, BatchState, BatchStatus
from app.llm.providers.anthropic_provider import to_provider_response, user_content
from app.llm.types import LLMRequest, Provider, ProviderCallError

MAX_REQUESTS = 100_000
MAX_BYTES = 200_000_000
"""Below the documented 256 MB, as the JSON we measure is not byte-for-byte what the SDK sends."""
CACHE_CONTROL = {"type": "ephemeral", "ttl": "1h"}
RETRYABLE_STATUS = frozenset({408, 409, 429})
PERMANENT_ERROR_TYPES = frozenset({"invalid_request_error"})


class AnthropicBatchProvider:
    name = Provider.ANTHROPIC
    max_requests = MAX_REQUESTS
    max_bytes = MAX_BYTES

    def __init__(self, client: Any, model: str) -> None:
        self._client = client
        self.model = model

    def build_params(self, request: LLMRequest) -> dict[str, Any]:
        if request.documents:
            raise ValueError("batch requests do not carry documents")
        return {
            "model": self.model,
            "max_tokens": request.max_output_tokens,
            "output_config": {
                "effort": request.effort,
                "format": {"type": "json_schema", "schema": request.output_schema},
            },
            "system": request.system,
            "messages": [{"role": "user", "content": user_content(request, CACHE_CONTROL)}],
        }

    async def submit(
        self, items: Sequence[tuple[str, dict[str, Any]]], *, display_name: str
    ) -> str:
        # Message Batches have no display name; ai.llm_batches keeps the link to the job.
        requests = [{"custom_id": key, "params": params} for key, params in items]
        batch = await self._call(self._client.messages.batches.create(requests=requests))
        return batch.id

    async def status(self, batch_id: str) -> BatchStatus:
        batch = await self._call(self._client.messages.batches.retrieve(batch_id))
        if batch.processing_status == "ended":
            return BatchStatus(BatchState.ENDED)
        return BatchStatus(BatchState.RUNNING, batch.processing_status)

    async def results(
        self, batch_id: str, items: Mapping[str, dict[str, Any]], *, round_number: int
    ) -> list[BatchItemResult]:
        decoder = await self._call(self._client.messages.batches.results(batch_id))
        results = []
        async for line in decoder:
            results.append(_item(line))
        return results

    async def _call(self, call: Any) -> Any:
        try:
            return await call
        except anthropic.APIStatusError as error:
            status = error.status_code
            retryable = status in RETRYABLE_STATUS or status >= 500
            raise ProviderCallError(str(error), retryable=retryable, status=status) from error
        except anthropic.APIConnectionError as error:
            raise ProviderCallError(f"network: {error!r}", retryable=True) from error


def _item(line: Any) -> BatchItemResult:
    result = line.result
    if result.type == "succeeded":
        return BatchItemResult(line.custom_id, to_provider_response(result.message))
    if result.type == "errored":
        error_type = getattr(result.error.error, "type", "error")
        message = getattr(result.error.error, "message", "")
        return BatchItemResult(
            line.custom_id,
            None,
            error=f"{error_type}: {message}",
            retryable=error_type not in PERMANENT_ERROR_TYPES,
        )
    return BatchItemResult(line.custom_id, None, error=result.type)
