---
id: US-3.4
title: "Mức cạnh tranh và gợi ý ít cạnh tranh"
epic: EPIC-3
status: review
priority: P1
points: 3
sprint: sprint-2026-W45
version_shipped: 0.19.0
prd_ref: [FR-17]
depends_on: [US-3.3, US-1.7]
assignee:
commit: 72c82c2
created: 2026-10-07
updated: 2026-11-04
---

## Story refresh — 2026-11-04 (bắt đầu story)

Người dùng chốt ở phiên Plan ([CONTEXT D48](../../CONTEXT.md)): các điểm mở theo Đề xuất, thêm hai ô ngưỡng trên form đợt (AC-9); kênh SSE theo đợt; huy hiệu dùng biến thể `Badge` có sẵn; tab Gợi ý chia hai nhóm.

Lệch so với bản gốc (đã sửa vào AC, task): trường API camelCase; sự kiện SSE gom các JD của một lần thay đổi; bộ đếm đếm lại từ DB dưới khóa theo JD rồi `SET` (không `INCRBY`/`DECRBY`); cảnh báo Trung tâm chạy cả trong tác vụ quét Q6.

## Goal

Khi chọn nguyện vọng, SV thấy mức cạnh tranh (Thấp / Trung bình / Cao) của từng JD, cập nhật theo thời gian thực, và thấy nhãn gợi ý "Phù hợp – ít cạnh tranh". Nhờ vậy hồ sơ không dồn vào vài công ty "hot". Khi hết hạn chọn NV, Cán bộ Trung tâm được báo các JD có tỷ lệ NV/chỉ tiêu < 1 để chủ động liên hệ doanh nghiệp.

## Background

GĐ4 bước 2: **mức cạnh tranh** = số NV / chỉ tiêu, và gợi ý **"phù hợp – ít cạnh tranh"**. Story làm biện pháp 1 và 4 của PRD › *Cơ chế hỗ trợ JD ít hồ sơ* (biện pháp 2 ở [US-3.3](US-3.3-shortlist-and-preferences.md), 3 ở [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md); heatmap ở [US-6.1](US-6.1-campaign-dashboard.md)).

Mức cạnh tranh là phép đếm, không dùng LLM, nằm trong module `matching`. Redis `competition:{jdId}` chỉ để đọc nhanh, bảng `preferences` là nguồn sự thật; cập nhật qua SSE (AD-13, hạ tầng của [US-1.7](US-1.7-notifications-sse-email-reminders.md)).

**Lessons applied**: §22 (test lọc theo loại `JD_LOW_PREFERENCES` và ID của chính test), §34 (cảnh báo chạy cả trong tác vụ quét, idempotent nhờ `dedupe_key`), §6 (migration `0027` bằng `db:generate`), §15, §21 (chạy riêng file integration; cả bộ sau khi dừng compose), §2.

**Design applied**: §5 (375 px, huy hiệu xuống dòng bằng `flex-wrap`), §6 (`badge` biến thể có sẵn kèm icon; nhóm trong danh sách cập nhật qua SSE), §8 (hai ô số trong `Field`, lỗi dưới ô), §9, §11 (chữ và icon, không chỉ màu).

## Acceptance criteria

- [x] **AC-1** — **Given** số NV `nvCount`, chỉ tiêu `quota` và ngưỡng từ `campaigns.config.competition_thresholds` (mặc định `{ low_below: 1, high_from: 3 }`), **When** gọi `competitionLevel(nvCount, quota, thresholds)`, **Then** hàm trả `LOW` nếu tỷ lệ < `low_below`, `HIGH` nếu tỷ lệ ≥ `high_from`, còn lại `MEDIUM`. Phép so sánh dùng số nguyên (ngưỡng ×100, nhân chéo, không chia số thực). Tỷ lệ đúng bằng ngưỡng rơi vào mức cao hơn. `quota < 1` thì hàm báo lỗi.
- [x] **AC-2** — **Given** một `PUT /api/me/preferences` (US-3.3) đã commit, **When** sự kiện thay đổi NV được xử lý, **Then** với mọi JD bị thêm hoặc bỏ, `competition:{jdId}` bằng số dòng `preferences` của JD đó trong DB (đếm mọi thứ hạng NV). Bộ đếm được đếm lại từ DB dưới khóa advisory theo JD. Sau 20 request đồng thời từ nhiều SV, bộ đếm vẫn khớp DB. Key bị mất (VD Redis khởi động lại) thì được dựng lại từ DB ở lần đọc kế tiếp. TTL của key là `preference_end`.
- [x] **AC-3** — **Given** SV A đang mở màn chọn NV, **When** SV B đổi danh sách làm số NV của JD X thay đổi, **Then** A nhận sự kiện `competition.updated` qua `GET /api/events/stream` với `{ campaignId, items: [{ jdId, nvCount, quota, level }] }` mà không phải tải lại trang. Sự kiện không chứa ID hay thông tin nào của B.
- [x] **AC-4** — `GET /api/me/shortlist` (US-3.3) trả thêm cho mỗi JD trường `competition: { nvCount, quota, level }`. JD trong shortlist có `level = LOW` được gắn `lowCompetitionSuggestion = true`, và giao diện hiển thị nhãn "Phù hợp – ít cạnh tranh". Các JD có nhãn này được nhóm lại (nhóm trên cùng của tab Gợi ý), sắp giảm dần theo S_cv.
- [x] **AC-5** — **Given** đợt đã khóa chọn NV và bước tự gán NV theo Q6 (US-3.3) không còn SV nào chờ gán, **When** bước báo JD thiếu NV chạy (sau Q6 ở lúc chuyển pha và ở tác vụ quét), **Then** mọi tài khoản CENTER nhận một thông báo `JD_LOW_PREFERENCES` trong app và một email (qua outbox của US-1.7). Thông báo liệt kê các JD có `nvCount / quota < 1`, mỗi JD gồm tên JD, doanh nghiệp, số NV và chỉ tiêu, lấy số từ DB. Không có JD nào dưới 1 thì không gửi. Chạy lại cho cùng đợt không gửi trùng.
- [x] **AC-6** — Mã tính mức cạnh tranh không dùng LLM: các file `competition*` trong `apps/api/src/modules/matching/` không import `aigateway` và không phát message `ai.*`.
- [x] **AC-7** — Chỉ SV thuộc đợt đó (có CV active trong đợt) nhận sự kiện `competition.updated`. HR, CENTER, ADMIN và SV của đợt khác không nhận. Trường `competition` chỉ trả qua endpoint `/me/*` của SV.
- [ ] **AC-8** — Giao diện ở chiều rộng 375 px: mỗi thẻ JD có huy hiệu mức cạnh tranh mang chữ ("Thấp" / "Trung bình" / "Cao") kèm icon, không chỉ dựa vào màu; màu là biến thể `Badge` có sẵn theo `DESIGN.md`. Mức cạnh tranh cập nhật tại chỗ khi có sự kiện SSE. Story ghi `Design applied:`.
- [ ] **AC-9** — Form cấu hình đợt có hai ô số cho `competition_thresholds`. Ngưỡng là số dương, tối đa 2 chữ số thập phân, `low_below < high_from`, lỗi báo bằng tiếng Việt. Ngưỡng khóa sau khi mở đợt như các tham số khác; đợt cũ nhận mặc định khi parse.

## Tasks

- [x] **TASK-3.4.1** — Hàm thuần tính mức cạnh tranh và tham số ngưỡng (AC: 1, 9)
  - [x] Subtask 3.4.1.1 — `matching/domain/competition.ts`: `competitionLevel`, `isLowPreferenceJd`.
  - [x] Subtask 3.4.1.2 — Shared: `competition_thresholds` (campaign); mức, nhãn, `ShortlistCompetitionSchema` (matching); `COMPETITION_UPDATED`, `JD_LOW_PREFERENCES` (notification).
- [x] **TASK-3.4.2** — Bộ đếm Redis `competition:{jdId}`: đọc nhanh, DB vẫn là nguồn sự thật (AC: 2)
  - [x] Subtask 3.4.2.1 — `PreferencesRepository.countByJd`; `infrastructure/competition-counter.ts`; khóa `ADVISORY_LOCK_KEYS.JD_COMPETITION = 3_401`.
  - [x] Subtask 3.4.2.2 — `competition.service.ts`: nghe hai sự kiện NV, đếm lại dưới khóa rồi `SET`; đọc kèm dựng lại key; chỉ tiêu qua `JdService` (Nguyên tắc 13).
- [x] **TASK-3.4.3** — Đẩy cập nhật qua SSE và mở rộng response shortlist (AC: 3, 4, 7)
  - [x] Subtask 3.4.3.1 — Kênh `notify:campaign:{campaignId}:students`; một stream nhiều kênh; stream của SV đăng ký kênh các đợt có CV active.
  - [x] Subtask 3.4.3.2 — `competition`, `lowCompetitionSuggestion` trong `ShortlistItemSchema` và `shortlist.service.ts`.
- [x] **TASK-3.4.4** — Báo Trung tâm các JD thiếu NV (AC: 5)
  - [x] Subtask 3.4.4.1 — Q6 trả `{ assigned, outstanding }`; `low-preference-alert.service.ts` sau Q6 (listener, tác vụ quét); template email; migration `0027`.
- [x] **TASK-3.4.5** — Giao diện mức cạnh tranh và nhãn gợi ý (AC: 4, 8, 9)
  - [x] Subtask 3.4.5.1 — Đọc `DESIGN.md` trước khi code, ghi `Design applied: …`; dùng skill shadcn (`Badge`).
  - [x] Subtask 3.4.5.2 — `features/student/preferences/`: `competition-badge.tsx`, huy hiệu trên thẻ và dòng NV, hai nhóm tab Gợi ý, hook SSE `useCompetitionUpdates`; thông điệp `JD_LOW_PREFERENCES`.
  - [x] Subtask 3.4.5.3 — Hai ô ngưỡng trong `features/center/campaigns/parameter-fields.tsx`.
- [x] **TASK-3.4.6** — Test (AC: 1, 2, 3, 5, 6, 7, 9)
  - [x] Subtask 3.4.6.1 — Unit `competition.spec.ts` (kèm property test), `competition-no-llm.spec.ts`, `competition.service.spec.ts`; test schema ngưỡng trong `packages/shared`.
  - [x] Subtask 3.4.6.2 — `competition.int-spec.ts`: khớp DB, đồng thời, dựng lại key, SSE, phạm vi đợt, cảnh báo Trung tâm; sửa test cũ theo kiểu mới.

## Dev notes

### Architecture constraints

- Không dùng LLM (ARCH › *Những chỗ cố ý KHÔNG dùng LLM*). SSE một chiều qua `GET /api/events/stream`, pub/sub Redis (AD-13).
- Số dùng để cảnh báo (AC-5) đọc từ DB, không từ Redis. `quota` thuộc module `company`, lấy qua service export (Nguyên tắc 13). Không thêm AD mới.

### Cross-story dependencies

- Builds on [US-3.3](US-3.3-shortlist-and-preferences.md) (`preferences`, hai sự kiện NV, Q6, shortlist), [US-1.7](US-1.7-notifications-sse-email-reminders.md) (SSE, thông báo, outbox), [US-1.4](US-1.4-campaign-setup-and-config.md) / [US-1.5](US-1.5-company-hr-accounts-jd-posting-approval.md) (`campaigns.config`, `quota`).
- Sibling [US-6.1](US-6.1-campaign-dashboard.md), [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md): dùng lại `competitionLevel`, `countByJd`, huy hiệu, kênh đợt.

### References

- [Source: PRD › FR-17](../../PRD.md#functional-requirements); PRD › GĐ4 bước 2, *Cơ chế hỗ trợ JD ít hồ sơ*
- [Source: ARCHITECTURE › AD-13](../../ARCHITECTURE.md#architecture-decisions); ARCH › *Cập nhật thời gian thực*, *Redis*, *Tác vụ định kỳ*
- [Source: CONTEXT D13, D31, D47, D48](../../CONTEXT.md); [Epic EPIC-3](../epics/EPIC-3.md)

## Verification commands

| AC | Command |
|---|---|
| AC-1 | `pnpm --filter @srm/api test:unit` › `competition.spec.ts` › `GĐ4 competition level boundaries with integer comparison` |
| AC-2 | `competition.int-spec.ts` › `GĐ4 Redis counter matches DB under concurrent updates and rebuilds when missing`; `competition.service.spec.ts` (Redis lỗi, xóa key, gộp) |
| AC-3 | `competition.int-spec.ts` › `GĐ4 competition.updated pushed over SSE without other student data` |
| AC-4 | `competition.int-spec.ts` › `GĐ4 shortlist carries competition and low-competition suggestion` |
| AC-5 | `competition.int-spec.ts` › `FR-17 CENTER alerted once for JDs with preferences/quota < 1 after Q6` |
| AC-6 | `competition-no-llm.spec.ts`; `rg -l "aigateway\|ai\.match\|ai\.results" apps/api/src/modules/matching --glob "competition*" --glob "!*.spec.ts" --glob "!**/__tests__/**"` không trả file nào |
| AC-7 | `competition.int-spec.ts` › `competition events scoped to students of the campaign` |
| AC-8 | Kiểm tra thủ công ở 375 px theo `DESIGN.md`; `/code-review` phần `apps/web/src/features/student/` |
| AC-9 | Test schema `competition_thresholds` trong `packages/shared`; `campaign.int-spec.ts` › `config edit after DRAFT`; kiểm tay form đợt |

## Changelog entry

### Added
- Mức cạnh tranh của JD (Thấp / Trung bình / Cao theo số NV / chỉ tiêu, ngưỡng trong cấu hình đợt), đếm bằng Redis `competition:{jdId}` và đẩy qua SSE theo đợt khi SV chọn NV.
- Nhãn gợi ý "Phù hợp – ít cạnh tranh" trên shortlist.
- Thông báo cho Trung tâm danh sách JD có tỷ lệ NV/chỉ tiêu < 1 sau khi khóa chọn NV và tự gán NV.

**Commit**: 72c82c2

## Implementation notes

- Phiên 1: nhánh `us-3.4` từ `dev` `0ed6d6c`; ghi D48.
- Phiên 2a, ngoài D48: `PREFERENCE_PHASES` sang `domain/preference-list.ts` (`ShortlistService` và `CompetitionService` dùng nhau); `lockedFieldChanges` so sâu (`competition_thresholds` là object); `email-outbox.int-spec.ts` đổi người nhận sang HR (LESSONS §22).
- Phiên 2b: `isLowCompetitionSuggestion` ở `@srm/shared` (API đặt cờ, web áp cho mức nhận qua SSE); `ready` gọi `invalidateQueries` với `cancelRefetch: false`.
- Phiên 3, `/code-review` 14 điểm, sửa 10:
  - `CompetitionService`: publish trong khóa JD (đúng thứ tự); đếm lại lỗi thì xóa key; đếm lại chạy lần lượt trong process và gộp JD chờ; `lockEntitiesInTx` khóa theo thứ tự khóa `hashtext`.
  - Sự kiện `matching.preferences.replaced` chỉ mang JD bị thêm/bỏ: sắp lại NV không đếm lại.
  - Email văn bản dính dòng ([LESSONS §35](../../LESSONS.md)). `LowPreferenceAlertService.afterAutoAssign` gom bước sau Q6, ghi log khi còn SV chờ.
  - Web: sự kiện tới khi shortlist đang tải thì tải lại. `competition.int-spec` gọi bước quét cho đợt của mình, không `runOnce()` (LESSONS §22).
  - Giữ nguyên: cảnh báo chờ Q6 hết SV chờ, kể cả SV gán lỗi mãi (AC-5, nay có log); mỗi lần đếm lại đọc mọi JD của đợt (quy mô nhỏ).
  - koni-qc: thêm `competition.service.spec.ts` và ca khóa ngưỡng trong `campaign.int-spec.ts`.
- **Chờ người dùng kiểm tay** (xong thì `[x]` AC-8, AC-9, story `done`):
  1. Hai SV cùng đợt: SV B lưu NV thì huy hiệu ở màn SV A đổi tại chỗ, thẻ chuyển nhóm; sheet giải thích đang mở không đóng.
  2. 375 px: huy hiệu có chữ và icon, xuống dòng gọn; hai nhóm theo thứ tự S_cv.
  3. Form đợt nháp: nhập 3 / 1 thì báo lỗi thứ tự dưới ô ngưỡng cao; 1,234 báo lỗi 2 chữ số. Đợt đã mở hiện ngưỡng chỉ đọc.
  4. Chuyển đợt sang `TESTING`: CENTER thấy thông báo, có email trong Mailpit, mỗi JD một dòng.

## Files modified

- `packages/shared/schemas/`; `apps/api/src/modules/` (`matching`, `notification`, `company`, `campaign`), `common/scheduling/`, `drizzle/0027_*`
- `apps/api/test/integration/` (`competition` mới; preferences, shortlist, email-outbox, events-stream, campaign)
- `apps/web/src/shared/` (`api:sync`, thông báo), `features/student/preferences/`, `features/center/campaigns/`; `DESIGN.md` §6
- VERSION, `package.json` ×4, CHANGELOG, PRD, ARCHITECTURE, LESSONS §22, §35

## Cross-references

- [PRD FR-17](../../PRD.md#functional-requirements) · [Epic EPIC-3](../epics/EPIC-3.md) · [CHANGELOG](../../CHANGELOG.md) · [CONTEXT D13, D47, D48](../../CONTEXT.md) · [LESSONS](../../LESSONS.md)
