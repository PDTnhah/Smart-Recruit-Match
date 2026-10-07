---
id: US-4.5
title: "Chấm tay câu tự luận được chuyển"
epic: EPIC-4
status: backlog
priority: P0
points: 3
sprint:
version_shipped:
prd_ref: [FR-23]
depends_on: [US-4.4]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Câu tự luận mà AI không chấm chắc chắn có người chấm lại. Cán bộ Trung tâm mở hàng đợi, chấm theo rubric mà không thấy danh tính sinh viên, và điểm của họ là điểm cuối cùng của câu. Khi phiên thi không còn câu nào chờ chấm, hệ thống tính lại S_test và S_final rồi chuyển nguyện vọng sang *Đã chấm test*. Nhờ vậy mọi bài đều có điểm, kể cả bài AI không chấm được.

## Background

FR-23: Cán bộ Trung tâm hoặc giảng viên chấm tay các câu tự luận được chuyển (UC-06). [US-4.4](US-4.4-grading-stest-sfinal.md) đặt `exam_answers.needs_human = true` theo các điều kiện ở PRD › GĐ6 và ARCH › *Pipeline từng agent › Grader*: hai lần chấm lệch > 15% thang điểm, độ tự tin thấp, điểm sát θ_test ±5, hoặc bài làm bị gắn cờ. Ở các câu này `final_score` còn trống, nên S_test của phiên chưa tính được.

BR-13 giữ con người ở điểm quyết định; ở đây con người quyết định điểm cuối của câu. BR-03 cấm dùng thông tin nhạy cảm trong mọi bước chấm điểm, nên màn chấm tay không hiện danh tính sinh viên. ARCH › *Màn hình theo cổng* đặt "Phúc khảo, chấm tay" ở cổng Trung tâm. ARCH › *Security architecture* chỉ có bốn vai trò `CENTER`, `STUDENT`, `HR`, `ADMIN`, không có vai trò giảng viên.

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** người dùng `CENTER`, **When** gọi `GET /api/campaigns/{id}/grading-queue` (đề xuất), **Then** nhận danh sách câu có `needs_human = true` và chưa có `final_score`, nhóm theo phiên, kèm lý do chuyển (lệch, độ tự tin thấp, sát ngưỡng, cờ), có phân trang **And** `HR`, `STUDENT` nhận `403`.
- [ ] **AC-2** — Hàng đợi và chi tiết một câu chỉ hiện mã phiên ẩn danh, đề, rubric, đáp án mẫu, bài làm và hai lần chấm của AI (điểm từng tiêu chí, lý do). Không có tên, mã sinh viên, ảnh hay trường nào của hồ sơ (BR-03). Test kiểm danh sách khóa trong response.
- [ ] **AC-3** — **Given** một câu đang chờ chấm, **When** `CENTER` gọi `PUT /api/exam-answers/{id}/manual-grade` (đề xuất) với điểm từng tiêu chí và ghi chú tùy chọn, **Then** code cộng thành `final_score`, lưu người chấm và thời điểm, ghi `audit_logs` (trước/sau) trong cùng giao dịch **And** điểm tiêu chí ngoài khoảng [0, điểm tối đa] hoặc thiếu tiêu chí thì trả `400`.
- [ ] **AC-4** — **Given** hai người cùng mở một câu, **When** người thứ hai lưu với `row_version` cũ (đề xuất cột `exam_answers.row_version`), **Then** nhận `409` và điểm của người thứ nhất giữ nguyên **And** chấm lại một câu đã có `final_score` qua endpoint này cũng trả `409` (sửa điểm sau đó đi qua phúc khảo, [US-4.6](US-4.6-appeals-and-question-error-reports.md)).
- [ ] **AC-5** — **Given** câu cuối cùng còn chờ của một phiên vừa được chấm, **When** giao dịch lưu điểm hoàn tất, **Then** S_test, `skill_scores` và S_final được tính lại bằng các hàm thuần của [US-4.4](US-4.4-grading-stest-sfinal.md), các NV dùng phiên này chuyển `PENDING_TEST` → `TEST_GRADED` qua `transitionTo` có audit, và sinh viên nhận thông báo có kết quả **And** phiên còn câu chờ thì không tính S_test.
- [ ] **AC-6** — **Given** Cán bộ Trung tâm mở màn chấm tay, **Then** thấy bảng hàng đợi (lọc theo lý do), ngăn chi tiết có ô nhập điểm theo từng tiêu chí rubric và tổng do hệ thống tự cộng, trạng thái rỗng "Không còn câu cần chấm", trạng thái đang tải và lỗi, chuỗi tiếng Việt.
- [ ] **AC-7** — Luồng chấm tay không gọi LLM và không phát job AI nào.

## Tasks

- [ ] **TASK-4.5.1** — API hàng đợi và chi tiết (AC: 1, 2)
  - [ ] Subtask 4.5.1.1 — `apps/api/src/modules/assessment/api/manual-grading.controller.ts`: `GET` hàng đợi và chi tiết, `@Roles('CENTER')`.
  - [ ] Subtask 4.5.1.2 — `packages/shared/schemas/manual-grading.ts`: DTO dạng whitelist, không có trường danh tính.
- [ ] **TASK-4.5.2** — Lưu điểm chấm tay (AC: 3, 4, 7)
  - [ ] Subtask 4.5.2.1 — `apps/api/src/modules/assessment/domain/manual-grade.ts`: kiểm khoảng điểm tiêu chí, cộng điểm câu.
  - [ ] Subtask 4.5.2.2 — `apps/api/src/modules/assessment/application/manual-grading.service.ts`: cập nhật kèm `row_version`, audit trong cùng giao dịch; migration thêm `exam_answers.row_version` nếu US-4.3 chưa thêm.
- [ ] **TASK-4.5.3** — Tính lại điểm và chuyển trạng thái (AC: 5)
  - [ ] Subtask 4.5.3.1 — Dùng lại `computeSTest`, `computeSkillScores`, `computeSFinal` và bước chuyển trạng thái trong `essay-results.handler.ts` của US-4.4, tách thành hàm dùng chung `finalizeSessionIfComplete()` (đề xuất).
- [ ] **TASK-4.5.4** — Màn chấm tay ở cổng Trung tâm (AC: 6)
  - [ ] Subtask 4.5.4.1 — Đọc `DESIGN.md` trước khi code, ghi `Design applied: …` vào story.
  - [ ] Subtask 4.5.4.2 — `apps/web/src/features/center/grading/`: TanStack Table cho hàng đợi, form React Hook Form + Zod cho điểm tiêu chí.
- [ ] **TASK-4.5.5** — Test (AC: 1, 2, 3, 4, 5, 7)
  - [ ] Subtask 4.5.5.1 — `apps/api/test/assessment/manual-grading.spec.ts`: phân quyền, khóa trong response, khoảng điểm, `409` đồng thời, tính lại điểm khi xong câu cuối.

## Dev notes

### Architecture constraints

- [AD-2](../../ARCHITECTURE.md#architecture-decisions): người chấm nhập điểm từng tiêu chí; code cộng điểm câu và tính S_test, S_final. Không cho nhập thẳng điểm tổng của câu.
- [AD-8](../../ARCHITECTURE.md#architecture-decisions): ghi điểm và chuyển trạng thái NV có audit trong cùng giao dịch, chống ghi đè bằng `row_version`.
- AGENTS › Nguyên tắc 4 và BR-03: màn chấm tay là một bước chấm điểm, nên không hiện thông tin định danh.
- AGENTS › Nguyên tắc 13: chuyển trạng thái NV qua service đã export của `matching`.
- **Điểm chưa rõ trong spec — hỏi trước khi chốt:**
  - PRD nói "Cán bộ Trung tâm hoặc giảng viên", nhưng RBAC chỉ có `CENTER`, `STUDENT`, `HR`, `ADMIN`. Story tạm chỉ cho `CENTER`. Giảng viên dùng tài khoản `CENTER` hay cần vai trò mới thì cần chốt.
  - Có nên cho người chấm thấy điểm AI không (dễ bị neo theo điểm AI). Story tạm hiện cả hai lần chấm của AI để tham khảo.
  - `exam_answers` có khóa chính `(session_id, question_id)`, nhưng ARCH › *API architecture* dùng `/api/exam-answers/{id}`. Cần chọn: thêm cột `id` hay dùng đường dẫn có hai khóa.

### Cross-story dependencies

- Builds on [US-4.4](US-4.4-grading-stest-sfinal.md): `exam_answers.needs_human`, `ai_grading`, các hàm `computeSTest`, `computeSkillScores`, `computeSFinal`, bước chuyển `PENDING_TEST` → `TEST_GRADED`.
- Builds on [US-1.2](US-1.2-core-db-schema-transition-audit-log.md) (`transitionTo`, audit) và [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md) (`@Roles()`, `DESIGN.md`).
- Required by [US-4.6](US-4.6-appeals-and-question-error-reports.md): màn chấm lại khi phúc khảo dùng lại form chấm theo tiêu chí và `finalizeSessionIfComplete()`.
- Sibling [US-4.4](US-4.4-grading-stest-sfinal.md) (cùng tuần T10): cùng sửa `apps/api/src/modules/assessment/application/`; merge sau US-4.4.

### References

- [Source: PRD › GĐ6 – Chấm test và tính điểm tổng hợp](../../PRD.md)
- [Source: PRD › Functional Requirements (FR-23)](../../PRD.md#functional-requirements)
- [Source: PRD › Quy tắc nghiệp vụ (BR-03, BR-13)](../../PRD.md)
- [Source: PRD › Personas](../../PRD.md#personas)
- [Source: ARCHITECTURE › Màn hình theo cổng, Pipeline từng agent › Grader](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Security architecture](../../ARCHITECTURE.md#security-architecture)
- [Source: CONTEXT D2, D8](../../CONTEXT.md)
- [Source: Epic EPIC-4](../epics/EPIC-4.md)

## Verification commands

> Chưa có `package.json`. Lệnh chạy cụ thể sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `apps/api/test/assessment/manual-grading.spec.ts` › `GĐ6 CENTER sees needs_human queue with reasons; HR/STUDENT 403` |
| AC-2 | `apps/api/test/assessment/manual-grading.spec.ts` › `BR-03 queue and detail responses contain no identity or profile fields` |
| AC-3 | `apps/api/test/assessment/manual-grading.spec.ts` › `GĐ6 manual criterion scores summed by code with audit; 400 out of range or missing criterion` |
| AC-4 | `apps/api/test/assessment/manual-grading.spec.ts` › `GĐ6 concurrent manual grade 409 on stale row_version; 409 when already final` |
| AC-5 | `apps/api/test/assessment/manual-grading.spec.ts` › `GĐ6 last pending answer triggers S_test, S_final and transition to graded` |
| AC-6 | `apps/web/e2e/center-grading.spec.ts` (Playwright, đề xuất) › `GĐ6 queue filter, criterion form auto-sum, empty/loading/error states` |
| AC-7 | `apps/api/test/assessment/manual-grading.spec.ts` › `BR-13 manual grading publishes no AI job` |

## Changelog entry

### Added
- Hàng đợi chấm tay ở cổng Trung tâm cho câu tự luận AI chuyển sang (lệch điểm, độ tự tin thấp, sát ngưỡng, có cờ); màn chấm ẩn danh, chấm theo từng tiêu chí rubric.
- Chấm xong câu cuối của một bài thì hệ thống tính lại S_test, S_final và báo kết quả cho sinh viên.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-23](../../PRD.md#functional-requirements)
- [Epic EPIC-4](../epics/EPIC-4.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D2, D8](../../CONTEXT.md)
- [US-4.4 Chấm bài, S_test và S_final](US-4.4-grading-stest-sfinal.md)
- [US-4.6 Phúc khảo và báo lỗi câu hỏi](US-4.6-appeals-and-question-error-reports.md)
