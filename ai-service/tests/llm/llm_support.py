"""Shared pieces of the LLMClient tests: the sample `echo` agent and in-memory stores."""

from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.llm.recorder import CallRecord
from app.llm.types import Provider, ProviderCallError, ProviderResponse, StopReason, Usage

FIXTURES = Path(__file__).parent.parent / "fixtures"
PROMPTS_ROOT = FIXTURES / "prompts"
LLM_FIXTURES = FIXTURES / "llm"
MODEL = "gemini-3.8-flash"


class EchoOutput(BaseModel):
    echo: str
    length: int = Field(ge=0)


class MemoryObjects:
    def __init__(self) -> None:
        self.files: dict[str, dict[str, Any]] = {}

    async def put_json(self, key: str, document: dict[str, Any]) -> None:
        self.files[key] = document


class MemoryCalls:
    def __init__(self) -> None:
        self.rows: list[CallRecord] = []

    async def insert(self, record: CallRecord) -> None:
        self.rows.append(record)


class ScriptedProvider:
    """Answers each attempt with the next scripted reply, or raises it when it is an exception."""

    name = Provider.GEMINI
    model = MODEL

    def __init__(self, *replies: ProviderResponse | Exception) -> None:
        self._replies = list(replies)
        self.sent: list[dict[str, Any]] = []

    def build_params(self, request) -> dict[str, Any]:
        return {"system": request.system, "user": request.user, "effort": request.effort}

    async def send(self, params: dict[str, Any], documents=()) -> ProviderResponse:
        self.sent.append(params)
        reply = self._replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def reply(
    stop_reason: StopReason = StopReason.END_TURN,
    text: str | None = '{"echo": "hi", "length": 2}',
    **fields: Any,
) -> ProviderResponse:
    return ProviderResponse(
        stop_reason=stop_reason,
        text=text,
        model=fields.pop("model", MODEL),
        usage=fields.pop("usage", Usage(input_tokens=1000, output_tokens=200)),
        **fields,
    )


def api_error(*, retryable: bool, status: int) -> ProviderCallError:
    return ProviderCallError(f"HTTP {status}", retryable=retryable, status=status)
