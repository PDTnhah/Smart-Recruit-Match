"""US-2.2 AC-11: the test run cannot reach an LLM API, whatever client is used.

The guards live in tests/conftest.py. These tests prove each one holds, including for the async
SDK clients, which on Windows connect without calling socket.connect (LESSONS §19).
"""

import os
import socket

import anthropic
import pytest
from google import genai

pytestmark = pytest.mark.anyio

REFUSED = "must not open network"


def error_chain(error: BaseException | None) -> list[str]:
    chain = []
    while error is not None:
        chain.append(repr(error))
        error = error.__cause__ or error.__context__
    return chain


def test_no_llm_key_is_visible():
    for name in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"):
        assert name not in os.environ
    assert os.environ["LLM_PROVIDER"] == "fixture"


def test_blocking_connections_are_refused():
    with pytest.raises(RuntimeError, match=REFUSED):
        socket.getaddrinfo("example.com", 443)
    with pytest.raises(RuntimeError, match=REFUSED):
        socket.create_connection(("192.0.2.1", 443), timeout=1)


async def test_gemini_sdk_cannot_reach_the_api():
    client = genai.Client(api_key="not-a-key")
    with pytest.raises(Exception) as caught:
        await client.aio.models.generate_content(model="gemini-3.8-flash", contents="hi")
    assert any(REFUSED in link for link in error_chain(caught.value))


async def test_anthropic_sdk_cannot_reach_the_api():
    client = anthropic.AsyncAnthropic(api_key="not-a-key", max_retries=0)
    with pytest.raises(anthropic.APIConnectionError) as caught:
        await client.messages.create(
            model="claude-opus-5-5",
            max_tokens=10,
            messages=[{"role": "user", "content": "hi"}],
        )
    assert any(REFUSED in link for link in error_chain(caught.value))
