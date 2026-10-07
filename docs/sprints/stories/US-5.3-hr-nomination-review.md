---
id: US-5.3
title: "HR duyệt danh sách đề cử"
epic: EPIC-5
status: backlog
priority: P0
points: 8
sprint:
version_shipped:
prd_ref:
  - FR-28
  - FR-29
arch_ref:
  - AD-8
depends_on:
  - US-5.2
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

HR của từng doanh nghiệp xem danh sách SV được đề cử vào JD của mình, sắp theo S_final, và mở hồ sơ chi tiết có đủ bằng chứng để quyết định: mời phỏng vấn, từ chối có lý do, hoặc yêu cầu bổ sung hồ sơ khi thiếu người. HR không thấy ai ngoài danh sách đề cử, và mọi quyết định do HR nhập. Hệ thống nhắc hạn để vòng phân bổ không bị treo. Sau story này, [US-5.4](US-5.4-interviews-reserve-and-offers.md) có các đề cử ở trạng thái *Mời phỏng vấn* để lên lịch, và [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) biết cặp nào đã bị từ chối và JD nào cần bổ sung hồ sơ.

## Background

Story này hiện thực GĐ8 (UC-23, UC-24) và phủ FR-28 (danh sách đề cử và hồ sơ chi tiết) cùng FR-29 (mời phỏng vấn, từ chối có lý do, yêu cầu bổ sung hồ sơ, SLA và nhắc hạn). Hồ sơ chi tiết gồm CV gốc, hồ sơ năng lực, S_cv kèm giải thích và bằng chứng, S_test và bản đồ năng lực, chỉ số tin cậy CV (nếu có), cảnh báo trong lúc làm test (nếu có). Khi từ chối, HR bắt buộc chọn lý do từ danh mục (thiếu kỹ năng, kết quả test chưa đạt kỳ vọng, đã đủ người, khác…) kèm ghi chú. SV bị từ chối thì NV đó đóng lại và SV về hàng chờ với các NV còn lại.

Các quy tắc liên quan: BR-11 (HR chỉ xem hồ sơ SV được đề cử vào JD của doanh nghiệp mình), BR-12 (từ chối phải có lý do; SV bị một JD từ chối không được đề cử lại vào JD đó trong đợt), BR-13 (AI không ra quyết định cuối). PRD › Personas nhắc lại: HR **chỉ** thấy hồ sơ của SV được đề cử vào JD của doanh nghiệp mình. Q5 (HR có được chủ động chọn SV ngoài danh sách đề cử?) chưa chốt; Đề xuất là không, chỉ có "yêu cầu bổ sung hồ sơ".

Về kỹ thuật, chuyển trạng thái đề cử đi qua `transitionTo` với `row_version` (AD-8, [CONTEXT D8](../../CONTEXT.md)). ARCH › *Màn hình theo cổng* mô tả màn HR: bảng sắp theo S_final, ngăn chi tiết có biểu đồ radar năng lực, danh sách bằng chứng, xem CV. ARCH › *Tác vụ định kỳ* đặt việc "nhắc HR trước hạn SLA" vào cron dùng `@nestjs/schedule` + `pg_try_advisory_lock`. ARCH › *Bản đồ sử dụng LLM theo giai đoạn* có tác vụ GĐ8 "Tóm tắt hồ sơ cho HR" (effort `low`, job nền, HR đọc tham khảo), và EPIC-5 giao phần này cho story này với điều kiện chỉ để tham khảo. Lý do từ chối được lưu để đánh giá và hiệu chỉnh mô hình (PRD › *Vòng phản hồi*).

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** một vòng đã `PUBLISHED` có đề cử vào JD X của công ty C, **When** HR của C gọi `GET /api/jds/{id}/nominations`, **Then** HR nhận các đề cử của X ở mọi vòng đã công bố, sắp theo S_final giảm dần, bằng điểm thì theo cùng quy tắc phá hòa của US-5.1 (rank key lấy từ snapshot của vòng). Mỗi dòng có S_cv, S_test, S_final, trạng thái đề cử, hạn phản hồi. Không có đề cử nào của vòng `DRAFT`.
- [ ] **AC-2** — **When** HR mở một đề cử qua `GET /api/nominations/{id}` (đề xuất), **Then** response gồm: đường dẫn CV gốc (URL tạm hết hạn sau 5 phút, qua cơ chế của US-1.6), hồ sơ năng lực, S_cv cùng điểm và bằng chứng từng tiêu chí, S_test cùng bản đồ năng lực (`skill_scores`), chỉ số tin cậy CV nếu có (US-4.8), cảnh báo gian lận nếu có (US-4.7) kèm nhãn "chỉ để cảnh báo". Response không bao giờ chứa `answer_key` hay rubric.
- [ ] **AC-3** — BR-11, test IDOR: **Given** HR của công ty B, **When** HR đó gọi danh sách, chi tiết, quyết định cho đề cử thuộc JD của công ty A, hoặc xin URL file CV của SV không được đề cử vào JD công ty B, **Then** API trả `404` và không lộ dữ liệu. `STUDENT` gọi các route của HR nhận `403`. HR không đọc được đề cử của vòng `DRAFT`.
- [ ] **AC-4** — Q5: không có route nào cho `HR` liệt kê, tìm kiếm hay mở hồ sơ SV ngoài đề cử. Test duyệt mọi route có `@Roles('HR')` và so với danh sách cho phép.
- [ ] **AC-5** — **Given** đề cử ở `NOMINATED`, **When** HR gửi `POST /api/nominations/{id}/decision` với `decision = INVITE`, **Then** trong một giao dịch: đề cử chuyển `NOMINATED → INTERVIEW` qua `transitionTo`, NV của cặp chuyển sang *Mời phỏng vấn* (qua service export của `matching`), một dòng `hr_reviews` được ghi (`reviewer_id`, `decision`, `decided_at`), audit được ghi **And** SV thấy trạng thái *Mời phỏng vấn* ở màn *Đề cử*.
- [ ] **AC-6** — **Given** đề cử ở `NOMINATED`, **When** HR gửi `decision = REJECT` kèm `reason_code` thuộc danh mục và `note`, **Then** đề cử chuyển `NOMINATED → HR_REJECTED`, NV của cặp chuyển sang *HR từ chối*, `hr_reviews` lưu `reason_code` và `note`, SV về hàng chờ với các NV còn lại ở *Chờ vòng sau* **And** SV thấy lý do ở dạng tổng quát (nhãn danh mục, không có ghi chú của HR). Thiếu `reason_code`, `reason_code` ngoài danh mục, hoặc thiếu `note` → `400`.
- [ ] **AC-7** — Quyết định lần hai cho cùng đề cử, hoặc quyết định khi đề cử không ở `NOMINATED`, trả `409` (bảng chuyển trạng thái và `unique(nomination_id)` của `hr_reviews`). Hai HR cùng công ty quyết định cùng lúc trên một đề cử: đúng một quyết định được ghi, người kia nhận `409` (lệch `row_version`).
- [ ] **AC-8** — BR-13: không có đường code nào tự ra quyết định mời hay từ chối; route quyết định chỉ nhận actor vai trò `HR`. Hết SLA không tự từ chối. Tóm tắt do AI (nếu có) không ảnh hưởng thứ tự sắp hay quyết định: danh sách giữ nguyên thứ tự khi có hoặc không có tóm tắt.
- [ ] **AC-9** — **Given** số đề cử của JD đã được mời phỏng vấn (`INTERVIEW`, `PASSED`, `RESERVE`, `ACCEPTED`) nhỏ hơn chỉ tiêu, **When** HR gửi `POST /api/jds/{id}/supplement-requests` (đề xuất) kèm ghi chú, **Then** yêu cầu được lưu, ghi audit và báo cho Trung tâm; US-5.5 đọc được yêu cầu này. Khi số người được mời đã ≥ chỉ tiêu → `409`.
- [ ] **AC-10** — SLA: hạn phản hồi = `published_at` + SLA_HR ngày làm việc (mặc định 5; thứ Hai đến thứ Sáu). **Given** đồng hồ giả lập, **When** còn 2 ngày làm việc đến hạn mà đề cử vẫn ở `NOMINATED`, **Then** HR nhận đúng một lời nhắc; **When** quá hạn, **Then** HR và Trung tâm nhận đúng một thông báo quá SLA. Hai instance chạy cron cùng lúc vẫn chỉ gửi một lần (`pg_try_advisory_lock`). Trung tâm gia hạn cho một JD qua `POST /api/jds/{id}/review-deadline-extensions` (đề xuất), bắt buộc có lý do và ghi audit; hạn mới được dùng cho lời nhắc kế tiếp.
- [ ] **AC-11** — Tóm tắt hồ sơ bằng LLM (chỉ làm khi đã chốt, xem Dev notes): nếu đề cử có tóm tắt, màn chi tiết hiển thị nó với nhãn "Tóm tắt do AI — chỉ để tham khảo". Dữ liệu gửi cho LLM chỉ gồm `profile_masked` và điểm (BR-03, NFR-3), không có tên, liên hệ hay CV gốc. Mỗi tóm tắt lưu kèm `model` và `prompt_version`. Không có tóm tắt thì màn chi tiết vẫn đủ thông tin của AC-2.
- [ ] **AC-12** — Giao diện cổng HR: bảng đề cử bằng TanStack Table (sắp theo S_final, cột trạng thái và hạn phản hồi); ngăn chi tiết có biểu đồ radar năng lực (shadcn Chart), danh sách bằng chứng, xem CV (react-pdf); hộp thoại từ chối bắt buộc chọn lý do và nhập ghi chú; nút yêu cầu bổ sung hồ sơ chỉ bật khi đủ điều kiện; trạng thái đang tải / trống / lỗi. Chuỗi giao diện tiếng Việt.

## Tasks

- [ ] **TASK-5.3.1** — Lược đồ và danh mục (AC: 5, 6, 7, 9, 10)
  - [ ] Subtask 5.3.1.1 — Drizzle schema `hr_reviews` theo ARCH (`nomination_id`, `reviewer_id`, `decision`, `reason_code`, `note`, `decided_at`; `unique(nomination_id)`).
  - [ ] Subtask 5.3.1.2 — `packages/shared/schemas/review.ts`: enum `decision` (`INVITE`, `REJECT`) và danh mục `reason_code` (`MISSING_SKILLS`, `TEST_BELOW_EXPECTATION`, `POSITION_FILLED`, `OTHER`), kèm nhãn tiếng Việt; tên giá trị là đề xuất.
  - [ ] Subtask 5.3.1.3 — Lưu hạn phản hồi (đề xuất: cột `nominations.review_due_at`) và bảng `supplement_requests` (đề xuất: `id`, `campaign_id`, `jd_id`, `round_id`, `requested_by`, `note`, `created_at`); migration trong `apps/api/drizzle/`.
- [ ] **TASK-5.3.2** — Đọc danh sách và hồ sơ chi tiết (AC: 1, 2, 3, 4)
  - [ ] Subtask 5.3.2.1 — `apps/api/src/modules/review/application/nomination-query.service.ts`: lọc theo `company_id` của HR và vòng `PUBLISHED`; gom dữ liệu qua service export của `student` (file CV, hồ sơ năng lực), `matching` (tiêu chí, bằng chứng), `assessment` (S_test, `skill_scores`, cảnh báo, chỉ số tin cậy), `allocation` (rank key để phá hòa).
  - [ ] Subtask 5.3.2.2 — `review/api/nomination.controller.ts`: `GET /api/jds/{id}/nominations`, `GET /api/nominations/{id}`; `@Roles('HR')`; kiểm tra quyền sở hữu trong service.
- [ ] **TASK-5.3.3** — Quyết định mời / từ chối (AC: 5, 6, 7, 8)
  - [ ] Subtask 5.3.3.1 — `review/application/hr-decision.service.ts`: `decide(nominationId, input, actor)` qua `transitionTo`; ghi `hr_reviews`; cập nhật trạng thái NV qua `matching`; audit trong cùng giao dịch.
  - [ ] Subtask 5.3.3.2 — `POST /api/nominations/{id}/decision`; Zod schema bắt buộc `reason_code` + `note` khi `REJECT`.
  - [ ] Subtask 5.3.3.3 — Hiển thị lý do tổng quát cho SV ở màn *Đề cử* của US-5.2.
- [ ] **TASK-5.3.4** — Yêu cầu bổ sung hồ sơ (AC: 9)
  - [ ] Subtask 5.3.4.1 — `review/application/supplement-request.service.ts` và route `POST /api/jds/{id}/supplement-requests`; export hàm đọc yêu cầu cho US-5.5.
- [ ] **TASK-5.3.5** — SLA và nhắc hạn (AC: 10)
  - [ ] Subtask 5.3.5.1 — `review/domain/working-days.ts`: `addWorkingDays()`, `workingDaysBetween()` (hàm thuần).
  - [ ] Subtask 5.3.5.2 — `review/application/review-sla.scheduler.ts`: cron `@nestjs/schedule` + `pg_try_advisory_lock`; đồng hồ injectable của US-4.3; gửi qua service thông báo của US-1.7; đánh dấu đã nhắc để không gửi lặp.
  - [ ] Subtask 5.3.5.3 — Route gia hạn cho Trung tâm (`@Roles('CENTER')`), bắt buộc lý do, ghi audit.
- [ ] **TASK-5.3.6** — Tóm tắt hồ sơ bằng LLM (AC: 11) — **chỉ làm khi đã chốt** (xem Dev notes)
  - [ ] Subtask 5.3.6.1 — Dùng skill `claude-api` trước khi viết code gọi LLM. Agent `ai-service/app/agents/profile_summarizer/`, prompt `ai-service/app/prompts/profile_summarizer/v1.md`, effort `low`, gọi qua `LLMClient` của US-2.2, structured output, kiểm tra `stop_reason == "refusal"`.
  - [ ] Subtask 5.3.6.2 — Hợp đồng message trong `packages/shared/contracts` (Zod → JSON Schema → Pydantic); payload chỉ chứa ID; test bằng fixture, không gọi API thật.
- [ ] **TASK-5.3.7** — Giao diện cổng HR (AC: 12)
  - [ ] Subtask 5.3.7.1 — Đọc `DESIGN.md` trước khi code; ghi `Design applied: …` vào story.
  - [ ] Subtask 5.3.7.2 — `apps/web/src/features/hr/nominations/`: bảng, ngăn chi tiết, hộp thoại từ chối, nút yêu cầu bổ sung hồ sơ.
- [ ] **TASK-5.3.8** — Kiểm thử (AC: 1–11)
  - [ ] Subtask 5.3.8.1 — `apps/api/test/review/nomination-review.e2e-spec.ts`: danh sách, chi tiết, mời, từ chối, `409`, bổ sung hồ sơ.
  - [ ] Subtask 5.3.8.2 — `apps/api/test/review/review-idor.e2e-spec.ts`: IDOR và danh sách route cho phép của HR.
  - [ ] Subtask 5.3.8.3 — `apps/api/test/review/review-sla.e2e-spec.ts`: nhắc hạn, quá hạn, gia hạn với đồng hồ giả lập; hai instance cron.

## Dev notes

### Architecture constraints

- [AD-8](../../ARCHITECTURE.md#architecture-decisions): `NOMINATED → INTERVIEW` và `NOMINATED → HR_REJECTED` đi qua `transitionTo` theo bảng `packages/shared/states/nomination.ts` (US-5.2), audit trong cùng giao dịch, `409` khi lệch `row_version`.
- AGENTS › Nguyên tắc 7 và BR-11: kiểm tra cấp bản ghi đặt trong service (ARCH › *Thư viện chính*: guard `@Roles()` chỉ kiểm vai trò). Lỗi quyền sở hữu trả `404` để không lộ sự tồn tại của bản ghi.
- AGENTS › Nguyên tắc 1, 2 và BR-13: LLM không quyết định, không sắp thứ tự, không tính điểm. SLA và nhắc hạn không dùng LLM (ARCH › *Những chỗ cố ý KHÔNG dùng LLM*).
- AGENTS › Nguyên tắc 13: `review` không truy vấn bảng `cvs`, `match_results`, `exam_sessions`, `preferences`; chỉ gọi service đã export.
- Module `review` sở hữu `nominations` theo đề xuất ở US-5.2 (ARCH › *Các module*: `review` — "Đề cử, HR duyệt, yêu cầu bổ sung, SLA").
- **Hồ sơ HR được xem.** SV đã đồng ý chia sẻ CV cho doanh nghiệp được đề cử (GĐ2), nên HR xem CV gốc. Hồ sơ năng lực hiển thị từ `cvs.profile`, không hiển thị riêng trường `pii` (đề xuất). BR-03 chỉ ràng buộc bước chấm điểm; việc có che thông tin nhạy cảm khi HR ra quyết định hay không chưa được PRD nói rõ, hỏi trước khi chốt.
- **Tóm tắt hồ sơ bằng LLM (cần chốt).** ARCH có tác vụ này trong *Bản đồ sử dụng LLM* và *Ước tính chi phí*, nhưng chưa có queue trong ARCH › *Hàng đợi*, chưa có thư mục agent trong ARCH › *Project structure*, và chưa có cột lưu kết quả. Tên đề xuất: queue `ai.profile.summarize`, agent `profile_summarizer`, cột `nominations.ai_summary` (JSONB gồm `text`, `model`, `prompt_version`). Phần sinh tóm tắt là việc của AI Service (làn B). Hỏi trước khi làm TASK-5.3.6; nếu không chốt kịp T11 thì tách ra story riêng.
- **SLA tính theo ngày làm việc.** PRD ghi "5 ngày làm việc" nhưng không nói ngày lễ. Story tạm tính thứ Hai đến thứ Sáu, không có lịch nghỉ lễ. Lời nhắc "trước hạn 2 ngày" tạm tính theo ngày làm việc cho thống nhất. Hỏi trước khi chốt. Cột `review_due_at` và route gia hạn là đề xuất vì ARCH chưa có chỗ lưu hạn hay gia hạn.
- **Yêu cầu bổ sung hồ sơ.** PRD nói JD "được ưu tiên trong vòng bổ sung kế tiếp" nhưng không định nghĩa ưu tiên nghĩa là gì; Deferred Acceptance không có khái niệm ưu tiên JD. Story này chỉ lưu yêu cầu; cách dùng ở US-5.5 cần chốt.
- Chạm Q5 (HR chủ động chọn SV ngoài danh sách đề cử): tạm dùng Đề xuất — không cho phép, chỉ có "yêu cầu bổ sung hồ sơ". Không đưa thành tham số `campaigns.config` vì phương án còn lại cần thêm chức năng mới; hỏi trước khi chốt.

### Cross-story dependencies

- Builds on [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md) — đề cử đã công bố, `NominationService`, enum `nomination`, rank key trong snapshot, màn *Đề cử* của SV.
- Builds on [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md) — `@Roles()`, `company_id` của HR, helper đăng nhập theo vai trò cho test IDOR.
- Builds on [US-1.6](US-1.6-data-consent-and-cv-upload.md) — URL tạm của file CV (`GET /api/files/{id}/url`).
- Builds on [US-3.2](US-3.2-batch-matching-agent.md) — điểm và bằng chứng từng tiêu chí trong `match_results.criteria`.
- Builds on [US-4.4](US-4.4-grading-stest-sfinal.md) — S_test, `skill_scores` cho biểu đồ radar.
- Builds on [US-4.7](US-4.7-cheating-signals.md), [US-4.8](US-4.8-cv-verification-questions-trust-score.md) — cờ cảnh báo và chỉ số tin cậy CV (hiển thị nếu có).
- Builds on [US-1.7](US-1.7-notifications-sse-email-reminders.md) — gửi lời nhắc và thông báo quá SLA.
- Builds on [US-4.3](US-4.3-exam-room.md) — đồng hồ injectable và helper cho test SLA.
- Builds on [US-2.1](US-2.1-ai-job-pipeline-message-contracts.md), [US-2.2](US-2.2-llm-client-versioned-prompts.md) — chỉ khi làm TASK-5.3.6.
- Required by [US-5.4](US-5.4-interviews-reserve-and-offers.md) — đề cử ở `INTERVIEW`, `hr_reviews`.
- Required by [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) — cặp `HR_REJECTED` (BR-12), `supplement_requests`, trạng thái SLA để biết vòng hiện tại đã phản hồi xong hay hết hạn.
- Required by [US-6.5](US-6.5-campaign-close-report-export.md) — lý do từ chối cho báo cáo.
- Sibling [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md) — cùng tuần T11, cùng chạm module `review`; bắt đầu sau khi US-5.2 merge.

### Performance budget

- SLA_HR mặc định 5 ngày làm việc tính từ lúc công bố; nhắc HR trước hạn 2 ngày; quá hạn báo Trung tâm (PRD GĐ8). Kiểm chứng bằng `review-sla.e2e-spec.ts` với đồng hồ giả lập.
- Danh sách đề cử của một JD có vài chục dòng; không đặt budget riêng cho truy vấn.

### What we explicitly did NOT do

- Không cho HR chọn SV ngoài danh sách đề cử (Q5). Trigger: Q5 được chốt khác Đề xuất.
- Không tự từ chối hay tự mời khi hết SLA. PRD chỉ yêu cầu báo Trung tâm để liên hệ hoặc gia hạn.
- Không tích hợp lịch hay email doanh nghiệp (PRD › Phạm vi MVP: Mở rộng).
- Không có lịch nghỉ lễ cho SLA. Trigger: Trung tâm yêu cầu tính ngày lễ.
- Không sinh tóm tắt hồ sơ bằng LLM cho đến khi queue, agent và chỗ lưu được chốt.

### References

- [Source: PRD › GĐ8 – HR duyệt hồ sơ đề cử](../../PRD.md)
- [Source: PRD › Personas; Quy tắc nghiệp vụ (BR-11, BR-12, BR-13); Thông báo](../../PRD.md)
- [Source: PRD › Các điểm cần chốt (Q5)](../../PRD.md)
- [Source: PRD FR-28, FR-29](../../PRD.md#functional-requirements)
- [Source: ARCHITECTURE › Màn hình theo cổng; Các module; Quản lý trạng thái; Tác vụ định kỳ](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Bản đồ sử dụng LLM theo giai đoạn; Những chỗ cố ý KHÔNG dùng LLM](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › API architecture](../../ARCHITECTURE.md#api-architecture)
- [Source: ARCHITECTURE › Security architecture](../../ARCHITECTURE.md#security-architecture)
- [Source: CONTEXT D8](../../CONTEXT.md)
- [Source: EPIC-5](../epics/EPIC-5.md)
- [LESSONS](../../LESSONS.md) — đọc lại khi bắt đầu story và ghi `Lessons applied:`.

## Verification commands

> Chưa có `package.json`. Lệnh chạy cụ thể điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case; đường dẫn test là đề xuất, theo quy ước test của US-1.1.

| AC | Command |
|---|---|
| AC-1 | `apps/api/test/review/nomination-review.e2e-spec.ts` › `GĐ8 HR lists published nominations sorted by S_final with tie-break` |
| AC-2 | `nomination-review.e2e-spec.ts` › `GĐ8 nomination detail includes evidence, skill map, flags; never answer keys` |
| AC-3 | `apps/api/test/review/review-idor.e2e-spec.ts` › `BR-11 HR of another company gets 404 on list, detail, decision, CV file` |
| AC-4 | `review-idor.e2e-spec.ts` › `Q5 no HR route lists or searches students outside nominations` |
| AC-5 | `nomination-review.e2e-spec.ts` › `GĐ8 INVITE moves NOMINATED → INTERVIEW with hr_review and audit in one transaction` |
| AC-6 | `nomination-review.e2e-spec.ts` › `BR-12 REJECT requires reason_code and note; student sees generic reason only` |
| AC-7 | `nomination-review.e2e-spec.ts` › `AD-8 second decision → 409; concurrent decisions → one wins` |
| AC-8 | `nomination-review.e2e-spec.ts` › `BR-13 no automatic decision; ordering unaffected by AI summary` |
| AC-9 | `nomination-review.e2e-spec.ts` › `GĐ8 supplement request only when invited < quota` |
| AC-10 | `apps/api/test/review/review-sla.e2e-spec.ts` › `GĐ8 SLA reminder once at 2 working days`, `GĐ8 overdue notifies HR and CENTER once`, `GĐ8 extension requires reason`; `apps/api/src/modules/review/domain/__tests__/working-days.spec.ts` |
| AC-11 | `ai-service/tests/agents/test_profile_summarizer.py` (chỉ khi làm TASK-5.3.6; dùng fixture) và `nomination-review.e2e-spec.ts` › `GĐ8 AI summary labelled as reference only` |
| AC-12 | Review giao diện theo `DESIGN.md` và quy tắc skill shadcn; ảnh chụp màn hình đính kèm PR |

## Changelog entry

### Added
- HR duyệt danh sách đề cử (module `review`): bảng sắp theo S_final, hồ sơ chi tiết có bằng chứng, bản đồ năng lực, chỉ số tin cậy CV và cảnh báo khi làm test; mời phỏng vấn hoặc từ chối bắt buộc có lý do; yêu cầu bổ sung hồ sơ.
- Kiểm tra cấp bản ghi: HR chỉ thấy đề cử thuộc JD của công ty mình (BR-11), có test IDOR.
- Nhắc HR trước hạn SLA và báo Trung tâm khi quá hạn; Trung tâm gia hạn có lý do.
- Màn *Danh sách đề cử* cho cổng HR.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-28, FR-29](../../PRD.md#functional-requirements)
- [ARCHITECTURE AD-8](../../ARCHITECTURE.md#architecture-decisions)
- [Epic EPIC-5](../epics/EPIC-5.md)
- [CONTEXT D8](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
- [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md) · [US-5.4](US-5.4-interviews-reserve-and-offers.md) · [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md)
