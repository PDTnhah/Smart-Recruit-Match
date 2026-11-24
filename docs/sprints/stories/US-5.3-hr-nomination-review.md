---
id: US-5.3
title: "HR duyệt danh sách đề cử"
epic: EPIC-5
status: review
priority: P0
points: 8
sprint: sprint-2026-W47
version_shipped: 0.34.0
prd_ref:
  - FR-28
  - FR-29
arch_ref:
  - AD-8
depends_on:
  - US-5.2
assignee: PDTnhah
commit: 0325e46
created: 2026-10-07
updated: 2026-11-24
---

## Goal

HR của từng doanh nghiệp xem danh sách SV được đề cử vào JD của mình, sắp theo S_final, và mở hồ sơ chi tiết có đủ bằng chứng để quyết định: mời phỏng vấn, từ chối có lý do, hoặc yêu cầu bổ sung hồ sơ khi thiếu người. HR không thấy ai ngoài danh sách đề cử, và mọi quyết định do HR nhập. Hệ thống nhắc hạn để vòng phân bổ không bị treo. Sau story này, [US-5.4](US-5.4-interviews-reserve-and-offers.md) có các đề cử ở trạng thái *Mời phỏng vấn* để lên lịch, và [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) biết cặp nào đã bị từ chối và JD nào cần bổ sung hồ sơ.

## Background

GĐ8 (UC-23, UC-24), FR-28, FR-29; BR-11, BR-12, BR-13; AD-8 (`transitionTo` + `row_version`). Đề cử thuộc module `allocation` ([CONTEXT D64](../../CONTEXT.md)); `review` đọc và chuyển chúng qua `NominationService`.

**Story refresh (2026-11-24)**: người dùng chốt bốn điểm mở ([CONTEXT D65](../../CONTEXT.md)): HR xem `cvs.profile` (không có phần PII); **không** làm tóm tắt hồ sơ bằng LLM, tách thành [US-5.6](US-5.6-ai-profile-summary-for-hr.md) (AC-11, TASK-5.3.6 cũ); nhắc hạn và quá SLA chỉ trong app; Q5 theo Đề xuất. Theo đề xuất: hạn lưu ở bảng gia hạn `review_deadline_extensions` thay cho cột `nominations.review_due_at`; quyết định lần hai trả `409 NOMINATION_ALREADY_DECIDED`; CV gốc qua file id `nomination:{id}`. File test theo quy ước của repo: `test/integration/nomination-review.int-spec.ts` (một file cho module mới) và ca AC-4 trong `route-guards.int-spec.ts`.

**Lessons applied**: §22 (test SLA ở năm 2003 với vòng lùi ngày, lọc thông báo theo loại và JD), §38 (đọc lại đề cử trong giao dịch, có khóa), §44 (response dựng trong giao dịch), §43, §30, §12, §8 (ghim `recharts`), §47 (story CRLF ghi lại bằng LF).

## Acceptance criteria

- [x] **AC-1** — **Given** một vòng đã `PUBLISHED` có đề cử vào JD X của công ty C, **When** HR của C gọi `GET /api/jds/{id}/nominations`, **Then** HR nhận các đề cử của X ở mọi vòng đã công bố, sắp theo S_final giảm dần, bằng điểm thì theo cùng quy tắc phá hòa của US-5.1 (rank key lấy từ snapshot của vòng). Mỗi dòng có S_cv, S_test, S_final, trạng thái đề cử, hạn phản hồi. Không có đề cử nào của vòng `DRAFT`.
- [x] **AC-2** — **When** HR mở một đề cử qua `GET /api/nominations/{id}`, **Then** response gồm: file id `nomination:{id}` của CV gốc (URL tạm 5 phút qua `GET /api/files/{id}/url`), hồ sơ năng lực, S_cv cùng điểm và bằng chứng từng tiêu chí, bản đồ năng lực (`skill_scores`), chỉ số tin cậy CV nếu có (US-4.8), cảnh báo của bài test nếu có kèm nhãn "chỉ để cảnh báo". Response không bao giờ chứa `answer_key` hay rubric.
- [x] **AC-3** — BR-11, test IDOR: **Given** HR của công ty B, **When** HR đó gọi danh sách, chi tiết, quyết định, yêu cầu bổ sung cho JD/đề cử của công ty A, hoặc xin URL file CV, **Then** API trả `404` và không lộ dữ liệu. `STUDENT` gọi các route của HR nhận `403`. HR không đọc được đề cử của vòng `DRAFT`.
- [x] **AC-4** — Q5: không có route nào cho `HR` liệt kê, tìm kiếm hay mở hồ sơ SV ngoài đề cử. Test duyệt mọi route có `@Roles('HR')` và so với danh sách cho phép.
- [x] **AC-5** — **Given** đề cử ở `NOMINATED`, **When** HR gửi `POST /api/nominations/{id}/decision` với `decision = INVITE`, **Then** trong một giao dịch: đề cử chuyển `NOMINATED → INTERVIEW` qua `transitionTo`, NV của cặp chuyển sang *Mời phỏng vấn* (qua service export của `matching`), một dòng `hr_reviews` được ghi, audit được ghi **And** SV thấy *Mời phỏng vấn* ở màn *Đề cử*.
- [x] **AC-6** — **Given** đề cử ở `NOMINATED`, **When** HR gửi `decision = REJECT` kèm `reasonCode` thuộc danh mục và `note`, **Then** đề cử và NV chuyển `HR_REJECTED`, `hr_reviews` lưu lý do và ghi chú, các NV còn lại của SV ở *Chờ vòng sau* **And** SV thấy lý do ở dạng tổng quát (nhãn danh mục, không có ghi chú). Thiếu `reasonCode`, `reasonCode` ngoài danh mục, hoặc thiếu `note` → `400`.
- [x] **AC-7** — Quyết định khi đề cử không còn ở `NOMINATED` → `409 NOMINATION_ALREADY_DECIDED` (backstop `unique(nomination_id)` của `hr_reviews`). Hai HR cùng công ty quyết định cùng lúc: đúng một quyết định được ghi, người kia nhận `409 ROW_VERSION_CONFLICT`.
- [x] **AC-8** — BR-13: không có đường code nào tự ra quyết định; route quyết định chỉ nhận vai trò `HR`. Hết SLA không tự từ chối. Thứ tự danh sách chỉ theo điểm (không có tóm tắt AI, US-5.6).
- [x] **AC-9** — **Given** số đề cử của JD đã được mời (`INTERVIEW`, `PASSED`, `RESERVE`, `ACCEPTED`) nhỏ hơn chỉ tiêu, **When** HR gửi `POST /api/jds/{id}/supplement-requests` kèm ghi chú, **Then** yêu cầu được lưu (một lần mỗi vòng đã công bố), ghi audit và báo Trung tâm trong app; US-5.5 đọc qua `SupplementRequestService.listOfCampaign`. Đã mời ≥ chỉ tiêu, đã gửi ở vòng này, hoặc chưa có vòng công bố → `409 SUPPLEMENT_NOT_ALLOWED`.
- [x] **AC-10** — SLA: hạn = `published_at` + `sla_hr_business_days` ngày làm việc (thứ Hai–thứ Sáu, UTC+7). **Given** đồng hồ giả lập, **When** còn 2 ngày làm việc mà đề cử vẫn `NOMINATED`, **Then** HR nhận đúng một lời nhắc; **When** quá hạn, **Then** HR và Trung tâm nhận đúng một thông báo. Hai lượt quét cùng lúc vẫn chỉ gửi một lần. Trung tâm gia hạn qua `POST /api/jds/{id}/review-deadline-extensions` (bắt buộc lý do, audit; hạn mới phải sau hạn cũ và sau lúc gia hạn, sai → `422`); hạn mới được nhắc lại.
- ~~**AC-11**~~ — Tóm tắt hồ sơ bằng LLM: chuyển sang [US-5.6](US-5.6-ai-profile-summary-for-hr.md) (CONTEXT D65).
- [ ] **AC-12** — Giao diện cổng HR: bảng đề cử bằng TanStack Table (sắp theo S_final, cột trạng thái và hạn phản hồi); ngăn chi tiết có biểu đồ radar năng lực (shadcn Chart), danh sách bằng chứng, xem CV (react-pdf); hộp thoại từ chối bắt buộc chọn lý do và nhập ghi chú; nút yêu cầu bổ sung hồ sơ chỉ bật khi đủ điều kiện; trạng thái đang tải / trống / lỗi. Chuỗi giao diện tiếng Việt. *Chờ người dùng kiểm tay theo checklist ở Implementation notes.*

## Tasks

- [x] **TASK-5.3.1** — Lược đồ và danh mục (AC: 5, 6, 7, 9, 10): `hr_reviews`, `supplement_requests`, `review_deadline_extensions` (migration `0048_hr_review`); `packages/shared/schemas/review.ts` (quyết định, danh mục lý do, schema API); ba loại thông báo mới; ba mã lỗi mới.
- [x] **TASK-5.3.2** — Đọc danh sách và hồ sơ chi tiết (AC: 1, 2, 3, 4): `NominationQueryService` (`review`), `NominationService` (`allocation`), `PreferenceReviewService.matchOf` (`matching`), `ReviewResultsService` (`assessment`), `CvService.reviewCvOf/reviewFileOf` (`student`); resolver file `nomination`.
- [x] **TASK-5.3.3** — Quyết định mời / từ chối (AC: 5, 6, 7, 8): `HrDecisionService.decide`; `GET /api/me/nomination-reviews`; màn *Kết quả* của SV hiện lý do tổng quát.
- [x] **TASK-5.3.4** — Yêu cầu bổ sung hồ sơ (AC: 9): `SupplementRequestService`; quy tắc thuần `review/domain/supplement.ts`.
- [x] **TASK-5.3.5** — SLA và nhắc hạn (AC: 10): `review/domain/working-days.ts`; `ReviewSlaScheduler` (khóa 5301); `ReviewDeadlineService` (danh sách hạn của vòng, gia hạn cho CENTER).
- ~~**TASK-5.3.6**~~ — Tóm tắt hồ sơ bằng LLM: chuyển sang US-5.6.
- [x] **TASK-5.3.7** — Giao diện (AC: 12): tab "Đề cử" ở trang JD của HR (`features/hr/nominations/`), thẻ "Hạn phản hồi của HR" ở màn *Phân bổ* của Trung tâm, lý do ở màn *Kết quả* của SV. Đọc DESIGN.md trước khi code.
- [x] **TASK-5.3.8** — Kiểm thử (AC: 1–10): `nomination-review.int-spec.ts` (9 ca), AC-4 trong `route-guards.int-spec.ts`, unit `working-days.spec.ts`, `supplement.spec.ts`, shared `review.spec.ts`.

## Dev notes

- AGENTS › Nguyên tắc 7 và BR-11: kiểm tra cấp bản ghi đặt trong service (`NominationQueryService.requireOwn`, `JdService.get`); lỗi quyền sở hữu trả `404`.
- AGENTS › Nguyên tắc 13: `review` không truy vấn bảng của module khác; mọi dữ liệu qua service export. `student` và `allocation` không phụ thuộc `review` (tránh vòng).
- SLA, nhắc hạn, quyết định không dùng LLM (ARCH › *Những chỗ cố ý KHÔNG dùng LLM*).

### What we explicitly did NOT do

- Không cho HR chọn SV ngoài danh sách đề cử (Q5, D65).
- Không tự từ chối hay tự mời khi hết SLA.
- Không có lịch nghỉ lễ cho SLA. Trigger: Trung tâm yêu cầu tính ngày lễ.
- Không gửi email cho lời nhắc, quá SLA, yêu cầu bổ sung (D65). Trigger: người dùng đổi kênh.
- Không làm tóm tắt hồ sơ bằng LLM (US-5.6).
- Không thông báo cho SV khi HR mời hay từ chối: SV thấy ở màn *Kết quả*. PRD › *Thông báo* chưa có dòng này; US-5.4 thêm thông báo lịch phỏng vấn.

## Verification commands

| AC | Command |
|---|---|
| AC-1…AC-3, AC-5…AC-10 | `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/nomination-review' --selectProjects integration` |
| AC-4 | `… --testPathPatterns 'test/integration/route-guards' --selectProjects integration` › `Q5: no HR route lists or searches students outside nominations` |
| AC-6 (schema), AC-9, AC-10 (quy tắc) | `pnpm --filter @srm/shared exec jest schemas/__tests__/review.spec.ts`; `pnpm --filter @srm/api exec jest --selectProjects unit --testPathPatterns review/domain` |
| AC-12 | Kiểm tay theo checklist dưới đây |

## Changelog entry

### Added
- HR duyệt danh sách đề cử (module `review`): bảng sắp theo S_final, hồ sơ chi tiết có bằng chứng S_cv, bản đồ năng lực, chỉ số tin cậy CV và cảnh báo khi làm test; mời phỏng vấn hoặc từ chối bắt buộc có lý do; yêu cầu bổ sung hồ sơ.
- Kiểm tra cấp bản ghi: HR chỉ thấy đề cử thuộc JD của công ty mình (BR-11), có test IDOR và danh sách route cho phép của HR (Q5).
- Hạn phản hồi của HR theo ngày làm việc: nhắc trước 2 ngày, báo HR và Trung tâm khi quá hạn (trong app); Trung tâm gia hạn có lý do.

**Commit**: `0325e46`

## Implementation notes

- **Đường dữ liệu.** Đề cử, vòng: `NominationService` (`allocation`) — danh sách đã công bố của JD (sắp `toCentiScore(sFinal)` rồi `compareRankKeys` trên rank key của snapshot), tìm có khóa, `transition`, `countInvited`, `reviewGroups` (theo vòng × JD), `publishedIdsOfStudent`. S_cv, S_test của dòng lấy từ rank key của snapshot (null nếu không có). Giải thích S_cv: bản mới nhất đã chấm của cặp có phiên bản JD ≤ hiện hành (LESSONS §42). `me/allocation-results` thêm `nominationId`.
- **Quyết định.** Thứ tự khóa: đợt `FOR SHARE` → đề cử `FOR UPDATE` → NV `FOR UPDATE` (như lúc công bố vòng). Kiểm `rowVersion` trước trạng thái để người thua cuộc đua nhận `ROW_VERSION_CONFLICT`. Ghi chú của HR không vào `audit_logs` (NFR-2), chỉ ở `hr_reviews`.
- **SLA.** Hạn tính lúc đọc (`ReviewDeadlineService.deadlinesOf`), không lưu cột; dedupe key của thông báo chứa `dueAt` nên gia hạn được nhắc lại; hạn gia hạn là `due_at` lớn nhất (hai lần gia hạn chạy cùng lúc không kéo hạn về sớm). Tác vụ quét bỏ đợt không ở `ALLOCATION_REVIEW`/`SUPPLEMENTARY`.
- **Web.** `CvViewer` sang `shared/files/` (nhận `fileId`); khối giải thích S_cv (`jd-explanation-sheet.tsx`) và `CvTrustBody` được export để dùng lại. `SkillRadar`, `CvViewer` tải lười (bundle chính 1,47 MB thay vì 1,80 MB). Thêm `@tanstack/react-table` 8.21.3, `recharts` 3.8.0 (`shadcn add chart`).
- **Design applied**: §5, §6 (table + TanStack Table, sheet ba tab, alert-dialog gửi `rowVersion` lúc mở, badge qua `IconBadge`, tabs bốn tab, chart mới — đã ghi vào §6), §7, §8, §10, §11 (radar `aria-hidden` kèm điểm bằng chữ).
- **Self-verify (2026-11-24)**: typecheck, lint, depcruise, build web; unit API 715, shared 415; `pnpm test` API 1136/1136 (compose tắt).
- **Checklist kiểm tay AC-12** (sau `db:migrate` `0048`, có vòng đã công bố): (1) HR → JD → tab "Đề cử": thứ tự, sắp theo S_test, "Quá hạn"; (2) "Xem hồ sơ": ba tab, radar (≥ 3 kỹ năng), CV PDF, `?nomination=`; (3) "Từ chối" thiếu lý do → lỗi ở ô; đủ → "HR từ chối"; (4) "Mời phỏng vấn"; (5) "Yêu cầu bổ sung hồ sơ" bật/tắt, lý do trên nút; (6) Trung tâm → *Phân bổ* → "Gia hạn" (hạn sớm → lỗi); (7) SV → *Kết quả*: lý do tổng quát, không ghi chú; (8) 768 và 360 px không cuộn ngang.
- Lessons: none new — các bẫy gặp (status `201`/`200` của publish, thứ tự `auditEntries`, `Date.now()` khi render) đều đã sửa ngay và không lặp lại ở story khác.

## Files modified

- `packages/shared`: `schemas/review.ts` (+ spec), `schemas/notification.ts`, `files.ts`, `allocation.ts`, `errors.ts`, `states/nomination.ts`.
- `apps/api`: module mới `src/modules/review/` (domain, infrastructure, application, api); `allocation` (`NominationService`, repository), `matching` (`PreferenceReviewService`), `assessment` (`ReviewResultsService`), `student` (`CvService`), `notification` (dedupe keys, email switch), `common/errors`, `common/scheduling`; `src/db/schema/review.ts`, `drizzle/0048_hr_review.sql`; test `nomination-review.int-spec.ts`, `route-guards`, `core-schema`.
- `apps/web`: `features/hr/nominations/`, `features/hr/jds/`, `features/center/allocation/` (thẻ hạn), `features/student/results/`, `shared/files/cv-viewer.tsx`, `shared/notifications/messages.ts`, `shared/api/` (sinh lại), `components/ui/chart.tsx`.
- Tài liệu: CONTEXT D65, PRD, ARCH, EPIC-5, US-5.6 (mới), DESIGN §6, AGENTS, sprints/README, W47, CHANGELOG, VERSION.

## Cross-references

- [PRD FR-28, FR-29](../../PRD.md#functional-requirements) · [ARCHITECTURE AD-8](../../ARCHITECTURE.md#architecture-decisions) · [Epic EPIC-5](../epics/EPIC-5.md)
- [CONTEXT D8, D64, D65](../../CONTEXT.md) · [CHANGELOG](../../CHANGELOG.md)
- [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md) · [US-5.4](US-5.4-interviews-reserve-and-offers.md) · [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) · [US-5.6](US-5.6-ai-profile-summary-for-hr.md)
