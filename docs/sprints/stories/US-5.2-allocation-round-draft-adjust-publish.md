---
id: US-5.2
title: "Vòng phân bổ: dự thảo, điều chỉnh, công bố"
epic: EPIC-5
status: backlog
priority: P0
points: 8
sprint:
version_shipped:
prd_ref:
  - FR-26
  - FR-27
  - NFR-4
arch_ref:
  - AD-7
  - AD-8
depends_on:
  - US-5.1
  - US-4.4
  - US-1.7
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Cán bộ Trung tâm chạy vòng phân bổ chính trên dữ liệu thật của đợt, xem dự thảo (tỷ lệ lấp đầy từng JD, SV chưa có đề cử, JD thiếu hồ sơ), điều chỉnh có ghi lý do rồi công bố. Khi công bố, HR nhận danh sách đề cử của JD mình và SV biết mình được đề cử vào đâu. Mỗi vòng lưu đủ snapshot để chạy lại ra đúng kết quả khi có khiếu nại, và hệ thống trả lời được câu hỏi "vì sao tôi không vào được A?". Sau story này, [US-5.3](US-5.3-hr-nomination-review.md) có danh sách đề cử để HR duyệt và [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) có sẵn luồng chạy vòng để dùng cho vòng bổ sung.

## Background

Story này hiện thực GĐ7 (UC-05, UC-34): sau khi hết hạn test và phúc khảo, Trung tâm khởi chạy vòng phân bổ; kết quả ở trạng thái **Dự thảo**; Trung tâm xem, điều chỉnh (đổi/thêm/bớt, bắt buộc ghi lý do, lưu nhật ký) rồi **công bố**. Nó phủ FR-26 (chạy phân bổ, dự thảo, kiểm tra ổn định, snapshot) và FR-27 (xem, điều chỉnh, công bố), cùng các quy tắc BR-07 (điều kiện đề cử), BR-08 (tối đa 1 hồ sơ đang chạy), BR-09 (không vượt sức chứa), BR-10 (điều chỉnh có lý do), BR-17 (tái hiện được). NFR-4 yêu cầu kết quả phân bổ trả lời được câu "vì sao tôi không vào được A?"; NFR-8 yêu cầu phân bổ < 1 phút.

Thuật toán đã có ở [US-5.1](US-5.1-allocation-engine-property-tests.md) (AD-7, [CONTEXT D7](../../CONTEXT.md)). Story này dựng đầu vào từ dữ liệu của các module khác, gọi engine, kiểm tra ổn định, lưu `allocation_rounds` và `nominations`. Theo ARCH › *Quản lý trạng thái* và AD-8 ([CONTEXT D8](../../CONTEXT.md)), mọi chuyển trạng thái đi qua `transitionTo` với audit trong cùng giao dịch và `row_version`; thao tác chạy phân bổ khóa dòng của đợt bằng `SELECT … FOR UPDATE`. ARCH › *Redis* thêm khóa `lock:allocation:{campaignId}` khi đang chạy. ARCH › *Các bảng chính* đặt partial unique index cho BR-08 ngay ở DB (AGENTS › Nguyên tắc bất biến 11).

Đầu vào đến từ nhiều module: NV có thứ tự (`matching`, [US-3.3](US-3.3-shortlist-and-preferences.md)), điều kiện cứng và S_cv (`matching`, [US-3.1](US-3.1-hard-filters-and-scv-formula.md), [US-3.2](US-3.2-batch-matching-agent.md)), S_test, S_final và thời điểm nộp bài (`assessment`, [US-4.4](US-4.4-grading-stest-sfinal.md)), GPA và mã SV (`student`), chỉ tiêu JD (`company`), tham số đợt (`campaign`, [US-1.4](US-1.4-campaign-setup-and-config.md)). Theo Nguyên tắc 13, `allocation` chỉ đọc qua service đã export, không truy vấn thẳng bảng của module khác. Story này chỉ làm vòng 1; vòng bổ sung (`round_no > 1`, sức chứa C_j(r)) thuộc US-5.5.

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** đợt ở trạng thái *Phân bổ & HR duyệt* (enum do US-1.4 định nghĩa), mọi NV đã có S_final và đợt chưa có vòng nào, **When** cán bộ Trung tâm gọi `POST /api/campaigns/{id}/allocation-rounds`, **Then** hệ thống tạo một dòng `allocation_rounds` với `round_no = 1`, `status = DRAFT`, `ran_at`, và một dòng `nominations` cho mỗi cặp engine chọn (có `s_final`, `rank` trong JD) **And** HR và SV chưa thấy các đề cử này cho đến khi vòng được công bố.
- [ ] **AC-2** — BR-07: chỉ cặp (SV, JD) đạt điều kiện cứng (`match_results.eligible`), có S_cv ≥ θ_cv và S_test ≥ θ_test (tính cả ngưỡng ghi đè ở cấp JD nếu có) mới vào `preferences` của engine. Cặp bị loại được ghi trong `input_snapshot` kèm mã lý do (`HARD_FILTER`, `BELOW_THETA_CV`, `BELOW_THETA_TEST`). Test sát ngưỡng: S_test = θ_test − 0,01 bị loại, S_test = θ_test được nhận.
- [ ] **AC-3** — BR-17: `input_snapshot` chứa NV hợp lệ theo thứ tự, rank key từng cặp (điểm đã ×100, GPA, thời điểm nộp bài, `student_code`, cờ hạ ưu tiên), cặp bị loại kèm lý do, sức chứa từng JD kèm các thành phần tính ra nó, và `model` + `prompt_version` của kết quả matching và chấm tự luận đã dùng. `config_snapshot` chứa θ_cv, θ_test, α, β, k, N_NV, chính sách Q4 và `VERSION` của hệ thống. Snapshot được serialize tất định (mảng đã sắp, khóa đã sắp) và không chứa tên, email hay dữ liệu PII khác. **When** gọi `replayRound(roundId)` chỉ từ snapshot, **Then** engine ra đúng danh sách đề cử đã sinh ở lần chạy gốc (trước điều chỉnh tay).
- [ ] **AC-4** — **Given** `checkStability` báo vi phạm (test thay engine bằng một bản lỗi qua DI), **When** chạy vòng, **Then** giao dịch rollback, không có dòng `allocation_rounds` hay `nominations` nào được ghi, API trả lỗi `ALLOCATION_UNSTABLE` kèm danh sách vi phạm, và lỗi được ghi log.
- [ ] **AC-5** — **Given** hai yêu cầu chạy phân bổ đồng thời cho cùng đợt, **When** cả hai tới server, **Then** một yêu cầu chạy, yêu cầu kia nhận `409 ALLOCATION_IN_PROGRESS` (khóa Redis `lock:allocation:{campaignId}` đặt bằng `SET NX` có TTL vài phút; dòng đợt bị khóa `SELECT … FOR UPDATE` qua service của `campaign`) **And** khóa Redis được nhả cả khi lần chạy lỗi.
- [ ] **AC-6** — Điều kiện chạy: đợt không ở *Phân bổ & HR duyệt* → `409`; vòng 1 đã `PUBLISHED` → `409`; còn NV chưa có S_test cuối (câu tự luận `needs_human` chưa chấm, phúc khảo đang mở) → `409` kèm danh sách mục còn treo. **Given** vòng 1 đang `DRAFT`, **When** chạy lại, **Then** dự thảo cũ bị thay (xóa đề cử dự thảo, ghi đè snapshot, cập nhật `ran_at`) và lần chạy lại được ghi `audit_logs` (đề xuất, xem Dev notes).
- [ ] **AC-7** — `GET /api/allocation-rounds/{id}` trả cho Trung tâm: theo từng JD gồm chỉ tiêu, sức chứa C_j, số đề cử, tỷ lệ lấp đầy; danh sách SV chưa có đề cử kèm lý do (AC-13); danh sách JD thiếu hồ sơ (số đề cử < C_j); các điều chỉnh tay đã làm; cảnh báo bất ổn định do điều chỉnh tay (AC-8).
- [ ] **AC-8** — BR-10: `PATCH /api/allocation-rounds/{id}/nominations` nhận danh sách thao tác `add` / `remove` / `move`, mỗi thao tác bắt buộc có `reason` không rỗng (thiếu → `400`). Mỗi thao tác lưu `override_reason` và ghi `audit_logs` (người làm, trước/sau, lý do) trong cùng giao dịch. Thao tác tạo cặp không đạt BR-07 hoặc làm JD vượt C_j (BR-09) bị từ chối `422` kèm mã lỗi (đề xuất, xem Dev notes). Sau khi điều chỉnh, hệ thống chạy lại `checkStability` trên kết quả đã sửa và hiển thị các cặp bất ổn định như cảnh báo, không chặn.
- [ ] **AC-9** — BR-08 ở tầng DB: migration tạo partial unique index `nominations(campaign_id, student_id) WHERE status IN ('NOMINATED','INTERVIEW','PASSED','RESERVE')`. **Given** SV đã có một đề cử đang chạy, **When** chèn thẳng dòng thứ hai qua Drizzle (bỏ qua service), **Then** DB báo unique violation **And** thao tác `add` qua API cho SV đó trả `409`.
- [ ] **AC-10** — **When** gọi `POST /api/allocation-rounds/{id}/publish`, **Then** trong một giao dịch: vòng chuyển `DRAFT → PUBLISHED` qua `transitionTo` và có `published_at`; NV của cặp được đề cử chuyển sang *Được đề cử*, các NV khác của SV đó sang *Chờ vòng sau* (qua service export của `matching`); audit được ghi **And** chỉ sau khi commit mới phát thông báo *Công bố đề cử* cho SV và HR từng JD (US-1.7). Lỗi giữa chừng thì rollback toàn bộ và không gửi thông báo nào. Công bố lần hai, hoặc điều chỉnh sau khi công bố, trả `409`.
- [ ] **AC-11** — **Given** hai cán bộ Trung tâm cùng mở một dự thảo, **When** người thứ hai gửi điều chỉnh hoặc công bố với `row_version` cũ, **Then** API trả `409 Conflict` và không ghi đè thay đổi của người thứ nhất.
- [ ] **AC-12** — Phân quyền: chạy, xem dự thảo, điều chỉnh, công bố và xem giải thích đầy đủ chỉ dành cho `CENTER` (`HR`, `STUDENT` → `403`). HR không đọc được đề cử của vòng `DRAFT`. `GET /api/me/allocation-results` (đề xuất) chỉ trả kết quả đã công bố của chính SV; không có tham số nào cho phép đọc kết quả của SV khác (test IDOR).
- [ ] **AC-13** — NFR-4: hàm thuần `explainOutcome(snapshot, result, studentId)` trả lý do cho từng NV xếp trên kết quả của SV (hoặc mọi NV nếu SV chưa có đề cử): `FULL_WITH_HIGHER_RANKED` (JD đã đủ C_j với SV xếp trên), `ZERO_CAPACITY`, `NOT_ELIGIBLE` (kèm lý do con ở AC-2), `DEMOTED` (BR-16), `MANUAL_ADJUSTMENT`. Trung tâm xem đầy đủ, kể cả điểm của SV so với người thấp nhất được giữ tại JD. SV chỉ thấy mã lý do diễn đạt bằng tiếng Việt và điểm của chính mình, không thấy điểm hay thứ hạng của người khác (PRD › Personas). Với ví dụ PRD, An hỏi về A nhận `FULL_WITH_HIGHER_RANKED`.
- [ ] **AC-14** — NFR-8: với dữ liệu seed 500 SV × 50 JD × 3 NV, thời gian từ lúc gửi yêu cầu chạy đến khi vòng `DRAFT` có đủ đề cử < 60 giây.
- [ ] **AC-15** — Giao diện: cổng Trung tâm có màn *Phân bổ* (nút chạy, bảng dự thảo bằng TanStack Table, hộp thoại điều chỉnh bắt buộc nhập lý do, hộp thoại xác nhận công bố, trạng thái đang chạy / lỗi / trống); cổng SV có màn *Đề cử* dùng tốt trên điện thoại (NFR-13), hiện nơi được đề cử hoặc "Đang chờ vòng sau" kèm lý do. Chuỗi giao diện tiếng Việt.

## Tasks

- [ ] **TASK-5.2.1** — Lược đồ, migration, bảng chuyển trạng thái (AC: 1, 9, 11)
  - [ ] Subtask 5.2.1.1 — Drizzle schema trong `apps/api/src/db/`: `allocation_rounds` và `nominations` theo ARCH › *Các bảng chính*, thêm cột `row_version` cho cả hai (ARCH chưa liệt kê, cần cho AD-8).
  - [ ] Subtask 5.2.1.2 — Migration trong `apps/api/drizzle/`: `unique(campaign_id, round_no)`; partial unique index BR-08.
  - [ ] Subtask 5.2.1.3 — `packages/shared/states/allocation-round.ts` (`DRAFT → PUBLISHED`) và `packages/shared/states/nomination.ts` (toàn bộ vòng đời đề cử, xem Dev notes); unit test bảng chuyển bằng helper của US-1.2.
- [ ] **TASK-5.2.2** — Hàm thuần dựng đầu vào, snapshot và giải thích (AC: 2, 3, 13)
  - [ ] Subtask 5.2.2.1 — `apps/api/src/modules/allocation/domain/eligibility.ts`: `filterEligible()` áp BR-07, trả cặp hợp lệ và cặp bị loại kèm lý do.
  - [ ] Subtask 5.2.2.2 — `allocation/domain/snapshot.ts`: `buildInputSnapshot()`, `buildConfigSnapshot()`, `snapshotToEngineInput()`; serialize tất định.
  - [ ] Subtask 5.2.2.3 — `allocation/domain/explain.ts`: `explainOutcome()`; bản cho SV lọc bỏ mọi số liệu của người khác.
- [ ] **TASK-5.2.3** — Service chạy vòng (AC: 1, 4, 5, 6, 14)
  - [ ] Subtask 5.2.3.1 — `allocation/application/allocation-round.service.ts`: `run(campaignId, actor)` — đặt khóa Redis (ioredis) → mở giao dịch → khóa dòng đợt qua `campaign` → lấy dữ liệu qua service export của `matching`, `assessment`, `student`, `company`, `campaign` → `filterEligible` → engine → `checkStability` → ghi vòng và đề cử → nhả khóa trong `finally`.
  - [ ] Subtask 5.2.3.2 — `replayRound(roundId)` dựng lại đầu vào từ snapshot và so với kết quả gốc.
  - [ ] Subtask 5.2.3.3 — `allocation/infrastructure/allocation-round.repository.ts` (Drizzle).
- [ ] **TASK-5.2.4** — Điều chỉnh tay và công bố (AC: 8, 10, 11)
  - [ ] Subtask 5.2.4.1 — `adjust(roundId, ops, actor)`: kiểm tra BR-07, BR-08, BR-09; lưu `override_reason`; audit trong cùng giao dịch; chạy lại `checkStability` để lấy cảnh báo.
  - [ ] Subtask 5.2.4.2 — `publish(roundId, actor)`: `transitionTo` cho vòng; cập nhật trạng thái NV qua service của `matching`; phát sự kiện `allocation.round.published` bằng `@nestjs/event-emitter` sau commit để `notification` gửi thông báo.
- [ ] **TASK-5.2.5** — API, schema và phân quyền (AC: 7, 12, 13)
  - [ ] Subtask 5.2.5.1 — `allocation/api/allocation-round.controller.ts`: `POST /api/campaigns/{id}/allocation-rounds`, `GET /api/allocation-rounds/{id}`, `PATCH /api/allocation-rounds/{id}/nominations`, `POST /api/allocation-rounds/{id}/publish` (theo ARCH › API architecture); `GET /api/allocation-rounds/{id}/students/{studentId}/explanation` và `GET /api/me/allocation-results` (hai route sau là đề xuất).
  - [ ] Subtask 5.2.5.2 — Zod schema request/response trong `packages/shared/schemas/allocation.ts`; guard `@Roles('CENTER')` và kiểm tra cấp bản ghi cho route của SV.
- [ ] **TASK-5.2.6** — Giao diện (AC: 15)
  - [ ] Subtask 5.2.6.1 — Đọc `DESIGN.md` trước khi code; ghi `Design applied: …` vào story.
  - [ ] Subtask 5.2.6.2 — `apps/web/src/features/center/allocation/`: màn chạy, dự thảo, điều chỉnh, công bố.
  - [ ] Subtask 5.2.6.3 — `apps/web/src/features/student/nominations/`: màn *Đề cử* cho điện thoại.
- [ ] **TASK-5.2.7** — Kiểm thử tích hợp và hiệu năng (AC: 1–14)
  - [ ] Subtask 5.2.7.1 — `apps/api/test/allocation/allocation-round.e2e-spec.ts` (testcontainers PostgreSQL + Redis): chạy, snapshot và replay, BR-07, BR-08 ở DB, khóa đồng thời, rollback khi công bố lỗi, `409`, IDOR.
  - [ ] Subtask 5.2.7.2 — `apps/api/test/allocation/allocation-round.perf.e2e-spec.ts`: 500 SV × 50 JD × 3 NV.
  - [ ] Subtask 5.2.7.3 — Dùng `arbAllocationInput` của US-5.1 sinh dữ liệu seed, chạy qua service và kiểm tra BR-08, BR-09 vẫn đúng sau khi ghi DB.

## Dev notes

### Architecture constraints

- [AD-7](../../ARCHITECTURE.md#architecture-decisions): service gọi engine của US-5.1, không viết lại thuật toán hay quy tắc phá hòa, và gọi `checkStability` sau mỗi lần chạy. Không dùng LLM ở bất kỳ bước nào của vòng phân bổ (AGENTS › Nguyên tắc 2).
- [AD-8](../../ARCHITECTURE.md#architecture-decisions): chuyển trạng thái vòng và đề cử qua `transitionTo(newState, actor, reason)` của US-1.2, audit trong cùng giao dịch, `409` khi lệch `row_version`. ARCH › *Các bảng chính* chưa có cột `row_version` ở `allocation_rounds` và `nominations`; story thêm cột này để thực hiện AD-8.
- AGENTS › Nguyên tắc 11: BR-08 phải có partial unique index, không chỉ kiểm tra trong service.
- AGENTS › Nguyên tắc 13: `allocation` không truy vấn `preferences`, `match_results`, `exam_sessions`, `exam_answers`, `students`, `job_descriptions`, `campaigns`. Mọi dữ liệu lấy qua service đã export của module sở hữu.
- **Module sở hữu bảng `nominations` (cần chốt).** ARCH › *Các module* xếp "Đề cử" vào module `review`, còn EPIC-5 đặt việc tạo `nominations` ở story này. Tạm theo ARCH: `review` sở hữu `nominations` và export `NominationService` (story này tạo service đó với các hàm tạo, sửa, đếm đề cử); `allocation` sở hữu `allocation_rounds` và chỉ gọi `NominationService`. Hỏi trước khi chốt.
- **Trạng thái đề cử khi còn dự thảo (đề xuất).** Dòng `nominations` của vòng `DRAFT` mang trạng thái `NOMINATED`, nên partial unique index BR-08 có hiệu lực ngay từ dự thảo. HR và SV chỉ thấy đề cử khi `allocation_rounds.status = PUBLISHED`. Phương án thêm trạng thái `DRAFT` cho đề cử bị loại vì khi đó BR-08 chỉ được DB bảo vệ từ lúc công bố.
- **Enum vòng đời đề cử (đề xuất)**, định nghĩa một lần ở `packages/shared/states/nomination.ts` để US-5.3, US-5.4, US-5.5 không phải sửa chung file: `NOMINATED` (Được đề cử), `INTERVIEW` (Mời phỏng vấn), `PASSED` (Đạt phỏng vấn), `RESERVE` (Dự bị), `HR_REJECTED` (HR từ chối), `INTERVIEW_FAILED` (Không đạt phỏng vấn, kể cả Vắng), `ACCEPTED` (Đã nhận thực tập), `DECLINED` / `EXPIRED` (SV từ chối / quá hạn), `CLOSED` (Đóng). Bốn giá trị đầu lấy đúng từ ARCH (BR-08); các giá trị còn lại ánh xạ từ PRD › *Vòng đời trạng thái › Hồ sơ ứng tuyển*. Enum trạng thái vòng: `DRAFT`, `PUBLISHED` (PRD: dự thảo/công bố).
- **Chạy lại dự thảo (đề xuất).** `unique(campaign_id, round_no)` buộc lần chạy lại khi vòng còn `DRAFT` phải ghi đè dòng cũ chứ không tạo dòng mới. Mỗi lần chạy lại ghi `audit_logs`. Hỏi trước khi chốt.
- **Phiên bản model và prompt (BR-17).** `allocation_rounds` không có cột riêng cho phiên bản model/prompt. Story tạm lưu chúng trong `input_snapshot`, theo từng cặp. Đề xuất, hỏi trước khi chốt.
- **Điều chỉnh tay và BR-07, BR-09 (đề xuất).** GĐ7 cho Trung tâm "đổi/thêm/bớt", nhưng BR-07 và BR-09 là quy tắc tuyệt đối. Story tạm chặn thao tác vi phạm hai quy tắc này (`422`); muốn thêm người vào JD đã đủ C_j thì phải bớt người trước. Hỏi trước khi chốt.
- **NFR-4 và quyền riêng tư.** PRD › Personas: SV không thấy điểm hay thứ hạng của người khác. Vì vậy bản giải thích cho SV không có điểm thấp nhất được giữ tại JD; chỉ có mã lý do và điểm của chính SV.
- Chạm Q3 (hệ số đề cử k): tạm dùng Đề xuất k = 1,5, đưa thành tham số `campaigns.config.k`; hỏi trước khi chốt. Ở vòng 1, `C_j = ⌈chỉ tiêu_j × k⌉`, tính bằng `computeCapacity` với `accepted = 0`, `inProcess = 0`. Tên khóa `campaigns.config` theo schema của US-1.4.

### Cross-story dependencies

- Builds on [US-5.1](US-5.1-allocation-engine-property-tests.md) — `deferredAcceptance`, `checkStability`, `buildCompareAt`, `computeCapacity`, `toCentiScore`, `arbAllocationInput` từ `apps/api/src/modules/allocation/domain/`.
- Builds on [US-4.4](US-4.4-grading-stest-sfinal.md) — S_test, S_final, `exam_sessions.submitted_at`, `model` + `prompt_version` của Grader, qua service export của `assessment`.
- Builds on [US-1.7](US-1.7-notifications-sse-email-reminders.md) — service thông báo (outbox email, SSE) cho sự kiện *Công bố đề cử*.
- Builds on [US-1.2](US-1.2-core-db-schema-transition-audit-log.md) — `transitionTo`, `audit_logs`, helper test bảng chuyển.
- Builds on [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md) — `@Roles()`, helper đăng nhập theo vai trò cho test IDOR.
- Builds on [US-1.4](US-1.4-campaign-setup-and-config.md) — trạng thái đợt, `campaigns.config`, hàm khóa dòng đợt export từ `campaign`.
- Builds on [US-3.3](US-3.3-shortlist-and-preferences.md) — `preferences` có thứ tự và bảng chuyển trạng thái hồ sơ ứng tuyển trong `packages/shared/states`.
- Builds on [US-3.1](US-3.1-hard-filters-and-scv-formula.md), [US-3.2](US-3.2-batch-matching-agent.md) — `match_results.eligible`, `s_cv`, `model`, `prompt_version`.
- Builds on [US-4.5](US-4.5-manual-essay-grading.md), [US-4.6](US-4.6-appeals-and-question-error-reports.md) — trạng thái chấm tay và phúc khảo để kiểm tra điều kiện chạy (AC-6).
- Required by [US-5.3](US-5.3-hr-nomination-review.md) — đề cử đã công bố, `NominationService`, enum `nomination` trong `packages/shared/states`.
- Required by [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) — `AllocationRoundService.run` mở rộng cho `round_no > 1`.
- Required by [US-6.1](US-6.1-campaign-dashboard.md) — tỷ lệ lấp đầy, số đề cử theo JD.
- Required by [US-6.6](US-6.6-demo-data-e2e-load-test.md) — E2E luồng chính đi qua chạy và công bố phân bổ.
- Sibling [US-5.3](US-5.3-hr-nomination-review.md) — cùng tuần T11, làn A, cùng chạm `review` và `packages/shared/states/nomination.ts`. US-5.2 merge trước; US-5.3 rebase sau.

### Performance budget

- Cả vòng phân bổ (đọc dữ liệu, lọc, engine, kiểm tra ổn định, ghi DB) < 1 phút cho cả đợt (NFR-8). Phần engine < 1 giây đã đo ở US-5.1.
- Đo bằng `apps/api/test/allocation/allocation-round.perf.e2e-spec.ts` với seed 500 SV × 50 JD × 3 NV (quy mô của NFR-7).
- Mô tả PR phải ghi rõ số đo.

### What we explicitly did NOT do

- Không làm vòng bổ sung và C_j(r) với r > 1. Thuộc US-5.5.
- Không làm HR duyệt, phỏng vấn, lời mời. Thuộc US-5.3, US-5.4.
- Không chạy phân bổ bằng job nền. Engine đủ nhanh nên yêu cầu chạy đồng bộ. Làm lại khi test hiệu năng vượt 1 phút.
- Không có màn "khiếu nại" riêng gọi `replayRound`. Hàm có sẵn và được test; thêm route khi Trung tâm cần.
- Không tự công bố. Trung tâm luôn bấm công bố (BR-13, PRD › Nguyên tắc cốt lõi 1).

### References

- [Source: PRD › GĐ7 – Phân bổ](../../PRD.md)
- [Source: PRD › Thuật toán phân bổ](../../PRD.md)
- [Source: PRD › Vòng đời trạng thái › Hồ sơ ứng tuyển](../../PRD.md)
- [Source: PRD › Quy tắc nghiệp vụ (BR-07, BR-08, BR-09, BR-10, BR-17)](../../PRD.md)
- [Source: PRD › Thông báo; Personas](../../PRD.md)
- [Source: PRD FR-26, FR-27, NFR-4, NFR-8](../../PRD.md#functional-requirements)
- [Source: ARCHITECTURE › Các module; Quản lý trạng thái; Allocation Engine](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Data architecture (Các bảng chính, Redis)](../../ARCHITECTURE.md#data-architecture)
- [Source: ARCHITECTURE › API architecture](../../ARCHITECTURE.md#api-architecture)
- [Source: ARCHITECTURE › Security architecture](../../ARCHITECTURE.md#security-architecture)
- [Source: CONTEXT D7, D8, D20](../../CONTEXT.md)
- [Source: EPIC-5](../epics/EPIC-5.md)
- [LESSONS](../../LESSONS.md) — đọc lại khi bắt đầu story và ghi `Lessons applied:`.

## Verification commands

> Chưa có `package.json`. Lệnh chạy cụ thể điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case; đường dẫn test là đề xuất, theo quy ước test của US-1.1.

| AC | Command |
|---|---|
| AC-1 | `apps/api/test/allocation/allocation-round.e2e-spec.ts` › `GĐ7 run creates DRAFT round hidden from HR and students` |
| AC-2 | `apps/api/src/modules/allocation/domain/__tests__/eligibility.spec.ts` › `BR-07 excludes hard-filter, below θ_cv, below θ_test (boundary)` |
| AC-3 | `allocation/domain/__tests__/snapshot.spec.ts` › `BR-17 snapshot is deterministic and PII-free`; `allocation-round.e2e-spec.ts` › `BR-17 replayRound reproduces engine output` |
| AC-4 | `allocation-round.e2e-spec.ts` › `GĐ7 unstable result is rolled back` |
| AC-5 | `allocation-round.e2e-spec.ts` › `GĐ7 concurrent runs: one 409, lock released on failure` |
| AC-6 | `allocation-round.e2e-spec.ts` › `GĐ7 preconditions: wrong phase, already published, pending grading → 409`, `GĐ7 rerun replaces draft and is audited` |
| AC-7 | `allocation-round.e2e-spec.ts` › `GĐ7 draft view shows fill rate, unassigned students, short JDs` |
| AC-8 | `allocation-round.e2e-spec.ts` › `BR-10 adjustment requires reason and writes audit in same transaction`, `BR-07/BR-09 adjustment violations → 422` |
| AC-9 | `allocation-round.e2e-spec.ts` › `BR-08 partial unique index rejects second active nomination at DB level` |
| AC-10 | `allocation-round.e2e-spec.ts` › `GĐ7 publish transitions round and preferences, notifies after commit`, `GĐ7 publish failure rolls back without notifications` |
| AC-11 | `allocation-round.e2e-spec.ts` › `AD-8 stale row_version → 409` |
| AC-12 | `allocation-round.e2e-spec.ts` › `RBAC: only CENTER runs/adjusts/publishes`, `IDOR: student reads only own allocation results` |
| AC-13 | `allocation/domain/__tests__/explain.spec.ts` › `NFR-4 PRD example: An is told A was full with higher-ranked students`, `NFR-4 student view hides other students' scores` |
| AC-14 | `apps/api/test/allocation/allocation-round.perf.e2e-spec.ts` › `NFR-8 full round for 500 students × 50 JDs under 60s` |
| AC-15 | Review giao diện theo `DESIGN.md` và quy tắc skill shadcn; ảnh chụp màn hình desktop (Trung tâm) và điện thoại (SV) đính kèm PR |

## Changelog entry

### Added
- Vòng phân bổ (module `allocation`): chạy Deferred Acceptance trên dữ liệu thật của đợt, lọc theo BR-07, kiểm tra ổn định, lưu `input_snapshot` và `config_snapshot` tái hiện được; dự thảo, điều chỉnh tay bắt buộc lý do và có nhật ký, công bố kèm thông báo cho SV và HR.
- Bảng `allocation_rounds`, `nominations`; partial unique index bảo đảm BR-08 ở tầng DB; bảng chuyển trạng thái vòng phân bổ và đề cử trong `packages/shared/states`.
- Giải thích kết quả phân bổ ("vì sao tôi không vào được A?") cho Trung tâm và cho SV, không lộ điểm của người khác.
- Màn *Phân bổ* cho Trung tâm và màn *Đề cử* cho SV.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-26, FR-27, NFR-4, NFR-8](../../PRD.md#functional-requirements)
- [ARCHITECTURE AD-7, AD-8](../../ARCHITECTURE.md#architecture-decisions)
- [Epic EPIC-5](../epics/EPIC-5.md)
- [CONTEXT D7, D8](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
- [US-5.1](US-5.1-allocation-engine-property-tests.md) · [US-5.3](US-5.3-hr-nomination-review.md) · [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md)
