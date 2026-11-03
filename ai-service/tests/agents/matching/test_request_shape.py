"""US-3.2 AC-7: the batch requests the Matching Agent sends to Claude and to Gemini (AD-12, D46).

The real adapters run against a stand-in SDK client that records what it is given.
"""

import json
from types import SimpleNamespace
from typing import Any

import pytest
from matching_support import CRITERIA, PROFILE, REQUIREMENTS, Harness, key, match_job, ref

from app.agents.matching import CheckedMatchAssessment
from app.llm.batch import BATCH_KEY
from app.llm.providers.anthropic_batch import AnthropicBatchProvider
from app.llm.providers.gemini_batch import GeminiBatchProvider
from app.llm.render import dumps_sorted, wrap_untrusted
from app.llm.schema import strict_json_schema

pytestmark = pytest.mark.anyio

# Given out of order: the agent sends them by JD, then CV.
PAIRS = (ref(2, 20), ref(1, 20), ref(2, 10), ref(1, 10))
ORDER = [key(1, 10), key(2, 10), key(1, 20), key(2, 20)]
SHARED = "Requirements of the position:\n\n" + wrap_untrusted(
    dumps_sorted({"position_group": "BACKEND", "requirements": REQUIREMENTS}), "jd_requirements"
)
VERDICTS = {
    field: CRITERIA[field]
    for field in ("must_have", "nice_to_have", "education", "language", "gaps")
}


class Recorder:
    def __init__(self, reply: Any) -> None:
        self.calls: list[dict[str, Any]] = []
        self._reply = reply

    async def __call__(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        return self._reply


def check_user_text(user: str) -> None:
    assert user.startswith("Assess this CV against the position above.")
    assert wrap_untrusted(dumps_sorted(PROFILE), "cv_profile") in user
    assert wrap_untrusted(dumps_sorted(VERDICTS), "code_verdicts") in user
    assert "zones" not in user


def check_system(system: str) -> None:
    assert system.startswith("You assess how well one student's CV fits")
    assert "Spring Boot" not in system and '"must_have"' not in system


async def test_ad12_batch_request_snapshot_anthropic() -> None:
    create = Recorder(SimpleNamespace(id="msgbatch_01"))
    client = SimpleNamespace(messages=SimpleNamespace(batches=SimpleNamespace(create=create)))
    worker = Harness(provider=AnthropicBatchProvider(client, "claude-opus-5-5"))

    await worker.agent(match_job(*PAIRS))

    [call] = create.calls
    requests = call["requests"]
    assert [r["custom_id"] for r in requests] == ORDER
    assert all(BATCH_KEY.match(r["custom_id"]) for r in requests)
    params = requests[0]["params"]
    assert set(params) == {"model", "max_tokens", "output_config", "system", "messages"}
    assert params["model"] == "claude-opus-5-5"
    assert params["output_config"] == {
        "effort": "medium",
        "format": {
            "type": "json_schema",
            "schema": strict_json_schema(CheckedMatchAssessment),
        },
    }
    schema = params["output_config"]["format"]["schema"]
    assert schema["description"] == "Project score and comments of the Matching Agent for one pair"
    assert schema["required"] == ["project_relevance", "strengths", "suggestions", "summary"]
    check_system(params["system"])
    [message] = params["messages"]
    shared, user = message["content"]
    assert shared == {
        "type": "text",
        "text": SHARED,
        "cache_control": {"type": "ephemeral", "ttl": "1h"},
    }
    assert user["type"] == "text" and "cache_control" not in user
    check_user_text(user["text"])
    # Same system and shared block for every CV of a JD: one cached prefix per JD.
    assert requests[1]["params"]["messages"][0]["content"][0] == shared
    assert requests[1]["params"]["system"] == params["system"]
    [row] = worker.store.rows.values()
    assert (row["provider_batch_id"], row["provider"]) == ("msgbatch_01", "ANTHROPIC")


async def test_ad12_batch_request_snapshot_gemini() -> None:
    create = Recorder(SimpleNamespace(name="batches/abc123"))
    client = SimpleNamespace(aio=SimpleNamespace(batches=SimpleNamespace(create=create)))
    worker = Harness(provider=GeminiBatchProvider(client, "gemini-3.8-flash"))
    job = match_job(*PAIRS)

    await worker.agent(job)

    [call] = create.calls
    assert call["model"] == "gemini-3.8-flash"
    assert call["config"] == {"display_name": f"match-{job.job_id}-r1-p1"}
    src = call["src"]
    assert [r["metadata"] for r in src] == [{"key": k} for k in ORDER]
    first = src[0]
    assert set(first) == {"contents", "config", "metadata"}
    config = first["config"]
    assert set(config) == {
        "system_instruction",
        "response_mime_type",
        "response_json_schema",
        "thinking_config",
        "max_output_tokens",
    }
    assert config["thinking_config"] == {"thinking_level": "MEDIUM"}
    assert config["response_mime_type"] == "application/json"
    assert config["response_json_schema"] == strict_json_schema(CheckedMatchAssessment)
    check_system(config["system_instruction"])
    [turn] = first["contents"]
    assert turn["role"] == "user"
    shared, user = turn["parts"]
    assert shared == {"text": SHARED}
    check_user_text(user["text"])
    assert "temperature" not in json.dumps(src) and "tool_choice" not in json.dumps(src)


async def test_ad4_pinned_prompt_version_is_rendered() -> None:
    worker = Harness()
    captured: list[dict] = []
    real_submit = worker.provider.submit

    async def capture(items, *, display_name):
        captured.extend(params for _, params in items)
        return await real_submit(items, display_name=display_name)

    worker.provider.submit = capture
    await worker.agent(match_job(ref(1, 10), prompt_version="matching/v1"))
    assert captured[0]["prompt_version"] == "matching/v1"
    [row] = worker.store.rows.values()
    assert row["prompt_version"] == "matching/v1"
