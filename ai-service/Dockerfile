# syntax=docker/dockerfile:1
# AI Service image. Build context: ai-service/. Compose runs it twice with different commands:
# ai-worker (FastStream, scalable) and ai-api (FastAPI on :8000). See DEPLOY.md.
FROM python:3.12.15-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /src
# Dependencies first, in their own layer: rebuilt only when pyproject.toml changes.
COPY pyproject.toml ./
RUN mkdir app && touch app/__init__.py \
    && pip install . \
    && pip uninstall -y srm-ai-service
COPY app ./app
RUN pip install --no-deps . && rm -rf /src

# Run from an empty directory so `app` is imported from site-packages, with its package data.
WORKDIR /srv
RUN useradd --system --uid 10001 --no-create-home srm
USER srm
EXPOSE 8000
CMD ["faststream", "run", "app.worker:create_app", "--factory"]
