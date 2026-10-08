---
id: US-1.2
title: "Lược đồ DB lõi, `transitionTo`, nhật ký thao tác"
epic: EPIC-1
status: review
priority: P0
points: 5
sprint: sprint-2026-W41
version_shipped: 0.1.1
prd_ref: [FR-7, NFR-5]
arch_ref: [AD-4, AD-8, AD-9]
depends_on: [US-1.1]
assignee: PDTnhah
commit: b1f8b171adb5d5805ed74d68200909622baf8103
created: 2026-10-07
updated: 2026-10-08
---

## Story refresh — 2026-10-08

Đọc lại story vào ngày 2026-10-08 trên nhánh `us-1.2` (US-1.1 đã merge vào `main`). Các quyết định sau được chốt vào story; số AC giữ nguyên:

- **Sprint**: kéo story vào `sprint-2026-W41`, vì US-1.1 xong sớm. Lộ trình gốc đặt story ở T2 (W42).
- **Cột của `audit_logs`** ([CONTEXT D24](../../CONTEXT.md)): thêm `reason text` và `actor_kind` (`USER` | `SYSTEM`, có CHECK). `actor_id` để NULL khi `SYSTEM` và bắt buộc có khi `USER`. Lý do: US-1.4 cần actor hệ thống cho scheduler.
- **Bảng chuyển**: chỉ gồm mũi tên PRD (đợt, JD) và chuỗi CV ở *Dev notes*. Không thêm cạnh nào spec chưa nói.
- **Áp migration khi deploy**: service `migrate` trong Docker Compose chạy một lần (`node dist/db/migrate.js`, cùng image với api). `api` chờ nó bằng `service_completed_successfully`.
- **Các đề xuất ở *Dev notes* được giữ**: khóa chính `bigint` identity, `students.gpa numeric(4,2)`, `row_version` cho cả `campaigns` và `cvs`, không có `users.sso_subject`, tên trạng thái tiếng Anh, mã lỗi `422`/`409`.
- **Bổ sung để US-1.3 không phải sinh migration**: `users.full_name`, `users.is_active`, `password_hash` cho phép NULL (HR được mời ở US-1.5). CHECK vai trò theo cả hai chiều: chỉ HR có `company_id`, chỉ STUDENT có `student_id`.
- **Phiên bản ghim**: `drizzle-orm` 0.45.3, `drizzle-kit` 0.31.11 (bản stable mới nhất; 1.0 còn RC).
- **Rủi ro đã kiểm trước khi code**: trigger append-only dùng `ENABLE ALWAYS`, vì API trong compose kết nối bằng superuser. Migrator của drizzle chỉ áp migration có `when` mới hơn migration cuối đã áp, nên thêm test kiểm `when` tăng dần. `files` của `apps/api` phải có `drizzle`, nếu không image production sẽ thiếu migration.

## Goal

Mọi thay đổi trạng thái trong hệ thống đi qua một hàm duy nhất. Hàm này kiểm tra bảng chuyển trạng thái, kiểm tra điều kiện nghiệp vụ, chống ghi đè đồng thời và ghi nhật ký trong cùng một giao dịch. Story này cũng tạo lược đồ `core` đầu tiên bằng Drizzle. Sau story này, các story có vòng đời (đợt, JD, CV, rồi hồ sơ ứng tuyển và đề cử ở EPIC-3, EPIC-5) chỉ cần khai báo bảng chuyển trạng thái của mình và gọi `transitionTo`. Chúng không phải tự viết khóa lạc quan hay audit.

## Background

FR-7 yêu cầu nhật ký thao tác chỉ ghi thêm cho mọi thay đổi trạng thái và điều chỉnh thủ công (BR-10). NFR-5 yêu cầu truy vết được mọi thay đổi trạng thái. Phần "lần gọi AI" của NFR-5 nằm ở `ai.llm_calls` (US-2.2).

AD-8 ([CONTEXT D8](../../CONTEXT.md)): mỗi vòng đời có kiểu trạng thái và bảng chuyển hợp lệ trong `packages/shared`. Mọi thay đổi đi qua `transitionTo(newState, actor, reason)` trong một giao dịch có ghi nhật ký. Chống ghi đè đồng thời bằng `row_version`: `UPDATE … WHERE id = $1 AND row_version = $2`, không dòng nào bị cập nhật thì trả `409`. XState đã bị loại vì thừa. AD-9 ([CONTEXT D9](../../CONTEXT.md)) chọn Drizzle ORM + drizzle-kit vì hỗ trợ trực tiếp partial unique index, `SELECT … FOR UPDATE`, JSONB và giao dịch. Prisma đã bị loại. AD-4 ([CONTEXT D4](../../CONTEXT.md)): PostgreSQL là nguồn sự thật duy nhất, schema `core` chỉ do Core Backend ghi. Schema `ai` và các view `core.v_ai_*` đã che PII thuộc US-2.1.

Phạm vi bảng theo EPIC-1 › *Object map*: `campaigns`, `companies`, `users`, `students`, `job_descriptions`, `cvs`, `audit_logs`. Vòng đời làm ở đây gồm đợt, JD, CV (PRD › *Vòng đời trạng thái*). Bảng chuyển của hồ sơ ứng tuyển thuộc US-3.3, của đề cử thuộc EPIC-5 (EPIC-1 › *Out of scope*).

**Lessons applied**: §2 — chạy `koni-docs sync` chỉ khi trạng thái thật sự đổi, sau đó xem diff của PRD và epic; §5 — `drizzle-orm` giờ được cài thật, nên chạy lại `pnpm depcruise:fixture` để chắc luật `domain/ → drizzle-orm` vẫn bắt được vi phạm.

## Acceptance criteria

- [x] **AC-1** — Drizzle schema trong `apps/api/src/db/` khai báo schema PostgreSQL `core` với 7 bảng theo ARCH › *Các bảng chính*: `campaigns`, `companies`, `users`, `students`, `job_descriptions`, `cvs`, `audit_logs`. Các bảng có vòng đời (`campaigns`, `job_descriptions`, `cvs`) có cột `status` và `row_version integer not null default 0`. Ràng buộc: `unique(users.email)`, `unique(students.student_code)`, `index(job_descriptions.campaign_id, status)`, `users.role` chỉ nhận `CENTER`/`STUDENT`/`HR`/`ADMIN` (CHECK), user `HR` bắt buộc có `company_id` và user `STUDENT` bắt buộc có `student_id` (CHECK). File migration SQL do drizzle-kit sinh nằm trong `apps/api/drizzle/` và áp dụng được lên DB rỗng.
- [x] **AC-2** — `packages/shared/states/` export kiểu trạng thái và bảng chuyển cho đợt, JD, CV, cùng hàm thuần `canTransition(machine, from, to)`. Bảng chuyển cho phép **đúng** các mũi tên của PRD › *Vòng đời trạng thái* (đợt, JD) và vòng đời CV ở *Dev notes*; mọi cặp khác bị từ chối. Unit test duyệt hết mọi cặp `(from, to)` của từng vòng đời.
- [x] **AC-3** — **Given** một bản ghi ở trạng thái A với `row_version = n`, **When** gọi `transitionTo` sang B (cặp A→B hợp lệ) với `expectedRowVersion = n`, actor và lý do, **Then** `status = B`, `row_version = n + 1` **And** `core.audit_logs` có đúng một dòng mới (`actor_id`, `action`, `entity`, `entity_id`, `before.status = A`, `after.status = B`, lý do, `at`) được ghi trong cùng giao dịch.
- [x] **AC-4** — **Given** cặp A→C không có trong bảng chuyển, **When** gọi `transitionTo` sang C, **Then** hàm ném lỗi mã `INVALID_TRANSITION` (API trả `422`) **And** bản ghi không đổi, `row_version` không tăng, không có dòng audit mới.
- [x] **AC-5** — **Given** hai yêu cầu đồng thời cùng chuyển một bản ghi với cùng `expectedRowVersion`, **When** cả hai chạy song song, **Then** đúng một yêu cầu thành công, yêu cầu còn lại nhận `409 Conflict` **And** chỉ có một dòng audit.
- [x] **AC-6** — **Given** `transitionTo` nhận một hàm kiểm tra điều kiện nghiệp vụ (guard) và guard trả về không đạt kèm mã lý do, **When** gọi chuyển trạng thái, **Then** hàm ném lỗi mã `TRANSITION_CONDITION_FAILED` (API trả `422`, có mã lý do) **And** không có thay đổi hay dòng audit nào. Guard chạy bên trong cùng giao dịch, sau khi đã khóa dòng.
- [x] **AC-7** — **Given** việc ghi audit thất bại (test cố ý làm lỗi lệnh insert audit), **When** gọi `transitionTo`, **Then** cả giao dịch rollback: trạng thái và `row_version` giữ nguyên.
- [x] **AC-8** — **Given** `core.audit_logs` đã có dữ liệu, **When** bất kỳ tài khoản DB nào, kể cả tài khoản của ứng dụng, chạy `UPDATE`, `DELETE` hoặc `TRUNCATE` lên bảng này, **Then** PostgreSQL từ chối (trigger `BEFORE UPDATE OR DELETE` và `BEFORE TRUNCATE` ném lỗi) **And** `INSERT` vẫn chạy được.
- [x] **AC-9** — `apps/api/test/helpers/` có helper dùng lại cho các story sau: tạo bản ghi ở một trạng thái bất kỳ, gọi chuyển trạng thái rồi đọc audit cuối cùng, chạy hai thao tác đồng thời để kiểm `409`. Integration test của story này dùng chính các helper đó.

## Tasks

- [x] **TASK-1.2.1** — Drizzle schema và migration đầu tiên của `core` (AC: 1)
  - [x] Subtask 1.2.1.1 — `apps/api/src/db/schema/` mỗi bảng một file, gom ở `apps/api/src/db/schema/index.ts`; dùng `pgSchema('core')`.
  - [x] Subtask 1.2.1.2 — `apps/api/drizzle.config.ts`; script sinh và áp migration trong `apps/api/package.json`; commit file SQL vào `apps/api/drizzle/`.
  - [x] Subtask 1.2.1.3 — Migration bật extension `pgcrypto` (cột `cvs.pii` mã hóa ở US-2.4 cần nó).
  - [x] Subtask 1.2.1.4 — `apps/api/src/db/db.module.ts`: provider kết nối Drizzle; thêm kiểm tra DB vào `GET /api/health`.
- [x] **TASK-1.2.2** — Bảng chuyển trạng thái dùng chung (AC: 2)
  - [x] Subtask 1.2.2.1 — `packages/shared/states/machine.ts`: kiểu `StateMachine<S>` và `canTransition`.
  - [x] Subtask 1.2.2.2 — `packages/shared/states/campaign.ts`, `job-description.ts`, `cv.ts`: union literal trạng thái + bảng chuyển.
  - [x] Subtask 1.2.2.3 — `packages/shared/schemas/roles.ts`: hằng `ROLES` dùng cho CHECK của `users.role` và cho US-1.3.
- [x] **TASK-1.2.3** — Module `audit` (AC: 3, 7, 8)
  - [x] Subtask 1.2.3.1 — `apps/api/src/modules/audit/application/audit.service.ts`: `record(tx, entry)` chỉ insert, nhận giao dịch của bên gọi; module chỉ export `AuditService`.
  - [x] Subtask 1.2.3.2 — Migration SQL thủ công: trigger chặn `UPDATE`/`DELETE`/`TRUNCATE` trên `core.audit_logs`.
- [x] **TASK-1.2.4** — Hàm `transitionTo` (AC: 3, 4, 5, 6, 7)
  - [x] Subtask 1.2.4.1 — `apps/api/src/common/state/transition-to.ts`: mở giao dịch hoặc nhận giao dịch của bên gọi; `SELECT … FOR UPDATE`; `canTransition`; guard; `UPDATE … WHERE id AND row_version`; `AuditService.record`.
  - [x] Subtask 1.2.4.2 — `apps/api/src/common/errors/`: lỗi `INVALID_TRANSITION`, `TRANSITION_CONDITION_FAILED`, `ROW_VERSION_CONFLICT` và exception filter chuyển thành `422`/`409` với body `{ code, message }`.
- [x] **TASK-1.2.5** — Test (AC: 2–9)
  - [x] Subtask 1.2.5.1 — `packages/shared/states/__tests__/`: unit test bảng chuyển, duyệt mọi cặp.
  - [x] Subtask 1.2.5.2 — `apps/api/test/helpers/state.ts`: helper ở AC-9.
  - [x] Subtask 1.2.5.3 — `apps/api/test/integration/transition-to.int-spec.ts`, `audit-log-append-only.int-spec.ts`, `core-schema.int-spec.ts` (testcontainers từ US-1.1).

## Dev notes

### Architecture constraints

- [AD-8](../../ARCHITECTURE.md#architecture-decisions): bảng chuyển tự viết + `transitionTo` + `row_version`. Không dùng XState hay thư viện state machine khác. Không cho phép cập nhật cột `status` ở chỗ nào khác ngoài `transitionTo`. Reviewer kiểm bằng `rg`.
- [AD-9](../../ARCHITECTURE.md#architecture-decisions): Drizzle ORM + drizzle-kit, file migration SQL được commit. Phần Drizzle không sinh được (trigger audit) viết thành migration SQL tay trong cùng thư mục `apps/api/drizzle/`.
- [AD-4](../../ARCHITECTURE.md#architecture-decisions): mọi bảng ở story này nằm trong schema `core`. Tài khoản DB riêng cho AI Service và các view `core.v_ai_*` thuộc US-2.1.
- AGENTS › Nguyên tắc 10 và 11: chuyển trạng thái, kiểm điều kiện, ghi audit trong cùng giao dịch; quy tắc quan trọng có ràng buộc DB (CHECK vai trò, trigger append-only).
- AGENTS › Nguyên tắc 13: `transitionTo` nằm ở `apps/api/src/common/state/`. Nó nhận bảng Drizzle do module sở hữu truyền vào và chỉ gọi `AuditService` đã export, không tự truy vấn bảng của module khác. Bảng chuyển trong `packages/shared/states/` là TypeScript thuần.
- Nhánh lỗi: `422` cho chuyển sai bảng hoặc guard không đạt, `409` cho lệch `row_version` (ARCH › *Quản lý trạng thái*). Mã `422` và tên mã lỗi là đề xuất. ARCH chỉ quy định `409`.
- **Tên trạng thái (đề xuất, spec chỉ có tên tiếng Việt):**
  - Đợt (PRD GĐ0): `DRAFT → INTAKE → PREFERENCE_SELECTION → TESTING → ALLOCATION_REVIEW → SUPPLEMENTARY → CLOSED`, ứng với *Nháp → Mở nhận JD/CV → Chọn nguyện vọng → Làm test → Phân bổ & HR duyệt → Vòng bổ sung → Đã đóng*.
  - JD: `DRAFT → PENDING_HR_CONFIRMATION → PENDING_APPROVAL → APPROVED → RECRUITING → FILLED | CLOSED`, ứng với *Nháp → Chờ HR xác nhận yêu cầu → Chờ Trung tâm duyệt → Đã duyệt → Đang tuyển → Đủ chỉ tiêu | Đóng*.
  - CV: `PENDING_ANALYSIS → PENDING_CONFIRMATION → CONFIRMED`. PRD không có sơ đồ vòng đời CV. Chuỗi này lấy từ ARCH › *Luồng nộp và phân tích CV* ("Đang phân tích" → "Chờ SV xác nhận") và EPIC-1 ("chờ phân tích"). Trạng thái lỗi phân tích (job vào DLQ) chưa có trong spec, để US-2.4 hỏi rồi bổ sung.
  - Story này chỉ cho phép các mũi tên trên. Các cạnh spec chưa nói (VD `ALLOCATION_REVIEW → CLOSED` khi không cần vòng bổ sung, `FILLED → CLOSED`, Trung tâm trả JD về) phải hỏi trước khi thêm.
- **Những chỗ spec thiếu, cần hỏi trước khi chốt:**
  - `audit_logs` ở ARCH không có cột lý do, trong khi `transitionTo(…, reason)` và BR-10 đều cần lý do. Đề xuất thêm cột `reason text`. Nếu không thêm thì lưu ở `after.reason`.
  - ARCH chỉ ghi `row_version` cho `job_descriptions`. Story này thêm `row_version` cho cả `campaigns` và `cvs`, vì AD-8 áp dụng cho mọi đối tượng có vòng đời.
  - Vòng đời *Sinh viên trong đợt* (PRD) không có bảng tương ứng ở ARCH. Story này không tạo bảng cho nó. Cần chốt: suy ra từ `cvs` + `preferences` + `nominations`, hay thêm bảng.
  - Thang GPA (4 hay 10) chưa có trong spec. Đề xuất `students.gpa numeric(4,2)` để chứa được cả hai thang; thang dùng khi lọc điều kiện cứng (US-3.1) cần chốt.
  - Kiểu khóa chính: ví dụ message ở ARCH dùng số nguyên (`"cv_id": 457`), nên đề xuất `bigint` identity cho bảng nghiệp vụ.
  - Cột `users.sso_subject` không tạo vì SSO OIDC ngoài phạm vi (CONTEXT D20).
- ARCH › *Các module* ghi `audit` là "NestJS interceptor + bảng append-only". Interceptor chạy ngoài giao dịch của nghiệp vụ, nên không dùng nó để ghi audit cho chuyển trạng thái (trái AD-8). Story này chỉ làm `AuditService.record(tx, …)`.
- Story này không thêm mục AD mới.

### Cross-story dependencies

- Builds on [US-1.1](US-1.1-scaffold-monorepo-docker-compose-ci.md): dùng `apps/api/src/db/`, `apps/api/drizzle/`, global setup testcontainers ở `apps/api/test/setup/`.
- Required by [US-1.4](US-1.4-campaign-setup-and-config.md): vòng đời đợt, `transitionTo` cho chuyển trạng thái theo mốc.
- Required by [US-1.5](US-1.5-company-hr-accounts-jd-posting-approval.md): bảng `companies`, `job_descriptions`, vòng đời JD.
- Required by [US-1.6](US-1.6-data-consent-and-cv-upload.md): bảng `cvs`, vòng đời CV. US-1.6 thêm cột `active` và partial unique index cho BR-01.
- Required by [US-1.7](US-1.7-notifications-sse-email-reminders.md): bảng `users` (người nhận thông báo).
- Required by [US-2.1](US-2.1-ai-job-pipeline-message-contracts.md): view `core.v_ai_*` dựng trên `cvs`, `job_descriptions`.
- Required by [US-3.3](US-3.3-shortlist-and-preferences.md) và các story EPIC-5: thêm bảng chuyển mới vào `packages/shared/states/` và gọi `transitionTo`.
- Sibling [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md): cùng tuần T2. US-1.3 dùng bảng `users` và `ROLES` ở đây. Theo [sprints/README › Chạy song song](../README.md), story này merge trước (sinh migration và thêm vào `packages/shared`), US-1.3 rebase sau và không sinh migration trong đợt này.

### What we explicitly did NOT do

- Không làm schema `ai`, tài khoản DB của AI Service, view che PII. Thuộc US-2.1.
- Không làm các bảng `skills`, `match_results`, `preferences`, các bảng thi, phân bổ, `notifications`. Mỗi bảng thuộc story dùng nó, để tránh migration chạm nhau.
- Không ghi audit cho thao tác đọc. FR-7 chỉ yêu cầu thay đổi trạng thái và điều chỉnh thủ công.

### References

- [Source: PRD › Functional Requirements (FR-7)](../../PRD.md#functional-requirements)
- [Source: PRD › Non-Functional Requirements (NFR-5)](../../PRD.md#non-functional-requirements)
- [Source: PRD › Vòng đời trạng thái; Quy tắc nghiệp vụ (BR-10)](../../PRD.md)
- [Source: ARCHITECTURE › Component architecture › Quản lý trạng thái](../../ARCHITECTURE.md#component-architecture)
- [Source: ARCHITECTURE › Data architecture › Các bảng chính](../../ARCHITECTURE.md#data-architecture)
- [Source: ARCHITECTURE › Architecture decisions (AD-4, AD-8, AD-9)](../../ARCHITECTURE.md#architecture-decisions)
- [Source: CONTEXT D4, D8, D9](../../CONTEXT.md)
- [Source: EPIC-1 › Cross-cutting invariants](../epics/EPIC-1.md)

## Verification commands

| AC | Command |
|---|---|
| AC-1 | `pnpm --filter @srm/api test -- test/integration/core-schema.int-spec.ts` › "AD-9: migrations apply on empty DB and create core tables with constraints" (DB trống riêng, 7 bảng, `pgcrypto`, index, `row_version`, ràng buộc theo tên, chạy lại không đổi gì); `pnpm --filter @srm/api db:generate` in `No schema changes` |
| AC-2 | `pnpm --filter @srm/shared test` › "GĐ0: campaign machine allows only PRD transitions", "GĐ1: JD machine allows only PRD transitions", "GĐ2: CV machine allows only listed transitions" (duyệt mọi cặp so với cạnh viết tay từ PRD) |
| AC-3 | `pnpm --filter @srm/api test -- test/integration/transition-to.int-spec.ts` › "AD-8: valid transition bumps row_version and writes one audit row in same transaction" (cùng `xmin`) |
| AC-4 | `transition-to.int-spec.ts` › "AD-8: invalid transition is rejected with INVALID_TRANSITION and no audit row"; HTTP `422`: `pnpm --filter @srm/api test:unit -- domain-error.filter` |
| AC-5 | `transition-to.int-spec.ts` › "AD-8: concurrent transitions with same row_version yield exactly one 409"; HTTP `409`: `domain-error.filter.spec.ts` |
| AC-6 | `transition-to.int-spec.ts` › "AD-8: failing guard rejects with TRANSITION_CONDITION_FAILED and no change" (guard thấy dòng đã khóa: `FOR UPDATE NOWAIT` từ connection khác ra `55P03`) |
| AC-7 | `transition-to.int-spec.ts` › "BR-10: audit insert failure rolls back the state change" |
| AC-8 | `pnpm --filter @srm/api test -- test/integration/audit-log-append-only.int-spec.ts` › "BR-10: UPDATE, DELETE and TRUNCATE on audit_logs are rejected by the database" (superuser chủ bảng, role thường có `GRANT ALL`, superuser ở `session_replication_role = replica`) |
| AC-9 | `rg -l "helpers/state" apps/api/test/integration` ra `transition-to.int-spec.ts` (import tương đối là `../helpers/state.js`, nên chuỗi `test/helpers/state` không xuất hiện) |
| Ranh giới | `rg -n "set\(\{\s*status" apps/api/src --type ts` chỉ ra `apps/api/src/common/state/transition-to.ts`; `pnpm depcruise && pnpm depcruise:fixture` |
| Deploy | `docker compose -f deploy/docker-compose.yml up -d --build --wait` thoát 0 sau khi `migrate` thoát 0; `curl -fsS http://localhost:8080/api/health` có `"database":{"status":"up"}` |

## Changelog entry

### Added
- Lược đồ `core` đầu tiên bằng Drizzle (`drizzle-orm` 0.45.3, `drizzle-kit` 0.31.11): `campaigns`, `companies`, `users`, `students`, `job_descriptions`, `cvs`, `audit_logs`, kèm migration SQL trong `apps/api/drizzle/`. Cột `status` có CHECK lấy từ bảng chuyển dùng chung; CHECK vai trò, HR ↔ `company_id`, STUDENT ↔ `student_id`, email chữ thường.
- `packages/shared/states`: bảng chuyển trạng thái của đợt, JD, CV dùng chung cho web và API; `packages/shared/schemas`: `ROLES`, `ACTOR_KINDS`, `ApiErrorSchema`.
- `transitionTo` (`StateTransitionService`): khóa dòng, kiểm `row_version` (lệch thì trả `409`), kiểm bảng chuyển và điều kiện (sai thì trả `422`), ghi nhật ký trong cùng giao dịch. Exception filter trả body `{ code, message, details }`.
- Nhật ký thao tác chỉ ghi thêm: trigger `ENABLE ALWAYS` chặn `UPDATE`/`DELETE`/`TRUNCATE` trên `audit_logs` (BR-10); cột `reason`, `actor_kind` (CONTEXT D24).
- Docker Compose có service `migrate` chạy một lần trước `api`; biến `DATABASE_URL`; `GET /api/health` kiểm thêm DB.
- Helper test dùng lại cho các story sau (`apps/api/test/helpers/`); CI kiểm migration khớp schema.

**Commit**: b1f8b17

## Implementation notes

**2026-10-08 — nhánh `us-1.2`.** Plan đã duyệt; các rủi ro được kiểm trước khi code (Story refresh).

**Quyết định trong lúc làm** (CONTEXT D24):
- `transitionTo` nhận `lifecycle` (`campaignLifecycle`, `jobDescriptionLifecycle`, `cvLifecycle` trong `apps/api/src/db/lifecycles.ts`) thay vì `table` và `machine` riêng, để không ghép nhầm bảng với bảng chuyển của vòng đời khác. Entity trong audit lấy từ `machine.name` (`campaign`, `job_description`, `cv`).
- Thứ tự kiểm: khóa dòng → `row_version` → bảng chuyển → guard → `UPDATE … WHERE row_version` → audit. Kiểm đột biến: bỏ bước so `row_version` thì 2 test đỏ, vì bên thua nhận nhầm `422`.
- `expectedRowVersion` bắt buộc với actor `USER`; actor `SYSTEM` (scheduler ở US-1.4) được bỏ trống vì đã khóa dòng.
- `updated_at` dùng `$onUpdate(now())` trong helper cột, nên mọi lệnh update qua Drizzle đều cập nhật theo đồng hồ của DB.
- Lỗi domain (`apps/api/src/common/errors/`) không import NestJS, nên code `domain/` ném được. Filter ném lại khi không ở HTTP, để consumer RabbitMQ (AD-5) nhận đúng lỗi gốc.
- Kiểu Drizzle: tham số khai kiểu cụ thể `LifecycleTable`, không dùng generic. Bản generic phải ép kiểu, và ESLint lại báo phép ép thừa (LESSONS §7).
- `packages/shared` có Jest riêng (cùng phiên bản với api), nên `pnpm test` chạy cả test bảng chuyển.
- Kiểm `drizzle-kit generate` trong CI bằng `git status --porcelain`, không dùng `git diff --exit-code`, vì migration bị quên là file mới chưa được track (LESSONS §6).

**Kiểm chứng đã chạy (Node 22, Docker 29.7, Compose v5.5):** `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm depcruise`, `pnpm depcruise:fixture` đều qua. `pnpm test`: shared 10 test, api 35 test (unit + integration). Có ba lần kiểm đột biến: thêm cạnh thừa vào bảng chuyển đợt → test GĐ0 đỏ; bỏ bước so `row_version` → 2 test đỏ; bỏ `ENABLE ALWAYS` → test `replica` đỏ. Compose: `up -d --build --wait` từ DB trống thoát 0, `migrate` in `applied migrations from /app/drizzle`, `/api/health` có `database: up`; chạy `up` lần hai không áp lại migration. Mô phỏng sửa schema mà quên sinh migration: `db:generate` sinh file mới, bước CI sẽ báo lỗi.

**Việc tồn đọng / cần người dùng chốt** (từ `/code-review`, chưa sửa trong story này):
1. **Chủ bảng vẫn tắt được trigger.** API và `migrate` đều kết nối bằng superuser `POSTGRES_USER`, là chủ `audit_logs`. Tài khoản này chạy được `ALTER TABLE … DISABLE TRIGGER` hoặc `DROP`. AC-8 chỉ yêu cầu chặn DML nên đã đạt. Muốn bịt hẳn thì API dùng một role không phải chủ bảng, chỉ có `INSERT`/`SELECT` trên `audit_logs`. Đề xuất làm cùng lúc tách role DB ở US-2.1.
2. **Quy tắc "chỉ `transitionTo` đổi `status`"** chỉ được kiểm bằng `rg` theo AD-8. `.set(patch)` hoặc SQL thô không bị bắt. Có thể thêm trigger "đổi `status` thì `row_version` phải tăng đúng 1" làm lớp chặn ở DB (Nguyên tắc 11).
3. **Chuyển trạng thái lặp lại** (message được giao lại, đích đã đạt) đang trả `INVALID_TRANSITION`. Theo AD-5, chống xử lý trùng nằm ở `job_id` (US-2.1), nên chưa thêm nhánh no-op.
4. **Append-only và NFR-2** (xóa hoặc ẩn danh dữ liệu cá nhân sau thời hạn): trigger chặn mọi `UPDATE`/`DELETE`, kể cả ẩn danh hóa. Hiện audit chỉ chứa ID và trạng thái, không có PII. Cần chốt chính sách trước khi story nào đó ghi dữ liệu cá nhân vào `before`/`after`.

Lessons: §6 (migrator bỏ qua migration có `when` cũ hơn), §7 (kiểu Drizzle cho hàm dùng chung nhiều bảng).

## Files modified

- **Gốc repo:** `AGENTS.md` (Trạng thái, Lệnh), `DEPLOY.md` (service `migrate`, mục *Migration cơ sở dữ liệu*, `DATABASE_URL`), `pnpm-lock.yaml`, `.github/workflows/ci.yml` (bước kiểm migration), `scripts/check-depcruise-fixture.sh` (comment).
- **`packages/shared/`:**
  - Mới: `schemas/{roles,errors,audit}.ts`, `states/{machine,campaign,job-description,cv}.ts`, `states/__tests__/{pairs,machine.spec,campaign.spec,job-description.spec,cv.spec}.ts`, `jest.config.cjs`.
  - Sửa: `schemas/index.ts`, `states/index.ts`, `package.json` (script `test`, Jest), `tsconfig.json`, `tsconfig.build.json`.
- **`apps/api/`:**
  - Cấu hình: `package.json` (`drizzle-orm`, `drizzle-kit`, `db:generate`, `db:migrate`, `files` có `drizzle`), `tsconfig.json`, mới `drizzle.config.ts`.
  - Migration: `drizzle/0000_core_schema.sql`, `drizzle/0001_audit_append_only.sql`, `drizzle/meta/*`.
  - DB: `src/db/schema/{core,columns,campaigns,companies,students,users,job-descriptions,cvs,audit-logs,index}.ts`, `src/db/{db.module,tokens,types,migrate,lifecycles}.ts`, `src/db/migrations-journal.spec.ts`.
  - `src/common/errors/{domain-error,domain-error.filter,index}.ts`, `domain-error.filter.spec.ts`; `src/common/state/{transition-to,state-transition.service,state.module,index}.ts`.
  - `src/modules/audit/{audit.module,index}.ts`, `application/audit.service.ts`, `domain/{actor,audit-entry}.ts`.
  - Sửa: `src/app.module.ts` (`DbModule`, `APP_FILTER`), `src/common/config/env.ts` (`DATABASE_URL`), `src/health/{health.controller,health.module,health.controller.spec}.ts`; mới `src/health/database.health.ts`.
  - Test: `test/setup/global-setup.ts` (chạy migration), `test/helpers/{db,factories,state}.ts`, `test/integration/{core-schema,transition-to,audit-log-append-only}.int-spec.ts`.
  - Xóa `.gitkeep` ở `src/db/`, `src/modules/`, `drizzle/`.
- **`deploy/`:** `docker-compose.yml` (service `migrate`, `DATABASE_URL`), `.env.example`.
- **`docs/`:** `ARCHITECTURE.md`, `CONTEXT.md` (D24), `LESSONS.md` (§6, §7), `SETUP.md`, `CHANGELOG.md`, `sprints/sprint-2026-W41.md`, `sprints/stories/US-1.2-…md`, `sprints/STATUS.md`.

## Cross-references

- [PRD FR-7, NFR-5](../../PRD.md#functional-requirements)
- [Epic EPIC-1](../epics/EPIC-1.md)
- [ARCHITECTURE AD-4, AD-8, AD-9](../../ARCHITECTURE.md#architecture-decisions)
- [CONTEXT D4, D8, D9, D24](../../CONTEXT.md)
- [LESSONS §6, §7](../../LESSONS.md)
- [CHANGELOG](../../CHANGELOG.md)
