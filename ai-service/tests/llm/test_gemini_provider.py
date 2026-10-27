"""US-2.2 AC-1, AC-3, AC-5 for Gemini: request shape and reply mapping, with a fake SDK client."""

import json
from dataclasses import replace
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from google.genai import errors, types
from google.genai._transformers import t_contents
from llm_support import EchoOutput

from app.llm.providers.gemini_provider import GeminiProvider, to_provider_response
from app.llm.schema import strict_json_schema
from app.llm.types import Document, LLMRequest, ProviderCallError, StopReason, Usage

pytestmark = pytest.mark.anyio

MODEL = "gemini-3.8-flash"


def request(effort: str = "medium") -> LLMRequest:
    return LLMRequest(
        agent="matching",
        prompt_version="matching/v1",
        system="Fixed rubric.",
        user="<cv_profile>{}</cv_profile>",
        output_schema=strict_json_schema(EchoOutput),
        effort=effort,
        max_output_tokens=16000,
    )


def gemini_reply(**overrides: Any) -> types.GenerateContentResponse:
    data: dict[str, Any] = {
        "model_version": "gemini-3.8-flash-001",
        "candidates": [
            {
                "finish_reason": "STOP",
                "content": {
                    "role": "model",
                    "parts": [
                        {"text": "thinking about it", "thought": True},
                        {"text": '{"echo": "hi", "length": 2}'},
                    ],
                },
            }
        ],
        "usage_metadata": {
            "prompt_token_count": 3000,
            "cached_content_token_count": 2000,
            "candidates_token_count": 150,
            "thoughts_token_count": 350,
        },
    }
    data.update(overrides)
    return types.GenerateContentResponse.model_validate(data)


class FakeGenai:
    """Stands in for genai.Client: records the call, then returns or raises `outcome`."""

    def __init__(self, outcome: Any) -> None:
        self.calls: list[dict[str, Any]] = []
        self._outcome = outcome
        self.aio = SimpleNamespace(models=SimpleNamespace(generate_content=self._generate))

    async def _generate(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if isinstance(self._outcome, Exception):
            raise self._outcome
        return self._outcome


def test_ad10_request_has_model_effort_format_no_tool_choice():
    params = GeminiProvider(FakeGenai(None), MODEL).build_params(request("medium"))
    config = params["config"]
    assert params["model"] == MODEL
    assert params["contents"] == "<cv_profile>{}</cv_profile>"
    assert config["system_instruction"] == "Fixed rubric."
    assert config["thinking_config"] == {"thinking_level": "MEDIUM"}
    assert config["response_mime_type"] == "application/json"
    assert config["response_json_schema"]["additionalProperties"] is False
    assert config["max_output_tokens"] == 16000
    for forbidden in ("temperature", "top_p", "top_k", "tool_config", "tools"):
        assert forbidden not in config
    # The SDK accepts the plain dict, so what is logged is what is sent.
    types.GenerateContentConfig.model_validate(config)


@pytest.mark.parametrize(
    ("effort", "level"), [("low", "LOW"), ("medium", "MEDIUM"), ("high", "HIGH")]
)
def test_ad10_effort_maps_to_thinking_level(effort, level):
    params = GeminiProvider(FakeGenai(None), MODEL).build_params(request(effort))
    assert params["config"]["thinking_config"]["thinking_level"] == level


async def test_success_reply_is_normalised():
    fake = FakeGenai(gemini_reply())
    provider = GeminiProvider(fake, MODEL)
    response = await provider.send(provider.build_params(request()))
    assert fake.calls[0]["model"] == MODEL
    assert response.stop_reason is StopReason.END_TURN
    assert response.raw_stop_reason == "STOP"
    assert response.text == '{"echo": "hi", "length": 2}', "thought parts are not the answer"
    assert response.model == "gemini-3.8-flash-001", "model comes from the reply (AC-5)"
    # prompt_token_count includes the cached part; thoughts are billed as output.
    assert response.usage == Usage(input_tokens=1000, cache_read_tokens=2000, output_tokens=500)
    assert "sdk_http_response" not in response.raw_response


@pytest.mark.parametrize(
    "finish", ["SAFETY", "PROHIBITED_CONTENT", "SPII", "RECITATION", "BLOCKLIST"]
)
def test_refusal_finish_reasons_are_refusals_without_text(finish):
    candidate = {"finish_reason": finish, "content": {"parts": [{"text": '{"echo": "x"}'}]}}
    response = to_provider_response(gemini_reply(candidates=[candidate]), MODEL)
    assert (response.stop_reason, response.stop_category, response.text) == (
        StopReason.REFUSAL,
        finish,
        None,
    )


def test_blocked_prompt_is_a_refusal():
    reply = gemini_reply(candidates=[], prompt_feedback={"block_reason": "JAILBREAK"})
    response = to_provider_response(reply, MODEL)
    assert response.stop_reason is StopReason.REFUSAL
    assert (response.raw_stop_reason, response.stop_category) == ("BLOCKED_JAILBREAK", "JAILBREAK")


def test_max_tokens_and_other_finish_reasons():
    truncated = gemini_reply(candidates=[{"finish_reason": "MAX_TOKENS", "content": {"parts": []}}])
    assert to_provider_response(truncated, MODEL).stop_reason is StopReason.MAX_TOKENS
    language = gemini_reply(candidates=[{"finish_reason": "LANGUAGE"}])
    response = to_provider_response(language, MODEL)
    assert (response.stop_reason, response.raw_stop_reason, response.text) == (
        StopReason.OTHER,
        "LANGUAGE",
        None,
    )
    empty = to_provider_response(gemini_reply(candidates=[], usage_metadata=None), MODEL)
    assert (empty.stop_reason, empty.usage) == (StopReason.OTHER, Usage())


def test_model_falls_back_to_configured_when_reply_has_none():
    assert to_provider_response(gemini_reply(model_version=None), MODEL).model == MODEL


@pytest.mark.parametrize(
    ("error", "retryable", "status"),
    [
        (errors.ServerError(503, {"error": {"code": 503, "status": "UNAVAILABLE"}}), True, 503),
        (
            errors.ClientError(429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED"}}),
            True,
            429,
        ),
        (
            errors.ClientError(400, {"error": {"code": 400, "status": "INVALID_ARGUMENT"}}),
            False,
            400,
        ),
        (
            errors.ClientError(403, {"error": {"code": 403, "status": "PERMISSION_DENIED"}}),
            False,
            403,
        ),
        (httpx.ConnectTimeout("timed out"), True, None),
    ],
)
async def test_api_errors_are_classified(error, retryable, status):
    provider = GeminiProvider(FakeGenai(error), MODEL)
    with pytest.raises(ProviderCallError) as caught:
        await provider.send(provider.build_params(request()))
    assert (caught.value.retryable, caught.value.status) == (retryable, status)


PDF = Document("application/pdf", b"%PDF-1.7 scanned page")


async def test_gd2_document_goes_inline_before_the_prompt_and_is_logged_by_hash():
    """US-2.4 AC-4: a scanned CV is sent whole, as inline data; the logged params hold its hash."""
    fake = FakeGenai(gemini_reply())
    provider = GeminiProvider(fake, MODEL)
    params = provider.build_params(replace(request(), documents=(PDF.ref,)))

    [turn] = params["contents"]
    assert turn["role"] == "user"
    [document, prompt] = turn["parts"]
    assert document["inline_data"]["mime_type"] == "application/pdf"
    assert document["inline_data"]["data"] == {"$document": PDF.ref.as_json()}
    assert prompt == {"text": "<cv_profile>{}</cv_profile>"}
    json.dumps(params)  # still loggable

    await provider.send(params, [PDF])
    [sent] = fake.calls
    assert sent["contents"][0]["parts"][0]["inline_data"]["data"] == PDF.data
    assert params["contents"][0]["parts"][0]["inline_data"]["data"] == {
        "$document": PDF.ref.as_json()
    }, "the logged params are not changed"
    # The SDK reads the dict as a Content with a Blob part.
    [content] = t_contents(sent["contents"])
    assert content.parts[0].inline_data.data == PDF.data


async def test_gd2_document_missing_from_send_is_refused():
    provider = GeminiProvider(FakeGenai(gemini_reply()), MODEL)
    params = provider.build_params(replace(request(), documents=(PDF.ref,)))
    with pytest.raises(ValueError, match="no document"):
        await provider.send(params, [])
    with pytest.raises(ValueError, match="without a placeholder"):
        await provider.send(provider.build_params(request()), [PDF])
