"""Stand-ins for the Matching Agent tests: views, ai.llm_batches, the batch provider and the broker.

MemoryBatchStore follows the rules of the SQL in app/consumers/batches.py (lease, SKIP LOCKED, one
lock per job), with a clock the test moves. ScriptedBatchProvider answers each request by its key
and round, so a test reads like the story: "pair A expires in round 1, succeeds in round 2".
"""

import asyncio
import json
from collections.abc import AsyncIterator, Iterable, Mapping, Sequence
from contextlib import asynccontextmanager
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel

from app.agents.matching import MatchCompletion, MatchingAgent
from app.agents.matching.source import CvRow, JdRow, PairRow, pair_key
from app.consumers.batch_poller import BatchCoordinator
from app.consumers.batches import OPEN, BatchRow, Failure, NewBatch
from app.contracts.match_pair_ref import MatchPairRef
from app.contracts.match_run_job import MatchRunJob
from app.llm.batch import BatchItemResult, BatchState, BatchStatus, StructuredBatchClient
from app.llm.providers.fixture_provider import fixture_params
from app.llm.recorder import CallRecord, CallRecorder
from app.llm.structured import StructuredLLMClient
from app.llm.types import LLMRequest, Provider, ProviderResponse, StopReason, Usage
from app.llm.usage import DEFAULT_BATCH_PRICES, DEFAULT_PRICES
from app.prompts.files import load_manifest
from app.prompts.registry import PromptRegistry

MODEL = "claude-opus-5-5"
RULES = "matching-rules/v1+language-cefr/v1+soft-skill-signals/v1"
T0 = datetime(2026, 11, 3, 8, 0, tzinfo=UTC)

PROFILE = {
    "summary": "Sinh viên năm 3 ngành Công nghệ thông tin, quan tâm phát triển backend.",
    "education": [
        {
            "institution": "Trường Đại học [ORG]",
            "degree": "Kỹ sư",
            "major": "Công nghệ thông tin",
            "start": "2023-09",
            "end": None,
            "gpa": None,
        }
    ],
    "skills": [],
    "projects": [
        {
            "name": "Hệ thống quản lý thư viện",
            "role": "Backend developer",
            "description": "Xây dựng REST API bằng Spring Boot cho 200 người dùng thử nghiệm.",
            "technologies": ["Java", "Spring Boot", "MySQL"],
            "start": None,
            "end": None,
        }
    ],
    "experience": [],
    "languages": [{"language": "Tiếng Anh", "level": "TOEIC 650"}],
    "certificates": [],
}
MASKED_TEXT = (
    "[NAME]\nEmail: [EMAIL] - SĐT: [PHONE]\n"
    "Dự án: Hệ thống quản lý thư viện. Xây dựng   REST API bằng Spring Boot "
    "cho 200 người dùng thử nghiệm."
)
CRITERIA = {
    "must_have": [{"skill": "Java", "verdict": "MET", "evidence": "Java"}],
    "nice_to_have": [],
    "education": {"major_match": "EXACT", "major_unrecognized": False},
    "language": {"verdict": "MET", "evidence": "Tiếng Anh TOEIC 650"},
    "zones": [{"zone": "BACKEND", "demandWeightX100": 100, "coverageX100": 50}],
    "gaps": [
        {"skill": "Docker", "group": "must_have", "levelRequired": "BASIC", "verdict": "NOT_MET"}
    ],
}
REQUIREMENTS = {
    "must_have": [{"skill": "Java", "level": "BASIC", "weight": 2}],
    "nice_to_have": [],
    "hard_conditions": {
        "majors": [],
        "min_study_year": None,
        "min_gpa": None,
        "required_languages": [],
    },
    "preferred_languages": [],
}
TRUE_QUOTE = "Xây dựng REST API bằng Spring Boot cho 200 người dùng thử nghiệm."
FABRICATED_QUOTE = "Dẫn dắt nhóm 10 người triển khai hệ thống thanh toán cho ngân hàng."


def ref(cv_id: int, jd_id: int) -> MatchPairRef:
    return MatchPairRef(cv_id=cv_id, cv_version=1, jd_id=jd_id, jd_version=1)


def key(cv_id: int, jd_id: int) -> str:
    return pair_key(ref(cv_id, jd_id))


def match_job(*refs: MatchPairRef, prompt_version: str | None = None) -> MatchRunJob:
    return MatchRunJob(
        job_id=uuid4(),
        campaign_id=1,
        rules_version=RULES,
        prompt_version=prompt_version,
        pairs=list(refs),
    )


def assessment_json(score: int = 3, quotes: Sequence[str] = (TRUE_QUOTE,)) -> str:
    return json.dumps(
        {
            "project_relevance": {
                "score_0_4": score,
                "reason": "Dự án thư viện dùng Java và Spring Boot.",
                "evidence": list(quotes),
            },
            "strengths": ["Có dự án backend bằng Java."],
            "suggestions": ["Học thêm Docker."],
            "summary": "Hồ sơ khá phù hợp với vị trí backend.",
        },
        ensure_ascii=False,
    )


def answer(text: str | None = None, *, model: str = MODEL, **fields: Any) -> ProviderResponse:
    return ProviderResponse(
        stop_reason=fields.pop("stop_reason", StopReason.END_TURN),
        text=assessment_json() if text is None else text,
        model=model,
        usage=fields.pop(
            "usage", Usage(input_tokens=300, cache_read_tokens=900, output_tokens=200)
        ),
        **fields,
    )


def refusal() -> ProviderResponse:
    return ProviderResponse(
        stop_reason=StopReason.REFUSAL,
        raw_stop_reason="refusal",
        stop_category="cyber",
        model=MODEL,
        usage=Usage(input_tokens=300),
    )


class FakeSources:
    """The three views: every pair, CV and JD it was given is present unless removed."""

    def __init__(self, cv_ids: Iterable[int] = (1, 2, 3), jd_ids: Iterable[int] = (10, 20)) -> None:
        self.cvs_by_id = {cv_id: CvRow(cv_id, 1, PROFILE, MASKED_TEXT) for cv_id in cv_ids}
        self.jds_by_id = {jd_id: JdRow(jd_id, 1, "BACKEND", REQUIREMENTS) for jd_id in jd_ids}
        self.missing_pairs: set[str] = set()

    async def pairs(
        self, campaign_id: int, rules_version: str, refs: Sequence[MatchPairRef]
    ) -> list[PairRow]:
        return [
            PairRow(r.cv_id, r.cv_version, r.jd_id, r.jd_version, CRITERIA)
            for r in refs
            if pair_key(r) not in self.missing_pairs
        ]

    async def cvs(self, cv_ids: Iterable[int]) -> dict[int, CvRow]:
        return {i: self.cvs_by_id[i] for i in set(cv_ids) if i in self.cvs_by_id}

    async def jds(self, jd_ids: Iterable[int]) -> dict[int, JdRow]:
        return {i: self.jds_by_id[i] for i in set(jd_ids) if i in self.jds_by_id}


class ScriptedBatchProvider:
    """Replies by key and round: `script[key]` lists one entry per round, the last one repeating;
    an entry is a ProviderResponse or the error string of a request without an answer."""

    name = Provider.ANTHROPIC
    model = MODEL
    max_requests = 100_000
    max_bytes = 200_000_000

    def __init__(self, script: Mapping[str, Sequence[ProviderResponse | str]] | None = None):
        self.script = dict(script or {})
        self.submitted: list[tuple[str, list[str]]] = []
        self.states: dict[str, BatchStatus] = {}
        self.fail_submit: Exception | None = None
        # Set `gate` to hold `results` until it opens; `reading` tells that a read has begun.
        self.gate: asyncio.Event | None = None
        self.reading = asyncio.Event()

    def build_params(self, request: LLMRequest) -> dict[str, Any]:
        return {**fixture_params(request), "mode": "batch"}

    async def submit(
        self, items: Sequence[tuple[str, dict[str, Any]]], *, display_name: str
    ) -> str:
        if self.fail_submit is not None:
            raise self.fail_submit
        batch_id = f"batch-{len(self.submitted) + 1}"
        self.submitted.append((batch_id, [k for k, _ in items]))
        return batch_id

    async def status(self, batch_id: str) -> BatchStatus:
        return self.states.get(batch_id, BatchStatus(BatchState.ENDED))

    async def results(
        self, batch_id: str, items: Mapping[str, dict[str, Any]], *, round_number: int
    ) -> list[BatchItemResult]:
        self.reading.set()
        if self.gate is not None:
            await self.gate.wait()
        results = []
        for item_key in items:
            entries = self.script.get(item_key) or [answer()]
            entry = entries[min(round_number, len(entries)) - 1]
            if isinstance(entry, str):
                retryable = not entry.startswith("invalid_request_error")
                results.append(BatchItemResult(item_key, None, error=entry, retryable=retryable))
            else:
                results.append(BatchItemResult(item_key, entry))
        return results


class ScriptedSyncProvider:
    """The synchronous provider behind LLMClient, for refused pairs resent on their own."""

    name = Provider.ANTHROPIC
    model = MODEL

    def __init__(self, *replies: ProviderResponse) -> None:
        self.replies = list(replies)
        self.sent: list[dict[str, Any]] = []

    def build_params(self, request: LLMRequest) -> dict[str, Any]:
        return fixture_params(request)

    async def send(self, params: dict[str, Any], documents: Sequence[Any] = ()) -> ProviderResponse:
        self.sent.append(params)
        return self.replies.pop(0)


class MemoryObjects:
    def __init__(self) -> None:
        self.files: dict[str, dict[str, Any]] = {}

    async def put_json(self, key: str, document: dict[str, Any]) -> None:
        self.files[key] = json.loads(json.dumps(document, default=str))

    async def get_json(self, key: str) -> dict[str, Any]:
        return self.files[key]


class MemoryCalls:
    def __init__(self) -> None:
        self.rows: list[CallRecord] = []

    async def insert(self, record: CallRecord) -> None:
        self.rows.append(record)


class RecordingOutbox:
    def __init__(self) -> None:
        self.results: list[dict[str, Any]] = []

    async def publish_result(self, message: BaseModel, job_id: str) -> None:
        self.results.append(json.loads(message.model_dump_json()))

    async def dead_letter(self, queue: str, body: bytes, reason: str, attempts: int) -> None:
        raise AssertionError("no MATCH message goes to a DLQ in these tests")


class MemoryBatchStore:
    """ai.llm_batches and ai.jobs in memory, with the rules of the SQL."""

    def __init__(self) -> None:
        self.now = T0
        self.rows: dict[int, dict[str, Any]] = {}
        self.jobs: dict[UUID, str] = {}
        self._locks: dict[UUID, asyncio.Lock] = {}
        self._claiming = asyncio.Lock()

    def _row(self, values: dict[str, Any]) -> BatchRow:
        return BatchRow(**{field: values[field] for field in BatchRow.__dataclass_fields__})

    def _insert(self, batch: NewBatch, owner: str | None, lease_seconds: float) -> BatchRow | None:
        if any(
            (r["job_id"], r["round"], r["part"]) == (batch.job_id, batch.round, batch.part)
            for r in self.rows.values()
        ):
            return None
        row_id = len(self.rows) + 1
        self.rows[row_id] = {
            "id": row_id,
            "job_id": batch.job_id,
            "job_type": batch.job_type,
            "job_payload": json.loads(json.dumps(batch.job_payload)),
            "agent": batch.agent,
            "prompt_version": batch.prompt_version,
            "provider": batch.provider,
            "model": batch.model,
            "round": batch.round,
            "part": batch.part,
            "status": "PREPARING",
            "provider_batch_id": None,
            "request_count": batch.request_count,
            "failures": [f.as_json() for f in batch.failures],
            "submitted_at": None,
            "lease_owner": owner,
            "lease_until": self.now + timedelta(seconds=lease_seconds) if owner else None,
            "next_poll_at": self.now,
            "error_message": None,
        }
        self.jobs.setdefault(batch.job_id, "PROCESSING")
        return self._row(self.rows[row_id])

    async def started(self, job_id: UUID) -> bool:
        return any(r["job_id"] == job_id for r in self.rows.values())

    async def start(
        self, batches: Sequence[NewBatch], *, owner: str, lease_seconds: float
    ) -> list[BatchRow] | None:
        rows = []
        for batch in batches:
            row = self._insert(batch, owner, lease_seconds)
            if row is None:
                return None
            rows.append(row)
        return rows

    async def claim(self, *, owner: str, lease_seconds: float) -> BatchRow | None:
        async with self._claiming:
            due = [
                r
                for r in self.rows.values()
                if r["status"] in OPEN
                and r["next_poll_at"] <= self.now
                and (r["lease_until"] is None or r["lease_until"] < self.now)
            ]
            if not due:
                return None
            row = min(due, key=lambda r: (r["next_poll_at"], r["id"]))
            row.update(lease_owner=owner, lease_until=self.now + timedelta(seconds=lease_seconds))
            return self._row(row)

    async def submitted(self, row_id: int, provider_batch_id: str, *, poll_seconds: int) -> None:
        row = self.rows[row_id]
        if row["status"] != "PREPARING":
            return
        row.update(
            status="SUBMITTED",
            provider_batch_id=provider_batch_id,
            submitted_at=self.now,
            next_poll_at=self.now + timedelta(seconds=poll_seconds),
            lease_owner=None,
            lease_until=None,
        )

    async def renew(self, row_id: int, *, owner: str, lease_seconds: float) -> bool:
        row = self.rows[row_id]
        if row["lease_owner"] != owner or row["status"] not in OPEN:
            return False
        row.update(lease_until=self.now + timedelta(seconds=lease_seconds))
        return True

    async def later(self, row_id: int, *, owner: str, poll_seconds: int) -> None:
        row = self.rows[row_id]
        if row["lease_owner"] != owner:
            return
        row.update(
            next_poll_at=self.now + timedelta(seconds=poll_seconds),
            lease_owner=None,
            lease_until=None,
        )

    @asynccontextmanager
    async def locked(self, job_id: UUID) -> AsyncIterator["_MemoryJobBatches"]:
        lock = self._locks.setdefault(job_id, asyncio.Lock())
        async with lock:
            rows = [
                self._row(r)
                for r in sorted(self.rows.values(), key=lambda r: (r["round"], r["part"]))
                if r["job_id"] == job_id
            ]
            yield _MemoryJobBatches(self, job_id, rows)


class _MemoryJobBatches:
    def __init__(self, store: MemoryBatchStore, job_id: UUID, rows: list[BatchRow]) -> None:
        self._store = store
        self._job_id = job_id
        self.rows = rows

    async def settle(
        self, row_id: int, status: str, failures: Sequence[Failure], error: str | None
    ) -> None:
        values = [f.as_json() for f in failures]
        self._store.rows[row_id].update(
            status=status, failures=values, error_message=error, lease_owner=None, lease_until=None
        )
        self.rows = [
            replace(r, status=status, failures=values) if r.id == row_id else r for r in self.rows
        ]

    async def insert(self, batches: Sequence[NewBatch]) -> None:
        for batch in batches:
            row = self._store._insert(batch, None, 0)
            if row is not None:
                self.rows.append(row)

    async def finish_job(self, status: str, error: str | None) -> None:
        if self._store.jobs.get(self._job_id) == "PROCESSING":
            self._store.jobs[self._job_id] = status


class Harness:
    """One worker: agent, coordinator and completion over shared stores. A second Harness with
    the same `store`, `objects` and `provider` stands for a second replica or a restarted worker."""

    def __init__(
        self,
        *,
        store: MemoryBatchStore | None = None,
        objects: MemoryObjects | None = None,
        provider: ScriptedBatchProvider | None = None,
        sources: FakeSources | None = None,
        sync: ScriptedSyncProvider | None = None,
        owner: str = "worker-1",
        lease_seconds: float = 15 * 60,
    ) -> None:
        self.store = store or MemoryBatchStore()
        self.objects = objects or MemoryObjects()
        self.provider = provider or ScriptedBatchProvider()
        self.sources = sources or FakeSources()
        self.sync = sync or ScriptedSyncProvider()
        self.calls = MemoryCalls()
        self.sync_calls = MemoryCalls()
        self.outbox = RecordingOutbox()
        self.prompts = PromptRegistry(manifest=load_manifest())
        self.batch_client = StructuredBatchClient(
            self.provider,
            CallRecorder(self.objects, self.calls),
            self.objects,
            pricing=DEFAULT_BATCH_PRICES,
            max_output_tokens=4000,
            clock=lambda: self.store.now,
        )
        llm = StructuredLLMClient(
            self.sync,
            CallRecorder(MemoryObjects(), self.sync_calls),
            pricing=DEFAULT_PRICES,
            max_output_tokens=4000,
        )
        self.completion = MatchCompletion(sources=self.sources, llm=llm, outbox=self.outbox)
        self.coordinator = BatchCoordinator(
            self.store,
            self.batch_client,
            {"MATCH": self.completion},
            owner=owner,
            poll_seconds=60,
            lease_seconds=lease_seconds,
        )
        self.agent = MatchingAgent(
            sources=self.sources, prompts=self.prompts, batches=self.coordinator
        )

    async def drain(self, *, max_steps: int = 50) -> int:
        """Polls until nothing is due, moving the clock past every poll interval."""
        steps = 0
        while steps < max_steps:
            if await self.coordinator.poll_once():
                steps += 1
                continue
            pending = [r for r in self.store.rows.values() if r["status"] in OPEN]
            if not pending:
                return steps
            self.store.now = max(r["next_poll_at"] for r in pending) + timedelta(seconds=1)
        raise AssertionError("the batches did not settle")


def items_of(results: Sequence[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Every published assessment by pair key."""
    return {
        f"{i['cv_id']}_{i['cv_version']}_{i['jd_id']}_{i['jd_version']}": i
        for r in results
        for i in r["result"]["items"]
    }


def final_of(results: Sequence[dict[str, Any]]) -> dict[str, Any]:
    [final] = [r for r in results if r["result"]["final"]]
    return final
