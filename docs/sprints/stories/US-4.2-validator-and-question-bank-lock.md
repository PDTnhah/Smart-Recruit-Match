---
id: US-4.2
title: "Validator và khóa ngân hàng câu hỏi"
epic: EPIC-4
status: backlog
priority: P0
points: 5
sprint:
version_shipped:
prd_ref: [FR-18]
depends_on: [US-4.1]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Chỉ câu đã qua Validator mới được dùng để rút đề. Câu sai đáp án, có nhiều đáp án đúng, lộ đáp án trong đề hoặc lệch độ khó bị loại và được sinh lại. Ngân hàng đủ câu thì Trung tâm khóa nó. Sau khi khóa, mọi thay đổi đều tăng phiên bản và ghi nhật ký. Từ đây phòng thi ([US-4.3](US-4.3-exam-room.md)) và các story sau có một ngân hàng ổn định để dùng, kèm seed ngân hàng đã khóa cho test và demo.

## Background

FR-18 gồm ba phần: sinh ngân hàng ([US-4.1](US-4.1-exam-blueprint-test-generator.md)), Validator kiểm định, khóa và ghi phiên bản ngân hàng. Story này làm hai phần sau. PRD › GĐ5 bước 2: Validator kiểm từng câu theo checklist (đúng chủ đề, chỉ một đáp án đúng, phương án nhiễu hợp lý, không trùng lặp, không lộ đáp án trong đề, độ khó khớp nhãn). Câu không đạt bị loại hoặc sinh lại. Bước 4: khóa ngân hàng, mọi thay đổi sau đó đều có phiên bản. PRD › *Risks* coi "câu hỏi test sai đáp án" là rủi ro, biện pháp là Validator tự giải lại.

ARCH › *Pipeline từng agent* mô tả Validator là workflow 1 lượt cho mỗi nhóm câu, **ngữ cảnh độc lập**: nhận câu hỏi **không kèm đáp án**, tự giải, rồi so với đáp án của Generator. Câu bị loại quay lại Generator ở vòng sau. ARCH › *Bản đồ sử dụng LLM* đặt `effort: high`. Theo D2, LLM chỉ trả verdict từng mục checklist và đáp án tự giải; code so đáp án và quyết định trạng thái câu.

Seed ngân hàng đã khóa là hạ tầng dùng chung (EPIC-4 › *Cross-story testing requirements*): US-4.3 trở đi và US-6.6 dùng nó để không phải gọi LLM khi test.

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** một câu nháp, **When** Validator dựng request, **Then** request chỉ chứa đề và phương án (trắc nghiệm) hoặc đề (tự luận). Không có `answer_key`, giải thích hay đáp án mẫu. Test chụp request đi qua `LLMClient` ở chế độ fixture và kiểm không có các trường đó.
- [ ] **AC-2** — Mỗi lượt gọi Validator là một hội thoại mới, không chứa tin nhắn của Generator. Prompt `ai-service/app/prompts/validator/v1.md`, `effort: high`, đầu ra theo structured output `ValidationResult` (đáp án tự giải, verdict từng mục checklist, lý do). `stop_reason == "refusal"` thì câu bị loại với lý do `VALIDATOR_REFUSAL`, không đọc nội dung.
- [ ] **AC-3** — **Given** kết quả Validator, **When** code tổng hợp, **Then** câu trắc nghiệm có đáp án tự giải khác `answer_key` bị loại với lý do `ANSWER_MISMATCH` **And** câu trượt bất kỳ mục checklist nào bị loại với mã lý do tương ứng (`MULTIPLE_CORRECT`, `WEAK_DISTRACTORS`, `OFF_SKILL`, `DIFFICULTY_MISMATCH`, `ANSWER_LEAKED`, `DUPLICATE`; mã đề xuất) **And** chỉ câu qua hết mới có `status = VALIDATED`.
- [ ] **AC-4** — **Given** một số ô thiếu câu sau khi loại, **When** pipeline chạy vòng tiếp, **Then** `get_blueprint_coverage()` chỉ đếm câu `VALIDATED` và Generator sinh bù cho đúng các ô thiếu **And** dừng khi mọi ô có ít nhất 3 lần số câu cần hoặc chạm số vòng tối đa (tham số); trường hợp sau trả `PARTIAL` kèm danh sách ô thiếu.
- [ ] **AC-5** — Kết quả kiểm định của mỗi câu lưu kèm `model` và `prompt_version` (đề xuất cột `questions.validation` JSONB). Đổi trạng thái câu (`DRAFT` → `VALIDATED`/`REJECTED`) đi qua `transitionTo` theo bảng chuyển trạng thái ở `packages/shared/states`, ghi `audit_logs` trong cùng giao dịch, actor là hệ thống.
- [ ] **AC-6** — **Given** người dùng `CENTER` và mọi ô có ít nhất 3 lần số câu cần ở trạng thái `VALIDATED`, **When** gọi `POST /api/question-banks/{id}/lock` (đề xuất), **Then** `locked_at` được đặt, `version` giữ nguyên, có audit **And** chưa đủ câu thì trả `409` kèm danh sách ô thiếu **And** `HR`/`STUDENT` nhận `403` **And** hai yêu cầu khóa đồng thời với cùng `row_version` thì một yêu cầu nhận `409`.
- [ ] **AC-7** — **Given** ngân hàng đã khóa, **When** có lệnh `UPDATE` nội dung, `answer_key` hoặc `rubric` của một câu trong ngân hàng, **Then** DB từ chối bằng trigger (AGENTS › Nguyên tắc 11) **And** chỉ được loại câu bằng chuyển trạng thái. Mỗi lần loại câu tăng `question_banks.version` lên 1 và ghi audit trong cùng giao dịch.
- [ ] **AC-8** — Module `assessment` export `QuestionBankService.getDrawableQuestions(bankId)` (đề xuất). Hàm chỉ trả câu `VALIDATED` của ngân hàng đã khóa; ngân hàng chưa khóa thì báo lỗi `BANK_NOT_LOCKED`.
- [ ] **AC-9** — Script seed `apps/api/src/db/seeds/locked-question-bank.ts` (đề xuất) tạo một đợt, một JD đã duyệt và một ngân hàng đã khóa. Ngân hàng có câu `VALIDATED` đủ 3 lần số câu mỗi ô của ma trận mặc định, sinh tất định, không gọi LLM. Chạy hai lần không sinh dữ liệu trùng.
- [ ] **AC-10** — **Given** Cán bộ Trung tâm mở ngân hàng, **When** kiểm định đang chạy hoặc đã xong, **Then** màn hình hiện số câu `VALIDATED`/`REJECTED` từng ô, mã lý do loại, nút khóa (bị vô hiệu kèm lý do khi chưa đủ câu), và sau khi khóa thì hiện `version`, `locked_at`.

## Tasks

- [ ] **TASK-4.2.1** — Đọc skill `claude-api` trước khi viết code gọi LLM (AC: 2)
  - [ ] Subtask 4.2.1.1 — Ghi vào Implementation notes cách dùng `output_config.format` (structured outputs) và `effort` cho Validator.
- [ ] **TASK-4.2.2** — Agent Validator (AC: 1, 2)
  - [ ] Subtask 4.2.2.1 — `ai-service/app/schemas/validation.py`: `ValidationResult`.
  - [ ] Subtask 4.2.2.2 — `ai-service/app/agents/validator/request.py`: dựng request từ câu nháp, bỏ `answer_key`, giải thích, đáp án mẫu.
  - [ ] Subtask 4.2.2.3 — `ai-service/app/prompts/validator/v1.md`: checklist cố định ở đầu, câu hỏi ở cuối trong thẻ dữ liệu riêng.
- [ ] **TASK-4.2.3** — Tổng hợp bằng code và vòng sinh lại (AC: 3, 4)
  - [ ] Subtask 4.2.3.1 — `ai-service/app/agents/validator/verdict.py`: so đáp án tự giải với `answer_key`, map checklist → mã lý do.
  - [ ] Subtask 4.2.3.2 — `ai-service/app/agents/test_generator/pipeline.py` (đề xuất): sinh → kiểm định → sinh bù theo ô thiếu, giới hạn số vòng.
- [ ] **TASK-4.2.4** — Trạng thái câu và ngân hàng (AC: 5)
  - [ ] Subtask 4.2.4.1 — `packages/shared/states/question.ts`, `packages/shared/states/question-bank.ts` (đề xuất): enum và bảng chuyển trạng thái, unit test.
  - [ ] Subtask 4.2.4.2 — `apps/api/src/modules/assessment/application/question-results.handler.ts`: ghi kết quả kiểm định qua `transitionTo` (US-1.2).
- [ ] **TASK-4.2.5** — Khóa, phiên bản và chặn sửa ở DB (AC: 6, 7, 8)
  - [ ] Subtask 4.2.5.1 — `apps/api/src/modules/assessment/api/question-bank.controller.ts`: `POST /api/question-banks/{id}/lock`, `@Roles('CENTER')`.
  - [ ] Subtask 4.2.5.2 — Migration `apps/api/drizzle/`: trigger chặn sửa nội dung câu của ngân hàng đã khóa; cột `row_version` cho `question_banks` (đề xuất).
  - [ ] Subtask 4.2.5.3 — `apps/api/src/modules/assessment/application/question-bank.service.ts`: `lock()`, `retireQuestion()` (tăng `version`), `getDrawableQuestions()`.
- [ ] **TASK-4.2.6** — Seed ngân hàng đã khóa (AC: 9)
  - [ ] Subtask 4.2.6.1 — `apps/api/src/db/seeds/locked-question-bank.ts`: dữ liệu câu hỏi tổng hợp cố định, idempotent.
- [ ] **TASK-4.2.7** — Màn hình kiểm định và khóa ở cổng Trung tâm (AC: 10)
  - [ ] Subtask 4.2.7.1 — Đọc `DESIGN.md` trước khi code, ghi `Design applied: …` vào story.
  - [ ] Subtask 4.2.7.2 — Mở rộng `apps/web/src/features/center/question-bank/` của US-4.1.
- [ ] **TASK-4.2.8** — Fixture và test (AC: 1, 2, 3, 4, 5, 6, 7)
  - [ ] Subtask 4.2.8.1 — `ai-service/tests/fixtures/validator/`: câu đúng, câu sai đáp án, câu hai đáp án đúng, câu lộ đáp án, `refusal`.
  - [ ] Subtask 4.2.8.2 — `ai-service/tests/agents/test_validator.py`, `apps/api/test/assessment/question-bank-lock.spec.ts`.

## Dev notes

### Architecture constraints

- [AD-2](../../ARCHITECTURE.md#architecture-decisions): LLM trả verdict từng mục và đáp án tự giải; code so đáp án và đặt trạng thái câu.
- [AD-4](../../ARCHITECTURE.md#architecture-decisions): AI Service không ghi `core.questions`. Trạng thái kiểm định đi về qua `ai.results`, Core Backend ghi.
- [AD-8](../../ARCHITECTURE.md#architecture-decisions): trạng thái câu và ngân hàng có bảng chuyển trạng thái riêng; mọi thay đổi đi qua `transitionTo` + audit + `row_version`.
- [AD-10](../../ARCHITECTURE.md#architecture-decisions), [AD-12](../../ARCHITECTURE.md#architecture-decisions): một model, `effort: high`, prompt có phiên bản, kết quả lưu `model` + `prompt_version`.
- Phương án cho Validator xem đáp án rồi "chấm" đáp án bị loại: ARCH yêu cầu ngữ cảnh độc lập, không kèm đáp án, để Validator không bị đáp án của Generator dẫn dắt.
- **Điểm chưa rõ trong spec — hỏi trước khi chốt:**
  - Với câu tự luận, PRD/ARCH không nói Validator nhận gì. Rubric có thể lộ ý đáp án. Story tạm cho Validator nhận đề và tên các tiêu chí rubric (không có mô tả mức điểm, không có đáp án mẫu), kiểm câu có rõ ràng, làm được trong thời gian và chấm được theo tiêu chí hay không.
  - Ai khóa ngân hàng và khi nào. Story tạm để Cán bộ Trung tâm khóa bằng tay. Đợt chuyển sang pha *Làm test* mà ngân hàng chưa khóa thì chưa rõ có tự khóa không.
  - Thứ tự với [US-4.9](US-4.9-question-bank-sample-review.md): PRD › GĐ5 đặt bước duyệt mẫu (tùy chọn) trước bước khóa, nhưng US-4.9 phụ thuộc US-4.2. Story này cho phép loại câu sau khi khóa (tăng phiên bản), nên hai thứ tự đều chạy được.
  - BR-18: sửa yêu cầu JD sau khi mở test thì tạo phiên bản JD mới. `question_banks` không có cột phiên bản JD; chưa rõ phiên bản JD mới có bắt sinh lại ngân hàng không.
  - Số vòng sinh lại tối đa và mức "đủ câu để khóa" (tạm 3 lần số câu cần) để thành tham số.

### Cross-story dependencies

- Builds on [US-4.1](US-4.1-exam-blueprint-test-generator.md): bảng `questions` (`DRAFT`), `ai.question_drafts`, công cụ `get_blueprint_coverage()`, consumer `ai.questions.generate`, màn hình `apps/web/src/features/center/question-bank/`.
- Builds on [US-1.2](US-1.2-core-db-schema-transition-audit-log.md): `transitionTo`, `audit_logs`, `row_version`.
- Required by [US-4.3](US-4.3-exam-room.md): `getDrawableQuestions()` và seed ngân hàng đã khóa.
- Required by [US-4.6](US-4.6-appeals-and-question-error-reports.md) và [US-4.9](US-4.9-question-bank-sample-review.md): `retireQuestion()` tăng phiên bản ngân hàng.
- Required by [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md) (đo tỷ lệ câu hợp lệ) và [US-6.6](US-6.6-demo-data-e2e-load-test.md) (seed demo).
- Sibling [US-3.3](US-3.3-shortlist-and-preferences.md) (cùng tuần T8): cả hai thêm bảng chuyển trạng thái vào `packages/shared/states`; merge theo thứ tự ở D20.

### References

- [Source: PRD › GĐ5 – Sinh và tổ chức bài test](../../PRD.md)
- [Source: PRD › Functional Requirements (FR-18)](../../PRD.md#functional-requirements)
- [Source: PRD › Risks](../../PRD.md#risks)
- [Source: ARCHITECTURE › Pipeline từng agent (Test Generator, Validator)](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Quản lý trạng thái](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Data architecture](../../ARCHITECTURE.md#data-architecture)
- [Source: CONTEXT D2, D8, D10, D12](../../CONTEXT.md)
- [Source: Epic EPIC-4](../epics/EPIC-4.md)

## Verification commands

> Chưa có `package.json`/`pyproject.toml`. Lệnh chạy cụ thể sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `ai-service/tests/agents/test_validator.py` › `test_gd5_request_has_no_answer_key_explanation_or_sample_answer` |
| AC-2 | `ai-service/tests/agents/test_validator.py` › `test_fresh_context_effort_high`, `test_refusal_rejects_question_without_reading_content` |
| AC-3 | `ai-service/tests/agents/test_validator.py` › `test_gd5_answer_mismatch_rejected`, `test_gd5_checklist_failures_map_to_reason_codes` |
| AC-4 | `ai-service/tests/agents/test_validator.py` › `test_gd5_regenerates_only_missing_cells_until_3x_or_round_limit` |
| AC-5 | `packages/shared/states/question.spec.ts` › `GĐ5 question transitions`; `apps/api/test/assessment/question-results.spec.ts` › `GĐ5 validation stored with model, prompt_version and audit in same transaction` |
| AC-6 | `apps/api/test/assessment/question-bank-lock.spec.ts` › `GĐ5 CENTER locks when every cell ≥ 3x; 409 with missing cells; HR/STUDENT 403; 409 on stale row_version` |
| AC-7 | `apps/api/test/assessment/question-bank-lock.spec.ts` › `GĐ5 DB trigger blocks content update in locked bank; retire bumps version with audit` |
| AC-8 | `apps/api/test/assessment/question-bank-lock.spec.ts` › `GĐ5 getDrawableQuestions returns only VALIDATED of locked bank; BANK_NOT_LOCKED otherwise` |
| AC-9 | `apps/api/test/seeds/locked-question-bank.spec.ts` › `seed creates locked bank covering default blueprint 3x; idempotent` |
| AC-10 | `apps/web/e2e/center-question-bank.spec.ts` (Playwright, đề xuất) › `GĐ5 validation counts, reasons, lock disabled until sufficient, version shown after lock` |

## Changelog entry

### Added
- Validator kiểm định từng câu nháp trong ngữ cảnh độc lập, không kèm đáp án: tự giải rồi so với đáp án bằng code; câu sai bị loại kèm mã lý do và được sinh bù theo ô thiếu.
- Khóa ngân hàng câu hỏi (`locked_at`, `version`): chỉ khóa khi mọi ô đủ câu; sau khóa không sửa được nội dung câu, loại câu thì tăng phiên bản và ghi nhật ký.
- Seed ngân hàng câu hỏi đã khóa cho test và demo, không gọi LLM.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-18](../../PRD.md#functional-requirements)
- [Epic EPIC-4](../epics/EPIC-4.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D2, D8, D12](../../CONTEXT.md)
- [US-4.1 Ma trận đề và Test Generator](US-4.1-exam-blueprint-test-generator.md)
- [US-4.3 Phòng thi](US-4.3-exam-room.md)
