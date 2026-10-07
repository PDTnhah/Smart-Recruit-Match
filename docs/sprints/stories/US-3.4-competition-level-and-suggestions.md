---
id: US-3.4
title: "Mức cạnh tranh và gợi ý ít cạnh tranh"
epic: EPIC-3
status: backlog
priority: P1
points: 3
sprint:
version_shipped:
prd_ref: [FR-17]
depends_on: [US-3.3, US-1.7]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Khi chọn nguyện vọng, SV thấy mức cạnh tranh (Thấp / Trung bình / Cao) của từng JD, cập nhật theo thời gian thực, và thấy nhãn gợi ý "Phù hợp – ít cạnh tranh". Nhờ vậy hồ sơ không dồn vào vài công ty "hot". Khi hết hạn chọn NV, Cán bộ Trung tâm được báo các JD có tỷ lệ NV/chỉ tiêu < 1 để chủ động liên hệ doanh nghiệp.

## Background

GĐ4 bước 2 (PRD › *Quy trình nghiệp vụ theo giai đoạn*) định nghĩa **mức cạnh tranh** = số NV hiện có / chỉ tiêu, chia ba mức Thấp / Trung bình / Cao, cập nhật theo thời gian thực. Cùng bước đó có gợi ý **"phù hợp – ít cạnh tranh"**: JD có S_cv cao với SV nhưng mức cạnh tranh thấp. PRD › *Thuật toán phân bổ* › *Cơ chế hỗ trợ JD ít hồ sơ* liệt kê bốn biện pháp. Story này làm biện pháp 1 (mức cạnh tranh và gợi ý) và biện pháp 4 (ngay sau GĐ4, báo Trung tâm các JD có NV/chỉ tiêu < 1). Biện pháp 2 (khuyến nghị chọn đủ N_NV) đã có ở [US-3.3](US-3.3-shortlist-and-preferences.md). Biện pháp 3 (gợi ý ở vòng bổ sung) thuộc [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md).

Mức cạnh tranh là phép đếm và phép chia, nên không dùng LLM (ARCH › *Những chỗ cố ý KHÔNG dùng LLM*). Bộ đếm nằm ở Redis key `competition:{jdId}`, TTL đến hết giai đoạn chọn NV (ARCH › *Redis*); bảng `preferences` trong PostgreSQL vẫn là nguồn sự thật. Cập nhật đẩy xuống trình duyệt qua SSE `GET /api/events/stream` (AD-13, [CONTEXT D13](../../CONTEXT.md)); hạ tầng SSE và thông báo có sẵn ở [US-1.7](US-1.7-notifications-sse-email-reminders.md). ARCH › *Các module* đặt mức cạnh tranh trong module `matching`, cùng chỗ với nguyện vọng.

FR-17 có priority P1 ("Nên có" theo PRD › *Phạm vi MVP cho đồ án*). Heatmap NV/chỉ tiêu trên dashboard thuộc [US-6.1](US-6.1-campaign-dashboard.md); story này chỉ gửi cảnh báo cho Trung tâm.

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** số NV `nvCount`, chỉ tiêu `quota` và ngưỡng từ `campaigns.config.competition_thresholds` (đề xuất, mặc định `{ low_below: 1, high_from: 3 }`), **When** gọi `competitionLevel(nvCount, quota, thresholds)`, **Then** hàm trả `LOW` nếu tỷ lệ < `low_below`, `HIGH` nếu tỷ lệ ≥ `high_from`, còn lại `MEDIUM`. Phép so sánh dùng số nguyên (nhân chéo, không chia số thực). Tỷ lệ đúng bằng ngưỡng rơi vào mức cao hơn. `quota < 1` thì hàm báo lỗi.
- [ ] **AC-2** — **Given** một `PUT /api/me/preferences` (US-3.3) đã commit, **When** sự kiện thay đổi NV được xử lý, **Then** với mọi JD bị thêm hoặc bỏ, `competition:{jdId}` bằng số dòng `preferences` của JD đó trong DB (đếm mọi thứ hạng NV). Sau 20 request đồng thời từ nhiều SV, bộ đếm vẫn khớp DB. Key bị mất (VD Redis khởi động lại) thì được dựng lại từ DB ở lần đọc kế tiếp. TTL của key là hết giai đoạn chọn NV.
- [ ] **AC-3** — **Given** SV A đang mở màn chọn NV, **When** SV B đổi danh sách làm số NV của JD X thay đổi, **Then** A nhận sự kiện `competition.updated` (tên đề xuất) qua `GET /api/events/stream` với `{ jd_id, nv_count, quota, level }` mà không phải tải lại trang. Sự kiện không chứa ID hay thông tin nào của B.
- [ ] **AC-4** — `GET /api/me/shortlist` (US-3.3) trả thêm cho mỗi JD trường `competition: { nv_count, quota, level }`. JD trong shortlist có `level = LOW` được gắn `low_competition_suggestion = true`, và giao diện hiển thị nhãn "Phù hợp – ít cạnh tranh". Các JD có nhãn này được nhóm lại, sắp giảm dần theo S_cv.
- [ ] **AC-5** — **Given** đợt đã khóa chọn NV và bước tự gán NV theo Q6 (US-3.3) đã chạy xong, **When** bước báo JD thiếu NV chạy, **Then** mọi tài khoản CENTER nhận một thông báo trong app và một email (qua outbox của US-1.7). Thông báo liệt kê các JD có `nv_count / quota < 1`, mỗi JD gồm tên JD, doanh nghiệp, số NV và chỉ tiêu, lấy số từ DB. Không có JD nào dưới 1 thì không gửi. Chạy lại cho cùng đợt không gửi trùng.
- [ ] **AC-6** — Mã tính mức cạnh tranh không dùng LLM: các file `competition*` trong `apps/api/src/modules/matching/` không import `aigateway` và không phát message `ai.*`.
- [ ] **AC-7** — Chỉ SV thuộc đợt đó nhận sự kiện `competition.updated`. HR, ADMIN và SV của đợt khác không nhận. Trường `competition` chỉ trả qua endpoint `/me/*` của SV.
- [ ] **AC-8** — Giao diện ở chiều rộng 375 px: mỗi thẻ JD có huy hiệu mức cạnh tranh mang chữ ("Thấp" / "Trung bình" / "Cao"), không chỉ dựa vào màu; màu lấy từ token ngữ nghĩa của `DESIGN.md`. Mức cạnh tranh cập nhật tại chỗ khi có sự kiện SSE. Story ghi `Design applied:`.

## Tasks

- [ ] **TASK-3.4.1** — Hàm thuần tính mức cạnh tranh và tham số ngưỡng (AC: 1)
  - [ ] Subtask 3.4.1.1 — `apps/api/src/modules/matching/domain/competition.ts`: `competitionLevel(nvCount, quota, thresholds)`, `isLowPreferenceJd(nvCount, quota)`.
  - [ ] Subtask 3.4.1.2 — Thêm `competition_thresholds` (đề xuất) vào schema `campaigns.config` trong `packages/shared/schemas/campaign.ts` (US-1.4); enum `CompetitionLevel` (`LOW | MEDIUM | HIGH`) và nhãn tiếng Việt trong `packages/shared`.
- [ ] **TASK-3.4.2** — Bộ đếm Redis `competition:{jdId}` — đọc nhanh, DB vẫn là nguồn sự thật (AC: 2)
  - [ ] Subtask 3.4.2.1 — `apps/api/src/modules/matching/infrastructure/competition-counter.ts` (ioredis): sau khi DB commit, cộng/trừ phần chênh lệch cho các JD bị ảnh hưởng bằng `INCRBY`/`DECRBY` (nguyên tử trong Redis, không bị ghi đè bởi số đếm cũ); thiếu key thì dựng lại từ số đếm trong DB; đặt TTL theo `phase_deadlines.preference_end` của đợt.
  - [ ] Subtask 3.4.2.2 — `apps/api/src/modules/matching/application/competition.service.ts`: nghe sự kiện thay đổi NV của US-3.3. Lấy `quota` qua service export của module `company`, không truy vấn `job_descriptions` (AGENTS › Nguyên tắc 13).
- [ ] **TASK-3.4.3** — Đẩy cập nhật qua SSE và mở rộng response shortlist (AC: 3, 4, 7)
  - [ ] Subtask 3.4.3.1 — Phát `competition.updated` qua kênh SSE của US-1.7 (Redis pub/sub), phạm vi theo đợt.
  - [ ] Subtask 3.4.3.2 — Thêm `competition` và `low_competition_suggestion` vào `ShortlistResponse` (`packages/shared/schemas/`) và `shortlist.service.ts` của US-3.3.
- [ ] **TASK-3.4.4** — Báo Trung tâm các JD thiếu NV (AC: 5)
  - [ ] Subtask 3.4.4.1 — `apps/api/src/modules/matching/application/low-preference-alert.service.ts`: chạy khi nhận sự kiện "đã tự gán NV xong" của US-3.3; đếm từ DB; gửi qua `NotificationService` của US-1.7 với loại thông báo đề xuất `JD_LOW_PREFERENCES`; chống gửi trùng theo đợt.
- [ ] **TASK-3.4.5** — Giao diện mức cạnh tranh và nhãn gợi ý (AC: 4, 8)
  - [ ] Subtask 3.4.5.1 — Đọc `DESIGN.md` trước khi code, ghi `Design applied: …` vào story; dùng skill shadcn (VD `Badge`).
  - [ ] Subtask 3.4.5.2 — `apps/web/src/features/student/shortlist/` và `apps/web/src/features/student/preferences/`: huy hiệu mức cạnh tranh, nhóm "Phù hợp – ít cạnh tranh"; hook nghe SSE cập nhật cache TanStack Query.
- [ ] **TASK-3.4.6** — Test (AC: 1, 2, 3, 5, 6, 7)
  - [ ] Subtask 3.4.6.1 — `apps/api/src/modules/matching/domain/__tests__/competition.spec.ts`.
  - [ ] Subtask 3.4.6.2 — `apps/api/test/integration/competition.int-spec.ts` (testcontainers PostgreSQL + Redis): khớp DB, đồng thời, dựng lại key, SSE, phạm vi đợt, cảnh báo Trung tâm.

## Dev notes

### Architecture constraints

- ARCH › *Những chỗ cố ý KHÔNG dùng LLM*: tính mức cạnh tranh là việc của code. Bị loại: nhờ LLM "đánh giá độ hot" của JD.
- AD-13 ([ARCHITECTURE › Architecture decisions](../../ARCHITECTURE.md#architecture-decisions)): SSE một chiều qua `GET /api/events/stream`, Redis pub/sub khi chạy nhiều instance. Bị loại: WebSocket; client tự hỏi lại định kỳ.
- ARCH › *Redis*: `competition:{jdId}` chỉ là bộ đếm đọc nhanh. Mọi con số dùng để ra quyết định hoặc gửi cảnh báo (AC-5) đọc từ DB.
- AGENTS › Nguyên tắc 13: chỉ tiêu (`job_descriptions.quota`) thuộc module `company`, nên phải lấy qua service export.
- Story không thêm AD mới.
- Chạm Q1: mức cạnh tranh tồn tại vì SV tự chọn NV, theo Đề xuất của Q1. Story không thêm tham số cho Q1; hỏi trước khi chốt.
- Các điểm spec chưa nói rõ. Story tạm dùng phương án dưới đây, để thành tham số, và **hỏi trước khi chốt**:
  - Ngưỡng Thấp / Trung bình / Cao chưa có trong spec. Tạm dùng `campaigns.config.competition_thresholds` = `{ low_below: 1, high_from: 3 }`. Mốc 1 khớp với ngưỡng cảnh báo NV/chỉ tiêu < 1.
  - "S_cv cao" trong định nghĩa gợi ý chưa có ngưỡng. Mọi JD trong shortlist đã có S_cv ≥ θ_cv, nên tạm coi mọi JD trong shortlist ở mức `LOW` là "phù hợp – ít cạnh tranh", sắp theo S_cv.
  - Số NV đếm mọi thứ hạng như nhau (NV1 và NV3 cùng tính 1). PRD không nói có trọng số theo thứ hạng hay không.
  - Sự kiện "báo Trung tâm JD thiếu NV" không có trong bảng PRD › *Thông báo*; chỉ có ở FR-17 và *Cơ chế hỗ trợ JD ít hồ sơ*.

### Cross-story dependencies

- Builds on [US-3.3](US-3.3-shortlist-and-preferences.md) — bảng `preferences`, sự kiện thay đổi NV (`matching.preferences.replaced`, tên đề xuất), sự kiện sau khi tự gán NV, `ShortlistResponse`, màn `apps/web/src/features/student/`.
- Builds on [US-1.7](US-1.7-notifications-sse-email-reminders.md) — kênh SSE `GET /api/events/stream`, Redis pub/sub, `NotificationService`, outbox email trong `notifications`.
- Builds on [US-1.5](US-1.5-company-hr-accounts-jd-posting-approval.md) — `job_descriptions.quota` qua service của module `company`.
- Builds on [US-1.4](US-1.4-campaign-setup-and-config.md) — `campaigns.config`, `phase_deadlines.preference_end` để đặt TTL, pha `PREFERENCE_SELECTION`.
- Sibling [US-3.3](US-3.3-shortlist-and-preferences.md) — cùng tuần T8, làn A; cùng sửa `ShortlistResponse` và màn shortlist. US-3.3 merge trước.
- Sibling [US-6.1](US-6.1-campaign-dashboard.md) — heatmap NV/chỉ tiêu có thể dùng lại `competitionLevel` và cùng nguồn số đếm.
- Sibling [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) — gợi ý JD còn suất ở vòng bổ sung có thể dùng lại huy hiệu và hàm mức cạnh tranh.

### References

- [Source: PRD › Functional Requirements — FR-17](../../PRD.md#functional-requirements)
- Source: PRD › GĐ4 bước 2; *Thuật toán phân bổ* › *Cơ chế hỗ trợ JD ít hồ sơ*; *Phạm vi MVP cho đồ án*; *Các điểm cần chốt* Q1 ([PRD.md](../../PRD.md))
- [Source: ARCHITECTURE › Architecture decisions — AD-13](../../ARCHITECTURE.md#architecture-decisions)
- Source: ARCHITECTURE › *Cập nhật thời gian thực*, *Các module* (`matching`, `notification`), *Những chỗ cố ý KHÔNG dùng LLM* ([ARCHITECTURE.md](../../ARCHITECTURE.md))
- [Source: ARCHITECTURE › Data architecture](../../ARCHITECTURE.md#data-architecture) — Redis `competition:{jdId}`
- [Source: CONTEXT D13](../../CONTEXT.md)
- [Source: Epic EPIC-3](../epics/EPIC-3.md)

## Verification commands

> Lệnh chạy cụ thể (`pnpm …`) sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `apps/api/src/modules/matching/domain/__tests__/competition.spec.ts` › `GĐ4 competition level boundaries with integer comparison` |
| AC-2 | `apps/api/test/integration/competition.int-spec.ts` › `GĐ4 Redis counter matches DB under concurrent updates and rebuilds when missing` |
| AC-3 | `apps/api/test/integration/competition.int-spec.ts` › `GĐ4 competition.updated pushed over SSE without other student data` |
| AC-4 | `apps/api/test/integration/competition.int-spec.ts` › `GĐ4 shortlist carries competition and low-competition suggestion` |
| AC-5 | `apps/api/test/integration/competition.int-spec.ts` › `FR-17 CENTER alerted once for JDs with preferences/quota < 1 after lock` |
| AC-6 | `rg -l "aigateway\|ai\.match\|ai\.results" apps/api/src/modules/matching --glob "competition*"` không trả file nào |
| AC-7 | `apps/api/test/integration/competition.int-spec.ts` › `competition events scoped to students of the campaign` |
| AC-8 | Kiểm tra thủ công ở 375 px theo `DESIGN.md`, ghi vào Implementation notes; `/code-review` phần `apps/web/src/features/student/` |

## Changelog entry

### Added
- Mức cạnh tranh của JD (Thấp / Trung bình / Cao theo số NV / chỉ tiêu), đếm bằng Redis `competition:{jdId}` và đẩy qua SSE khi SV chọn NV.
- Nhãn gợi ý "Phù hợp – ít cạnh tranh" trên shortlist.
- Thông báo cho Trung tâm danh sách JD có tỷ lệ NV/chỉ tiêu < 1 khi khóa chọn NV.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-17](../../PRD.md#functional-requirements)
- [Epic EPIC-3](../epics/EPIC-3.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D13](../../CONTEXT.md)
- [LESSONS](../../LESSONS.md)
