---
id: US-5.5
title: "Vòng bổ sung và đóng đợt"
epic: EPIC-5
status: backlog
priority: P0
points: 5
sprint:
version_shipped:
prd_ref:
  - FR-32
depends_on:
  - US-5.4
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

SV chưa có nơi thực tập sau vòng chính được thêm nguyện vọng và xét lại ở vòng bổ sung, với sức chứa đúng bằng phần còn trống của từng JD. Vòng bổ sung lặp đến khi hết SV, hết suất hoặc đạt R_max vòng. Cuối cùng Trung tâm đóng đợt: dữ liệu bị khóa, SV còn lại được chuyển sang xử lý thủ công. Story này khép luồng GĐ7–GĐ10, để đợt thực tập chạy trọn từ tạo đợt đến báo cáo (mốc M5 ở [sprints/README › Lộ trình](../README.md#lộ-trình)).

## Background

Story này hiện thực GĐ10 (UC-07) và phủ FR-32. Khi HR của vòng hiện tại đã phản hồi xong (hoặc hết SLA), Trung tâm mở vòng bổ sung nếu đồng thời còn SV trong hàng chờ và JD còn suất; vòng bổ sung có thể chạy song song với phỏng vấn của vòng trước. Trước vòng bổ sung, SV trong hàng chờ được thêm NV từ shortlist, chỉ với các JD còn suất và chưa từ chối mình; NV mới cần làm test trong một khung thời gian ngắn (VD: 2 ngày) nếu SV chưa có điểm test cho JD đó. Thuật toán chạy lại với SV trong hàng chờ, loại các cặp đã bị từ chối, với sức chứa:

`C_j(r) = max(0, ⌈(chỉ tiêu_j − đã nhận_j) × k⌉ − đang trong quy trình_j)`

trong đó "đang trong quy trình" là số hồ sơ ở *Mời phỏng vấn* / *Đạt* / *Dự bị*. Lặp đến khi hết SV, hết suất hoặc đạt R_max (mặc định 3). SV còn lại do Trung tâm xử lý thủ công. Đóng đợt thì khóa dữ liệu và xuất báo cáo (báo cáo thuộc [US-6.5](US-6.5-campaign-close-report-export.md)).

Quy tắc liên quan: BR-08 (tối đa 1 hồ sơ đang chạy), BR-09 (đề cử ≤ C_j(r)), BR-12 (không đề cử lại vào JD đã từ chối SV), BR-16 (SV từ chối hoặc quá hạn lời mời bị hạ ưu tiên, Q4). PRD › *Cơ chế hỗ trợ JD ít hồ sơ* (mục 3) yêu cầu gợi ý cho SV trong hàng chờ các JD còn suất mà SV có S_cv ≥ θ_cv. PRD › *Phạm vi MVP cho đồ án* yêu cầu tối thiểu 1 vòng bổ sung.

Story dùng lại gần như toàn bộ phần đã có: hàm `computeCapacity` của [US-5.1](US-5.1-allocation-engine-property-tests.md), luồng chạy / dự thảo / điều chỉnh / công bố của [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md), dữ liệu từ chối và yêu cầu bổ sung hồ sơ của [US-5.3](US-5.3-hr-nomination-review.md), dữ liệu đã nhận, đang trong quy trình, hạ ưu tiên của [US-5.4](US-5.4-interviews-reserve-and-offers.md), và màn chọn NV của [US-3.3](US-3.3-shortlist-and-preferences.md). Trạng thái đợt *Vòng bổ sung* và *Đã đóng* lấy theo GĐ0 (enum do [US-1.4](US-1.4-campaign-setup-and-config.md) định nghĩa).

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** vòng gần nhất đã `PUBLISHED`, mọi đề cử của vòng đó đã có quyết định của HR hoặc đã quá hạn SLA, hàng chờ không rỗng, có ít nhất một JD với C_j(r) > 0, và số vòng đã chạy < R_max, **When** cán bộ Trung tâm gọi `POST /api/campaigns/{id}/supplementary-rounds` (đề xuất) kèm hạn thêm NV, **Then** đợt chuyển sang *Vòng bổ sung* qua service của `campaign` (`transitionTo` + audit) nếu chưa ở trạng thái đó, cửa sổ thêm NV được mở **And** SV trong hàng chờ nhận thông báo (đề xuất, xem Dev notes). Thiếu bất kỳ điều kiện nào → `409` kèm mã lý do.
- [ ] **AC-2** — **Given** cửa sổ thêm NV đang mở và SV ở hàng chờ, **When** SV gửi danh sách NV qua `PUT /api/me/preferences` (route của US-3.3), **Then** hệ thống chỉ nhận JD thuộc shortlist của SV (đạt điều kiện cứng, S_cv ≥ θ_cv), có C_j(r) > 0, và chưa ở trạng thái kết thúc với SV này (HR từ chối, không đạt phỏng vấn, SV từ chối, đóng). JD không thỏa → `422`. NV cũ giữ nguyên thứ tự, NV mới xếp sau (đề xuất). SV không ở hàng chờ hoặc cửa sổ đã đóng → `409`. Màn chọn NV gợi ý các JD còn suất mà SV có S_cv ≥ θ_cv, sắp theo S_cv.
- [ ] **AC-3** — **Given** SV thêm NV vào JD mà chưa có S_test cho JD đó (kể cả qua ngân hàng dùng chung theo nhóm vị trí), **When** NV được lưu, **Then** SV được mở bài test với hạn làm bài ngắn (`campaigns.config.supplementary_test_window_days`, tên đề xuất; PRD lấy ví dụ 2 ngày) qua service của `assessment` **And** hết hạn mà chưa làm thì NV bị hủy (BR-06). NV đã có S_test thì không phải thi lại.
- [ ] **AC-4** — **When** Trung tâm chạy vòng r qua `POST /api/campaigns/{id}/allocation-rounds` sau khi cửa sổ thêm NV đóng, **Then** vòng mới có `round_no = r`; sức chứa từng JD = `computeCapacity(chỉ tiêu, đã nhận, INTERVIEW + PASSED + RESERVE, k)`; đầu vào chỉ gồm SV trong hàng chờ với các NV ở *Chờ vòng sau* hoặc mới thêm, đã lọc BR-07 như US-5.2; cặp ở trạng thái kết thúc bị loại (BR-12); SV có đề cử `DECLINED` / `EXPIRED` mang cờ `demoted` (chính sách `DEMOTE`) hoặc bị loại khỏi đầu vào (chính sách `EXCLUDE`). `input_snapshot` ghi r, các thành phần của C_j(r), cặp bị loại và lý do hạ ưu tiên. Dự thảo, điều chỉnh, công bố dùng đúng luồng của US-5.2.
- [ ] **AC-5** — BR-12 ở tầng DB (đề xuất): migration thêm `unique(campaign_id, student_id, jd_id)` trên `nominations`. **Given** SV đã bị HR của JD X từ chối, **When** chèn thẳng một đề cử (SV, X) mới qua Drizzle, **Then** DB báo unique violation **And** thao tác `add` trong điều chỉnh tay trả `409`.
- [ ] **AC-6** — **Given** đợt đã chạy đủ R_max vòng (mặc định 3), **When** Trung tâm mở vòng bổ sung hoặc chạy thêm vòng, **Then** API trả `409 R_MAX_REACHED`.
- [ ] **AC-7** — Property test nhiều vòng: dùng `arbAllocationInput` của US-5.1, mô phỏng chuỗi vòng với kết quả HR và phỏng vấn ngẫu nhiên. Sau mọi vòng: mỗi SV có tối đa 1 đề cử đang chạy (BR-08); số đề cử mới của mỗi JD ở vòng r ≤ C_j(r) (BR-09); không cặp nào ở trạng thái kết thúc được đề cử lại (BR-12); số SV đã nhận của JD ≤ chỉ tiêu.
- [ ] **AC-8** — **Given** đợt không còn đề cử nào thuộc tập BR-08 và không còn lời mời đang chờ, **When** Trung tâm gọi `POST /api/campaigns/{id}/close` (đề xuất), **Then** đợt chuyển *Đã đóng* qua `transitionTo` + audit; mọi NV còn mở chuyển *Đóng*; SV chưa nhận thực tập được liệt kê là *Chưa được phân bổ* để Trung tâm xử lý thủ công **And** sau đó mọi thao tác ghi trên dữ liệu của đợt trả `409` (chặn theo pha của US-1.4). Còn đề cử đang chạy hoặc lời mời đang chờ → `409` kèm danh sách (đề xuất, xem Dev notes).
- [ ] **AC-9** — Phân quyền: mở vòng bổ sung, chạy vòng, đóng đợt chỉ dành cho `CENTER` (`HR`, `STUDENT` → `403`). SV chỉ thêm NV cho chính mình; không có tham số nào cho phép sửa NV của SV khác (test IDOR).
- [ ] **AC-10** — Giao diện: màn *Phân bổ* của Trung tâm (US-5.2) thêm thẻ *Vòng bổ sung* (số SV trong hàng chờ, JD có C_j(r) > 0 kèm đánh dấu JD có yêu cầu bổ sung hồ sơ, số vòng còn lại) và nút *Đóng đợt* có hộp thoại xác nhận liệt kê SV chưa được phân bổ. Màn chọn NV của US-3.3 có chế độ vòng bổ sung, dùng tốt trên điện thoại (NFR-13). Chuỗi giao diện tiếng Việt.

## Tasks

- [ ] **TASK-5.5.1** — Mở vòng bổ sung (AC: 1, 6)
  - [ ] Subtask 5.5.1.1 — `apps/api/src/modules/allocation/application/supplementary-round.service.ts`: `open(campaignId, input, actor)` kiểm tra điều kiện (trạng thái vòng trước, SLA qua `review`, hàng chờ, C_j(r), R_max); chuyển trạng thái đợt qua service của `campaign`; phát sự kiện cho `notification`.
  - [ ] Subtask 5.5.1.2 — `allocation/domain/waiting-queue.ts`: hàm thuần xác định hàng chờ và cờ hạ ưu tiên từ danh sách đề cử của đợt và chính sách Q4.
- [ ] **TASK-5.5.2** — Thêm NV và bài test cho NV mới (AC: 2, 3)
  - [ ] Subtask 5.5.2.1 — Mở rộng service NV của `matching` (US-3.3) với chế độ vòng bổ sung: lọc JD theo AC-2, nhận C_j(r) từ `allocation`.
  - [ ] Subtask 5.5.2.2 — Gọi service của `assessment` để mở bài test với hạn ngắn và hủy NV quá hạn (BR-06).
- [ ] **TASK-5.5.3** — Chạy vòng r (AC: 4, 5)
  - [ ] Subtask 5.5.3.1 — Mở rộng `AllocationRoundService.run` của US-5.2: `round_no` tăng dần; sức chứa bằng `computeCapacity` với số liệu lấy qua `NominationService`; áp hàng chờ, loại cặp kết thúc, áp cờ `demoted` hoặc loại theo chính sách.
  - [ ] Subtask 5.5.3.2 — Migration trong `apps/api/drizzle/`: `unique(campaign_id, student_id, jd_id)` trên `nominations` (đề xuất cho BR-12).
- [ ] **TASK-5.5.4** — Đóng đợt (AC: 8)
  - [ ] Subtask 5.5.4.1 — `allocation/application/campaign-close.service.ts`: kiểm tra điều kiện; chuyển trạng thái đợt qua `campaign`; đóng NV còn mở qua `matching`; trả danh sách SV chưa được phân bổ (dùng lại ở US-6.5).
- [ ] **TASK-5.5.5** — API và phân quyền (AC: 9)
  - [ ] Subtask 5.5.5.1 — Route `POST /api/campaigns/{id}/supplementary-rounds`, `POST /api/campaigns/{id}/close` (đề xuất) với `@Roles('CENTER')`; Zod schema trong `packages/shared/schemas/allocation.ts`.
- [ ] **TASK-5.5.6** — Giao diện (AC: 10)
  - [ ] Subtask 5.5.6.1 — Đọc `DESIGN.md` trước khi code; ghi `Design applied: …` vào story.
  - [ ] Subtask 5.5.6.2 — `apps/web/src/features/center/allocation/`: thẻ vòng bổ sung, nút đóng đợt; `apps/web/src/features/student/`: chế độ vòng bổ sung của màn chọn NV (dùng lại component của US-3.3).
- [ ] **TASK-5.5.7** — Kiểm thử (AC: 1–9)
  - [ ] Subtask 5.5.7.1 — `apps/api/src/modules/allocation/domain/__tests__/multi-round.property.spec.ts` (fast-check, dùng lại `arbAllocationInput`).
  - [ ] Subtask 5.5.7.2 — `apps/api/test/allocation/supplementary-round.e2e-spec.ts`, `campaign-close.e2e-spec.ts` (testcontainers; `FakeClock` của US-1.4 cho cửa sổ thêm NV và hạn test).

## Dev notes

### Architecture constraints

- AD-7 (qua US-5.1, US-5.2): vòng bổ sung dùng đúng engine, `checkStability` và snapshot như vòng chính; không có thuật toán riêng cho vòng bổ sung. Không dùng LLM (ARCH › *Những chỗ cố ý KHÔNG dùng LLM*).
- AD-8: chuyển trạng thái đợt và NV qua `transitionTo` của module sở hữu, audit trong cùng giao dịch, `409` khi lệch `row_version`.
- AGENTS › Nguyên tắc 11: BR-12 nên có ràng buộc DB. ARCH chưa có ràng buộc này; story đề xuất `unique(campaign_id, student_id, jd_id)` trên `nominations`. Ràng buộc đúng vì mọi trạng thái kết thúc của một cặp đều không cho đề cử lại cặp đó, còn chạy lại dự thảo thì xóa dòng cũ trước. Hỏi trước khi chốt.
- AGENTS › Nguyên tắc 13: `allocation` đọc đề cử qua `NominationService` của `review`, đọc NV qua `matching`, mở bài test qua `assessment`, đổi trạng thái đợt qua `campaign`.
- **"Đang trong quy trình" và đề cử chưa được HR duyệt.** GĐ10 chỉ tính *Mời phỏng vấn* / *Đạt* / *Dự bị*, không tính *Được đề cử* (`NOMINATED`), trong khi BR-08 coi `NOMINATED` là đang chạy. Vòng bổ sung được mở cả khi hết SLA, nên có thể còn đề cử `NOMINATED` chưa được duyệt; nếu không tính chúng, JD có thể nhận quá số hồ sơ HR xử lý được. Story giữ đúng công thức của PRD; cách xử lý đề cử treo cần chốt.
- **Ưu tiên JD có yêu cầu bổ sung hồ sơ.** GĐ8 nói JD đó "được ưu tiên trong vòng bổ sung kế tiếp" nhưng không định nghĩa; Deferred Acceptance không có khái niệm ưu tiên JD. Story tạm chỉ đánh dấu JD này trong gợi ý cho SV và trên màn của Trung tâm (đề xuất). Hỏi trước khi chốt.
- **Giới hạn số NV ở vòng bổ sung.** PRD không nói SV được thêm bao nhiêu NV. Story tạm giới hạn số NV chưa kết thúc của một SV ≤ N_NV (đề xuất). Hỏi trước khi chốt.
- **"JD còn suất".** Story tạm hiểu là C_j(r) > 0 tại lúc mở cửa sổ thêm NV (đề xuất).
- **Thông báo mở vòng bổ sung.** PRD › Thông báo chưa có dòng cho sự kiện này, nhưng SV phải biết để thêm NV. Story đề xuất gửi thông báo cho SV trong hàng chờ.
- **Đóng đợt khi còn hồ sơ đang chạy.** PRD không nói. Story tạm chặn đóng đợt cho đến khi Trung tâm xử lý hết (đề xuất). Hỏi trước khi chốt.
- Chạm Q3 (hệ số đề cử k): tạm dùng Đề xuất k = 1,5, đưa thành tham số `campaigns.config.k`; hỏi trước khi chốt.
- Chạm Q4 (SV từ chối lời mời): tạm dùng Đề xuất "xếp ưu tiên thấp nhất ở vòng sau", đưa thành tham số `campaigns.config.offer_decline_policy` (`DEMOTE` mặc định, `EXCLUDE`; tên đề xuất); hỏi trước khi chốt. Story tạm áp cờ hạ ưu tiên cho mọi vòng còn lại của đợt.
- R_max (mặc định 3) đọc từ `campaigns.config.r_max`. Tên khóa `campaigns.config` theo schema của US-1.4.

### Cross-story dependencies

- Builds on [US-5.4](US-5.4-interviews-reserve-and-offers.md) — số đã nhận, đang trong quy trình theo JD; đề cử `DECLINED` / `EXPIRED` cho BR-16; định nghĩa hàng chờ suy ra từ đề cử.
- Builds on [US-5.3](US-5.3-hr-nomination-review.md) — cặp `HR_REJECTED`, `supplement_requests`, trạng thái SLA của vòng trước.
- Builds on [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md) — `AllocationRoundService.run`, snapshot, dự thảo, điều chỉnh, công bố, màn *Phân bổ*.
- Builds on [US-5.1](US-5.1-allocation-engine-property-tests.md) — `computeCapacity`, `arbAllocationInput`.
- Builds on [US-3.3](US-3.3-shortlist-and-preferences.md) — `PUT /api/me/preferences`, component chọn NV, bảng chuyển trạng thái hồ sơ ứng tuyển.
- Builds on [US-4.3](US-4.3-exam-room.md) — mở phiên thi cho NV mới. `Clock`/`FakeClock` cho test cửa sổ thêm NV và hạn test lấy từ [US-1.4](US-1.4-campaign-setup-and-config.md).
- Builds on [US-1.4](US-1.4-campaign-setup-and-config.md) — trạng thái đợt *Vòng bổ sung*, *Đã đóng*, chặn thao tác sai pha, `campaigns.config`.
- Builds on [US-1.7](US-1.7-notifications-sse-email-reminders.md) — thông báo cho SV trong hàng chờ.
- Required by [US-6.5](US-6.5-campaign-close-report-export.md) — đợt ở *Đã đóng*, danh sách SV chưa được phân bổ.
- Required by [US-6.6](US-6.6-demo-data-e2e-load-test.md) — E2E luồng đầy đủ có vòng bổ sung.
- Sibling [US-5.4](US-5.4-interviews-reserve-and-offers.md) — cùng tuần T12, làn A; bắt đầu sau khi US-5.4 merge.

### Performance budget

- Tối đa R_max vòng (mặc định 3) mỗi đợt (PRD GĐ10).
- Mỗi lần chạy vòng bổ sung < 1 phút (NFR-8), cùng phép đo với US-5.2; vòng bổ sung có ít SV hơn vòng chính nên không đặt budget riêng.

### What we explicitly did NOT do

- Không tự động mở vòng bổ sung hay tự đóng đợt; Trung tâm luôn bấm (PRD › Nguyên tắc cốt lõi 1).
- Không quản lý việc xử lý thủ công SV còn lại (giới thiệu trực tiếp, chuyển đợt sau). Story chỉ liệt kê họ.
- Không xuất báo cáo khi đóng đợt; thuộc US-6.5.
- Không xóa file CV và PII khi đóng đợt; việc đó chạy theo thời hạn lưu trữ do Trung tâm cấu hình (ARCH › *Lưu trữ file và thời hạn dữ liệu*).

### References

- [Source: PRD › GĐ10 – Vòng bổ sung và đóng đợt](../../PRD.md)
- [Source: PRD › Thuật toán phân bổ › Cơ chế hỗ trợ JD ít hồ sơ](../../PRD.md)
- [Source: PRD › Vòng đời trạng thái (Hồ sơ ứng tuyển, Sinh viên trong đợt); GĐ0 (trạng thái đợt, R_max)](../../PRD.md)
- [Source: PRD › Quy tắc nghiệp vụ (BR-06, BR-08, BR-09, BR-12, BR-16)](../../PRD.md)
- [Source: PRD › Các điểm cần chốt (Q3, Q4); Phạm vi MVP cho đồ án](../../PRD.md)
- [Source: PRD FR-32](../../PRD.md#functional-requirements)
- [Source: ARCHITECTURE › Các module; Quản lý trạng thái; Allocation Engine](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › API architecture](../../ARCHITECTURE.md#api-architecture)
- [Source: CONTEXT D7, D8](../../CONTEXT.md)
- [Source: EPIC-5](../epics/EPIC-5.md)
- [LESSONS](../../LESSONS.md) — đọc lại khi bắt đầu story và ghi `Lessons applied:`.

## Verification commands

> Chưa có `package.json`. Lệnh chạy cụ thể điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case; đường dẫn test là đề xuất, theo quy ước test của US-1.1.

| AC | Command |
|---|---|
| AC-1 | `apps/api/test/allocation/supplementary-round.e2e-spec.ts` › `GĐ10 open supplementary round only when queue, capacity, SLA and R_max allow` |
| AC-2 | `supplementary-round.e2e-spec.ts` › `GĐ10 waiting student adds preferences only for open JDs that did not reject them` |
| AC-3 | `supplementary-round.e2e-spec.ts` › `BR-06 new preference without S_test gets short test window; untaken test cancels it` |
| AC-4 | `supplementary-round.e2e-spec.ts` › `GĐ10 round r uses C_j(r), waiting students only, BR-16 demotion per policy` |
| AC-5 | `supplementary-round.e2e-spec.ts` › `BR-12 unique index blocks re-nominating a rejected pair` |
| AC-6 | `supplementary-round.e2e-spec.ts` › `GĐ10 R_max reached → 409` |
| AC-7 | `apps/api/src/modules/allocation/domain/__tests__/multi-round.property.spec.ts` › `GĐ10 property: BR-08, BR-09, BR-12 and quota hold across rounds` |
| AC-8 | `apps/api/test/allocation/campaign-close.e2e-spec.ts` › `GĐ10 close locks campaign and lists unplaced students`, `GĐ10 close blocked while nominations are active` |
| AC-9 | `supplementary-round.e2e-spec.ts` › `RBAC: only CENTER opens rounds and closes campaign`, `IDOR: student edits only own preferences` |
| AC-10 | Review giao diện theo `DESIGN.md` và quy tắc skill shadcn; ảnh chụp màn hình Trung tâm (desktop) và SV (điện thoại) đính kèm PR |

## Changelog entry

### Added
- Vòng bổ sung: SV trong hàng chờ thêm NV từ shortlist (chỉ JD còn suất và chưa từ chối mình), làm test cho NV mới trong khung ngắn; chạy lại phân bổ với sức chứa C_j(r), loại cặp đã kết thúc, hạ ưu tiên SV từ chối lời mời; tối đa R_max vòng.
- Đóng đợt: khóa dữ liệu, đóng NV còn mở, liệt kê SV chưa được phân bổ để Trung tâm xử lý thủ công.
- Ràng buộc DB chống đề cử lại cặp đã kết thúc (BR-12).

### Changed
- Màn *Phân bổ* của Trung tâm có thẻ vòng bổ sung và nút đóng đợt; màn chọn NV của SV có chế độ vòng bổ sung.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-32](../../PRD.md#functional-requirements)
- [Epic EPIC-5](../epics/EPIC-5.md)
- [CONTEXT D7, D8](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
- [US-5.1](US-5.1-allocation-engine-property-tests.md) · [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md) · [US-5.4](US-5.4-interviews-reserve-and-offers.md) · [US-6.5](US-6.5-campaign-close-report-export.md)
