"""US-2.2 AC-1, AC-3, AC-5 for Claude: request shape and reply mapping, with a fake SDK client."""

from types import SimpleNamespace
from typing import Any

import anthropic
import httpx2
import pytest
from anthropic.types.beta import BetaMessage
from llm_support import EchoOutput

from app.llm.providers.anthropic_provider import (
    FALLBACK_BETA,
    AnthropicProvider,
    to_provider_response,
)
from app.llm.schema import strict_json_schema
from app.llm.types import LLMRequest, ProviderCallError, StopReason, Usage

pytestmark = pytest.mark.anyio

MODEL = "claude-opus-5-5"
URL = "https://api.anthropic.com/v1/messages"


def request(effort: str = "high") -> LLMRequest:
    return LLMRequest(
        agent="grader",
        prompt_version="grader/v1",
        system="Fixed rubric.",
        user="<answer>...</answer>",
        output_schema=strict_json_schema(EchoOutput),
        effort=effort,
        max_output_tokens=16000,
    )


def claude_reply(**overrides: Any) -> BetaMessage:
    data: dict[str, Any] = {
        "id": "msg_01",
        "type": "message",
        "role": "assistant",
        "model": MODEL,
        "content": [{"type": "text", "text": '{"echo": "hi", "length": 2}'}],
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {
            "input_tokens": 1200,
            "cache_read_input_tokens": 3000,
            "cache_creation_input_tokens": 400,
            "output_tokens": 800,
        },
    }
    data.update(overrides)
    return BetaMessage.model_validate(data)


class FakeAnthropic:
    def __init__(self, outcome: Any) -> None:
        self.calls: list[dict[str, Any]] = []
        self._outcome = outcome
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    async def _create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if isinstance(self._outcome, Exception):
            raise self._outcome
        return self._outcome


def status_error(status: int) -> anthropic.APIStatusError:
    response = httpx2.Response(status, request=httpx2.Request("POST", URL))
    return anthropic.APIStatusError(f"HTTP {status}", response=response, body=None)


def test_ad10_request_has_model_effort_format_no_tool_choice():
    params = AnthropicProvider(FakeAnthropic(None), MODEL).build_params(request("high"))
    assert params["model"] == MODEL
    assert params["output_config"]["effort"] == "high"
    assert params["output_config"]["format"]["type"] == "json_schema"
    assert params["output_config"]["format"]["schema"]["additionalProperties"] is False
    assert params["system"] == "Fixed rubric."
    assert params["messages"] == [{"role": "user", "content": "<answer>...</answer>"}]
    assert (params["betas"], params["fallbacks"]) == ([FALLBACK_BETA], "default")
    for forbidden in ("temperature", "top_p", "top_k", "tool_choice", "tools", "thinking"):
        assert forbidden not in params


async def test_success_reply_is_normalised():
    fake = FakeAnthropic(claude_reply())
    provider = AnthropicProvider(fake, MODEL)
    response = await provider.send(provider.build_params(request()))
    assert fake.calls[0]["output_config"]["effort"] == "high"
    assert (response.stop_reason, response.raw_stop_reason) == (StopReason.END_TURN, "end_turn")
    assert response.text == '{"echo": "hi", "length": 2}'
    assert response.usage == Usage(
        input_tokens=1200, cache_read_tokens=3000, cache_write_tokens=400, output_tokens=800
    )


def test_refusal_has_category_and_no_text():
    reply = claude_reply(
        stop_reason="refusal",
        stop_details={"type": "refusal", "category": "cyber", "explanation": "declined"},
    )
    response = to_provider_response(reply)
    assert (response.stop_reason, response.stop_category, response.text) == (
        StopReason.REFUSAL,
        "cyber",
        None,
    )


def test_fallback_model_comes_from_the_reply():
    assert to_provider_response(claude_reply(model="claude-opus-4-8")).model == "claude-opus-4-8"


def test_max_tokens_and_other_stop_reasons():
    assert to_provider_response(claude_reply(stop_reason="max_tokens")).stop_reason is (
        StopReason.MAX_TOKENS
    )
    assert to_provider_response(claude_reply(stop_reason="pause_turn")).stop_reason is (
        StopReason.OTHER
    )


@pytest.mark.parametrize(
    ("error", "retryable", "status"),
    [
        (status_error(529), True, 529),
        (status_error(429), True, 429),
        (status_error(400), False, 400),
        (status_error(401), False, 401),
        (anthropic.APIConnectionError(request=httpx2.Request("POST", URL)), True, None),
    ],
)
async def test_api_errors_are_classified(error, retryable, status):
    provider = AnthropicProvider(FakeAnthropic(error), MODEL)
    with pytest.raises(ProviderCallError) as caught:
        await provider.send(provider.build_params(request()))
    assert (caught.value.retryable, caught.value.status) == (retryable, status)
