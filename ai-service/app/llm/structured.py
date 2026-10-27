"""The LLMClient every provider shares (AC-2 to AC-7, PRD › Kiểm soát rủi ro AI, CONTEXT D34).

For each attempt, at most MAX_ATTEMPTS:
1. Send. A provider failure left after the SDK's own retries is logged, then raised as
   RetryableError (outage, rate limit) or PermanentError (bad request, bad key). Any other error
   from the adapter is logged and raised unchanged.
2. A refusal is logged and raised as NeedsHumanReview, without reading the answer.
3. A truncated, unfinished or schema-invalid answer is logged and the same request is sent again.
   Resending it unchanged keeps the prompt prefix cacheable.
4. A valid answer is logged and returned with the model that actually answered.

Every attempt writes one ai.llm_calls row and one llm-logs file. The log of an answer that will be
used is required: if it cannot be written, the error propagates and the job layer retries, because
PRD › guardrails asks for a trace of every call that affects a score. The log of a failed attempt
is best-effort: a logging outage must not hide the refusal or error being raised.
"""

import logging
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ValidationError

from app.consumers.errors import NeedsHumanReview, PermanentError, RetryableError
from app.llm.providers import LLMProvider
from app.llm.recorder import CallRecord, CallRecorder
from app.llm.schema import strict_json_schema
from app.llm.types import (
    EFFORTS,
    Document,
    Effort,
    LLMRequest,
    LLMResult,
    Outcome,
    ProviderCallError,
    ProviderResponse,
    RenderedPrompt,
    StopReason,
    Usage,
)
from app.llm.usage import ModelPrice, cost_usd

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 3
"""The first call plus at most 2 retries on invalid output (PRD › guardrails)."""
MAX_ERROR_LENGTH = 2000


@dataclass(frozen=True)
class _Attempt:
    request: LLMRequest
    params: dict[str, Any]
    job_id: UUID | None
    number: int
    call_id: UUID
    started_at: datetime
    started: float

    @property
    def log_key(self) -> str:
        return f"{self.request.agent}/{self.started_at:%Y}/{self.started_at:%m}/{self.call_id}.json"


class StructuredLLMClient:
    def __init__(
        self,
        provider: LLMProvider,
        recorder: CallRecorder,
        *,
        pricing: Mapping[str, ModelPrice],
        max_output_tokens: int,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
        timer: Callable[[], float] = time.perf_counter,
        new_id: Callable[[], UUID] = uuid4,
    ) -> None:
        self._provider = provider
        self._recorder = recorder
        self._pricing = pricing
        self._max_output_tokens = max_output_tokens
        self._clock = clock
        self._timer = timer
        self._new_id = new_id

    async def generate[T: BaseModel](
        self,
        *,
        prompt: RenderedPrompt,
        output_model: type[T],
        effort: Effort,
        job_id: UUID | None,
        max_output_tokens: int | None = None,
        documents: Sequence[Document] = (),
    ) -> LLMResult[T]:
        if effort not in EFFORTS:
            raise ValueError(f"effort must be one of {EFFORTS}, got {effort!r}")
        if max_output_tokens is not None and max_output_tokens < 1:
            raise ValueError(f"max_output_tokens must be at least 1, got {max_output_tokens}")
        request = LLMRequest(
            agent=prompt.agent,
            prompt_version=prompt.prompt_version,
            system=prompt.system,
            user=prompt.user,
            output_schema=strict_json_schema(output_model),
            effort=effort,
            max_output_tokens=max_output_tokens or self._max_output_tokens,
            documents=tuple(document.ref for document in documents),
        )
        params = self._provider.build_params(request)
        problems: list[str] = []
        for number in range(1, MAX_ATTEMPTS + 1):
            attempt = _Attempt(
                request=request,
                params=params,
                job_id=job_id,
                number=number,
                call_id=self._new_id(),
                started_at=self._clock(),
                started=self._timer(),
            )
            try:
                response = await self._provider.send(params, documents)
            except ProviderCallError as error:
                await self._record_failure(attempt, Outcome.API_ERROR, None, str(error))
                if error.retryable:
                    raise RetryableError(f"{request.agent}: LLM call failed: {error}") from error
                raise PermanentError(
                    f"{request.agent}: LLM rejected the request: {error}", code="LLM_BAD_REQUEST"
                ) from error
            except Exception as error:
                # Not classified by the adapter (e.g. an unexpected SDK reply): log it, then let
                # the job layer treat it as it treats any unknown error.
                await self._record_failure(attempt, Outcome.API_ERROR, None, repr(error))
                raise

            if response.stop_reason is StopReason.REFUSAL:
                await self._record_failure(attempt, Outcome.REFUSED, response)
                category = response.stop_category or "no category"
                raise NeedsHumanReview(
                    f"{request.agent}: the model refused ({category})",
                    code="LLM_REFUSED",
                    category=response.stop_category,
                )
            if response.stop_reason is StopReason.MAX_TOKENS:
                await self._record_failure(attempt, Outcome.TRUNCATED, response)
                problems.append(
                    f"attempt {number}: stopped at max_output_tokens={request.max_output_tokens}"
                )
                continue
            if response.stop_reason is not StopReason.END_TURN:
                await self._record_failure(attempt, Outcome.INVALID_OUTPUT, response)
                problems.append(f"attempt {number}: unfinished ({response.raw_stop_reason})")
                continue
            try:
                data = output_model.model_validate_json(response.text or "")
            except ValidationError as error:
                message = error.json(include_url=False, include_input=False)
                await self._record_failure(attempt, Outcome.INVALID_OUTPUT, response, message)
                problems.append(f"attempt {number}: {error.error_count()} schema errors")
                continue
            await self._record(attempt, Outcome.SUCCEEDED, response)
            return LLMResult(
                data=data,
                model=response.model,
                prompt_version=request.prompt_version,
                call_id=attempt.call_id,
            )
        raise NeedsHumanReview(
            f"{request.agent}: no valid output after {MAX_ATTEMPTS} attempts: "
            + "; ".join(problems),
            code="LLM_INVALID_OUTPUT",
        )

    async def _record_failure(
        self,
        attempt: _Attempt,
        outcome: Outcome,
        response: ProviderResponse | None,
        error: str | None = None,
    ) -> None:
        try:
            await self._record(attempt, outcome, response, error)
        except Exception:
            logger.exception(
                "could not log LLM call %s (%s, attempt %d, %s)",
                attempt.call_id,
                attempt.request.agent,
                attempt.number,
                outcome,
            )

    async def _record(
        self,
        attempt: _Attempt,
        outcome: Outcome,
        response: ProviderResponse | None,
        error: str | None = None,
    ) -> None:
        latency_ms = round((self._timer() - attempt.started) * 1000)
        request = attempt.request
        model = response.model if response else self._provider.model
        usage = response.usage if response else None
        record = CallRecord(
            call_id=attempt.call_id,
            job_id=attempt.job_id,
            agent=request.agent,
            prompt_version=request.prompt_version,
            provider=self._provider.name,
            model=model,
            effort=request.effort,
            attempt=attempt.number,
            outcome=outcome,
            stop_reason=response.stop_reason if response else None,
            raw_stop_reason=response.raw_stop_reason if response else None,
            usage=usage or Usage(),
            cost_usd=cost_usd(model, usage, self._pricing) if usage else None,
            latency_ms=latency_ms,
            log_key=attempt.log_key,
        )
        log = {
            "call_id": str(attempt.call_id),
            "job_id": str(attempt.job_id) if attempt.job_id else None,
            "agent": request.agent,
            "prompt_version": request.prompt_version,
            "provider": self._provider.name,
            "attempt": attempt.number,
            "outcome": outcome,
            "started_at": attempt.started_at.isoformat(),
            "latency_ms": latency_ms,
            "request": attempt.params,
            "response": response.model_dump(mode="json") if response else None,
            "error": error[:MAX_ERROR_LENGTH] if error else None,
        }
        await self._recorder.record(record, log)
