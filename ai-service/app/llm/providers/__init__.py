"""Adapters between LLMRequest/ProviderResponse and each provider's SDK (CONTEXT D34)."""

from typing import Any, Protocol

from app.llm.types import LLMRequest, Provider, ProviderResponse


class LLMProvider(Protocol):
    name: Provider
    model: str
    """The configured model; the reply may name another one after a fallback."""

    def build_params(self, request: LLMRequest) -> dict[str, Any]:
        """The exact SDK keyword arguments, JSON-serialisable so they can be logged (AC-6)."""
        ...

    async def send(self, params: dict[str, Any]) -> ProviderResponse:
        """Raises ProviderCallError when the call fails after the SDK's own retries."""
        ...
