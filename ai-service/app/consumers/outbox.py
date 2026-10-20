"""Messages the worker sends: results on ai.results, failed jobs to their DLQ."""

from typing import Protocol

from faststream.rabbit import RabbitBroker
from pydantic import BaseModel

from app.queues import QUEUES

PUBLISH_TIMEOUT_SECONDS = 10.0


class Outbox(Protocol):
    async def publish_result(self, message: BaseModel, job_id: str) -> None: ...

    async def dead_letter(self, queue: str, body: bytes, reason: str, attempts: int) -> None: ...


class RabbitOutbox:
    """Publishes through the default exchange with publisher confirms; persistent messages."""

    def __init__(self, broker: RabbitBroker) -> None:
        self._broker = broker

    async def publish_result(self, message: BaseModel, job_id: str) -> None:
        # Every field, nulls included: the Zod contract requires `result` and `error` keys.
        await self._broker.publish(
            message.model_dump_json().encode(),
            queue=QUEUES.results,
            persist=True,
            content_type="application/json",
            message_id=job_id,
            timeout=PUBLISH_TIMEOUT_SECONDS,
        )

    async def dead_letter(self, queue: str, body: bytes, reason: str, attempts: int) -> None:
        headers = QUEUES.dlq_headers
        await self._broker.publish(
            body,
            queue=QUEUES.dlq_of(queue),
            persist=True,
            content_type="application/json",
            headers={
                headers["reason"]: reason[:1000],
                headers["attempts"]: attempts,
                headers["source_queue"]: queue,
            },
            timeout=PUBLISH_TIMEOUT_SECONDS,
        )
