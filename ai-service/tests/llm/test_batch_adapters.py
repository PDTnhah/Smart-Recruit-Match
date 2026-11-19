"""US-3.2 AC-7, AC-9, AC-14, US-2.9 AC-7: the batch adapters, read against the SDKs' own types
(CONTEXT D46, D58).

The SDK clients are stand-ins; the replies are built with anthropic 1.11.0, google-genai 2.28.0 and
openai 3.46.0 models, so a renamed field fails here.
"""

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import httpx2
import openai
import pytest
from anthropic.types.messages import MessageBatchIndividualResponse
from google.genai import types
from openai.types import Batch

from app.llm.batch import (
    BatchFailure,
    BatchRequest,
    BatchState,
    StructuredBatchClient,
    _failure_code,
)
from app.llm.providers.anthropic_batch import AnthropicBatchProvider
from app.llm.providers.anthropic_provider import AnthropicProvider
from app.llm.providers.fixture_batch import FixtureBatchProvider
from app.llm.providers.fixture_provider import FixtureProvider, fixture_key
from app.llm.providers.gemini_batch import GeminiBatchProvider
from app.llm.providers.gemini_provider import GeminiProvider
from app.llm.providers.inline_batch import InlineBatchProvider
from app.llm.providers.openai_batch import FILE_SECONDS, OpenAIBatchProvider
from app.llm.recorder import CallRecorder
from app.llm.types import (
    Document,
    LLMRequest,
    Provider,
    ProviderCallError,
    ProviderResponse,
    RenderedPrompt,
    StopReason,
)
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


OPENAI_MODEL = "gpt-6.2-sol"
FILES_URL = "https://api.openai.com/v1/files"
PDF_REF = Document("application/pdf", b"%PDF-1.7").ref


def openai_batch(status: str, **fields: Any) -> Batch:
    return Batch.model_validate(
        {
            "id": "batch_1",
            "object": "batch",
            "endpoint": "/v1/chat/completions",
            "completion_window": "24h",
            "created_at": 1_790_000_000,
            "input_file_id": "file-in",
            "status": status,
            **fields,
        }
    )


def chat_body(**message: Any) -> dict[str, Any]:
    return {
        "id": "chatcmpl-1",
        "object": "chat.completion",
        "created": 1_790_000_000,
        "model": OPENAI_MODEL,
        "choices": [
            {
                "index": 0,
                "finish_reason": "stop",
                "message": {"role": "assistant", "content": ANSWER, "refusal": None, **message},
            }
        ],
        "usage": {
            "prompt_tokens": 1000,
            "completion_tokens": 50,
            "total_tokens": 1050,
            "prompt_tokens_details": {"cached_tokens": 900},
        },
    }


class FakeOpenAIFiles:
    """The files and batches resources of openai.AsyncOpenAI, in memory."""

    def __init__(self, batch: Batch | None = None, contents: dict[str, Any] | None = None) -> None:
        self.batch = batch
        self.contents = contents or {}
        self.uploads: list[dict[str, Any]] = []
        self.created: list[dict[str, Any]] = []
        self.deleted: list[str] = []
        self.files = SimpleNamespace(
            create=self._upload,
            delete=self._delete,
            with_streaming_response=SimpleNamespace(content=self._content),
        )
        self.batches = SimpleNamespace(create=self._create, retrieve=self._retrieve)

    async def _upload(self, **kwargs: Any) -> Any:
        self.uploads.append(kwargs)
        return SimpleNamespace(id="file-in")

    async def _create(self, **kwargs: Any) -> Any:
        self.created.append(kwargs)
        return SimpleNamespace(id="batch_1")

    async def _retrieve(self, batch_id: str) -> Batch | None:
        return self.batch

    @asynccontextmanager
    async def _content(self, file_id: str) -> AsyncIterator[Any]:
        """Like the SDK, the request runs when the context opens; a line is a JSON object or
        raw text."""
        content = self.contents[file_id]
        if isinstance(content, Exception):
            raise content
        lines = [line if isinstance(line, str) else json.dumps(line) for line in content]

        async def iter_lines() -> AsyncIterator[str]:
            for line in lines:
                yield line

        yield SimpleNamespace(iter_lines=iter_lines)

    async def _delete(self, file_id: str) -> None:
        self.deleted.append(file_id)


def not_found() -> openai.NotFoundError:
    response = httpx2.Response(404, request=httpx2.Request("GET", FILES_URL))
    return openai.NotFoundError("HTTP 404", response=response, body=None)


async def test_gd3_openai_batch_uploads_jsonl_of_chat_completions_requests() -> None:
    client = FakeOpenAIFiles()
    provider = OpenAIBatchProvider(client, OPENAI_MODEL)
    params = provider.build_params(REQUEST)
    assert params["store"] is False and "max_completion_tokens" in params
    with pytest.raises(ValueError):
        provider.build_params(replace(REQUEST, documents=(PDF_REF,)))

    batch_id = await provider.submit([("a", params), ("b", params)], display_name="match-1")
    assert batch_id == "batch_1"
    [upload] = client.uploads
    _, data = upload["file"]
    lines = [json.loads(line) for line in data.decode().splitlines()]
    assert lines[0] == {
        "custom_id": "a",
        "method": "POST",
        "url": "/v1/chat/completions",
        "body": params,
    }
    assert [line["custom_id"] for line in lines] == ["a", "b"]
    expiry = {"anchor": "created_at", "seconds": FILE_SECONDS}
    assert (upload["purpose"], upload["expires_after"]) == ("batch", expiry)
    [created] = client.created
    assert created["input_file_id"] == "file-in"
    assert (created["endpoint"], created["completion_window"]) == ("/v1/chat/completions", "24h")
    assert created["output_expires_after"] == expiry


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        ("validating", BatchState.RUNNING),
        ("in_progress", BatchState.RUNNING),
        ("finalizing", BatchState.RUNNING),
        ("completed", BatchState.ENDED),
        ("expired", BatchState.ENDED),
        ("failed", BatchState.FAILED),
        ("cancelled", BatchState.FAILED),
    ],
)
async def test_gd3_openai_batch_status(status: str, expected: BatchState) -> None:
    provider = OpenAIBatchProvider(FakeOpenAIFiles(openai_batch(status)), OPENAI_MODEL)
    assert (await provider.status("batch_1")).state is expected


async def test_gd3_openai_batch_results_read_output_and_error_files() -> None:
    output = [
        {"id": "r1", "custom_id": "a", "response": {"status_code": 200, "body": chat_body()}},
        {
            "id": "r2",
            "custom_id": "b",
            "response": {"status_code": 200, "body": chat_body(content=None, refusal="no")},
        },
    ]
    errors = [
        {
            "id": "r3",
            "custom_id": "c",
            "response": None,
            "error": {"code": "batch_expired", "message": "window passed"},
        },
        {
            "id": "r4",
            "custom_id": "d",
            "response": {
                "status_code": 400,
                "body": {"error": {"type": "invalid_request_error", "message": "bad schema"}},
            },
            "error": None,
        },
        {
            "id": "r5",
            "custom_id": "e",
            "response": {"status_code": 500, "body": {"error": {"message": "oops"}}},
            "error": None,
        },
        {"id": "r6", "custom_id": "f", "response": {"status_code": 200, "body": {}}},
        {"id": "r7", "custom_id": "g", "response": {"status_code": 502, "body": "Bad Gateway"}},
        '{"id": "r8", "custom_id": "h", "resp',
    ]
    batch = openai_batch("expired", output_file_id="file-out", error_file_id="file-err")
    client = FakeOpenAIFiles(batch, {"file-out": output, "file-err": errors})
    provider = OpenAIBatchProvider(client, OPENAI_MODEL)
    results = {r.key: r for r in await provider.results("batch_1", {}, round_number=1)}

    assert results["a"].response.text == ANSWER
    assert results["a"].response.usage.cache_read_tokens == 900
    assert results["b"].response.stop_reason is StopReason.REFUSAL
    assert (results["c"].retryable, _failure_code(results["c"].error)) == (True, "EXPIRED")
    assert results["d"].retryable is False
    assert _failure_code(results["d"].error) == "LLM_BAD_REQUEST"
    assert results["e"].retryable is True
    assert (results["f"].response, results["f"].retryable) == (None, True), "200 without a body"
    assert (results["g"].response, results["g"].retryable) == (None, True), "plain-text body"
    assert "h" not in results, "an unreadable line is skipped: its request counts as unanswered"
    assert client.deleted == ["file-in"], "output and error files expire on their own"


async def test_gd3_openai_batch_file_already_gone_counts_as_no_answer() -> None:
    batch = openai_batch("completed", output_file_id="file-out")
    client = FakeOpenAIFiles(batch, {"file-out": not_found()})
    provider = OpenAIBatchProvider(client, OPENAI_MODEL)
    assert await provider.results("batch_1", {}, round_number=1) == []


class KeyedProvider:
    """Answers by the `user` parameter and records how many requests run at once."""

    name = Provider.DEEPSEEK
    model = "deepseek-flash"

    def __init__(self) -> None:
        self.active = 0
        self.peak = 0
        self.sent: list[str] = []

    def build_params(self, request: LLMRequest) -> dict[str, Any]:
        return {"user": request.user}

    async def send(self, params: dict[str, Any], documents: Any = ()) -> ProviderResponse:
        self.sent.append(params["user"])
        self.active += 1
        self.peak = max(self.peak, self.active)
        await asyncio.sleep(0)
        self.active -= 1
        if params["user"] == "bad":
            raise ProviderCallError("HTTP 400", retryable=False, status=400)
        if params["user"] == "busy":
            raise ProviderCallError("HTTP 503", retryable=True, status=503)
        return ProviderResponse(stop_reason=StopReason.END_TURN, text=ANSWER, model=self.model)


async def test_gd3_inline_batch_sends_each_request_when_read() -> None:
    sync = KeyedProvider()
    provider = InlineBatchProvider(sync, Objects(), concurrency=2)
    assert (provider.name, provider.model) == (Provider.DEEPSEEK, "deepseek-flash")
    with pytest.raises(ValueError):
        provider.build_params(replace(REQUEST, documents=(PDF_REF,)))

    batch_id = await provider.submit([("a", {"user": "ok"})], display_name="match-1")
    assert batch_id.startswith("inline-") and sync.peak == 0, "submit sends nothing"
    assert (await provider.status(batch_id)).state is BatchState.ENDED

    items = {"a": {"user": "ok"}, "b": {"user": "bad"}, "c": {"user": "busy"}}
    items |= {f"k{i}": {"user": "ok"} for i in range(5)}
    results = {r.key: r for r in await provider.results(batch_id, items, round_number=1)}
    assert set(results) == set(items)
    assert results["a"].response.text == ANSWER
    assert results["b"].retryable is False
    assert _failure_code(results["b"].error) == "LLM_BAD_REQUEST"
    assert (results["c"].response, results["c"].retryable) == (None, True)
    assert sync.peak == 2


async def test_gd3_inline_batch_read_again_sends_only_unanswered_requests() -> None:
    # A step that fails after the read (a log write, publishing) reads the batch again.
    sync = KeyedProvider()
    objects = Objects()
    provider = InlineBatchProvider(sync, objects, concurrency=4)
    items = {"a": {"user": "ok"}, "c": {"user": "busy"}}

    first = {r.key: r for r in await provider.results("inline-1", items, round_number=1)}
    second = {r.key: r for r in await provider.results("inline-1", items, round_number=1)}
    assert sorted(sync.sent) == ["busy", "busy", "ok"], "the answer to `a` is not paid twice"
    assert second["a"].response == first["a"].response
    assert (second["c"].response, second["c"].retryable) == (None, True)
    assert list(objects.files) == ["inline-batches/inline-1/a.json"]
