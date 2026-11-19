"""OpenAI through the Batch API (US-2.9 AC-7, CONTEXT D46, D58).

Checked against openai 3.46.0 and the Batch guide on 2026-11-19:
- the requests go up as one JSONL file (`purpose="batch"`), one `{custom_id, method, url, body}`
  line each, `body` being the Chat Completions parameters of the synchronous adapter; a batch holds
  at most 50,000 requests or 200 MB and runs within `completion_window="24h"`;
- `completed` and `expired` batches can be read: an expired batch keeps the answers it finished in
  its output file and lists the rest in its error file with code `batch_expired`. `failed` (the file
  did not validate) and `cancelled` have nothing to read;
- output and error lines come in any order: `{custom_id, response: {status_code, body}, error}`.
  The files are read line by line as they download (`with_streaming_response`); a line that does
  not parse is skipped, so its request counts as unanswered and is resent;
- files: the input file is deleted once the batch is read, and expires after FILE_SECONDS anyway.
  Output and error files expire FILE_SECONDS after they are written instead of the default 30 days.
  They are not deleted on reading, because a poller that crashes before it commits reads them
  again; a file that is already gone counts as no answers, so its requests are resent.
"""

import json
import logging
from collections.abc import Awaitable, Mapping, Sequence
from typing import Any

import openai
from openai.types.chat import ChatCompletion

from app.llm.batch import BatchItemResult, BatchState, BatchStatus
from app.llm.providers.openai_provider import (
    ChatCompletionsProvider,
    api_errors,
    is_retryable,
    to_provider_response,
)
from app.llm.types import LLMRequest, Provider, ProviderCallError

logger = logging.getLogger(__name__)

ENDPOINT = "/v1/chat/completions"
MAX_REQUESTS = 50_000
MAX_BYTES = 150_000_000
"""Below the documented 200 MB, as the JSON we measure is not byte-for-byte the uploaded line."""
FILE_SECONDS = 2 * 24 * 60 * 60
"""Long enough for the 24-hour window and a poller that is down for a while; OpenAI accepts 1 hour
to 30 days."""
ENDED = frozenset({"completed", "expired"})
FAILED = frozenset({"failed", "cancelled"})


class OpenAIBatchProvider:
    name = Provider.OPENAI
    max_requests = MAX_REQUESTS
    max_bytes = MAX_BYTES

    def __init__(self, client: Any, model: str) -> None:
        self._client = client
        self.model = model
        self._sync = ChatCompletionsProvider(client, model, Provider.OPENAI)

    def build_params(self, request: LLMRequest) -> dict[str, Any]:
        if request.documents:
            raise ValueError("batch requests do not carry documents")
        return self._sync.build_params(request)

    async def submit(
        self, items: Sequence[tuple[str, dict[str, Any]]], *, display_name: str
    ) -> str:
        lines = "".join(
            json.dumps(
                {"custom_id": key, "method": "POST", "url": ENDPOINT, "body": params},
                ensure_ascii=False,
            )
            + "\n"
            for key, params in items
        )
        expiry = {"anchor": "created_at", "seconds": FILE_SECONDS}
        upload = await self._call(
            self._client.files.create(
                file=("requests.jsonl", lines.encode()), purpose="batch", expires_after=expiry
            )
        )
        try:
            batch = await self._call(
                self._client.batches.create(
                    input_file_id=upload.id,
                    endpoint=ENDPOINT,
                    completion_window="24h",
                    metadata={"display_name": display_name[:512]},
                    output_expires_after=expiry,
                )
            )
        except ProviderCallError:
            await self._delete(upload.id)
            raise
        return batch.id

    async def status(self, batch_id: str) -> BatchStatus:
        batch = await self._call(self._client.batches.retrieve(batch_id))
        if batch.status in ENDED:
            return BatchStatus(BatchState.ENDED, batch.status)
        if batch.status in FAILED:
            errors = batch.errors.data if batch.errors and batch.errors.data else []
            detail = "; ".join(f"{error.code}: {error.message}" for error in errors)
            return BatchStatus(BatchState.FAILED, detail or batch.status)
        return BatchStatus(BatchState.RUNNING, batch.status)

    async def results(
        self, batch_id: str, items: Mapping[str, dict[str, Any]], *, round_number: int
    ) -> list[BatchItemResult]:
        batch = await self._call(self._client.batches.retrieve(batch_id))
        results = []
        for file_id in (batch.output_file_id, batch.error_file_id):
            if file_id:
                results += await self._read(file_id)
        await self._delete(batch.input_file_id)
        return results

    async def _read(self, file_id: str) -> list[BatchItemResult]:
        results = []
        try:
            async with (
                api_errors(),
                self._client.files.with_streaming_response.content(file_id) as response,
            ):
                async for line in response.iter_lines():
                    if not line.strip():
                        continue
                    try:
                        results.append(_item(json.loads(line)))
                    except (ValueError, KeyError, TypeError) as error:
                        logger.warning("batch file %s: unreadable line skipped: %r", file_id, error)
        except ProviderCallError as error:
            if error.status != 404:
                raise
            logger.warning("batch file %s is gone; its requests count as unanswered", file_id)
            return []
        return results

    async def _delete(self, file_id: str) -> None:
        """Best-effort: the file expires on its own (FILE_SECONDS)."""
        try:
            await self._client.files.delete(file_id)
        except openai.NotFoundError:
            pass
        except openai.APIError as error:
            logger.warning("could not delete batch file %s: %s", file_id, error)

    async def _call[T](self, call: Awaitable[T]) -> T:
        async with api_errors():
            return await call


def _item(line: dict[str, Any]) -> BatchItemResult:
    key = line["custom_id"]
    response = _object(line.get("response"))
    status = response.get("status_code")
    body = _object(response.get("body"))
    if status == 200:
        if not body:
            return BatchItemResult(key, None, error="api_error: empty response body")
        try:
            return BatchItemResult(key, to_provider_response(ChatCompletion.construct(**body)))
        except ProviderCallError as error:
            return BatchItemResult(key, None, error=f"api_error: {error}", retryable=True)
    if line.get("error"):
        # A request the batch never ran, e.g. `batch_expired`.
        error = _object(line["error"])
        head = error.get("code") or "error"
    else:
        # A request the API answered with an error status.
        error = _object(body.get("error"))
        head = error.get("type") or error.get("code") or "error"
    retryable = is_retryable(status, error.get("code"), error.get("type"))
    return BatchItemResult(
        key, None, error=f"{head}: {error.get('message', '')}", retryable=retryable
    )


def _object(value: Any) -> dict[str, Any]:
    """A JSON object of a result line, or an empty one when the line holds something else
    (e.g. a plain-text body on a 502)."""
    return value if isinstance(value, dict) else {}
