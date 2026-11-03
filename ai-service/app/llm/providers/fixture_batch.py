"""Recorded replies for batch requests, for tests and compose without a key (US-3.2 AC-14).

A fixture keyed like the synchronous ones (fixture_provider.py), with `"mode": "batch"` added to the
key, so a batch reply and the reply to the same request resent on its own are separate files. Its
`responses` list holds one entry per round: round N reads entry N, or the last one. An entry is a
ProviderResponse, or `{"batch_error": "expired" | "errored: ...", "retryable": bool}` for a request
the provider returned no answer for. The provider keeps no state, so a restarted worker reads the
same results; every batch ends at once.
"""

import json
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.llm.batch import BatchItemResult, BatchState, BatchStatus
from app.llm.providers.fixture_provider import fixture_key, fixture_params
from app.llm.types import LLMRequest, Provider, ProviderResponse

MODE = "batch"


class FixtureBatchProvider:
    name = Provider.FIXTURE
    max_requests = 100_000
    max_bytes = 200_000_000

    def __init__(self, fixtures_dir: Path, model: str = "fixture") -> None:
        self._dir = fixtures_dir
        self.model = model

    def build_params(self, request: LLMRequest) -> dict[str, Any]:
        return {**fixture_params(request), "mode": MODE}

    def path_for(self, params: dict[str, Any]) -> Path:
        return self._dir / params["agent"] / f"{fixture_key(params)}.json"

    async def submit(
        self, items: Sequence[tuple[str, dict[str, Any]]], *, display_name: str
    ) -> str:
        return f"fixture-{uuid4().hex}"

    async def status(self, batch_id: str) -> BatchStatus:
        return BatchStatus(BatchState.ENDED)

    async def results(
        self, batch_id: str, items: Mapping[str, dict[str, Any]], *, round_number: int
    ) -> list[BatchItemResult]:
        results = []
        for key, params in items.items():
            path = self.path_for(params)
            if not path.is_file():
                results.append(
                    BatchItemResult(
                        key,
                        None,
                        error=f"FIXTURE_MISSING: no LLM fixture at {path}",
                        retryable=False,
                    )
                )
                continue
            responses = json.loads(path.read_text(encoding="utf-8"))["responses"]
            entry = responses[min(round_number, len(responses)) - 1]
            if "batch_error" in entry:
                results.append(
                    BatchItemResult(
                        key,
                        None,
                        error=entry["batch_error"],
                        retryable=entry.get("retryable", True),
                    )
                )
            else:
                results.append(BatchItemResult(key, ProviderResponse.model_validate(entry)))
        return results
