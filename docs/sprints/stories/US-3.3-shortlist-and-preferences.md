---
id: US-3.3
title: "Shortlist và chọn nguyện vọng"
epic: EPIC-3
status: review
priority: P0
points: 8
sprint: sprint-2026-W45
version_shipped: 0.18.0
prd_ref: [FR-15, FR-16]
depends_on: [US-3.2, US-1.4, US-3.5]
assignee: PDTnhah
commit:
created: 2026-10-07
updated: 2026-11-04
---

## Story refresh — 2026-11-03 (bắt đầu story)

Người dùng chốt ở phiên Plan ([CONTEXT D47](../../CONTEXT.md)): Q1, Q6 theo Đề xuất; một route `/sv/preferences` hai tab, từ `lg` hai cột, giải thích trong `Sheet`; lưu bằng nút (một `PUT` thay cả danh sách); nhắc hạn chọn NV làm ở đây (AC-18). Refresh 2026-11-02 thành AC-16, AC-17; D46 thêm cảnh báo `evidence_check`; tham số đợt mới thành AC-19.

## Goal

SV mở cổng trên điện thoại và thấy shortlist: các JD phù hợp, mỗi JD có S_cv, thành phần điểm, bằng chứng, kỹ năng còn thiếu và gợi ý cải thiện. SV chọn và sắp tối đa N_NV nguyện vọng từ shortlist. Hết hạn thì danh sách bị khóa; SV không chọn được xử lý theo Q6. Story cũng đưa bảng chuyển trạng thái của hồ sơ ứng tuyển vào `packages/shared/states`, để EPIC-4, EPIC-5 chỉ cần gọi `transitionTo`.

## Background

GĐ3 bước 3–4 và GĐ4 (UC-12, UC-13). Shortlist = JD đủ điều kiện cứng có S_cv ≥ θ_cv, sắp giảm dần (FR-15); SV chọn tối đa N_NV JD từ shortlist, NV1 ưu tiên cao nhất (FR-16, BR-04). Điểm do [US-3.2](US-3.2-batch-matching-agent.md) ghi ở `match_results`; giải thích được là yêu cầu cứng (NFR-4); SV chỉ thấy dữ liệu của mình, HR không thấy shortlist hay NV (BR-11). Mức cạnh tranh thuộc [US-3.4](US-3.4-competition-level-and-suggestions.md).

**Vòng đời hồ sơ ứng tuyển** (PRD › *Vòng đời trạng thái*, AD-8): 13 trạng thái, 17 chuyển (16 cạnh của sơ đồ cộng bước tạo ở `PENDING_TEST`) ở `packages/shared/states/application.ts`; các cạnh sau `PENDING_TEST` thuộc US-4.3, US-4.4, US-5.2–US-5.5.

**Lessons applied**: §6, §7, §10, §12, §15, §21, §22 (lọc theo loại / `dedupeKey`), §30 (`CORE_TABLES`, `ai-service-role`). **Lessons**: §34 mới (Q6 chỉ nằm trong listener sự kiện).

**Design applied**: §4 (hai cột rộng tới `80rem`), §5 (360 px, vùng chạm 44 px, nút chính `w-full` dưới `sm`), §6 (`tabs` `forceMount`, `sheet` dưới/phải, `progress` có `aria-label` và số %, `alert`, `badge`, `card`, `empty`, `select` trong `Field`, `ConfirmActionDialog`), §7, §9, §10, §11 (verdict có chữ và icon), §12.

## Acceptance criteria

- [x] **AC-1** — **Given** SV có CV `active` đã xác nhận và có kết quả chấm, **When** gọi `GET /api/me/shortlist`, **Then** response chỉ gồm JD `eligible` có S_cv ≥ θ_cv, sắp bằng `selectShortlist`.
  - Đợt: đợt có CV `active` mới nhất của SV, không ở `DRAFT`/`CLOSED`.
  - Dòng hiện hành: phiên bản CV `active`, phiên bản hiện hành của JD `APPROVED`/`RECRUITING`, `rules_version` hiện hành, prompt đã ghim của đợt (D46).
  - Mỗi JD có: vị trí, doanh nghiệp, nhóm vị trí, địa điểm, hình thức; S_cv; thành phần điểm (sᵢ, wᵢ của 5 tiêu chí); kỹ năng còn thiếu (`criteria.gaps`); gợi ý, điểm mạnh, nhận xét; `preferenceRank` (null nếu chưa chọn) (FR-15, NFR-4).
- [x] **AC-2** — Response có danh sách "Không đủ điều kiện" kèm `IneligibleReason`; giao diện hiện lý do bằng tiếng Việt. Các JD này không có S_cv và không chọn được. Cặp bị lọc top-M hoặc `needs_review` không hiện, chỉ đếm.
- [x] **AC-3** — Response không chứa dữ liệu, điểm hay thứ hạng của SV khác. HR, CENTER, ADMIN gọi `GET /api/me/shortlist` hay `PUT /api/me/preferences` nhận `403`. IDOR: SV A gửi `jd_id` chỉ nằm trong shortlist của SV B thì nhận `422`, dữ liệu của A và B không đổi.
- [x] **AC-4** — `state` là `NO_CONFIRMED_CV` | `SCORING` (lượt chấm của đợt đang chạy, hoặc CV chưa có kết quả) | `READY`. "Đang chấm" phân biệt được với "đã chấm nhưng không JD nào đạt θ_cv"; giao diện hiện thông điệp khác nhau.
- [x] **AC-5** — **Given** đợt ở `PREFERENCE_SELECTION`, chưa qua `preference_end`, **When** SV gửi `PUT /api/me/preferences` (`campaignId`, 1…N_NV JD khác nhau trong shortlist của mình, `rank` liên tục từ 1), **Then** danh sách cũ được thay toàn bộ trong một giao dịch, mỗi NV ở `PENDING_TEST`; `audit_logs` ghi `PREFERENCES_REPLACED` có trước/sau trong cùng giao dịch (FR-7); response trả danh sách mới.
- [x] **AC-6** — Vượt N_NV, JD ngoài shortlist (BR-04), JD trùng, `rank` không liên tục: `422` với mã `PREFERENCES_TOO_MANY` / `PREFERENCE_NOT_IN_SHORTLIST` / `PREFERENCE_DUPLICATE_JD` / `PREFERENCE_RANK_NOT_CONTIGUOUS`, thông điệp tiếng Việt, dữ liệu không đổi. Danh sách rỗng hợp lệ.
- [x] **AC-7** — Chèn thẳng vào `preferences` vi phạm `unique(campaign_id, student_id, rank)`, `unique(student_id, jd_id)` hoặc `CHECK (rank >= 1)` bị DB từ chối (Nguyên tắc 11).
- [x] **AC-8** — `require_full_preferences = true`: gửi ít hơn min(N_NV, số JD trong shortlist) NV thì `422 PREFERENCES_INCOMPLETE`. `false` (mặc định): API nhận, giao diện khuyến nghị chọn đủ.
- [x] **AC-9** — Đã qua `preference_end` theo giờ server (kể cả khi scheduler chưa chuyển pha) hoặc đợt đã rời `PREFERENCE_SELECTION`: `PUT` trả `409 CAMPAIGN_PHASE_MISMATCH`, dữ liệu không đổi. Giao diện ở chế độ chỉ đọc kèm thông báo đã khóa.
- [x] **AC-10** — Q6 (D47). Đợt chuyển `PREFERENCE_SELECTION → TESTING` với `no_preference_policy = AUTO_ASSIGN_TOP_SCV` (mặc định): mỗi SV có shortlist không rỗng mà chưa có NV được gán min(N_NV, số JD trong shortlist) JD đầu shortlist, actor `SYSTEM`, audit có lý do, thông báo `PREFERENCES_AUTO_ASSIGNED`. `NONE`: không gán. Chạy lại không tạo NV trùng.
- [x] **AC-11** — `packages/shared/states/application.ts`: kiểu, bảng chuyển, trạng thái kết thúc và nhãn tiếng Việt như Background. Unit test duyệt mọi cặp (từ, sang): đúng 17 chuyển được phép, trạng thái kết thúc không có chuyển ra.
- [x] **AC-12** — NV ở `PENDING_TEST`: `transitionTo` với `row_version` cũ trả `409`, không đổi gì; ghi audit lỗi thì cả giao dịch rollback. Kiểm bằng helper của US-1.2 trên bảng `preferences`.
- [x] **AC-13** — Hai `PUT` đồng thời của cùng SV được tuần tự hóa (`pg_advisory_xact_lock(3_303, student_id)`): kết quả cuối là đúng một trong hai danh sách, không lẫn dòng, không `500`, mỗi lần ghi có audit riêng.
- [ ] **AC-14** — Giao diện `/sv/preferences` ở 360 / 768 / 1024 px: không cuộn ngang; sắp NV bằng kéo-thả cảm ứng và bằng nút lên/xuống (dùng được bằng bàn phím); có trạng thái tải, rỗng, lỗi, đang chấm, chưa xác nhận hồ sơ, đã khóa; có dấu hiệu "chưa lưu" và cảnh báo khi rời trang; chuỗi tiếng Việt; verdict "Đáp ứng" / "Một phần" / "Không có bằng chứng".
- [ ] **AC-15** — Tab nguyện vọng luôn hiện thông điệp GĐ4 bước 4: hãy xếp NV đúng mong muốn thật, vì thuật toán bảo đảm đặt công ty cạnh tranh ở NV1 không làm SV mất cơ hội ở NV2, NV3.
- [x] **AC-16** — Giải thích từng kỹ năng: kiểu khớp ("Đúng kỹ năng" / "Kéo theo từ *X*" / "Cùng họ với *X*"), bậc bằng chứng (Đã nêu, Đã dùng, Dùng nhiều, Thành thạo) và nguồn trong CV (dự án, kinh nghiệm, chứng chỉ, danh sách kỹ năng). Ngoại ngữ hiện yêu cầu và chứng chỉ của SV kèm bậc CEFR; lý do `LANGUAGE_NOT_MET` hiện yêu cầu và chứng chỉ đang có. Nhãn vùng, bậc dùng chung với US-2.7.
- [x] **AC-17** — Độ phủ theo vùng của JD (ví dụ Backend 80 %) bằng danh sách thanh ngang `Progress` có số %, không thêm thư viện biểu đồ. Phần dự án hiện điểm, lý do, trích dẫn; trích dẫn có `evidence_check.matched = false` có cảnh báo (D46).
- [x] **AC-18** — Nguồn nhắc `preference-selection` (D31): đợt `PREFERENCE_SELECTION` có `preference_end` trong khung `reminder_hours_before`, người nhận là SV có shortlist không rỗng mà chưa có NV; một lần mỗi hạn (`deadline:{id}:preference_end:{ISO}`).
- [ ] **AC-19** — `campaigns.config` có `no_preference_policy` (`AUTO_ASSIGN_TOP_SCV` | `NONE`) và `require_full_preferences` (boolean, mặc định `false`); đợt cũ nhận mặc định khi parse; form đợt của Trung tâm sửa được cả hai, khóa sau khi mở đợt như tham số khác.

## Tasks

- [x] **TASK-3.3.1** — Vòng đời hồ sơ ứng tuyển, test bằng `mismatchedPairs` (AC: 11).
- [x] **TASK-3.3.2** — Bảng `preferences`, migration `0026_preferences.sql`, `applicationLifecycle`, helper test (AC: 5, 7, 12).
- [x] **TASK-3.3.3** — `GET /api/me/shortlist`, hàm thuần `shortlist-view.ts` dùng chung cho GET, PUT, Q6, nhắc hạn (AC: 1–4, 16, 17).
- [x] **TASK-3.3.4** — `PUT /api/me/preferences`, `checkPreferenceList`, sự kiện `matching.preferences.replaced` (AC: 3, 5, 6, 8, 9, 13).
- [x] **TASK-3.3.5** — Hai tham số đợt, Q6 qua `campaign.phase_changed`, thông báo `PREFERENCES_AUTO_ASSIGNED`, nguồn nhắc `preference-selection` (AC: 8, 10, 18, 19).
- [x] **TASK-3.3.6** — Giao diện: dnd-kit ghim bản (LESSONS §8), `features/student/preferences/`, route, việc ở trang chủ SV, hai `Select` trên form đợt (AC: 1, 2, 4, 9, 14–17, 19).
- [ ] **TASK-3.3.7** — Test theo *Verification commands* (xong); kiểm tay 360 / 768 / 1024 px (chờ người dùng).

## Dev notes

- AD-2 (không gọi LLM khi xem, chọn NV), AD-8, Nguyên tắc 7, 11, 13.
- Để mở (D47): trạng thái nào lưu ở `nominations` (EPIC-5); cạnh `TEST_GRADED → CLOSED` (BR-15) cần mục D mới; NV có JD ra phiên bản mới (BR-18) không tự hủy, giao diện đánh dấu và chặn lưu.
- US-3.4: hai sự kiện `matching.preferences.*`, chỗ đặt mức cạnh tranh ở `shortlist-card.tsx`; rebase sau US-3.3 rồi mới sinh migration. Không làm: mức cạnh tranh, màn Trung tâm xem/sửa NV, mở khóa NV sau hạn.

## Verification commands

> `pnpm --filter @srm/shared test`; `pnpm --filter @srm/api test:unit`; `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/(shortlist|preferences|deadline-reminder|core-schema|ai-service-role)' --selectProjects integration`. Tên test mở đầu bằng mã GĐ/BR; dưới đây là file › phần đầu tên.

| AC | Test |
|---|---|
| 1, 16, 17 | `shortlist.int-spec` › `GĐ3 shortlist: eligible JDs…`; `shortlist-view.spec` |
| 2, 4 | `shortlist.int-spec` › `…ineligible JDs listed…`, `…scoring in progress vs empty…` |
| 3 | `shortlist.int-spec` › `BR-11 shortlist…`; `preferences.int-spec` › `BR-04 IDOR…` |
| 5–9 | `preferences.int-spec` › `GĐ4 BR-04 replace…`, `BR-04 rejects…`, `BR-04 DB constraints…`, `GĐ4 require_full…`, `GĐ4 preferences locked…`; `preference-list.spec` |
| 10 | `preferences.int-spec` › `GĐ4 Q6 auto-assign…`, `GĐ4 Q6 sweep…`; `shortlist-view.spec` (property) |
| 11 | `states/__tests__/application.spec` › `application lifecycle allows exactly the 17 PRD transitions` |
| 12, 13 | `preferences.int-spec` › `transitionTo on preference…`, `concurrent preference replacements…` |
| 18 | `deadline-reminder.int-spec` › `GĐ4 preference_end reminder…` |
| 19 | `schemas/__tests__/campaign.spec`; kiểm tay form đợt |
| 14, 15 | Kiểm tay `/sv/preferences` ở 360 / 768 / 1024 px |

## Changelog entry

Xem [CHANGELOG 0.18.0](../../CHANGELOG.md).

**Commit**:

## Implementation notes

- **Backend:** `n_nv` ≤ `PREFERENCES_MAX` = 20. `SCORING` = lượt chấm `RUNNING`, hoặc CV chưa có kết quả cho JD hiện hành. AC-9 test bằng `preference_end` đã qua theo giờ thật (scheduler tắt trong test).
- **Web:** dnd-kit `core` 6.3.1, `sortable` 10.0.0, `utilities` 3.2.2 (peer `react >=16.8`); modifier dọc tự viết, không thêm `@dnd-kit/modifiers`.
  - Đợt ở `INTAKE` thì hiện "chưa đến giai đoạn", kể cả khi đã chấm sớm. `SCORING` tự tải lại mỗi 30 s. Bản nháp chỉ có sau khi SV sửa.
  - Lưu bị `409`: tải lại, chuyển chỉ đọc, giữ lỗi.
  - `apps/web` chưa có trình chạy test, nên `draft.ts` chưa có unit test.
- **Review (2026-11-04):** `/code-review` nêu 10 điểm, đã sửa 8:
  - Q6 thêm tác vụ quét và chờ lượt chấm `RUNNING` (D47, LESSONS §34).
  - Q6 và nhắc hạn đọc gọn (`shortlistSummary`, property test). `userIdsByStudent` bỏ N+1. `lockEntityInTx` dùng chung.
  - Việc ở trang chủ chỉ hiện cho đợt mà `/sv/preferences` hiển thị, khi CV đã xác nhận.
  - `PUT` kiểm pha trước khi đọc shortlist. Sửa comment về thông điệp `422`.
  - **Chưa sửa:** CV không có kết quả cho JD hiện hành (JD ra phiên bản mới sau lượt chấm) mà không lượt nào chạy thì vẫn `SCORING` tới khi Trung tâm chạy lại; tab mở thì tải lại mỗi 30 s.
  - koni-qc: mọi AC có test, trừ phần kiểm tay. Thêm vào test IDOR một ca gửi thừa trường (`studentId`, `status`).
- **Self-verify cuối:** typecheck, lint, depcruise, build web; `pnpm test` 764/764, shared 322/322.
- **Chờ người dùng kiểm tay** (chế độ cảm ứng; xong thì `[x]` AC-14, AC-15, AC-19, TASK-3.3.7, story `done`):
  1. `/sv/preferences` ở 360 / 768 / 1024 px, mọi trạng thái của AC-14: không cuộn ngang, từ 1024 px hai cột.
  2. `Sheet` giải thích (dưới khi < 768 px, phải khi rộng hơn): đủ mục, có cảnh báo trích dẫn.
  3. Đủ N_NV thì "Chọn" tắt; sắp bằng kéo cảm ứng, bàn phím, nút lên/xuống 44 px.
  4. "Chưa lưu", hỏi khi rời trang; lưu có toast, thứ tự giữ sau khi tải lại.
  5. `Alert` GĐ4 luôn hiện; sau hạn chỉ đọc; trang chủ có việc "Chọn nguyện vọng".
  6. Form đợt: hai `Select` sửa, lưu được ở đợt nháp; chỉ đọc sau khi mở.

## Files modified

- `packages/shared`: `states/application.ts`; `schemas/matching.ts`, `campaign.ts`, `notification.ts`, `errors.ts`; test.
- `apps/api`: bảng `preferences` + `drizzle/0026`; `modules/matching` (domain, application, api, repository); service export ở `student`, `company`, `campaign`, `notification`; `common/`; test integration và helper.
- `apps/web`: `features/student/preferences/` (mới), router, trang chủ SV, `center/campaigns/`, `shared/api`, thông báo; dnd-kit trong `package.json`, `pnpm-lock.yaml`.
- `DESIGN.md` §6; `docs/` (PRD, ARCHITECTURE, CONTEXT D47, LESSONS §34, CHANGELOG).

## Cross-references

- [PRD FR-15, FR-16](../../PRD.md#functional-requirements)
- [Epic EPIC-3](../epics/EPIC-3.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D8, D31, D46, D47](../../CONTEXT.md)
- [LESSONS §34](../../LESSONS.md)
