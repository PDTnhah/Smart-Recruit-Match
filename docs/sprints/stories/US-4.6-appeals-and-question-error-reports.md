---
id: US-4.6
title: "Phúc khảo và báo lỗi câu hỏi"
epic: EPIC-4
status: backlog
priority: P1
points: 5
sprint:
version_shipped:
prd_ref: [FR-24]
depends_on: [US-4.4, US-4.5]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Sinh viên không phải chấp nhận một điểm tự luận mà họ cho là sai. Trong 48 giờ sau khi có kết quả, họ phúc khảo được từng câu tự luận, và Cán bộ Trung tâm chấm lại. Sinh viên cũng báo được câu hỏi sai. Khi Trung tâm xác nhận lỗi, câu đó bị loại khỏi ngân hàng và mọi bài có câu đó được chấm lại. NV dưới ngưỡng θ_test chỉ chuyển sang *Không đạt ngưỡng* khi đã hết hạn phúc khảo và không còn phúc khảo hay báo lỗi nào đang mở.

## Background

FR-24: sinh viên xem điểm, phúc khảo phần tự luận trong 48 giờ và báo lỗi câu hỏi; câu sai bị loại và các bài liên quan được chấm lại (UC-15, UC-06). PRD › GĐ6 bước 5: Cán bộ Trung tâm hoặc giảng viên được phân công chấm lại. PRD › *Risks* đặt "sinh viên báo lỗi → loại câu và chấm lại" làm biện pháp cho rủi ro câu hỏi sai đáp án. PRD › *Thông báo*: sinh viên nhận kết quả phúc khảo.

ARCH › *Các bảng chính* có cột `exam_answers.appeal_status`. ARCH › *API architecture* có `POST /api/exam-answers/{id}/appeal`. ARCH › *Màn hình theo cổng* đặt "Kết quả, phúc khảo" ở cổng Sinh viên và "Phúc khảo, chấm tay" ở cổng Trung tâm. Thời hạn 48 giờ là ngân sách của epic (EPIC-4 › *Performance budgets*). Mốc bắt đầu tính là `results_published_at` mà [US-4.4](US-4.4-grading-stest-sfinal.md) ghi khi báo kết quả.

Vòng đời hồ sơ ứng tuyển (PRD › *Vòng đời trạng thái*) có *Đã chấm test* (`TEST_GRADED`) → *Không đạt ngưỡng* (`BELOW_THRESHOLD`) khi dưới θ_test, và `BELOW_THRESHOLD` là trạng thái cuối. Nếu chuyển ngay khi có điểm thì phúc khảo hay chấm lại không còn tác dụng với NV đó. Vì vậy [US-4.4](US-4.4-grading-stest-sfinal.md) chỉ chuyển sau khi hết hạn phúc khảo. Story này thêm điều kiện: phiên còn phúc khảo hoặc báo lỗi đang mở thì chưa chuyển.

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** sinh viên là chủ phiên và `results_published_at` cách hiện tại chưa quá `campaigns.config.appeal_window_hours` (đề xuất, mặc định 48), **When** gọi `POST /api/exam-answers/{id}/appeal` cho một câu tự luận kèm lý do, **Then** `appeal_status` thành `REQUESTED` (enum đề xuất) và có audit **And** câu trắc nghiệm trả `400` **And** quá hạn trả `409` mã `APPEAL_WINDOW_CLOSED` **And** phúc khảo lần hai cùng câu trả `409` **And** sinh viên khác nhận `404`, vai trò khác nhận `403`.
- [ ] **AC-2** — **Given** người dùng `CENTER`, **When** xem hàng đợi phúc khảo (`GET /api/campaigns/{id}/appeals`, đề xuất) và gửi kết quả chấm lại (`POST /api/exam-answers/{id}/appeal/resolution`, đề xuất) với điểm từng tiêu chí và ghi chú, **Then** code cộng thành `final_score` mới, `appeal_status` thành đã xử lý, audit lưu điểm cũ và mới trong cùng giao dịch **And** màn hình không hiện danh tính sinh viên (BR-03) **And** lưu với `row_version` cũ trả `409`.
- [ ] **AC-3** — **Given** một phúc khảo vừa xử lý xong, **When** giao dịch hoàn tất, **Then** S_test, `skill_scores` và S_final của phiên được tính lại bằng hàm thuần của US-4.4 **And** sinh viên nhận thông báo "Kết quả phúc khảo" kèm điểm cũ và mới.
- [ ] **AC-4** — **Given** sinh viên là chủ phiên, **When** báo lỗi một câu thuộc đề của mình (trong lúc làm bài hoặc trong hạn phúc khảo) kèm lý do qua `POST /api/questions/{id}/reports` (đề xuất), **Then** một bản ghi `question_reports` (bảng đề xuất) được tạo ở trạng thái `OPEN` **And** mỗi sinh viên chỉ báo một lần cho mỗi câu **And** câu không thuộc phiên của sinh viên trả `404` **And** response không chứa đáp án hay rubric.
- [ ] **AC-5** — **Given** `CENTER` xem một báo lỗi, **When** từ chối kèm ghi chú, **Then** báo lỗi đóng và người báo nhận thông báo **When** chấp nhận, **Then** trong cùng giao dịch câu bị loại qua `retireQuestion()` của [US-4.2](US-4.2-validator-and-question-bank-lock.md) (phiên bản ngân hàng tăng 1, có audit) và mọi báo lỗi mở của câu đó đóng lại.
- [ ] **AC-6** — **Given** một câu vừa bị loại, **When** tác vụ chấm lại chạy, **Then** với mọi phiên có câu đó, câu bị bỏ khỏi cả tử số và mẫu số của phần chứa nó (đề xuất), rồi phần A/B, S_test, `skill_scores`, S_final được tính lại **And** chạy lại tác vụ không đổi kết quả (idempotent) **And** mỗi sinh viên bị ảnh hưởng nhận thông báo **And** nếu một phần không còn câu tính điểm nào thì phiên được đánh dấu cho Trung tâm xử lý tay, không tự tính.
- [ ] **AC-7** — **Given** hạn phúc khảo của một phiên đã qua (theo `Clock`) nhưng phiên còn phúc khảo hoặc báo lỗi đang mở, **When** tác vụ chuyển `TEST_GRADED` → `BELOW_THRESHOLD` của [US-4.4](US-4.4-grading-stest-sfinal.md) chạy, **Then** NV của phiên đó chưa bị chuyển **And** sau khi mục cuối cùng được xử lý, lần chạy kế tiếp dùng S_test mới (số nguyên ×100) để quyết định.
- [ ] **AC-8** — **Given** sinh viên mở màn kết quả trên điện thoại, **Then** mỗi câu tự luận có nút "Phúc khảo" kèm thời gian còn lại (ẩn khi hết hạn), mỗi câu có nút "Báo lỗi câu hỏi", và trạng thái phúc khảo/báo lỗi hiện rõ; chuỗi tiếng Việt, không cuộn ngang ở 360 px.
- [ ] **AC-9** — **Given** Cán bộ Trung tâm mở màn phúc khảo, **Then** thấy hai hàng đợi (phúc khảo, báo lỗi câu hỏi). Form chấm lại dùng lại form chấm theo tiêu chí của [US-4.5](US-4.5-manual-essay-grading.md). Báo lỗi hiện số sinh viên cùng báo một câu.

## Tasks

- [ ] **TASK-4.6.1** — Trạng thái và bảng (AC: 1, 4, 5)
  - [ ] Subtask 4.6.1.1 — `packages/shared/states/appeal.ts`, `packages/shared/states/question-report.ts` (đề xuất): enum và bảng chuyển trạng thái, unit test.
  - [ ] Subtask 4.6.1.2 — Migration: bảng `question_reports` (đề xuất: `id`, `question_id`, `session_id`, `student_id`, `reason`, `status`, `resolved_by`, `resolution_note`, `row_version`), unique `(student_id, question_id)`.
- [ ] **TASK-4.6.2** — Endpoint cho sinh viên (AC: 1, 4)
  - [ ] Subtask 4.6.2.1 — `apps/api/src/modules/assessment/api/appeal.controller.ts`: phúc khảo, báo lỗi; kiểm chủ sở hữu và hạn bằng `Clock`.
- [ ] **TASK-4.6.3** — Xử lý ở cổng Trung tâm (AC: 2, 3, 5)
  - [ ] Subtask 4.6.3.1 — `apps/api/src/modules/assessment/application/appeal.service.ts`: chấm lại theo tiêu chí, audit, `row_version`.
  - [ ] Subtask 4.6.3.2 — `apps/api/src/modules/assessment/application/question-report.service.ts`: từ chối hoặc chấp nhận, gọi `retireQuestion()`.
- [ ] **TASK-4.6.4** — Chấm lại khi loại câu (AC: 3, 6)
  - [ ] Subtask 4.6.4.1 — `apps/api/src/modules/assessment/domain/regrade.ts`: tính lại phần A/B khi bỏ một câu; unit test các ca biên (phần không còn câu).
  - [ ] Subtask 4.6.4.2 — `apps/api/src/modules/assessment/application/regrade.service.ts`: duyệt mọi phiên có câu bị loại, tính lại, gửi thông báo; idempotent.
- [ ] **TASK-4.6.5** — Chặn chốt ngưỡng khi còn mục đang mở (AC: 7)
  - [ ] Subtask 4.6.5.1 — Bổ sung điều kiện chặn vào `apps/api/src/modules/assessment/application/threshold.scheduler.ts` của US-4.4: phiên có `appeal_status = REQUESTED` hoặc `question_reports` ở `OPEN` thì bỏ qua.
- [ ] **TASK-4.6.6** — Giao diện (AC: 8, 9)
  - [ ] Subtask 4.6.6.1 — Đọc `DESIGN.md` trước khi code, ghi `Design applied: …` vào story.
  - [ ] Subtask 4.6.6.2 — `apps/web/src/features/student/exam-result/`: nút và hộp thoại phúc khảo, báo lỗi.
  - [ ] Subtask 4.6.6.3 — `apps/web/src/features/center/appeals/`: hai hàng đợi, dùng lại form của `apps/web/src/features/center/grading/`.
- [ ] **TASK-4.6.7** — Test (AC: 1–7)
  - [ ] Subtask 4.6.7.1 — `apps/api/test/assessment/appeals.spec.ts`, `apps/api/test/assessment/question-reports.spec.ts` với `FakeClock` của US-1.4 để kiểm hạn 48 giờ.

## Dev notes

### Architecture constraints

- [AD-2](../../ARCHITECTURE.md#architecture-decisions): chấm lại khi phúc khảo là việc của người. Code cộng điểm tiêu chí và tính lại S_test, S_final. Không gọi Grader lại.
- [AD-8](../../ARCHITECTURE.md#architecture-decisions): phúc khảo, báo lỗi và loại câu đều đi qua `transitionTo` + audit + `row_version`.
- AGENTS › Nguyên tắc 8: màn kết quả và báo lỗi không gửi đáp án hay rubric xuống client.
- AGENTS › Nguyên tắc 9: điểm tính lại và so với θ_test bằng số nguyên ×100, dùng hàm của US-4.4.
- AGENTS › Nguyên tắc 13: chuyển trạng thái NV qua service đã export của `matching`.
- **Điểm chưa rõ trong spec — hỏi trước khi chốt:**
  - Khi nào chuyển `TEST_GRADED` → `BELOW_THRESHOLD`. US-4.4 tạm làm khi hết hạn phúc khảo, và story này chặn thêm khi còn mục đang mở (AC-7), vì đó là trạng thái cuối. Nếu chuyển ngay khi có điểm thì cần thêm đường quay lại `TEST_GRADED`, mà PRD không có.
  - Cách chấm lại khi loại câu: tạm bỏ câu khỏi cả tử số và mẫu số của phần chứa nó. Phương án khác là cho mọi sinh viên điểm tối đa ở câu đó. PRD chỉ ghi "chấm lại".
  - Phúc khảo có được làm giảm điểm không. Story tạm cho phép, vì điểm chấm lại là điểm cuối.
  - Sinh viên xem lại nội dung câu hỏi sau khi thi để phúc khảo và báo lỗi có thể làm lộ ngân hàng cho người thi sau. Story tạm chỉ cho xem câu của chính mình, không kèm đáp án.
  - PRD không nói phân bổ ([US-5.2](US-5.2-allocation-round-draft-adjust-publish.md)) có phải chờ hết hạn phúc khảo không. Lịch mẫu ở PRD › *User Journeys* đặt phúc khảo ở tuần 4, phân bổ ở tuần 5.
  - Giảng viên chưa có vai trò trong RBAC (xem [US-4.5](US-4.5-manual-essay-grading.md)). Story tạm chỉ cho `CENTER`.
  - ARCH không có bảng lưu báo lỗi câu hỏi; `question_reports` là đề xuất. Thời hạn 48 giờ đưa thành tham số `campaigns.config.appeal_window_hours`.

### Cross-story dependencies

- Builds on [US-4.4](US-4.4-grading-stest-sfinal.md): `results_published_at`, `appeal_window_hours`, hàm tính điểm ×100, `threshold.scheduler.ts`, màn kết quả `apps/web/src/features/student/exam-result/`, fixture `ai-service/tests/fixtures/grader/`.
- Builds on [US-4.5](US-4.5-manual-essay-grading.md): form chấm theo tiêu chí, `finalizeSessionIfComplete()`.
- Builds on [US-4.2](US-4.2-validator-and-question-bank-lock.md): `retireQuestion()` tăng phiên bản ngân hàng.
- Builds on [US-4.3](US-4.3-exam-room.md): nút báo lỗi trong phòng thi gắn vào `apps/web/src/features/exam/`.
- Builds on [US-1.7](US-1.7-notifications-sse-email-reminders.md): thông báo kết quả phúc khảo và chấm lại.
- Sibling [US-4.9](US-4.9-question-bank-sample-review.md): cả hai loại câu bằng `retireQuestion()`; câu bị loại trước khi có bài làm thì không cần chấm lại.
- Sibling [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md), [US-5.3](US-5.3-hr-nomination-review.md) (cùng tuần T11): S_final đổi sau phúc khảo phải được phân bổ đọc lại; thống nhất thời điểm chốt dữ liệu đầu vào.

### Performance budget

- Thời hạn phúc khảo 48 giờ tính từ `results_published_at` (EPIC-4 › *Performance budgets*). Bảo vệ bằng `appeals.spec.ts` với `FakeClock` ở các mốc 47:59 và 48:01.

### References

- [Source: PRD › GĐ6 – Chấm test và tính điểm tổng hợp (bước 5)](../../PRD.md)
- [Source: PRD › Vòng đời trạng thái › Hồ sơ ứng tuyển](../../PRD.md)
- [Source: PRD › Functional Requirements (FR-24)](../../PRD.md#functional-requirements)
- [Source: PRD › Risks, Thông báo](../../PRD.md#risks)
- [Source: ARCHITECTURE › Các bảng chính, API architecture](../../ARCHITECTURE.md#data-architecture)
- [Source: ARCHITECTURE › Quản lý trạng thái, Tác vụ định kỳ](../../ARCHITECTURE.md)
- [Source: CONTEXT D2, D8](../../CONTEXT.md)
- [Source: Epic EPIC-4](../epics/EPIC-4.md)

## Verification commands

> Chưa có `package.json`. Lệnh chạy cụ thể sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `apps/api/test/assessment/appeals.spec.ts` › `GĐ6 appeal essay within 48h; 400 for MC; 409 after window or duplicate; IDOR 404; role 403` |
| AC-2 | `apps/api/test/assessment/appeals.spec.ts` › `GĐ6 CENTER resolves appeal by criteria with audit old/new; no identity fields; 409 stale row_version` |
| AC-3 | `apps/api/test/assessment/appeals.spec.ts` › `GĐ6 resolved appeal recomputes S_test, S_final and notifies student` |
| AC-4 | `apps/api/test/assessment/question-reports.spec.ts` › `GĐ6 student reports own question once; 404 for foreign question; no answer key in response` |
| AC-5 | `apps/api/test/assessment/question-reports.spec.ts` › `GĐ6 reject closes report; accept retires question, bumps bank version, closes open reports` |
| AC-6 | `apps/api/src/modules/assessment/domain/regrade.spec.ts` › `GĐ6 removed question excluded from part numerator and denominator; empty part flagged`; `apps/api/test/assessment/question-reports.spec.ts` › `GĐ6 regrade all affected sessions idempotent with notifications` |
| AC-7 | `apps/api/test/assessment/threshold.spec.ts` › `GĐ6 open appeal or question report blocks BELOW_THRESHOLD; next run uses regraded S_test` |
| AC-8 | `apps/web/e2e/exam-result-appeal.spec.ts` (Playwright, đề xuất) › `NFR-13 appeal button with remaining time, hidden after window; report question; 360px` |
| AC-9 | `apps/web/e2e/center-appeals.spec.ts` (Playwright, đề xuất) › `GĐ6 appeal and report queues; resolution form reuses criterion form` |

## Changelog entry

### Added
- Sinh viên phúc khảo từng câu tự luận trong 48 giờ sau khi có kết quả; Cán bộ Trung tâm chấm lại theo tiêu chí, hệ thống tính lại S_test, S_final và báo kết quả phúc khảo.
- Sinh viên báo lỗi câu hỏi; Trung tâm xác nhận thì câu bị loại khỏi ngân hàng (tăng phiên bản) và mọi bài có câu đó được chấm lại.
- NV có phúc khảo hoặc báo lỗi đang mở chưa bị chuyển sang *Không đạt ngưỡng* cho đến khi mục đó được xử lý.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-24](../../PRD.md#functional-requirements)
- [Epic EPIC-4](../epics/EPIC-4.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D2, D8](../../CONTEXT.md)
- [US-4.4 Chấm bài, S_test và S_final](US-4.4-grading-stest-sfinal.md)
- [US-4.5 Chấm tay câu tự luận](US-4.5-manual-essay-grading.md)
