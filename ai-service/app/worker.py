"""FastStream worker for AI jobs (AD-5, CONTEXT D33).

Run with `faststream run app.worker:create_app --factory`; compose runs it as `ai-worker`, which
scales to several replicas. Each job type has one subscriber; the JobRunner gives every type the
same claim, retry and DLQ behaviour. The LLMClient, prompt registry and MinIO stores are built once
at startup, so a missing key or an edited released prompt stops the worker before it takes a job.
The embedding model loads once, before the first job, and the skill catalogue is embedded then
(US-2.5 AC-1).
"""

import logging
from collections.abc import Mapping

from faststream import FastStream
from faststream.rabbit import Channel, RabbitBroker
from psycopg_pool import AsyncConnectionPool

from app.agents.cv_parser import CvParser
from app.agents.jd_analyzer import JdAnalyzer, PostgresJdSourceRepo
from app.agents.skill_normalizer import SkillNormalizerAgent
from app.config import load_settings
from app.consumers.base import Handler, JobRunner
from app.consumers.jobs_repo import JobStore, PostgresJobStore
from app.consumers.kinds import JOB_KINDS
from app.consumers.outbox import Outbox, RabbitOutbox
from app.consumers.subscribers import subscribe_all
from app.embedding import (
    HASHING,
    PostgresEmbeddingStore,
    PostgresSkillCatalog,
    ProfileEmbeddings,
    SkillNormalizer,
    build_embedder,
    configure_connection,
)
from app.handlers import build_handlers
from app.llm.factory import (
    build_file_reader,
    build_llm_client,
    build_log_store,
    build_prompt_registry,
)
from app.llm.recorder import PostgresLlmCallStore
from app.llm.settings import load_llm_settings
from app.queues import QUEUES

logger = logging.getLogger(__name__)

# Jobs one worker runs at once; aio-pika would otherwise start every delivered message in
# parallel. Scale out with more ai-worker replicas instead.
PREFETCH_COUNT = 8


def build_runners(
    store: JobStore, outbox: Outbox, handlers: Mapping[str, Handler]
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
    pool = AsyncConnectionPool(
        settings.ai_database_url,
        min_size=1,
        max_size=4,
        open=False,
        configure=configure_connection,
    )
    llm_settings = load_llm_settings()
    files = build_file_reader(llm_settings)
    llm = build_llm_client(
        llm_settings, objects=build_log_store(llm_settings), calls=PostgresLlmCallStore(pool)
    )
    prompts = build_prompt_registry(llm_settings)
    embedder = build_embedder(settings.embedding_provider)
    embeddings = PostgresEmbeddingStore(pool)
    catalog = PostgresSkillCatalog(pool)
    skills = SkillNormalizer(
        catalog=catalog,
        store=embeddings,
        embedder=embedder,
        threshold=settings.skill_match_threshold,
    )
    handlers = build_handlers(
        cv_parser=CvParser(
            files=files,
            llm=llm,
            prompts=prompts,
            skills=skills,
            embeddings=ProfileEmbeddings(store=embeddings, embedder=embedder),
            mask_contacts=settings.cv_mask_contacts,
        ),
        jd_analyzer=JdAnalyzer(
            sources=PostgresJdSourceRepo(pool), files=files, llm=llm, prompts=prompts, skills=skills
        ),
        skill_normalizer=SkillNormalizerAgent(catalog=catalog, llm=llm, prompts=prompts),
        fake_file_keys=settings.fake_file_keys,
    )
    subscribe_all(broker, build_runners(PostgresJobStore(pool), RabbitOutbox(broker), handlers))
    app = FastStream(broker)

    @app.on_startup
    async def prepare() -> None:
        await pool.open(wait=True, timeout=30.0)
        # Once per process, before any job (AC-1); the catalogue is then embedded with it.
        await embedder.load()
        embedded = await skills.embed_catalogue()
        # Before the subscribers start: a failing job must find its DLQ declared.
        await broker.connect()
        await declare_queues(broker)
        logger.info(
            "ai-worker ready: consuming %s with LLM %s/%s",
            ", ".join(QUEUES.jobs.values()),
            llm_settings.provider,
            llm_settings.model,
        )
        logger.info(
            "embedding model %s, skill match threshold %s, %d catalogue skill(s) embedded",
            embedder.model,
            settings.skill_match_threshold,
            embedded,
        )
        if embedder.model == HASHING:
            logger.warning("EMBEDDING_PROVIDER=hashing: fake embeddings, not for real matching")
        if settings.fake_file_keys:
            logger.warning("AI_FAKE_FILE_KEYS is set: __fake__/ file keys fail on purpose")

    @app.after_shutdown
    async def close_pool() -> None:
        await pool.close()

    return app
