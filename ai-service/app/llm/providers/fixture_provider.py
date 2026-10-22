"""Recorded replies instead of a real provider, for tests and development (AC-11).

A fixture file `<fixtures_dir>/<agent>/<key>.json` answers one request. The key hashes the agent,
prompt version, system, user, output schema and effort, so any change to the prompt or the data
needs a new fixture. A file holds a list of replies, served in order to the attempts of one
`generate` call, so a test can script "invalid twice, then valid"; the next call starts again from
the first reply. A missing fixture raises FixtureMissingError: there is no fallback to a real API.
"""

import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any

from app.consumers.errors import PermanentError
from app.llm.render import dumps_sorted
from app.llm.types import LLMRequest, Provider, ProviderResponse

KEY_FIELDS = ("agent", "prompt_version", "system", "user", "output_schema", "effort")
KEY_LENGTH = 16


class FixtureMissingError(PermanentError):
    """No recorded reply for this request. Record one by hand (story US-2.2: no auto-recording).

    Permanent: the same request finds no fixture on the next attempt either, so the job fails at
    once instead of being retried into the DLQ (compose runs `fixture` without a key, CONTEXT D35).
    """

    def __init__(self, message: str) -> None:
        super().__init__(message, code="LLM_FIXTURE_MISSING")


def fixture_key(params: dict[str, Any]) -> str:
    key_source = {field: params[field] for field in KEY_FIELDS}
    return hashlib.sha256(dumps_sorted(key_source).encode()).hexdigest()[:KEY_LENGTH]


class FixtureProvider:
    name = Provider.FIXTURE

    def __init__(self, fixtures_dir: Path, model: str = "fixture") -> None:
        self._dir = fixtures_dir
        self.model = model
        self._served: Counter[str] = Counter()

    def build_params(self, request: LLMRequest) -> dict[str, Any]:
        params = {
            "agent": request.agent,
            "prompt_version": request.prompt_version,
            "system": request.system,
            "user": request.user,
            "output_schema": request.output_schema,
            "effort": request.effort,
            "max_output_tokens": request.max_output_tokens,
        }
        # LLMClient builds the parameters once per generate call: restart the reply sequence.
        self._served[str(self.path_for(params))] = 0
        return params

    def path_for(self, params: dict[str, Any]) -> Path:
        return self._dir / params["agent"] / f"{fixture_key(params)}.json"

    async def send(self, params: dict[str, Any]) -> ProviderResponse:
        path = self.path_for(params)
        if not path.is_file():
            request = {field: params[field] for field in KEY_FIELDS}
            raise FixtureMissingError(
                f'no LLM fixture at {path}; record {{"request": ..., "responses": [...]}} '
                f"for this request:\n{json.dumps(request, ensure_ascii=False, indent=2)}"
            )
        responses = json.loads(path.read_text(encoding="utf-8"))["responses"]
        index = self._served[str(path)]
        if index >= len(responses):
            raise FixtureMissingError(
                f"{path} holds {len(responses)} replies; attempt {index + 1} needs another"
            )
        self._served[str(path)] += 1
        return ProviderResponse.model_validate(responses[index])
