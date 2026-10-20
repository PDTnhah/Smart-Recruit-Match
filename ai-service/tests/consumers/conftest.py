"""In-memory stand-ins for ai.jobs and the broker, so the runner is tested without services."""

import json
from typing import Any
from uuid import UUID

import pytest
from pydantic import BaseModel


class InMemoryJobStore:
    """Same rules as the SQL in app/consumers/jobs_repo.py."""

    def __init__(self) -> None:
        self.rows: dict[UUID, dict[str, Any]] = {}
        self.down = False

    async def claim(self, job_id: UUID, job_type: str) -> int | None:
        if self.down:
            raise ConnectionError("database unreachable")
        row = self.rows.get(job_id)
        if row is None:
            self.rows[job_id] = {
                "type": job_type,
                "status": "PROCESSING",
                "attempts": 1,
                "last_error": None,
            }
            return 1
        if row["status"] != "PROCESSING":
            return None
        row["attempts"] += 1
        return row["attempts"]

    async def retry(self, job_id: UUID, error: str) -> int:
        row = self.rows[job_id]
        row["attempts"] += 1
        row["last_error"] = error
        return row["attempts"]

    async def finish(self, job_id: UUID, status: str, error: str | None) -> None:
        self.rows[job_id].update(status=status, last_error=error)


class RecordingOutbox:
    def __init__(self) -> None:
        self.results: list[dict[str, Any]] = []
        self.dead_letters: list[dict[str, Any]] = []

    async def publish_result(self, message: BaseModel, job_id: str) -> None:
        self.results.append(json.loads(message.model_dump_json()))

    async def dead_letter(self, queue: str, body: bytes, reason: str, attempts: int) -> None:
        self.dead_letters.append(
            {"queue": queue, "body": body, "reason": reason, "attempts": attempts}
        )


class RecordingSleep:
    def __init__(self) -> None:
        self.delays: list[float] = []

    async def __call__(self, seconds: float) -> None:
        self.delays.append(seconds)


@pytest.fixture
def store() -> InMemoryJobStore:
    return InMemoryJobStore()


@pytest.fixture
def outbox() -> RecordingOutbox:
    return RecordingOutbox()


@pytest.fixture
def sleep() -> RecordingSleep:
    return RecordingSleep()
