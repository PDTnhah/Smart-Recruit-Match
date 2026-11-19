---
id: US-4.11
title: "Tab Ngân hàng câu hỏi: xem toàn bộ câu và loại câu sai"
epic: EPIC-4
status: backlog
priority: P1
points: 5
sprint:
version_shipped:
prd_ref: [FR-18]
depends_on: [US-4.10]
assignee:
commit:
created: 2026-11-19
updated: 2026-11-19
---

## Goal

Trung tâm xem được toàn bộ câu AI đã sinh cho một JD, không chỉ ma trận của một đề. Trung tâm cũng loại được câu sai: trước khi khóa thì ô thiếu được sinh bù; sau khi khóa thì câu không còn được rút. Đây là bước kiểm bằng người, thay cho Validator chạy tự động ([US-4.10](US-4.10-on-demand-question-validation.md)).

## Background

Người dùng mở `/admin/job-descriptions/5?tab=question-bank` và thấy như chỉ đang xem một đề. Tab hiện có thẻ sinh câu, thẻ khóa và bảng ma trận đề, với mỗi ô là số câu của một đề kèm độ phủ. Không có chỗ nào cho xem nội dung câu. Để xem 96 câu của JD 5, người dùng phải xuất báo cáo riêng (`reports/2026-11-19-bank-3-questions.md`). Chưa có API nào liệt kê câu của ngân hàng: module `assessment` chỉ có `GET`/`PUT /api/jds/{id}/exam-blueprint`, `POST .../question-bank/generate` và `POST /api/question-banks/{id}/lock`.

Ngày 2026-11-19 người dùng chốt ([CONTEXT D60](../../CONTEXT.md)): Trung tâm xem mọi câu và được loại câu sai. Validator chỉ chạy khi Trung tâm bấm (US-4.10). [US-4.9](US-4.9-question-bank-sample-review.md) (HR duyệt mẫu) và [US-4.6](US-4.6-appeals-and-question-error-reports.md) (SV báo lỗi) giữ nguyên.

**Lessons applied**: §25 (hộp thoại gửi `row_version` của lúc mở), §43 (mọi UPDATE của `questions` tăng `row_version`), §44 (việc sau commit lỗi thì không trả 500 cho thao tác đã lưu), §30 (view mới trong `core` làm đỏ `core-schema`, `ai-service-role`), §22 (integration test dùng chung DB), §6, §21.

## Acceptance criteria

- [ ] **AC-1** — **Given** CENTER, **When** gọi `GET /api/question-banks/{id}/questions`, **Then** nhận mọi câu của ngân hàng, ở mọi trạng thái. Mỗi câu có:
  - `id`, phần, kỹ năng, độ khó, loại, trạng thái, `rowVersion`;
  - đề, phương án, đáp án đúng, giải thích; câu tự luận có rubric và đáp án mẫu;
  - kết quả kiểm bằng AI nếu có (lý do loại, đáp án tự giải, độ khó ước lượng, ghi chú);
  - lý do loại bằng tay nếu có (người loại, lý do, ghi chú, thời điểm);
  - `model`, `prompt_version` (Nguyên tắc 12).

  **And** `HR`, `STUDENT` nhận `403` **And** không route nào của sinh viên trả các trường này (Nguyên tắc 8).
- [ ] **AC-2** — Tab "Ngân hàng câu hỏi" chia ba mục:
  - **Tổng quan**: sinh câu, kiểm bằng AI, khóa, độ phủ từng ô.
  - **Câu hỏi (N)**: toàn bộ ngân hàng, nhóm theo phần rồi theo ô (kỹ năng × độ khó). Lọc theo phần, kỹ năng, độ khó, trạng thái; tìm theo nội dung đề. Mỗi câu xem được đầy đủ: phương án có đáp án đúng tô sáng, giải thích, rubric, kết quả kiểm. Trạng thái trống khi chưa có câu hoặc không câu nào khớp bộ lọc.
  - **Ma trận đề**: cấu trúc của một đề (số câu mỗi ô, tỷ trọng, thời gian), ghi rõ đây là cấu trúc một đề rút từ ngân hàng.

  **And** dùng được ở 360 / 768 / 1024 px.
- [ ] **AC-3** — **Given** CENTER và một câu `DRAFT` hoặc `VALIDATED`, **When** bấm "Loại câu", chọn lý do trong `QUESTION_REJECT_REASONS`, ghi chú (tùy chọn), xác nhận (đề xuất `POST /api/questions/{id}/reject` `{ reason, note?, rowVersion }`), **Then**:
  - ngân hàng chưa khóa: câu đổi sang `REJECTED` qua `transitionTo`, có audit, lý do lưu ở `questions.manual_rejection` (đề xuất, JSONB);
  - ngân hàng đã khóa: gọi `retireQuestion()`, câu sang `RETIRED`, `version` của ngân hàng tăng 1; màn cảnh báo khi một ô còn ít câu hơn số câu cần rút cho một đề.

  **And** `409` khi lệch `row_version`, khi đang có run (sinh hay kiểm), hoặc khi câu đã `REJECTED`/`RETIRED` **And** `HR`, `STUDENT` nhận `403`.
- [ ] **AC-4** — Câu Trung tâm loại không được Test Generator đếm vào độ phủ. Lý do loại được đưa vào prompt của lượt sinh bù sau đó, như lý do Validator loại. Đề xuất: view `core.v_ai_question_rejections` (`bank_id`, `draft_id`, `reasons`) chỉ trả ngân hàng chưa khóa; AI Service đọc view này lúc bắt đầu job.

## Tasks

- [ ] **TASK-4.11.1** — Shared và DB (AC: 1, 3, 4)
  - [ ] Subtask 4.11.1.1 — `packages/shared`: schema response danh sách câu, `RejectQuestionRequestSchema`; bảng chuyển trạng thái thêm `VALIDATED → REJECTED` (trước khóa, do người).
  - [ ] Subtask 4.11.1.2 — Migration: cột `questions.manual_rejection`, view `core.v_ai_question_rejections` và quyền của role `ai_service`; `db:generate`.
- [ ] **TASK-4.11.2** — API (AC: 1, 3)
  - [ ] Subtask 4.11.2.1 — `QuestionBankService`: `listQuestions(bankId)`, `rejectQuestion(questionId, input, actor)` (khóa dòng, kiểm run đang chạy, `transitionTo` hoặc `retireQuestion()`).
  - [ ] Subtask 4.11.2.2 — Controller `@Roles('CENTER')`; `api:sync`.
- [ ] **TASK-4.11.3** — ai-service (AC: 4)
  - [ ] Subtask 4.11.3.1 — `app/agents/test_generator/source.py` đọc view; `tools.py` không đếm câu bị loại; prompt nhận lý do loại.
- [ ] **TASK-4.11.4** — Web (AC: 2, 3)
  - [ ] Subtask 4.11.4.1 — Đọc `DESIGN.md` và skill shadcn trước khi code; ghi `Design applied: …`.
  - [ ] Subtask 4.11.4.2 — `apps/web/src/features/center/question-bank/`: ba mục, danh sách câu (lọc phía client; một ngân hàng tối đa 1000 câu, thường khoảng 100), hộp thoại "Loại câu" gửi `rowVersion` của lúc mở.
- [ ] **TASK-4.11.5** — Test (AC: 1, 3, 4)
  - [ ] Subtask 4.11.5.1 — Integration `question-bank.int-spec.ts`: CENTER thấy đủ trường; `HR`/`STUDENT` `403`; loại câu trước khóa và sau khóa (`version` tăng); `409` khi lệch `row_version` hay có run.
  - [ ] Subtask 4.11.5.2 — pytest `test_test_generator.py`: câu bị Trung tâm loại không được đếm, lý do có trong prompt.

## Dev notes

### Architecture constraints

- AGENTS › Nguyên tắc 7, 8: chỉ CENTER thấy đáp án qua route này; phòng thi vẫn không gửi `answer_key`.
- AGENTS › Nguyên tắc 10: loại câu đi qua `transitionTo` + audit, chống ghi đè bằng `row_version`; sau khi khóa thì đi qua `retireQuestion()` (D50).
- AGENTS › Nguyên tắc 3: AI Service đọc lý do loại qua view, không đọc thẳng `core.questions`.
- AGENTS › Nguyên tắc 13: chỉ module `assessment` đọc ghi bảng câu hỏi.

### Cross-story dependencies

- Builds on [US-4.10](US-4.10-on-demand-question-validation.md): câu dùng được (`DRAFT` + `VALIDATED`), run loại `VALIDATE`, `DRAFT → RETIRED`.
- Builds on [US-4.2](US-4.2-validator-and-question-bank-lock.md): `retireQuestion()`, trigger sau khóa, mã lý do `QUESTION_REJECT_REASONS`.
- Builds on [US-4.12](US-4.12-question-bank-ui-fixes-part-c.md): ô độ phủ mới, nhãn phần C.
- Sibling [US-4.9](US-4.9-question-bank-sample-review.md), [US-4.6](US-4.6-appeals-and-question-error-reports.md): cùng loại câu sau khóa bằng `retireQuestion()`. Màn danh sách câu ở story này dùng lại được cho màn duyệt mẫu của HR.

### What we explicitly did NOT do

- Không cho sửa nội dung câu. Câu sai thì loại rồi sinh câu khác.
- Không phân trang phía server; lọc và tìm ở client.

### References

- [Source: PRD › GĐ5 – Sinh và tổ chức bài test › Quy trình sinh đề](../../PRD.md)
- [Source: ARCHITECTURE › API architecture, Các bảng chính](../../ARCHITECTURE.md)
- [Source: CONTEXT D50, D60](../../CONTEXT.md)
- [Source: Epic EPIC-4](../epics/EPIC-4.md)

## Verification commands

| AC | Command |
|---|---|
| AC-1, AC-3 | `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/question-bank\.' --selectProjects integration` |
| AC-2 | Kiểm tay tab "Ngân hàng câu hỏi" ở 360 / 768 / 1024 px |
| AC-4 | `ai-service/.venv/Scripts/pytest ai-service/tests/agents/test_test_generator.py` |

## Changelog entry

### Added
- Tab "Ngân hàng câu hỏi" có mục "Câu hỏi": Trung tâm xem mọi câu đã sinh (đáp án, giải thích, rubric, kết quả kiểm), lọc và tìm, và loại câu sai kèm lý do.

### Changed
- Tab "Ngân hàng câu hỏi" chia thành Tổng quan, Câu hỏi, Ma trận đề.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [CONTEXT D60](../../CONTEXT.md)
- [Epic EPIC-4](../epics/EPIC-4.md)
- [US-4.10 Kiểm câu bằng AI khi Trung tâm yêu cầu](US-4.10-on-demand-question-validation.md)
- [US-4.12 Sửa giao diện ngân hàng, phần C](US-4.12-question-bank-ui-fixes-part-c.md)
- [US-4.9 Duyệt mẫu ngân hàng câu hỏi](US-4.9-question-bank-sample-review.md)
