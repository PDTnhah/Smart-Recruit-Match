"""Text embeddings (AD-11, US-2.5 AC-1, CONTEXT D39).

`BAAI/bge-m3` runs in the AI Service on CPU: 1024 dimensions, Vietnamese and English, and no text
leaves the server. Its weights (about 2.3 GB) load once per worker process, at startup, so no job
pays for it. `sentence-transformers` and `torch` come with the `embedding` extra only, so the
image without them stays small: compose defaults to `EMBEDDING_PROVIDER=hashing`, a deterministic
fake that needs neither, as `LLM_PROVIDER=fixture` does for the LLM.

Every vector is L2-normalised, so cosine similarity is the dot product.
"""

import hashlib
import logging
import math
from collections.abc import Callable, Sequence
from typing import Any, Protocol

import anyio

logger = logging.getLogger(__name__)

EMBEDDING_DIMENSIONS = 1024
"""Size of ai.embeddings.embedding (apps/api/src/db/schema/ai.ts)."""
BGE_M3 = "BAAI/bge-m3"
HASHING = "hashing-v1"
MAX_SEQ_LENGTH = 512
"""Tokens per text. Skill names and profiles fit; a longer input is cut, which bounds CPU time."""
BATCH_SIZE = 16
PROVIDERS = ("bge-m3", "hashing")


class Embedder(Protocol):
    @property
    def model(self) -> str:
        """Stored with every vector: vectors of two models are never compared."""
        ...

    async def load(self) -> None:
        """Prepares the model; the worker calls it once before taking jobs."""
        ...

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        """One normalised vector of EMBEDDING_DIMENSIONS floats per text, in order."""
        ...


def _load_bge_m3() -> Any:
    # Imported here: the package is only in images built with EMBEDDING_PROVIDER=bge-m3.
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as error:
        raise RuntimeError(
            "EMBEDDING_PROVIDER=bge-m3 needs the `embedding` extra: rebuild the image with "
            "EMBEDDING_PROVIDER=bge-m3 (docker compose up --build, DEPLOY.md)"
        ) from error

    model = SentenceTransformer(BGE_M3, device="cpu")
    model.max_seq_length = MAX_SEQ_LENGTH
    return model


class BgeM3Embedder:
    """BAAI/bge-m3 through sentence-transformers, on CPU (AC-1)."""

    def __init__(self, *, loader: Callable[[], Any] = _load_bge_m3) -> None:
        self._loader = loader
        self._model: Any = None
        self._lock = anyio.Lock()
        # One encode at a time: torch already uses every core for one batch.
        self._limiter = anyio.CapacityLimiter(1)

    @property
    def model(self) -> str:
        return BGE_M3

    async def load(self) -> None:
        async with self._lock:
            if self._model is None:
                logger.info("loading embedding model %s", BGE_M3)
                self._model = await anyio.to_thread.run_sync(self._loader)

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        await self.load()
        return await anyio.to_thread.run_sync(self._encode, list(texts), limiter=self._limiter)

    def _encode(self, texts: list[str]) -> list[list[float]]:
        vectors = self._model.encode(
            texts,
            batch_size=BATCH_SIZE,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        return [[float(value) for value in vector] for vector in vectors]


class HashingEmbedder:
    """Character trigrams hashed into 1024 dimensions, then normalised. Spellings that share most
    trigrams get close vectors; meaning plays no part. For compose without the model and for tests,
    never for real matching."""

    @property
    def model(self) -> str:
        return HASHING

    async def load(self) -> None:
        return None

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        return [hashing_vector(text) for text in texts]


def hashing_vector(text: str) -> list[float]:
    vector = [0.0] * EMBEDDING_DIMENSIONS
    padded = f"  {text.casefold()}  "
    for start in range(len(padded) - 2):
        digest = hashlib.blake2b(padded[start : start + 3].encode(), digest_size=8).digest()
        index = int.from_bytes(digest[:4], "little") % EMBEDDING_DIMENSIONS
        vector[index] += 1.0 if digest[4] & 1 else -1.0
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0.0:
        # Unreachable for real text (the padding alone gives trigrams); keeps a unit vector.
        vector[0], norm = 1.0, 1.0
    return [value / norm for value in vector]


def build_embedder(provider: str) -> Embedder:
    if provider == "bge-m3":
        return BgeM3Embedder()
    if provider == "hashing":
        return HashingEmbedder()
    raise ValueError(f"unknown embedding provider {provider!r}; expected one of {PROVIDERS}")
