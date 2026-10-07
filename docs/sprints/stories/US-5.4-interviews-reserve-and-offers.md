---
id: US-5.4
title: "Phỏng vấn, Dự bị và lời mời thực tập"
epic: EPIC-5
status: backlog
priority: P0
points: 8
sprint:
version_shipped:
prd_ref:
  - FR-30
  - FR-31
arch_ref:
  - AD-8
depends_on:
  - US-5.3
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Sau khi HR mời phỏng vấn, HR và SV chốt được lịch, HR nhập kết quả, và SV đạt nhận lời mời thực tập có hạn rõ ràng. Số SV Đạt của một JD không bao giờ vượt chỉ tiêu còn lại; người dư vào Dự bị và được lên Đạt khi có suất trống. SV nhận lời mời thì rời hàng chờ và mọi hồ sơ khác đóng lại; SV từ chối hoặc quá hạn thì suất được trả lại. Sau story này, luồng của một SV đi trọn từ đề cử đến lúc nhận thực tập, và [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) có dữ liệu "đã nhận", "đang trong quy trình" và danh sách SV bị hạ ưu tiên để tính vòng bổ sung.

## Background

Story này hiện thực GĐ9 (UC-16, UC-17, UC-25) và phủ FR-30 (lên lịch, SV xác nhận hoặc xin đổi lịch 1 lần, HR nhập kết quả Đạt / Dự bị / Không đạt / Vắng) cùng FR-31 (lời mời thực tập, SV nhận hoặc từ chối trong T_offer, Dự bị lên Đạt khi có suất trống). Các quy tắc liên quan:

- BR-13: kết quả phỏng vấn do HR nhập; AI không quyết định.
- BR-14: số SV Đạt của một JD không vượt quá chỉ tiêu còn lại; phần vượt chuyển Dự bị.
- BR-15: SV nhận thực tập thì các hồ sơ khác đóng lại và SV rời hàng chờ; chỉ tiêu còn lại của JD giảm 1.
- BR-16: SV từ chối lời mời hoặc quá hạn xác nhận thì xếp ưu tiên thấp nhất ở vòng sau, hoặc bị loại, tùy chính sách (Q4, chưa chốt).

PRD › *Vòng đời trạng thái › Hồ sơ ứng tuyển* cho các chuyển: Mời phỏng vấn → Đạt / Dự bị / Không đạt (kể cả vắng); Dự bị → Đạt khi có suất trống, → Đóng khi hết hạn dự bị; Đạt → Đã nhận / SV từ chối hoặc quá hạn. Theo AD-8 ([CONTEXT D8](../../CONTEXT.md)), mọi chuyển đi qua `transitionTo` với audit trong cùng giao dịch và `row_version`. ARCH › *Tác vụ định kỳ* giao cho cron (`@nestjs/schedule` + `pg_try_advisory_lock`) việc hết hạn T_offer và hết hạn Dự bị. ARCH › *Các module* đặt lịch phỏng vấn, kết quả, Dự bị, lời mời, xác nhận vào module `interview`; bảng `interviews` và `offers` ở ARCH › *Các bảng chính*; route `POST /api/interviews`, `PUT /api/interviews/{id}/result`, `POST /api/offers/{id}/accept` ở ARCH › API architecture.

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** đề cử ở `INTERVIEW` thuộc JD của công ty mình, **When** HR gọi `POST /api/interviews` với thời gian, hình thức (`ONLINE` / `OFFLINE`) và địa điểm hoặc đường link, **Then** một dòng `interviews` được tạo **And** SV và HR nhận thông báo *Lịch phỏng vấn*. Tạo lịch cho đề cử không ở `INTERVIEW`, hoặc tạo lịch thứ hai cho cùng đề cử, trả `409`.
- [ ] **AC-2** — **Given** SV có lịch phỏng vấn, **When** SV xác nhận qua `POST /api/interviews/{id}/confirm` (đề xuất), **Then** lịch có `confirmed_at`. **When** SV xin đổi lịch qua `POST /api/interviews/{id}/reschedule-request` (đề xuất) lần đầu, **Then** yêu cầu được lưu, HR nhận thông báo, và HR đặt giờ mới qua `PUT /api/interviews/{id}` (đề xuất) thì cả hai nhận thông báo *Đổi lịch* **And** lần xin đổi thứ hai trả `409`.
- [ ] **AC-3** — **Given** đề cử ở `INTERVIEW`, **When** HR gọi `PUT /api/interviews/{id}/result` với `result` thuộc `PASSED` / `RESERVE` / `FAILED` / `ABSENT` và nhận xét, **Then** đề cử chuyển trạng thái tương ứng qua `transitionTo` (`PASSED`, `RESERVE`, hoặc `INTERVIEW_FAILED` cho cả `FAILED` lẫn `ABSENT`), NV của cặp chuyển sang trạng thái PRD tương ứng (qua service export của `matching`), audit được ghi trong cùng giao dịch. Với `INTERVIEW_FAILED`, SV về hàng chờ với các NV còn lại. Chỉ actor vai trò `HR` nhập được kết quả (BR-13).
- [ ] **AC-4** — BR-14: **Given** JD có chỉ tiêu Q, đã nhận A, đang có P đề cử `PASSED` chờ trả lời, **When** HR nhập `PASSED` mà `A + P ≥ Q`, **Then** hệ thống ghi `RESERVE` thay cho `PASSED` và trả cho HR thông báo "đã hết suất, chuyển Dự bị". **Given** còn đúng 1 suất và hai HR cùng công ty nhập `PASSED` cho hai SV cùng lúc, **When** hai yêu cầu chạy song song, **Then** đúng một SV được `PASSED`, người kia `RESERVE`.
- [ ] **AC-5** — **When** một đề cử chuyển sang `PASSED` (từ kết quả phỏng vấn hoặc từ Dự bị lên), **Then** trong cùng giao dịch hệ thống tạo `offers` với `sent_at` và `expires_at = sent_at + T_offer` (mặc định 3 ngày) **And** sau commit SV nhận thông báo *Kết quả phỏng vấn, lời mời thực tập*. Hạn do server quyết định; client chỉ hiển thị đếm ngược.
- [ ] **AC-6** — BR-15: **Given** lời mời còn hạn, **When** SV gọi `POST /api/offers/{id}/accept`, **Then** trong một giao dịch: `offers.response = ACCEPTED`, đề cử `PASSED → ACCEPTED`, mọi NV khác của SV chuyển sang *Đóng*, SV rời hàng chờ và ở trạng thái *Đã có nơi thực tập*; chỉ tiêu còn lại của JD giảm 1; nếu JD đã nhận đủ chỉ tiêu thì JD chuyển *Đủ chỉ tiêu* qua service export của `company` **And** sau commit HR và Trung tâm nhận thông báo.
- [ ] **AC-7** — **Given** lời mời còn hạn, **When** SV gọi `POST /api/offers/{id}/decline` (đề xuất), hoặc cron phát hiện lời mời quá `expires_at`, **Then** `offers.response` là `DECLINED` hoặc `EXPIRED`, đề cử chuyển `PASSED → DECLINED` hoặc `PASSED → EXPIRED`, HR và Trung tâm nhận thông báo, SV bị đánh dấu theo chính sách Q4 cho vòng sau (BR-16) **And** suất được trả lại: SV `RESERVE` xếp cao nhất của JD (theo `compareRankKeys` của US-5.1) lên `PASSED` và nhận lời mời mới (AC-5). Không có ai Dự bị thì suất để trống cho vòng bổ sung.
- [ ] **AC-8** — **Given** lời mời đã quá `expires_at` theo đồng hồ server, **When** SV gọi accept, **Then** API trả `409` và đề cử không đổi. **Given** SV accept đúng lúc cron đang xử lý hết hạn, **When** hai thao tác chạy song song, **Then** chỉ một kết quả được ghi (cập nhật có điều kiện `response IS NULL` và so `expires_at`), không có trạng thái lai.
- [ ] **AC-9** — **Given** SV ở `RESERVE` quá thời hạn dự bị, **When** cron chạy, **Then** đề cử chuyển `RESERVE → CLOSED`, NV của cặp chuyển *Đóng*, SV về hàng chờ và nhận thông báo. **Given** JD đã nhận đủ chỉ tiêu, **Then** các đề cử `RESERVE` còn lại của JD chuyển `CLOSED` ngay (đề xuất, xem Dev notes). Hai instance cron chạy cùng lúc không xử lý trùng.
- [ ] **AC-10** — Phân quyền và IDOR: HR chỉ tạo lịch, đổi lịch, nhập kết quả cho đề cử thuộc JD của công ty mình (công ty khác → `404`); SV chỉ xác nhận, xin đổi lịch, nhận, từ chối với lịch và lời mời của chính mình (người khác → `404`); `CENTER` chỉ xem. Gọi sai vai trò → `403`.
- [ ] **AC-11** — AD-8: mọi chuyển trạng thái của đề cử, lịch phỏng vấn và lời mời đi qua `transitionTo` với audit trong cùng giao dịch; cập nhật với `row_version` cũ trả `409` (VD: HR sửa lịch trong lúc SV đang xác nhận lịch cũ).
- [ ] **AC-12** — Giao diện: cổng HR có màn *Lịch và kết quả phỏng vấn* (tạo lịch, đổi lịch, nhập kết quả, thấy yêu cầu đổi lịch). Màn *Đề cử* của SV (US-5.2) thêm lịch phỏng vấn với nút xác nhận / xin đổi lịch (ẩn sau lần xin đầu tiên) và lời mời với nút nhận / từ chối, đếm ngược theo `expires_at` từ server, dùng tốt trên điện thoại (NFR-13). Từ chối lời mời có hộp thoại xác nhận nêu rõ hệ quả theo chính sách Q4. Chuỗi giao diện tiếng Việt.

## Tasks

- [ ] **TASK-5.4.1** — Lược đồ, enum, migration (AC: 1, 2, 3, 5, 11)
  - [ ] Subtask 5.4.1.1 — Drizzle schema `interviews` và `offers` theo ARCH › *Các bảng chính*, thêm các cột ARCH chưa có: `id`, `row_version` cho cả hai; `confirmed_at`, `reschedule_requested_at`, `reschedule_note` cho `interviews` (đề xuất); `unique(nomination_id)` cho cả `interviews` và `offers`, vì mỗi đề cử chỉ lên `PASSED` một lần (đề xuất).
  - [ ] Subtask 5.4.1.2 — `packages/shared/schemas/interview.ts`: enum `mode` (`ONLINE`, `OFFLINE`), `result` (`PASSED`, `RESERVE`, `FAILED`, `ABSENT`), `offer_response` (`ACCEPTED`, `DECLINED`, `EXPIRED`); tên giá trị là đề xuất.
  - [ ] Subtask 5.4.1.3 — `packages/shared/states/interview.ts`, `packages/shared/states/offer.ts`: bảng chuyển trạng thái; migration trong `apps/api/drizzle/`.
- [ ] **TASK-5.4.2** — Lịch phỏng vấn (AC: 1, 2)
  - [ ] Subtask 5.4.2.1 — `apps/api/src/modules/interview/application/interview-schedule.service.ts`: `schedule`, `reschedule`, `confirm`, `requestReschedule` (giới hạn 1 lần).
  - [ ] Subtask 5.4.2.2 — Phát sự kiện cho `notification` (US-1.7): *Lịch phỏng vấn*, *Đổi lịch*.
- [ ] **TASK-5.4.3** — Kết quả phỏng vấn và BR-14 (AC: 3, 4)
  - [ ] Subtask 5.4.3.1 — `interview/domain/slot-policy.ts`: `resolvePassResult({ quota, accepted, passedPending })` trả `PASSED` hoặc `RESERVE` (hàm thuần).
  - [ ] Subtask 5.4.3.2 — `interview/application/interview-result.service.ts`: khóa theo JD trong giao dịch, đếm qua `NominationService` của `review`, chuyển trạng thái đề cử và NV, ghi audit.
- [ ] **TASK-5.4.4** — Lời mời: gửi, nhận, từ chối (AC: 5, 6, 7)
  - [ ] Subtask 5.4.4.1 — `interview/application/offer.service.ts`: `sendOffer`, `accept`, `decline`; BR-15 đóng NV khác qua `matching`; báo JD đủ chỉ tiêu qua `company`.
  - [ ] Subtask 5.4.4.2 — `promoteReserve(jdId)`: chọn SV Dự bị xếp cao nhất qua service export của `allocation` (bọc `compareRankKeys`), không import chéo `domain/` của module khác.
- [ ] **TASK-5.4.5** — Cron hết hạn lời mời và Dự bị (AC: 7, 8, 9)
  - [ ] Subtask 5.4.5.1 — `interview/application/offer-expiry.scheduler.ts` và `reserve-expiry.scheduler.ts`: `@nestjs/schedule` + `pg_try_advisory_lock`; `Clock` inject được của US-1.4; cập nhật có điều kiện để chống đua với accept.
- [ ] **TASK-5.4.6** — API và phân quyền (AC: 10, 11)
  - [ ] Subtask 5.4.6.1 — `interview/api/interview.controller.ts`, `interview/api/offer.controller.ts`: route theo ARCH và các route đề xuất ở AC-2, AC-7; `@Roles()` và kiểm tra quyền sở hữu trong service.
- [ ] **TASK-5.4.7** — Giao diện (AC: 12)
  - [ ] Subtask 5.4.7.1 — Đọc `DESIGN.md` trước khi code; ghi `Design applied: …` vào story.
  - [ ] Subtask 5.4.7.2 — `apps/web/src/features/hr/interviews/`; mở rộng `apps/web/src/features/student/nominations/` với lịch và lời mời.
- [ ] **TASK-5.4.8** — Kiểm thử (AC: 1–11)
  - [ ] Subtask 5.4.8.1 — `apps/api/src/modules/interview/domain/__tests__/slot-policy.spec.ts`.
  - [ ] Subtask 5.4.8.2 — `apps/api/test/interview/interview.e2e-spec.ts`, `offer.e2e-spec.ts`, `interview-idor.e2e-spec.ts` (testcontainers; đồng hồ giả lập).

## Dev notes

### Architecture constraints

- [AD-8](../../ARCHITECTURE.md#architecture-decisions): mọi chuyển trạng thái của đề cử, lịch phỏng vấn, lời mời đi qua `transitionTo` theo bảng trong `packages/shared/states`, audit trong cùng giao dịch, `409` khi lệch `row_version`. ARCH › *Các bảng chính* chưa có `row_version` (và `id`) ở `interviews`, `offers`; story thêm để thực hiện AD-8.
- AGENTS › Nguyên tắc 1, 2 và BR-13: kết quả phỏng vấn do HR nhập; không có bước nào dùng LLM. Việc chọn người Dự bị lên Đạt là quy tắc tất định, không phải quyết định của AI.
- AGENTS › Nguyên tắc 11: BR-14 cần ràng buộc chống đua. Story dùng khóa theo JD trong giao dịch (đề xuất: `pg_advisory_xact_lock` theo `jd_id`) vì `interview` không được khóa thẳng dòng `job_descriptions` của module `company` (Nguyên tắc 13).
- AGENTS › Nguyên tắc 13: `interview` đổi trạng thái đề cử qua `NominationService` của `review`, đổi trạng thái NV qua service của `matching`, báo JD đủ chỉ tiêu qua service của `company`, so thứ hạng qua service của `allocation`.
- **Chọn người Dự bị lên Đạt (đề xuất).** PRD nói Dự bị "được chuyển thành Đạt nếu có người từ chối" nhưng không nói hệ thống tự chuyển hay HR chọn. Story tạm cho hệ thống tự chọn SV Dự bị xếp cao nhất theo cùng hàm so sánh của US-5.1 (tất định, giải thích được) và báo HR. Hỏi trước khi chốt.
- **Thời hạn Dự bị (cần chốt).** PRD có "hết thời hạn dự bị thì về hàng chờ" nhưng bảng tham số GĐ0 không có tham số này và không có giá trị đề xuất. Story đưa thành tham số `campaigns.config.reserve_ttl_days` (tên đề xuất), chưa có mặc định; hỏi trước khi làm. Khi JD đã nhận đủ chỉ tiêu thì không còn suất nào có thể trả lại, nên story đóng ngay các Dự bị còn lại của JD đó (đề xuất).
- **Trạng thái "Sinh viên trong đợt".** ARCH chưa có bảng hay cột cho vòng đời này. Story suy ra từ đề cử (đề xuất): có đề cử `ACCEPTED` → *Đã có nơi thực tập*; có đề cử thuộc tập BR-08 → *Đang trong quy trình*; còn lại → *Hàng chờ*. Cờ hạ ưu tiên (BR-16) cũng suy ra từ đề cử `DECLINED` / `EXPIRED`, không thêm cột.
- **Lịch phỏng vấn.** ARCH chưa có cột cho xác nhận và xin đổi lịch, chưa có route cho SV xác nhận, xin đổi lịch, từ chối lời mời. Các cột và route ở AC-2, AC-7, TASK-5.4.1 là đề xuất theo quy ước đặt tên của ARCH.
- Chạm Q4 (SV từ chối lời mời): tạm dùng Đề xuất "xếp ưu tiên thấp nhất ở vòng sau", đưa thành tham số `campaigns.config.offer_decline_policy` với giá trị `DEMOTE` (mặc định) hoặc `EXCLUDE` (tên đề xuất); hỏi trước khi chốt. Story này chỉ ghi nhận việc từ chối / quá hạn; US-5.5 áp chính sách khi dựng đầu vào vòng sau. Chưa rõ "vòng sau" là chỉ vòng kế tiếp hay mọi vòng còn lại; story tạm áp cho mọi vòng còn lại của đợt.
- T_offer (mặc định 3 ngày) tính theo ngày lịch, đọc từ `campaigns.config.t_offer_days`. Tên khóa `campaigns.config` theo schema của US-1.4.

### Cross-story dependencies

- Builds on [US-5.3](US-5.3-hr-nomination-review.md) — đề cử ở `INTERVIEW`, `hr_reviews`, kiểm tra quyền sở hữu theo công ty của HR.
- Builds on [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md) — `NominationService`, enum `nomination` trong `packages/shared/states`, rank key trong snapshot, màn *Đề cử* của SV.
- Builds on [US-5.1](US-5.1-allocation-engine-property-tests.md) — `compareRankKeys` (qua service của `allocation`) để chọn người Dự bị.
- Builds on [US-1.4](US-1.4-campaign-setup-and-config.md) — `Clock` và `FakeClock` cho test T_offer, hết hạn Dự bị.
- Builds on [US-1.7](US-1.7-notifications-sse-email-reminders.md) — thông báo lịch, đổi lịch, lời mời, nhận / từ chối.
- Builds on [US-1.5](US-1.5-company-hr-accounts-jd-posting-approval.md) — chỉ tiêu JD và trạng thái JD *Đủ chỉ tiêu*.
- Builds on [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md) — `@Roles()`, helper đăng nhập cho test IDOR.
- Required by [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) — số đã nhận và đang trong quy trình theo JD (cho C_j(r)), danh sách SV bị hạ ưu tiên hoặc bị loại theo Q4, hàng chờ.
- Required by [US-6.1](US-6.1-campaign-dashboard.md), [US-6.5](US-6.5-campaign-close-report-export.md) — tỷ lệ lấp đầy, số SV nhận thực tập.
- Sibling [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) — cùng tuần T12, làn A; US-5.5 bắt đầu sau khi US-5.4 merge (migration và `packages/shared/states`).

### Performance budget

- Hạn xác nhận lời mời T_offer mặc định 3 ngày (PRD GĐ9), do server quyết định. Cron hết hạn chạy đủ dày để lời mời quá hạn được xử lý trong vòng vài phút (chu kỳ cron là đề xuất, chốt khi làm). Kiểm chứng bằng `offer.e2e-spec.ts` với đồng hồ giả lập.

### What we explicitly did NOT do

- Không tích hợp lịch hay email doanh nghiệp, không sinh link họp (PRD › Phạm vi MVP: Mở rộng).
- Không nhắc lịch phỏng vấn trước giờ hẹn; PRD › Thông báo không có sự kiện này.
- Không quản lý quá trình thực tập sau khi SV nhận (PRD › Ngoài phạm vi).
- Không dùng LLM tóm tắt nhận xét phỏng vấn.
- Không áp chính sách Q4 vào phân bổ ở story này; chỉ ghi nhận. Áp ở US-5.5.

### References

- [Source: PRD › GĐ9 – Phỏng vấn và xác nhận](../../PRD.md)
- [Source: PRD › Vòng đời trạng thái (Hồ sơ ứng tuyển, Sinh viên trong đợt, JD)](../../PRD.md)
- [Source: PRD › Quy tắc nghiệp vụ (BR-13, BR-14, BR-15, BR-16); Thông báo](../../PRD.md)
- [Source: PRD › Các điểm cần chốt (Q4)](../../PRD.md)
- [Source: PRD FR-30, FR-31](../../PRD.md#functional-requirements)
- [Source: ARCHITECTURE › Các module; Quản lý trạng thái; Tác vụ định kỳ](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Data architecture (Các bảng chính)](../../ARCHITECTURE.md#data-architecture)
- [Source: ARCHITECTURE › API architecture](../../ARCHITECTURE.md#api-architecture)
- [Source: ARCHITECTURE › Security architecture](../../ARCHITECTURE.md#security-architecture)
- [Source: CONTEXT D8](../../CONTEXT.md)
- [Source: EPIC-5](../epics/EPIC-5.md)
- [LESSONS](../../LESSONS.md) — đọc lại khi bắt đầu story và ghi `Lessons applied:`.

## Verification commands

> Chưa có `package.json`. Lệnh chạy cụ thể điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case; đường dẫn test là đề xuất, theo quy ước test của US-1.1.

| AC | Command |
|---|---|
| AC-1 | `apps/api/test/interview/interview.e2e-spec.ts` › `GĐ9 HR schedules interview for INTERVIEW nomination; duplicate → 409` |
| AC-2 | `interview.e2e-spec.ts` › `GĐ9 student confirms; reschedule request allowed once` |
| AC-3 | `interview.e2e-spec.ts` › `BR-13 HR records PASSED/RESERVE/FAILED/ABSENT; ABSENT treated as FAILED` |
| AC-4 | `apps/api/src/modules/interview/domain/__tests__/slot-policy.spec.ts` › `BR-14 PASSED beyond remaining quota becomes RESERVE`; `interview.e2e-spec.ts` › `BR-14 concurrent PASSED for last slot: exactly one wins` |
| AC-5 | `apps/api/test/interview/offer.e2e-spec.ts` › `GĐ9 PASSED creates offer expiring after T_offer` |
| AC-6 | `offer.e2e-spec.ts` › `BR-15 accept closes other preferences and decrements remaining quota` |
| AC-7 | `offer.e2e-spec.ts` › `BR-16 decline or expiry frees slot and promotes top RESERVE` |
| AC-8 | `offer.e2e-spec.ts` › `GĐ9 accept after expiry → 409`, `GĐ9 accept racing expiry cron yields one outcome` |
| AC-9 | `offer.e2e-spec.ts` › `GĐ9 RESERVE closes after reserve TTL`, `GĐ9 remaining RESERVE closes when JD quota is filled` |
| AC-10 | `apps/api/test/interview/interview-idor.e2e-spec.ts` › `BR-11 HR of another company → 404`, `student acts only on own interview and offer` |
| AC-11 | `interview.e2e-spec.ts` › `AD-8 stale row_version → 409` |
| AC-12 | Review giao diện theo `DESIGN.md` và quy tắc skill shadcn; ảnh chụp màn hình HR (desktop) và SV (điện thoại) đính kèm PR |

## Changelog entry

### Added
- Phỏng vấn (module `interview`): HR lên lịch và nhập kết quả Đạt / Dự bị / Không đạt / Vắng; SV xác nhận hoặc xin đổi lịch một lần.
- BR-14: số SV Đạt không vượt chỉ tiêu còn lại, phần dư tự chuyển Dự bị; Dự bị xếp cao nhất được lên Đạt khi có suất trống.
- Lời mời thực tập có hạn T_offer do server quyết định; SV nhận thì đóng mọi hồ sơ khác (BR-15); từ chối hoặc quá hạn thì trả suất và ghi nhận để hạ ưu tiên ở vòng sau (BR-16).
- Màn *Lịch và kết quả phỏng vấn* cho HR; lịch phỏng vấn và lời mời trên màn *Đề cử* của SV.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-30, FR-31](../../PRD.md#functional-requirements)
- [ARCHITECTURE AD-8](../../ARCHITECTURE.md#architecture-decisions)
- [Epic EPIC-5](../epics/EPIC-5.md)
- [CONTEXT D8](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
- [US-5.3](US-5.3-hr-nomination-review.md) · [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md)
