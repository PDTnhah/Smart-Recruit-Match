"""Wires job runners to FastStream subscribers with manual acknowledgement."""

from collections.abc import Iterable

from faststream.middlewares import AckPolicy
from faststream.rabbit import RabbitBroker
from faststream.rabbit.annotations import RabbitMessage

from app.consumers.base import JobRunner, Settle
from app.queues import QUEUES


def subscribe(broker: RabbitBroker, runner: JobRunner) -> None:
    # MANUAL: FastStream's default on an escaped error rejects without requeue, losing the job.
    # The runner settles every delivery itself.
    async def consume(msg: RabbitMessage) -> None:
        if await runner.process(msg.body) is Settle.REQUEUE:
            await msg.nack(requeue=True)
        else:
            await msg.ack()

    consume.__name__ = consume.__qualname__ = f"consume_{runner.kind.type.lower()}"
    broker.subscriber(
        QUEUES.rabbit_queue(runner.kind.queue),
        ack_policy=AckPolicy.MANUAL,
        title=f"{runner.kind.queue}:consume",
    )(consume)


def subscribe_all(broker: RabbitBroker, runners: Iterable[JobRunner]) -> None:
    for runner in runners:
        subscribe(broker, runner)
