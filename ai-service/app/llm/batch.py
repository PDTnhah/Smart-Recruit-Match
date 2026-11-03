"""Batch mode of the LLM layer (US-3.2 AC-7, AC-9, AC-14, AD-12, CONTEXT D46).

A batch trades latency for half the price: the provider runs the requests within 24 hours
(Claude) or 48 hours (Gemini). The flow is split so that no step holds a job message while the
provider works:

1. `split` cuts the requests of a round into parts that fit one provider batch.
2. `save_requests` stores a part's prompts in the llm-logs bucket, `submit` sends it.
3. `status` asks the provider whether the batch has ended (the poller does this, AC-17).
4. `collect` reads the results. Like StructuredLLMClient, it checks a refusal before the content,
   validates the JSON against the output model, and writes one ai.llm_calls row and one llm-logs
   file per request, with `batch_id` and the batch price (AC-14). It retries nothing itself: the
   caller resends refusals one by one and invalid, errored or expired requests in the next round.

Each request carries a key (Claude `custom_id`, Gemini request `metadata`) that names its item and
matches `^[a-zA-Z0-9_-]{1,64}$`, the stricter rule of the two providers.
"""

import json
import logging
import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Protocol
from uuid import UUID, uuid4

from pydantic import BaseModel, ValidationError

from app.llm.recorder import CallRecord, CallRecorder, ObjectStore
from app.llm.schema import strict_json_schema
from app.llm.types import (
    Effort,
    LLMRequest,
    Outcome,
    Provider,
    ProviderResponse,
    RenderedPrompt,
    StopReason,
    Usage,
)
from app.llm.usage import ModelPrice, cost_usd

logger = logging.getLogger(__name__)

BATCH_KEY = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
MAX_ERROR_LENGTH = 2000


@dataclass(frozen=True)
class BatchRequest:
    """One request of a batch: its key and its rendered prompt."""

    key: str
    prompt: RenderedPrompt

    def __post_init__(self) -> None:
        if not BATCH_KEY.match(self.key):
            raise ValueError(f"batch key must match {BATCH_KEY.pattern}: {self.key!r}")


class BatchState(StrEnum):
    RUNNING = "RUNNING"
    ENDED = "ENDED"
    """Results can be read; single requests may still have failed."""
    FAILED = "FAILED"
    """The whole batch failed, expired or was cancelled: there are no results."""


@dataclass(frozen=True)
class BatchStatus:
    state: BatchState
    detail: str | None = None


@dataclass(frozen=True)
class BatchItemResult:
    """What the provider returned for one request: an answer, or why there is none."""

    key: str
    response: ProviderResponse | None
    error: str | None = None
    retryable: bool = True
    """False when the provider rejected the request itself, which a resend cannot fix."""


class BatchProvider(Protocol):
    name: Provider
    model: str
    max_requests: int
    max_bytes: int
    """Limits of one provider batch; `split` keeps each part under both."""

    def build_params(self, request: LLMRequest) -> dict[str, Any]:
        """The parameters of one request, JSON-serialisable for the logs."""
        ...

    async def submit(
        self, items: Sequence[tuple[str, dict[str, Any]]], *, display_name: str
    ) -> str:
        """Sends (key, parameters) pairs as one batch and returns the provider's batch id. Raises
        ProviderCallError when the provider does not accept it."""
        ...

    async def status(self, batch_id: str) -> BatchStatus: ...

    async def results(
        self, batch_id: str, items: Mapping[str, dict[str, Any]], *, round_number: int
    ) -> list[BatchItemResult]:
        """One result per request the provider reports, in any order. `items` and `round_number`
        are for the fixture provider, which keys its replies by the parameters."""
        ...


@dataclass(frozen=True)
class BatchAnswer[T: BaseModel]:
    data: T
    model: str
    call_id: UUID


@dataclass(frozen=True)
class BatchRefusal:
    category: str | None


@dataclass(frozen=True)
class BatchFailure:
    code: str
    retry: bool
    """Worth sending again in the next round."""


type BatchOutcome[T: BaseModel] = BatchAnswer[T] | BatchRefusal | BatchFailure


@dataclass(frozen=True)
class _Judged[T: BaseModel]:
    outcome: Outcome
    data: T | None = None
    problem: str | None = None


def _judge[T: BaseModel](response: ProviderResponse, output_model: type[T]) -> _Judged[T]:
    """The outcome of one answer; a refusal is decided before the text is read
    (AGENTS › Gọi LLM)."""
    if response.stop_reason is StopReason.REFUSAL:
        return _Judged(Outcome.REFUSED)
    if response.stop_reason is StopReason.MAX_TOKENS:
        return _Judged(Outcome.TRUNCATED, problem="stopped at max_output_tokens")
    if response.stop_reason is not StopReason.END_TURN:
        return _Judged(Outcome.INVALID_OUTPUT, problem=f"unfinished ({response.raw_stop_reason})")
    try:
        return _Judged(
            Outcome.SUCCEEDED, data=output_model.model_validate_json(response.text or "")
        )
    except ValidationError as error:
        return _Judged(
            Outcome.INVALID_OUTPUT, problem=error.json(include_url=False, include_input=False)
        )


class StructuredBatchClient:
    def __init__(
        self,
        provider: BatchProvider,
        recorder: CallRecorder,
        objects: ObjectStore,
        *,
        pricing: Mapping[str, ModelPrice],
        max_output_tokens: int,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
        new_id: Callable[[], UUID] = uuid4,
    ) -> None:
        self._provider = provider
        self._recorder = recorder
        self._objects = objects
        self._pricing = pricing
        self._max_output_tokens = max_output_tokens
        self._clock = clock
        self._new_id = new_id

    @property
    def provider(self) -> Provider:
        return self._provider.name

    @property
    def model(self) -> str:
        return self._provider.model

    def split(
        self, requests: Sequence[BatchRequest], *, output_model: type[BaseModel], effort: Effort
    ) -> list[list[BatchRequest]]:
        """Consecutive parts, each within the provider's request count and size limits."""
        schema = strict_json_schema(output_model)
        parts: list[list[BatchRequest]] = []
        size = 0
        for request in requests:
            params = self._provider.build_params(self._request(request.prompt, schema, effort))
            item_size = len(json.dumps(params, ensure_ascii=False).encode())
            if item_size > self._provider.max_bytes:
                raise ValueError(f"request {request.key} alone exceeds one batch")
            current = parts[-1] if parts else None
            if (
                current is None
                or len(current) >= self._provider.max_requests
                or size + item_size > self._provider.max_bytes
            ):
                parts.append([])
                size = 0
            parts[-1].append(request)
            size += item_size
        return parts

    async def save_requests(self, key: str, requests: Sequence[BatchRequest]) -> None:
        """Keeps the prompts of one part, so a poller on any replica can read the results, log
        them and resend failed requests after the job message is gone (AC-17)."""
        await self._objects.put_json(
            key,
            {
                "requests": [
                    {
                        "key": request.key,
                        "prompt_version": request.prompt.prompt_version,
                        "system": request.prompt.system,
                        "shared": request.prompt.shared,
                        "user": request.prompt.user,
                    }
                    for request in requests
                ]
            },
        )

    async def load_requests(self, key: str) -> list[BatchRequest]:
        document = await self._objects.get_json(key)
        return [
            BatchRequest(
                key=item["key"],
                prompt=RenderedPrompt(
                    prompt_version=item["prompt_version"],
                    system=item["system"],
                    user=item["user"],
                    shared=item["shared"],
                ),
            )
            for item in document["requests"]
        ]

    async def submit(
        self,
        requests: Sequence[BatchRequest],
        *,
        output_model: type[BaseModel],
        effort: Effort,
        display_name: str,
    ) -> str:
        schema = strict_json_schema(output_model)
        items = [
            (
                request.key,
                self._provider.build_params(self._request(request.prompt, schema, effort)),
            )
            for request in requests
        ]
        return await self._provider.submit(items, display_name=display_name)

    async def status(self, batch_id: str) -> BatchStatus:
        return await self._provider.status(batch_id)

    async def collect[T: BaseModel](
        self,
        batch_id: str,
        requests: Sequence[BatchRequest],
        *,
        output_model: type[T],
        effort: Effort,
        job_id: UUID | None,
        batch_row_id: int,
        round_number: int,
        submitted_at: datetime | None,
    ) -> dict[str, BatchOutcome[T]]:
        """The outcome of every request of the batch, keyed like the requests. A request the
        provider reports nothing for counts as a failure worth a resend."""
        schema = strict_json_schema(output_model)
        params = {
            request.key: self._provider.build_params(self._request(request.prompt, schema, effort))
            for request in requests
        }
        by_key = {
            result.key: result
            for result in await self._provider.results(batch_id, params, round_number=round_number)
        }
        latency_ms = (
            max(round((self._clock() - submitted_at).total_seconds() * 1000), 0)
            if submitted_at
            else 0
        )
        outcomes: dict[str, BatchOutcome[T]] = {}
        for request in requests:
            result = by_key.get(request.key) or BatchItemResult(
                request.key, None, error="NO_RESULT"
            )
            context = _LogContext(
                request=self._request(request.prompt, schema, effort),
                params=params[request.key],
                job_id=job_id,
                batch_id=batch_id,
                batch_row_id=batch_row_id,
                round_number=round_number,
                key=request.key,
                latency_ms=latency_ms,
            )
            outcomes[request.key] = await self._outcome(result, output_model, context)
        return outcomes

    async def _outcome[T: BaseModel](
        self, result: BatchItemResult, output_model: type[T], context: "_LogContext"
    ) -> BatchOutcome[T]:
        response = result.response
        if response is None:
            await self._record(context, Outcome.API_ERROR, None, result.error, required=False)
            code = _failure_code(result.error)
            return BatchFailure(code=code, retry=result.retryable)
        judged = _judge(response, output_model)
        required = judged.outcome is Outcome.SUCCEEDED
        call_id = await self._record(
            context, judged.outcome, response, judged.problem, required=required
        )
        if judged.outcome is Outcome.SUCCEEDED:
            assert judged.data is not None
            return BatchAnswer(data=judged.data, model=response.model, call_id=call_id)
        if judged.outcome is Outcome.REFUSED:
            return BatchRefusal(category=response.stop_category)
        return BatchFailure(code=judged.outcome.value, retry=True)

    def _request(
        self, prompt: RenderedPrompt, schema: dict[str, Any], effort: Effort
    ) -> LLMRequest:
        return LLMRequest(
            agent=prompt.agent,
            prompt_version=prompt.prompt_version,
            system=prompt.system,
            user=prompt.user,
            output_schema=schema,
            effort=effort,
            max_output_tokens=self._max_output_tokens,
            shared=prompt.shared,
        )

    async def _record(
        self,
        context: "_LogContext",
        outcome: Outcome,
        response: ProviderResponse | None,
        error: str | None,
        *,
        required: bool,
    ) -> UUID:
        """Like StructuredLLMClient: the log of an answer that will be used must be written; the
        log of a failed request is best-effort."""
        call_id = self._new_id()
        started_at = self._clock()
        request = context.request
        model = response.model if response else self._provider.model
        usage = response.usage if response else None
        log_key = f"{request.agent}/{started_at:%Y}/{started_at:%m}/{call_id}.json"
        record = CallRecord(
            call_id=call_id,
            job_id=context.job_id,
            agent=request.agent,
            prompt_version=request.prompt_version,
            provider=self._provider.name,
            model=model,
            effort=request.effort,
            attempt=context.round_number,
            outcome=outcome,
            stop_reason=response.stop_reason if response else None,
            raw_stop_reason=response.raw_stop_reason if response else None,
            usage=usage or Usage(),
            cost_usd=cost_usd(model, usage, self._pricing) if usage else None,
            latency_ms=context.latency_ms,
            log_key=log_key,
            batch_id=context.batch_row_id,
        )
        log = {
            "call_id": str(call_id),
            "job_id": str(context.job_id) if context.job_id else None,
            "agent": request.agent,
            "prompt_version": request.prompt_version,
            "provider": self._provider.name,
            "attempt": context.round_number,
            "outcome": outcome,
            "started_at": started_at.isoformat(),
            "latency_ms": context.latency_ms,
            "batch": {
                "id": context.batch_row_id,
                "provider_batch_id": context.batch_id,
                "key": context.key,
            },
            "request": context.params,
            "response": response.model_dump(mode="json") if response else None,
            "error": error[:MAX_ERROR_LENGTH] if error else None,
        }
        try:
            await self._recorder.record(record, log)
        except Exception:
            if required:
                raise
            logger.exception("could not log batch request %s (%s)", context.key, outcome)
        return call_id


@dataclass(frozen=True)
class _LogContext:
    request: LLMRequest
    params: dict[str, Any]
    job_id: UUID | None
    batch_id: str
    batch_row_id: int
    round_number: int
    key: str
    latency_ms: int


def _failure_code(error: str | None) -> str:
    """ai.results code of a request the provider returned no answer for."""
    if error is None:
        return "LLM_ERROR"
    head = error.split(":", 1)[0].strip().upper()
    return {
        "EXPIRED": "EXPIRED",
        "CANCELED": "EXPIRED",
        "NO_RESULT": "NO_RESULT",
        "FIXTURE_MISSING": "LLM_FIXTURE_MISSING",
        "INVALID_REQUEST_ERROR": "LLM_BAD_REQUEST",
    }.get(head, "LLM_ERROR")
