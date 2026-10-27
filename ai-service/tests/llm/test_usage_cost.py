"""US-2.2 AC-5, NFR-11: every call leaves a row with tokens, cost, model and prompt version."""

from decimal import Decimal
from uuid import uuid4

import pytest
from llm_support import LLM_FIXTURES, MODEL, EchoOutput

from app.llm.providers.fixture_provider import FixtureProvider
from app.llm.recorder import LLM_CALL_COLUMNS
from app.llm.types import Usage
from app.llm.usage import DEFAULT_PRICES, ModelPrice, cost_usd, price_of

pytestmark = pytest.mark.anyio


async def test_nfr11_llm_calls_row_has_usage_cost_model_prompt_version(make_client, prompts, calls):
    client = make_client(FixtureProvider(LLM_FIXTURES))
    job_id = uuid4()
    await client.generate(
        prompt=prompts.render(
            "echo", {"message": "hello", "context": {"source": "test", "attempt": 1}}
        ),
        output_model=EchoOutput,
        effort="low",
        job_id=job_id,
    )
    [record] = calls.rows
    row = dict(zip(LLM_CALL_COLUMNS, record.row(), strict=True))
    assert row == {
        "job_id": job_id,
        "agent": "echo",
        "prompt_version": "echo/v1",
        "provider": "FIXTURE",
        "model": MODEL,
        "effort": "LOW",
        "attempt": 1,
        "outcome": "SUCCEEDED",
        "stop_reason": "END_TURN",
        "raw_stop_reason": "STOP",
        "input_tokens": 120,
        "cache_read_tokens": 0,
        "cache_write_tokens": 0,
        "output_tokens": 40,
        # 120 * 0.75 + 40 * 3.75 per million tokens
        "cost_usd": Decimal("0.000240"),
        "latency_ms": row["latency_ms"],
        "log_key": record.log_key,
    }
    assert row["latency_ms"] >= 0


def test_nfr11_gemini_cost_counts_cache_reads_at_their_price():
    usage = Usage(input_tokens=1_000_000, cache_read_tokens=2_000_000, output_tokens=100_000)
    # 0.75 + 2 * 0.075 + 0.1 * 3.75
    assert cost_usd("gemini-3.8-flash", usage, DEFAULT_PRICES) == Decimal("1.275000")


def test_nfr11_claude_cost_counts_cache_writes():
    usage = Usage(
        input_tokens=1500, cache_read_tokens=3000, cache_write_tokens=1000, output_tokens=2000
    )
    # (1500 * 4 + 3000 * 0.20 + 1000 * 5 + 2000 * 20) / 1e6
    assert cost_usd("claude-opus-5-5", usage, DEFAULT_PRICES) == Decimal("0.051600")


def test_versioned_model_id_uses_its_family_price():
    assert price_of("gemini-3.8-flash-001", DEFAULT_PRICES) == DEFAULT_PRICES["gemini-3.8-flash"]
    assert price_of("gemini-3.8-flashy", DEFAULT_PRICES) is None


def test_unknown_model_has_no_cost(caplog):
    assert cost_usd("claude-opus-4-8", Usage(input_tokens=10), DEFAULT_PRICES) is None
    assert "no price for model claude-opus-4-8" in caplog.text


def test_price_table_can_be_extended():
    prices = {**DEFAULT_PRICES, "claude-opus-4-8": ModelPrice(input=5, output=25, cache_read=0.5)}
    assert cost_usd("claude-opus-4-8", Usage(output_tokens=1000), prices) == Decimal("0.025000")
