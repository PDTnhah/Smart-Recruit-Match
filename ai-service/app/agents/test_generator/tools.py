"""The three tools of the Test Generator (US-4.1 AC-6 to AC-8, CONTEXT D49).

Code calls them; the LLM never does. They read and write the bank's drafts only: ai.question_drafts
and their vectors in ai.embeddings, through QuestionDraftRepo. They change no state in `core` and
call no network service; the embedding model runs in the worker.

`load_bank_tools` reads the drafts and their vectors once, at the start of a job. Drafts without a
vector of the current model (written with another embedder) are embedded then. Duplicates are
found by exact cosine in memory, over the few hundred vectors of one bank, in a worker thread.
"""

import hashlib
import logging
import unicodedata
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID

import anyio
from pydantic import ValidationError

from app.contracts.essay_question import EssayQuestion
from app.contracts.mcq_question import McqQuestion
from app.embedding import Embedder, EmbeddingRow, skill_match_key

from .config import (
    DUPLICATE_COSINE,
    MAX_DRAFTS,
    MAX_FACTOR,
    MCQ_OPTION_COUNT,
    MIN_FACTOR,
    PART_TYPES,
    QUESTION_EMBEDDING_VERSION,
    RUBRIC_MAX_CRITERIA,
    SIMILAR_K,
    TARGET_FACTOR,
)
from .drafts import Draft, NewDraft, QuestionDraftRepo
from .schemas import ProposedQuestion
from .source import BankSource

logger = logging.getLogger(__name__)

PartName = Literal["A", "B"]


class RejectReason(StrEnum):
    """Why submit_questions refused a question (AC-7, AC-8)."""

    UNKNOWN_CELL = "UNKNOWN_CELL"
    INVALID_STEM = "INVALID_STEM"
    INVALID_MCQ_OPTIONS = "INVALID_MCQ_OPTIONS"
    NOT_ONE_CORRECT = "NOT_ONE_CORRECT"
    MISSING_EXPLANATION = "MISSING_EXPLANATION"
    INVALID_RUBRIC = "INVALID_RUBRIC"
    MISSING_SAMPLE_ANSWER = "MISSING_SAMPLE_ANSWER"
    TEXT_TOO_LONG = "TEXT_TOO_LONG"
    CELL_FULL = "CELL_FULL"
    BANK_FULL = "BANK_FULL"
    DUPLICATE = "DUPLICATE"


CellKey = tuple[str, str, str]
"""(type, skill key, difficulty): two spellings of one skill are one cell."""


@dataclass(frozen=True)
class CellCoverage:
    """A cell of the blueprint still short of drafts, with the stems it holds."""

    part: PartName
    type: str
    skill: str
    """As the blueprint writes it."""
    difficulty: str
    count: int
    """Questions the cell draws for each exam."""
    drafted: int
    stems: tuple[str, ...]

    @property
    def required(self) -> int:
        return MIN_FACTOR * self.count

    @property
    def wanted(self) -> int:
        """Drafts a round asks for to reach the target (4×)."""
        return TARGET_FACTOR * self.count - self.drafted


@dataclass(frozen=True)
class SimilarQuestion:
    draft_id: int
    stem: str
    similarity: float
    """Cosine, from -1 to 1."""


@dataclass(frozen=True)
class Rejection:
    index: int
    """Position of the question in the submitted batch."""
    reason: RejectReason
    stem: str
    nearest_draft_id: int | None = None
    """For DUPLICATE: the draft the question repeats, when it is already stored."""


@dataclass(frozen=True)
class SubmitReport:
    accepted: tuple[int, ...]
    """Ids of the new drafts, in batch order."""
    rejected: tuple[Rejection, ...]


@dataclass(frozen=True)
class _Cell:
    part: PartName
    type: str
    skill: str
    skill_key: str
    difficulty: str
    count: int

    @property
    def key(self) -> CellKey:
        return (self.type, self.skill_key, self.difficulty)


@dataclass
class _Known:
    """A stem the bank holds, or one accepted earlier in the same batch."""

    draft_id: int | None
    stem: str
    vector: list[float]


@dataclass(frozen=True)
class _Candidate:
    index: int
    cell: _Cell
    stem: str
    stem_key: str
    payload: dict[str, Any]


def stem_key(stem: str) -> str:
    """Key of ai.question_drafts.stem_key: the stem in NFKC, lower case, whitespace collapsed,
    hashed so a long stem still fits the unique index."""
    normalised = " ".join(unicodedata.normalize("NFKC", stem).casefold().split())
    return hashlib.sha256(normalised.encode()).hexdigest()


def blueprint_cells(bank: BankSource) -> list[_Cell]:
    """Cells in the order of the blueprint: part A, then part B."""
    parts = bank.blueprint.parts
    cells = []
    for part, blueprint in (("A", parts.A), ("B", parts.B)):
        for cell in blueprint.cells:
            cells.append(
                _Cell(
                    part=part,
                    type=PART_TYPES[part],
                    skill=cell.skill,
                    skill_key=skill_match_key(cell.skill),
                    difficulty=cell.difficulty.value,
                    count=cell.count,
                )
            )
    return cells


async def load_bank_tools(
    *,
    bank: BankSource,
    repo: QuestionDraftRepo,
    embedder: Embedder,
    job_id: UUID,
) -> "QuestionBankTools":
    drafts = await repo.drafts(bank.bank_id)
    vectors = await repo.vectors(bank.bank_id, embedder.model)
    lacking = [draft for draft in drafts if draft.draft_id not in vectors]
    if lacking:
        embedded = await embedder.embed([draft.payload["stem"] for draft in lacking])
        await repo.add_vectors(
            embedder.model,
            [
                EmbeddingRow(draft.draft_id, QUESTION_EMBEDDING_VERSION, vector)
                for draft, vector in zip(lacking, embedded, strict=True)
            ],
        )
        vectors.update(
            (draft.draft_id, vector) for draft, vector in zip(lacking, embedded, strict=True)
        )
        logger.info(
            "bank %s: embedded %d draft(s) with %s", bank.bank_id, len(lacking), embedder.model
        )
    return QuestionBankTools(
        bank=bank,
        drafts=drafts,
        vectors=vectors,
        repo=repo,
        embedder=embedder,
        job_id=job_id,
    )


class QuestionBankTools:
    """Exactly three public methods (AC-6). Build it with `load_bank_tools`."""

    def __init__(
        self,
        *,
        bank: BankSource,
        drafts: Sequence[Draft],
        vectors: dict[int, list[float]],
        repo: QuestionDraftRepo,
        embedder: Embedder,
        job_id: UUID,
    ) -> None:
        self._bank = bank
        self._repo = repo
        self._embedder = embedder
        self._job_id = job_id
        self._cells = blueprint_cells(bank)
        self._cell_of = {cell.key: cell for cell in self._cells}
        self._drafted: Counter[CellKey] = Counter()
        self._stems: dict[CellKey, list[str]] = {}
        self._stem_keys: dict[str, int] = {}
        self._known: list[_Known] = []
        self._total = 0
        for draft in drafts:
            self._remember(
                draft.draft_id,
                (draft.type, draft.skill_key, draft.difficulty),
                draft.payload["stem"],
                draft.stem_key,
                vectors[draft.draft_id],
            )

    def get_blueprint_coverage(self) -> list[CellCoverage]:
        """The cells holding fewer than 3× the questions they draw, in blueprint order."""
        return [
            CellCoverage(
                part=cell.part,
                type=cell.type,
                skill=cell.skill,
                difficulty=cell.difficulty,
                count=cell.count,
                drafted=self._drafted[cell.key],
                stems=tuple(self._stems.get(cell.key, ())),
            )
            for cell in self._cells
            if self._drafted[cell.key] < MIN_FACTOR * cell.count
        ]

    async def find_similar_questions(self, text: str, k: int = SIMILAR_K) -> list[SimilarQuestion]:
        """The k stored drafts closest to `text`, most similar first."""
        [vector] = await self._embedder.embed([text])
        ranked = sorted(
            (
                SimilarQuestion(known.draft_id, known.stem, _cosine(vector, known.vector))
                for known in self._known
                if known.draft_id is not None
            ),
            key=lambda similar: (-similar.similarity, similar.draft_id),
        )
        return ranked[:k]

    async def submit_questions(
        self, questions: Sequence[ProposedQuestion], *, model: str, prompt_version: str
    ) -> SubmitReport:
        """Checks each question on its own; stores those that pass, with their vectors."""
        rejected: list[Rejection] = []
        candidates: list[_Candidate] = []
        for index, question in enumerate(questions):
            cell = self._cell_of.get(
                (question.type, skill_match_key(question.skill), question.difficulty)
            )
            if cell is None:
                rejected.append(Rejection(index, RejectReason.UNKNOWN_CELL, question.stem))
                continue
            payload, reason = _checked_payload(question, cell, model, prompt_version)
            if reason is not None:
                rejected.append(Rejection(index, reason, question.stem))
                continue
            assert payload is not None
            candidates.append(
                _Candidate(index, cell, payload["stem"], stem_key(payload["stem"]), payload)
            )

        vectors = await self._embedder.embed([candidate.stem for candidate in candidates])
        # Cosine over every vector of the bank, in pure Python: off the event loop.
        accepted, refused = await anyio.to_thread.run_sync(self._screen, candidates, vectors)
        rejected.extend(refused)

        ids = await self._repo.insert(
            [
                NewDraft(
                    bank_id=self._bank.bank_id,
                    job_id=self._job_id,
                    type=candidate.cell.type,
                    skill=candidate.cell.skill,
                    skill_key=candidate.cell.skill_key,
                    difficulty=candidate.cell.difficulty,
                    stem_key=candidate.stem_key,
                    payload=candidate.payload,
                    model=model,
                    prompt_version=prompt_version,
                    embedding=vector,
                )
                for candidate, vector in accepted
            ],
            self._embedder.model,
        )
        stored: list[int] = []
        for (candidate, vector), draft_id in zip(accepted, ids, strict=True):
            if draft_id is None:
                # Another job stored the same stem between our read and this write.
                rejected.append(Rejection(candidate.index, RejectReason.DUPLICATE, candidate.stem))
                continue
            stored.append(draft_id)
            self._remember(draft_id, candidate.cell.key, candidate.stem, candidate.stem_key, vector)
        return SubmitReport(
            accepted=tuple(stored),
            rejected=tuple(sorted(rejected, key=lambda rejection: rejection.index)),
        )

    def _screen(
        self, candidates: Sequence[_Candidate], vectors: Sequence[list[float]]
    ) -> tuple[list[tuple[_Candidate, list[float]]], list[Rejection]]:
        """The candidates the bank takes, in order, and the others with their reason (AC-7,
        AC-8). Reads the tools' state and changes none of it."""
        accepted: list[tuple[_Candidate, list[float]]] = []
        rejected: list[Rejection] = []
        added: Counter[CellKey] = Counter()
        batch_keys: set[str] = set()
        batch: list[_Known] = []
        for candidate, vector in zip(candidates, vectors, strict=True):
            cell = candidate.cell
            reason, nearest = None, None
            if self._total + len(accepted) >= MAX_DRAFTS:
                reason = RejectReason.BANK_FULL
            elif self._drafted[cell.key] + added[cell.key] >= MAX_FACTOR * cell.count:
                reason = RejectReason.CELL_FULL
            elif candidate.stem_key in self._stem_keys:
                reason, nearest = RejectReason.DUPLICATE, self._stem_keys[candidate.stem_key]
            elif candidate.stem_key in batch_keys:
                reason = RejectReason.DUPLICATE
            else:
                closest = _closest(vector, [*self._known, *batch])
                if closest is not None and closest[1] >= DUPLICATE_COSINE:
                    reason, nearest = RejectReason.DUPLICATE, closest[0].draft_id
            if reason is not None:
                rejected.append(Rejection(candidate.index, reason, candidate.stem, nearest))
                continue
            accepted.append((candidate, vector))
            added[cell.key] += 1
            batch_keys.add(candidate.stem_key)
            batch.append(_Known(None, candidate.stem, vector))
        return accepted, rejected

    def _remember(
        self, draft_id: int, key: CellKey, stem: str, stem_key: str, vector: list[float]
    ) -> None:
        self._drafted[key] += 1
        self._stems.setdefault(key, []).append(stem)
        self._stem_keys[stem_key] = draft_id
        self._known.append(_Known(draft_id, stem, vector))
        self._total += 1


def _checked_payload(
    question: ProposedQuestion, cell: _Cell, model: str, prompt_version: str
) -> tuple[dict[str, Any] | None, RejectReason | None]:
    """The question as the draft stores it, or why it cannot be stored (AC-7). The limits of the
    generated contract decide the lengths; GeneratedQuestion must accept every stored draft."""
    stem = question.stem.strip()
    explanation = question.explanation.strip()
    if not stem:
        return None, RejectReason.INVALID_STEM
    payload: dict[str, Any] = {
        "type": cell.type,
        "skill": cell.skill,
        "difficulty": cell.difficulty,
        "stem": stem,
        "explanation": explanation,
    }
    if cell.type == "MCQ":
        options = [{"text": o.text.strip(), "correct": o.correct} for o in question.options]
        # Case counts: `boolean` and `Boolean` are two options in Java.
        texts = {" ".join(o["text"].split()) for o in options}
        if len(options) != MCQ_OPTION_COUNT or "" in texts or len(texts) != len(options):
            return None, RejectReason.INVALID_MCQ_OPTIONS
        if sum(o["correct"] for o in options) != 1:
            return None, RejectReason.NOT_ONE_CORRECT
        if not explanation:
            return None, RejectReason.MISSING_EXPLANATION
        payload["options"] = options
        contract: type[McqQuestion | EssayQuestion] = McqQuestion
    else:
        rubric = [
            {"criterion": c.criterion.strip(), "max_points": c.max_points} for c in question.rubric
        ]
        if not 1 <= len(rubric) <= RUBRIC_MAX_CRITERIA or any(
            not c["criterion"] or c["max_points"] < 1 for c in rubric
        ):
            return None, RejectReason.INVALID_RUBRIC
        sample_answer = question.sample_answer.strip()
        if not sample_answer:
            return None, RejectReason.MISSING_SAMPLE_ANSWER
        if not explanation:
            return None, RejectReason.MISSING_EXPLANATION
        payload["rubric"] = rubric
        payload["sample_answer"] = sample_answer
        contract = EssayQuestion
    try:
        contract.model_validate(
            {**payload, "draft_id": 1, "model": model, "prompt_version": prompt_version}
        )
    except ValidationError as error:
        field = error.errors()[0]["loc"][0]
        if field == "options":
            return None, RejectReason.INVALID_MCQ_OPTIONS
        if field == "rubric":
            return None, RejectReason.INVALID_RUBRIC
        return None, RejectReason.TEXT_TOO_LONG
    return payload, None


def _cosine(left: Sequence[float], right: Sequence[float]) -> float:
    """Dot product: every embedder returns unit vectors."""
    return sum(a * b for a, b in zip(left, right, strict=True))


def _closest(vector: Sequence[float], known: Sequence[_Known]) -> tuple[_Known, float] | None:
    """The most similar known stem and its cosine, the first one on a tie."""
    return max(
        ((item, _cosine(vector, item.vector)) for item in known),
        key=lambda pair: pair[1],
        default=None,
    )
