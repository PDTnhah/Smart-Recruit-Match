---
id: US-1.1
title: "Scaffold monorepo, Docker Compose, CI"
epic: EPIC-1
status: in-progress
priority: P0
points: 5
sprint: sprint-2026-W41
version_shipped:
arch_ref: [AD-3]
assignee: PDTnhah
commit:
created: 2026-10-07
updated: 2026-10-08
---

## Story refresh — 2026-10-08

Đọc lại story vào ngày 2026-10-08 trên nhánh `us-1.1`, so với spec và môi trường hiện tại. Các quyết định sau được chốt vào story; số AC giữ nguyên:

- **Image MinIO** ([CONTEXT D23](../../CONTEXT.md)): `minio/minio` đã bị xóa khỏi Docker Hub, `quay.io/minio/minio` cũng không còn pull được. Service `minio` dùng `cgr.dev/chainguard/minio`, vẫn là mã MinIO gốc, ghim theo digest. API chỉ đọc `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, nên trỏ sang MinIO hay S3 bên ngoài thì chỉ cần đổi `.env`. AC-2 vẫn yêu cầu đủ 7 service.
- **Công cụ và phiên bản** ([CONTEXT D22](../../CONTEXT.md)): người dùng đã chốt các mục mà *Architecture constraints* để ngỏ:
  - Lint: ESLint + typescript-eslint cho TypeScript, ruff cho Python.
  - Python: `pyproject.toml` + `pip install -e ".[dev]"`.
  - Driver PostgreSQL: `pg`.
  - Vị trí file: `deploy/.env.example`, `DEPLOY.md` ở gốc repo.
  - Phiên bản ghim: pnpm 10, TypeScript 6.0, NestJS 11. Lý do: typescript-eslint chưa hỗ trợ TypeScript 7, nestjs-zod chưa hỗ trợ NestJS 12.
- **Hook Claude Code** (LESSONS §3): snippet trong `koni-harness/references/adapters.md` không chạy. Story dùng `matcher: "Bash"` + `if: "Bash(git commit*)"` + `|| exit 2`.

## Goal

Dựng khung monorepo pnpm, Docker Compose và CI để mọi story sau chỉ việc thêm code vào đúng chỗ. Sau story này, một lệnh `docker compose up` dựng đủ PostgreSQL/pgvector, Redis, RabbitMQ, MinIO, Mailpit, API và web. CI chạy typecheck, lint, test và kiểm tra ranh giới module ở mỗi lần push. Cổng commit của koni-harness chặn commit tăng `VERSION` mà thiếu CHANGELOG. Các story từ US-1.2 trở đi không phải lo cấu trúc thư mục, script hay hạ tầng test.

## Background

Repo mới có tài liệu, `VERSION` là 0.0.0 ([CONTEXT D19](../../CONTEXT.md)). ARCH › *Project structure* đã chốt cây thư mục: `apps/web`, `apps/api`, `packages/shared`, `ai-service`, `simulation`, `deploy`. AD-3 ([CONTEXT D3](../../CONTEXT.md)) chọn phương án A: frontend và Core Backend viết bằng TypeScript trong monorepo pnpm, AI Service viết bằng Python, Core Backend là modular monolith. Phương án toàn TypeScript và phương án microservice theo module đã bị loại.

ARCH › *Deployment architecture* liệt kê các service Docker Compose; ARCH › *CI* liệt kê các bước GitHub Actions. Story này chỉ dựng phần EPIC-1 cần. Hai service `ai-worker`, `ai-api` và bước kiểm tra hợp đồng message TS ↔ Python thuộc US-2.1 (EPIC-1 › *Out of scope*: EPIC-1 chỉ khởi động RabbitMQ).

CONTEXT D20 › *Impact* yêu cầu US-1.1 cài cổng commit của koni-harness và chạy thử `swarm.sh`, vì lộ trình dựa vào hai làn agent chạy song song. Epic yêu cầu dựng testcontainers ở `apps/api/test/` (EPIC-1 › *Cross-story testing requirements*) và chạy dependency-cruiser trong CI ngay từ story này (EPIC-1 › *Cross-cutting invariants*, AGENTS › Nguyên tắc 13).

Theo D19, đây là lần ship code đầu tiên nên `VERSION` lên `0.1.0`. AGENTS › *Lệnh* và `docs/SETUP.md` được điền lệnh thật trong cùng commit.

**Lessons applied**: §1 — cài cổng koni-harness từ bản gốc `.agents/skills/koni-harness/scripts/`, không qua liên kết `.claude/skills`.

## Acceptance criteria

- [ ] **AC-1** — Gốc repo có `pnpm-workspace.yaml` (khai báo `apps/*`, `packages/*`) và `package.json` có trường `packageManager` ghim phiên bản pnpm, cùng các script chạy trên toàn workspace: `typecheck`, `lint`, `test`, `build`, `depcruise`. `apps/api` (NestJS, TypeScript `strict`), `apps/web` (React 19 + TypeScript + Vite) và `packages/shared` (Zod; có thư mục `schemas/`, `states/`, `contracts/`) đều build được. Cả `apps/api` và `apps/web` import được một export mẫu từ `packages/shared`.
- [ ] **AC-2** — **Given** máy có Docker và đã sao `deploy/.env.example` thành `deploy/.env`, **When** chạy `docker compose -f deploy/docker-compose.yml up -d --build`, **Then** các service `nginx`, `api`, `postgres` (image `pgvector/pgvector`, PostgreSQL 16), `redis` (7), `rabbitmq` (bản management), `minio`, `mailpit` đều đạt trạng thái `healthy` **And** `GET /api/health` qua nginx trả `200` **And** nginx trả bản build của web ở `/`, các đường dẫn SPA như `/sv/abc` cũng trả `index.html`.
- [ ] **AC-3** — **Given** `postgres` hoặc `redis` chưa sẵn sàng, **When** compose khởi động `api`, **Then** `api` chờ nhờ `depends_on` với `condition: service_healthy`, không rơi vào vòng crash-restart **And** dữ liệu PostgreSQL, MinIO, RabbitMQ nằm trong named volume, `docker compose down` (không có `-v`) rồi `up` lại không mất dữ liệu.
- [ ] **AC-4** — **Given** một push hoặc pull request, **When** workflow `.github/workflows/ci.yml` chạy, **Then** nó chạy `pnpm install --frozen-lockfile` một lần cho cả monorepo, rồi chạy `typecheck`, `lint`, `test` (kể cả integration test dùng testcontainers), build web, `depcruise`, lint và test `ai-service` (pytest, không gọi API thật) **And** chỉ cần một bước lỗi là job đỏ.
- [ ] **AC-5** — **Given** một file trong `apps/api/src/modules/<m>/domain/` import `@nestjs/*` hoặc `drizzle-orm`, hoặc một file trong `modules/<a>/` import thẳng vào bên trong `modules/<b>/` thay vì qua file export công khai của module đó, **When** chạy dependency-cruiser với config của repo, **Then** lệnh thoát với mã khác 0 và chỉ rõ vi phạm. Thư mục fixture vi phạm cố ý chứng minh hai luật này có hiệu lực; cây mã thật thì `pnpm depcruise` qua.
- [ ] **AC-6** — `apps/api/test/` có global setup testcontainers khởi động PostgreSQL (cùng image pgvector với compose) và một integration test mẫu chạy được truy vấn `SELECT 1`. Container bị dọn sau khi chạy xong. Test không phụ thuộc vào stack compose đang chạy.
- [ ] **AC-7** — **Given** đã chạy `install-gate.sh` (có `.koni-harness/`, hook `pre-commit` và `pre-push` có khối marker, hook `PreToolUse` trong `.claude/settings.json`), **When** một commit tăng `VERSION` mà CHANGELOG không có mục `[x.y.z]` tương ứng, hoặc commit thêm một khóa bí mật, **Then** hook chặn commit **And** dòng `tests` trong `.koni-harness/gates.conf` gọi `pnpm test` thay cho `npm test` **And** `sh .koni-harness/swarm.sh plan --cap 3` chạy được trên sprint đang mở, in ra kế hoạch đợt hoặc lý do chưa có story sẵn sàng.
- [ ] **AC-8** — Biến môi trường đầu tiên được ghi cùng lúc ở `docs/SETUP.md`, `DEPLOY.md` và file `.env.example` (RULE-11). Không có file `.env` thật nào được commit. AGENTS › *Lệnh* liệt kê đúng các script đã tạo. `VERSION` là `0.1.0` và `docs/CHANGELOG.md` có mục `[0.1.0]`.

## Tasks

- [ ] **TASK-1.1.1** — Workspace pnpm và cấu hình TypeScript chung (AC: 1)
  - [ ] Subtask 1.1.1.1 — `package.json` gốc (`packageManager`, `engines.node` ≥ 22), `pnpm-workspace.yaml`, `tsconfig.base.json` bật `strict`.
  - [ ] Subtask 1.1.1.2 — `packages/shared/`: `package.json`, `schemas/index.ts`, `states/index.ts`, `contracts/index.ts`; phụ thuộc `zod`.
  - [ ] Subtask 1.1.1.3 — Cấu hình lint TypeScript ở gốc repo (công cụ chờ chốt, xem *Architecture constraints*); script `lint` chạy cho mọi package.
  - [ ] Subtask 1.1.1.4 — Thêm `@koniverse/koni-docs` làm devDependency như [docs/README › Lệnh koni-docs](../../README.md) đã hẹn.
- [ ] **TASK-1.1.2** — Khung `apps/api`, `apps/web`, `ai-service` (AC: 1, 2)
  - [ ] Subtask 1.1.2.1 — `apps/api/src/main.ts`, `app.module.ts`: global prefix `/api`, nestjs-pino, `GET /api/health` bằng @nestjs/terminus. Tạo sẵn `src/modules/`, `src/db/`, `src/common/`, `drizzle/` (để trống).
  - [ ] Subtask 1.1.2.2 — `apps/web`: React 19 + Vite + TypeScript; tạo `src/app/`, `src/features/`, `src/lib/`, `src/shared/`. Chưa chạy `shadcn init` (thuộc US-1.3).
  - [ ] Subtask 1.1.2.3 — `ai-service/pyproject.toml` (Python 3.12), `app/__init__.py`, `tests/test_smoke.py`; cấu hình lint Python.
- [ ] **TASK-1.1.3** — Docker Compose và nginx (AC: 2, 3, 8)
  - [ ] Subtask 1.1.3.1 — `deploy/docker-compose.yml`: 7 service ở AC-2, healthcheck cho từng service, named volume, `depends_on: condition: service_healthy`.
  - [ ] Subtask 1.1.3.2 — `apps/api/Dockerfile`; build web nhiều tầng rồi chép vào image nginx; `deploy/nginx.conf` phục vụ SPA (fallback `index.html`), proxy `/api`, tắt `proxy_buffering` cho `/api/events/stream` để SSE của US-1.7 chạy được.
  - [ ] Subtask 1.1.3.3 — `deploy/.env.example` (mật khẩu DB, MinIO, RabbitMQ, cổng nginx); tạo `DEPLOY.md`; cập nhật `docs/SETUP.md` › *Biến môi trường* và phần lệnh chạy.
- [ ] **TASK-1.1.4** — Hạ tầng integration test với testcontainers (AC: 6)
  - [ ] Subtask 1.1.4.1 — `apps/api/test/setup/global-setup.ts` và `global-teardown.ts`: khởi động và dọn container PostgreSQL, truyền chuỗi kết nối qua biến môi trường của Jest.
  - [ ] Subtask 1.1.4.2 — Tách cấu hình Jest cho unit test (`src/**/*.spec.ts`) và integration test (`test/integration/**/*.int-spec.ts`); test mẫu `test/integration/db-smoke.int-spec.ts`.
- [ ] **TASK-1.1.5** — Luật ranh giới module bằng dependency-cruiser (AC: 5)
  - [ ] Subtask 1.1.5.1 — `.dependency-cruiser.cjs`: cấm `modules/*/domain/**` import `@nestjs/*`, `drizzle-orm`; cấm module import vào bên trong module khác.
  - [ ] Subtask 1.1.5.2 — Fixture vi phạm ở `apps/api/test/fixtures/depcruise-violation/` (loại khỏi build và khỏi lần chạy `depcruise` thường).
- [ ] **TASK-1.1.6** — Workflow CI (AC: 4)
  - [ ] Subtask 1.1.6.1 — `.github/workflows/ci.yml`: job Node (cài pnpm qua corepack, cache store, các bước ở AC-4) và job Python (Python 3.12, lint, pytest).
- [ ] **TASK-1.1.7** — Cổng commit koni-harness và chạy thử swarm (AC: 7)
  - [ ] Subtask 1.1.7.1 — Chạy `sh .agents/skills/koni-harness/scripts/install-gate.sh`; sửa dòng `tests` trong `.koni-harness/gates.conf` thành `pnpm test`.
  - [ ] Subtask 1.1.7.2 — Ghép hook `PreToolUse` vào `.claude/settings.json` theo `.agents/skills/koni-harness/references/adapters.md` (bước thủ công, không ghi đè khóa có sẵn).
  - [ ] Subtask 1.1.7.3 — Chạy `sh .koni-harness/swarm.sh plan --cap 3` trên `sprint-2026-W41`; ghi kết quả vào *Implementation notes*.
- [ ] **TASK-1.1.8** — Cổng tài liệu và phiên bản (AC: 8)
  - [ ] Subtask 1.1.8.1 — `VERSION` → `0.1.0`; thêm mục `[0.1.0]` vào `docs/CHANGELOG.md` từ *Changelog entry* bên dưới.
  - [ ] Subtask 1.1.8.2 — Điền AGENTS › *Lệnh* và `docs/README.md` › *Lệnh koni-docs* bằng script thật; chạy `koni-docs sync`, `status`, `validate`.

## Dev notes

### Architecture constraints

- [AD-3](../../ARCHITECTURE.md#architecture-decisions): một modular monolith NestJS và một AI Service Python trong monorepo pnpm. Không tách microservice. Không thêm Turborepo hay Nx: ARCH › *Tech stack* chỉ ghi pnpm workspaces.
- ARCH › *Tech stack*: Node.js LTS (SETUP ghi 22 trở lên), Python 3.12+, PostgreSQL 16 + pgvector, Redis 7, RabbitMQ, MinIO. Image theo bảng ARCH › *Docker Compose*: `pgvector/pgvector`, `rabbitmq:management`, `minio/minio`, `axllent/mailpit`, `nginx`.
- ARCH › *CI* và AGENTS › Nguyên tắc 13: dependency-cruiser chạy trong CI; `domain/` không import NestJS hay Drizzle.
- AGENTS › *Gọi Claude API*: test không gọi API thật. Job pytest trong CI không cần `ANTHROPIC_API_KEY`.
- **Công cụ lint chưa có trong spec.** ARCH › *CI* nói "lint" nhưng không ghi tên công cụ. Đề xuất ESLint cho TypeScript (mặc định của template NestJS và Vite) và ruff cho Python (`.gitignore` đã có `.ruff_cache/`). AGENTS cấm thêm thư viện ngoài danh sách khi chưa hỏi, nên phải hỏi trước khi chốt.
- **Cách quản lý phụ thuộc Python chưa có trong spec.** Đề xuất `pyproject.toml` + `pip install -e ".[dev]"`, không thêm công cụ khác; hỏi trước khi chốt.
- **Tên package workspace** (đề xuất): `@srm/api`, `@srm/web`, `@srm/shared`. Các story sau dùng tên này trong lệnh `pnpm --filter`.
- **Vị trí `.env.example`:** ARCH › *Project structure* đặt ở `deploy/`, còn `docs/README.md` ghi "`.env.example` ở gốc repo". Story này theo ARCH (`deploy/.env.example`, compose đọc `deploy/.env`); hỏi để sửa một trong hai chỗ.
- Cổng nginx đề xuất: `8080` trên máy host (tránh cổng đặc quyền 80), cấu hình qua biến `NGINX_PORT`.
- Story này không thêm mục AD mới.

### Cross-story dependencies

- Required by [US-1.2](US-1.2-core-db-schema-transition-audit-log.md): dùng `apps/api/src/db/`, `apps/api/drizzle/`, global setup testcontainers trong `apps/api/test/setup/`.
- Required by [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md): dùng khung `apps/web/src/app/` để chạy `shadcn init` và dựng layout theo vai trò.
- Required by [US-5.1](US-5.1-allocation-engine-property-tests.md): dùng cấu hình Jest của `apps/api` và luật dependency-cruiser cho `allocation/domain/`.
- Required by [US-2.1](US-2.1-ai-job-pipeline-message-contracts.md): thêm `ai-worker`, `ai-api` vào `deploy/docker-compose.yml`, thêm bước kiểm tra hợp đồng vào `.github/workflows/ci.yml`, dùng khung `ai-service/`.
- Mọi story sau dùng các script `typecheck`, `lint`, `test`, `depcruise` và cổng `.koni-harness/`.

### Performance budget

- Khởi động hạ tầng: một lệnh `docker compose -f deploy/docker-compose.yml up` (EPIC-1 › *Performance budgets & invariants*). Kiểm chứng ở AC-2.

### What we explicitly did NOT do

- Không có `ai-worker`, `ai-api` trong compose. Thuộc US-2.1, cùng lúc với pipeline job AI.
- Không có bước kiểm tra hợp đồng TS ↔ Python trong CI. Thuộc US-2.1 vì chưa có contract nào.
- Không có Playwright và k6. Thuộc US-6.6.
- Không có Prometheus/Grafana, không có ClamAV. Ngoài phạm vi theo CONTEXT D20.
- Không có Drizzle schema hay migration. Thuộc US-1.2.
- Không triển khai lên môi trường thật. Đồ án chỉ cần demo bằng Docker Compose.

### References

- [Source: ARCHITECTURE › Tech stack](../../ARCHITECTURE.md#tech-stack)
- [Source: ARCHITECTURE › Deployment architecture (Docker Compose, CI)](../../ARCHITECTURE.md#deployment-architecture)
- [Source: ARCHITECTURE › Project structure](../../ARCHITECTURE.md#project-structure)
- [Source: ARCHITECTURE › Testing strategy](../../ARCHITECTURE.md#testing-strategy)
- [Source: ARCHITECTURE › Component architecture › Core Backend (Kiểu kiến trúc, Thư viện chính)](../../ARCHITECTURE.md#component-architecture)
- [Source: CONTEXT D3, D19, D20](../../CONTEXT.md)
- [Source: LESSONS §1](../../LESSONS.md)
- [Source: sprints/README › Chạy song song](../README.md)
- [Source: koni-harness adoption](../../../.agents/skills/koni-harness/references/adoption.md)
- [Source: koni-harness adapters](../../../.agents/skills/koni-harness/references/adapters.md)

## Verification commands

| AC | Command |
|---|---|
| AC-1 | `pnpm install --frozen-lockfile && pnpm typecheck && pnpm build` thoát với mã 0 |
| AC-2 | `docker compose -f deploy/docker-compose.yml up -d --build && docker compose -f deploy/docker-compose.yml ps` (7 service `healthy`); `curl -fsS http://localhost:8080/api/health`; `curl -fsS http://localhost:8080/sv/abc \| grep -c '<div id="root">'` ra 1 |
| AC-3 | `docker compose -f deploy/docker-compose.yml config \| grep -c "condition: service_healthy"` ≥ 1; kiểm tay: tạo bảng thử, `docker compose -f deploy/docker-compose.yml down && docker compose -f deploy/docker-compose.yml up -d`, bảng vẫn còn |
| AC-4 | `gh run list --workflow ci.yml --limit 1` ra `success`; chạy cục bộ: `pnpm lint && pnpm test && pnpm depcruise` |
| AC-5 | `pnpm depcruise` thoát 0; `pnpm exec depcruise --config .dependency-cruiser.cjs apps/api/test/fixtures/depcruise-violation` thoát khác 0 và in đủ hai vi phạm |
| AC-6 | `pnpm --filter @srm/api test -- test/integration/db-smoke.int-spec.ts`; sau đó `docker ps --filter "ancestor=pgvector/pgvector" -q` không còn container của test |
| AC-7 | `grep -n "pnpm test" .koni-harness/gates.conf`; `sh .koni-harness/gate-runner.sh --phase release-commit --dry-run`; `sh .koni-harness/swarm.sh plan --cap 3` |
| AC-8 | `cat VERSION` ra `0.1.0`; `grep -n "^## \[0.1.0\]" docs/CHANGELOG.md`; `git ls-files \| grep -E '(^\|/)\.env$'` không ra dòng nào; `npx -y -p @koniverse/koni-docs koni-docs validate --docs-path docs/` |

Tên package `@srm/api` và cổng `8080` là đề xuất; nếu đổi khi chốt thì sửa bảng này trong cùng commit.

## Changelog entry

### Added
- Monorepo pnpm: `apps/api` (NestJS, TypeScript strict), `apps/web` (React 19 + Vite), `packages/shared` (Zod), khung `ai-service` (Python 3.12).
- `deploy/docker-compose.yml`: PostgreSQL 16 + pgvector, Redis, RabbitMQ, MinIO, Mailpit, API và nginx phục vụ web; chạy cả hệ thống bằng một lệnh.
- CI GitHub Actions: typecheck, lint, test (có testcontainers), build web, kiểm tra ranh giới module bằng dependency-cruiser, lint và test AI Service.
- Cổng commit koni-harness (`.koni-harness/`, hook git, hook Claude Code).
- `DEPLOY.md`, `deploy/.env.example`; `SETUP.md` và `AGENTS.md` có lệnh chạy thật.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [Epic EPIC-1](../epics/EPIC-1.md)
- [ARCHITECTURE AD-3](../../ARCHITECTURE.md#architecture-decisions)
- [CONTEXT D3, D19, D20](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
- [LESSONS §1](../../LESSONS.md)
- [AGENTS › Lệnh](../../../AGENTS.md)
