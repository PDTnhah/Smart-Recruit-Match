---
id: US-5.4
title: "Phỏng vấn, Dự bị và lời mời thực tập"
epic: EPIC-5
status: review
priority: P0
points: 8
sprint: sprint-2026-W47
version_shipped: 0.35.0
prd_ref:
  - FR-30
  - FR-31
arch_ref:
  - AD-8
depends_on:
  - US-5.3
assignee: PDTnhah
commit: 5e034ff
created: 2026-10-07
updated: 2026-11-29
---

## Goal

Sau khi HR mời phỏng vấn, HR và SV chốt được lịch, HR nhập kết quả, và SV đạt nhận lời mời thực tập có hạn rõ ràng. Số SV Đạt của một JD không bao giờ vượt chỉ tiêu còn lại; người dư vào Dự bị và được lên Đạt khi có suất trống. SV nhận lời mời thì rời hàng chờ và mọi hồ sơ khác đóng lại; SV từ chối hoặc quá hạn thì suất được trả lại. Sau story này, luồng của một SV đi trọn từ đề cử đến lúc nhận thực tập, và [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) có dữ liệu "đã nhận", "đang trong quy trình" và danh sách SV bị hạ ưu tiên để tính vòng bổ sung.

## Background

Story này hiện thực GĐ9 (UC-16, UC-17, UC-25), FR-30, FR-31 và các quy tắc BR-13 (kết quả do HR nhập), BR-14 (số Đạt ≤ chỉ tiêu còn lại, phần vượt chuyển Dự bị), BR-15 (SV nhận thì hồ sơ khác đóng, chỉ tiêu còn lại giảm 1), BR-16 (SV từ chối hoặc quá hạn bị hạ ưu tiên hoặc loại, Q4). Vòng đời ở PRD › *Vòng đời trạng thái › Hồ sơ ứng tuyển*; chuyển trạng thái theo AD-8; cron hết hạn T_offer và Dự bị theo ARCH › *Tác vụ định kỳ*; module `interview` theo ARCH › *Các module*.

**Story refresh (2026-11-29)**: người dùng chốt bốn điểm mở ([CONTEXT D66](../../CONTEXT.md)): thời hạn Dự bị là tham số `reserve_ttl_days`, mặc định 7 ngày lịch từ lúc HR nhập kết quả; Q4 theo Đề xuất thành tham số `offer_decline_policy` (`DEMOTE` mặc định / `EXCLUDE`), áp cho mọi vòng còn lại, quá hạn như từ chối; hệ thống tự đưa Dự bị xếp cao nhất lên Đạt; mọi thông báo GĐ9 chỉ trong app. Theo D64, đề cử `PASSED → DECLINED` cho cả từ chối lẫn quá hạn (không có trạng thái `EXPIRED` của đề cử); `offers.status` phân biệt `DECLINED` / `EXPIRED`. Cột `response` của ARCH thành `offers.status` có thêm `PENDING` để đi qua `transitionTo`. Test gom vào `test/integration/interview.int-spec.ts` (một file cho module mới).

**Lessons applied**: §12 (khóa dòng bằng câu không join, qua `findPublished(lock)`), §22 (chỉ file này gọi `InterviewSweepScheduler.runOnce`; thông báo CENTER lọc theo `offerId`), §30 (`core-schema` thêm `interviews`, `offers`), §34 (tác vụ quét làm lưới an toàn, sự kiện không giữ việc), §35 (thông báo chỉ trong app, không template), §38 (điều kiện suất đọc trong giao dịch dưới khóa suất của JD), §44 (response dựng trong giao dịch; đẩy SSE sau commit có `try/catch`), §48 (tác vụ quét bỏ đợt đóng/hủy).

## Acceptance criteria

- [x] **AC-1** — **Given** đề cử ở `INTERVIEW` thuộc JD của công ty mình, **When** HR gọi `POST /api/interviews` với thời gian, hình thức (`ONLINE` / `OFFLINE`) và địa điểm hoặc đường link, **Then** một dòng `interviews` được tạo **And** SV và HR nhận thông báo *Lịch phỏng vấn*. Đề cử không ở `INTERVIEW` → `409 NOMINATION_NOT_IN_INTERVIEW`; lịch thứ hai → `409 INTERVIEW_ALREADY_SCHEDULED`; giờ không sau hiện tại → `422 INTERVIEW_TIME_NOT_FUTURE`.
- [x] **AC-2** — **Given** SV có lịch, **When** SV gọi `POST /api/interviews/{id}/confirm`, **Then** lịch có `confirmed_at`. **When** SV gọi `POST /api/interviews/{id}/reschedule-request` lần đầu (kèm lý do), **Then** yêu cầu được lưu, HR nhận thông báo; HR đặt giờ mới qua `PUT /api/interviews/{id}` thì lịch về `SCHEDULED` (SV xác nhận lại) và cả hai nhận *Đổi lịch* **And** lần xin thứ hai → `409 INTERVIEW_RESCHEDULE_ALREADY_REQUESTED`.
- [x] **AC-3** — **When** HR gọi `PUT /api/interviews/{id}/result` với `PASSED` / `RESERVE` / `FAILED` / `ABSENT` và nhận xét, **Then** lịch `DONE`, đề cử và NV chuyển `PASSED`, `RESERVE` hoặc `INTERVIEW_FAILED` (cả `FAILED` lẫn `ABSENT`) qua `transitionTo`, audit cùng giao dịch. `INTERVIEW_FAILED`: SV về hàng chờ với các NV còn lại. Chỉ `HR` nhập được (BR-13). `RESERVE` khi JD còn suất (`A + P < Q`) → `409 INTERVIEW_RESERVE_PLACES_LEFT` (D66, chốt sau review).
- [x] **AC-4** — BR-14: JD chỉ tiêu Q, đã nhận A, P đề cử `PASSED` chờ trả lời; HR nhập `PASSED` mà `A + P ≥ Q` thì ghi `RESERVE`, response có `reservedForQuota: true`. Hai HR cùng công ty nhập `PASSED` cho hai SV khi còn 1 suất: đúng một `PASSED`, người kia `RESERVE`.
- [x] **AC-5** — Đề cử chuyển `PASSED` (từ kết quả hoặc từ Dự bị lên) thì cùng giao dịch tạo `offers` với `sent_at`, `expires_at = sent_at + T_offer` (mặc định 3 ngày lịch) **And** SV nhận *Kết quả phỏng vấn, lời mời thực tập*. Hạn do server quyết định.
- [x] **AC-6** — BR-15: **When** SV gọi `POST /api/offers/{id}/accept` khi còn hạn, **Then** trong một giao dịch: lời mời `ACCEPTED`, đề cử và NV `ACCEPTED`, mọi NV khác của SV trong đợt `CLOSED`; JD đủ chỉ tiêu thì JD `FILLED` qua `company` và các Dự bị còn lại `CLOSED` **And** HR và Trung tâm nhận thông báo.
- [x] **AC-7** — **When** SV gọi `POST /api/offers/{id}/decline`, hoặc tác vụ quét thấy lời mời quá `expires_at`, **Then** lời mời `DECLINED` / `EXPIRED`, đề cử và NV `DECLINED`, HR và Trung tâm nhận thông báo (BR-16 ghi nhận qua đề cử `DECLINED`) **And** SV Dự bị xếp cao nhất của JD (S_final rồi phá hòa US-5.1) lên `PASSED` và nhận lời mời mới. Không có Dự bị thì suất để trống.
- [x] **AC-8** — Lời mời đã quá `expires_at` theo đồng hồ server: accept → `409 OFFER_EXPIRED`, đề cử không đổi. Hai câu trả lời đồng thời (hoặc trả lời và tác vụ quét): đúng một kết quả được ghi, không có trạng thái lai; lời mời đã trả lời không bị tác vụ quét ghi đè.
- [x] **AC-9** — Dự bị quá `reserve_ttl_days` từ lúc HR nhập kết quả: tác vụ quét chuyển `RESERVE → CLOSED`, NV `CLOSED`, SV về hàng chờ và nhận thông báo. JD đã nhận đủ chỉ tiêu: các Dự bị còn lại `CLOSED` ngay. Hai instance tác vụ quét không chạy trùng (advisory lock).
- [x] **AC-10** — HR của công ty khác → `404` (tạo, đổi lịch, nhập kết quả, xem danh sách); SV khác → `404` (xác nhận, xin đổi, nhận, từ chối); `CENTER` chỉ xem; sai vai trò → `403`.
- [x] **AC-11** — AD-8: mọi chuyển trạng thái của đề cử, lịch, lời mời qua `transitionTo` với audit cùng giao dịch; `row_version` cũ → `409` (HR đổi lịch bằng phiên bản trước khi SV xác nhận).
- [ ] **AC-12** — Giao diện: tab *Phỏng vấn* ở trang JD của HR (suất, tạo/đổi lịch, nhập kết quả, thấy yêu cầu đổi lịch); màn *Kết quả* của SV có lịch với nút xác nhận / xin đổi lịch (ẩn sau lần xin) và lời mời với nhận / từ chối, đếm ngược theo `expires_at`, dùng tốt ở 360 px; từ chối có hộp thoại nêu hệ quả theo Q4. Chờ người dùng kiểm tay (checklist ở *Implementation notes*).

## Tasks

- [x] **TASK-5.4.1** — Bảng `interviews`, `offers`, schema và bảng chuyển ở `packages/shared`, hai tham số đợt, migration `0049` (kèm CHECK `notifications.type`). (AC: 1, 2, 3, 5, 11)
- [x] **TASK-5.4.2** — `InterviewScheduleService`: lên lịch, đổi lịch, xác nhận, xin đổi lịch, thông báo. (AC: 1, 2)
- [x] **TASK-5.4.3** — `domain/slot-policy.ts`, `InterviewResultService` dưới khóa suất của JD. (AC: 3, 4)
- [x] **TASK-5.4.4** — `OfferService`, `SlotService`; `closeOtherPreferences`, `JdService.markFilled`, `NominationService.slotCounts`. (AC: 5, 6, 7)
- [x] **TASK-5.4.5** — `InterviewSweepScheduler` mỗi phút (khóa 5402). (AC: 7, 8, 9)
- [x] **TASK-5.4.6** — Hai controller, `InterviewAccessService`, 4 route HR trong `route-guards`. (AC: 10, 11)
- [x] **TASK-5.4.7** — Giao diện HR, SV, form đợt; thông báo; câu báo lỗi. (AC: 12)
- [x] **TASK-5.4.8** — Unit `slot-policy`, `states/interview`; `test/integration/interview.int-spec.ts`. (AC: 1–11)

## Dev notes

- AD-8 / Nguyên tắc 10: đề cử, lịch, lời mời đổi trạng thái bằng `transitionTo`; HR đổi giờ khi lịch còn `SCHEDULED` không đổi trạng thái nên là UPDATE có `row_version` + audit `INTERVIEW_TIME_CHANGED`.
- Nguyên tắc 11 / BR-14: `pg_advisory_xact_lock(5401, hashtext(jdId))` (`ADVISORY_LOCK_KEYS.JD_SLOTS`) là khóa đầu tiên của mọi giao dịch đổi suất; module `interview` không khóa dòng JD của `company` (Nguyên tắc 13).
- Nguyên tắc 13: đề cử qua `NominationService` (`allocation`), NV qua `PreferenceReviewService` (`matching`), JD qua `JdService.markFilled` (`company`), tên SV qua `StudentService`, người nhận qua `UserDirectory`. `interview` không được ai import, nên US-5.5 (trong `allocation`) đọc thẳng đề cử `DECLINED` và `slotCounts`.
- "SV trong đợt" và cờ BR-16 suy ra từ đề cử: `ACCEPTED` → có nơi thực tập; trạng thái BR-08 → đang trong quy trình; đề cử `DECLINED` → hạ ưu tiên / loại theo `offer_decline_policy`.
- Không làm: tích hợp lịch, sinh link họp, nhắc trước giờ phỏng vấn, quản lý sau khi nhận, LLM tóm tắt nhận xét, áp Q4 vào phân bổ (US-5.5).

### Cross-story dependencies

- Builds on [US-5.3](US-5.3-hr-nomination-review.md) (đề cử `INTERVIEW`), [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md) (`NominationService`, màn *Kết quả*), [US-5.1](US-5.1-allocation-engine-property-tests.md) (`compareRankKeys`), [US-1.4](US-1.4-campaign-setup-and-config.md) (`Clock`), [US-1.7](US-1.7-notifications-sse-email-reminders.md), [US-1.5](US-1.5-company-hr-accounts-jd-posting-approval.md), [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md).
- Required by [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) (đã nhận, đang trong quy trình, Q4), [US-6.1](US-6.1-campaign-dashboard.md), [US-6.5](US-6.5-campaign-close-report-export.md).

## Verification commands

| AC | Command |
|---|---|
| AC-1…AC-11 | `pnpm --filter @srm/api exec jest --selectProjects integration --testPathPatterns 'test/integration/(interview|core-schema|route-guards)'` (11 ca của `interview.int-spec.ts`, tên có `GĐ9`, `BR-11`…`BR-16`, `AD-8`) |
| AC-4 | `pnpm --filter @srm/api exec jest --selectProjects unit --testPathPatterns interview` › `BR-14 PASSED beyond remaining quota becomes RESERVE` |
| AC-11 | `pnpm --filter @srm/shared test -- --testPathPatterns states/__tests__/interview` (bảng chuyển) |
| AC-12 | Kiểm tay theo checklist ở *Implementation notes* |

## Changelog entry

Xem [CHANGELOG 0.35.0](../../CHANGELOG.md).

**Commit**: `5e034ff`

## Implementation notes

- **Thứ tự khóa** của giao dịch đổi suất: khóa suất JD → đợt `FOR SHARE` (`assertPhase` / `getSettings(tx)`) → lịch hoặc lời mời `FOR UPDATE` → đề cử → NV → (khi nhận) NV khác của SV, dòng JD, các Dự bị. Lên lịch / xác nhận không đổi suất nên không lấy khóa JD. Kiểm `rowVersion` trước trạng thái để bên thua nhận `ROW_VERSION_CONFLICT`.
- **Thay đổi dẫn xuất** (Dự bị lên Đạt, đóng Dự bị, đóng NV khác, JD `FILLED`) dùng actor `SYSTEM`, có reason riêng; thay đổi trực tiếp dùng user. `interviews.result` lưu giá trị đã áp (PASSED hết suất lưu `RESERVE`); PASSED của HR thấy ở reason `HR_PASSED_NO_PLACE_LEFT` trong audit của đề cử. Dự bị chỉ tồn tại khi mọi suất đã nhận hoặc đang chờ trả lời (`reserveAllowed`), nên suất trống chỉ xuất hiện khi có người từ chối / quá hạn, và `promoteReserves` lấp ngay.
- **Review (2026-11-29)**: `promoteReserves` bỏ qua và đóng Dự bị đã quá hạn (`reserveExpired`) thay vì đưa lên Đạt; tác vụ quét kiểm lại pha của đợt trong giao dịch; HR chọn Dự bị khi JD còn suất → 409 (người dùng chốt, D66), hộp thoại kết quả tắt lựa chọn này.
- `EXPIRED` ghi `responded_at = expires_at`. JD `APPROVED` đi `RECRUITING` rồi `FILLED` trong `markFilled`.
- **Web**: `ConfirmActionDialog` nhận `children` (ô lý do xin đổi lịch); `useNow` của `features/exam/server-clock.ts` cho đếm ngược; nhãn badge GĐ9 ở `features/hr/interviews/labels.ts` dùng cho cả hai cổng; `api:sync` sinh lại `openapi.json`, `schema.d.ts`.
- **Design applied**: §5 (một cột, nút `w-full sm:w-auto`, `ConfirmActionDialog` = `Sheet bottom` dưới `md`), §6 (tab thứ năm, sheet lịch, alert-dialog kết quả với `RadioGroup`, badge có icon — đã ghi vào §6), §7, §8, §9, §10 (`formatDateTime`, `formatCountdown` dưới 24 giờ), §11.
- **Self-verify (2026-11-29)**: typecheck (shared, api, web), lint (api phần sửa, web), depcruise, build web; unit shared 417, API 719; `pnpm test` API 1150/1150 sau khi thêm 4 route HR vào `route-guards` (lần đầu 1149/1150 chỉ đỏ ca này). Docker có container CVAT của máy chạy song song, compose của repo tắt.
- **Checklist kiểm tay AC-12** (sau `db:migrate` `0049`, có vòng đã công bố và đề cử đã mời): (1) HR → JD → tab *Phỏng vấn*: thẻ suất, "Tạo lịch" (giờ quá khứ → lỗi), "Đổi lịch"; (2) SV → *Kết quả*: lịch, "Xác nhận lịch", "Xin đổi lịch" có lý do rồi nút biến mất; HR thấy lý do; (3) HR "Nhập kết quả": Đạt khi hết suất → toast "chuyển Dự bị"; (4) SV thấy lời mời, đếm ngược, "Từ chối" nêu hệ quả `DEMOTE`/`EXCLUDE`, "Nhận lời mời"; (5) Trung tâm → form đợt: "Thời hạn dự bị", "Khi sinh viên từ chối…"; (6) chuông của SV, HR, Trung tâm mở đúng trang; (7) 360 px (SV) và 768 px (HR) không cuộn ngang.
- Lessons: none new — các lỗi gặp (thiếu bảng trong `core-schema`, thứ tự audit cùng mốc giờ, danh sách route HR của Q5, `Date.now()` khi render) đều đã có trong LESSONS hoặc chỉ là test của story, đã sửa ngay.

## Files modified

- `packages/shared`: `states/`, `schemas/` (interview, campaign, notification, errors).
- `apps/api`: module mới `modules/interview/`; `allocation`, `matching`, `company`, `notification`, `common/`; `db/schema`, `drizzle/0049`; test integration (`interview`, `core-schema`, `route-guards`).
- `apps/web`: `features/hr/interviews/`, `hr/jds/`, `student/results/`, `center/campaigns/`, `shared/`.
- Tài liệu: CONTEXT D66, PRD, ARCH, DESIGN §6, AGENTS, EPIC-5, W47, CHANGELOG, VERSION.

## Cross-references

- [PRD FR-30, FR-31](../../PRD.md#functional-requirements) · [ARCHITECTURE AD-8](../../ARCHITECTURE.md#architecture-decisions) · [Epic EPIC-5](../epics/EPIC-5.md)
- [CONTEXT D8, D64, D66](../../CONTEXT.md) · [CHANGELOG](../../CHANGELOG.md)
- [US-5.3](US-5.3-hr-nomination-review.md) · [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md)
