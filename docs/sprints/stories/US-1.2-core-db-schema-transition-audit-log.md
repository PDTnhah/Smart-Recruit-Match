---
id: US-1.2
title: "Lược đồ DB lõi, `transitionTo`, nhật ký thao tác"
epic: EPIC-1
status: in-progress
priority: P0
points: 5
sprint: sprint-2026-W41
version_shipped:
prd_ref: [FR-7, NFR-5]
arch_ref: [AD-4, AD-8, AD-9]
depends_on: [US-1.1]
assignee: PDTnhah
commit:
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

- [ ] **AC-1** — Drizzle schema trong `apps/api/src/db/` khai báo schema PostgreSQL `core` với 7 bảng theo ARCH › *Các bảng chính*: `campaigns`, `companies`, `users`, `students`, `job_descriptions`, `cvs`, `audit_logs`. Các bảng có vòng đời (`campaigns`, `job_descriptions`, `cvs`) có cột `status` và `row_version integer not null default 0`. Ràng buộc: `unique(users.email)`, `unique(students.student_code)`, `index(job_descriptions.campaign_id, status)`, `users.role` chỉ nhận `CENTER`/`STUDENT`/`HR`/`ADMIN` (CHECK), user `HR` bắt buộc có `company_id` và user `STUDENT` bắt buộc có `student_id` (CHECK). File migration SQL do drizzle-kit sinh nằm trong `apps/api/drizzle/` và áp dụng được lên DB rỗng.
- [ ] **AC-2** — `packages/shared/states/` export kiểu trạng thái và bảng chuyển cho đợt, JD, CV, cùng hàm thuần `canTransition(machine, from, to)`. Bảng chuyển cho phép **đúng** các mũi tên của PRD › *Vòng đời trạng thái* (đợt, JD) và vòng đời CV ở *Dev notes*; mọi cặp khác bị từ chối. Unit test duyệt hết mọi cặp `(from, to)` của từng vòng đời.
- [ ] **AC-3** — **Given** một bản ghi ở trạng thái A với `row_version = n`, **When** gọi `transitionTo` sang B (cặp A→B hợp lệ) với `expectedRowVersion = n`, actor và lý do, **Then** `status = B`, `row_version = n + 1` **And** `core.audit_logs` có đúng một dòng mới (`actor_id`, `action`, `entity`, `entity_id`, `before.status = A`, `after.status = B`, lý do, `at`) được ghi trong cùng giao dịch.
- [ ] **AC-4** — **Given** cặp A→C không có trong bảng chuyển, **When** gọi `transitionTo` sang C, **Then** hàm ném lỗi mã `INVALID_TRANSITION` (API trả `422`) **And** bản ghi không đổi, `row_version` không tăng, không có dòng audit mới.
- [ ] **AC-5** — **Given** hai yêu cầu đồng thời cùng chuyển một bản ghi với cùng `expectedRowVersion`, **When** cả hai chạy song song, **Then** đúng một yêu cầu thành công, yêu cầu còn lại nhận `409 Conflict` **And** chỉ có một dòng audit.
- [ ] **AC-6** — **Given** `transitionTo` nhận một hàm kiểm tra điều kiện nghiệp vụ (guard) và guard trả về không đạt kèm mã lý do, **When** gọi chuyển trạng thái, **Then** hàm ném lỗi mã `TRANSITION_CONDITION_FAILED` (API trả `422`, có mã lý do) **And** không có thay đổi hay dòng audit nào. Guard chạy bên trong cùng giao dịch, sau khi đã khóa dòng.
- [ ] **AC-7** — **Given** việc ghi audit thất bại (test cố ý làm lỗi lệnh insert audit), **When** gọi `transitionTo`, **Then** cả giao dịch rollback: trạng thái và `row_version` giữ nguyên.
- [ ] **AC-8** — **Given** `core.audit_logs` đã có dữ liệu, **When** bất kỳ tài khoản DB nào, kể cả tài khoản của ứng dụng, chạy `UPDATE`, `DELETE` hoặc `TRUNCATE` lên bảng này, **Then** PostgreSQL từ chối (trigger `BEFORE UPDATE OR DELETE` và `BEFORE TRUNCATE` ném lỗi) **And** `INSERT` vẫn chạy được.
- [ ] **AC-9** — `apps/api/test/helpers/` có helper dùng lại cho các story sau: tạo bản ghi ở một trạng thái bất kỳ, gọi chuyển trạng thái rồi đọc audit cuối cùng, chạy hai thao tác đồng thời để kiểm `409`. Integration test của story này dùng chính các helper đó.

## Tasks

- [ ] **TASK-1.2.1** — Drizzle schema và migration đầu tiên của `core` (AC: 1)
  - [ ] Subtask 1.2.1.1 — `apps/api/src/db/schema/` mỗi bảng một file, gom ở `apps/api/src/db/schema/index.ts`; dùng `pgSchema('core')`.
  - [ ] Subtask 1.2.1.2 — `apps/api/drizzle.config.ts`; script sinh và áp migration trong `apps/api/package.json`; commit file SQL vào `apps/api/drizzle/`.
  - [ ] Subtask 1.2.1.3 — Migration bật extension `pgcrypto` (cột `cvs.pii` mã hóa ở US-2.4 cần nó).
  - [ ] Subtask 1.2.1.4 — `apps/api/src/db/db.module.ts`: provider kết nối Drizzle; thêm kiểm tra DB vào `GET /api/health`.
- [ ] **TASK-1.2.2** — Bảng chuyển trạng thái dùng chung (AC: 2)
  - [ ] Subtask 1.2.2.1 — `packages/shared/states/machine.ts`: kiểu `StateMachine<S>` và `canTransition`.
  - [ ] Subtask 1.2.2.2 — `packages/shared/states/campaign.ts`, `job-description.ts`, `cv.ts`: union literal trạng thái + bảng chuyển.
  - [ ] Subtask 1.2.2.3 — `packages/shared/schemas/roles.ts`: hằng `ROLES` dùng cho CHECK của `users.role` và cho US-1.3.
- [ ] **TASK-1.2.3** — Module `audit` (AC: 3, 7, 8)
  - [ ] Subtask 1.2.3.1 — `apps/api/src/modules/audit/application/audit.service.ts`: `record(tx, entry)` chỉ insert, nhận giao dịch của bên gọi; module chỉ export `AuditService`.
  - [ ] Subtask 1.2.3.2 — Migration SQL thủ công: trigger chặn `UPDATE`/`DELETE`/`TRUNCATE` trên `core.audit_logs`.
- [ ] **TASK-1.2.4** — Hàm `transitionTo` (AC: 3, 4, 5, 6, 7)
  - [ ] Subtask 1.2.4.1 — `apps/api/src/common/state/transition-to.ts`: mở giao dịch hoặc nhận giao dịch của bên gọi; `SELECT … FOR UPDATE`; `canTransition`; guard; `UPDATE … WHERE id AND row_version`; `AuditService.record`.
  - [ ] Subtask 1.2.4.2 — `apps/api/src/common/errors/`: lỗi `INVALID_TRANSITION`, `TRANSITION_CONDITION_FAILED`, `ROW_VERSION_CONFLICT` và exception filter chuyển thành `422`/`409` với body `{ code, message }`.
- [ ] **TASK-1.2.5** — Test (AC: 2–9)
  - [ ] Subtask 1.2.5.1 — `packages/shared/states/__tests__/`: unit test bảng chuyển, duyệt mọi cặp.
  - [ ] Subtask 1.2.5.2 — `apps/api/test/helpers/state.ts`: helper ở AC-9.
  - [ ] Subtask 1.2.5.3 — `apps/api/test/integration/transition-to.int-spec.ts`, `audit-log-append-only.int-spec.ts`, `core-schema.int-spec.ts` (testcontainers từ US-1.1).

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
| AC-1 | `apps/api/test/integration/core-schema.int-spec.ts` › "AD-9: migrations apply on empty DB and create core tables with constraints" |
| AC-2 | `packages/shared/states/__tests__/campaign.spec.ts` › "GĐ0: campaign machine allows only PRD transitions"; `job-description.spec.ts` › "GĐ1: JD machine allows only PRD transitions"; `cv.spec.ts` › "GĐ2: CV machine allows only listed transitions" |
| AC-3 | `apps/api/test/integration/transition-to.int-spec.ts` › "AD-8: valid transition bumps row_version and writes one audit row in same transaction" |
| AC-4 | `transition-to.int-spec.ts` › "AD-8: invalid transition is rejected with INVALID_TRANSITION and no audit row" |
| AC-5 | `transition-to.int-spec.ts` › "AD-8: concurrent transitions with same row_version yield exactly one 409" |
| AC-6 | `transition-to.int-spec.ts` › "AD-8: failing guard rejects with TRANSITION_CONDITION_FAILED and no change" |
| AC-7 | `transition-to.int-spec.ts` › "BR-10: audit insert failure rolls back the state change" |
| AC-8 | `apps/api/test/integration/audit-log-append-only.int-spec.ts` › "BR-10: UPDATE, DELETE and TRUNCATE on audit_logs are rejected by the database" |
| AC-9 | `rg -l "test/helpers/state" apps/api/test/integration` ra ít nhất `transition-to.int-spec.ts` |
| Ranh giới | `rg -n "set\(\{\s*status" apps/api/src --type ts` chỉ ra `apps/api/src/common/state/transition-to.ts` |

Lệnh chạy: các file trên chạy bằng script `pnpm test` / `pnpm --filter <package> test` do US-1.1 tạo; ghi lệnh đầy đủ vào bảng này khi US-1.1 xong (AGENTS › *Lệnh*).

## Changelog entry

### Added
- Lược đồ `core` đầu tiên bằng Drizzle: `campaigns`, `companies`, `users`, `students`, `job_descriptions`, `cvs`, `audit_logs`, kèm migration SQL.
- `packages/shared/states`: bảng chuyển trạng thái của đợt, JD, CV dùng chung cho web và API.
- `transitionTo`: kiểm tra bảng chuyển và điều kiện, khóa lạc quan bằng `row_version` (trả `409` khi xung đột), ghi nhật ký trong cùng giao dịch.
- Nhật ký thao tác chỉ ghi thêm: trigger chặn `UPDATE`/`DELETE`/`TRUNCATE` trên `audit_logs` (BR-10).

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-7, NFR-5](../../PRD.md#functional-requirements)
- [Epic EPIC-1](../epics/EPIC-1.md)
- [ARCHITECTURE AD-4, AD-8, AD-9](../../ARCHITECTURE.md#architecture-decisions)
- [CONTEXT D4, D8, D9](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
