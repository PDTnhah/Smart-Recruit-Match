"""FastStream worker for AI jobs (AD-5, CONTEXT D33).

Run with `faststream run app.worker:create_app --factory`; compose runs it as `ai-worker`, which
scales to several replicas. Each job type has one subscriber; the JobRunner gives every type the
same claim, retry and DLQ behaviour.
"""

import logging
from collections.abc import Mapping

from faststream import FastStream
from faststream.rabbit import Channel, RabbitBroker
from psycopg_pool import AsyncConnectionPool

from app.config import load_settings
from app.consumers.base import Handler, JobRunner
from app.consumers.jobs_repo import JobStore, PostgresJobStore
from app.consumers.kinds import JOB_KINDS
from app.consumers.outbox import Outbox, RabbitOutbox
from app.consumers.subscribers import subscribe_all
from app.handlers import HANDLERS
from app.queues import QUEUES

logger = logging.getLogger(__name__)

# Jobs one worker runs at once; aio-pika would otherwise start every delivered message in
# parallel. Scale out with more ai-worker replicas instead.
PREFETCH_COUNT = 8


def build_runners(
    store: JobStore, outbox: Outbox, handlers: Mapping[str, Handler] = HANDLERS
) -> list[JobRunner]:
    """One runner per queue in queues.json; a type without a kind or a handler fails at startup."""
    missing = [t for t in QUEUES.jobs if t not in JOB_KINDS or t not in handlers]
    if missing:
        raise RuntimeError(f"no consumer for job types: {', '.join(missing)}")
    return [JobRunner(JOB_KINDS[t], handlers[t], store, outbox) for t in QUEUES.jobs]


async def declare_queues(broker: RabbitBroker) -> None:
    """Every job queue, ai.results and their DLQs, declared exactly as the API declares them."""
    for name in QUEUES.all_queues():
        await broker.declare_queue(QUEUES.rabbit_queue(name))


def create_app() -> FastStream:
    settings = load_settings()
    logging.basicConfig(
        level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    broker = RabbitBroker(
        settings.rabbitmq_url,
        graceful_timeout=30.0,
        default_channel=Channel(prefetch_count=PREFETCH_COUNT),
    )
    pool = AsyncConnectionPool(settings.ai_database_url, min_size=1, max_size=4, open=False)
    subscribe_all(broker, build_runners(PostgresJobStore(pool), RabbitOutbox(broker)))
    app = FastStream(broker)

    @app.on_startup
    async def prepare() -> None:
        await pool.open(wait=True, timeout=30.0)
        # Before the subscribers start: a failing job must find its DLQ declared.
        await broker.connect()
        await declare_queues(broker)
        logger.info("ai-worker ready: consuming %s", ", ".join(QUEUES.jobs.values()))

    @app.after_shutdown
    async def close_pool() -> None:
        await pool.close()

    return app
