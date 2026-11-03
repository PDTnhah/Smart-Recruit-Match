"""Gemini through the Batch API with inline requests (US-3.2 AC-7, AC-9, CONTEXT D46).

Checked against ai.google.dev (Batch API page) and the types of google-genai 2.28.0 on 2026-11-03:
- `client.aio.batches.create(model=, src=[InlinedRequest], config={"display_name": ...})`; each
  inline request takes `contents`, `config` (system instruction, JSON schema and thinking level as
  in `generate_content`) and `metadata`, a string map that comes back with its response: it
  carries the key. Inline requests of one batch must stay under 20 MB in total;
- the job ends in JOB_STATE_SUCCEEDED (or PARTIALLY_SUCCEEDED) with `dest.inlined_responses`, each a
  `response` or an `error`; FAILED, CANCELLED and EXPIRED leave no results. A job targets 24 hours
  and expires after 48;
- batch requests cost half; the page names explicit caching only, so whether implicit caching hits
  inside a batch is measured on a real run (`cache_read_tokens`), not assumed.
"""

from collections.abc import Mapping, Sequence
from typing import Any

import httpx
from google.genai import errors

from app.llm.batch import BatchItemResult, BatchState, BatchStatus
from app.llm.providers.gemini_provider import GeminiProvider, to_provider_response
from app.llm.types import LLMRequest, Provider, ProviderCallError

MAX_REQUESTS = 100_000
MAX_BYTES = 18_000_000
"""Below the documented 20 MB of inline requests: the JSON we measure is not the exact payload."""
KEY_FIELD = "key"
ENDED_STATES = frozenset({"JOB_STATE_SUCCEEDED", "JOB_STATE_PARTIALLY_SUCCEEDED"})
FAILED_STATES = frozenset({"JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED"})
RETRYABLE_STATUS = frozenset({408, 429})


class GeminiBatchProvider:
    name = Provider.GEMINI
    max_requests = MAX_REQUESTS
    max_bytes = MAX_BYTES

    def __init__(self, client: Any, model: str) -> None:
        self._client = client
        self.model = model
        self._requests = GeminiProvider(client, model)

    def build_params(self, request: LLMRequest) -> dict[str, Any]:
        if request.documents:
            raise ValueError("batch requests do not carry documents")
        params = self._requests.build_params(request)
        return {"contents": params["contents"], "config": params["config"]}

    async def submit(
        self, items: Sequence[tuple[str, dict[str, Any]]], *, display_name: str
    ) -> str:
        src = [{**params, "metadata": {KEY_FIELD: key}} for key, params in items]
        job = await self._call(
            self._client.aio.batches.create(
                model=self.model, src=src, config={"display_name": display_name}
            )
        )
        return job.name

    async def status(self, batch_id: str) -> BatchStatus:
        job = await self._call(self._client.aio.batches.get(name=batch_id))
        state = _code(job.state)
        if state in ENDED_STATES:
            return BatchStatus(BatchState.ENDED)
        if state in FAILED_STATES:
            detail = job.error.message if job.error and job.error.message else None
            return BatchStatus(BatchState.FAILED, f"{state}: {detail}" if detail else state)
        return BatchStatus(BatchState.RUNNING, state)

    async def results(
        self, batch_id: str, items: Mapping[str, dict[str, Any]], *, round_number: int
    ) -> list[BatchItemResult]:
        job = await self._call(self._client.aio.batches.get(name=batch_id))
        responses = (job.dest.inlined_responses if job.dest else None) or []
        keys = list(items)
        results = []
        for index, inline in enumerate(responses):
            key = (inline.metadata or {}).get(KEY_FIELD)
            if key is None:
                # The page does not promise the order; metadata is the contract, position the
                # last resort for a reply that lost it.
                key = keys[index] if len(responses) == len(keys) else f"unknown-{index}"
            if inline.response is not None:
                results.append(
                    BatchItemResult(key, to_provider_response(inline.response, self.model))
                )
            else:
                code = inline.error.code if inline.error else None
                message = inline.error.message if inline.error else "no response"
                results.append(
                    BatchItemResult(
                        key,
                        None,
                        error=f"{'INVALID_REQUEST_ERROR' if code == 400 else 'ERROR'}: {message}",
                        retryable=code != 400,
                    )
                )
        return results

    async def _call(self, call: Any) -> Any:
        try:
            return await call
        except errors.APIError as error:
            status = error.code or 0
            retryable = status in RETRYABLE_STATUS or status >= 500
            raise ProviderCallError(str(error), retryable=retryable, status=status) from error
        except httpx.TransportError as error:
            raise ProviderCallError(f"network: {error!r}", retryable=True) from error


def _code(value: Any) -> str | None:
    if value is None:
        return None
    return str(getattr(value, "value", value))
