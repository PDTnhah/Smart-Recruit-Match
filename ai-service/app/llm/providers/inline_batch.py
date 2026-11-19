"""Batches for a provider without a batch API, i.e. DeepSeek (US-2.9 AC-7, CONTEXT D58).

`submit` only names the batch. The requests run when the poller reads the results, through the
synchronous adapter, at most `concurrency` at a time. Each answer is stored in the llm-logs bucket
as soon as it arrives, under the batch id and its key, and a later read of the same batch sends
only the requests that have none. So a step that fails after the read (a log write, publishing the
answers, settling the round) or a worker that dies midway does not pay for the answers again;
requests that failed are sent again. The poller renews its lease while the requests run
(batch_poller `_keep_lease`); a poller that loses it anyway, because its renewals failed for a
whole lease, may overlap with the next one on the requests neither has an answer for yet. Parts
stay small (MAX_REQUESTS) to bound that. There is no batch discount: each request costs the normal
price (factory.build_batch_client).
"""

import asyncio
import logging
from collections.abc import Mapping, Sequence
from typing import Any
from uuid import uuid4

from app.llm.batch import BatchItemResult, BatchState, BatchStatus
from app.llm.providers import LLMProvider
from app.llm.recorder import ObjectStore
from app.llm.types import LLMRequest, ProviderCallError, ProviderResponse

logger = logging.getLogger(__name__)

BATCH_ID_PREFIX = "inline-"
ANSWERS_PREFIX = "inline-batches"
MAX_REQUESTS = 200
MAX_BYTES = 50_000_000
"""No provider limit; bounds what one part holds in memory."""


def answer_key(batch_id: str, key: str) -> str:
    return f"{ANSWERS_PREFIX}/{batch_id}/{key}.json"


class InlineBatchProvider:
    max_requests = MAX_REQUESTS
    max_bytes = MAX_BYTES

    def __init__(self, provider: LLMProvider, objects: ObjectStore, *, concurrency: int) -> None:
        if concurrency < 1:
            raise ValueError(f"concurrency must be at least 1, got {concurrency}")
        self._provider = provider
        self._objects = objects
        self._concurrency = concurrency
        self.name = provider.name
        self.model = provider.model

    def build_params(self, request: LLMRequest) -> dict[str, Any]:
        if request.documents:
            raise ValueError("batch requests do not carry documents")
        return self._provider.build_params(request)

    async def submit(
        self, items: Sequence[tuple[str, dict[str, Any]]], *, display_name: str
    ) -> str:
        return f"{BATCH_ID_PREFIX}{uuid4().hex}"

    async def status(self, batch_id: str) -> BatchStatus:
        return BatchStatus(BatchState.ENDED)

    async def results(
        self, batch_id: str, items: Mapping[str, dict[str, Any]], *, round_number: int
    ) -> list[BatchItemResult]:
        semaphore = asyncio.Semaphore(self._concurrency)

        async def send(key: str, params: dict[str, Any]) -> BatchItemResult:
            stored = await self._stored(batch_id, key)
            if stored is not None:
                return BatchItemResult(key, stored)
            async with semaphore:
                try:
                    response = await self._provider.send(params)
                except ProviderCallError as error:
                    # The head names the ai.results code (batch._failure_code).
                    head = "api_error" if error.retryable else "invalid_request_error"
                    return BatchItemResult(
                        key, None, error=f"{head}: {error}", retryable=error.retryable
                    )
                except Exception as error:
                    # One request must not cost the whole part a resend.
                    logger.exception("inline batch %s: request %s failed", batch_id, key)
                    return BatchItemResult(key, None, error=f"api_error: {error!r}")
            await self._keep(batch_id, key, response)
            return BatchItemResult(key, response)

        return list(await asyncio.gather(*(send(key, params) for key, params in items.items())))

    async def _stored(self, batch_id: str, key: str) -> ProviderResponse | None:
        try:
            document = await self._objects.get_json(answer_key(batch_id, key))
            return ProviderResponse.model_validate(document)
        except Exception:
            # Not answered yet; a store that cannot be read means the request is sent again.
            return None

    async def _keep(self, batch_id: str, key: str, response: ProviderResponse) -> None:
        try:
            await self._objects.put_json(
                answer_key(batch_id, key), response.model_dump(mode="json")
            )
        except Exception:
            logger.warning(
                "inline batch %s: answer to %s not stored, a later read sends it again",
                batch_id,
                key,
                exc_info=True,
            )
