---
id: US-2.1
title: "Hạ tầng job AI và hợp đồng message"
epic: EPIC-2
status: review
priority: P0
points: 8
sprint: sprint-2026-W44
version_shipped: 0.7.0
prd_ref: [NFR-10]
arch_ref: [AD-1, AD-4, AD-5, AD-6]
depends_on: [US-1.2]
assignee: PDTnhah
commit: 7fbb833ff4c21f76d224507210ef39b56a05fe11
created: 2026-10-07
updated: 2026-10-20
---

## Story refresh — 2026-10-20

Đọc lại story ngày 2026-10-20 trên nhánh `us-2.1`, tách từ `dev` sau khi US-1.7 merge (migration cuối là `0004`; story này sinh `0005` và `0006`). Số AC giữ nguyên ([CONTEXT D33](../../CONTEXT.md)).

**Người dùng chốt các điểm mở:**

- **Driver PostgreSQL của AI Service:** psycopg 3 (`psycopg[binary,pool]`). Thêm `uvicorn` để chạy FastAPI và `httpx` cho test. MinIO client và adapter pgvector để sang US-2.4, US-2.5 (subtask 2.1.6.3).
- **API đăng nhập DB bằng role `api_service` ngay ở story này.** Bước `migrate` vẫn dùng tài khoản chủ.
- **Retry nằm trong worker:** chờ 2 s rồi 10 s giữa các lần thử, `attempts` lưu ở `ai.jobs`, lần thứ 3 lỗi thì publish sang `<queue>.dlq` rồi ack.
- **Sổ sprint:** đóng W42, mở `sprint-2026-W43`.

**Điều chỉnh so với spec:**

- `ai.results` gửi kèm lại payload job: `{ job_id, type, status, job, result, error }`. Khi `FAILED`, backend vẫn biết CV/JD nào lỗi (AC-6). `error` gồm `{ code, message, needs_human }`. ARCH › *Hàng đợi* sửa theo.
- Đường dẫn integration test phải khớp `testMatch` của Jest (`test/integration/**`): `apps/api/test/integration/ai-service-role.int-spec.ts`, `apps/api/test/integration/ai-job-roundtrip.int-spec.ts`; helper dùng chung ở `apps/api/test/helpers/ai-results.ts`.
- Kiểm tra lệch hợp đồng dùng `git status --porcelain` thay cho `git diff --exit-code`, để bắt cả file mới chưa track ([LESSONS §6](../../LESSONS.md)).
- `core.v_ai_jd_source` chưa tạo; chốt cùng US-2.3.
- Subtask 2.1.4.4: `aigateway` chỉ phát sự kiện nội bộ `ai.job.dispatched`, `ai.job.settled`. Đẩy SSE là việc của module sở hữu đối tượng (US-2.3, US-2.4), vì `aigateway` không biết người nhận.
- AC-5 phía backend: story này cung cấp quy ước listener, helper "giao kết quả hai lần" và một listener mẫu trong test (dùng `transitionTo` thật). US-2.3, US-2.4 dùng lại helper cho listener thật.

## Goal

Một job AI đi được trọn vòng: Core Backend phát job sang RabbitMQ, AI Service nhận, xử lý và trả kết quả qua `ai.results`, Core Backend lưu kết quả. Nhận trùng message không ghi trùng; lỗi tạm thời tự thử lại; lỗi lâu dài vào dead-letter queue. Sau story này, US-2.3, US-2.4 và các agent ở EPIC-3, EPIC-4 chỉ cần thêm hợp đồng message, handler và prompt của mình. Chúng không phải lo hàng đợi, idempotency, retry hay quyền DB.

## Background

Theo AD-1 ([D1](../../CONTEXT.md)), phần xác suất (LLM) nằm ở AI Service, phần tất định (trạng thái, điểm, phân quyền) nằm ở Core Backend. Ranh giới đó cần được giữ bằng hạ tầng, không chỉ bằng quy ước. Story này dựng ba lớp bảo vệ:

- **Quyền DB (AD-4, [D4](../../CONTEXT.md)):** AI Service dùng tài khoản DB riêng. Tài khoản này chỉ đọc được các view `core.v_ai_*` đã che PII và chỉ ghi được schema `ai`. Nhờ vậy BR-03 (không dùng thông tin nhạy cảm khi chấm) và nguyên tắc "AI Service không chuyển trạng thái nghiệp vụ" được bảo đảm ngay ở PostgreSQL (ARCH › *Phân vùng schema*).
- **Job bất đồng bộ (AD-5, [D5](../../CONTEXT.md)):** payload chỉ chứa ID, mỗi job có `job_id` duy nhất, AI Service kiểm tra `ai.jobs` trước khi xử lý, Core Backend ghi kết quả kiểu upsert. Lỗi sau 3 lần thử vào `*.dlq` (NFR-10, ARCH › *Hàng đợi*).
- **Hợp đồng viết một lần (AD-6, [D6](../../CONTEXT.md)):** schema message định nghĩa bằng Zod trong `packages/shared/contracts`, xuất JSON Schema bằng `z.toJSONSchema` (Zod 4), sinh model Pydantic bằng `datamodel-code-generator`. CI báo lỗi khi hai phía lệch nhau (ARCH › *Hàng đợi*, *CI*).

EPIC-1 chỉ khởi động RabbitMQ trong Docker Compose (US-1.1) và tạo lược đồ `core` (US-1.2). Module `aigateway` ở Core Backend (ARCH › *Các module*) và các worker FastStream ở `ai-service/app/consumers/` được tạo ở story này. Story này không gọi LLM: `LLMClient` thuộc [US-2.2](US-2.2-llm-client-versioned-prompts.md). Handler thật của CV và JD thuộc [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md) và [US-2.3](US-2.3-jd-analyzer-hr-requirement-confirmation.md); ở đây dùng handler giả để kiểm chứng đường ống.

**Lessons applied**: §4 (kiểm image bằng `docker manifest inspect` trước khi ghim, cho `python:3.12-slim` và RabbitMQ trong testcontainers), §6 (migration `0005`, `0006` sinh sau khi US-1.7 merge; kiểm lệch bằng `git status --porcelain`), §8 (ghim bản chính xác khi thêm gói, cả Node lẫn Python), §9 (`@golevelup/nestjs-rabbitmq` là CommonJS; chạy cả integration test sau khi thêm), §10 (kiểm chéo `status`/`result`/`error` của `ai.results` bằng `superRefine` chỉ chạy khi các trường đã hợp lệ; test riêng ca chéo), §11 (timeout của integration test qua `setupFilesAfterEnv`, `beforeAll` có timeout riêng), §14 (biến tùy chọn rỗng từ compose), §15 (tắt compose trước khi chạy `pnpm test`).

## Acceptance criteria

- [x] **AC-1** — **Given** một Zod schema message trong `packages/shared/contracts`, **When** chạy script xuất hợp đồng, **Then** có file JSON Schema tương ứng và model Pydantic được sinh vào AI Service bằng `datamodel-code-generator` **And** không có model Pydantic nào cho message được viết tay.
- [x] **AC-2** — **Given** một thay đổi ở Zod schema mà chưa sinh lại phía Python (hoặc sửa tay file Pydantic đã sinh), **When** CI chạy bước kiểm tra hợp đồng TS ↔ Python, **Then** bước đó thất bại và chỉ ra file lệch.
- [x] **AC-3** — **Given** Core Backend gọi `AiGatewayService.dispatch()` cho job `CV_PARSE` hoặc `JD_ANALYZE`, **When** message được gửi lên `ai.cv.parse` / `ai.jd.analyze`, **Then** payload chỉ gồm các trường ở ARCH › *Hàng đợi* (`job_id`, ID, phiên bản, `file_key`), được kiểm bằng Zod trước khi gửi, **And** `job_id` là UUID mới cho mỗi lần dispatch.
- [x] **AC-4** — **Given** AI Service đang chạy với handler giả, **When** backend dispatch một job, **Then** AI Service ghi `ai.jobs` (`status`, `attempts`), gửi một message lên `ai.results` có `job_id`, `type`, `status` ∈ {`SUCCEEDED`, `PARTIAL`, `FAILED`}, `result`, **And** `aigateway` kiểm message bằng Zod rồi phát sự kiện nội bộ cho module sở hữu kiểu job đó.
- [x] **AC-5** — **Given** cùng một message job được giao hai lần (cùng `job_id`), **When** AI Service nhận lần thứ hai sau khi lần đầu đã `SUCCEEDED`, **Then** handler không chạy lại và không gửi thêm kết quả. **Given** cùng một message `ai.results` đến hai lần, **When** backend xử lý, **Then** dữ liệu nghiệp vụ chỉ được ghi một lần (upsert theo khóa tự nhiên, không tạo dòng trùng, không ghi audit trùng).
- [x] **AC-6** — **Given** handler ném lỗi tạm thời (`RetryableError`), **When** job lỗi 3 lần liên tiếp, **Then** message chuyển vào `<queue>.dlq`, `ai.jobs.status = FAILED` với `last_error`, **And** AI Service gửi `ai.results` với `status = FAILED` để backend cập nhật đối tượng nghiệp vụ và báo người dùng. Lỗi ở lần 1 hoặc 2 rồi thành công ở lần sau thì không vào DLQ.
- [x] **AC-7** — **Given** handler ném lỗi không thể tự hồi phục (`PermanentError`, VD: LLM từ chối, sai schema sau khi đã thử lại ở US-2.2), **When** job lỗi, **Then** không thử lại ở tầng job, gửi ngay `ai.results` với `status = FAILED` và lý do cần người xử lý.
- [x] **AC-8** — **Given** tài khoản DB `ai_service`, **When** thử `INSERT`/`UPDATE`/`DELETE` vào bất kỳ bảng nào của schema `core`, hoặc `SELECT` trực tiếp `core.cvs`, **Then** PostgreSQL trả lỗi `permission denied` (SQLSTATE `42501`). **And** tài khoản này đọc được `core.v_ai_*` và đọc/ghi được `ai.*`.
- [x] **AC-9** — **Given** view `core.v_ai_cv_profile_masked` và `core.v_ai_jd_requirements`, **When** liệt kê cột của chúng, **Then** không có cột `pii`, `profile`, tên, email, số điện thoại hay bất kỳ trường cá nhân nào (BR-03) **And** view CV chỉ trả CV hiệu lực đã được SV xác nhận (BR-01), view JD chỉ trả JD đã được HR xác nhận và Trung tâm duyệt (BR-02).
- [x] **AC-10** — **Given** message trên `ai.results` sai schema (thiếu `job_id`, `status` lạ…), **When** backend nhận, **Then** message không làm thay đổi dữ liệu, bị ghi log có `job_id` (nếu có) và đưa vào `ai.results.dlq`; consumer không dừng.
- [x] **AC-11** — **Given** `docker compose up` trong `deploy/`, **When** hệ thống khởi động, **Then** có thêm service `ai-worker` và `ai-api`; `GET /health` của `ai-api` trả 200 khi kết nối được PostgreSQL và RabbitMQ.

## Tasks

- [x] **TASK-2.1.1** — Hợp đồng message trong `packages/shared/contracts` (AC: 1, 3)
  - [x] Subtask 2.1.1.1 — `packages/shared/contracts/envelope.ts`: Zod schema `AiResultMessage` (`job_id`, `type`, `status`, `result`, `error`) và enum `AiJobType` (`CV_PARSE`, `JD_ANALYZE`; các story sau thêm kiểu của mình).
  - [x] Subtask 2.1.1.2 — `packages/shared/contracts/jobs.ts`: payload `CvParseJob` (`job_id`, `cv_id`, `cv_version`, `file_key`) và `JdAnalyzeJob` (`job_id`, `jd_id`, `jd_version`) đúng bảng ARCH › *Hàng đợi*. Phần `result` của từng kiểu do US-2.3, US-2.4 định nghĩa.
  - [x] Subtask 2.1.1.3 — `packages/shared/contracts/queues.ts`: hằng tên queue (`ai.cv.parse`, `ai.jd.analyze`, `ai.results`, hậu tố `.dlq`) và số lần thử tối đa (3); xuất thêm `queues.json` để Python đọc cùng một nguồn.
  - [x] Subtask 2.1.1.4 — Script xuất JSON Schema bằng `z.toJSONSchema` vào `packages/shared/contracts/json-schema/` (đường dẫn đề xuất).
- [x] **TASK-2.1.2** — Sinh Pydantic và kiểm tra lệch trong CI (AC: 1, 2)
  - [x] Subtask 2.1.2.1 — Sinh model bằng `datamodel-code-generator` vào `ai-service/app/contracts/` (đường dẫn đề xuất; thư mục chỉ chứa file sinh, có header "generated — do not edit").
  - [x] Subtask 2.1.2.2 — Bước CI "kiểm tra hợp đồng TS ↔ Python" (ARCH › *CI*): xuất lại JSON Schema, sinh lại Pydantic, rồi `git diff --exit-code` trên hai thư mục trên.
- [x] **TASK-2.1.3** — Schema `ai`, view che PII, tài khoản DB (AC: 8, 9)
  - [x] Subtask 2.1.3.1 — Migration Drizzle trong `apps/api/drizzle/`: `CREATE SCHEMA ai`; bảng `ai.jobs` (`job_id` PK, `type`, `status`, `attempts`, `last_error`, `created_at`, `finished_at`) theo ARCH › *Các bảng chính*.
  - [x] Subtask 2.1.3.2 — View `core.v_ai_cv_profile_masked` (`cv_id`, `version`, `campaign_id`, `profile_masked`) và `core.v_ai_jd_requirements` (`jd_id`, `version`, `campaign_id`, `position_group`, `requirements`), lọc theo trạng thái đã xác nhận/đã duyệt lấy từ bảng chuyển trạng thái của US-1.2. View đọc nguồn JD cho JD Analyzer (`core.v_ai_jd_source`: `jd_id`, `version`, `title`, `raw_text`, `file_key`) là tên **đề xuất**, chốt cùng US-2.3.
  - [x] Subtask 2.1.3.3 — Hai role `api_service` và `ai_service`: `ai_service` có `USAGE` trên `core` chỉ để `SELECT` các view `core.v_ai_*`, có toàn quyền trên `ai.*`; `api_service` chỉ đọc `ai.*`. Mật khẩu lấy từ biến môi trường trong `deploy/.env.example`.
  - [x] Subtask 2.1.3.4 — Integration test quyền DB và cột của view: `apps/api/test/db/ai-service-role.int-spec.ts`.
- [x] **TASK-2.1.4** — Module `aigateway` ở Core Backend (AC: 3, 4, 5, 10)
  - [x] Subtask 2.1.4.1 — `apps/api/src/modules/aigateway/application/ai-gateway.service.ts`: `dispatch(type, payload)` sinh `job_id`, kiểm Zod, gửi qua @golevelup/nestjs-rabbitmq có publisher confirm; gửi sau khi giao dịch nghiệp vụ đã commit.
  - [x] Subtask 2.1.4.2 — `apps/api/src/modules/aigateway/infrastructure/ai-results.consumer.ts`: nhận `ai.results`, kiểm Zod, message sai schema đưa vào `ai.results.dlq`; message đúng phát sự kiện `ai.result.<type>` qua `@nestjs/event-emitter` (tên sự kiện đề xuất). `aigateway` không ghi bảng của module khác (AGENTS › Nguyên tắc 13).
  - [x] Subtask 2.1.4.3 — Quy ước cho module nhận sự kiện: ghi kết quả kiểu upsert theo khóa tự nhiên (VD `cv_id` + `cv_version`), bỏ qua kết quả đã xử lý hoặc của phiên bản cũ. Viết helper test dùng chung trong `apps/api/test/aigateway/`.
  - [x] Subtask 2.1.4.4 — Phát sự kiện tiến độ job (đã gửi / đã có kết quả / lỗi) để `notification` (US-1.7) đẩy SSE "Đang phân tích…".
- [x] **TASK-2.1.5** — Worker FastStream ở AI Service (AC: 4, 5, 6, 7)
  - [x] Subtask 2.1.5.1 — `ai-service/app/consumers/base.py`: khung handler chung — kiểm payload bằng model Pydantic đã sinh, `INSERT … ON CONFLICT DO NOTHING` vào `ai.jobs`, bỏ qua job đã `SUCCEEDED`, tăng `attempts`, gửi `ai.results`.
  - [x] Subtask 2.1.5.2 — Phân loại lỗi `RetryableError` / `PermanentError` trong `ai-service/app/consumers/errors.py`; retry có giãn cách, tối đa 3 lần, sau đó đưa vào `<queue>.dlq` và gửi `ai.results` `FAILED`.
  - [x] Subtask 2.1.5.3 — Consumer `ai.cv.parse` và `ai.jd.analyze` với handler giả (trả kết quả cố định), để US-2.3, US-2.4 thay bằng agent thật.
  - [x] Subtask 2.1.5.4 — Unit test bằng broker test của FastStream: `ai-service/tests/consumers/test_idempotency.py`, `ai-service/tests/consumers/test_retry_dlq.py`.
- [x] **TASK-2.1.6** — Docker Compose và FastAPI (AC: 11)
  - [x] Subtask 2.1.6.1 — Thêm `ai-worker` và `ai-api` (build từ `ai-service/`) vào `deploy/docker-compose.yml` theo ARCH › *Docker Compose*; `ai-worker` chạy được nhiều bản sao.
  - [x] Subtask 2.1.6.2 — `ai-service/app/main.py` (FastAPI): `GET /health` kiểm tra PostgreSQL và RabbitMQ.
  - [x] Subtask 2.1.6.3 — Hỏi người dùng trước khi thêm thư viện Python để truy cập PostgreSQL (driver, adapter pgvector) và MinIO; ARCH › *Tech stack* chưa liệt kê các thư viện này.
- [x] **TASK-2.1.7** — Integration test trọn vòng qua RabbitMQ thật (AC: 4, 5, 6)
  - [x] Subtask 2.1.7.1 — `apps/api/test/aigateway/job-roundtrip.int-spec.ts`: testcontainers dựng PostgreSQL, RabbitMQ và container build từ `ai-service/` (handler giả); kiểm vòng dispatch → `ai.results` → sự kiện; gửi trùng message; lỗi 3 lần vào DLQ.

## Dev notes

### Architecture constraints

- [AD-1](../../ARCHITECTURE.md#architecture-decisions): AI Service không chuyển trạng thái nghiệp vụ và không ghi bảng `core`. Mọi chuyển trạng thái do module nghiệp vụ ở Core Backend thực hiện khi nhận sự kiện từ `aigateway`, qua `transitionTo` (US-1.2).
- [AD-4](../../ARCHITECTURE.md#architecture-decisions): quyền DB là lớp bảo vệ chính, không chỉ quy ước code. Loại phương án "AI Service đọc thẳng bảng `core` rồi tự lọc cột" vì một lỗi code là lộ PII.
- [AD-5](../../ARCHITECTURE.md#architecture-decisions): payload chỉ chứa ID; dữ liệu lớn đọc từ DB/MinIO. Không gửi nội dung CV/JD trong job message.
- [AD-6](../../ARCHITECTURE.md#architecture-decisions): Zod là nguồn duy nhất. Loại phương án viết tay Pydantic hoặc định nghĩa schema bằng Pydantic rồi sinh ngược sang TS.
- Dùng `@golevelup/nestjs-rabbitmq` (JSON thuần), không dùng transport RMQ mặc định của NestJS vì nó bọc message theo định dạng riêng (ARCH › *Thư viện chính*).
- Migration: schema `ai` và view `core.v_ai_*` nằm trong chuỗi migration Drizzle ở `apps/api/drizzle/`, vì ARCH chỉ có drizzle-kit là công cụ migration. Quyền ghi được tách bằng role, không tách bằng công cụ.
- Story này không thêm AD mới.

### Cross-story dependencies

- Builds on [US-1.2](US-1.2-core-db-schema-transition-audit-log.md) — dùng lược đồ `core` (`cvs`, `job_descriptions`), bảng chuyển trạng thái trong `packages/shared/states` để định nghĩa điều kiện lọc của view, và `transitionTo` cho các module nhận kết quả.
- Builds on [US-1.1](US-1.1-scaffold-monorepo-docker-compose-ci.md) — RabbitMQ trong `deploy/docker-compose.yml`, khung CI và testcontainers ở `apps/api/test/`.
- Required by [US-2.2](US-2.2-llm-client-versioned-prompts.md) — `LLMClient` ghi `ai.llm_calls` kèm `job_id`, dùng `PermanentError` khi LLM từ chối.
- Required by [US-2.3](US-2.3-jd-analyzer-hr-requirement-confirmation.md) và [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md) — thay handler giả của `ai.jd.analyze` / `ai.cv.parse`, thêm schema `result`.
- Required by [US-2.5](US-2.5-embeddings-skill-catalog.md) — dùng schema `ai` và role `ai_service` để ghi `ai.embeddings`.
- Required by [US-3.2](US-3.2-batch-matching-agent.md), [US-4.1](US-4.1-exam-blueprint-test-generator.md) và các story chấm bài — thêm queue `ai.match.run`, `ai.questions.generate`, `ai.essay.grade` theo cùng khung.
- Sibling [US-1.7](US-1.7-notifications-sse-email-reminders.md) — sự kiện tiến độ job được `notification` đẩy qua SSE.
- Sibling [US-1.4](US-1.4-campaign-setup-and-config.md), [US-1.5](US-1.5-company-hr-accounts-jd-posting-approval.md) — cùng tuần T3; story nào sinh migration trước thì story kia rebase rồi mới sinh (sprints/README › *Chạy song song*). Thay đổi `packages/shared/contracts` merge trước.

### Performance budget

- Retry job: tối đa 3 lần rồi vào DLQ (NFR-10, epic › *Performance budgets*).
- Overhead của khung (kiểm schema, ghi `ai.jobs`, gửi kết quả) không có ngân sách riêng trong epic; đo cùng NFR-6 ở [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md).
- Kiểm bằng `ai-service/tests/consumers/test_retry_dlq.py` và `apps/api/test/aigateway/job-roundtrip.int-spec.ts`.

### What we explicitly did NOT do

- Không có transactional outbox cho việc gửi job. `dispatch()` gửi sau khi commit và dùng publisher confirm. Trigger để làm lại: phát hiện job bị mất (đối tượng kẹt ở trạng thái "đang phân tích").
- Không làm màn quản trị DLQ riêng trong web. MVP xem DLQ bằng giao diện RabbitMQ management có sẵn trong Docker Compose; ARCH ghi DLQ "hiện trên màn quản trị" nhưng chưa nói rõ màn nào (đã nêu là điểm mơ hồ).
- Không cảnh báo qua Prometheus/Grafana — ngoài phạm vi theo [D20](../../CONTEXT.md).
- Không định nghĩa queue `ai.match.run`, `ai.questions.generate`, `ai.essay.grade` — thuộc story của từng agent.

### References

- [Source: PRD › Non-Functional Requirements (NFR-10)](../../PRD.md#non-functional-requirements)
- [Source: PRD › Quy tắc nghiệp vụ (BR-01, BR-02, BR-03)](../../PRD.md)
- [Source: ARCHITECTURE › AI Service và các AI Agent › Vai trò](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Data architecture › Phân vùng schema, Các bảng chính](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Messaging and data flow › Các kênh, Hàng đợi](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Deployment architecture › Docker Compose, CI](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Architecture decisions](../../ARCHITECTURE.md#architecture-decisions)
- [Source: CONTEXT D1, D4, D5, D6, D20](../../CONTEXT.md)
- [Source: Epic EPIC-2](../epics/EPIC-2.md)
- [Source: sprints/README › Chạy song song](../README.md)

## Verification commands

Chạy tại gốc repo (AGENTS › Lệnh). Integration test cần Docker; tắt compose trước ([LESSONS §15](../../LESSONS.md)). Trên Windows, file chạy của venv ở `ai-service/.venv/Scripts/`.

| AC | Command |
|---|---|
| AC-1 | `pnpm --filter @srm/shared test` › `contracts/__tests__/contracts.spec.ts` › "AD-6 mọi message có JSON Schema và model Pydantic sinh tự động"; `ai-service/.venv/bin/pytest ai-service/tests/contracts` |
| AC-2 | `pnpm contracts:gen` rồi `git status --porcelain packages/shared/contracts/json-schema ai-service/app/contracts` rỗng (bước CI "Message contracts match between TypeScript and Python"). Đã thử: sửa một trường Zod, hoặc sửa tay một file `.py` đã sinh, thì bước này in đúng file lệch |
| AC-3 | `pnpm --filter @srm/api test:unit` › `ai-gateway.service.spec.ts` › "AD-5 payload chỉ chứa ID, job_id mới mỗi lần dispatch", "AD-5 rejects a field outside the contract before publishing" |
| AC-4 | `pnpm --filter @srm/api test:int` › `ai-job-roundtrip.int-spec.ts` › "AD-5 job đi trọn vòng backend → RabbitMQ → AI Service → ai.results → backend" |
| AC-5 | `ai-service/tests/consumers/test_idempotency.py::test_ad5_duplicate_job_id_processed_once`; `ai-job-roundtrip.int-spec.ts` › "AD-5 nhận trùng ai.results không ghi trùng", "AD-5 job trùng job_id không chạy lại" |
| AC-6 | `ai-service/tests/consumers/test_retry_dlq.py::test_nfr10_retry_3_times_then_dlq`, `::test_nfr10_succeeds_on_retry_no_dlq`; `ai-job-roundtrip.int-spec.ts` › "NFR-10 lỗi tạm thời 3 lần vào DLQ" |
| AC-7 | `ai-service/tests/consumers/test_retry_dlq.py::test_nfr10_permanent_error_fails_without_retry`; `ai-job-roundtrip.int-spec.ts` › "AD-5 lỗi không hồi phục thất bại ngay, không thử lại, cần người xử lý (AC-7)" |
| AC-8 | `ai-service-role.int-spec.ts` › "AD-4 tài khoản ai_service không ghi được schema core", "AD-4 ai_service holds exactly these table grants", "AD-4 api_service writes core (audit_logs insert-only) and only reads ai" |
| AC-9 | `ai-service-role.int-spec.ts` › "BR-03 view v_ai_* không có cột PII", "BR-01 BR-02 view chỉ trả dữ liệu đã xác nhận" |
| AC-10 | `ai-results.consumer.spec.ts` › "AD-6 ai.results sai schema vào DLQ, consumer không dừng: …"; `ai-job-roundtrip.int-spec.ts` › cùng tên |
| AC-11 | `docker compose -f deploy/docker-compose.yml up -d --build --wait` rồi `curl -fsS http://localhost:8000/health` trả 200; `ai-service/tests/test_health.py` (200 và 503) |

## Changelog entry

### Added
- Đường ống job AI: module `aigateway` ở Core Backend gửi job qua RabbitMQ và nhận kết quả từ `ai.results`; worker FastStream ở AI Service xử lý idempotent theo `job_id`, thử lại tối đa 3 lần rồi đưa vào dead-letter queue.
- Hợp đồng message định nghĩa một lần bằng Zod trong `packages/shared/contracts`, xuất JSON Schema và sinh model Pydantic; CI báo lỗi khi hai phía lệch.
- Schema `ai` (bảng `ai.jobs`), view `core.v_ai_*` đã che PII và tài khoản DB riêng cho AI Service, không ghi được schema `core`.
- Service `ai-worker`, `ai-api` trong Docker Compose; `GET /health` của AI Service.

**Commit**: 7fbb833

## Implementation notes

**2026-10-20, nhánh `us-2.1`.** Plan đã duyệt; các quyết định ở *Story refresh* và [CONTEXT D33](../../CONTEXT.md). Python 3.12 cho `ai-service/.venv` lấy từ conda (`srm-py312`) vì máy chỉ có 3.11.

**Hợp đồng (AC-1, AC-2, AC-3):**
- Zod strict trong `packages/shared/contracts/{jobs,envelope,queues,schemas}.ts`. `buildContractSchemas()` dựng registry trong hàm (không side effect khi web import gói), mỗi schema một id `snake_case` → `json-schema/<id>.json` và module Python `<id>.py`, tên class lấy từ `title`.
- `override` bỏ `pattern` khi có `format: uuid`, để Pydantic sinh `UUID`.
- `scripts/gen-contracts.mjs` xóa rồi ghi lại hai thư mục, chuẩn hóa LF cho file `.py`. `datamodel-code-generator` 0.83.0 đọc cấu hình ở `[tool.datamodel-codegen]` của `ai-service/pyproject.toml`; formatter `builtin` cho output giống black/isort mà không phụ thuộc phiên bản của chúng.
- Kiểm chéo `status`/`result`/`error` và `job.job_id == job_id` chỉ ở phía Zod (`superRefine`); test Python kiểm cùng các điều kiện trên message do runner tạo.

**Cơ sở dữ liệu (AC-8, AC-9):**
- `0005_ai_jobs` sinh từ `src/db/schema/ai.ts`; `0006_ai_views_roles` viết tay (`drizzle-kit generate --custom`).
- `configureServiceRoles` trong `src/db/migrate.ts` kiểm mật khẩu trước khi chạy migration (≥ 12 ký tự an toàn trong URL), rồi `ALTER ROLE … LOGIN PASSWORD`.
- Integration test chạy app bằng `api_service` (`DATABASE_URL`); test cần quyền chủ dùng `DATABASE_OWNER_URL`. Cả bộ test cũ xanh dưới role mới, tức là API không cần quyền nào ngoài DML trên `core`.
- `core-schema.int-spec.ts` đếm bảng với `table_type = 'BASE TABLE'`, vì view cũng nằm trong `information_schema.tables`.
- Thử `UPDATE … SET id = id` trên cột identity thì PostgreSQL báo `428C9` trước khi kiểm quyền; test dùng `SET id = DEFAULT`.

**aigateway (AC-3, AC-4, AC-10):**
- Không dùng `RabbitMQModule` (state static, [LESSONS §16](../../LESSONS.md)); provider tạo `AmqpConnection` riêng cho mỗi app, `wait: false`, consumer `ai.results` đăng ký trong `onApplicationBootstrap` mà không chờ.
- `amqp-connection-manager` 5 cần `promise-breaker` 7 (chỉ ESM): `jest.config.cjs` biên dịch riêng gói này ([LESSONS §9](../../LESSONS.md)).
- Sự kiện: `ai.job.dispatched`, `ai.result.CV_PARSE`, `ai.result.JD_ANALYZE`, `ai.job.settled` (`modules/aigateway/domain/events.ts`, kèm quy ước listener).

**Worker (AC-4 … AC-7):**
- `JobRunner` (`ai-service/app/consumers/base.py`) dùng chung cho mọi kiểu job; handler giả trong `app/handlers/fake.py` nhận dấu hiệu `__fake__/retryable`, `__fake__/permanent` ở `file_key` để test trọn vòng đi được nhánh lỗi mà không cần biến môi trường riêng cho test.
- Subscriber `AckPolicy.MANUAL`; `prefetch_count = 8` ([LESSONS §17](../../LESSONS.md)).
- Lỗi hạ tầng (DB, broker) khi xử lý thì nack requeue; job sập giữa chừng quá 3 lần thì `FAILED` + DLQ mà không chạy handler.

**Test trọn vòng:** vhost riêng cho file test (tạo qua management API), worker build từ `ai-service/Dockerfile` chạy trên Docker network chung với PostgreSQL (`postgres`) và RabbitMQ (`rabbitmq`). Image giữ lại sau lần chạy ([LESSONS §18](../../LESSONS.md)). Listener mẫu `ReferenceCvResultListener` trong `test/helpers/ai-results.ts` chuyển CV sang `PENDING_CONFIRMATION` qua `transitionTo`.

**Lệch so với plan:** gộp bước "contracts" và "sinh Pydantic + CI" vào một commit, vì test AC-1 cần cả hai phía cùng lúc.

**Kiểm trên compose (2026-10-20):** `up -d --build --wait` lên đủ service; `GET http://localhost:8000/health` trả `{"status":"ok","postgres":"ok","rabbitmq":"ok"}`; log `migrate` báo bật đăng nhập cho `api_service`, `ai_service`; `psql` bằng `ai_service` đọc `core.cvs` bị `permission denied`, đọc `core.v_ai_cv_profile_masked` được; API kết nối bằng `api_service` và đăng nhập tài khoản seed được; một job gửi tay vào `ai.cv.parse` thành `SUCCEEDED attempts=1`, `ai.results` được API nhận, DLQ trống; `--scale ai-worker=2` cho 2 consumer trên mỗi queue job.

**Còn chờ:** CI xanh trên GitHub (bước kiểm hợp đồng và integration test có build image AI Service chạy lần đầu trên runner).

**Lessons:** §9 (bổ sung), §16, §17, §18.

## Files modified

- `packages/shared/contracts/` (`jobs.ts`, `envelope.ts`, `queues.ts`, `schemas.ts`, `index.ts`, `json-schema/*.json`, `__tests__/contracts.spec.ts`); `packages/shared/states/machine.ts` (`reachableFrom`) + test; `packages/shared/tsconfig.json`.
- `scripts/gen-contracts.mjs`; `package.json` (`contracts:gen`); `.gitattributes`; `.github/workflows/ci.yml`.
- `apps/api/src/db/schema/ai.ts`, `schema/index.ts`; `apps/api/drizzle/0005_ai_jobs.sql`, `0006_ai_views_roles.sql`, `meta/*`; `apps/api/src/db/migrate.ts` + `migrate.spec.ts`.
- `apps/api/src/modules/aigateway/` (module, service, consumer, `infrastructure/amqp.ts`, `domain/events.ts`, unit test); `src/app.module.ts`; `src/common/config/env.ts` + spec; `src/openapi/export.ts`; `apps/api/package.json` (`@golevelup/nestjs-rabbitmq` 9.1.0, `@types/amqplib`); `apps/api/jest.config.cjs`.
- `apps/api/test/setup/global-setup.ts`, `global-teardown.ts`, `images.ts`; `test/helpers/db.ts`, `test/helpers/ai-results.ts`; `test/integration/ai-service-role.int-spec.ts`, `ai-job-roundtrip.int-spec.ts`; `core-schema`, `db-smoke`, `audit-log-append-only` (URL chủ DB).
- `ai-service/`: `pyproject.toml`, `Dockerfile`, `.dockerignore`, `app/config.py`, `app/queues.py`, `app/consumers/*`, `app/handlers/*`, `app/worker.py`, `app/main.py`, `app/contracts/*` (sinh tự động), `tests/**`.
- `deploy/docker-compose.yml`, `deploy/.env.example`, `DEPLOY.md`, `docs/SETUP.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/CONTEXT.md` (D33), `docs/LESSONS.md`, `docs/CHANGELOG.md`, `VERSION`, sprint W42/W43.

## Cross-references

- [PRD NFR-10](../../PRD.md#non-functional-requirements)
- [Epic EPIC-2](../epics/EPIC-2.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D1, D4, D5, D6](../../CONTEXT.md)
- [ARCHITECTURE › Architecture decisions](../../ARCHITECTURE.md#architecture-decisions)
