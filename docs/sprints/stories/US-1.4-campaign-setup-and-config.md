---
id: US-1.4
title: "Tạo và cấu hình đợt thực tập"
epic: EPIC-1
status: review
priority: P0
points: 5
sprint: sprint-2026-W42
version_shipped: 0.3.0
prd_ref: [FR-2]
arch_ref: [AD-8]
depends_on: [US-1.2, US-1.3]
assignee: PDTnhah
commit: 928c04c367039477ed9287f80c28f476d90d084d
created: 2026-10-07
updated: 2026-10-12
---

## Story refresh — 2026-10-12

Đọc lại story vào ngày 2026-10-12 trên nhánh `us-1.4` (tách từ `dev`, đã có US-1.2 và US-1.3). Các quyết định sau được chốt vào story; số AC giữ nguyên ([CONTEXT D27](../../CONTEXT.md)):

- **Sprint**: story vào `sprint-2026-W42`. Lộ trình gốc đặt story ở T3 (W43); US-1.2 và US-1.3 xong sớm.
- **Các đề xuất ở *Dev notes* được giữ** (người dùng chốt): đối tượng lưu ở `campaigns.config.target` (`cohorts`, `majors`); STUDENT thấy đợt đã rời `DRAFT` có target khớp cả khóa lẫn ngành của mình, HR thấy mọi đợt đã rời `DRAFT`, CENTER và ADMIN thấy tất cả; khóa tên, đối tượng và tham số khi đợt rời `DRAFT`; một mốc `intake_end` cho cả JD và CV; `n_nv` = 3 (Q1) và `k` = 1,5 (Q3) là tham số, Q1 và Q3 vẫn để mở.
- **Gia hạn mốc (AC-4)**: sau `DRAFT` được lùi mọi mốc chưa tới, kể cả mốc kết thúc của pha đang chạy (ví dụ gia hạn nộp CV). Chỉ được lùi về sau, giữ thứ tự tăng dần, bắt buộc kèm lý do. Mốc đã qua không sửa được.
- **`assertPhase` tính cả mốc**: từ chối khi trạng thái không nằm trong danh sách cho phép, hoặc khi mốc kết thúc của pha hiện tại đã qua mà tác vụ định kỳ chưa kịp chuyển. Như vậy story sau không phải tự so giờ với mốc (Goal). Hàm nhận thêm giao dịch của bên gọi để đọc đợt với `FOR SHARE`.
- **Không có vòng phụ thuộc `campaign` ↔ `student`**: US-1.6 cho `student` gọi `CampaignService.assertPhase`, nên `campaign` không import `student`. Module `campaign` khai cổng `StudentAudienceLookup`; `StudentModule` đăng ký `StudentService.findAudience` khi khởi động. Chưa có ai đăng ký thì STUDENT không thấy đợt nào.
- **Tên khóa**: trường cấp cao của API viết camelCase như các API đã có (`rowVersion`, `phaseDeadlines`, `target`, `config`); khóa trong JSONB viết snake_case như *Dev notes* (`intake_end`, `n_nv`…). API trả `target` ở cấp cao, DB lưu ở `config.target`.
- **Tác vụ định kỳ**: chạy mỗi phút; biến môi trường `SCHEDULER_ENABLED` (mặc định `true`) để integration test tắt cron và gọi thẳng `runOnce()`. Đợt trễ nhiều mốc được chuyển lần lượt từng pha trong một lần chạy, mỗi pha một dòng audit và một sự kiện.
- **Chọn ngày giờ (AC-9)**: Calendar của shadcn với `react-day-picker` 10.0.1 và locale `vi` của date-fns (người dùng chốt; thêm vào ARCH › *Tech stack*).
- **Phiên bản ghim**: `@nestjs/schedule` 6.1.3, `@nestjs/event-emitter` 3.1.0 (dòng cho NestJS 11; bản 12.x chỉ có ESM, Jest của API không nạp được, [LESSONS §9](../../LESSONS.md)), `react-day-picker` 10.0.1. Chỉ chọn bản đã phát hành ít nhất 2 tuần.
- **Version**: 0.3.0.

## Goal

Cán bộ Trung tâm tạo một đợt thực tập với đối tượng, mốc thời gian từng giai đoạn và các tham số (N_NV, θ_cv, θ_test, α, β, k, R_max, T_test, SLA_HR, T_offer). Đến mốc, đợt tự chuyển sang giai đoạn kế tiếp. Ở mỗi giai đoạn, hệ thống chỉ cho phép các thao tác tương ứng, ví dụ quá hạn nộp CV thì không nộp được nữa. Sau story này, story của các giai đoạn sau (nộp JD, nộp CV, chọn NV, làm test, phân bổ) chỉ cần đọc tham số từ `campaigns.config` và gọi một hàm kiểm tra pha. Chúng không phải tự xử lý mốc thời gian.

## Background

FR-2 và UC-01 phủ GĐ0 của PRD: tạo đợt, khai báo đối tượng (khóa, ngành) và mốc thời gian, thiết lập tham số theo bảng mặc định ở PRD GĐ0. Vòng đời đợt theo PRD: *Nháp → Mở nhận JD/CV → Chọn nguyện vọng → Làm test → Phân bổ & HR duyệt → Vòng bổ sung → Đã đóng*. Ở mỗi trạng thái hệ thống chỉ cho phép thao tác tương ứng (EPIC-1 › *Cross-cutting invariants*: "Thao tác đúng pha của đợt").

ARCH › *Các module*: module `campaign` lo đợt, tham số, trạng thái và mốc thời gian. ARCH › *Các bảng chính*: `campaigns(id, name, status, phase_deadlines JSONB, config JSONB)`. ARCH › *Tác vụ định kỳ*: chuyển trạng thái đợt theo mốc bằng `@nestjs/schedule` cùng `pg_try_advisory_lock`, để nhiều instance không chạy trùng.

Bảng chuyển và `transitionTo` có từ US-1.2 (AD-8). Story này thêm phần quyết định *khi nào* chuyển. Mọi lần chuyển, kể cả do hệ thống tự làm, đều đi qua `transitionTo` và có audit. Tham số đợt được các story sau đọc: N_NV (US-3.3), θ_cv (US-3.1), θ_test, α, β (US-4.4), k, R_max (US-5.2, US-5.5), T_test (US-4.3), SLA_HR (US-5.3), T_offer (US-5.4).

**Lessons applied**: §5 — chạy lại `pnpm depcruise` và `pnpm depcruise:fixture` sau khi thêm module `campaign`; §6 — story không sinh migration (bảng có từ US-1.2), kiểm `git status --porcelain apps/api/drizzle` rỗng sau `db:generate`; §7 — repository khai kiểu bảng cụ thể, chạy `pnpm lint` chứ không chỉ `tsc`; §8 — sau `shadcn add` đổi dải `^` thành bản chính xác đủ 2 tuần, đọc lại file sinh ra và ghi chỗ sửa vào `DESIGN.md` §6.

## Acceptance criteria

- [x] **AC-1** — **Given** người gọi có vai trò `CENTER`, **When** gửi `POST /api/campaigns` với tên, đối tượng (khóa, ngành), mốc thời gian và tham số (có thể bỏ trống tham số), **Then** đợt được tạo ở trạng thái `DRAFT` **And** tham số bỏ trống nhận giá trị mặc định của PRD GĐ0: N_NV = 3, θ_cv = 50, θ_test = 40, α = 0,4, β = 0,6, k = 1,5, R_max = 3, T_test = 45 phút, SLA_HR = 5 ngày làm việc, T_offer = 3 ngày **And** việc tạo đợt có dòng audit.
- [x] **AC-2** — **Given** dữ liệu cấu hình sai: α + β ≠ 1 (so sau khi quy về số nguyên ×100), α hoặc β ngoài [0, 1], θ_cv hoặc θ_test ngoài [0, 100], N_NV hoặc R_max không phải số nguyên dương, k < 1, T_test ≤ 0, hoặc các mốc không tăng dần theo thứ tự giai đoạn, **When** tạo hoặc sửa đợt, **Then** API trả `400` kèm lỗi theo từng trường. Cùng một Zod schema trong `packages/shared/schemas/` được dùng cho form và cho API.
- [x] **AC-3** — **Given** người gọi là `HR`, `STUDENT` hoặc `ADMIN`, **When** tạo hoặc sửa đợt, **Then** API trả `403` **And** khi đọc danh sách đợt, người gọi chỉ thấy đợt mình tham gia, theo quy tắc ở *Dev notes*. Đọc một đợt ngoài phạm vi bằng ID thì nhận `404`.
- [x] **AC-4** — **Given** đợt ở `DRAFT`, **When** `CENTER` sửa bằng `PATCH /api/campaigns/{id}` kèm `row_version` đúng, **Then** mọi trường được sửa và có audit (trước/sau) **And** `row_version` lệch thì trả `409` **And** khi đợt đã rời `DRAFT`, sửa tham số trả `409` mã `CAMPAIGN_CONFIG_LOCKED`; chỉ được lùi mốc của giai đoạn chưa bắt đầu, phải kèm lý do và có audit.
- [x] **AC-5** — **Given** đợt ở `DRAFT` có đủ mốc và mọi mốc ở tương lai, **When** `CENTER` gọi `POST /api/campaigns/{id}/open`, **Then** đợt chuyển `DRAFT → INTAKE` qua `transitionTo` (có audit) **And** phát sự kiện `campaign.opened` qua `@nestjs/event-emitter` **And** thiếu mốc hoặc có mốc đã qua thì trả `422` mã `TRANSITION_CONDITION_FAILED`, đợt giữ nguyên.
- [x] **AC-6** — **Given** đợt đang ở một giai đoạn có chuyển tự động và đồng hồ đã qua mốc kết thúc của giai đoạn đó, **When** tác vụ định kỳ chạy, **Then** đợt chuyển sang giai đoạn kế tiếp qua `transitionTo` với actor `system` và lý do ghi tên mốc **And** sau khi giao dịch commit, phát sự kiện `campaign.phase_changed` (`campaign_id`, `from`, `to`); sự kiện này cũng được phát cho mọi lần chuyển thủ công **And** chạy lại tác vụ lần nữa không tạo thêm thay đổi, audit hay sự kiện. Các cạnh tự động và thủ công liệt kê ở *Dev notes*.
- [x] **AC-7** — **Given** hai instance API cùng chạy tác vụ định kỳ ở cùng thời điểm, **When** cả hai thấy đợt đã qua mốc, **Then** chỉ một instance chuyển trạng thái (nhờ `pg_try_advisory_lock` và `row_version`) **And** chỉ có một dòng audit.
- [x] **AC-8** — Module `campaign` export `CampaignService.assertPhase(campaignId, allowed)`. **Given** một endpoint chỉ cho phép ở `INTAKE`, **When** gọi lúc đợt đang ở `PREFERENCE_SELECTION`, **Then** API trả `409` mã `CAMPAIGN_PHASE_MISMATCH` kèm trạng thái hiện tại của đợt. US-1.5 (nộp JD) và US-1.6 (nộp CV) dùng hàm này.
- [ ] **AC-9** — Cổng Trung tâm có màn "Đợt thực tập": danh sách đợt kèm trạng thái và mốc kế tiếp; form tạo/sửa chia ba phần (đối tượng, mốc thời gian, tham số) dùng React Hook Form + Zod schema dùng chung; chọn ngày giờ theo locale `vi` của date-fns; nút "Mở đợt" có hộp thoại xác nhận; đủ bốn trạng thái rỗng, đang tải, lỗi, có dữ liệu theo `DESIGN.md`. Tham số bị khóa thì hiện ở dạng chỉ đọc.

## Tasks

- [x] **TASK-1.4.1** — Schema cấu hình đợt dùng chung (AC: 1, 2)
  - [x] Subtask 1.4.1.1 — `packages/shared/schemas/campaign.ts`: Zod schema cho đối tượng, `phase_deadlines`, `config`, kèm giá trị mặc định và kiểm tra α + β = 1 theo số nguyên ×100.
- [x] **TASK-1.4.2** — Domain đợt (AC: 6, 8)
  - [x] Subtask 1.4.2.1 — `apps/api/src/modules/campaign/domain/next-auto-transition.ts`: hàm thuần nhận trạng thái, mốc và thời điểm hiện tại, trả cạnh tự động cần chuyển hoặc không có.
  - [x] Subtask 1.4.2.2 — `apps/api/src/modules/campaign/domain/phase.ts`: danh sách cạnh tự động và cạnh thủ công.
- [x] **TASK-1.4.3** — API và service (AC: 1, 3, 4, 5, 8)
  - [x] Subtask 1.4.3.1 — `apps/api/src/modules/campaign/api/campaign.controller.ts`: `POST /api/campaigns`, `GET /api/campaigns`, `GET /api/campaigns/{id}`, `PATCH /api/campaigns/{id}`, `POST /api/campaigns/{id}/open`.
  - [x] Subtask 1.4.3.2 — `apps/api/src/modules/campaign/application/campaign.service.ts`: tạo, sửa có khóa tham số, mở đợt bằng `transitionTo` + guard, `assertPhase`; phát `campaign.opened` và `campaign.phase_changed` sau khi commit.
  - [x] Subtask 1.4.3.3 — `apps/api/src/modules/campaign/infrastructure/campaign.repository.ts`: truy vấn Drizzle bảng `campaigns`.
- [x] **TASK-1.4.4** — Tác vụ định kỳ chuyển pha (AC: 6, 7)
  - [x] Subtask 1.4.4.1 — `apps/api/src/modules/campaign/application/campaign-phase.scheduler.ts`: `@nestjs/schedule`, `pg_try_advisory_lock`, gọi `transitionTo` với actor `system`.
  - [x] Subtask 1.4.4.2 — `apps/api/src/common/clock/clock.ts` (interface `Clock`, `SystemClock`, provider NestJS) và `apps/api/test/helpers/fake-clock.ts` (`FakeClock` có `set()`, `advance()`), để test điều khiển được thời gian. US-1.7 và US-4.3 dùng lại, không tạo bản thứ hai.
- [x] **TASK-1.4.5** — Đọc `DESIGN.md` trước khi code giao diện; ghi dòng `Design applied: …` vào *Implementation notes* (AC: 9)
- [x] **TASK-1.4.6** — Màn cấu hình đợt (AC: 9)
  - [x] Subtask 1.4.6.1 — `apps/web/src/features/center/campaigns/`: trang danh sách, form tạo/sửa, hộp thoại mở đợt.
- [x] **TASK-1.4.7** — Test (AC: 1–8)
  - [x] Subtask 1.4.7.1 — Unit test cho schema và `next-auto-transition`; integration test cho API, scheduler và `assertPhase` (dùng `loginAs` của US-1.3, helper state của US-1.2).

## Dev notes

### Architecture constraints

- AD-8 (đã hiện thực ở US-1.2): mọi chuyển trạng thái đợt, kể cả chuyển tự động, đi qua `transitionTo`. Scheduler không được cập nhật thẳng cột `status`.
- ARCH › *Tác vụ định kỳ*: `@nestjs/schedule` + `pg_try_advisory_lock`. Không dùng hàng đợi hay thư viện lập lịch khác.
- AGENTS › Nguyên tắc 2: chuyển trạng thái và kiểm tra pha không dùng LLM.
- AGENTS › Nguyên tắc 13: module khác kiểm tra pha qua `CampaignService.assertPhase` đã export và đọc tham số qua service của `campaign`, không truy vấn bảng `campaigns`. Hàm quyết định cạnh tự động nằm ở `domain/`, không import NestJS hay Drizzle.
- AGENTS › Nguyên tắc 9 (tinh thần): α, β so sánh sau khi quy về số nguyên ×100 để tránh sai số dấu phẩy động.
- **Cạnh tự động và thủ công (đề xuất, PRD chỉ nói "chuyển theo mốc"):** tự động khi qua mốc: `INTAKE → PREFERENCE_SELECTION`, `PREFERENCE_SELECTION → TESTING`, `TESTING → ALLOCATION_REVIEW`. Thủ công: `DRAFT → INTAKE` (AC-5); `ALLOCATION_REVIEW → SUPPLEMENTARY` và đóng đợt thuộc US-5.5 (GĐ10 nói Cán bộ Trung tâm mở vòng bổ sung và đóng đợt).
- **Chạm Q1:** tạm dùng Đề xuất (sinh viên chọn tối đa 3 NV), đưa thành tham số `campaigns.config.n_nv` (mặc định 3); hỏi trước khi chốt.
- **Chạm Q3:** tạm dùng Đề xuất k = 1,5, đưa thành tham số `campaigns.config.k`; hỏi trước khi chốt.
- **Tên khóa (đề xuất, spec không đặt tên):** `config`: `n_nv`, `theta_cv`, `theta_test`, `alpha`, `beta`, `k`, `r_max`, `t_test_minutes`, `sla_hr_business_days`, `t_offer_days`. `phase_deadlines`: `intake_end`, `preference_end`, `testing_end`. Mốc lưu dạng `timestamptz`; giao diện hiển thị theo giờ Việt Nam.
- **Những chỗ spec thiếu, cần hỏi trước khi chốt:**
  - Đối tượng của đợt (khóa, ngành) không có cột ở ARCH › *Các bảng chính*. Đề xuất lưu trong `campaigns.config.target` (`cohorts`, `majors`).
  - "Đợt mình tham gia" (EPIC-1 › *RBAC additions*) chưa định nghĩa. Đề xuất: `STUDENT` thấy đợt có `target` khớp khóa và ngành của mình; `HR` thấy mọi đợt đã rời `DRAFT` (ARCH không có bảng nối doanh nghiệp với đợt); `CENTER`, `ADMIN` thấy tất cả.
  - Khóa tham số sau khi mở đợt (AC-4) là đề xuất. PRD chỉ nói không tự đổi trọng số trong một đợt đang chạy (*Vòng phản hồi*), không nói Trung tâm có được sửa tay hay không.
  - PRD GĐ0 nói "một số tham số có thể ghi đè ở cấp JD" nhưng không nói tham số nào, và `job_descriptions` không có cột cho việc này. Story này chưa làm ghi đè cấp JD.
  - Giai đoạn *Mở nhận JD/CV* gộp JD và CV. Spec chưa nói hạn nộp JD có khác hạn nộp CV không, cũng chưa có mốc cho việc xác nhận hồ sơ năng lực và chạy chấm phù hợp (GĐ3) trước khi chọn NV. Tạm dùng một mốc `intake_end` cho cả JD và CV.
  - Thời hạn lưu dữ liệu (NFR-2: "do Trung tâm cấu hình") không có trong bảng tham số GĐ0. Story này chưa thêm.
- Story này không thêm mục AD mới.

### Cross-story dependencies

- Builds on [US-1.2](US-1.2-core-db-schema-transition-audit-log.md): bảng `campaigns`, vòng đời đợt trong `packages/shared/states/campaign.ts`, `transitionTo`, helper test trạng thái.
- Builds on [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md): `@Roles()`, `record-access.ts`, `loginAs`, layout `/admin`, `DESIGN.md`.
- Required by [US-1.6](US-1.6-data-consent-and-cv-upload.md): `assertPhase(…, ['INTAKE'])` cho nộp CV; `target` để biết đợt nào sinh viên được nộp.
- Required by [US-1.7](US-1.7-notifications-sse-email-reminders.md): sự kiện `campaign.opened` và `phase_deadlines` để nhắc hạn.
- Required by [US-3.3](US-3.3-shortlist-and-preferences.md): `n_nv`, pha `PREFERENCE_SELECTION`, sự kiện `campaign.phase_changed` khi đợt chuyển `PREFERENCE_SELECTION → TESTING` (tự gán NV theo Q6).
- Required by [US-4.3](US-4.3-exam-room.md): dùng lại `apps/api/src/common/clock/` và `FakeClock` tạo ở đây.
- Required by các story EPIC-4, EPIC-5 đọc `theta_test`, `alpha`, `beta`, `t_test_minutes`, `k`, `r_max`, `sla_hr_business_days`, `t_offer_days`.
- Sibling [US-1.5](US-1.5-company-hr-accounts-jd-posting-approval.md): cùng tuần T3, dùng `assertPhase` cho nộp JD. Story này merge trước vì thêm vào `packages/shared/schemas/campaign.ts` ([sprints/README › Chạy song song](../README.md)). Story này không cần migration mới (bảng có từ US-1.2), nên US-1.5 được sinh migration trong đợt.

### What we explicitly did NOT do

- Không làm ghi đè tham số ở cấp JD. Trigger: chốt danh sách tham số được ghi đè.
- Không làm mở vòng bổ sung và đóng đợt. Thuộc US-5.5.
- Không làm lịch ngày nghỉ để tính "ngày làm việc" của SLA_HR. Thuộc US-5.3 khi tính hạn.

### References

- [Source: PRD › Functional Requirements (FR-2)](../../PRD.md#functional-requirements)
- [Source: PRD › Quy trình nghiệp vụ theo giai đoạn › GĐ0; Vòng đời trạng thái; Các điểm cần chốt (Q1, Q3)](../../PRD.md)
- [Source: ARCHITECTURE › Component architecture › Các module, Quản lý trạng thái, Tác vụ định kỳ](../../ARCHITECTURE.md#component-architecture)
- [Source: ARCHITECTURE › Data architecture › Các bảng chính](../../ARCHITECTURE.md#data-architecture)
- [Source: CONTEXT D8](../../CONTEXT.md)
- [Source: EPIC-1 › Cross-cutting invariants; RBAC additions](../epics/EPIC-1.md)

## Verification commands

| AC | Command |
|---|---|
| AC-1 | `pnpm --filter @srm/api exec jest --selectProjects integration test/integration/campaign.int-spec.ts` › "GĐ0: center creates campaign in DRAFT with PRD default config and audit row"; `pnpm --filter @srm/shared test` › "GĐ0: omitted parameters take the PRD defaults" |
| AC-2 | `pnpm --filter @srm/shared test` › `schemas/__tests__/campaign.spec.ts` › "GĐ0: rejects alpha + beta != 1"; "GĐ0: compares alpha + beta as integers ×100, not floats"; "GĐ0: rejects thresholds outside 0..100"; "GĐ0: rejects non-increasing deadlines"; `campaign.int-spec.ts` › "GĐ0: invalid parameters and deadlines answer 400 with one issue per field" |
| AC-3 | `campaign.int-spec.ts` › "FR-2: non-center roles get 403 on create and update"; "FR-2: campaign outside caller scope returns 404"; `pnpm --filter @srm/api test:unit` › `visibility.spec.ts`; `route-guards.int-spec.ts` (mọi route mới có `@Roles`) |
| AC-4 | `campaign.int-spec.ts` › "FR-2: stale row_version returns 409"; "FR-2: config edit after DRAFT returns 409 CAMPAIGN_CONFIG_LOCKED"; "FR-2: extending a future deadline requires reason and writes audit"; "FR-2: a deadline that has passed cannot move"; `deadline-change.spec.ts` |
| AC-5 | `campaign.int-spec.ts` › "GĐ0: open moves DRAFT to INTAKE with audit and emits campaign.opened"; "GĐ0: open with missing or past deadline returns 422"; `phase-check.spec.ts` › `checkOpenable` |
| AC-6 | `pnpm --filter @srm/api test:unit` › `src/modules/campaign/domain/__tests__/next-auto-transition.spec.ts` › "GĐ0: past intake_end yields INTAKE→PREFERENCE_SELECTION"; `test/integration/campaign-scheduler.int-spec.ts` › "GĐ0: scheduler transitions by system actor, emits campaign.phase_changed once and is idempotent"; "GĐ0: a campaign several deadlines behind catches up one phase at a time" |
| AC-7 | `campaign-scheduler.int-spec.ts` › "GĐ0: two concurrent scheduler runs produce one transition and one audit row"; "GĐ0: a run that cannot take the advisory lock does nothing"; "GĐ0: a campaign changed since the scan is skipped without audit (row_version)" |
| AC-8 | `test/integration/campaign-phase-guard.int-spec.ts` › "FR-2: action outside its phase returns 409 CAMPAIGN_PHASE_MISMATCH"; "FR-2: action after the phase deadline is refused even before the scheduler moves the campaign" |
| AC-9 | Kiểm tay (bên dưới); `pnpm --filter @srm/web typecheck && pnpm --filter @srm/web lint && pnpm build` |

Lệnh chạy toàn bộ: `pnpm typecheck && pnpm lint && pnpm test` (integration cần Docker), `pnpm depcruise && pnpm depcruise:fixture`, `pnpm --filter @srm/api db:generate && git status --porcelain apps/api/drizzle` (phải rỗng), `pnpm api:sync` (không đổi file).

**Kiểm tay AC-9** — dựng `docker compose -f deploy/docker-compose.yml up -d --build --wait`, seed (`docker compose -f deploy/docker-compose.yml exec -e NODE_ENV=development api node dist/db/seed/dev-seed.js`), mở `http://localhost:8080`, đăng nhập `center@srm.local` (mật khẩu seed `Srm-Dev-12345`):

1. "Đợt thực tập": bảng có đợt mẫu ở trạng thái "Nháp", cột mốc kế tiếp ghi "Chưa mở đợt". Bật throttling của trình duyệt để thấy Skeleton; dừng API (`docker compose -f deploy/docker-compose.yml stop api`) để thấy Alert lỗi có nút "Thử lại"; DB không có đợt thì thấy Empty có nút "Tạo đợt".
2. "Tạo đợt": ba thẻ Đối tượng, Mốc thời gian, Tham số; tham số điền sẵn mặc định. Nhập α = 0,5 rồi gửi thì lỗi "α + β phải bằng 1" hiện ở ô β. Chọn ngày bằng Calendar (tên tháng, thứ tiếng Việt), đổi giờ ở ô giờ.
3. "Mở đợt" trên đợt mẫu (chưa có mốc): hộp thoại xác nhận; bấm "Mở đợt" thì hiện "Đợt chưa đủ ba mốc thời gian…" ngay trong hộp thoại.
4. Mở một đợt đủ mốc: trạng thái thành "Mở nhận JD/CV"; trang đợt hiện đối tượng và tham số ở dạng chỉ đọc; mốc chỉ lùi được về sau và bắt buộc lý do.
5. Tài khoản `admin@srm.local`: menu không có "Đợt thực tập"; mở thẳng `/admin/campaigns` thì về trang chủ cổng.

## Changelog entry

### Added
- Trung tâm tạo và cấu hình đợt thực tập: đối tượng, mốc thời gian, tham số N_NV, θ_cv, θ_test, α, β, k, R_max, T_test, SLA_HR, T_offer với giá trị mặc định theo PRD.
- Đợt tự chuyển giai đoạn khi qua mốc (tác vụ định kỳ có khóa advisory, ghi nhật ký); Trung tâm mở đợt bằng tay.
- Kiểm tra pha của đợt cho các thao tác nghiệp vụ: thao tác sai giai đoạn bị từ chối `409`.
- Màn "Đợt thực tập" ở cổng Trung tâm.

**Commit**: 928c04c

## Implementation notes

**2026-10-12 — nhánh `us-1.4`.** Plan đã duyệt; các quyết định chốt với người dùng ở *Story refresh* và [CONTEXT D27](../../CONTEXT.md).

Design applied: DESIGN.md §1 (primitive shadcn trước, `className` chỉ cho bố cục), §3 (`h1` mỗi trang, `tabular-nums` cho tham số), §4 (`gap-6` giữa khối, form `max-w-3xl`), §5 (Calendar 44 px khi cảm ứng), §6 (thêm `table`, `badge`, `alert-dialog`, `popover`, `calendar`, `textarea`), §7 (bốn trạng thái ở danh sách và trang đợt), §8 (RHF + `zodResolver` với schema dùng chung, lỗi server gắn về từng ô, lỗi cả form bằng `Alert`), §9 (chuỗi tiếng Việt, tên trạng thái theo PRD), §10 (ngày giờ qua `lib/format.ts`, locale `vi`), §12 (route trong `/admin`, chỉ CENTER) — áp cho `apps/web/src/features/center/campaigns/`.

Lessons: §9 mới — `@nestjs/schedule` 12 và `@nestjs/event-emitter` 12 chỉ có ESM, Jest của API không nạp được; §10 mới — Zod 4 bỏ qua `superRefine` của object khi trường khác đã lỗi; bổ sung §2 (`validate` không tìm sprint trong `archive/`) và §8 (CLI shadcn dừng ở câu hỏi ghi đè).

- **Schema dùng chung.** Validator của từng tham số khai một lần; `CampaignConfigSchema` thêm default PRD, `CampaignConfigPatchSchema` là bản partial không default (trong Zod 4, `.partial()` vẫn điền default). Kiểm tra chéo (α + β, thứ tự mốc) dùng `superRefine(fn, { when })` để hiện cùng lỗi của trường khác (LESSONS §10). Mốc nhận `null` để xóa khi đợt còn nháp; server lưu mốc dạng UTC (`toISOString`).
- **Module `campaign`.** `domain/` thuần: `phase.ts` (cạnh tự động/thủ công; unit test kiểm hợp của chúng đúng bằng bảng chuyển), `next-auto-transition.ts`, `phase-check.ts`, `deadline-change.ts`, `visibility.ts`. `CampaignRepository` là chỗ duy nhất đọc/ghi `core.campaigns`, không bao giờ ghi `status`; dòng hỏng trong danh sách được ghi log và bỏ qua. `CampaignService` export `assertPhase`, `getSettings`, `advanceByDeadline`; phát sự kiện sau commit, listener ném lỗi không biến thành lỗi của request.
- **Phụ thuộc student.** `StudentModule` import `CampaignModule` và đăng ký `StudentService.findAudience` trong `onModuleInit`; chưa đăng ký thì sinh viên không thấy đợt nào và service ghi cảnh báo một lần.
- **Scheduler.** `@Cron(EVERY_MINUTE, { waitForCompletion: true })`, đọc `SCHEDULER_ENABLED` một lần khi khởi tạo; `runOnce()` chạy trong `withAdvisoryLock` (khóa phiên trên một client riêng; mở khóa lỗi thì hủy kết nối). Test scheduler dùng `FakeClock` năm 2001 để không đụng đợt của file test khác (các worker dùng chung DB).
- **Thư viện.** Bản 12.x của `@nestjs/schedule`/`@nestjs/event-emitter` làm 7 file integration test không nạp được; đổi sang 6.1.3/3.1.0 (LESSONS §9). `shadcn add` hỏi ghi đè `button.tsx` (đã sửa ở US-1.3) và dừng; chạy lại với `yes n` để giữ file (LESSONS §8). CLI cài `react-day-picker` `^10.0.2`; đã ghim lại 10.0.1.
- **Kiểm đã chạy.** `pnpm typecheck`, `pnpm lint`, `pnpm test` (shared 37, api 142), `pnpm build`, `pnpm depcruise`, `pnpm depcruise:fixture`; `db:generate` không sinh migration; không có `Date.now()`/`new Date()` trong `apps/api/src/modules/campaign`; `.set({ status:` chỉ ở `transition-to.ts`. Compose `up -d --build --wait` healthy; seed; smoke qua nginx `:8080`: tạo đợt (mặc định đúng PRD), lỗi `config.beta` 400, sửa nháp, mở đợt, sửa tham số 409 `CAMPAIGN_CONFIG_LOCKED`, lùi mốc có lý do 200, sinh viên K66/Công nghệ thông tin thấy đợt đã mở và không thấy nháp, HR thấy đợt đã mở, HR tạo đợt 403, các route SPA 200; log API không có lỗi và đã che `authorization`.
- **Review (`/code-review`).** Đã sửa: danh sách sập vì một dòng `config` hỏng; form gia hạn so mốc theo chuỗi thay vì thời điểm; chọn được giờ sớm hơn trong cùng ngày (nay báo lỗi ngay ở client); không có cảnh báo khi thiếu lookup sinh viên; `get()` đọc tuần tự. Giữ nguyên, có lý do: thao tác của pha sau phải chờ lần chuyển thật (tối đa một phút) vì phụ thuộc việc xảy ra lúc chuyển, như chấm phù hợp ở US-3.2 (ghi chú trong `phase-check.ts`); form remount theo `rowVersion` để không ghi đè thay đổi của người khác (`refetchOnWindowFocus` đang tắt); `AUTO_EDGES` và `PHASE_END_DEADLINE` khai ở hai nơi nhưng có unit test bắt lệch; danh sách lọc theo đối tượng trong bộ nhớ vì mỗi năm chỉ có vài đợt.
- **Chưa xong.** AC-9 cần kiểm tay trong trình duyệt theo *Verification commands*; phiên làm việc này không có trình duyệt. Story ở `review` tới khi kiểm tay xong.

## Files modified

- `packages/shared`: `schemas/campaign.ts` (mới), `schemas/__tests__/campaign.spec.ts` (mới), `schemas/index.ts`, `schemas/errors.ts`.
- `apps/api/src`: `modules/campaign/**` (mới: `domain/`, `infrastructure/campaign.repository.ts`, `application/campaign.service.ts`, `application/campaign-phase.scheduler.ts`, `application/student-audience.ts`, `api/`, `campaign.module.ts`, `index.ts`); `common/clock/**` (mới); `common/scheduling/advisory-lock.ts` (mới); `common/validation/validation-issues.ts` (mới), `common/validation/zod-validation.pipe.ts`; `common/errors/domain-error.ts`; `common/config/env.ts`, `env.spec.ts`; `modules/student/student.module.ts`, `application/student.service.ts`; `app.module.ts`; `db/seed/dev-seed.ts`.
- `apps/api/test`: `helpers/fake-clock.ts` (mới), `helpers/auth.ts`, `helpers/factories.ts`, `setup/global-setup.ts`; `integration/campaign.int-spec.ts`, `campaign-scheduler.int-spec.ts`, `campaign-phase-guard.int-spec.ts` (mới), `integration/admin-users.int-spec.ts`.
- `apps/web/src`: `features/center/campaigns/**` (mới); `components/ui/{table,badge,alert-dialog,popover,calendar,textarea}.tsx` (mới); `app/router.tsx`, `app/guards/require-role.tsx` (mới); `shared/forms/server-errors.ts` (mới); `shared/api/{errors.ts,openapi.json,schema.d.ts}`; `lib/format.ts`.
- Gói: `apps/api/package.json` (`@nestjs/schedule`, `@nestjs/event-emitter`), `apps/web/package.json` (`react-day-picker`), `pnpm-lock.yaml`; version 0.3.0 ở `VERSION` và các `package.json`.
- Cấu hình: `deploy/.env.example`, `deploy/docker-compose.yml` (`SCHEDULER_ENABLED`).
- Tài liệu: `DESIGN.md` §6, `DEPLOY.md`, `docs/SETUP.md`, `docs/ARCHITECTURE.md`, `docs/CONTEXT.md` (D27), `docs/LESSONS.md` (§9, §10, bổ sung §2, §8), `docs/CHANGELOG.md`, `docs/PRD.md`, `docs/sprints/` (W41 đóng, W42 mở, EPIC-1, STATUS), `AGENTS.md`, `CLAUDE.md`.

## Cross-references

- [PRD FR-2](../../PRD.md#functional-requirements)
- [Epic EPIC-1](../epics/EPIC-1.md)
- [CONTEXT D8](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
- `DESIGN.md` (gốc repo, tạo ở US-1.3)
