# Changelog

Lịch sử phát hành của Smart Recruit Match. Mỗi commit ship code tăng `VERSION` và thêm một mục ở đây trong cùng commit (RULE-1); mục mới nhất ở trên cùng. Commit chỉ sửa tài liệu ghi vào `[Unreleased]` và không tăng version.

## [Unreleased]

---

## [0.2.0] — 2026-10-08 — Đăng nhập, phân quyền, DESIGN.md, khung giao diện — v0.2.0

US-1.3. Bốn vai trò đăng nhập được và chỉ vào được cổng của mình. Mỗi API kiểm tra vai trò bằng một guard mặc định từ chối, và kiểm tra quyền trên từng bản ghi qua một helper dùng chung. Web có design system (`DESIGN.md` + shadcn/ui) và khung ba cổng `/sv`, `/hr`, `/admin`; chưa có màn nghiệp vụ.

### Added
- Đăng nhập bằng email và mật khẩu (`POST /api/auth/login`): access token JWT HS256 15 phút; refresh token ngẫu nhiên trong cookie `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/auth`, Redis lưu hash, xoay vòng mỗi lần `POST /api/auth/refresh`; `POST /api/auth/logout` thu hồi; `GET /api/me`. Mật khẩu băm bằng `scrypt` của Node. Email sai và mật khẩu sai trả cùng một `401` (CONTEXT D25).
- Phân quyền theo vai trò `CENTER`, `STUDENT`, `HR`, `ADMIN`: guard global `AccessGuard` (`@Public()`, `@Roles()`, `@CurrentUser()`), route thiếu khai báo bị từ chối; helper `assertRecordAccess`/`recordScopeWhere` trả `404` cho bản ghi ngoài phạm vi (BR-11). Test duyệt mọi route bằng `DiscoveryService`.
- Quản trị tài khoản: `POST`/`GET /api/admin/users` (chỉ `ADMIN`) tạo tài khoản Trung tâm, Quản trị, Sinh viên với mật khẩu ban đầu; HR bị từ chối `422`, email trùng `409`. Module `student` với `StudentService.createStudent`.
- Seed dữ liệu dev `pnpm --filter @srm/api db:seed` (một tài khoản mỗi vai trò, hai công ty, hai sinh viên; chạy lại không tạo trùng). Helper test `createAuthTestApp`/`loginAs` và fixture hai công ty cho test IDOR.
- Mọi lỗi API cùng một dạng `{ code, message, details? }` qua `ApiExceptionFilter`; request validate bằng DTO nestjs-zod sinh từ schema dùng chung; mã lỗi mới trong `packages/shared/schemas/errors.ts`.
- OpenAPI từ `@nestjs/swagger` + nestjs-zod (`/api/docs` ngoài production); `pnpm api:sync` xuất `openapi.json` và sinh kiểu client (openapi-typescript). CI kiểm hai file này khớp với API.
- `DESIGN.md`: token màu đã kiểm tương phản, chữ, khoảng cách, breakpoint và checklist 360 px, primitive shadcn, bốn trạng thái của mọi màn, form, chuỗi tiếng Việt, ngày giờ với date-fns `vi`.
- Web: Tailwind CSS 4, shadcn/ui nền Radix (`components.json`, 16 primitive); React Router; TanStack Query; trang đăng nhập (React Hook Form + schema dùng chung); khung cổng sinh viên có thanh điều hướng dưới trên điện thoại, cổng HR và Trung tâm có thanh bên; access token chỉ giữ trong bộ nhớ, client tự refresh một lần khi gặp `401` (CONTEXT D26).
- Biến môi trường `JWT_ACCESS_SECRET` (bắt buộc), `REFRESH_TOKEN_TTL_DAYS`, `REDIS_URL`, `SEED_PASSWORD`; integration test có thêm container Redis.
- CONTEXT D25, D26; LESSONS §8.

### Changed
- `AppModule` không đọc biến môi trường lúc import; `main.ts` và test dùng chung `configureApp`. Log request che `Authorization`, `Cookie`, `Set-Cookie`.
- `GET /api/health` được đánh dấu `@Public()`.
- ARCHITECTURE › *Frontend*, › *Tech stack*, › *Thư viện chính* (bỏ passport-jwt), › *Redis* (khóa `auth:refresh:{sha256}`), › *Security architecture*, › *Open architecture questions* (đã chốt Radix).
- Sprint `sprint-2026-W41` kéo thêm US-1.3.

**Commit**:

---

## [0.1.1] — 2026-10-08 — Lược đồ DB lõi, `transitionTo`, nhật ký thao tác — v0.1.1

US-1.2. Có lược đồ `core` đầu tiên và cơ chế chuyển trạng thái dùng chung: mọi thay đổi trạng thái của đợt, JD, CV đi qua `transitionTo`, có khóa lạc quan và nhật ký chỉ ghi thêm trong cùng giao dịch. Chưa có endpoint nghiệp vụ.

### Added
- Lược đồ `core` bằng Drizzle (`drizzle-orm` 0.45.3, `drizzle-kit` 0.31.11): `campaigns`, `companies`, `users`, `students`, `job_descriptions`, `cvs`, `audit_logs`, kèm migration SQL trong `apps/api/drizzle/`. Cột `status` có CHECK lấy từ bảng chuyển dùng chung; CHECK vai trò, HR ↔ `company_id`, STUDENT ↔ `student_id`, email chữ thường.
- `packages/shared/states`: bảng chuyển trạng thái của đợt, JD, CV dùng chung cho web và API; `packages/shared/schemas`: `ROLES`, `ACTOR_KINDS`, `ApiErrorSchema`. `packages/shared` có unit test riêng (Jest).
- `transitionTo` (`StateTransitionService`): khóa dòng, kiểm `row_version` (lệch thì trả `409`), kiểm bảng chuyển và điều kiện (sai thì trả `422`), ghi nhật ký trong cùng giao dịch. Exception filter trả body `{ code, message, details }`.
- Nhật ký thao tác chỉ ghi thêm: trigger `ENABLE ALWAYS` chặn `UPDATE`/`DELETE`/`TRUNCATE` trên `audit_logs` (BR-10); cột `reason`, `actor_kind` (CONTEXT D24).
- Docker Compose có service `migrate` chạy một lần trước `api`; biến `DATABASE_URL`; `GET /api/health` kiểm thêm kết nối DB.
- Helper test dùng lại cho các story sau (`apps/api/test/helpers/`); CI kiểm migration khớp schema (`db:generate` không sinh file mới).
- CONTEXT D24; LESSONS §6 (migrator bỏ qua migration có mốc thời gian cũ hơn), §7 (kiểu Drizzle cho hàm dùng chung nhiều bảng).

### Changed
- ARCHITECTURE › *Các bảng chính*, › *Các module* (`audit` ghi trong giao dịch, không dùng interceptor), › *Quản lý trạng thái*, › *Docker Compose*.
- Sprint `sprint-2026-W41` kéo thêm US-1.2.

**Commit**: b1f8b17

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

**Commit**: ae8c373

---

## [0.0.0] — 2026-10-04 — Khởi tạo repo — v0.0.0

Commit đầu tiên của repo, chỉ có `README.md`. Mốc gốc của `VERSION`.

**Commit**: a804da5
