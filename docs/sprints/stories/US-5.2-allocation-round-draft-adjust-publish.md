---
id: US-5.2
title: "Vòng phân bổ: dự thảo, điều chỉnh, công bố"
epic: EPIC-5
status: review
priority: P0
points: 8
sprint: sprint-2026-W47
version_shipped: 0.33.0
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
assignee: PDTnhah
commit:
created: 2026-10-07
updated: 2026-11-24
---

## Goal

Cán bộ Trung tâm chạy vòng phân bổ chính trên dữ liệu thật của đợt, xem dự thảo (tỷ lệ lấp đầy từng JD, SV chưa có đề cử, JD thiếu hồ sơ), điều chỉnh có ghi lý do rồi công bố. Khi công bố, HR nhận danh sách đề cử của JD mình và SV biết mình được đề cử vào đâu. Mỗi vòng lưu đủ snapshot để chạy lại ra đúng kết quả khi có khiếu nại, và hệ thống trả lời được câu hỏi "vì sao tôi không vào được A?". Sau story này, [US-5.3](US-5.3-hr-nomination-review.md) có danh sách đề cử để HR duyệt và [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) có sẵn luồng chạy vòng để dùng cho vòng bổ sung.

## Background

Story này hiện thực GĐ7 (UC-05, UC-34): sau khi hết hạn test và phúc khảo, Trung tâm khởi chạy vòng phân bổ; kết quả ở trạng thái **Dự thảo**; Trung tâm xem, điều chỉnh (đổi/thêm/bớt, bắt buộc ghi lý do, lưu nhật ký) rồi **công bố**. Nó phủ FR-26 (chạy phân bổ, dự thảo, kiểm tra ổn định, snapshot) và FR-27 (xem, điều chỉnh, công bố), cùng các quy tắc BR-07 (điều kiện đề cử), BR-08 (tối đa 1 hồ sơ đang chạy), BR-09 (không vượt sức chứa), BR-10 (điều chỉnh có lý do), BR-17 (tái hiện được). NFR-4 yêu cầu kết quả phân bổ trả lời được câu "vì sao tôi không vào được A?"; NFR-8 yêu cầu phân bổ < 1 phút.

Thuật toán đã có ở [US-5.1](US-5.1-allocation-engine-property-tests.md) (AD-7, [CONTEXT D7](../../CONTEXT.md)). Story này dựng đầu vào từ dữ liệu của các module khác, gọi engine, kiểm tra ổn định, lưu `allocation_rounds` và `nominations`. Theo ARCH › *Quản lý trạng thái* và AD-8 ([CONTEXT D8](../../CONTEXT.md)), mọi chuyển trạng thái đi qua `transitionTo` với audit trong cùng giao dịch và `row_version`; thao tác chạy phân bổ khóa dòng của đợt bằng `SELECT … FOR UPDATE`. ARCH › *Redis* thêm khóa `lock:allocation:{campaignId}` khi đang chạy. ARCH › *Các bảng chính* đặt partial unique index cho BR-08 ngay ở DB (AGENTS › Nguyên tắc bất biến 11).

Đầu vào đến từ nhiều module: NV có thứ tự (`matching`, [US-3.3](US-3.3-shortlist-and-preferences.md)), điều kiện cứng và S_cv (`matching`, [US-3.1](US-3.1-hard-filters-and-scv-formula.md), [US-3.2](US-3.2-batch-matching-agent.md)), S_test, S_final và thời điểm nộp bài (`assessment`, [US-4.4](US-4.4-grading-stest-sfinal.md)), GPA và mã SV (`student`), chỉ tiêu JD (`company`), tham số đợt (`campaign`, [US-1.4](US-1.4-campaign-setup-and-config.md)). Theo Nguyên tắc 13, `allocation` chỉ đọc qua service đã export, không truy vấn thẳng bảng của module khác. Story này chỉ làm vòng 1; vòng bổ sung (`round_no > 1`, sức chứa C_j(r)) thuộc US-5.5.

**Lessons applied**: §6 (một migration, sinh sau khi rebase), §12 (khóa dòng bằng câu không join), §22 (test chỉ đọc thông báo và dữ liệu của chính mình), §30 (thêm bảng `core` vào `CORE_TABLES`), §38 (đọc NV, bài test trong giao dịch dưới khóa đợt), §43 (mọi UPDATE tăng `row_version`), §44 (dựng response trong giao dịch, việc sau commit không ném), §47 (đổi file đã sửa về LF trước khi commit).

## Acceptance criteria

- [x] **AC-1** — **Given** đợt ở trạng thái *Phân bổ & HR duyệt* (enum do US-1.4 định nghĩa), mọi NV đã có S_final và đợt chưa có vòng nào, **When** cán bộ Trung tâm gọi `POST /api/campaigns/{id}/allocation-rounds`, **Then** hệ thống tạo một dòng `allocation_rounds` với `round_no = 1`, `status = DRAFT`, `ran_at`, và một dòng `nominations` cho mỗi cặp engine chọn (có `s_final`, `rank` trong JD) **And** HR và SV chưa thấy các đề cử này cho đến khi vòng được công bố.
- [x] **AC-2** — BR-07: chỉ cặp (SV, JD) đạt điều kiện cứng (`match_results.eligible`), có S_cv ≥ θ_cv và S_test ≥ θ_test (tính cả ngưỡng ghi đè ở cấp JD nếu có) mới vào `preferences` của engine. Cặp bị loại được ghi trong `input_snapshot` kèm mã lý do (`HARD_FILTER`, `BELOW_THETA_CV`, `BELOW_THETA_TEST`). Test sát ngưỡng: S_test = θ_test − 0,01 bị loại, S_test = θ_test được nhận.
- [x] **AC-3** — BR-17: `input_snapshot` chứa NV hợp lệ theo thứ tự, rank key từng cặp (điểm đã ×100, GPA, thời điểm nộp bài, `student_code`, cờ hạ ưu tiên), cặp bị loại kèm lý do, sức chứa từng JD kèm các thành phần tính ra nó, và `model` + `prompt_version` của kết quả matching và chấm tự luận đã dùng. `config_snapshot` chứa θ_cv, θ_test, α, β, k, N_NV, chính sách Q4 và `VERSION` của hệ thống. Snapshot được serialize tất định (mảng đã sắp, khóa đã sắp) và không chứa tên, email hay dữ liệu PII khác. **When** gọi `replayRound(roundId)` chỉ từ snapshot, **Then** engine ra đúng danh sách đề cử đã sinh ở lần chạy gốc (trước điều chỉnh tay).
- [x] **AC-4** — **Given** `checkStability` báo vi phạm (test thay engine bằng một bản lỗi qua DI), **When** chạy vòng, **Then** giao dịch rollback, không có dòng `allocation_rounds` hay `nominations` nào được ghi, API trả lỗi `ALLOCATION_UNSTABLE` kèm danh sách vi phạm, và lỗi được ghi log.
- [x] **AC-5** — **Given** hai yêu cầu chạy phân bổ đồng thời cho cùng đợt, **When** cả hai tới server, **Then** một yêu cầu chạy, yêu cầu kia nhận `409 ALLOCATION_IN_PROGRESS` (khóa Redis `lock:allocation:{campaignId}` đặt bằng `SET NX` có TTL vài phút; dòng đợt bị khóa `SELECT … FOR UPDATE` qua service của `campaign`) **And** khóa Redis được nhả cả khi lần chạy lỗi.
- [x] **AC-6** — Điều kiện chạy: đợt không ở *Phân bổ & HR duyệt* → `409`; vòng 1 đã `PUBLISHED` → `409`; còn NV chưa có S_test cuối (câu tự luận `needs_human` chưa chấm, phúc khảo đang mở) → `409` kèm danh sách mục còn treo. **Given** vòng 1 đang `DRAFT`, **When** chạy lại, **Then** dự thảo cũ bị thay (xóa đề cử dự thảo, ghi đè snapshot, cập nhật `ran_at`) và lần chạy lại được ghi `audit_logs` (đề xuất, xem Dev notes).
- [x] **AC-7** — `GET /api/allocation-rounds/{id}` trả cho Trung tâm: theo từng JD gồm chỉ tiêu, sức chứa C_j, số đề cử, tỷ lệ lấp đầy; danh sách SV chưa có đề cử kèm lý do (AC-13); danh sách JD thiếu hồ sơ (số đề cử < C_j); các điều chỉnh tay đã làm; cảnh báo bất ổn định do điều chỉnh tay (AC-8).
- [x] **AC-8** — BR-10: `PATCH /api/allocation-rounds/{id}/nominations` nhận danh sách thao tác `add` / `remove` / `move`, mỗi thao tác bắt buộc có `reason` không rỗng (thiếu → `400`). Mỗi thao tác lưu `override_reason` và ghi `audit_logs` (người làm, trước/sau, lý do) trong cùng giao dịch. Thao tác tạo cặp không đạt BR-07 hoặc làm JD vượt C_j (BR-09) bị từ chối `422` kèm mã lỗi (đề xuất, xem Dev notes). Sau khi điều chỉnh, hệ thống chạy lại `checkStability` trên kết quả đã sửa và hiển thị các cặp bất ổn định như cảnh báo, không chặn.
- [x] **AC-9** — BR-08 ở tầng DB: migration tạo partial unique index `nominations(campaign_id, student_id) WHERE status IN ('NOMINATED','INTERVIEW','PASSED','RESERVE')`. **Given** SV đã có một đề cử đang chạy, **When** chèn thẳng dòng thứ hai qua Drizzle (bỏ qua service), **Then** DB báo unique violation **And** thao tác `add` qua API cho SV đó trả `409`.
- [x] **AC-10** — **When** gọi `POST /api/allocation-rounds/{id}/publish`, **Then** trong một giao dịch: vòng chuyển `DRAFT → PUBLISHED` qua `transitionTo` và có `published_at`; NV của cặp được đề cử chuyển sang *Được đề cử*, các NV khác của SV đó sang *Chờ vòng sau* (qua service export của `matching`); audit được ghi **And** chỉ sau khi commit mới phát thông báo *Công bố đề cử* cho SV và HR từng JD (US-1.7). Lỗi giữa chừng thì rollback toàn bộ và không gửi thông báo nào. Công bố lần hai, hoặc điều chỉnh sau khi công bố, trả `409`.
- [x] **AC-11** — **Given** hai cán bộ Trung tâm cùng mở một dự thảo, **When** người thứ hai gửi điều chỉnh hoặc công bố với `row_version` cũ, **Then** API trả `409 Conflict` và không ghi đè thay đổi của người thứ nhất.
- [x] **AC-12** — Phân quyền: chạy, xem dự thảo, điều chỉnh, công bố và xem giải thích đầy đủ chỉ dành cho `CENTER` (`HR`, `STUDENT` → `403`). HR không đọc được đề cử của vòng `DRAFT`. `GET /api/me/allocation-results` (đề xuất) chỉ trả kết quả đã công bố của chính SV; không có tham số nào cho phép đọc kết quả của SV khác (test IDOR).
- [x] **AC-13** — NFR-4: hàm thuần `explainOutcome(snapshot, result, studentId)` trả lý do cho từng NV xếp trên kết quả của SV (hoặc mọi NV nếu SV chưa có đề cử): `FULL_WITH_HIGHER_RANKED` (JD đã đủ C_j với SV xếp trên), `ZERO_CAPACITY`, `NOT_ELIGIBLE` (kèm lý do con ở AC-2), `DEMOTED` (BR-16), `MANUAL_ADJUSTMENT`. Trung tâm xem đầy đủ, kể cả điểm của SV so với người thấp nhất được giữ tại JD. SV chỉ thấy mã lý do diễn đạt bằng tiếng Việt và điểm của chính mình, không thấy điểm hay thứ hạng của người khác (PRD › Personas). Với ví dụ PRD, An hỏi về A nhận `FULL_WITH_HIGHER_RANKED`.
- [x] **AC-14** — NFR-8: với dữ liệu seed 500 SV × 50 JD × 3 NV, thời gian từ lúc gửi yêu cầu chạy đến khi vòng `DRAFT` có đủ đề cử < 60 giây.
- [ ] **AC-15** — Giao diện: cổng Trung tâm có màn *Phân bổ* (nút chạy, bảng dự thảo bằng TanStack Table, hộp thoại điều chỉnh bắt buộc nhập lý do, hộp thoại xác nhận công bố, trạng thái đang chạy / lỗi / trống); cổng SV có màn *Đề cử* dùng tốt trên điện thoại (NFR-13), hiện nơi được đề cử hoặc "Đang chờ vòng sau" kèm lý do. Chuỗi giao diện tiếng Việt.

## Tasks

- [x] **TASK-5.2.1** — Lược đồ, migration, bảng chuyển trạng thái (AC: 1, 9, 11)
  - [x] Subtask 5.2.1.1 — `apps/api/src/db/schema/allocation.ts`: `allocation_rounds`, `nominations` có `row_version`.
  - [x] Subtask 5.2.1.2 — Migration `0047_allocation_rounds`: `unique(campaign_id, round_no)`, partial unique BR-08.
  - [x] Subtask 5.2.1.3 — `packages/shared/states/allocation-round.ts`, `nomination.ts`; unit test bảng chuyển.
- [x] **TASK-5.2.2** — Hàm thuần dựng đầu vào, snapshot và giải thích (AC: 2, 3, 13)
  - [x] Subtask 5.2.2.1 — `allocation/domain/eligibility.ts`: `filterEligible()`.
  - [x] Subtask 5.2.2.2 — `allocation/domain/snapshot.ts`: `buildInputSnapshot()`, `buildConfigSnapshot()`, `snapshotToEngineInput()`, `canonicalJson()`.
  - [x] Subtask 5.2.2.3 — `allocation/domain/explain.ts`: `explainOutcome()`, `studentOutcome()`.
- [x] **TASK-5.2.3** — Service chạy vòng (AC: 1, 4, 5, 6, 14)
  - [x] Subtask 5.2.3.1 — `allocation/application/allocation-round.service.ts` › `run`.
  - [x] Subtask 5.2.3.2 — `replayRound(roundId)`.
  - [x] Subtask 5.2.3.3 — `allocation/infrastructure/allocation-round.repository.ts`.
- [x] **TASK-5.2.4** — Điều chỉnh tay và công bố (AC: 8, 10, 11)
  - [x] Subtask 5.2.4.1 — `adjust(roundId, request, actor)`.
  - [x] Subtask 5.2.4.2 — `publish(roundId, request, actor)`: thông báo ghi trong giao dịch, đẩy SSE sau commit (xem Implementation notes).
- [x] **TASK-5.2.5** — API, schema và phân quyền (AC: 7, 12, 13)
  - [x] Subtask 5.2.5.1 — `allocation/api/`: sáu route của story và `GET /api/campaigns/{id}/allocation-rounds`.
  - [x] Subtask 5.2.5.2 — `packages/shared/schemas/allocation.ts`; `@Roles('CENTER')`; route của SV không có tham số.
- [x] **TASK-5.2.6** — Giao diện (AC: 15)
  - [x] Subtask 5.2.6.1 — Đọc `DESIGN.md`; ghi `Design applied`.
  - [x] Subtask 5.2.6.2 — `apps/web/src/features/center/allocation/` (`/admin/allocation`).
  - [x] Subtask 5.2.6.3 — `apps/web/src/features/student/results/` (`/sv/results`, mục *Kết quả* sẵn có của thanh dưới).
  - [ ] Subtask 5.2.6.4 — Người dùng kiểm tay: Trung tâm ở 1024 px, SV ở 360 px.
- [x] **TASK-5.2.7** — Kiểm thử tích hợp và hiệu năng (AC: 1–14)
  - [x] Subtask 5.2.7.1 — `apps/api/test/integration/allocation-round.int-spec.ts`.
  - [x] Subtask 5.2.7.2 — Ca NFR-8 nằm trong cùng file (AGENTS › Kiểm thử: thêm ca vào file của module).
  - [x] Subtask 5.2.7.3 — Bỏ: property test của US-5.1 đã giữ BR-08, BR-09 cho engine; integration test kiểm hai quy tắc sau khi ghi DB.

## Dev notes

### Architecture constraints

- AD-7: service gọi engine và `checkStability` của US-5.1; không dùng LLM (AGENTS › Nguyên tắc 2).
- AD-8: vòng chuyển trạng thái qua `transitionTo`; `409` khi lệch `row_version` (hai bảng có cột này, ARCH đã cập nhật).
- Nguyên tắc 11: BR-08 là partial unique index `nominations_active_student_key`.
- Nguyên tắc 13: `allocation` đọc NV, bài test, SV, JD, tài khoản qua service export (`PreferenceAllocationService`, `AllocationResultsService`, `StudentService.allocationRecords`, `JdService.listAllocationJds`, `UserDirectory`).
- Các điểm "cần chốt" và "đề xuất" của bản story đầu đã chốt ở [CONTEXT D64](../../CONTEXT.md). Q3 (k) vẫn theo đề xuất 1,5, đọc từ `campaigns.config.k`.
- NFR-4 và quyền riêng tư: bản giải thích cho SV chỉ có mã lý do và điểm của chính SV.

### Cross-story dependencies

- Builds on US-5.1 (engine), US-4.4 (S_test, S_final, Grader), US-3.3 (vòng đời hồ sơ ứng tuyển), US-1.7 (thông báo), US-1.4 (tham số đợt).
- Required by [US-5.3](US-5.3-hr-nomination-review.md): đọc và chuyển trạng thái đề cử qua service của `allocation` (D64), không phải `review`; thêm *Story refresh* khi bắt đầu.
- Required by [US-4.6](US-4.6-appeals-and-question-error-reports.md): khi thay `THRESHOLD_HOLDS`, điều kiện chạy (AC-6) tự chặn lúc phúc khảo còn mở.
- Required by [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md): `run` hiện chỉ làm vòng 1 (`ROUND_NO`), `demoted: false`, `accepted` và `inProcess` bằng 0.

### Performance budget

- NFR-8 < 60 giây cho cả vòng. Đo ngày 2026-11-24: 500 SV × 50 JD × 3 NV, `POST …/allocation-rounds` 1 311 ms (testcontainers, máy dev).

### What we explicitly did NOT do

- Không làm vòng bổ sung, C_j(r) với r > 1, BR-16 (US-5.5, US-5.4).
- Không làm HR duyệt, phỏng vấn, lời mời (US-5.3, US-5.4).
- Không chạy phân bổ bằng job nền; không có route khiếu nại gọi `replayRound`.
- Không phát sự kiện `allocation.round.published`: thông báo ghi thẳng trong giao dịch công bố. Story sau cần thì thêm sự kiện sau commit.

### References

- PRD › GĐ7, *Thuật toán phân bổ*, *Vòng đời trạng thái*, BR-07…BR-10, BR-17, *Thông báo*, FR-26, FR-27, NFR-4, NFR-8.
- ARCHITECTURE › *Các module*, *Quản lý trạng thái*, *Allocation Engine*, *Các bảng chính*, *Redis*, *API architecture*.
- CONTEXT D7, D8, D47, D53, D63, D64.

## Verification commands

| AC | Command |
|---|---|
| AC-1, AC-3 | `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/allocation-round' --selectProjects integration` › `GĐ7 run creates DRAFT round hidden from HR and students; BR-17 replayRound reproduces engine output` |
| AC-2 | `pnpm --filter @srm/api test:unit` › `allocation/domain/__tests__/eligibility.spec.ts` › `BR-07 excludes hard-filter, below θ_cv, below θ_test (boundary)` |
| AC-3 | `allocation/domain/__tests__/snapshot.spec.ts` › `BR-17 snapshot is deterministic and PII-free`, `BR-17 the snapshot alone gives the PRD result again` |
| AC-4 | `allocation-round.int-spec.ts` › `GĐ7 unstable result is rolled back` |
| AC-5 | `allocation-round.int-spec.ts` › `GĐ7 concurrent runs: one 409, lock released after` |
| AC-6 | `allocation-round.int-spec.ts` › `GĐ7 preconditions: wrong phase, pending grading, appeal window → 409`, `GĐ7 rerun replaces draft and is audited` |
| AC-7, AC-8, AC-11 | `allocation-round.int-spec.ts` › `BR-10 adjustment requires reason and writes audit in same transaction; BR-07/BR-09 violations → 422; AD-8 stale row_version → 409` |
| AC-9 | `allocation-round.int-spec.ts` › `BR-08 partial unique index rejects second active nomination at DB level` |
| AC-10, AC-12, AC-13 | `allocation-round.int-spec.ts` › `GĐ7 publish transitions round and preferences, notifies after commit; NFR-4 explanation; RBAC and IDOR`, `GĐ7 publish failure rolls back without notifications`; `explain.spec.ts` › `NFR-4 PRD example: An is told A was full with higher-ranked students`, `NFR-4 student view hides other students’ scores` |
| AC-14 | `allocation-round.int-spec.ts` › `NFR-8 full round for 500 students × 50 JDs under 60s` |
| AC-15 | Kiểm tay `/admin/allocation` (1024 px) và `/sv/results` (360 px) theo `DESIGN.md` §5, §7 |

## Changelog entry

Xem [CHANGELOG 0.33.0](../../CHANGELOG.md).

**Commit**:

## Implementation notes

2026-11-24, một phiên (Plan → Doc/Version gate), nhánh `us-5.2` từ `dev` `8bcdf4d`. Người dùng chốt bốn điểm (D64). Các lựa chọn nhỏ:

- **Đầu vào của vòng.** NV ở `TEST_GRADED` vào engine nếu qua BR-07; `BELOW_THRESHOLD` và `CLOSED` (không làm test, lý do `TEST_NOT_TAKEN`) chỉ vào `excluded` để giải thích. S_cv lấy từ `preferences.s_cv` (con số S_final được tính từ đó); kết quả lọc cứng, model, prompt lấy từ `match_results` của CV `active` đã xác nhận, `rules_version` hiện hành, prompt ghim. Schema không có ngưỡng ghi đè ở cấp JD, nên AC-2 dùng θ của đợt.
- **Sức chứa.** Mọi JD có NV cộng mọi JD `APPROVED`/`RECRUITING` của đợt (JD không có NV vẫn hiện "Thiếu hồ sơ"); JD ở trạng thái khác có C_j = 0. Thành phần của C_j nằm trong snapshot.
- **Điều kiện chạy (AC-6).** `ALLOCATION_NOT_READY` liệt kê tối đa 50 mục (`kind`, `preferenceId`, `studentId`, `jdId`, `until`) kèm `total`. Redis lỗi thì vẫn chạy: dòng đợt `FOR UPDATE` vẫn tuần tự hóa.
- **Engine qua DI.** Token `ALLOCATION_ENGINE`; test AC-4 thay `allocate` của provider. `ALLOCATION_UNSTABLE` trả `500` kèm tối đa 50 vi phạm và ghi log.
- **Lưu kết quả.** `engine_result` giữ kết quả gốc trước điều chỉnh (cho `replayRound`); `adjustments` giữ nhật ký điều chỉnh cho màn dự thảo, mỗi thao tác cũng có một dòng `audit_logs` (entity `nomination`). Bỏ đề cử ở dự thảo là xóa dòng. Sau điều chỉnh, `rank` của các JD bị đụng được tính lại theo rank key của snapshot. `move` sang chính JD đang giữ trả `422` với lý do `ALREADY_AT_JD`; JD không thuộc NV hợp lệ trả lý do `NOT_A_PREFERENCE` hoặc lý do BR-07 của cặp.
- **Version hệ thống** trong `config_snapshot` đọc từ `apps/api/package.json`.
- **Công bố.** Thông báo ghi bằng `NotificationService.notify(…, { tx })` trong giao dịch công bố, `push` sau commit trong `try/catch` (LESSONS §44), nên lỗi giữa chừng không để lại thông báo nào. Mỗi SV có NV được xếp hạng nhận một thông báo (nơi được đề cử, hoặc đang chờ vòng sau); HR của mỗi JD có đề cử nhận số đề cử, link tạm tới trang JD của HR cho tới khi US-5.3 có màn đề cử.
- **Giao diện.** `apps/web` chưa cài TanStack Table; bảng dự thảo không sắp xếp hay phân trang nên dùng primitive `table` (DESIGN §6). Màn SV đặt ở mục *Kết quả* sẵn có của thanh dưới thay vì thêm mục thứ sáu.

Self-verify: typecheck, lint, depcruise, `depcruise:fixture`, build; unit shared 412, API 699; `pnpm test` 1110/1110 (135 suite).

Design applied: §5 (360 px: thẻ một cột ở màn SV), §6 (`table` nhóm theo JD, `alert-dialog` cho chạy lại, công bố, điều chỉnh có `Textarea` lý do; `sheet` giải thích; badge mới), §7 (bốn trạng thái mỗi màn), §9, §10.

Lessons: none new — các bẫy gặp trong story (CRLF, `row_version`, việc sau commit) đã có ở LESSONS §43, §44, §47.

## Files modified

`packages/shared` (states `allocation-round`, `nomination`; schema `allocation`, mã lỗi, loại thông báo); `apps/api/src/modules/allocation/` (domain mới, application, infrastructure, api), `db/schema/allocation.ts`, `db/lifecycles.ts`, `drizzle/0047_allocation_rounds.sql`; hàm export mới ở `matching`, `assessment`, `student`, `company`, `campaign`; `notification` (khóa dedupe, loại chỉ trong app); test `test/integration/allocation-round.int-spec.ts`, `test/helpers/allocation.ts`, `core-schema.int-spec.ts`; `apps/web/src/features/center/allocation/`, `features/student/results/`, router, thông báo, OpenAPI; tài liệu (CONTEXT D64, PRD, ARCH, DESIGN, CHANGELOG, W47, EPIC-5); VERSION và các `package.json`.

## Cross-references

- [PRD FR-26, FR-27, NFR-4, NFR-8](../../PRD.md#functional-requirements)
- [ARCHITECTURE AD-7, AD-8](../../ARCHITECTURE.md#architecture-decisions)
- [Epic EPIC-5](../epics/EPIC-5.md)
- [CONTEXT D7, D8, D64](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
- [US-5.1](US-5.1-allocation-engine-property-tests.md) · [US-5.3](US-5.3-hr-nomination-review.md) · [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md)
