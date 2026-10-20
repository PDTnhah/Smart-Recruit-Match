"""Provider-neutral shapes of one LLM call (CONTEXT D34).

Adapters turn an `LLMRequest` into their SDK's parameters and the SDK's reply into a
`ProviderResponse`, so retries, refusal handling and logging are written once.
"""

import re
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

Effort = Literal["low", "medium", "high"]
EFFORTS: tuple[Effort, ...] = ("low", "medium", "high")

PROMPT_VERSION = re.compile(r"^(?P<agent>[a-z][a-z0-9_]*)/v(?P<number>[1-9][0-9]*)$")
"""`<agent>/v<N>`, the name of a prompt file under app/prompts (AD-12)."""


class StopReason(StrEnum):
    """Why the model stopped, mapped from each provider's own codes."""

    END_TURN = "END_TURN"
    MAX_TOKENS = "MAX_TOKENS"
    REFUSAL = "REFUSAL"
    OTHER = "OTHER"


class Outcome(StrEnum):
    """What LLMClient made of one attempt; stored in ai.llm_calls.outcome."""

    SUCCEEDED = "SUCCEEDED"
    INVALID_OUTPUT = "INVALID_OUTPUT"
    TRUNCATED = "TRUNCATED"
    REFUSED = "REFUSED"
    API_ERROR = "API_ERROR"


class Provider(StrEnum):
    GEMINI = "GEMINI"
    ANTHROPIC = "ANTHROPIC"
    FIXTURE = "FIXTURE"


@dataclass(frozen=True)
class RenderedPrompt:
    """A prompt file rendered for one call. `system` never holds per-call data (AC-9)."""

    prompt_version: str
    system: str
    user: str

    def __post_init__(self) -> None:
        if not PROMPT_VERSION.match(self.prompt_version):
            raise ValueError(f"prompt_version must look like <agent>/v<N>: {self.prompt_version!r}")

    @property
    def agent(self) -> str:
        return self.prompt_version.split("/", 1)[0]


@dataclass(frozen=True)
class LLMRequest:
    agent: str
    prompt_version: str
    system: str
    user: str
    output_schema: dict[str, Any]
    effort: Effort
    max_output_tokens: int


class Usage(BaseModel):
    """Token counts of one call. `input_tokens` excludes cache reads and writes; `output_tokens`
    includes reasoning tokens, which both providers bill as output."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    input_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    output_tokens: int = 0


class ProviderResponse(BaseModel):
    """One provider reply, normalised. Fixtures store exactly this shape (AC-11)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    stop_reason: StopReason
    raw_stop_reason: str | None = None
    """The provider's own code, e.g. Claude `refusal` or Gemini `SAFETY`."""
    stop_category: str | None = None
    """Refusal category when the provider gave one."""
    text: str | None = None
    """The JSON text of the answer. None on a refusal: it must not be read (AC-3)."""
    model: str
    """The model that actually answered, which a fallback can change (AC-5)."""
    usage: Usage = Usage()
    raw_response: dict[str, Any] = {}
    """The full SDK reply, kept for the llm-logs file only (AC-6)."""


class ProviderCallError(Exception):
    """The provider call failed after the SDK's own retries. `retryable` decides whether the job
    layer may try again (RetryableError) or must stop (PermanentError)."""

    def __init__(self, message: str, *, retryable: bool, status: int | None = None) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.status = status


@dataclass(frozen=True)
class LLMResult[T: BaseModel]:
    """A validated answer plus what produced it, for ai.results (AC-7, AGENTS › Invariant 12)."""

    data: T
    model: str
    prompt_version: str
    call_id: UUID
