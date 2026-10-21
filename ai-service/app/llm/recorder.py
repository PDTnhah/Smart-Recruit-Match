"""One ai.llm_calls row and one llm-logs file per attempt (NFR-5, NFR-11, AC-5, AC-6).

The full request and reply go to MinIO as JSON at `log_key`; the row keeps only the numbers, so the
database stays small (ARCHITECTURE › Các bảng chính). The file is written before the row, so a row
never points at a missing file.
"""

import io
import json
import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Protocol
from uuid import UUID

import anyio
from minio import Minio
from minio.error import S3Error
from minio.sseconfig import Rule, SSEConfig
from psycopg_pool import AsyncConnectionPool

from app.llm.types import Usage
from app.storage import minio_client

logger = logging.getLogger(__name__)

LLM_CALL_COLUMNS = (
    "job_id",
    "agent",
    "prompt_version",
    "provider",
    "model",
    "effort",
    "attempt",
    "outcome",
    "stop_reason",
    "raw_stop_reason",
    "input_tokens",
    "cache_read_tokens",
    "cache_write_tokens",
    "output_tokens",
    "cost_usd",
    "latency_ms",
    "log_key",
)
"""Every column the AI Service writes; `id` and `created_at` come from the database."""

INSERT_SQL = (
    f"INSERT INTO ai.llm_calls ({', '.join(LLM_CALL_COLUMNS)}) "
    f"VALUES ({', '.join(['%s'] * len(LLM_CALL_COLUMNS))})"
)


@dataclass(frozen=True)
class CallRecord:
    call_id: UUID
    job_id: UUID | None
    agent: str
    prompt_version: str
    provider: str
    model: str
    effort: str
    attempt: int
    outcome: str
    stop_reason: str | None
    raw_stop_reason: str | None
    usage: Usage
    cost_usd: Decimal | None
    latency_ms: int
    log_key: str

    def row(self) -> tuple[Any, ...]:
        """Values in LLM_CALL_COLUMNS order. Enumerations are UPPER_SNAKE like the CHECKs."""
        return (
            self.job_id,
            self.agent,
            self.prompt_version,
            self.provider,
            self.model,
            self.effort.upper(),
            self.attempt,
            self.outcome,
            self.stop_reason,
            self.raw_stop_reason,
            self.usage.input_tokens,
            self.usage.cache_read_tokens,
            self.usage.cache_write_tokens,
            self.usage.output_tokens,
            self.cost_usd,
            self.latency_ms,
            self.log_key,
        )


class ObjectStore(Protocol):
    async def put_json(self, key: str, document: dict[str, Any]) -> None: ...


class LlmCallStore(Protocol):
    async def insert(self, record: CallRecord) -> None: ...


class CallRecorder:
    def __init__(self, objects: ObjectStore, calls: LlmCallStore) -> None:
        self._objects = objects
        self._calls = calls

    async def record(self, record: CallRecord, log: dict[str, Any]) -> None:
        await self._objects.put_json(record.log_key, log)
        await self._calls.insert(record)


class PostgresLlmCallStore:
    """Writes as the ai_service role, which may write only schema ai (AD-4)."""

    def __init__(self, pool: AsyncConnectionPool) -> None:
        self._pool = pool

    async def insert(self, record: CallRecord) -> None:
        async with self._pool.connection() as conn:
            await conn.execute(INSERT_SQL, record.row())


class MinioObjectStore:
    """The llm-logs bucket. Created on first write with SSE-S3, because cv_parser logs hold the
    full CV (CONTEXT D34). The SDK is blocking, so calls run in a worker thread."""

    def __init__(self, client: Minio, bucket: str) -> None:
        self._client = client
        self._bucket = bucket
        self._ready = False

    @classmethod
    def from_endpoint(
        cls, endpoint: str, access_key: str, secret_key: str, bucket: str
    ) -> "MinioObjectStore":
        return cls(minio_client(endpoint, access_key, secret_key), bucket)

    async def put_json(self, key: str, document: dict[str, Any]) -> None:
        data = json.dumps(document, ensure_ascii=False, sort_keys=True, default=str).encode()
        await anyio.to_thread.run_sync(self._put, key, data)

    def _put(self, key: str, data: bytes) -> None:
        if not self._ready:
            self._ensure_bucket()
        self._client.put_object(
            self._bucket, key, io.BytesIO(data), len(data), content_type="application/json"
        )

    def _ensure_bucket(self) -> None:
        if not self._client.bucket_exists(self._bucket):
            try:
                self._client.make_bucket(self._bucket)
            except S3Error as error:
                # Another worker created it first.
                if error.code not in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists"):
                    raise
        self._client.set_bucket_encryption(self._bucket, SSEConfig(Rule.new_sse_s3_rule()))
        self._ready = True
        logger.info("bucket %s ready (SSE-S3)", self._bucket)
