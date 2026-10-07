---
id: US-1.4
title: "Tạo và cấu hình đợt thực tập"
epic: EPIC-1
status: backlog
priority: P0
points: 5
sprint:
version_shipped:
prd_ref: [FR-2]
depends_on: [US-1.2, US-1.3]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Cán bộ Trung tâm tạo một đợt thực tập với đối tượng, mốc thời gian từng giai đoạn và các tham số (N_NV, θ_cv, θ_test, α, β, k, R_max, T_test, SLA_HR, T_offer). Đến mốc, đợt tự chuyển sang giai đoạn kế tiếp. Ở mỗi giai đoạn, hệ thống chỉ cho phép các thao tác tương ứng, ví dụ quá hạn nộp CV thì không nộp được nữa. Sau story này, story của các giai đoạn sau (nộp JD, nộp CV, chọn NV, làm test, phân bổ) chỉ cần đọc tham số từ `campaigns.config` và gọi một hàm kiểm tra pha. Chúng không phải tự xử lý mốc thời gian.

## Background

FR-2 và UC-01 phủ GĐ0 của PRD: tạo đợt, khai báo đối tượng (khóa, ngành) và mốc thời gian, thiết lập tham số theo bảng mặc định ở PRD GĐ0. Vòng đời đợt theo PRD: *Nháp → Mở nhận JD/CV → Chọn nguyện vọng → Làm test → Phân bổ & HR duyệt → Vòng bổ sung → Đã đóng*. Ở mỗi trạng thái hệ thống chỉ cho phép thao tác tương ứng (EPIC-1 › *Cross-cutting invariants*: "Thao tác đúng pha của đợt").

ARCH › *Các module*: module `campaign` lo đợt, tham số, trạng thái và mốc thời gian. ARCH › *Các bảng chính*: `campaigns(id, name, status, phase_deadlines JSONB, config JSONB)`. ARCH › *Tác vụ định kỳ*: chuyển trạng thái đợt theo mốc bằng `@nestjs/schedule` cùng `pg_try_advisory_lock`, để nhiều instance không chạy trùng.

Bảng chuyển và `transitionTo` có từ US-1.2 (AD-8). Story này thêm phần quyết định *khi nào* chuyển. Mọi lần chuyển, kể cả do hệ thống tự làm, đều đi qua `transitionTo` và có audit. Tham số đợt được các story sau đọc: N_NV (US-3.3), θ_cv (US-3.1), θ_test, α, β (US-4.4), k, R_max (US-5.2, US-5.5), T_test (US-4.3), SLA_HR (US-5.3), T_offer (US-5.4).

**Lessons applied**: none — LESSONS.md chỉ có §1 (nạp skill), không liên quan cấu hình đợt; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** người gọi có vai trò `CENTER`, **When** gửi `POST /api/campaigns` với tên, đối tượng (khóa, ngành), mốc thời gian và tham số (có thể bỏ trống tham số), **Then** đợt được tạo ở trạng thái `DRAFT` **And** tham số bỏ trống nhận giá trị mặc định của PRD GĐ0: N_NV = 3, θ_cv = 50, θ_test = 40, α = 0,4, β = 0,6, k = 1,5, R_max = 3, T_test = 45 phút, SLA_HR = 5 ngày làm việc, T_offer = 3 ngày **And** việc tạo đợt có dòng audit.
- [ ] **AC-2** — **Given** dữ liệu cấu hình sai: α + β ≠ 1 (so sau khi quy về số nguyên ×100), α hoặc β ngoài [0, 1], θ_cv hoặc θ_test ngoài [0, 100], N_NV hoặc R_max không phải số nguyên dương, k < 1, T_test ≤ 0, hoặc các mốc không tăng dần theo thứ tự giai đoạn, **When** tạo hoặc sửa đợt, **Then** API trả `400` kèm lỗi theo từng trường. Cùng một Zod schema trong `packages/shared/schemas/` được dùng cho form và cho API.
- [ ] **AC-3** — **Given** người gọi là `HR`, `STUDENT` hoặc `ADMIN`, **When** tạo hoặc sửa đợt, **Then** API trả `403` **And** khi đọc danh sách đợt, người gọi chỉ thấy đợt mình tham gia, theo quy tắc ở *Dev notes*. Đọc một đợt ngoài phạm vi bằng ID thì nhận `404`.
- [ ] **AC-4** — **Given** đợt ở `DRAFT`, **When** `CENTER` sửa bằng `PATCH /api/campaigns/{id}` kèm `row_version` đúng, **Then** mọi trường được sửa và có audit (trước/sau) **And** `row_version` lệch thì trả `409` **And** khi đợt đã rời `DRAFT`, sửa tham số trả `409` mã `CAMPAIGN_CONFIG_LOCKED`; chỉ được lùi mốc của giai đoạn chưa bắt đầu, phải kèm lý do và có audit.
- [ ] **AC-5** — **Given** đợt ở `DRAFT` có đủ mốc và mọi mốc ở tương lai, **When** `CENTER` gọi `POST /api/campaigns/{id}/open`, **Then** đợt chuyển `DRAFT → INTAKE` qua `transitionTo` (có audit) **And** phát sự kiện `campaign.opened` qua `@nestjs/event-emitter` **And** thiếu mốc hoặc có mốc đã qua thì trả `422` mã `TRANSITION_CONDITION_FAILED`, đợt giữ nguyên.
- [ ] **AC-6** — **Given** đợt đang ở một giai đoạn có chuyển tự động và đồng hồ đã qua mốc kết thúc của giai đoạn đó, **When** tác vụ định kỳ chạy, **Then** đợt chuyển sang giai đoạn kế tiếp qua `transitionTo` với actor `system` và lý do ghi tên mốc **And** sau khi giao dịch commit, phát sự kiện `campaign.phase_changed` (`campaign_id`, `from`, `to`); sự kiện này cũng được phát cho mọi lần chuyển thủ công **And** chạy lại tác vụ lần nữa không tạo thêm thay đổi, audit hay sự kiện. Các cạnh tự động và thủ công liệt kê ở *Dev notes*.
- [ ] **AC-7** — **Given** hai instance API cùng chạy tác vụ định kỳ ở cùng thời điểm, **When** cả hai thấy đợt đã qua mốc, **Then** chỉ một instance chuyển trạng thái (nhờ `pg_try_advisory_lock` và `row_version`) **And** chỉ có một dòng audit.
- [ ] **AC-8** — Module `campaign` export `CampaignService.assertPhase(campaignId, allowed)`. **Given** một endpoint chỉ cho phép ở `INTAKE`, **When** gọi lúc đợt đang ở `PREFERENCE_SELECTION`, **Then** API trả `409` mã `CAMPAIGN_PHASE_MISMATCH` kèm trạng thái hiện tại của đợt. US-1.5 (nộp JD) và US-1.6 (nộp CV) dùng hàm này.
- [ ] **AC-9** — Cổng Trung tâm có màn "Đợt thực tập": danh sách đợt kèm trạng thái và mốc kế tiếp; form tạo/sửa chia ba phần (đối tượng, mốc thời gian, tham số) dùng React Hook Form + Zod schema dùng chung; chọn ngày giờ theo locale `vi` của date-fns; nút "Mở đợt" có hộp thoại xác nhận; đủ bốn trạng thái rỗng, đang tải, lỗi, có dữ liệu theo `DESIGN.md`. Tham số bị khóa thì hiện ở dạng chỉ đọc.

## Tasks

- [ ] **TASK-1.4.1** — Schema cấu hình đợt dùng chung (AC: 1, 2)
  - [ ] Subtask 1.4.1.1 — `packages/shared/schemas/campaign.ts`: Zod schema cho đối tượng, `phase_deadlines`, `config`, kèm giá trị mặc định và kiểm tra α + β = 1 theo số nguyên ×100.
- [ ] **TASK-1.4.2** — Domain đợt (AC: 6, 8)
  - [ ] Subtask 1.4.2.1 — `apps/api/src/modules/campaign/domain/next-auto-transition.ts`: hàm thuần nhận trạng thái, mốc và thời điểm hiện tại, trả cạnh tự động cần chuyển hoặc không có.
  - [ ] Subtask 1.4.2.2 — `apps/api/src/modules/campaign/domain/phase.ts`: danh sách cạnh tự động và cạnh thủ công.
- [ ] **TASK-1.4.3** — API và service (AC: 1, 3, 4, 5, 8)
  - [ ] Subtask 1.4.3.1 — `apps/api/src/modules/campaign/api/campaign.controller.ts`: `POST /api/campaigns`, `GET /api/campaigns`, `GET /api/campaigns/{id}`, `PATCH /api/campaigns/{id}`, `POST /api/campaigns/{id}/open`.
  - [ ] Subtask 1.4.3.2 — `apps/api/src/modules/campaign/application/campaign.service.ts`: tạo, sửa có khóa tham số, mở đợt bằng `transitionTo` + guard, `assertPhase`; phát `campaign.opened` và `campaign.phase_changed` sau khi commit.
  - [ ] Subtask 1.4.3.3 — `apps/api/src/modules/campaign/infrastructure/campaign.repository.ts`: truy vấn Drizzle bảng `campaigns`.
- [ ] **TASK-1.4.4** — Tác vụ định kỳ chuyển pha (AC: 6, 7)
  - [ ] Subtask 1.4.4.1 — `apps/api/src/modules/campaign/application/campaign-phase.scheduler.ts`: `@nestjs/schedule`, `pg_try_advisory_lock`, gọi `transitionTo` với actor `system`.
  - [ ] Subtask 1.4.4.2 — `apps/api/src/common/clock/clock.ts` (interface `Clock`, `SystemClock`, provider NestJS) và `apps/api/test/helpers/fake-clock.ts` (`FakeClock` có `set()`, `advance()`), để test điều khiển được thời gian. US-1.7 và US-4.3 dùng lại, không tạo bản thứ hai.
- [ ] **TASK-1.4.5** — Đọc `DESIGN.md` trước khi code giao diện; ghi dòng `Design applied: …` vào *Implementation notes* (AC: 9)
- [ ] **TASK-1.4.6** — Màn cấu hình đợt (AC: 9)
  - [ ] Subtask 1.4.6.1 — `apps/web/src/features/center/campaigns/`: trang danh sách, form tạo/sửa, hộp thoại mở đợt.
- [ ] **TASK-1.4.7** — Test (AC: 1–8)
  - [ ] Subtask 1.4.7.1 — Unit test cho schema và `next-auto-transition`; integration test cho API, scheduler và `assertPhase` (dùng `loginAs` của US-1.3, helper state của US-1.2).

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
| AC-1 | `apps/api/test/integration/campaign.int-spec.ts` › "GĐ0: center creates campaign in DRAFT with PRD default config and audit row" |
| AC-2 | `packages/shared/schemas/__tests__/campaign.spec.ts` › "GĐ0: rejects alpha + beta != 1"; "GĐ0: rejects thresholds outside 0..100"; "GĐ0: rejects non-increasing deadlines" |
| AC-3 | `campaign.int-spec.ts` › "FR-2: non-center roles get 403 on create and update"; "FR-2: campaign outside caller scope returns 404" |
| AC-4 | `campaign.int-spec.ts` › "FR-2: stale row_version returns 409"; "FR-2: config edit after DRAFT returns 409 CAMPAIGN_CONFIG_LOCKED"; "FR-2: extending a future deadline requires reason and writes audit" |
| AC-5 | `campaign.int-spec.ts` › "GĐ0: open moves DRAFT to INTAKE with audit and emits campaign.opened"; "GĐ0: open with missing or past deadline returns 422" |
| AC-6 | `apps/api/src/modules/campaign/domain/__tests__/next-auto-transition.spec.ts` › "GĐ0: past intake_end yields INTAKE→PREFERENCE_SELECTION"; `apps/api/test/integration/campaign-scheduler.int-spec.ts` › "GĐ0: scheduler transitions by system actor, emits campaign.phase_changed once and is idempotent" |
| AC-7 | `campaign-scheduler.int-spec.ts` › "GĐ0: two concurrent scheduler runs produce one transition and one audit row" |
| AC-8 | `apps/api/test/integration/campaign-phase-guard.int-spec.ts` › "FR-2: action outside its phase returns 409 CAMPAIGN_PHASE_MISMATCH" |
| AC-9 | Kiểm tay màn "Đợt thực tập" theo `DESIGN.md` (bốn trạng thái, khóa tham số, hộp thoại mở đợt); `/code-review` và skill shadcn ở bước Review |

Lệnh chạy: các file test trên chạy bằng script `pnpm test` / `pnpm --filter <package> test` do US-1.1 tạo; ghi lệnh đầy đủ vào bảng này khi US-1.1 xong (AGENTS › *Lệnh*).

## Changelog entry

### Added
- Trung tâm tạo và cấu hình đợt thực tập: đối tượng, mốc thời gian, tham số N_NV, θ_cv, θ_test, α, β, k, R_max, T_test, SLA_HR, T_offer với giá trị mặc định theo PRD.
- Đợt tự chuyển giai đoạn khi qua mốc (tác vụ định kỳ có khóa advisory, ghi nhật ký); Trung tâm mở đợt bằng tay.
- Kiểm tra pha của đợt cho các thao tác nghiệp vụ: thao tác sai giai đoạn bị từ chối `409`.
- Màn "Đợt thực tập" ở cổng Trung tâm.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-2](../../PRD.md#functional-requirements)
- [Epic EPIC-1](../epics/EPIC-1.md)
- [CONTEXT D8](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
- `DESIGN.md` (gốc repo, tạo ở US-1.3)
