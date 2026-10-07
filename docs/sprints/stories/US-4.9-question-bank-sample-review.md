---
id: US-4.9
title: "Duyệt mẫu ngân hàng câu hỏi"
epic: EPIC-4
status: backlog
priority: P2
points: 2
sprint:
version_shipped:
prd_ref: [FR-19]
depends_on: [US-4.2]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
external_deps: [hr_lecturer_reviewers]
---

## Goal

Ngoài Validator, ngân hàng câu hỏi có thêm một lớp kiểm tra của người có chuyên môn. HR của doanh nghiệp (hoặc giảng viên) xem một mẫu ngẫu nhiên của ngân hàng và đánh dấu câu sai. Câu bị đánh dấu sai bị loại trước khi đến tay sinh viên. Bước này là tùy chọn: không ai duyệt thì kỳ thi vẫn chạy.

## Background

FR-19 (P2): HR hoặc giảng viên duyệt một mẫu ngẫu nhiên của ngân hàng câu hỏi (UC-22). PRD › GĐ1 bước 5: HR có thể duyệt nhanh đề mẫu (tùy chọn). PRD › GĐ5 › *Quy trình sinh đề* bước 3: (tùy chọn) HR hoặc giảng viên duyệt một mẫu ngẫu nhiên, trước bước khóa ngân hàng. PRD › *Risks* liệt kê "duyệt mẫu" là một biện pháp chống câu hỏi sai đáp án, cùng với Validator và báo lỗi của sinh viên.

ARCH › *API architecture* có `GET /api/jds/{id}/question-bank/sample` trong nhóm HR. ARCH › *Màn hình theo cổng* có màn "Duyệt đề mẫu" ở cổng HR. Story phụ thuộc người duyệt bên ngoài (`external_deps: hr_lecturer_reviewers`): theo sprints/README › *Việc không phải code (Track B)*, cần mời 2–3 người đánh giá (giảng viên, HR) từ T1–T2.

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** HR thuộc công ty của JD và ngân hàng của JD đã có câu `VALIDATED`, **When** gọi `GET /api/jds/{id}/question-bank/sample`, **Then** nhận một mẫu ngẫu nhiên phân tầng theo các ô của ma trận, cỡ mẫu theo `campaigns.config.bank_review_sample_size` (đề xuất) **And** mẫu được rút bằng seed lưu lại, nên tải lại trang cho cùng mẫu trong cùng phiên bản ngân hàng **And** mỗi câu có đáp án, giải thích, rubric để người duyệt kiểm tra.
- [ ] **AC-2** — HR của công ty khác gọi endpoint thì nhận `404`. `STUDENT` nhận `403`. `CENTER` xem và duyệt được mọi JD trong đợt.
- [ ] **AC-3** — **Given** người duyệt có quyền, **When** gửi kết quả qua `POST /api/jds/{id}/question-bank/sample/reviews` (đề xuất) với nhận định `OK` hoặc `ERROR` cho từng câu (`ERROR` bắt buộc có lý do), **Then** kết quả lưu kèm người duyệt và thời điểm (đề xuất bảng `question_reviews`), có audit **And** `ERROR` thiếu lý do hoặc câu không thuộc mẫu thì `400`.
- [ ] **AC-4** — **Given** một câu bị đánh dấu `ERROR`, **When** lưu kết quả, **Then** trong cùng giao dịch câu bị loại qua `retireQuestion()` của [US-4.2](US-4.2-validator-and-question-bank-lock.md) (ngân hàng đã khóa thì tăng `version`) **And** nếu một ô không còn đủ số câu cần rút thì Cán bộ Trung tâm nhận cảnh báo trên màn ngân hàng.
- [ ] **AC-5** — Không có lượt duyệt nào thì khóa ngân hàng và phòng thi vẫn chạy bình thường. Test xác nhận không bước nào chờ kết quả duyệt.
- [ ] **AC-6** — **Given** HR mở màn "Duyệt đề mẫu", **Then** thấy từng câu với phương án và đáp án đúng được tô sáng, rubric của câu tự luận, nút `OK`/`Báo lỗi` kèm ô lý do, trạng thái rỗng khi ngân hàng chưa sẵn sàng; chuỗi tiếng Việt.

## Tasks

- [ ] **TASK-4.9.1** — Hàm thuần rút mẫu (AC: 1)
  - [ ] Subtask 4.9.1.1 — `apps/api/src/modules/assessment/domain/review-sample.ts`: rút mẫu phân tầng theo ô bằng PRNG có seed; unit test tính tất định.
- [ ] **TASK-4.9.2** — API duyệt mẫu (AC: 1, 2, 3)
  - [ ] Subtask 4.9.2.1 — `apps/api/src/modules/assessment/api/review-sample.controller.ts`: `GET` mẫu, `POST` kết quả; `@Roles('HR', 'CENTER')`, kiểm công ty của JD qua service đã export của `company`.
  - [ ] Subtask 4.9.2.2 — Migration bảng `question_reviews` (đề xuất: `id`, `question_id`, `bank_version`, `reviewer_id`, `verdict`, `reason`, `reviewed_at`).
- [ ] **TASK-4.9.3** — Loại câu bị báo lỗi (AC: 4, 5)
  - [ ] Subtask 4.9.3.1 — `apps/api/src/modules/assessment/application/review-sample.service.ts`: gọi `retireQuestion()`, kiểm lại độ phủ, phát cảnh báo cho `CENTER`.
- [ ] **TASK-4.9.4** — Màn "Duyệt đề mẫu" ở cổng HR (AC: 6)
  - [ ] Subtask 4.9.4.1 — Đọc `DESIGN.md` trước khi code, ghi `Design applied: …` vào story.
  - [ ] Subtask 4.9.4.2 — `apps/web/src/features/hr/question-bank-review/` (đề xuất).
- [ ] **TASK-4.9.5** — Test (AC: 1, 2, 3, 4, 5)
  - [ ] Subtask 4.9.5.1 — `apps/api/test/assessment/review-sample.spec.ts`: helper đăng nhập theo vai trò của US-1.3 cho test IDOR.

## Dev notes

### Architecture constraints

- [AD-8](../../ARCHITECTURE.md#architecture-decisions): loại câu là chuyển trạng thái, đi qua `transitionTo` + audit; ngân hàng đã khóa thì tăng phiên bản (FR-18).
- AGENTS › Nguyên tắc 7: HR chỉ thấy dữ liệu thuộc JD của công ty mình.
- AGENTS › Nguyên tắc 8: đáp án chỉ hiện cho người duyệt (`HR`, `CENTER`), không bao giờ qua API của sinh viên.
- Không dùng LLM ở bước này; người duyệt quyết định.
- **Điểm chưa rõ trong spec — hỏi trước khi chốt:**
  - Giảng viên không có vai trò trong RBAC (`CENTER`, `STUDENT`, `HR`, `ADMIN`). Story tạm cho giảng viên duyệt bằng tài khoản `CENTER`.
  - Cỡ mẫu chưa có trong spec. Tạm đưa thành tham số `campaigns.config.bank_review_sample_size`.
  - PRD đặt bước duyệt mẫu trước bước khóa, nhưng story này phụ thuộc US-4.2 và chạy ở T9, sau khi ngân hàng có thể đã khóa. Story hỗ trợ cả hai: loại câu sau khóa thì tăng phiên bản. Có nên chờ HR duyệt trước khi khóa không thì cần chốt.
  - Câu bị loại làm ô thiếu câu: story chỉ cảnh báo Trung tâm, không tự sinh câu thay thế sau khi khóa.
  - ARCH không có bảng lưu kết quả duyệt; `question_reviews` là đề xuất (PRD › *Mô hình dữ liệu khái niệm* chỉ ghi CAU_HOI có "trạng thái duyệt").

### Cross-story dependencies

- Builds on [US-4.2](US-4.2-validator-and-question-bank-lock.md): câu `VALIDATED`, `retireQuestion()`, kiểm độ phủ, màn ngân hàng ở cổng Trung tâm.
- Builds on [US-4.1](US-4.1-exam-blueprint-test-generator.md): `question_banks.blueprint` để phân tầng mẫu.
- Builds on [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md) và [US-1.5](US-1.5-company-hr-accounts-jd-posting-approval.md): vai trò HR, công ty của JD.
- Sibling [US-4.6](US-4.6-appeals-and-question-error-reports.md): cùng loại câu bằng `retireQuestion()`.
- Sibling [US-4.3](US-4.3-exam-room.md) (cùng tuần T9): câu bị loại ở đây không còn được rút trong phòng thi (qua `getDrawableQuestions()`).

### References

- [Source: PRD › GĐ1 – Doanh nghiệp đăng JD, GĐ5 – Sinh và tổ chức bài test](../../PRD.md)
- [Source: PRD › Functional Requirements (FR-19)](../../PRD.md#functional-requirements)
- [Source: PRD › Risks](../../PRD.md#risks)
- [Source: ARCHITECTURE › API architecture, Màn hình theo cổng](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Security architecture](../../ARCHITECTURE.md#security-architecture)
- [Source: sprints/README › Việc không phải code (Track B)](../README.md)
- [Source: Epic EPIC-4](../epics/EPIC-4.md)

## Verification commands

> Chưa có `package.json`. Lệnh chạy cụ thể sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `apps/api/src/modules/assessment/domain/review-sample.spec.ts` › `GĐ5 sample stratified by cell, same seed same sample`; `apps/api/test/assessment/review-sample.spec.ts` › `GĐ5 HR of JD company gets sample with answer keys` |
| AC-2 | `apps/api/test/assessment/review-sample.spec.ts` › `BR-11 HR of other company 404; STUDENT 403; CENTER allowed` |
| AC-3 | `apps/api/test/assessment/review-sample.spec.ts` › `FR-19 review stored with reviewer and audit; 400 ERROR without reason or question outside sample` |
| AC-4 | `apps/api/test/assessment/review-sample.spec.ts` › `FR-19 ERROR retires question, bumps locked bank version, warns CENTER when cell short` |
| AC-5 | `apps/api/test/assessment/review-sample.spec.ts` › `FR-19 lock and exam start do not wait for review` |
| AC-6 | `apps/web/e2e/hr-question-review.spec.ts` (Playwright, đề xuất) › `FR-19 sample shows correct answer and rubric, OK/report with reason, empty state` |

## Changelog entry

### Added
- HR (hoặc giảng viên qua tài khoản Trung tâm) duyệt một mẫu ngẫu nhiên, phân tầng theo ma trận đề, của ngân hàng câu hỏi; câu bị báo lỗi bị loại khỏi ngân hàng và tăng phiên bản nếu ngân hàng đã khóa.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-19](../../PRD.md#functional-requirements)
- [Epic EPIC-4](../epics/EPIC-4.md)
- [CHANGELOG](../../CHANGELOG.md)
- [US-4.2 Validator và khóa ngân hàng](US-4.2-validator-and-question-bank-lock.md)
- [US-4.6 Phúc khảo và báo lỗi câu hỏi](US-4.6-appeals-and-question-error-reports.md)
