---
id: US-4.10
title: "Tách Validator khỏi job sinh câu: AI kiểm câu khi Trung tâm yêu cầu"
epic: EPIC-4
status: review
priority: P0
points: 8
sprint: sprint-2026-W47
version_shipped: 0.28.0
prd_ref: [FR-18]
depends_on: [US-4.2]
assignee: PDTnhah
commit:
created: 2026-11-19
updated: 2026-11-19
---

## Goal

Sinh ngân hàng câu hỏi tốn ít request hơn. Job sinh câu chỉ sinh câu và kiểm bằng code, không gọi Validator ở mỗi vòng. AI chỉ kiểm câu khi Trung tâm bấm "Kiểm câu bằng AI". Câu chưa kiểm vẫn dùng được, nên ngân hàng khóa được mà không cần chờ AI kiểm.

## Background

Ngân hàng của JD 5 (20 ô phần A, 2 ô phần B; `reports/2026-11-19-bank-3-questions.md`) tốn khoảng 20 request. Theo [CONTEXT D50](../../CONTEXT.md), mỗi vòng của job `QUESTIONS_GENERATE` gồm một lượt sinh và một lượt Validator; job nhắm 4× câu mỗi ô và sinh bù câu bị loại. Người dùng muốn bỏ bước kiểm khỏi job sinh câu: việc kiểm có thể làm sau, bởi bên khác. Ngày 2026-11-19 người dùng chốt ([CONTEXT D60](../../CONTEXT.md)):

- Validator tách thành một nút riêng, chạy như một job riêng khi Trung tâm bấm.
- Trung tâm xem toàn bộ câu và loại câu sai bằng tay ([US-4.11](US-4.11-question-bank-browser-and-rejection.md)). HR hoặc giảng viên duyệt mẫu ([US-4.9](US-4.9-question-bank-sample-review.md)); sinh viên báo lỗi ([US-4.6](US-4.6-appeals-and-question-error-reports.md)).

Ước tính cho JD 5 khi nhắm 3× và code không từ chối câu nào: 60 câu trắc nghiệm, mỗi lượt 15 câu, là 4 lượt; 6 câu tự luận, mỗi lượt 5 câu, là 2 lượt. Tổng khoảng 6 request thay vì 20. Kiểm bằng AI (khoảng 8 request cho 96 câu) chỉ chạy khi Trung tâm bấm.

D50 từng loại phương án "job `QUESTIONS_VALIDATE` riêng" vì vòng sinh bù phải đi qua backend. Nay job không còn tự sinh bù sau khi kiểm: Trung tâm bấm "Sinh câu còn thiếu" khi ô thiếu, nên lý do đó không còn.

**Lessons applied**: §6 (commit cả `apps/api/drizzle`), §30 (view hay bảng mới trong `core` làm đỏ `core-schema`, `ai-service-role`), §31 (ghi lại fixture LLM khi đổi prompt hay hợp đồng), §32 (không kiểm chéo trên schema hợp đồng message), §33 (ghi `job_id` trước khi dispatch), §34 (nút chạy lại thay cho việc chỉ chạy một lần), §37 (nhóm lỗi tất định không gửi lại y nguyên), §47 (CRLF), §15, §21.

**Design applied**: DESIGN.md §6 `alert-dialog` (nút mở hộp thoại bị tắt thì lý do hiện ngay trên nút; `409` đóng hộp thoại, `toast.error`), `badge` (lượt kiểm "Đã kiểm xong" `default`, "Kiểm chưa hết" `secondary`; đang chạy và lỗi bằng `Alert`), `button` (`outline` cho hành động phụ, `Spinner` khi gửi).

## Acceptance criteria

- [x] **AC-1** — Job `QUESTIONS_GENERATE` không gọi Validator. Mỗi vòng chỉ có một lượt `LLMClient.generate`. Câu qua bước kiểm bằng code (`submit_questions()`) được lưu `DRAFT`, nghĩa là chưa ai kiểm nhưng dùng được.
  - Một ô đủ khi có ≥ 3× câu dùng được (`DRAFT` + `VALIDATED`). Câu `REJECTED` hay `RETIRED` không được đếm.
  - `QUESTION_BANK_FACTORS.target` giảm 4 → 3; `MAX_TOKENS_PER_JOB` giảm 600K → 400K (giá trị của D49); `MAX_ROUNDS`, `CELL_FULL` (5×) giữ nguyên.
  - Test bằng fixture: với ma trận mặc định, khi code không từ chối câu nào, số lượt LLM bằng số nhóm ô cần để phủ 3× (mỗi lượt ≤ 15 câu, ≤ 5 câu tự luận), không có lượt kiểm.
- [x] **AC-2** — **Given** CENTER và ngân hàng `OPEN` có câu `DRAFT` chưa có kết quả kiểm, **When** gọi `POST /api/jds/{id}/question-bank/validate`, **Then** nhận `202`. Backend tạo một run loại `VALIDATE`, ghi `job_id` trước khi dispatch, và phát job `QUESTIONS_VALIDATE` mang `draft_ids` của các câu đó (payload chỉ chứa ID, AD-5).
  - Đề xuất: thêm cột `kind` (`GENERATE` | `VALIDATE`) cho `question_generation_runs`. Partial unique (`bank_id`) WHERE `RUNNING` áp cho cả hai loại, nên không sinh và kiểm cùng lúc.
  - `409`: `QUESTION_BANK_LOCKED`, `QUESTION_GENERATION_RUNNING` (đang có run loại nào cũng vậy), `NOTHING_TO_VALIDATE` (đề xuất). `HR`, `STUDENT` nhận `403`.
- [x] **AC-3** — Validator giữ nguyên hành vi của D50, chỉ đổi chỗ chạy:
  - request không kèm đáp án;
  - nhóm ≤ 15 MCQ hoặc ≤ 5 tự luận, `effort: high`, prompt `validator/v1`;
  - refusal thì gửi lại từng câu; đầu ra sai schema thì chia đôi nhóm;
  - `verdict.py` quyết định.

  Job không sinh câu bù. Kết quả lưu ở `ai.question_validations`; backend đổi `DRAFT → VALIDATED | REJECTED` qua `transitionTo`, actor hệ thống, audit trong cùng giao dịch (dùng lại logic của `QuestionResultsHandler`). Câu không còn `DRAFT` lúc nhận kết quả thì giữ nguyên. Ngân sách token riêng cho job kiểm (đề xuất 300K).
- [x] **AC-4** — Khóa ngân hàng cần mỗi ô có ≥ 3× câu dùng được; câu chưa kiểm không chặn khóa. Hộp thoại khóa báo số câu chưa được AI hay người kiểm. Sau khi khóa:
  - `getDrawableQuestions` trả câu `DRAFT` và `VALIDATED` của các ô trong ma trận;
  - bảng chuyển trạng thái thêm `DRAFT → RETIRED`, và trigger của ngân hàng đã khóa cho phép bước này;
  - `retireQuestion()` nhận câu `DRAFT` như câu `VALIDATED` (tăng `version`, có audit).
- [ ] **AC-5** — Tab "Ngân hàng câu hỏi" ([US-4.2](US-4.2-validator-and-question-bank-lock.md) AC-10):
  - mô tả thẻ "Ngân hàng câu hỏi" viết lại: AI sinh câu theo ma trận và code kiểm định dạng, trùng lặp; việc kiểm nội dung là tùy chọn;
  - "Chờ kiểm" đổi thành "Chưa kiểm";
  - thêm nút "Kiểm câu bằng AI" (CENTER), có xác nhận; nút bị tắt kèm lý do khi ngân hàng đã khóa, đang có run, hoặc không còn câu chưa kiểm;
  - trạng thái của lượt kiểm gần nhất (đang chạy, xong, lỗi) hiện như lượt sinh;
  - lý do không khóa được `GENERATION_RUNNING` đổi chữ thành "AI đang sinh hoặc kiểm câu".
- [ ] **AC-6** — Đo lại số lượt gọi và token của một ngân hàng bằng `ai-service/evals/smoke_llm.py --bank` với key thật và dữ liệu giả; ghi kết quả vào *Implementation notes*.

## Tasks

- [x] **TASK-4.10.1** — Hợp đồng và DB (AC: 1, 2, 4)
  - [x] Subtask 4.10.1.1 — `packages/shared/contracts/questions.ts`: `QUESTION_BANK_FACTORS.target = 3`; hợp đồng `QuestionsValidateJob` (`job_id`, `bank_id`, `draft_ids`) và `QuestionsValidateOutput`; `pnpm contracts:gen`.
  - [x] Subtask 4.10.1.2 — `packages/shared/states/question.ts`: `DRAFT → RETIRED`. Schema độ phủ: số câu dùng được.
  - [x] Subtask 4.10.1.3 — Migration: cột `question_generation_runs.kind`; CHECK `ai.jobs.type` thêm `QUESTIONS_VALIDATE`; trigger ngân hàng đã khóa cho `DRAFT → RETIRED`; `db:generate`.
- [x] **TASK-4.10.2** — ai-service (AC: 1, 3)
  - [x] Subtask 4.10.2.1 — `app/agents/test_generator/`: bỏ bước Validator khỏi vòng lặp; `get_blueprint_coverage()` đếm câu chưa bị loại; `MAX_TOKENS_PER_JOB`; `MAX_CHECKS_PER_DRAFT` chuyển sang job kiểm.
  - [x] Subtask 4.10.2.2 — Handler `QUESTIONS_VALIDATE` dùng `app/agents/validator/`, đăng ký qua `build_handlers`; consumer trong worker.
  - [x] Subtask 4.10.2.3 — Prompt `test_generator/v2` còn đúng thì giữ, không thì tạo `v3` (không sửa bản đã phát hành); ghi lại fixture.
- [x] **TASK-4.10.3** — Backend (AC: 2, 3, 4)
  - [x] Subtask 4.10.3.1 — Endpoint `validate`, run loại `VALIDATE`, handler kết quả kiểm.
  - [x] Subtask 4.10.3.2 — `domain/lock-readiness.ts`, `domain/blueprint.ts` (độ phủ), `domain/drawable-bank.ts`, `retireQuestion()`.
- [ ] **TASK-4.10.4** — Web (AC: 5)
  - [x] Subtask 4.10.4.1 — Đọc `DESIGN.md` trước khi code; ghi `Design applied: …`.
  - [x] Subtask 4.10.4.2 — `apps/web/src/features/center/question-bank/`: nút và thẻ "Kiểm câu bằng AI", nhãn mới, hộp thoại khóa.
- [x] **TASK-4.10.5** — Test (AC: 1–4)
  - [x] Subtask 4.10.5.1 — pytest: `tests/agents/test_test_generator.py` (không có lượt kiểm, số lượt), `test_validator.py` (chạy trong job riêng).
  - [x] Subtask 4.10.5.2 — Unit: `lock-readiness.spec.ts`, `blueprint.spec.ts`, `draw-exam.spec.ts`.
  - [x] Subtask 4.10.5.3 — Integration: `question-validation.int-spec.ts` (endpoint, `409`, kết quả kiểm), `question-bank-lock.int-spec.ts` (khóa khi còn câu `DRAFT`, `DRAFT → RETIRED` sau khóa).
- [ ] **TASK-4.10.6** — `smoke_llm --bank` với key thật (AC: 6), người dùng chạy.

## Dev notes

### Architecture constraints

- AGENTS › Nguyên tắc 1, 2: LLM chỉ trả verdict; code quyết định `VALIDATED`/`REJECTED` (`verdict.py`) và đếm độ phủ.
- AGENTS › Nguyên tắc 3: AI Service chỉ ghi schema `ai`; danh sách câu cần kiểm đi trong payload (`draft_ids`), không đọc trạng thái từ `core.questions`.
- AGENTS › Nguyên tắc 10, 11: đổi trạng thái qua `transitionTo` + audit; trigger giữ ngân hàng đã khóa.
- AGENTS › Nguyên tắc 14, 15: hợp đồng mới viết một lần bằng Zod; job idempotent theo `job_id`.
- Kiểm bằng AI không chạy trên ngân hàng đã khóa: trigger chặn sửa `validation` sau khi khóa.

### Cross-story dependencies

- Builds on [US-4.1](US-4.1-exam-blueprint-test-generator.md), [US-4.2](US-4.2-validator-and-question-bank-lock.md): vòng lặp sinh câu, Validator, khóa, trigger, `getDrawableQuestions`.
- Ảnh hưởng [US-4.3](US-4.3-exam-room.md): phòng thi rút cả câu `DRAFT` của ngân hàng đã khóa. Seed `seedLockedQuestionBank` giữ câu `VALIDATED`, vẫn đúng.
- Sibling [US-4.11](US-4.11-question-bank-browser-and-rejection.md): Trung tâm loại câu bằng tay; Generator không đếm câu bị Trung tâm loại.
- Sibling [US-4.12](US-4.12-question-bank-ui-fixes-part-c.md): ô độ phủ mới, hiện số câu dùng được.
- [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md): tỷ lệ câu hợp lệ từ `ai.question_validations` chỉ có khi Trung tâm đã chạy kiểm bằng AI.

### What we explicitly did NOT do

- Không xóa agent Validator, bảng `ai.question_validations`, cột `questions.validation`; dữ liệu cũ giữ nguyên.
- Không tự kiểm sau khi sinh và không tự sinh bù sau khi kiểm. Trung tâm bấm từng bước.
- Không đổi tên trạng thái `VALIDATED`: giữ nghĩa "AI đã kiểm đạt" để không phải chuyển dữ liệu.

### References

- [Source: PRD › GĐ5 – Sinh và tổ chức bài test › Quy trình sinh đề](../../PRD.md)
- [Source: PRD › Functional Requirements (FR-18)](../../PRD.md#functional-requirements)
- [Source: ARCHITECTURE › Pipeline › Test Generator, Hàng đợi, Các bảng chính](../../ARCHITECTURE.md)
- [Source: CONTEXT D49, D50, D60](../../CONTEXT.md)
- [Source: Epic EPIC-4](../epics/EPIC-4.md)

## Verification commands

| AC | Command |
|---|---|
| AC-1, AC-3 | `ai-service/.venv/Scripts/pytest ai-service/tests/agents/test_test_generator.py ai-service/tests/agents/test_validator.py` |
| AC-2, AC-3 | `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/question-validation' --selectProjects integration` |
| AC-4 | `pnpm --filter @srm/api exec jest --testPathPatterns 'lock-readiness\|draw-exam\|blueprint' --selectProjects unit`; `... --testPathPatterns 'test/integration/question-bank-lock' --selectProjects integration` |
| AC-5 | Kiểm tay tab "Ngân hàng câu hỏi" ở 360 / 768 / 1024 px |
| AC-6 | `ai-service/.venv/Scripts/python ai-service/evals/smoke_llm.py --bank` (key thật, dữ liệu giả) |

## Changelog entry

### Changed
- Job sinh câu hỏi không còn gọi Validator ở mỗi vòng; ngân hàng nhắm 3× số câu mỗi ô. Câu qua kiểm bằng code dùng được ngay, khóa ngân hàng không cần chờ AI kiểm.

### Added
- Nút "Kiểm câu bằng AI": Trung tâm chạy Validator trên các câu chưa kiểm như một job riêng (`POST /api/jds/{id}/question-bank/validate`).

**Commit**: —

## Implementation notes

Một phiên ngày 2026-11-19 (Plan + Execute + Self-verify + Doc/Version gate), nhánh `us-4.10` từ `dev` `15eac38`. Chưa chạy `/code-review` và cả bộ `pnpm test` trước commit (người dùng bảo commit).

- **Hợp đồng.** Job ở `jobs.ts`, output ở `envelope.ts` (cạnh job sinh), `QuestionVerdict` ở `questions.ts`. `MissingCell.usable` bắt buộc; migration điền `usable = validated` cho `missing_cells` cũ. `CellCoverage.usable` = DRAFT + VALIDATED, `pending` vẫn là "chưa kiểm". View có `run` (GENERATE mới nhất) và `validationRun` (VALIDATE mới nhất).
- **DB.** `questions_validation_check` thành `status = 'RETIRED' or (status = 'DRAFT') = (validation is null)`: câu `DRAFT → RETIRED` không có kết quả kiểm. Trigger viết lại bằng `CREATE OR REPLACE`, chỉ đổi điều kiện cho phép.
- **API.** `validate()` chỉ gửi câu `DRAFT` của các ô còn trong ma trận (`blueprintCellFilter`). `generate()` gặp run `VALIDATE` đang chạy thì `409` (trước đây trả run đang chạy). JD có yêu cầu mới không chặn kiểm. `questions_received` của run `VALIDATE` là số câu đã đổi trạng thái.
- **ai-service.** `TestGenerator` chỉ đọc kết quả kiểm đã lưu (`QuestionValidationRepo`) để bỏ câu bị loại và đưa chúng kèm lý do vào prompt. `BankValidator` (`validator/job.py`) bỏ qua câu đã có kết quả, gom nhóm mới cho câu thiếu kết quả rồi gửi lại, tối đa 2 lượt; ngân sách 300K riêng.
- **Prompt `test_generator/v3`**: v2 ghi "A separate reviewer checks every question before any student sees it", không còn đúng. Fixture mới dùng lại câu trả lời của fixture v2; fixture kiểm 8 câu trắc nghiệm gộp hai fixture kiểm cũ; fixture kiểm 3 câu tự luận giữ nguyên (request trùng).
- **Self-verify.** typecheck, lint, depcruise sạch; unit shared 403, API 618; pytest 514, ruff; integration `question-validation`, `question-bank-lock`, `question-bank`, `core-schema`, `ai-service-role`, `locked-question-bank-seed`, `exam-room`, `grading` xanh. Chưa chạy cả bộ `pnpm test` (compose đang bật, LESSONS §15).
- **Còn chờ.** `/code-review`; người dùng `db:migrate` `0043`; AC-6 `smoke_llm --bank` với key thật (ghi số lượt, token vào đây); AC-5 kiểm tay 360 / 768 / 1024 px: mô tả thẻ mới, "x câu dùng được (y đã kiểm đạt, z chưa kiểm)", ô "Chưa kiểm n"; nút "Kiểm câu bằng AI" tắt kèm lý do (đang chạy, đang sửa ma trận, hết câu chưa kiểm, đã khóa); trong lúc kiểm `Alert` "Đang kiểm câu" và hai nút kia tắt; xong thì badge; hộp thoại khóa nêu số câu chưa kiểm.

Lessons: none new — fixture mất khóa khi nâng prompt và CRLF đã có ở §31, §47.

## Files modified

- `packages/shared`: `contracts/` (+ `json-schema/`), `schemas/`, `states/`.
- `apps/api`: migration `0043` + snapshot, `db/schema/`, `common/errors/`, `aigateway/domain/`, `modules/assessment/`, `test/`.
- `ai-service`: `app/agents/test_generator/`, `app/agents/validator/`, `app/handlers/`, `app/consumers/`, `app/worker.py`, `app/contracts/`, `app/prompts/`, `evals/smoke_llm.py`, `tests/`.
- `apps/web`: `features/center/question-bank/`, `shared/api/`.
- Tài liệu: `DESIGN.md` §6, CHANGELOG, VERSION, `package.json` ×4, PRD, EPIC-4, W47.

## Cross-references

- [CONTEXT D60](../../CONTEXT.md)
- [Epic EPIC-4](../epics/EPIC-4.md)
- [US-4.2 Validator và khóa ngân hàng](US-4.2-validator-and-question-bank-lock.md)
- [US-4.11 Xem toàn bộ câu và loại câu sai](US-4.11-question-bank-browser-and-rejection.md)
- [US-4.12 Sửa giao diện ngân hàng, phần C](US-4.12-question-bank-ui-fixes-part-c.md)
