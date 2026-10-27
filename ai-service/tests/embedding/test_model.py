"""US-2.5 AC-1 (AD-11): the embedding model loads once per process, runs on CPU and returns
normalised 1024-dimension vectors; the hashing fake keeps the same contract.

The real BAAI/bge-m3 test is marked slow: install the `embedding` extra, download the model once,
then run `pytest -m slow`. It reads the local cache only (HF_HUB_OFFLINE), as the network is closed
in tests (LESSONS §19).
"""

import math
import sys
import types

import anyio
import pytest

from app.embedding import (
    BGE_M3,
    EMBEDDING_DIMENSIONS,
    HASHING,
    BgeM3Embedder,
    HashingEmbedder,
    build_embedder,
)
from app.embedding.model import MAX_SEQ_LENGTH, _load_bge_m3

pytestmark = pytest.mark.anyio


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=True))


class FakeSentenceTransformer:
    def __init__(self) -> None:
        self.encoded: list[tuple[list[str], dict]] = []

    def encode(self, texts: list[str], **options) -> list[list[float]]:
        self.encoded.append((texts, options))
        return [[1.0, *[0.0] * (EMBEDDING_DIMENSIONS - 1)] for _ in texts]


async def test_ad11_model_loaded_once_per_process():
    """AC-1: the worker loads at startup; jobs, even concurrent ones, reuse the same model."""
    model = FakeSentenceTransformer()
    loads = []

    def loader() -> FakeSentenceTransformer:
        loads.append(1)
        return model

    embedder = BgeM3Embedder(loader=loader)
    await embedder.load()
    async with anyio.create_task_group() as tasks:
        for text in ("Java", "React", "SQL"):
            tasks.start_soon(embedder.embed, [text])
    await embedder.load()

    assert len(loads) == 1
    assert len(model.encoded) == 3
    _, options = model.encoded[0]
    assert options["normalize_embeddings"] is True
    assert options["convert_to_numpy"] is True
    assert embedder.model == BGE_M3


async def test_ad11_first_embed_loads_when_startup_did_not():
    loads = []
    embedder = BgeM3Embedder(loader=lambda: loads.append(1) or FakeSentenceTransformer())
    assert await embedder.embed([]) == []
    assert loads == []
    [vector] = await embedder.embed(["Java"])
    assert (len(loads), len(vector)) == (1, EMBEDDING_DIMENSIONS)


def test_ad11_bge_m3_loaded_on_cpu_with_a_length_limit(monkeypatch: pytest.MonkeyPatch):
    built: list[tuple[str, dict]] = []

    class Recorded:
        max_seq_length = 8192

        def __init__(self, name: str, **options) -> None:
            built.append((name, options))

    module = types.ModuleType("sentence_transformers")
    module.SentenceTransformer = Recorded
    monkeypatch.setitem(sys.modules, "sentence_transformers", module)

    model = _load_bge_m3()
    assert built == [(BGE_M3, {"device": "cpu"})]
    assert model.max_seq_length == MAX_SEQ_LENGTH


def test_ad11_bge_m3_without_the_extra_asks_for_a_rebuild(monkeypatch: pytest.MonkeyPatch):
    # EMBEDDING_PROVIDER=bge-m3 on an image built for `hashing`: say how to fix it at startup.
    monkeypatch.setitem(sys.modules, "sentence_transformers", None)
    with pytest.raises(RuntimeError, match="rebuild the image with EMBEDDING_PROVIDER=bge-m3"):
        _load_bge_m3()


async def test_ad11_hashing_vectors_deterministic_normalised_1024():
    embedder = HashingEmbedder()
    first = await embedder.embed(["ReactJS", "React.js", "Java", ""])
    again = await embedder.embed(["ReactJS"])
    assert first[0] == again[0]
    for vector in first:
        assert len(vector) == EMBEDDING_DIMENSIONS
        assert math.isclose(math.sqrt(sum(v * v for v in vector)), 1.0, rel_tol=1e-9)
    assert cosine(first[0], first[1]) > cosine(first[0], first[2])
    assert embedder.model == HASHING


def test_ad11_build_embedder_by_provider():
    assert isinstance(build_embedder("bge-m3"), BgeM3Embedder)
    assert isinstance(build_embedder("hashing"), HashingEmbedder)
    with pytest.raises(ValueError, match="unknown embedding provider"):
        build_embedder("openai")


# --- the real model -----------------------------------------------------------------------------

SAME = [
    ("ReactJS", "React"),
    ("Node JS", "Node.js"),
    ("Postgres SQL", "PostgreSQL"),
    ("Kiểm thử tự động", "Automation Testing"),
    ("Học máy", "Machine Learning"),
    ("Spring boot framework", "Spring Boot"),
]
"""Spellings of one skill: the closer the better, ideally at or above 0.85."""
DIFFERENT = [
    ("Java", "JavaScript"),
    ("C", "C++"),
    ("React", "React Native"),
    ("SQL", "NoSQL"),
    ("Spring Boot", "Spring Framework"),
    ("Kiểm thử tự động", "Kiểm thử thủ công"),
]
"""Different skills that look alike: never at or above 0.85."""


@pytest.fixture
def offline_model(monkeypatch: pytest.MonkeyPatch):
    pytest.importorskip("sentence_transformers", reason="needs the `embedding` extra")
    import huggingface_hub.constants

    # huggingface_hub reads HF_HUB_OFFLINE when imported, which importorskip just did: the
    # variable alone comes too late.
    monkeypatch.setattr(huggingface_hub.constants, "HF_HUB_OFFLINE", True)
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    return BgeM3Embedder()


@pytest.mark.slow
async def test_ad11_bge_m3_1024_normalized_on_cpu(offline_model: BgeM3Embedder):
    [vector] = await offline_model.embed(["Lập trình Java, Spring Boot"])
    assert len(vector) == EMBEDDING_DIMENSIONS
    assert math.isclose(math.sqrt(sum(v * v for v in vector)), 1.0, rel_tol=1e-4)


@pytest.mark.slow
async def test_gd2_threshold_085_on_labelled_pairs(offline_model: BgeM3Embedder, capsys):
    """Measures the 0.85 threshold of AC-3/AC-4 on spellings and look-alike skills (CONTEXT D39)."""
    pairs = SAME + DIFFERENT
    vectors = await offline_model.embed([text for pair in pairs for text in pair])
    similarities = [cosine(vectors[2 * i], vectors[2 * i + 1]) for i in range(len(pairs))]
    report = "".join(
        f"{similarity:.3f}  {a!r} ~ {b!r}\n"
        for (a, b), similarity in zip(pairs, similarities, strict=True)
    )
    with capsys.disabled():
        # As UTF-8 bytes: a Windows console's code page cannot encode the Vietnamese names.
        sys.stdout.flush()
        sys.stdout.buffer.write(report.encode())
        sys.stdout.buffer.flush()
    false_matches = [
        pair
        for pair, similarity in zip(DIFFERENT, similarities[len(SAME) :], strict=True)
        if similarity >= 0.85
    ]
    assert false_matches == []
