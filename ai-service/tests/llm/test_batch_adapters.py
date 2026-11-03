"""US-3.2 AC-7, AC-9, AC-14: the batch adapters, read against the SDKs' own types (CONTEXT D46).

The SDK clients are stand-ins; the replies are built with anthropic 1.11.0 and google-genai 2.28.0
models, so a renamed field fails here.
"""

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from anthropic.types.messages import MessageBatchIndividualResponse
from google.genai import types

from app.llm.batch import (
    BatchFailure,
    BatchRequest,
    BatchState,
    StructuredBatchClient,
)
from app.llm.providers.anthropic_batch import AnthropicBatchProvider
from app.llm.providers.anthropic_provider import AnthropicProvider
from app.llm.providers.fixture_batch import FixtureBatchProvider
from app.llm.providers.fixture_provider import FixtureProvider, fixture_key
from app.llm.providers.gemini_batch import GeminiBatchProvider
from app.llm.providers.gemini_provider import GeminiProvider
from app.llm.recorder import CallRecorder
from app.llm.types import LLMRequest, RenderedPrompt, StopReason
from app.llm.usage import DEFAULT_BATCH_PRICES

pytestmark = pytest.mark.anyio

REQUEST = LLMRequest(
    agent="echo",
    prompt_version="echo/v1",
    system="Rubric.",
    user="CV.",
    output_schema={"type": "object", "properties": {"echo": {"type": "string"}}},
    effort="medium",
    max_output_tokens=1000,
    shared="JD.",
)
ANSWER = '{"echo": "hi", "length": 2}'


def claude_message(**fields: Any) -> dict[str, Any]:
    return {
        "id": "msg_1",
        "type": "message",
        "role": "assistant",
        "model": "claude-opus-5-5",
        "content": [{"type": "text", "text": ANSWER}],
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {
            "input_tokens": 100,
            "cache_read_input_tokens": 900,
            "cache_creation_input_tokens": 0,
            "output_tokens": 50,
        },
        **fields,
    }


def line(custom_id: str, result: dict[str, Any]) -> MessageBatchIndividualResponse:
    return MessageBatchIndividualResponse.model_validate({"custom_id": custom_id, "result": result})


class Lines:
    def __init__(self, *items: Any) -> None:
        self._items = items

    def __aiter__(self):
        return self._gen()

    async def _gen(self):
        for item in self._items:
            yield item


def anthropic_client(*, status: str = "ended", lines: tuple = ()) -> Any:
    async def retrieve(batch_id: str) -> Any:
        return SimpleNamespace(processing_status=status)

    async def results(batch_id: str) -> Any:
        return Lines(*lines)

    return SimpleNamespace(
        messages=SimpleNamespace(batches=SimpleNamespace(retrieve=retrieve, results=results))
    )


def test_gd3_claude_sync_request_caches_the_shared_block() -> None:
    params = AnthropicProvider(None, "claude-opus-5-5").build_params(REQUEST)
    assert params["fallbacks"] == "default"
    assert params["messages"][0]["content"] == [
        {"type": "text", "text": "JD.", "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": "CV."},
    ]


def test_gd3_claude_batch_request_has_no_fallbacks_and_a_one_hour_cache() -> None:
    params = AnthropicBatchProvider(None, "claude-opus-5-5").build_params(REQUEST)
    assert "fallbacks" not in params and "betas" not in params
    assert params["messages"][0]["content"][0]["cache_control"] == {
        "type": "ephemeral",
        "ttl": "1h",
    }


def test_gd3_gemini_sync_request_puts_the_shared_block_first() -> None:
    params = GeminiProvider(None, "gemini-3.8-flash").build_params(REQUEST)
    assert params["contents"] == [{"role": "user", "parts": [{"text": "JD."}, {"text": "CV."}]}]


async def test_gd3_claude_batch_status_and_results() -> None:
    running = AnthropicBatchProvider(anthropic_client(status="in_progress"), "claude-opus-5-5")
    assert (await running.status("b")).state is BatchState.RUNNING

    refused = claude_message(
        stop_reason="refusal",
        content=[],
        stop_details={"type": "refusal", "category": "cyber", "explanation": None},
    )
    provider = AnthropicBatchProvider(
        anthropic_client(
            lines=(
                line("a", {"type": "succeeded", "message": claude_message()}),
                line("b", {"type": "succeeded", "message": refused}),
                line(
                    "c",
                    {
                        "type": "errored",
                        "error": {
                            "type": "error",
                            "error": {"type": "overloaded_error", "message": "busy"},
                        },
                    },
                ),
                line(
                    "d",
                    {
                        "type": "errored",
                        "error": {
                            "type": "error",
                            "error": {"type": "invalid_request_error", "message": "bad"},
                        },
                    },
                ),
                line("e", {"type": "expired"}),
            )
        ),
        "claude-opus-5-5",
    )
    assert (await provider.status("b")).state is BatchState.ENDED
    results = {r.key: r for r in await provider.results("b", {}, round_number=1)}
    assert results["a"].response.text == ANSWER
    assert results["a"].response.usage.cache_read_tokens == 900
    assert results["b"].response.stop_reason is StopReason.REFUSAL
    assert results["b"].response.stop_category == "cyber"
    assert (results["c"].error, results["c"].retryable) == ("overloaded_error: busy", True)
    assert (results["d"].error, results["d"].retryable) == ("invalid_request_error: bad", False)
    assert (results["e"].error, results["e"].retryable) == ("expired", True)


def gemini_job(state: str, responses: list[dict[str, Any]] | None = None) -> types.BatchJob:
    value: dict[str, Any] = {"name": "batches/1", "state": state}
    if responses is not None:
        value["dest"] = {"inlined_responses": responses}
    return types.BatchJob.model_validate(value)


def gemini_client(job: types.BatchJob) -> Any:
    async def get(*, name: str) -> types.BatchJob:
        return job

    return SimpleNamespace(aio=SimpleNamespace(batches=SimpleNamespace(get=get)))


async def test_gd3_gemini_batch_status() -> None:
    for state, expected in (
        ("JOB_STATE_PENDING", BatchState.RUNNING),
        ("JOB_STATE_RUNNING", BatchState.RUNNING),
        ("JOB_STATE_SUCCEEDED", BatchState.ENDED),
        ("JOB_STATE_PARTIALLY_SUCCEEDED", BatchState.ENDED),
        ("JOB_STATE_EXPIRED", BatchState.FAILED),
        ("JOB_STATE_FAILED", BatchState.FAILED),
    ):
        provider = GeminiBatchProvider(gemini_client(gemini_job(state)), "gemini-3.8-flash")
        assert (await provider.status("batches/1")).state is expected, state


async def test_gd3_gemini_batch_results_by_metadata_key() -> None:
    response = {
        "candidates": [
            {"content": {"role": "model", "parts": [{"text": ANSWER}]}, "finish_reason": "STOP"}
        ],
        "usage_metadata": {
            "prompt_token_count": 1000,
            "cached_content_token_count": 800,
            "candidates_token_count": 100,
        },
        "model_version": "gemini-3.8-flash-001",
    }
    job = gemini_job(
        "JOB_STATE_SUCCEEDED",
        [
            {"error": {"code": 400, "message": "bad schema"}, "metadata": {"key": "b"}},
            {"response": response, "metadata": {"key": "a"}},
            {"error": {"code": 503, "message": "busy"}, "metadata": {"key": "c"}},
        ],
    )
    provider = GeminiBatchProvider(gemini_client(job), "gemini-3.8-flash")
    results = {
        r.key: r
        for r in await provider.results("batches/1", {"a": {}, "b": {}, "c": {}}, round_number=1)
    }
    assert results["a"].response.text == ANSWER
    assert results["a"].response.model == "gemini-3.8-flash-001"
    assert (
        results["a"].response.usage.input_tokens,
        results["a"].response.usage.cache_read_tokens,
    ) == (
        200,
        800,
    )
    assert results["b"].retryable is False
    assert results["c"].retryable is True


async def test_gd3_fixture_batch_reads_one_entry_per_round(tmp_path: Path) -> None:
    provider = FixtureBatchProvider(tmp_path)
    params = provider.build_params(REQUEST)
    sync_params = FixtureProvider(tmp_path).build_params(REQUEST)
    assert fixture_key(params) != fixture_key(sync_params)
    path = provider.path_for(params)
    path.parent.mkdir(parents=True)
    reply = {"stop_reason": "END_TURN", "text": ANSWER, "model": "fixture"}
    path.write_text(
        json.dumps({"responses": [{"batch_error": "expired"}, reply]}), encoding="utf-8"
    )

    assert (await provider.status("x")).state is BatchState.ENDED
    [first] = await provider.results("x", {"k": params}, round_number=1)
    [second] = await provider.results("x", {"k": params}, round_number=2)
    [third] = await provider.results("x", {"k": params}, round_number=3)
    assert (first.response, first.error) == (None, "expired")
    assert second.response.text == ANSWER and third.response.text == ANSWER
    [missing] = await provider.results("x", {"m": {**params, "user": "other"}}, round_number=1)
    assert missing.retryable is False and missing.error.startswith("FIXTURE_MISSING")


class Objects:
    def __init__(self) -> None:
        self.files: dict[str, Any] = {}

    async def put_json(self, key: str, document: dict[str, Any]) -> None:
        self.files[key] = document

    async def get_json(self, key: str) -> dict[str, Any]:
        return self.files[key]


class Calls:
    def __init__(self) -> None:
        self.rows: list[Any] = []

    async def insert(self, record: Any) -> None:
        self.rows.append(record)


def batch_client(provider: Any) -> StructuredBatchClient:
    objects = Objects()
    return StructuredBatchClient(
        provider,
        CallRecorder(objects, Calls()),
        objects,
        pricing=DEFAULT_BATCH_PRICES,
        max_output_tokens=1000,
    )


def requests(count: int) -> list[BatchRequest]:
    prompt = RenderedPrompt("echo/v1", system="Rubric.", user="CV " * 50, shared="JD.")
    return [BatchRequest(f"k{i}", prompt) for i in range(count)]


def test_gd3_batch_keys_follow_the_stricter_provider_rule() -> None:
    prompt = RenderedPrompt("echo/v1", system="s", user="u")
    with pytest.raises(ValueError):
        BatchRequest("1:2:matching/v1", prompt)
    with pytest.raises(ValueError):
        BatchRequest("x" * 65, prompt)


def test_gd3_split_keeps_each_part_within_the_provider_limits(tmp_path: Path) -> None:
    from pydantic import BaseModel

    class Out(BaseModel):
        echo: str

    provider = FixtureBatchProvider(tmp_path)
    provider.max_requests = 3
    client = batch_client(provider)
    assert [len(p) for p in client.split(requests(7), output_model=Out, effort="low")] == [3, 3, 1]

    provider.max_requests = 100
    one = len(json.dumps(provider.build_params(REQUEST)))
    provider.max_bytes = one * 4
    sizes = [len(p) for p in client.split(requests(7), output_model=Out, effort="low")]
    assert sum(sizes) == 7 and len(sizes) > 1


async def test_gd3_request_without_result_is_resent(tmp_path: Path) -> None:
    from pydantic import BaseModel

    class Out(BaseModel):
        echo: str

    class Silent(FixtureBatchProvider):
        async def results(self, batch_id, items, *, round_number):
            return []

    client = batch_client(Silent(tmp_path))
    outcomes = await client.collect(
        "x",
        requests(1),
        output_model=Out,
        effort="low",
        job_id=None,
        batch_row_id=1,
        round_number=1,
        submitted_at=None,
    )
    assert outcomes == {"k0": BatchFailure(code="NO_RESULT", retry=True)}
