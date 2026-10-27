"""FastAPI side of the AI Service: health now, admin and chatbot endpoints later (ARCHITECTURE).

Run with `uvicorn app.main:create_app --factory`; compose runs it as `ai-api`.
"""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Protocol

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from faststream.rabbit import RabbitBroker
from psycopg_pool import AsyncConnectionPool

from app.config import load_settings

logger = logging.getLogger(__name__)

PROBE_TIMEOUT_SECONDS = 3.0


class Probes(Protocol):
    async def postgres(self) -> bool: ...

    async def rabbitmq(self) -> bool: ...


class LiveProbes:
    def __init__(self, pool: AsyncConnectionPool, broker: RabbitBroker) -> None:
        self._pool = pool
        self._broker = broker

    async def postgres(self) -> bool:
        try:
            async with self._pool.connection(timeout=PROBE_TIMEOUT_SECONDS) as conn:
                await conn.execute("SELECT 1")
        except Exception as error:
            logger.warning("health: PostgreSQL unreachable: %s", error)
            return False
        return True

    async def rabbitmq(self) -> bool:
        try:
            async with asyncio.timeout(PROBE_TIMEOUT_SECONDS):
                # No-op once connected; connects here when the broker was down at startup.
                await self._broker.connect()
            return await self._broker.ping(timeout=PROBE_TIMEOUT_SECONDS)
        except Exception as error:
            logger.warning("health: RabbitMQ unreachable: %s", error)
            return False


def create_app(probes: Probes | None = None) -> FastAPI:
    """`probes` replaces the live checks in tests; production builds them from the environment."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if probes is not None:
            app.state.probes = probes
            yield
            return
        settings = load_settings()
        logging.basicConfig(level=settings.log_level)
        pool = AsyncConnectionPool(settings.ai_database_url, min_size=1, max_size=2, open=False)
        broker = RabbitBroker(settings.rabbitmq_url)
        # Neither wait: /health reports a dependency that is down instead of the app not starting.
        await pool.open(wait=False)
        app.state.probes = LiveProbes(pool, broker)
        try:
            yield
        finally:
            await broker.stop()
            await pool.close()

    app = FastAPI(title="Smart Recruit Match AI Service", lifespan=lifespan)

    @app.get("/health")
    async def health() -> JSONResponse:
        """200 when PostgreSQL (as ai_service) and RabbitMQ both answer, else 503 (US-2.1 AC-11)."""
        live: Probes = app.state.probes
        postgres, rabbitmq = await asyncio.gather(live.postgres(), live.rabbitmq())
        body = {
            "status": "ok" if postgres and rabbitmq else "error",
            "postgres": "ok" if postgres else "error",
            "rabbitmq": "ok" if rabbitmq else "error",
        }
        return JSONResponse(body, status_code=200 if postgres and rabbitmq else 503)

    return app
