"""Stand-ins for the Test Generator and Validator tests (US-4.1, US-4.2): the bank view,
ai.question_drafts with its vectors, ai.question_validations, and the LLM providers behind the real
StructuredLLMClient.

`MemoryDrafts` follows the rules of the SQL in app/agents/test_generator/drafts.py: a stem once per
bank, a draft and its vector written together. `MemoryValidations` follows those of
app/agents/validator/repo.py: one verdict per draft, the first one kept, read back through
`stored_validation`. `ScriptedProvider` answers each attempt with the next reply and keeps the
request, so a test reads the cells, rejections and questions each call sent.
"""

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any
from uuid import UUID

from app.agents.test_generator import (
    BankSource,
    Draft,
    NewDraft,
    TestGenerator,
    stem_key,
)
from app.agents.validator import (
    OPTION_LABELS,
    QuestionCheck,
    Validator,
    Verdict,
    decide,
    stored_validation,
)
from app.agents.validator.request import answer_key
from app.contracts.exam_blueprint import ExamBlueprint
from app.contracts.question_validation import QuestionValidation
from app.contracts.questions_generate_job import QuestionsGenerateJob
from app.contracts.questions_generate_output import QuestionsGenerateOutput
from app.embedding import Embedder, EmbeddingRow, HashingEmbedder, skill_match_key
from app.llm.providers.fixture_provider import FixtureProvider, fixture_params
from app.llm.recorder import CallRecord, CallRecorder
from app.llm.structured import StructuredLLMClient
from app.llm.types import LLMRequest, Provider, ProviderResponse, StopReason, Usage
from app.llm.usage import DEFAULT_PRICES
from app.prompts.files import load_active, load_manifest
from app.prompts.registry import PromptRegistry

LLM_FIXTURES = Path(__file__).parents[1] / "fixtures" / "llm"
MODEL = "gemini-3.8-flash"
JOB_ID = UUID("4a1f0c2e-3b5d-4e7f-9a1b-2c3d4e5f6a7b")
EARLIER_JOB = UUID("0e9d8c7b-6a5f-4e3d-8c1b-0a9f8e7d6c5b")

REQUIREMENTS: dict[str, Any] = {
    "must_have": [
        {"skill": "Java", "level": "INTERMEDIATE", "weight": 6},
        {"skill": "SQL", "level": "BASIC", "weight": 5},
    ],
    "nice_to_have": [{"skill": "Git", "level": "BASIC", "weight": 2}],
    "hard_conditions": {
        "majors": ["Công nghệ thông tin"],
        "min_study_year": 3,
        "min_gpa": None,
        "required_languages": [],
    },
    "preferred_languages": [],
}

Cells = Sequence[tuple[str, str, int]]


def bank(
    a_cells: Cells = (("Java", "EASY", 1), ("SQL", "MEDIUM", 1)),
    b_cells: Cells = (("Java", "MEDIUM", 1),),
    *,
    bank_id: int = 41,
    requirements_version: int = 2,
) -> BankSource:
    """A bank of the Backend Java JD of PRD GĐ5, with as few questions as each test needs."""

    def part(cells: Cells, weight: int) -> dict[str, Any]:
        return {
            "weight_percent": weight,
            "question_count": sum(count for _, _, count in cells),
            "cells": [{"skill": s, "difficulty": d, "count": c} for s, d, c in cells],
        }

    blueprint = {"duration_minutes": 60, "parts": {"A": part(a_cells, 60), "B": part(b_cells, 40)}}
    return BankSource(
        bank_id=bank_id,
        jd_id=7,
        jd_version=2,
        requirements_version=requirements_version,
        blueprint=ExamBlueprint.model_validate(blueprint),
        position_group="BACKEND",
        requirements=REQUIREMENTS,
    )


BANK = bank()
"""Part A: Java EASY ×1, SQL MEDIUM ×1; part B: one Java MEDIUM essay."""


def mcq(
    skill: str,
    difficulty: str,
    stem: str,
    options: Sequence[str] = ("Đáp án đúng", "Phương án 2", "Phương án 3", "Phương án 4"),
    *,
    correct: Sequence[int] = (0,),
    explanation: str = "Giải thích đáp án.",
) -> dict[str, Any]:
    return {
        "type": "MCQ",
        "skill": skill,
        "difficulty": difficulty,
        "stem": stem,
        "options": [{"text": text, "correct": i in correct} for i, text in enumerate(options)],
        "explanation": explanation,
        "rubric": [],
        "sample_answer": "",
    }


def essay(
    skill: str,
    difficulty: str,
    stem: str,
    rubric: Sequence[tuple[str, int]] = (("Nêu đúng ý chính", 6), ("Có ví dụ minh họa", 4)),
    *,
    sample_answer: str = "Bài làm mẫu đủ mọi tiêu chí.",
    explanation: str = "Câu hỏi kiểm tra cách vận dụng.",
) -> dict[str, Any]:
    return {
        "type": "ESSAY",
        "skill": skill,
        "difficulty": difficulty,
        "stem": stem,
        "options": [],
        "explanation": explanation,
        "rubric": [{"criterion": c, "max_points": p} for c, p in rubric],
        "sample_answer": sample_answer,
    }


ROUND_USAGE = Usage(input_tokens=2500, output_tokens=5000)


def answer(*questions: dict[str, Any], usage: Usage = ROUND_USAGE) -> ProviderResponse:
    return ProviderResponse(
        stop_reason=StopReason.END_TURN,
        raw_stop_reason="STOP",
        text=json.dumps({"questions": list(questions)}, ensure_ascii=False),
        model=MODEL,
        usage=usage,
    )


def check(
    ref: int,
    correct: Sequence[str] = ("A",),
    *,
    difficulty: str = "EASY",
    on_skill: bool = True,
    answer_leaked: bool = False,
    distractors_plausible: bool = True,
    clear: bool = True,
    gradeable_by_criteria: bool = True,
    duplicate_of: int | None = None,
    note: str = "",
) -> dict[str, Any]:
    """One result of a Validator answer; by default an MCQ whose answer is option A, that passes."""
    return {
        "ref": ref,
        "correct_options": list(correct),
        "on_skill": on_skill,
        "estimated_difficulty": difficulty,
        "answer_leaked": answer_leaked,
        "distractors_plausible": distractors_plausible,
        "clear": clear,
        "gradeable_by_criteria": gradeable_by_criteria,
        "duplicate_of": duplicate_of,
        "note": note,
    }


CHECK_USAGE = Usage(input_tokens=3000, output_tokens=900)


def verdicts(*results: dict[str, Any], usage: Usage = CHECK_USAGE) -> ProviderResponse:
    """A Validator answer holding `results`."""
    return ProviderResponse(
        stop_reason=StopReason.END_TURN,
        raw_stop_reason="STOP",
        text=json.dumps({"results": list(results)}, ensure_ascii=False),
        model=MODEL,
        usage=usage,
    )


def passes(count: int, difficulty: str = "EASY", *, essays: bool = False) -> ProviderResponse:
    """A Validator answer passing questions 1 to `count`."""
    correct: Sequence[str] = () if essays else ("A",)
    return verdicts(*(check(ref, correct, difficulty=difficulty) for ref in range(1, count + 1)))


def refusal() -> ProviderResponse:
    return ProviderResponse(
        stop_reason=StopReason.REFUSAL,
        raw_stop_reason="SAFETY",
        stop_category="HARM_CATEGORY_DANGEROUS_CONTENT",
        model=MODEL,
        usage=Usage(input_tokens=2500),
    )


def stored_payload(question: dict[str, Any]) -> dict[str, Any]:
    """What ai.question_drafts.payload holds for a proposal written by `mcq` or `essay`."""
    payload = {key: question[key] for key in ("type", "skill", "difficulty", "stem")}
    payload["explanation"] = question["explanation"]
    if question["type"] == "MCQ":
        payload["options"] = question["options"]
    else:
        payload["rubric"] = question["rubric"]
        payload["sample_answer"] = question["sample_answer"]
    return payload


class MemoryBanks:
    def __init__(self, *banks: BankSource) -> None:
        self._banks = {b.bank_id: b for b in banks}
        self.fetched: list[int] = []

    async def fetch(self, bank_id: int) -> BankSource | None:
        self.fetched.append(bank_id)
        return self._banks.get(bank_id)


class MemoryDrafts:
    def __init__(self) -> None:
        self.rows: list[Draft] = []
        self.bank_of: dict[int, int] = {}
        self.job_of: dict[int, UUID] = {}
        self.vectors_of: dict[tuple[int, str], list[float]] = {}
        self.added: list[int] = []
        self._next_id = 101
        self.inserts = 0
        self.fail_inserts: int | None = None
        """The insert call, counted from 1, that finds the database down."""

    async def drafts(self, bank_id: int) -> list[Draft]:
        return [d for d in self.rows if self.bank_of[d.draft_id] == bank_id]

    async def vectors(self, bank_id: int, model: str) -> dict[int, list[float]]:
        return {
            d.draft_id: self.vectors_of[(d.draft_id, model)]
            for d in await self.drafts(bank_id)
            if (d.draft_id, model) in self.vectors_of
        }

    async def insert(self, drafts: Sequence[NewDraft], model: str) -> list[int | None]:
        self.inserts += 1
        if self.inserts == self.fail_inserts:
            raise ConnectionError("ai.question_drafts is unreachable")
        ids: list[int | None] = []
        for new in drafts:
            taken = any(
                self.bank_of[d.draft_id] == new.bank_id and d.stem_key == new.stem_key
                for d in self.rows
            )
            if taken:
                ids.append(None)
                continue
            draft_id = self._store(new.bank_id, new.job_id, new.payload, new.prompt_version)
            self.vectors_of[(draft_id, model)] = list(new.embedding)
            ids.append(draft_id)
        return ids

    async def add_vectors(self, model: str, rows: Sequence[EmbeddingRow]) -> None:
        for row in rows:
            self.vectors_of[(row.owner_id, model)] = list(row.embedding)
            self.added.append(row.owner_id)

    def seed(
        self,
        bank_id: int,
        question: dict[str, Any],
        *,
        vector: Sequence[float] | None = None,
        model: str = "hashing-v1",
    ) -> int:
        """A draft an earlier job stored; without `vector`, it has no vector of `model`."""
        draft_id = self._store(bank_id, EARLIER_JOB, stored_payload(question), "test_generator/v1")
        if vector is not None:
            self.vectors_of[(draft_id, model)] = list(vector)
        return draft_id

    def stems(self, bank_id: int) -> list[str]:
        return [d.payload["stem"] for d in self.rows if self.bank_of[d.draft_id] == bank_id]

    def _store(
        self, bank_id: int, job_id: UUID, payload: dict[str, Any], prompt_version: str
    ) -> int:
        draft_id = self._next_id
        self._next_id += 1
        self.rows.append(
            Draft(
                draft_id=draft_id,
                type=payload["type"],
                skill=payload["skill"],
                skill_key=skill_match_key(payload["skill"]),
                difficulty=payload["difficulty"],
                stem_key=stem_key(payload["stem"]),
                payload=payload,
                model=MODEL,
                prompt_version=prompt_version,
            )
        )
        self.bank_of[draft_id] = bank_id
        self.job_of[draft_id] = job_id
        return draft_id


class MemoryValidations:
    """ai.question_validations, read with the type of each draft of `drafts`."""

    def __init__(self, drafts: MemoryDrafts) -> None:
        self._drafts = drafts
        self.rows: dict[int, tuple[UUID, Verdict]] = {}

    async def validations(self, bank_id: int) -> dict[int, QuestionValidation]:
        types = {d.draft_id: d.type for d in await self._drafts.drafts(bank_id)}
        return {
            draft_id: stored_validation(
                draft_type=types[draft_id],
                reasons=[reason.value for reason in verdict.validation.reasons],
                answer=verdict.answer,
                model=verdict.validation.model,
                prompt_version=verdict.validation.prompt_version,
            )
            for draft_id, (_, verdict) in self.rows.items()
            if draft_id in types
        }

    async def insert(self, job_id: UUID, verdicts: Sequence[Verdict]) -> None:
        for verdict in verdicts:
            self.rows.setdefault(verdict.draft_id, (job_id, verdict))

    def pass_draft(self, draft: Draft) -> None:
        """A verdict an earlier job stored: the draft passed, as `decide` itself decides it."""
        correct = [OPTION_LABELS[answer_key(draft)]] if draft.type == "MCQ" else []
        passed = QuestionCheck.model_validate(check(1, correct, difficulty=draft.difficulty))
        [verdict] = decide([draft], [passed], model=MODEL, prompt_version="validator/v1")
        self.rows[draft.draft_id] = (EARLIER_JOB, verdict)


class MemoryObjects:
    async def put_json(self, key: str, document: dict[str, Any]) -> None:
        pass


class MemoryCalls:
    def __init__(self) -> None:
        self.rows: list[CallRecord] = []

    async def insert(self, record: CallRecord) -> None:
        self.rows.append(record)

    async def tokens_spent(self, job_id: UUID) -> int:
        return sum(row.usage.total_tokens for row in self.rows if row.job_id == job_id)


class ScriptedProvider:
    """Answers each attempt with the next scripted reply."""

    name = Provider.GEMINI
    model = MODEL

    def __init__(self, *replies: ProviderResponse) -> None:
        self.replies = list(replies)
        self.sent: list[dict[str, Any]] = []

    def build_params(self, request: LLMRequest) -> dict[str, Any]:
        return fixture_params(request)

    async def send(self, params: dict[str, Any], documents: Sequence[Any] = ()) -> ProviderResponse:
        self.sent.append(params)
        return self.replies.pop(0)


class RecordingFixtureProvider(FixtureProvider):
    """The fixture provider of compose, keeping the requests it answered."""

    def __init__(self) -> None:
        super().__init__(LLM_FIXTURES, model=MODEL)
        self.sent: list[dict[str, Any]] = []

    async def send(self, params: dict[str, Any], documents: Sequence[Any] = ()) -> ProviderResponse:
        self.sent.append(params)
        return await super().send(params, documents)


class Harness:
    def __init__(
        self,
        *banks: BankSource,
        provider: ScriptedProvider | FixtureProvider,
        embedder: Embedder | None = None,
    ) -> None:
        self.banks = MemoryBanks(*banks)
        self.drafts = MemoryDrafts()
        self.validations = MemoryValidations(self.drafts)
        self.embedder = embedder or HashingEmbedder()
        self.provider = provider
        self.calls = MemoryCalls()
        llm = StructuredLLMClient(
            provider,
            CallRecorder(MemoryObjects(), self.calls),
            pricing=DEFAULT_PRICES,
            max_output_tokens=4000,
        )
        # The production registry: only the released, unchanged prompt renders (AD-12).
        prompts = PromptRegistry(active=load_active(), manifest=load_manifest())
        self.validator = Validator(llm=llm, prompts=prompts, repo=self.validations)
        self.agent = TestGenerator(
            sources=self.banks,
            drafts=self.drafts,
            validator=self.validator,
            embedder=self.embedder,
            llm=llm,
            prompts=prompts,
            spend=self.calls,
        )

    async def run(self, bank_id: int = BANK.bank_id) -> QuestionsGenerateOutput:
        return await self.agent(QuestionsGenerateJob(job_id=JOB_ID, bank_id=bank_id))

    def seed_checked(
        self, bank_id: int, question: dict[str, Any], *, vector: Sequence[float] | None = None
    ) -> int:
        """A draft an earlier job stored and the Validator passed."""
        draft_id = self.drafts.seed(bank_id, question, vector=vector)
        self.validations.pass_draft(next(d for d in self.drafts.rows if d.draft_id == draft_id))
        return draft_id

    def sent_to(self, agent: str) -> list[dict[str, Any]]:
        """The requests of one agent, in the order sent."""
        return [params for params in self.provider.sent if params["agent"] == agent]

    def sent_block(self, call: int, tag: str, agent: str = "test_generator") -> Any:
        """The JSON inside <tag> of the user prompt of the agent's call number `call`, or None
        without that block."""
        return block(self.sent_to(agent)[call - 1]["user"], tag)


def block(user: str, tag: str) -> Any:
    if f"<{tag}>" not in user:
        return None
    return json.loads(user.split(f"<{tag}>\n", 1)[1].split(f"\n</{tag}>", 1)[0])
