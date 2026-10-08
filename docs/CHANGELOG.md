# Changelog

Lịch sử phát hành của Smart Recruit Match. Mỗi commit ship code tăng `VERSION` và thêm một mục ở đây trong cùng commit (RULE-1); mục mới nhất ở trên cùng. Commit chỉ sửa tài liệu ghi vào `[Unreleased]` và không tăng version.

## [Unreleased]

---

## [0.1.0] — 2026-10-08 — Scaffold monorepo, Docker Compose, CI — v0.1.0

Lần ship code đầu tiên (US-1.1). Repo có khung chạy được: monorepo pnpm, Docker Compose dựng cả hạ tầng bằng một lệnh, CI GitHub Actions và cổng commit koni-harness. Chưa có nghiệp vụ. Gộp luôn các thay đổi tài liệu trước đó, vốn nằm ở `[Unreleased]`.

### Added
- Monorepo pnpm 10: `apps/api` (NestJS 11, TypeScript strict, nestjs-pino, `GET /api/health` bằng @nestjs/terminus), `apps/web` (React 19 + Vite 8), `packages/shared` (Zod; `schemas/`, `states/`, `contracts/`), khung `ai-service` (Python 3.12+, ruff, pytest).
- `deploy/docker-compose.yml`: PostgreSQL 16 + pgvector, Redis 7, RabbitMQ 4 (management), MinIO (image Chainguard), Mailpit, API và nginx phục vụ web. Cả 7 service có healthcheck; dữ liệu nằm trong named volume. Chạy bằng `docker compose -f deploy/docker-compose.yml up -d --build --wait`.
- CI GitHub Actions (`.github/workflows/ci.yml`): typecheck, ESLint, test (có integration test dùng testcontainers), build web, kiểm tra ranh giới module bằng dependency-cruiser, ruff và pytest cho AI Service.
- Luật ranh giới module (`.dependency-cruiser.cjs`): `domain/` không import NestJS hay Drizzle; module chỉ dùng module khác qua `modules/<m>/index.ts`. Fixture vi phạm cố ý chứng minh luật có hiệu lực (`pnpm depcruise:fixture`).
- Hạ tầng integration test: global setup testcontainers khởi động PostgreSQL (cùng image với compose); test mẫu `db-smoke.int-spec.ts`.
- Cổng commit koni-harness (`.koni-harness/`, hook git `pre-commit`/`pre-push`, hook `PreToolUse` của Claude Code qua `scripts/claude-commit-gate.sh`).
- `DEPLOY.md`, `deploy/.env.example`; `docs/SETUP.md` và `AGENTS.md` có lệnh chạy thật.
- Sprint `sprint-2026-W41`; CONTEXT D22 (công cụ, phiên bản), D23 (image MinIO); LESSONS §3–§5.
- Bộ tài liệu theo cấu trúc koni-docs: `BRIEF.md`, `PRD.md` (từ đặc tả nghiệp vụ), `ARCHITECTURE.md` (từ tài liệu kiến trúc), `CONTEXT.md`, `LESSONS.md`, `SETUP.md`, `docs/README.md`, `docs/sprints/`.
- `AGENTS.md` làm nguồn chỉ dẫn chính cho agent; `CLAUDE.md` import `AGENTS.md`.
- PRD bổ sung bảng Functional Requirements (FR-1 – FR-37), Non-Functional Requirements (NFR-1 – NFR-13) và 6 epic theo lộ trình triển khai.
- 37 file story trong `docs/sprints/stories/` (US-1.1 … US-6.6), ở trạng thái `backlog`, có tiêu chí nghiệm thu, task và Dev notes theo template koni-docs (CONTEXT D21).

### Changed
- Frontend dùng shadcn/ui + Tailwind CSS thay cho Ant Design (CONTEXT D14).
- ARCHITECTURE › Docker Compose: service `minio` dùng `cgr.dev/chainguard/minio` vì `minio/minio` đã bị xóa khỏi Docker Hub (CONTEXT D23).

**Commit**:

---

## [0.0.0] — 2026-10-04 — Khởi tạo repo — v0.0.0

Commit đầu tiên của repo, chỉ có `README.md`. Mốc gốc của `VERSION`.

**Commit**: a804da5
