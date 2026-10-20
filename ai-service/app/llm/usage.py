"""Cost of one call from its token counts (NFR-11, AC-5, CONTEXT D34).

Prices are the paid-tier list prices in USD per million tokens, read on 2026-10-20. They apply even
when development runs on a free tier, so ai.llm_calls estimates what a real campaign costs.
`LLM_PRICING` overrides or adds models (settings.py).
"""

import logging
from collections.abc import Mapping
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, NonNegativeFloat

from app.llm.types import Usage

logger = logging.getLogger(__name__)

PER_TOKEN = Decimal(1_000_000)
COST_QUANTUM = Decimal("0.000001")


class ModelPrice(BaseModel):
    """USD per million tokens."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    input: NonNegativeFloat
    output: NonNegativeFloat
    cache_read: NonNegativeFloat
    cache_write: NonNegativeFloat = 0


DEFAULT_PRICES: Mapping[str, ModelPrice] = {
    # Doubles from 2027-01-01; implicit caching has no write charge.
    "gemini-3.8-flash": ModelPrice(input=0.75, output=3.75, cache_read=0.075),
    # Cache writes with the default 5-minute TTL cost 1.25x input.
    "claude-opus-5-5": ModelPrice(input=4, output=20, cache_read=0.20, cache_write=5),
}


def price_of(model: str, prices: Mapping[str, ModelPrice]) -> ModelPrice | None:
    """Exact id first, else the longest listed id the reply's model starts with
    (a provider may answer with a versioned id such as `gemini-3.8-flash-001`)."""
    if model in prices:
        return prices[model]
    matches = [name for name in prices if model.startswith(f"{name}-")]
    return prices[max(matches, key=len)] if matches else None


def cost_usd(model: str, usage: Usage, prices: Mapping[str, ModelPrice]) -> Decimal | None:
    """None when the model has no price, so a missing entry shows up instead of a wrong 0."""
    price = price_of(model, prices)
    if price is None:
        logger.warning("no price for model %s; ai.llm_calls.cost_usd stays NULL", model)
        return None
    total = (
        usage.input_tokens * Decimal(str(price.input))
        + usage.cache_read_tokens * Decimal(str(price.cache_read))
        + usage.cache_write_tokens * Decimal(str(price.cache_write))
        + usage.output_tokens * Decimal(str(price.output))
    )
    return (total / PER_TOKEN).quantize(COST_QUANTUM)
