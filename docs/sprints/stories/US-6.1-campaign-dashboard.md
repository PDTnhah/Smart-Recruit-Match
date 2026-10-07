---
id: US-6.1
title: "Dashboard đợt"
epic: EPIC-6
status: backlog
priority: P0
points: 5
sprint:
version_shipped:
prd_ref: [FR-33]
depends_on: [US-5.2]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Cán bộ Trung tâm mở một màn hình là biết đợt đang ở đâu (UC-04): bao nhiêu sinh viên đã qua từng bước của quy trình (phễu tuyển), mỗi JD đã lấp đầy bao nhiêu chỉ tiêu, nguyện vọng đang dồn vào JD nào và JD nào thiếu (heatmap NV/chỉ tiêu). Trung tâm phát hiện sớm JD ít hồ sơ để liên hệ doanh nghiệp, theo dõi sinh viên chưa có đề cử, và không phải tự đếm trên nhiều bảng (MT5).

## Background

FR-33 (P0) thuộc phần "dashboard cơ bản" của PRD › *Phạm vi MVP cho đồ án*. ARCH › *Màn hình theo cổng* đặt "Dashboard đợt: phễu tuyển, tỷ lệ lấp đầy, heatmap NV/chỉ tiêu" ở cổng Trung tâm; ARCH › *Các module* giao việc này cho module `reporting`. Story làm ở T12 (W52), làn B, sau US-5.2, vì từ đó mới có `nominations` để phễu đủ các bậc.

Heatmap là công cụ cho mục 4 của PRD › *Cơ chế hỗ trợ JD ít hồ sơ*: báo cho Trung tâm các JD có tỷ lệ NV/chỉ tiêu < 1. US-3.4 đã gửi cảnh báo cho các JD này; EPIC-3 › Out of scope để phần hiển thị trên dashboard cho story này. Mức cạnh tranh = số NV / chỉ tiêu (PRD GĐ4), nên heatmap dùng cùng cách phân loại Thấp / Trung bình / Cao của US-3.4 để hai màn không lệch nhau.

Mọi chỉ số ở đây đếm được bằng code. ARCH › *Những chỗ cố ý KHÔNG dùng LLM* và invariant của EPIC-6 ("Dashboard không dùng LLM để tính chỉ số") loại LLM khỏi story này. Số liệu nằm ở nhiều module (`student`, `matching`, `assessment`, `allocation`, `review`, `interview`); AGENTS › Nguyên tắc 13 cấm `reporting` truy vấn thẳng bảng của các module đó.

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** một đợt có dữ liệu ở nhiều giai đoạn, **When** Cán bộ Trung tâm gọi `GET /api/campaigns/{id}/dashboard`, **Then** response có `funnel` gồm 8 bậc theo thứ tự: đã nộp CV → đã xác nhận hồ sơ → đã chọn NV → đã nộp ít nhất một bài test → đã được đề cử → được mời phỏng vấn → đạt phỏng vấn → đã nhận thực tập **And** mỗi bậc là số sinh viên khác nhau đã từng đạt tới bậc đó (tính dồn: sinh viên đã được đề cử rồi bị HR từ chối vẫn được tính ở bậc "đã được đề cử") **And** mỗi bậc có tỷ lệ chuyển đổi so với bậc trước **And** response có `generated_at`.
- [ ] **AC-2** — Số sinh viên ở các bậc của phễu không tăng theo thứ tự bậc. Dữ liệu vi phạm điều này thì unit test của hàm dựng phễu báo lỗi, không âm thầm hiển thị.
- [ ] **AC-3** — **Given** đợt có JD đã duyệt, **When** gọi endpoint ở AC-1, **Then** `fill_rates` có một dòng cho mỗi JD đã duyệt: `quota`, số sinh viên đã nhận lời mời thực tập (`accepted`), số hồ sơ đang trong quy trình (đề cử ở `NOMINATED`, `INTERVIEW`, `PASSED`, `RESERVE`) và tỷ lệ lấp đầy = `accepted / quota` **And** có dòng tổng = Σ `accepted` / Σ `quota` **And** tỷ lệ trả về dạng tử số và mẫu số nguyên, frontend tự định dạng phần trăm.
- [ ] **AC-4** — **Given** sinh viên đã chọn NV, **When** gọi endpoint ở AC-1, **Then** `preference_heatmap` có một hàng cho mỗi JD đã duyệt và một cột cho mỗi thứ tự NV từ 1 đến `N_NV` của đợt (đọc từ `campaigns.config`, không viết cứng 3), cộng một cột tổng **And** ô (JD, r) = số `preferences` có `rank` = r của JD đó, kèm tỷ lệ so với `quota` **And** cột tổng mang mức cạnh tranh Thấp / Trung bình / Cao theo đúng hàm phân loại của US-3.4.
- [ ] **AC-5** — **Given** một JD có tổng NV / chỉ tiêu < 1, **When** gọi endpoint ở AC-1, **Then** JD đó có cờ `under_subscribed = true` và xuất hiện trong danh sách "JD thiếu nguyện vọng" của response.
- [ ] **AC-6** — **Given** đợt vừa tạo, chưa có JD được duyệt hay CV nào, **When** gọi endpoint ở AC-1, **Then** trả `200` với các bậc của phễu bằng 0, `fill_rates` và `preference_heatmap` rỗng **And** JD có `quota = 0` (nếu dữ liệu cho phép) có tỷ lệ `null`, không chia cho 0, không trả `500`.
- [ ] **AC-7** — **Given** người dùng có vai trò `HR`, `STUDENT` hoặc `ADMIN`, **When** gọi endpoint ở AC-1, **Then** nhận `403` **And** không có token thì nhận `401` **And** `id` của đợt không tồn tại thì nhận `404`.
- [ ] **AC-8** — Module `reporting` không gọi LLM và không truy vấn bảng của module khác: không import `aigateway`, không phát message vào hàng đợi `ai.*`, không import Drizzle schema của bảng thuộc module khác; số liệu lấy qua service mà các module đó export. Rule dependency-cruiser cho ranh giới này chạy trong CI.
- [ ] **AC-9** — Cùng dữ liệu cho cùng response (trừ `generated_at`): hai lần gọi liên tiếp trên dữ liệu không đổi trả JSON giống nhau, thứ tự JD ổn định (sắp theo tên công ty rồi `id` của JD).
- [ ] **AC-10** — **Given** Cán bộ Trung tâm mở màn dashboard của một đợt, **When** dữ liệu tải xong, **Then** màn có ba khối: phễu tuyển (biểu đồ), bảng tỷ lệ lấp đầy sắp xếp được theo cột, heatmap NV/chỉ tiêu có số trong từng ô (không chỉ phân biệt bằng màu) **And** có trạng thái đang tải, rỗng ("Đợt chưa có JD được duyệt" / "Chưa có nguyện vọng") và lỗi có nút thử lại **And** chuỗi giao diện tiếng Việt, màu lấy từ token ngữ nghĩa của `DESIGN.md`.

## Tasks

- [ ] **TASK-6.1.1** — Hàm thuần tính chỉ số dashboard — để unit test nhanh, không cần DB (AC: 1, 2, 3, 4, 5, 6, 9)
  - [ ] Subtask 6.1.1.1 — `apps/api/src/modules/reporting/domain/funnel.ts`: `buildFunnel(counts)` nhận số đếm của 8 bậc, trả bậc + tỷ lệ chuyển đổi, báo lỗi khi bậc sau lớn hơn bậc trước.
  - [ ] Subtask 6.1.1.2 — `apps/api/src/modules/reporting/domain/fill-rate.ts`: `computeFillRates(jds)` trả tử số/mẫu số, dòng tổng, `null` khi `quota = 0`.
  - [ ] Subtask 6.1.1.3 — `apps/api/src/modules/reporting/domain/preference-heatmap.ts`: `buildPreferenceHeatmap(counts, quotas, nNv, classify)`; `classify` là hàm phân loại mức cạnh tranh của US-3.4 truyền vào, `domain/` không import NestJS hay Drizzle.
- [ ] **TASK-6.1.2** — Mỗi module nguồn export một hàm đếm theo đợt — giữ Nguyên tắc 13 (AC: 1, 3, 4, 8)
  - [ ] Subtask 6.1.2.1 — `student`: số SV có CV, số SV có CV hiệu lực đã xác nhận.
  - [ ] Subtask 6.1.2.2 — `matching`: số SV có `preferences`; số `preferences` theo (`jd_id`, `rank`).
  - [ ] Subtask 6.1.2.3 — `assessment`: số SV có `exam_sessions.submitted_at` khác rỗng.
  - [ ] Subtask 6.1.2.4 — `allocation`: số SV có `nominations`; số đề cử đang trong quy trình theo JD.
  - [ ] Subtask 6.1.2.5 — `review` và `interview`: số SV được mời phỏng vấn, đạt phỏng vấn, đã nhận lời mời; số đã nhận theo JD.
  - [ ] Subtask 6.1.2.6 — Mỗi hàm đếm dùng một truy vấn `GROUP BY`, không lặp truy vấn theo từng JD hay từng SV.
- [ ] **TASK-6.1.3** — Endpoint và schema dùng chung (AC: 1, 6, 7)
  - [ ] Subtask 6.1.3.1 — `packages/shared/schemas/`: Zod schema `CampaignDashboard` (response) dùng cho cả API và web.
  - [ ] Subtask 6.1.3.2 — `apps/api/src/modules/reporting/application/dashboard.service.ts` gọi các service ở TASK-6.1.2 rồi các hàm ở TASK-6.1.1.
  - [ ] Subtask 6.1.3.3 — `apps/api/src/modules/reporting/api/dashboard.controller.ts`: `GET /api/campaigns/:id/dashboard`, `@Roles('CENTER')`, `404` khi đợt không tồn tại.
- [ ] **TASK-6.1.4** — Chặn LLM và truy vấn vượt ranh giới trong `reporting` (AC: 8)
  - [ ] Subtask 6.1.4.1 — Thêm rule dependency-cruiser: `modules/reporting/**` không import `modules/aigateway/**` và không import schema Drizzle của bảng thuộc module khác.
- [ ] **TASK-6.1.5** — Đọc `DESIGN.md` trước khi code giao diện, ghi `Design applied: …` vào Implementation notes (AC: 10)
  - [ ] Subtask 6.1.5.1 — Chốt cách vẽ heatmap với người dùng trước khi code (xem Dev notes › Architecture constraints, câu hỏi mở của ARCH).
- [ ] **TASK-6.1.6** — Màn dashboard ở cổng Trung tâm (AC: 10)
  - [ ] Subtask 6.1.6.1 — `apps/web/src/features/center/dashboard/`: trang dashboard, chọn đợt, TanStack Query gọi endpoint ở TASK-6.1.3.
  - [ ] Subtask 6.1.6.2 — `funnel-chart.tsx` dùng shadcn Chart (Recharts); `fill-rate-table.tsx` dùng TanStack Table; `preference-heatmap.tsx` theo phương án đã chốt ở Subtask 6.1.5.1.
  - [ ] Subtask 6.1.6.3 — Trạng thái đang tải, rỗng, lỗi; chuỗi tiếng Việt; review theo skill shadcn.
- [ ] **TASK-6.1.7** — Test tích hợp và phân quyền (AC: 1, 3, 4, 5, 6, 7, 9)
  - [ ] Subtask 6.1.7.1 — `apps/api/test/reporting/dashboard.int-spec.ts`: seed một đợt nhỏ qua service của các module (testcontainers PostgreSQL), so response với số đếm tay.
  - [ ] Subtask 6.1.7.2 — Dùng helper đăng nhập theo vai trò của US-1.3 để test `401`/`403`/`404`.

## Dev notes

### Architecture constraints

- Module `reporting` (ARCH › *Các module*): trách nhiệm "Dashboard, xuất Excel/PDF". Story này chỉ làm phần dashboard; xuất báo cáo thuộc [US-6.5](US-6.5-campaign-close-report-export.md).
- AGENTS › Nguyên tắc 13: `reporting` lấy số đếm qua service do module nguồn export. Phương án bị loại: (a) một câu SQL `JOIN` thẳng từ `reporting` vào `cvs`, `preferences`, `nominations`… — vi phạm ranh giới module; (b) bảng projection riêng cập nhật bằng event — thừa ở quy mô đồ án (vài trăm SV, vài chục JD).
- Nguồn của từng bậc phễu (xác định bằng sự tồn tại của bản ghi, nên tính dồn được mà không cần đọc `audit_logs`):

  | Bậc | Nguồn | Module |
  |---|---|---|
  | Đã nộp CV | `cvs` thuộc đợt | `student` |
  | Đã xác nhận hồ sơ | CV hiệu lực đã xác nhận (BR-01) | `student` |
  | Đã chọn NV | `preferences` | `matching` |
  | Đã nộp bài test | `exam_sessions.submitted_at` | `assessment` |
  | Đã được đề cử | `nominations` ở mọi trạng thái | `allocation` |
  | Được mời phỏng vấn | `hr_reviews.decision` = mời | `review` |
  | Đạt phỏng vấn | `interviews.result` = đạt | `interview` |
  | Đã nhận thực tập | `offers.response` = nhận | `interview` |

- ARCH › *Những chỗ cố ý KHÔNG dùng LLM* và invariant của EPIC-6: không LLM trong dashboard. Tính mức cạnh tranh dùng lại hàm của US-3.4, không định nghĩa ngưỡng thứ hai.
- AD-14 (shadcn/ui + Tailwind): phễu vẽ bằng shadcn Chart (Recharts), bảng dùng TanStack Table — đều có trong ARCH › Tech stack.
- **Câu hỏi mở của ARCH** (*Open architecture questions*): heatmap NV/chỉ tiêu là bảng tô màu bằng token hay thêm thư viện biểu đồ có heatmap. Recharts không có sẵn heatmap. Hỏi người dùng trước TASK-6.1.6. Chưa có trả lời thì chỉ làm được bảng tô màu bằng token, vì AGENTS cấm thêm thư viện ngoài danh sách khi chưa hỏi.
- Chạm Q1: số cột NV của heatmap theo `N_NV` của đợt. Tạm dùng Đề xuất (tối đa 3 NV), đọc từ tham số `campaigns.config` mà US-1.4 định nghĩa; hỏi trước khi chốt.
- Tên endpoint `GET /api/campaigns/{id}/dashboard` là **đề xuất**. ARCH › API architecture chỉ liệt kê `GET /api/campaigns/{id}/reports`, dùng cho báo cáo của US-6.5.
- Không có chuyển trạng thái nên không dùng `transitionTo`. Endpoint chỉ đọc.
- Story này không thêm AD mới.

### Cross-story dependencies

- Builds on [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md) — `nominations` và trạng thái `NOMINATED`/`INTERVIEW`/`PASSED`/`RESERVE`.
- Builds on [US-3.4](US-3.4-competition-level-and-suggestions.md) — hàm phân loại mức cạnh tranh Thấp / Trung bình / Cao.
- Builds on [US-3.3](US-3.3-shortlist-and-preferences.md) — bảng `preferences` (`rank`).
- Builds on [US-1.4](US-1.4-campaign-setup-and-config.md) — `campaigns.config` (`N_NV`); [US-1.5](US-1.5-company-hr-accounts-jd-posting-approval.md) — `job_descriptions.quota`, trạng thái JD đã duyệt.
- Builds on [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md) — `@Roles()`, helper đăng nhập theo vai trò, `DESIGN.md`, khung cổng Trung tâm.
- Builds on [US-4.3](US-4.3-exam-room.md) (`exam_sessions`), [US-5.3](US-5.3-hr-nomination-review.md) (`hr_reviews`), [US-5.4](US-5.4-interviews-reserve-and-offers.md) (`interviews`, `offers`) — nguồn các bậc sau của phễu. Các bậc này bằng 0 cho tới khi những story đó xong; dashboard vẫn chạy.
- Required by [US-6.5](US-6.5-campaign-close-report-export.md) — báo cáo đóng đợt dùng lại các hàm trong `reporting/domain/` để số liệu trong file khớp với dashboard.
- Sibling [US-5.4](US-5.4-interviews-reserve-and-offers.md), [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) — cùng T12, cùng sửa module `review`/`interview`/`allocation` (TASK-6.1.2 thêm hàm đếm). Merge story nào trước thì story sau rebase.
- Sibling [US-6.5](US-6.5-campaign-close-report-export.md) — cùng module `reporting`, cùng T12.

### What we explicitly did NOT do

- Không cập nhật thời gian thực qua SSE. Dashboard tải khi mở và khi bấm làm mới. Mở lại khi Trung tâm cần theo dõi trực tiếp trong lúc chọn NV.
- Không xuất file từ dashboard. Xuất báo cáo thuộc [US-6.5](US-6.5-campaign-close-report-export.md).
- Không có chỉ số chi phí LLM. Thuộc [US-6.2](US-6.2-llm-cost-tracking.md).

### References

- [Source: PRD › Functional Requirements (FR-33)](../../PRD.md#functional-requirements)
- [Source: PRD › Use case theo tác nhân (UC-04), GĐ4, Cơ chế hỗ trợ JD ít hồ sơ, Vòng đời trạng thái](../../PRD.md)
- [Source: ARCHITECTURE › Component architecture (Màn hình theo cổng, Các module)](../../ARCHITECTURE.md#component-architecture)
- [Source: ARCHITECTURE › Open architecture questions (heatmap FR-33)](../../ARCHITECTURE.md#open-architecture-questions)
- [Source: ARCHITECTURE › LLM usage and cost (Những chỗ cố ý KHÔNG dùng LLM)](../../ARCHITECTURE.md#llm-usage-and-cost)
- [Source: CONTEXT D14, D20](../../CONTEXT.md)
- [Source: EPIC-6](../epics/EPIC-6.md)

## Verification commands

Lệnh chạy cụ thể sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `apps/api/test/reporting/dashboard.int-spec.ts` › `GĐ10 funnel counts distinct students cumulatively across 8 stages` |
| AC-2 | `apps/api/src/modules/reporting/domain/funnel.spec.ts` › `funnel rejects a stage larger than the previous one` |
| AC-3 | `apps/api/src/modules/reporting/domain/fill-rate.spec.ts` › `GĐ9 fill rate = accepted / quota per JD and in total` |
| AC-4 | `apps/api/src/modules/reporting/domain/preference-heatmap.spec.ts` › `GĐ4 heatmap counts preferences by rank over quota with N_NV columns` |
| AC-5 | `apps/api/src/modules/reporting/domain/preference-heatmap.spec.ts` › `GĐ4 JD with preferences / quota < 1 is flagged under_subscribed` |
| AC-6 | `apps/api/test/reporting/dashboard.int-spec.ts` › `empty campaign returns zero funnel and empty tables`; `fill-rate.spec.ts` › `quota 0 yields null rate` |
| AC-7 | `apps/api/test/reporting/dashboard.int-spec.ts` › `NFR-1 dashboard returns 403 for HR, STUDENT, ADMIN; 401 without token; 404 for unknown campaign` |
| AC-8 | Rule dependency-cruiser của TASK-6.1.4 chạy trong CI không lỗi; `rg -n "aigateway\|anthropic\|ai\.(cv\|jd\|match\|questions\|essay)" apps/api/src/modules/reporting` không trả dòng nào |
| AC-9 | `apps/api/test/reporting/dashboard.int-spec.ts` › `dashboard response is deterministic except generated_at` |
| AC-10 | Review giao diện theo `DESIGN.md` và skill shadcn; chụp màn hình ba trạng thái (đang tải, rỗng, có dữ liệu) đính kèm PR |

## Changelog entry

### Added
- Dashboard đợt cho Trung tâm (FR-33): phễu tuyển 8 bậc, tỷ lệ lấp đầy chỉ tiêu theo JD và toàn đợt, heatmap NV/chỉ tiêu theo thứ tự nguyện vọng, danh sách JD thiếu nguyện vọng.
- Endpoint `GET /api/campaigns/{id}/dashboard` (chỉ vai trò `CENTER`); số liệu tính bằng code trong `reporting/domain/`, không dùng LLM.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-33](../../PRD.md#functional-requirements)
- [Epic EPIC-6](../epics/EPIC-6.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D20](../../CONTEXT.md)
- [US-6.5 — Xuất báo cáo đóng đợt](US-6.5-campaign-close-report-export.md)
