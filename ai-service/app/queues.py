"""Queue names, retry limits and DLQ headers shared with the Core Backend.

Read from app/contracts/queues.json, which `pnpm contracts:gen` writes from
packages/shared/contracts/queues.ts, so both sides use the same constants (AD-6).
"""

import json
from dataclasses import dataclass
from importlib.resources import files
from typing import Any

from faststream.rabbit import RabbitQueue


@dataclass(frozen=True)
class QueueManifest:
    jobs: dict[str, str]
    results: str
    dlq_suffix: str
    max_attempts: int
    retry_delays_seconds: tuple[int, ...]
    queue_arguments: dict[str, Any]
    dlq_headers: dict[str, str]

    def dlq_of(self, queue: str) -> str:
        return f"{queue}{self.dlq_suffix}"

    def all_queues(self) -> list[str]:
        queues = [*self.jobs.values(), self.results]
        return [*queues, *(self.dlq_of(q) for q in queues)]

    def rabbit_queue(self, name: str) -> RabbitQueue:
        """Declared exactly like the API declares it; RabbitMQ refuses a different redeclaration."""
        return RabbitQueue(name, durable=True, arguments=dict(self.queue_arguments))


def load_manifest() -> QueueManifest:
    data = json.loads(files("app.contracts").joinpath("queues.json").read_text(encoding="utf-8"))
    return QueueManifest(
        jobs=data["jobs"],
        results=data["results"],
        dlq_suffix=data["dlq_suffix"],
        max_attempts=data["max_attempts"],
        retry_delays_seconds=tuple(data["retry_delays_seconds"]),
        queue_arguments=data["queue_arguments"],
        dlq_headers=data["dlq_headers"],
    )


QUEUES = load_manifest()
