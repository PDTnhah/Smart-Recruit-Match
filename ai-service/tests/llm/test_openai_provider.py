"""US-2.9 AC-1…AC-6: OpenAI and DeepSeek through Chat Completions, with a fake SDK client.

Replies are built with openai 3.46.0's own `ChatCompletion`, so a renamed field fails here. DeepSeek
replies use `construct`, as the SDK does, because DeepSeek's extra finish reasons and usage fields
are outside the SDK's types.
"""

import base64
import json
from dataclasses import replace
from types import SimpleNamespace
from typing import Any

import httpx2
import openai
import pytest
from llm_support import EchoOutput
from openai.types.chat import ChatCompletion
from pydantic import BaseModel

from app.llm.providers.openai_provider import (
    ChatCompletionsProvider,
    lists_every_property,
    to_provider_response,
)
from app.llm.schema import strict_json_schema
from app.llm.types import Document, LLMRequest, Provider, ProviderCallError, StopReason, Usage

pytestmark = pytest.mark.anyio

OPENAI_MODEL = "gpt-6.2-sol"
DEEPSEEK_MODEL = "deepseek-flash"
URL = "https://api.openai.com/v1/chat/completions"
ANSWER = '{"echo": "hi", "length": 2}'
PDF = Document("application/pdf", b"%PDF-1.7 scanned page")


class WithDefault(BaseModel):
    echo: str
    note: str | None = None


def request(effort: str = "high", **fields: Any) -> LLMRequest:
    return LLMRequest(
        agent="grader",
        prompt_version="grader/v1",
        system="Fixed rubric.",
        user="<answer>...</answer>",
        output_schema=strict_json_schema(EchoOutput),
        effort=effort,
        max_output_tokens=16000,
        **fields,
    )


def completion(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": "chatcmpl-1",
        "object": "chat.completion",
        "created": 1_790_000_000,
        "model": "gpt-6.2-sol-2026-10-01",
        "choices": [
            {
                "index": 0,
                "finish_reason": "stop",
                "message": {"role": "assistant", "content": ANSWER, "refusal": None},
            }
        ],
        "usage": {
            "prompt_tokens": 5000,
            "completion_tokens": 800,
            "total_tokens": 5800,
            "prompt_tokens_details": {"cached_tokens": 3000, "cache_write_tokens": 1000},
            "completion_tokens_details": {"reasoning_tokens": 500},
        },
    }
    data.update(overrides)
    return data


def openai_reply(**overrides: Any) -> ChatCompletion:
    return ChatCompletion.model_validate(completion(**overrides))


def deepseek_reply(finish_reason: str = "stop", **overrides: Any) -> ChatCompletion:
    usage = {
        "prompt_tokens": 1200,
        "completion_tokens": 300,
        "total_tokens": 1500,
        "prompt_cache_hit_tokens": 1000,
        "prompt_cache_miss_tokens": 200,
    }
    data = completion(model=DEEPSEEK_MODEL, usage=usage, **overrides)
    data["choices"][0]["finish_reason"] = finish_reason
    return ChatCompletion.construct(**data)


class FakeOpenAI:
    def __init__(self, outcome: Any) -> None:
        self.calls: list[dict[str, Any]] = []
        self._outcome = outcome
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    async def _create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if isinstance(self._outcome, Exception):
            raise self._outcome
        return self._outcome


def provider(dialect: Provider = Provider.OPENAI, outcome: Any = None) -> ChatCompletionsProvider:
    model = OPENAI_MODEL if dialect is Provider.OPENAI else DEEPSEEK_MODEL
    return ChatCompletionsProvider(FakeOpenAI(outcome), model, dialect)


def status_error(status: int, body: dict[str, Any] | None = None) -> openai.APIStatusError:
    response = httpx2.Response(status, request=httpx2.Request("POST", URL))
    return openai.APIStatusError(f"HTTP {status}", response=response, body=body)


FORBIDDEN = ("temperature", "top_p", "tool_choice", "tools", "thinking")


@pytest.mark.parametrize("effort", ["low", "medium", "high"])
def test_ac1_openai_request_is_strict_json_schema_with_medium_effort_and_no_storage(effort):
    params = provider().build_params(request(effort))
    assert params["model"] == OPENAI_MODEL
    assert params["response_format"] == {
        "type": "json_schema",
        "json_schema": {
            "name": "grader",
            "schema": strict_json_schema(EchoOutput),
            "strict": True,
        },
    }
    assert (params["reasoning_effort"], params["max_completion_tokens"]) == ("medium", 16000)
    assert params["store"] is False
    assert params["messages"] == [
        {"role": "system", "content": "Fixed rubric."},
        {"role": "user", "content": "<answer>...</answer>"},
    ]
    assert "max_tokens" not in params
    for forbidden in FORBIDDEN:
        assert forbidden not in params


def test_ac1_strict_only_when_every_object_lists_all_its_properties():
    assert lists_every_property(strict_json_schema(EchoOutput)) is True
    assert lists_every_property(strict_json_schema(WithDefault)) is False
    nested = {
        "type": "object",
        "properties": {"items": {"type": "array", "items": strict_json_schema(WithDefault)}},
        "required": ["items"],
    }
    assert lists_every_property(nested) is False
    params = provider().build_params(replace(request(), output_schema=nested))
    assert params["response_format"]["json_schema"]["strict"] is False


@pytest.mark.parametrize(("effort", "sent"), [("low", "low"), ("medium", "high"), ("high", "high")])
def test_ac2_deepseek_request_is_json_object_with_the_schema_in_a_second_system_message(
    effort, sent
):
    params = provider(Provider.DEEPSEEK).build_params(request(effort))
    assert params["model"] == DEEPSEEK_MODEL
    assert params["response_format"] == {"type": "json_object"}
    assert (params["reasoning_effort"], params["max_tokens"]) == (sent, 16000)
    [system, schema, user] = params["messages"]
    assert system == {"role": "system", "content": "Fixed rubric."}
    assert schema["role"] == "system" and "json" in schema["content"]
    expected = json.dumps(strict_json_schema(EchoOutput), sort_keys=True, ensure_ascii=False)
    assert schema["content"].endswith(expected)
    assert user == {"role": "user", "content": "<answer>...</answer>"}
    for absent in ("store", "max_completion_tokens", *FORBIDDEN):
        assert absent not in params


async def test_ac1_reply_is_normalised_with_openai_cache_reads_and_writes():
    fake_provider = provider(outcome=openai_reply())
    response = await fake_provider.send(fake_provider.build_params(request()))
    assert (response.stop_reason, response.raw_stop_reason) == (StopReason.END_TURN, "stop")
    assert response.text == ANSWER
    assert response.model == "gpt-6.2-sol-2026-10-01"
    assert response.usage == Usage(
        input_tokens=1000, cache_read_tokens=3000, cache_write_tokens=1000, output_tokens=800
    )


def test_ac4_deepseek_usage_reads_cache_hits_and_misses():
    response = to_provider_response(deepseek_reply())
    assert response.usage == Usage(input_tokens=200, cache_read_tokens=1000, output_tokens=300)
    assert response.text == ANSWER


def test_ac3_refusal_and_content_filter_have_no_text():
    refused = openai_reply(
        choices=[
            {
                "index": 0,
                "finish_reason": "stop",
                "message": {"role": "assistant", "content": None, "refusal": "I can't help."},
            }
        ]
    )
    response = to_provider_response(refused)
    assert (response.stop_reason, response.text) == (StopReason.REFUSAL, None)

    filtered = to_provider_response(deepseek_reply("content_filter"))
    assert (filtered.stop_reason, filtered.stop_category, filtered.text) == (
        StopReason.REFUSAL,
        "content_filter",
        None,
    )


def test_ac3_length_and_other_finish_reasons():
    assert to_provider_response(deepseek_reply("length")).stop_reason is StopReason.MAX_TOKENS
    assert to_provider_response(deepseek_reply("tool_calls")).stop_reason is StopReason.OTHER


@pytest.mark.parametrize("finish_reason", ["insufficient_system_resource", "aborted"])
def test_ac3_deepseek_interruptions_are_retryable(finish_reason):
    with pytest.raises(ProviderCallError) as caught:
        to_provider_response(deepseek_reply(finish_reason))
    assert caught.value.retryable is True


@pytest.mark.parametrize(
    ("error", "retryable", "status"),
    [
        (status_error(500), True, 500),
        (status_error(503), True, 503),
        (status_error(429, {"type": "rate_limit_error", "code": None}), True, 429),
        (status_error(429, {"type": "x", "code": "credit_balance_exhausted"}), False, 429),
        (status_error(429, {"type": "insufficient_quota", "code": None}), False, 429),
        (status_error(400), False, 400),
        (status_error(401), False, 401),
        (status_error(402), False, 402),
        (openai.APIConnectionError(request=httpx2.Request("POST", URL)), True, None),
    ],
)
async def test_ac6_api_errors_are_classified(error, retryable, status):
    fake_provider = provider(outcome=error)
    with pytest.raises(ProviderCallError) as caught:
        await fake_provider.send(fake_provider.build_params(request()))
    assert (caught.value.retryable, caught.value.status) == (retryable, status)


async def test_ac5_openai_document_is_a_file_part_with_a_pdf_data_url():
    """US-2.4 AC-4: a scanned CV is read before the prompt; the logged parameters hold its hash."""
    fake_provider = provider(outcome=openai_reply())
    params = fake_provider.build_params(replace(request(), documents=(PDF.ref,), shared="JD."))

    [_, message] = params["messages"]
    [shared, document, prompt] = message["content"]
    assert shared == {
        "type": "text",
        "text": "JD.",
        "prompt_cache_breakpoint": {"mode": "explicit"},
    }
    assert document == {
        "type": "file",
        "file": {
            "filename": f"{PDF.ref.sha256[:16]}.pdf",
            "file_data": {"$document": PDF.ref.as_json()},
        },
    }
    assert prompt == {"type": "text", "text": "<answer>...</answer>"}
    json.dumps(params)

    await fake_provider.send(params, [PDF])
    sent = fake_provider._client.calls[0]["messages"][1]["content"][1]["file"]["file_data"]
    assert sent == "data:application/pdf;base64," + base64.standard_b64encode(PDF.data).decode()


async def test_ac5_deepseek_refuses_documents_before_sending():
    fake_provider = provider(Provider.DEEPSEEK, outcome=deepseek_reply())
    params = fake_provider.build_params(replace(request(), documents=(PDF.ref,), shared="JD."))
    user = params["messages"][2]["content"]
    assert user == "JD.\n\n<answer>...</answer>", "one string: shared block, then the prompt"

    with pytest.raises(ProviderCallError) as caught:
        await fake_provider.send(params, [PDF])
    assert caught.value.retryable is False
    assert fake_provider._client.calls == []
