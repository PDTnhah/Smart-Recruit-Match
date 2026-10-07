---
id: US-3.3
title: "Shortlist và chọn nguyện vọng"
epic: EPIC-3
status: backlog
priority: P0
points: 8
sprint:
version_shipped:
prd_ref: [FR-15, FR-16]
depends_on: [US-3.2, US-1.4]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

SV mở cổng trên điện thoại và thấy shortlist: các JD phù hợp với mình, mỗi JD kèm S_cv, thành phần điểm, bằng chứng, kỹ năng còn thiếu và gợi ý cải thiện. SV chọn và sắp tối đa N_NV nguyện vọng từ shortlist. Hết hạn thì danh sách bị khóa. Story cũng đưa bảng chuyển trạng thái đầy đủ của hồ sơ ứng tuyển vào `packages/shared/states`, nhờ vậy EPIC-4 và EPIC-5 chỉ cần gọi `transitionTo` mà không phải định nghĩa lại vòng đời.

## Background

Story phủ GĐ3 bước 3–4 và GĐ4 (PRD › *Quy trình nghiệp vụ theo giai đoạn*), tức UC-12 và UC-13. Shortlist của SV gồm các JD đủ điều kiện cứng có S_cv ≥ θ_cv, sắp giảm dần theo S_cv (FR-15). SV chọn tối đa N_NV JD **từ shortlist** và sắp thứ tự ưu tiên; NV1 là ưu tiên cao nhất (FR-16, BR-04). Hết hạn chọn NV thì danh sách bị khóa. SV không chọn NV nào được xử lý theo chính sách Q6. Dữ liệu điểm do [US-3.2](US-3.2-batch-matching-agent.md) ghi vào `match_results`; hàm lập shortlist có sẵn ở [US-3.1](US-3.1-hard-filters-and-scv-formula.md).

Giải thích được là yêu cầu cứng (NFR-4): mỗi điểm hiển thị kèm thành phần và bằng chứng. PRD › Personas giới hạn quyền xem: SV chỉ thấy điểm của chính mình, không thấy điểm hay thứ hạng của người khác. HR không thấy shortlist hay nguyện vọng; HR chỉ thấy hồ sơ được đề cử (BR-11). ARCH › *Màn hình theo cổng* mô tả màn Shortlist là thẻ JD có S_cv, kỹ năng thiếu, gợi ý cải thiện và mức cạnh tranh, còn màn Chọn nguyện vọng cho kéo-thả sắp thứ tự (dnd-kit). Phần sinh viên phải dùng tốt trên điện thoại (NFR-13). Mức cạnh tranh thuộc [US-3.4](US-3.4-competition-level-and-suggestions.md).

Hồ sơ ứng tuyển là một cặp SV–JD, có vòng đời tính từ lúc SV chọn NV (PRD › *Vòng đời trạng thái* › *Hồ sơ ứng tuyển*). Theo AD-8 ([CONTEXT D8](../../CONTEXT.md)), mỗi vòng đời có kiểu trạng thái và bảng chuyển trạng thái trong `packages/shared/states`; mọi thay đổi đi qua `transitionTo` của [US-1.2](US-1.2-core-db-schema-transition-audit-log.md). Story này chỉ thực hiện bước tạo NV, nhưng phải định nghĩa toàn bộ bảng chuyển để các story sau dùng chung:

| Mã trạng thái (đề xuất) | Nhãn PRD |
|---|---|
| `PENDING_TEST` | Chờ làm test |
| `TEST_GRADED` | Đã chấm test |
| `BELOW_THRESHOLD` | Không đạt ngưỡng |
| `WAITING_NEXT_ROUND` | Chờ vòng sau |
| `NOMINATED` | Được đề cử |
| `INTERVIEW` | Mời phỏng vấn |
| `HR_REJECTED` | HR từ chối |
| `PASSED` | Đạt phỏng vấn |
| `RESERVE` | Dự bị |
| `INTERVIEW_FAILED` | Không đạt phỏng vấn |
| `ACCEPTED` | Đã nhận thực tập |
| `DECLINED` | SV từ chối / quá hạn |
| `CLOSED` | Đóng |

`NOMINATED`, `INTERVIEW`, `PASSED`, `RESERVE` lấy từ AGENTS › *Thuật ngữ* (BR-08); các mã còn lại là đề xuất. Bảng chuyển chép đúng sơ đồ PRD:

| Từ | Sang | Sự kiện (PRD) | Story dự kiến thực hiện |
|---|---|---|---|
| (tạo mới) | `PENDING_TEST` | SV chọn NV | US-3.3 |
| `PENDING_TEST` | `TEST_GRADED` | Nộp bài, chấm xong | US-4.4 |
| `PENDING_TEST` | `CLOSED` | Quá hạn không làm (BR-06) | US-4.3 |
| `TEST_GRADED` | `BELOW_THRESHOLD` | Dưới ngưỡng θ_test | US-4.4 |
| `TEST_GRADED` | `NOMINATED` | Thuật toán chọn | US-5.2 |
| `TEST_GRADED` | `WAITING_NEXT_ROUND` | Không được chọn ở vòng này | US-5.2 |
| `WAITING_NEXT_ROUND` | `NOMINATED` | Vòng bổ sung | US-5.5 |
| `WAITING_NEXT_ROUND` | `CLOSED` | SV đã nhận nơi khác / hết vòng | US-5.4, US-5.5 |
| `NOMINATED` | `INTERVIEW` | HR mời | US-5.3 |
| `NOMINATED` | `HR_REJECTED` | HR từ chối | US-5.3 |
| `INTERVIEW` | `PASSED` | Đạt | US-5.4 |
| `INTERVIEW` | `RESERVE` | Đạt nhưng hết suất | US-5.4 |
| `INTERVIEW` | `INTERVIEW_FAILED` | Không đạt / vắng | US-5.4 |
| `RESERVE` | `PASSED` | Có suất trống | US-5.4 |
| `RESERVE` | `CLOSED` | Hết hạn dự bị | US-5.4 |
| `PASSED` | `ACCEPTED` | SV nhận | US-5.4 |
| `PASSED` | `DECLINED` | SV từ chối / quá hạn | US-5.4 |

Trạng thái kết thúc: `BELOW_THRESHOLD`, `HR_REJECTED`, `INTERVIEW_FAILED`, `ACCEPTED`, `DECLINED`, `CLOSED`.

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** SV có `match_results` cho phiên bản CV hiệu lực, **When** gọi `GET /api/me/shortlist`, **Then** response chỉ gồm các JD có `eligible = true` và S_cv ≥ θ_cv, lấy theo phiên bản CV hiện hành, phiên bản JD hiện hành và `prompt_version` của đợt, sắp bằng `selectShortlist` (US-3.1). Mỗi JD có: thông tin JD (vị trí, doanh nghiệp, nhóm vị trí, địa điểm, hình thức), S_cv, bảng thành phần (sᵢ, wᵢ của 5 tiêu chí), từng kỹ năng với verdict và bằng chứng, kỹ năng còn thiếu, gợi ý cải thiện, nhận xét ngắn, và `preference_rank` (null nếu chưa chọn) (FR-15, NFR-4).
- [ ] **AC-2** — Response có thêm danh sách JD "Không đủ điều kiện" kèm lý do hiển thị bằng tiếng Việt (ánh xạ từ mã lý do của US-3.1). Các JD này không có S_cv và không chọn được.
- [ ] **AC-3** — Response không chứa dữ liệu, điểm hay thứ hạng của SV khác (PRD › Personas). HR, CENTER hoặc ADMIN gọi `GET /api/me/shortlist` hay `PUT /api/me/preferences` thì nhận `403`. Test IDOR: SV A gửi `PUT /api/me/preferences` có `jd_id` chỉ nằm trong shortlist của SV B thì nhận `422`, và dữ liệu của cả A lẫn B không đổi.
- [ ] **AC-4** — **Given** lượt chấm của đợt chưa xong hoặc SV chưa có hồ sơ được chấm, **When** mở shortlist, **Then** API trả trạng thái "đang chấm" phân biệt được với trường hợp "đã chấm nhưng không có JD nào đạt θ_cv"; giao diện hiện hai thông điệp khác nhau.
- [ ] **AC-5** — **Given** đợt đang ở `PREFERENCE_SELECTION` và chưa qua `phase_deadlines.preference_end`, **When** SV gửi `PUT /api/me/preferences` với danh sách có thứ tự gồm 1…N_NV JD khác nhau trong shortlist của mình, **Then** danh sách cũ được thay toàn bộ trong một giao dịch: mỗi NV có `rank` liên tục từ 1 và `status = PENDING_TEST`; `audit_logs` ghi trước/sau trong cùng giao dịch (FR-7); response trả danh sách mới.
- [ ] **AC-6** — **Given** danh sách vượt N_NV, có JD ngoài shortlist (BR-04), có JD trùng, hoặc `rank` không liên tục, **When** gửi `PUT /api/me/preferences`, **Then** API trả `422` kèm mã lỗi có thông điệp tiếng Việt, và dữ liệu không đổi. Danh sách rỗng là hợp lệ (SV bỏ hết NV trước hạn).
- [ ] **AC-7** — Ràng buộc DB: chèn thẳng vào `preferences` (bỏ qua service) mà vi phạm `unique(campaign_id, student_id, rank)`, `unique(student_id, jd_id)` hoặc `CHECK (rank >= 1)` thì bị từ chối ở tầng DB (AGENTS › Nguyên tắc 11).
- [ ] **AC-8** — **Given** `campaigns.config.require_full_preferences = true` (đề xuất; GĐ4 bước 3 cho phép cấu hình bắt buộc), **When** SV gửi ít hơn min(N_NV, số JD trong shortlist) NV, **Then** API trả `422`. Khi tham số là `false` (mặc định), API nhận danh sách và giao diện hiện khuyến nghị chọn đủ N_NV.
- [ ] **AC-9** — **Given** giờ server đã qua `phase_deadlines.preference_end` (kể cả khi scheduler của US-1.4 chưa kịp chuyển pha), hoặc đợt đã rời `PREFERENCE_SELECTION`, **When** SV gửi `PUT /api/me/preferences`, **Then** API trả `409` mã `CAMPAIGN_PHASE_MISMATCH` (qua `CampaignService.assertPhase` của US-1.4) và dữ liệu không đổi. Giao diện hiện danh sách ở chế độ chỉ đọc kèm thông báo đã khóa.
- [ ] **AC-10** — Chạm Q6. **Given** `campaigns.config.no_preference_policy = AUTO_ASSIGN_TOP_SCV` (mặc định theo Đề xuất của Q6), **When** đợt chuyển `PREFERENCE_SELECTION → TESTING`, **Then** mỗi SV có shortlist không rỗng mà chưa có NV nào được gán min(N_NV, số JD trong shortlist) JD có S_cv cao nhất, theo đúng thứ tự shortlist. Việc gán dùng actor `SYSTEM`, ghi audit có lý do, và SV nhận thông báo qua `NotificationService` (US-1.7). **Given** tham số là `NONE`, **Then** hệ thống không gán gì. Chạy lại không tạo NV trùng.
- [ ] **AC-11** — `packages/shared/states` có kiểu trạng thái và bảng chuyển của hồ sơ ứng tuyển như ở Background. Unit test duyệt mọi cặp (từ, sang): đúng 17 chuyển trong bảng được phép, mọi cặp khác bị từ chối, trạng thái kết thúc không có chuyển ra. Kèm nhãn tiếng Việt cho giao diện.
- [ ] **AC-12** — **Given** một NV ở `PENDING_TEST`, **When** gọi `transitionTo` với `row_version` cũ, **Then** trả `409` và không có gì thay đổi. **When** ghi audit lỗi, **Then** cả giao dịch rollback. Kiểm bằng helper test `transitionTo` của US-1.2 trên bảng `preferences`.
- [ ] **AC-13** — **Given** hai request `PUT /api/me/preferences` đồng thời của cùng SV, **When** cả hai chạy, **Then** chúng được tuần tự hóa: kết quả cuối là đúng một trong hai danh sách, không lẫn dòng, không có lỗi `500` do vi phạm ràng buộc, và mỗi lần ghi có audit riêng.
- [ ] **AC-14** — Giao diện ở chiều rộng 375 px: thẻ shortlist đọc được không cần cuộn ngang; sắp thứ tự NV được bằng kéo-thả cảm ứng và bằng nút lên/xuống (dùng được bằng bàn phím); có trạng thái loading, rỗng, lỗi, đang chấm và đã khóa; mọi chuỗi bằng tiếng Việt; verdict hiển thị "Đáp ứng" / "Một phần" / "Không có bằng chứng". Story ghi `Design applied:`.
- [ ] **AC-15** — Màn chọn nguyện vọng luôn hiện thông điệp của GĐ4 bước 4: hãy xếp NV đúng mong muốn thật, vì thuật toán phân bổ bảo đảm việc đặt một công ty cạnh tranh ở NV1 không làm SV mất cơ hội ở NV2, NV3.

## Tasks

- [ ] **TASK-3.3.1** — Vòng đời hồ sơ ứng tuyển trong `packages/shared/states` — một định nghĩa cho FE, BE và các epic sau; merge trước (AC: 11)
  - [ ] Subtask 3.3.1.1 — `packages/shared/states/application.ts`: union literal 13 trạng thái, bảng chuyển 17 cạnh, danh sách trạng thái kết thúc, nhãn tiếng Việt.
  - [ ] Subtask 3.3.1.2 — `packages/shared/states/application.spec.ts`: duyệt toàn bộ ma trận (từ, sang).
  - [ ] Subtask 3.3.1.3 — Merge trước các story phụ thuộc ([sprints/README › Chạy song song](../README.md#chạy-song-song)).
- [ ] **TASK-3.3.2** — Bảng `preferences` — quy tắc BR-04 có ràng buộc DB (AC: 5, 7, 12)
  - [ ] Subtask 3.3.2.1 — Drizzle schema trong `apps/api/src/db/` và migration trong `apps/api/drizzle/`: cột theo ARCH › *Các bảng chính* (`id`, `campaign_id`, `student_id`, `jd_id`, `rank`, `status`), thêm `row_version` (đề xuất, AD-8 cần cột này cho vòng đời) và `created_at`. Ràng buộc `unique(student_id, jd_id)`, `unique(campaign_id, student_id, rank)`, `CHECK (rank >= 1)`.
  - [ ] Subtask 3.3.2.2 — `apps/api/src/modules/matching/infrastructure/preferences.repository.ts`.
  - [ ] Subtask 3.3.2.3 — Theo [D20](../../CONTEXT.md), mỗi đợt merge chỉ một story được sinh migration.
- [ ] **TASK-3.3.3** — API shortlist có giải thích — SV hiểu vì sao có điểm đó (AC: 1, 2, 3, 4)
  - [ ] Subtask 3.3.3.1 — Zod schema response `ShortlistResponse` trong `packages/shared/schemas/`.
  - [ ] Subtask 3.3.3.2 — `apps/api/src/modules/matching/application/shortlist.service.ts`: lấy CV hiệu lực qua service export của `student`, thông tin JD qua service export của `company`, đọc `match_results` của module mình, gọi `selectShortlist`. Kỹ năng còn thiếu suy ra từ verdict `NOT_MET` sau kiểm tra trích dẫn; `gaps` của LLM hiển thị như nhận xét (đề xuất).
  - [ ] Subtask 3.3.3.3 — `apps/api/src/modules/matching/api/me-shortlist.controller.ts`: `GET /api/me/shortlist`, `@Roles('STUDENT')`, chủ thể lấy từ JWT, không nhận `student_id` từ request.
- [ ] **TASK-3.3.4** — API chọn nguyện vọng — kiểm tra ở service, chặn lần nữa ở DB (AC: 3, 5, 6, 8, 9, 13)
  - [ ] Subtask 3.3.4.1 — Zod schema request `ReplacePreferencesRequest` trong `packages/shared/schemas/`; mã lỗi và thông điệp tiếng Việt.
  - [ ] Subtask 3.3.4.2 — `apps/api/src/modules/matching/application/preferences.service.ts`: gọi `CampaignService.assertPhase(campaignId, ['PREFERENCE_SELECTION'])` và so giờ server với `phase_deadlines.preference_end`; đọc `n_nv` qua service của `campaign`; kiểm tra N_NV, BR-04, trùng lặp, `require_full_preferences`; tuần tự hóa theo (campaign, SV) bằng khóa dòng trong giao dịch; thay danh sách; tạo NV ở `PENDING_TEST` và ghi audit trong cùng giao dịch.
  - [ ] Subtask 3.3.4.3 — Sau khi commit, phát sự kiện thay đổi NV (`@nestjs/event-emitter`; tên sự kiện đề xuất `matching.preferences.replaced`, kèm `campaign_id` và các `jd_id` bị ảnh hưởng) để US-3.4 cập nhật mức cạnh tranh.
  - [ ] Subtask 3.3.4.4 — `apps/api/src/modules/matching/api/me-preferences.controller.ts`: `PUT /api/me/preferences`, `@Roles('STUDENT')`.
- [ ] **TASK-3.3.5** — Khóa danh sách và chính sách Q6 — xử lý khi hết hạn (AC: 9, 10)
  - [ ] Subtask 3.3.5.1 — Khóa dựa trên pha của đợt và giờ server (`assertPhase` + `preference_end`); không tin giờ client.
  - [ ] Subtask 3.3.5.2 — `apps/api/src/modules/matching/application/auto-assign-preferences.service.ts`: chạy khi nhận sự kiện đợt chuyển `PREFERENCE_SELECTION → TESTING` (US-1.4 hiện chỉ phát `campaign.opened`; tên đề xuất `campaign.phase_changed`, phối hợp với US-1.4); đọc `campaigns.config.no_preference_policy` (đề xuất, giá trị `AUTO_ASSIGN_TOP_SCV` | `NONE`); idempotent; gửi thông báo cho SV qua US-1.7. Xong thì phát sự kiện để US-3.4 gửi cảnh báo cho Trung tâm.
  - [ ] Subtask 3.3.5.3 — Thêm `no_preference_policy` và `require_full_preferences` vào schema `campaigns.config` (`packages/shared/schemas/`), phối hợp với US-1.4.
- [ ] **TASK-3.3.6** — Giao diện Shortlist và Chọn nguyện vọng cho điện thoại (AC: 1, 2, 4, 9, 14, 15)
  - [ ] Subtask 3.3.6.1 — Đọc `DESIGN.md` trước khi code, ghi `Design applied: …` vào story; dùng skill shadcn để chọn và ghép component.
  - [ ] Subtask 3.3.6.2 — `apps/web/src/features/student/shortlist/`: thẻ JD (S_cv, thành phần điểm thu gọn/mở rộng, bằng chứng, kỹ năng còn thiếu, gợi ý cải thiện), nhóm "Không đủ điều kiện" kèm lý do; chừa chỗ cho mức cạnh tranh của US-3.4.
  - [ ] Subtask 3.3.6.3 — `apps/web/src/features/student/preferences/`: danh sách sắp được bằng dnd-kit (cảm ứng, bàn phím) và nút lên/xuống, đếm "x/N_NV", thông điệp GĐ4 bước 4, chế độ chỉ đọc khi khóa. Route đề xuất `/sv/shortlist`, `/sv/preferences`.
  - [ ] Subtask 3.3.6.4 — Gọi API bằng TanStack Query qua API client sinh từ OpenAPI; kiểm tra form bằng Zod schema dùng chung.
- [ ] **TASK-3.3.7** — Test (AC: 3, 5–13)
  - [ ] Subtask 3.3.7.1 — `apps/api/test/integration/shortlist.int-spec.ts`: nội dung shortlist, trạng thái đang chấm, IDOR, `403`.
  - [ ] Subtask 3.3.7.2 — `apps/api/test/integration/preferences.int-spec.ts`: BR-04, ràng buộc DB, khóa, cấu hình bắt buộc đủ NV, Q6, audit, `409`, đồng thời.
  - [ ] Subtask 3.3.7.3 — Kiểm tra giao diện ở 375 px theo `DESIGN.md`, ghi kết quả vào Implementation notes; chạy `/code-review` cho phần web.

## Dev notes

### Architecture constraints

- AD-8 ([ARCHITECTURE › Architecture decisions](../../ARCHITECTURE.md#architecture-decisions), [CONTEXT D8](../../CONTEXT.md)): bảng chuyển trạng thái tự viết trong `packages/shared/states`, mọi thay đổi đi qua `transitionTo` + `row_version` + audit trong cùng giao dịch. Bị loại: thư viện state machine (XState). Story chỉ dùng AD-8, không hiện thực hóa nó, nên `arch_ref` để trống.
- AD-2: shortlist chỉ hiển thị S_cv do code tính ở US-3.2; không gọi LLM khi SV xem hay chọn NV.
- AGENTS › Nguyên tắc 7: phân quyền cấp bản ghi. Endpoint `/me/*` lấy chủ thể từ JWT và không nhận ID SV từ request; mọi `jd_id` gửi lên phải thuộc shortlist của chính SV.
- AGENTS › Nguyên tắc 11: BR-04 có ràng buộc DB tương ứng (hai unique index và `CHECK`). Giới hạn N_NV phụ thuộc cấu hình đợt nên kiểm tra ở service.
- AGENTS › Nguyên tắc 13: module `matching` sở hữu `preferences` và `match_results` (ARCH › *Các module*); đọc CV, JD và đợt qua service export.
- AGENTS › Nguyên tắc 14: response, request, trạng thái và nhãn đặt ở `packages/shared`.
- Chạm Q1: tạm dùng Đề xuất (SV chọn tối đa 3 NV từ shortlist). Tham số đã có là `campaigns.config.n_nv` của US-1.4; hỏi trước khi chốt.
- Chạm Q6: tạm dùng Đề xuất (tự gán N_NV JD có S_cv cao nhất trong shortlist và thông báo cho SV), đưa thành tham số `campaigns.config.no_preference_policy`; hỏi trước khi chốt.
- Các điểm spec chưa nói rõ. Story tạm dùng phương án dưới đây và **hỏi trước khi chốt**:
  - Vòng đời hồ sơ ứng tuyển và cột trạng thái: `preferences.status` và `nominations.status` (`NOMINATED`, `INTERVIEW`, `PASSED`, `RESERVE`) chồng lên nhau. Story chỉ định nghĩa bảng chuyển; trạng thái nào lưu ở bảng nào do EPIC-5 chốt. Mã trạng thái ngoài 4 mã của AGENTS là đề xuất.
  - Sơ đồ PRD thiếu `TEST_GRADED → CLOSED`, trường hợp SV nhận nơi khác (BR-15) khi NV vừa chấm test xong mà chưa qua vòng phân bổ (VD ở vòng bổ sung). Story giữ đúng sơ đồ; thêm cạnh thì cần mục D mới.
  - Vòng đời "Sinh viên trong đợt" (`… → Đã chọn NV → …`) không có cột hay bảng nào trong ARCH. Story không lưu trạng thái này.
  - `GET /api/me/shortlist` không có tham số đợt. Tạm lấy đợt đang mở mà SV có CV hiệu lực.
  - NV đã chọn mà sau đó cặp rơi khỏi shortlist (JD có phiên bản mới theo BR-18): spec không nói xử lý thế nào. Story không tự hủy NV.
  - Sự kiện đổi pha: US-1.4 chỉ phát `campaign.opened`. Q6 và cảnh báo của US-3.4 cần sự kiện khi đợt chuyển `PREFERENCE_SELECTION → TESTING`; tên tạm `campaign.phase_changed`.
  - Kỹ năng còn thiếu: tạm suy ra từ verdict `NOT_MET` sau kiểm tra trích dẫn; `gaps` của LLM chỉ hiển thị như nhận xét.

### Cross-story dependencies

- Builds on [US-3.2](US-3.2-batch-matching-agent.md) — `match_results` (S_cv, `criteria` có verdict, bằng chứng, `evidence_check`, `suggestions`, `summary`; `ineligible_reasons`).
- Builds on [US-3.1](US-3.1-hard-filters-and-scv-formula.md) — `selectShortlist`, `IneligibleReasonCode`.
- Builds on [US-1.4](US-1.4-campaign-setup-and-config.md) — `campaigns.config` (`n_nv`, `theta_cv`), `phase_deadlines.preference_end`, pha `PREFERENCE_SELECTION`, `CampaignService.assertPhase`, scheduler chuyển pha.
- Builds on [US-1.2](US-1.2-core-db-schema-transition-audit-log.md) — `transitionTo`, `audit_logs`, helper test chuyển trạng thái.
- Builds on [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md) — `@Roles()`, helper đăng nhập theo vai trò cho test IDOR, `DESIGN.md`, khung cổng `/sv/*`.
- Builds on [US-1.7](US-1.7-notifications-sse-email-reminders.md) — `NotificationService` để báo SV khi tự gán NV (Q6). US-1.7 xong ở T4, không nằm trong `depends_on` theo bảng kế hoạch.
- Required by [US-3.4](US-3.4-competition-level-and-suggestions.md) — nghe sự kiện thay đổi NV và sự kiện sau khi tự gán NV; thêm trường `competition` vào `ShortlistResponse`.
- Required by [US-4.3](US-4.3-exam-room.md) — bắt đầu bài test từ một NV ở `PENDING_TEST` (`POST /api/preferences/{id}/exam/start`); hủy NV quá hạn (`PENDING_TEST → CLOSED`).
- Required by [US-4.4](US-4.4-grading-stest-sfinal.md), [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md), [US-5.3](US-5.3-hr-nomination-review.md), [US-5.4](US-5.4-interviews-reserve-and-offers.md) — dùng bảng chuyển trạng thái trong `packages/shared/states/application.ts`.
- Required by [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) — dùng lại màn và endpoint chọn NV để SV trong hàng chờ thêm NV.
- Sibling [US-3.4](US-3.4-competition-level-and-suggestions.md) — cùng tuần T8, làn A; cùng sửa `ShortlistResponse` và `preferences.service.ts`. US-3.3 merge trước.

### Performance budget

- Epic không đặt budget riêng cho story này. Truy vấn shortlist đi theo `cv_id`, là cột đầu của unique index trên `match_results`, nên không cần thêm index.

### What we explicitly did NOT do

- Không hiển thị mức cạnh tranh và gợi ý ít cạnh tranh; việc này thuộc US-3.4.
- Không cho thêm NV ở vòng bổ sung; việc này thuộc US-5.5, dùng lại màn này.
- Không có màn để Trung tâm xem hay sửa NV của SV. Trung tâm chỉ điều chỉnh kết quả phân bổ (US-5.2). Trigger để xem lại: Trung tâm cần xử lý ngoại lệ NV.
- Không mở khóa NV sau hạn. Spec không có luồng này.
- Không lưu trạng thái "Sinh viên trong đợt" (xem Dev notes).

### References

- [Source: PRD › Functional Requirements — FR-15, FR-16](../../PRD.md#functional-requirements)
- [Source: PRD › Non-Functional Requirements — NFR-4, NFR-13](../../PRD.md#non-functional-requirements)
- Source: PRD › GĐ3 (bước 3–4), GĐ4; *Vòng đời trạng thái* › *Hồ sơ ứng tuyển*; *Quy tắc nghiệp vụ* BR-04, BR-06, BR-08, BR-11; Personas; *Các điểm cần chốt* Q1, Q6 ([PRD.md](../../PRD.md))
- [Source: ARCHITECTURE › Architecture decisions — AD-2, AD-8](../../ARCHITECTURE.md#architecture-decisions)
- Source: ARCHITECTURE › *Màn hình theo cổng*, *Các module* (`matching`), *Quản lý trạng thái* ([ARCHITECTURE.md](../../ARCHITECTURE.md))
- [Source: ARCHITECTURE › Data architecture](../../ARCHITECTURE.md#data-architecture) — `preferences`, `match_results`
- [Source: ARCHITECTURE › API architecture](../../ARCHITECTURE.md#api-architecture) — `GET /api/me/shortlist`, `PUT /api/me/preferences`
- [Source: ARCHITECTURE › Security architecture](../../ARCHITECTURE.md#security-architecture)
- [Source: CONTEXT D8, D14](../../CONTEXT.md)
- [Source: Epic EPIC-3](../epics/EPIC-3.md)

## Verification commands

> Lệnh chạy cụ thể (`pnpm …`) sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `apps/api/test/integration/shortlist.int-spec.ts` › `GĐ3 shortlist: eligible JDs with S_cv >= theta, sorted, with breakdown and evidence` |
| AC-2 | `apps/api/test/integration/shortlist.int-spec.ts` › `GĐ3 shortlist: ineligible JDs listed with reasons, not selectable` |
| AC-3 | `apps/api/test/integration/shortlist.int-spec.ts` › `shortlist IDOR: no other student data, non-STUDENT 403, foreign jd_id 422` |
| AC-4 | `apps/api/test/integration/shortlist.int-spec.ts` › `GĐ3 shortlist: scoring in progress vs empty shortlist` |
| AC-5 | `apps/api/test/integration/preferences.int-spec.ts` › `GĐ4 BR-04 replace preferences in one transaction with audit` |
| AC-6 | `apps/api/test/integration/preferences.int-spec.ts` › `BR-04 rejects over N_NV, outside shortlist, duplicates, gaps in rank` |
| AC-7 | `apps/api/test/integration/preferences.int-spec.ts` › `BR-04 DB constraints reject direct inserts` |
| AC-8 | `apps/api/test/integration/preferences.int-spec.ts` › `GĐ4 require_full_preferences enforced when enabled` |
| AC-9 | `apps/api/test/integration/preferences.int-spec.ts` › `GĐ4 preferences locked after deadline (server time)` |
| AC-10 | `apps/api/test/integration/preferences.int-spec.ts` › `GĐ4 Q6 auto-assign top S_cv when policy enabled, idempotent; none when NONE` |
| AC-11 | `packages/shared/states/application.spec.ts` › `application lifecycle allows exactly the 17 PRD transitions` |
| AC-12 | `apps/api/test/integration/preferences.int-spec.ts` › `transitionTo on preference: stale row_version 409, audit failure rolls back` |
| AC-13 | `apps/api/test/integration/preferences.int-spec.ts` › `concurrent preference replacements are serialized` |
| AC-14 | Kiểm tra thủ công ở 375 px theo `DESIGN.md`, ghi vào Implementation notes; `/code-review` phần `apps/web/src/features/student/` |
| AC-15 | Kiểm tra thủ công màn `/sv/preferences`; chuỗi thông điệp có trong `apps/web/src/features/student/preferences/` |

## Changelog entry

### Added
- `GET /api/me/shortlist`: shortlist của SV kèm S_cv, thành phần điểm, bằng chứng, kỹ năng còn thiếu và gợi ý cải thiện; JD không đủ điều kiện có lý do.
- `PUT /api/me/preferences`: chọn và sắp tối đa N_NV nguyện vọng từ shortlist; ràng buộc DB `unique(campaign_id, student_id, rank)` và `unique(student_id, jd_id)`; khóa khi hết hạn chọn NV.
- Bảng chuyển trạng thái hồ sơ ứng tuyển (13 trạng thái theo PRD) trong `packages/shared/states`.
- Tự gán NV cho SV không chọn đến hạn, theo tham số `no_preference_policy` (PRD Q6, chưa chốt).
- Màn Shortlist và Chọn nguyện vọng ở cổng Sinh viên, dùng tốt trên điện thoại.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-15, FR-16](../../PRD.md#functional-requirements)
- [Epic EPIC-3](../epics/EPIC-3.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D8](../../CONTEXT.md)
- [LESSONS](../../LESSONS.md)
