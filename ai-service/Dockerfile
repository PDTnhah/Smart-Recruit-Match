# syntax=docker/dockerfile:1
# AI Service image. Build context: ai-service/. Compose runs it twice with different commands:
# ai-worker (FastStream, scalable) and ai-api (FastAPI on :8000). See DEPLOY.md.
FROM python:3.12.15-slim-bookworm

# Embedding backend (US-2.5, CONTEXT D39). `hashing` needs no model. `bge-m3` adds the CPU build of
# torch and the `embedding` extra (sentence-transformers), about 1 GB more; the worker's
# EMBEDDING_PROVIDER must name the same one (compose passes one variable to both).
ARG EMBEDDING_PROVIDER=hashing
# Pinned with the `embedding` extra of pyproject.toml.
ARG TORCH_VERSION=2.14.1

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
# The image runs the provider it was built with unless told otherwise; compose sets it anyway.
ENV EMBEDDING_PROVIDER=${EMBEDDING_PROVIDER}
# Model cache: compose mounts the hf-models volume here, so BAAI/bge-m3 (about 4.5 GB: transformers
# fetches the weights as .bin and as safetensors) is downloaded once, on the first start, and
# survives rebuilds.
ENV HF_HOME=/models

WORKDIR /src
# torch alone first: the largest download, rebuilt only when the provider or its version changes.
# The CPU index keeps the CUDA libraries out (AD-11: no GPU).
RUN case "$EMBEDDING_PROVIDER" in \
      hashing) ;; \
      bge-m3) pip install "torch==${TORCH_VERSION}" --index-url https://download.pytorch.org/whl/cpu ;; \
      *) echo "EMBEDDING_PROVIDER must be hashing or bge-m3, not '$EMBEDDING_PROVIDER'" >&2; exit 1 ;; \
    esac
# Dependencies next, in their own layer: rebuilt only when pyproject.toml changes.
COPY pyproject.toml ./
RUN mkdir app && touch app/__init__.py \
    && if [ "$EMBEDDING_PROVIDER" = "bge-m3" ]; then pip install ".[embedding]"; else pip install .; fi \
    && pip uninstall -y srm-ai-service
COPY app ./app
RUN pip install --no-deps . && rm -rf /src

# Run from an empty directory so `app` is imported from site-packages, with its package data.
WORKDIR /srv
# /models belongs to srm, so a new hf-models volume (initialised from it) is writable.
RUN useradd --system --uid 10001 --no-create-home srm \
    && mkdir /models && chown srm /models
USER srm
EXPOSE 8000
CMD ["faststream", "run", "app.worker:create_app", "--factory"]
