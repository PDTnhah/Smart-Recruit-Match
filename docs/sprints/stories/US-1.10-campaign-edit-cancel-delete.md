---
id: US-1.10
title: "Sửa, hủy và xóa đợt sau khi mở"
epic: EPIC-1
status: review
priority: P1
points: 8
sprint: sprint-2026-W46
version_shipped: 0.25.0
prd_ref: [FR-41]
arch_ref: [AD-8]
depends_on: [US-1.4, US-1.7, US-3.2]
assignee: PDTnhah
commit: 9485724
created: 2026-11-15
updated: 2026-11-16
---

## Goal

Đợt đã mở mà có chỗ sai hoặc kế hoạch thay đổi thì Cán bộ Trung tâm sửa được: đổi tên, thêm khóa hoặc ngành, chỉnh tham số chưa pha nào dùng tới, dời mốc chưa tới sớm hơn hay muộn hơn. Đợt mở nhầm hoặc không tổ chức nữa thì xóa (chưa có dữ liệu) hoặc hủy (đã có dữ liệu). SV và HR được báo khi mốc đổi hoặc đợt bị hủy. Điểm đã tính không lệch giữa các SV trong một đợt.

## Background

US-1.4 ([CONTEXT D27](../../CONTEXT.md)) khóa tên, đối tượng và tham số khi đợt rời `DRAFT`, chỉ cho lùi mốc chưa tới; chưa có thao tác xóa. Ngày 2026-11-15 người dùng yêu cầu "chỉnh sửa đợt xét tuyển sau khi mở, có thể chỉnh sửa hoặc xóa cho trung tâm" và chốt bốn điểm theo Đề xuất ([CONTEXT D56](../../CONTEXT.md)): tham số theo pha dùng nó; tên tự do, đối tượng chỉ thêm trong pha nhận CV; mốc chưa tới dời sớm hoặc muộn, kèm thông báo; xóa đợt trống, hủy đợt có dữ liệu.

Tám bảng có khóa ngoại tới `campaigns` (ARCH › *Các bảng chính*); xóa cứng chúng phải đi xuyên module (trái Nguyên tắc 13) và mất dữ liệu audit, nên đợt có dữ liệu chỉ được hủy.

**Lessons applied**: §2 (sửa tay PRD, epic, sprint), §6, §22, §25 (`row_version` lúc mở), §34 (việc một lần không chỉ ở listener), §35, §36, §44, §46; phiên 3: §47 (CRLF). Bài học mới: §48.

## Acceptance criteria

- [x] **AC-1** — **Given** đợt đã rời `DRAFT`, chưa `CLOSED`/`CANCELLED`, **When** `CENTER` gửi `PATCH /api/campaigns/{id}` có `config`, `reason`, `rowVersion` đúng, **Then** tham số được lưu nếu pha dùng nó chưa bắt đầu (bảng *Tham số theo pha*, hằng `CAMPAIGN_CONFIG_USED_FROM` ở shared), có một dòng audit trước/sau kèm lý do **And** tham số của pha đã bắt đầu trả `409 CAMPAIGN_CONFIG_LOCKED` kèm tên trường; pha tính như `assertPhase` (mốc kết thúc pha hiện tại đã qua thì coi như đã sang pha sau) **And** config sau khi gộp vẫn qua `CampaignConfigSchema`, sai thì `400` theo trường.
- [x] **AC-2** — **Given** đợt `INTAKE` đã có cặp được chấm (matching chạy tay), **When** `CENTER` đổi trọng số S_cv, **Then** sau commit S_cv của các cặp đã chấm được tính lại bằng `RecomputeScvService` (không job, không `ai.llm_calls` mới) **And** lượt matching lúc hết `intake_end` cũng tính lại trước khi chạy, phòng khi listener lỗi (LESSONS §34).
- [x] **AC-3** — **Given** đợt đã rời `DRAFT`, **Then** tên đổi được khi đợt chưa `CLOSED`/`CANCELLED` **And** đối tượng chỉ nhận thêm khóa hoặc ngành, chỉ khi đợt ở `INTAKE` trước `intake_end`; bỏ một giá trị hoặc thêm ngoài khoảng đó trả `409 CAMPAIGN_CONFIG_LOCKED` (`target.cohorts`/`target.majors`) **And** sau commit SV mới thuộc đối tượng nhận `CAMPAIGN_OPENED`; SV đã nhận thì không nhận lại.
- [x] **AC-4** — **Given** mốc chưa qua của đợt đã rời `DRAFT`, chưa `CLOSED`/`CANCELLED`, **When** `CENTER` dời mốc kèm lý do, **Then** mốc mới được nhận nếu muộn hơn mốc cũ, hoặc không sớm hơn `now + DEADLINE_MIN_NOTICE_HOURS` (24 giờ); các mốc vẫn tăng dần **And** sớm hơn giới hạn đó trả `400` ở trường của mốc; mốc đã qua trả `409 CAMPAIGN_CONFIG_LOCKED`; xóa mốc trả `400` **And** nhắc hạn (US-1.7) theo mốc mới.
- [x] **AC-5** — **Given** một `PATCH` có đổi mốc đã commit, **Then** SV thuộc đối tượng và HR của các công ty có JD trong đợt nhận `CAMPAIGN_DEADLINES_CHANGED` (app + email): tên đợt, mốc trước/sau, lý do; link SV `/sv/cv?campaign=<id>`, HR danh sách JD **And** một lần sửa chỉ báo một lần (dedupe theo `campaignId` + `rowVersion`) **And** listener lỗi chỉ ghi log, `PATCH` vẫn `200`.
- [x] **AC-6** — **Given** đợt ở `INTAKE`…`SUPPLEMENTARY`, **When** `CENTER` gọi `POST /api/campaigns/{id}/cancel` với `{ rowVersion, reason }`, **Then** đợt chuyển `CANCELLED` qua `transitionTo` (audit, lý do bắt buộc); `CANCELLED` là trạng thái cuối **And** sau commit phát `campaign.phase_changed` và `campaign.cancelled` **And** `DRAFT`, `CLOSED`, `CANCELLED` bị từ chối như cạnh không có trong bảng chuyển; `rowVersion` lệch trả `409` **And** migration thêm `CANCELLED` vào CHECK `campaigns.status`.
- [x] **AC-7** — **Given** đợt `CANCELLED`, **Then** mọi thao tác gọi `assertPhase` trả `409 CAMPAIGN_PHASE_MISMATCH`; tác vụ định kỳ không chuyển pha, nhắc hạn, tự gán NV hay gửi chấm cho đợt; `PATCH` trả `409 CAMPAIGN_CONFIG_LOCKED` **And** STUDENT, HR không thấy đợt trong `GET /api/campaigns`, `GET /api/campaigns/{id}` trả `404`; CENTER, ADMIN vẫn thấy **And** CV, JD, NV, bài test, audit giữ nguyên; màn của SV, HR không lỗi khi dữ liệu thuộc đợt không còn trong danh sách.
- [x] **AC-8** — **Given** đợt vừa bị hủy, **Then** SV thuộc đối tượng và HR của các công ty có JD trong đợt nhận `CAMPAIGN_CANCELLED` (app + email) có tên đợt và lý do; link SV `/sv`, HR `/hr` (đợt đã ẩn) **And** event lặp lại không tạo thêm thông báo.
- [x] **AC-9** — **Given** đợt không có dòng nào ở bảng tham chiếu tới nó, ở bất kỳ trạng thái nào, **When** `CENTER` gọi `DELETE /api/campaigns/{id}?rowVersion=N`, **Then** đợt bị xóa (`204`), có audit `CAMPAIGN_DELETED` kèm ảnh trước **And** đợt có dữ liệu trả `409 CAMPAIGN_HAS_DATA`, giữ nguyên; khóa ngoại của DB quyết định, code không đếm bảng module khác (Nguyên tắc 11, 13) **And** `rowVersion` lệch trả `409`; vai trò khác trả `403`.
- [ ] **AC-10** — Cổng Trung tâm, `RunningCampaignForm`: ô tên; đối tượng chỉ thêm (giá trị cũ không có nút xóa, ngoài `INTAKE` chỉ đọc); tham số còn sửa được là ô nhập, tham số khóa chỉ đọc kèm "Đã dùng từ pha …"; mốc chưa qua có Calendar chặn ngày sớm hơn 24 giờ tới trừ khi muộn hơn mốc cũ; một ô lý do bắt buộc. Nút "Hủy đợt" (`AlertDialog`, lý do bắt buộc, nói rõ dữ liệu được giữ, SV/HR được báo); "Xóa đợt" (`AlertDialog`; `409 CAMPAIGN_HAS_DATA` thì gợi ý hủy). Danh sách đợt có nhãn "Đã hủy"; thông báo trong app hiện được hai loại mới; đủ bốn trạng thái theo `DESIGN.md`; kiểm tay ở 360 / 768 / 1024 px.

## Tasks

Phiên 2 chia ba nhóm: 2a = TASK-1.10.1–1.10.2, 2b = TASK-1.10.3–1.10.4, 2c = TASK-1.10.5.

- [x] **TASK-1.10.1** — Quy tắc thuần ở shared và `running-edit.ts`, unit test (AC: 1, 3, 4, 6).
- [x] **TASK-1.10.2** — `PATCH` sau khi mở, `campaign.updated`, tính lại S_cv, `CAMPAIGN_OPENED` cho SV mới (AC: 1–4).
- [x] **TASK-1.10.3** — Hủy, xóa, migration `0039`, rà tác vụ quét (AC: 6, 7, 9).
- [x] **TASK-1.10.4** — Hai loại thông báo, listener SV và HR (AC: 5, 8).
- [x] **TASK-1.10.5** — Web: form theo pha, hộp thoại hủy/xóa, bộ lọc đợt, màn JD của HR (AC: 10).
- [ ] **TASK-1.10.6** — Kiểm tay AC-10 (người dùng; checklist ở *Implementation notes*).

## Dev notes

### Architecture constraints

- [AD-8](../../ARCHITECTURE.md#architecture-decisions): hủy qua `transitionTo`. Xóa không phải chuyển trạng thái nhưng vẫn khóa dòng, kiểm `row_version`, ghi audit trong cùng giao dịch.
- Nguyên tắc 11, 13: "đợt có dữ liệu" do khóa ngoại `NO ACTION` quyết định. Bảng mới trỏ tới `campaigns` ở story sau phải có khóa ngoại (ghi vào ARCH).
- Nguyên tắc 1, 9: tham số dùng cho điểm không đổi sau khi đã tính điểm. Trọng số S_cv là ngoại lệ có kiểm soát: đổi trong `INTAKE` thì code tính lại toàn bộ (AD-2).
- `campaign` không import `matching`, `company`, `notification`; các module đó nghe `campaign.updated` / `campaign.cancelled`. Không thêm thư viện; route mới có `@Roles('CENTER')`.

### Tham số theo pha

Tham số sửa được khi pha thực tế của đợt đứng trước pha "Dùng từ".

| Tham số | Dùng từ | Lý do |
|---|---|---|
| `t_test_minutes`, `match_top_m` | `INTAKE` (khóa khi mở) | Thời lượng mặc định lấy khi tạo ngân hàng câu hỏi; `match_top_m` dùng ở lượt matching chạy tay trong `INTAKE` (D56) |
| `scv_weight_*`, `theta_cv`, `n_nv`, `require_full_preferences`, `no_preference_policy`, `competition_thresholds` | `PREFERENCE_SELECTION` | Shortlist, NV, mức cạnh tranh; S_cv đã chấm trong `INTAKE` được tính lại (AC-2) |
| `theta_test`, `alpha`, `beta`, `appeal_window_hours` | `TESTING` | Chấm bài, S_final, phúc khảo |
| `k`, `r_max`, `sla_hr_business_days`, `t_offer_days` | `ALLOCATION_REVIEW` | Phân bổ, HR duyệt, lời mời |
| `reminder_hours_before` | không khóa (tới `CLOSED`) | Chỉ đổi lúc nhắc của mốc sau; không ảnh hưởng điểm hay thứ tự |

### Cross-story dependencies

- Builds on [US-1.4](US-1.4-campaign-setup-and-config.md) (`update`, form đợt), [US-1.7](US-1.7-notifications-sse-email-reminders.md) (`notify`, dedupe, nhắc hạn), [US-3.2](US-3.2-batch-matching-agent.md) (`RecomputeScvService`, AC-11).
- [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md), [US-6.1](US-6.1-campaign-dashboard.md), [US-6.5](US-6.5-campaign-close-report-export.md) phải bỏ qua hoặc ghi rõ đợt `CANCELLED`; đã ghi vào *Cross-story dependencies* của ba story đó.

### What we explicitly did NOT do

- Không xóa cứng đợt có dữ liệu, không xóa file MinIO, không khôi phục đợt đã hủy.
- Không báo khi xóa đợt trống (chưa SV nào đồng ý điều khoản, chưa HR nào có JD); thông báo "Đợt thực tập đã mở" cũ mở ra `404`.
- Không hủy email `CAMPAIGN_OPENED` còn chờ gửi của đợt vừa hủy hay xóa (khoảng hở vài giây).
- Không ghi đè tham số ở cấp JD (PRD GĐ0 nhắc tới, chưa có story).

### References

PRD › GĐ0, *Thông báo*, FR-41; ARCH › *Các module*, *Các bảng chính*, *API architecture*; CONTEXT D27, D31, D46, D56.

## Verification commands

Unit: `pnpm --filter @srm/shared test`, `pnpm --filter @srm/api test:unit`. Integration: `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/(campaign|match-results|matching-run|notification-listeners|route-guards)' --selectProjects integration`. Rồi `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm depcruise`.

| AC | Test |
|---|---|
| AC-1, AC-3, AC-4 | `running-edit.spec.ts`, `phase.spec.ts`, `schemas/__tests__/campaign.spec.ts`; `campaign.int-spec.ts`, `notification-listeners.int-spec.ts`, `deadline-reminder.int-spec.ts` › `FR-41: …` |
| AC-2 | `match-results.int-spec.ts` › `FR-41: S_cv weight change in INTAKE recomputes scored pairs` |
| AC-5, AC-8 | `campaign-notifications.int-spec.ts` › `FR-41: …` (người nhận, dedupe, listener lỗi, escape HTML) |
| AC-6, AC-9 | `campaign.int-spec.ts` › `US-1.10 AC-6: cancel`, `US-1.10 AC-9: delete`; `states/__tests__`; `route-guards.int-spec.ts` |
| AC-7 | `campaign-cancelled.int-spec.ts`, `campaign-scheduler.int-spec.ts`; `visibility.spec.ts`, `requirements-versioning.spec.ts`, `student-campaign.spec.ts` |
| AC-10 | Kiểm tay (checklist ở *Implementation notes*) |

## Changelog entry

Bản đầy đủ ở [CHANGELOG 0.25.0](../../CHANGELOG.md).

**Commit**: 9485724

## Implementation notes

**Phiên 1 (2026-11-15): Plan.** Người dùng chốt bốn điểm theo Đề xuất (D56). Nhánh `us-1.10` tạo từ `us-1.8` (`48a0e53`, chưa merge vào `dev`); merge US-1.8 trước.

**Phiên 2a–2c (2026-11-15): Execute.**
- Đợt hủy: thao tác nêu tên đợt (điều khoản, nộp CV, tạo JD) trả `404`, vì service gọi `CampaignService.get` trước `assertPhase`; sửa JD, lưu NV, chạy matching trả `409`. Tác vụ quét liệt kê trạng thái cụ thể nên bỏ qua `CANCELLED`. Vẫn chạy (chấp nhận): phiên thi đang làm đóng theo hạn; điểm Grader, chấm tay được lưu, không công bố.
- Lượt matching bị `409` không tính lại S_cv (đã sửa fixture `sCv` giả của test BR-18).
- Design applied: DESIGN §6 (badge "Đã hủy", hộp thoại hủy/xóa, *Form sửa một phần theo giai đoạn*), §7, §8, §9. Form cố định `now` lúc mở; lệch thì API trả `409`, gắn vào ô theo `details.fields`.

**Phiên 3 (2026-11-16): Review + Doc/Version gate.** `/code-review` nêu 15 điểm, sửa 14 (CHANGELOG 0.25.0, LESSONS §48):
- `me/exams` lấy đợt kế tiếp khi đợt mới nhất bị hủy; trọng số đọc `FOR SHARE` trong giao dịch ghi S_cv; `DELETE ?rowVersion=` rỗng trả `400`; hộp thoại gửi `rowVersion` của lúc mở; `campaign.updated` mang `targetBefore`; `PATCH` đợt đóng/hủy luôn `409`, nêu pha thực tế; ba quy tắc chuyển sang `@srm/shared`; 7 file CRLF đổi về LF (§47).
- Không sửa: danh sách đợt hủy mà bộ quét chấm bài loại trừ tăng dần (vài đợt mỗi năm); lượt matching vẫn khóa mọi cặp đã chấm khi tính lại.
- "Tất cả đợt" ở *CV cần xử lý*, *Duyệt JD* lọc ở web (`useCancelledCampaignIds`), vì hai danh sách không phân trang.
- koni-qc bảo mật: không có phát hiện ≥ 8; thêm test lý do hủy được escape trong email HTML.
- Self-verify: typecheck, lint, depcruise, build; `pnpm test` API 982/982, shared 403/403.

**Kiểm tay AC-10** (người dùng; `db:migrate` `0039` trước). Compose ở :8080, tài khoản CENTER, 360 / 768 / 1024 px:
1. Đợt *Nhận CV*: đổi tên, thêm khóa (khóa cũ không có nút xóa), đổi θ_cv; `match_top_m`, T_test chỉ đọc. Thiếu lý do thì báo lỗi ở ô.
2. Dời mốc sớm hơn: lịch chặn 24 giờ tới; dời muộn hơn thì lưu được, chuông SV và HR có "Đợt thực tập đổi mốc thời gian".
3. Đợt *Chọn nguyện vọng*: khóa, ngành chỉ hiện nhãn; mốc đã qua bị khóa.
4. "Xóa đợt" trên đợt có CV: báo không xóa được; "Hủy đợt thay vì xóa" mở hộp thoại hủy.
5. "Hủy đợt": nhãn "Đã hủy", trang chỉ đọc; SV, HR nhận thông báo; đợt biến mất khỏi màn SV; JD của HR ghi "Đợt đã hủy".
6. "Xóa đợt" trên đợt nháp mới: về danh sách, đợt không còn.
7. *CV cần xử lý*, *Duyệt JD*, *Chấm tay*: không còn đợt đã hủy.
8. 360 px: khung "Hủy hoặc xóa đợt" xếp dọc, nút không tràn; hộp thoại cuộn được.

## Files modified

`packages/shared` (`states`, `schemas`); `apps/api`: module `campaign`, `matching`, `notification`, `company`, `assessment`, `common/errors`, `db/errors.ts`, `drizzle/0039`, integration test; `apps/web`: `features/center/` (`campaigns`, `cvs`, `grading`, `jd-approval`), `features/hr/jds/`, `shared/` (`api`, `notifications`); tài liệu: `DESIGN.md`, PRD, ARCH, CONTEXT, LESSONS, AGENTS, EPIC-1, W46, US-5.5, US-6.1, US-6.5.

## Cross-references

[EPIC-1](../epics/EPIC-1.md) · [sprint-2026-W46](../sprint-2026-W46.md) · [CONTEXT D27, D56](../../CONTEXT.md)
