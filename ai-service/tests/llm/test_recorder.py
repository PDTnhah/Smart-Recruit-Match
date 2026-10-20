"""US-2.2 AC-5, AC-6: the llm-logs file is written before the row; the bucket is encrypted."""

from decimal import Decimal
from typing import Any
from uuid import uuid4

import pytest
from minio.error import S3Error
from minio.sseconfig import SSEConfig

from app.llm.recorder import CallRecord, CallRecorder, MinioObjectStore
from app.llm.types import Usage

pytestmark = pytest.mark.anyio


def record() -> CallRecord:
    return CallRecord(
        call_id=uuid4(),
        job_id=None,
        agent="cv_parser",
        prompt_version="cv_parser/v1",
        provider="GEMINI",
        model="gemini-3.8-flash",
        effort="low",
        attempt=1,
        outcome="SUCCEEDED",
        stop_reason="END_TURN",
        raw_stop_reason="STOP",
        usage=Usage(input_tokens=10, output_tokens=5),
        cost_usd=Decimal("0.000026"),
        latency_ms=900,
        log_key="cv_parser/2026/10/x.json",
    )


class FakeMinio:
    def __init__(self, *, exists: bool = False, race: bool = False) -> None:
        self.exists = exists
        self.race = race
        self.events: list[tuple[str, Any]] = []

    def bucket_exists(self, bucket: str) -> bool:
        return self.exists

    def make_bucket(self, bucket: str) -> None:
        if self.race:
            raise S3Error(None, "BucketAlreadyOwnedByYou", "taken", bucket, "req", "host")
        self.events.append(("make_bucket", bucket))

    def set_bucket_encryption(self, bucket: str, config: SSEConfig) -> None:
        self.events.append(("encryption", config.rule.sse_algorithm))

    def put_object(self, bucket, key, data, length, content_type) -> None:
        self.events.append(("put", (bucket, key, data.read(), length, content_type)))


class Ordered:
    def __init__(self) -> None:
        self.events: list[str] = []

    async def put_json(self, key: str, document: dict[str, Any]) -> None:
        self.events.append(f"file {key}")

    async def insert(self, row: CallRecord) -> None:
        self.events.append(f"row {row.log_key}")


async def test_nfr5_log_file_written_before_row():
    ordered = Ordered()
    await CallRecorder(ordered, ordered).record(record(), {"request": {}})
    assert ordered.events == ["file cv_parser/2026/10/x.json", "row cv_parser/2026/10/x.json"]


async def test_nfr5_bucket_created_once_with_sse_s3():
    fake = FakeMinio()
    store = MinioObjectStore(fake, "llm-logs")
    await store.put_json("a/1.json", {"b": "é", "a": 1})
    await store.put_json("a/2.json", {})
    assert fake.events[:2] == [("make_bucket", "llm-logs"), ("encryption", "AES256")]
    puts = [payload for name, payload in fake.events if name == "put"]
    assert [p[1] for p in puts] == ["a/1.json", "a/2.json"]
    assert puts[0][2] == '{"a": 1, "b": "é"}'.encode()
    assert puts[0][4] == "application/json"
    assert sum(name == "make_bucket" for name, _ in fake.events) == 1


async def test_bucket_created_by_another_worker_is_fine():
    fake = FakeMinio(race=True)
    await MinioObjectStore(fake, "llm-logs").put_json("a/1.json", {})
    assert ("encryption", "AES256") in fake.events


def test_endpoint_url_sets_tls():
    store = MinioObjectStore.from_endpoint("http://minio:9000", "key", "secret", "llm-logs")
    assert store._client._base_url.is_https is False
    secure = MinioObjectStore.from_endpoint("https://s3.example.com", "key", "secret", "llm-logs")
    assert secure._client._base_url.is_https is True
