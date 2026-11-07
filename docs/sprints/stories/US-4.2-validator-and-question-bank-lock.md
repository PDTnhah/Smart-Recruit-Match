---
id: US-4.2
title: "Validator và khóa ngân hàng câu hỏi"
epic: EPIC-4
status: review
priority: P0
points: 8
sprint: sprint-2026-W45
version_shipped: 0.21.0
prd_ref: [FR-18]
depends_on: [US-4.1]
assignee:
commit: a860c67
created: 2026-10-07
updated: 2026-11-07
---

## Story refresh — 2026-11-06 (bắt đầu story)

Người dùng chốt bốn điểm mở theo cột Đề xuất ([CONTEXT D50](../../CONTEXT.md)): câu tự luận gửi Validator đề và tên tiêu chí; chỉ CENTER khóa ngân hàng, bằng tay; JD có phiên bản yêu cầu mới thì phải lưu lại ma trận; độ khó chỉ bị loại khi lệch 2 bậc. Thêm AC-11. Validator chạy trong job `QUESTIONS_GENERATE` (không có `pipeline.py`). Nâng từ 5 lên 8 điểm. Nhánh `us-4.2` từ `dev` `907473b`.

## Goal

Chỉ câu đã qua Validator mới được dùng để rút đề; câu sai bị loại và được sinh bù. Ngân hàng đủ câu thì Trung tâm khóa; sau đó mọi thay đổi đều tăng phiên bản và ghi nhật ký. Phòng thi ([US-4.3](US-4.3-exam-room.md)) có một ngân hàng ổn định, kèm seed cho test và demo.

## Background

PRD › GĐ5 bước 2 và 4, phần còn lại của FR-18. ARCH › *Pipeline › Validator*: ngữ cảnh độc lập, không kèm đáp án, `effort: high`; code quyết định (D2). Seed theo EPIC-4 › *Cross-story testing requirements*.

Quyết định liên quan: D2, D8, D12, D33, D34, D49, D50.

**Lessons applied**: §6, §7, §12, §15, §19, §21, §22, §25 (nút khóa gửi `row_version` của view lúc mở hộp thoại), §30, §31 (ghi lại fixture khi lên `test_generator/v2`), §32, §33, §36.

## Acceptance criteria

- [x] **AC-1** — Request của Validator: mỗi câu chỉ có `ref`, loại, kỹ năng, nhãn độ khó, đề, cộng phương án không kèm cờ đúng (MCQ) hoặc tên tiêu chí rubric (ESSAY). Không có `answer_key`, giải thích, đáp án mẫu, `max_points`. Test chụp request qua `LLMClient` ở chế độ fixture.
- [x] **AC-2** — Mỗi lượt là một `LLMClient.generate` mới cho một nhóm câu (≤ 15 MCQ hoặc ≤ 5 tự luận), không có tin nhắn nào của Generator. Prompt `validator/v1`, `effort: high`, structured output `ValidationBatch` (`correct_options` tự giải, từng mục checklist, `note`).
  - Nhóm bị `LLM_REFUSED` thì gửi lại từng câu; câu vẫn bị từ chối thì loại với `VALIDATOR_REFUSAL`, không đọc nội dung.
  - Nhóm bị `LLM_INVALID_OUTPUT` thì chia đôi gửi lại; câu gửi riêng vẫn sai thì còn chờ, job chạy tiếp. Ngân sách được kiểm trước mỗi lượt gửi lại.
- [x] **AC-3** — `verdict.py` loại câu kèm mọi mã nó trượt: `ANSWER_MISMATCH` (không có phương án đúng, hoặc khác `answer_key`), `MULTIPLE_CORRECT`, `OFF_SKILL`, `ANSWER_LEAKED`, `WEAK_DISTRACTORS` (MCQ), `UNCLEAR`, `RUBRIC_MISMATCH` (ESSAY), `DIFFICULTY_MISMATCH` (lệch ≥ 2 bậc; lệch 1 bậc vẫn nhận, ước lượng lưu trong `validation`), `DUPLICATE` (cùng ý một câu đạt đứng trước trong request).

  **And** chỉ câu qua hết mới `VALIDATED` **And** câu thiếu kết quả còn chờ, được kiểm lại ở vòng sau.
- [x] **AC-4** — `get_blueprint_coverage()` chỉ đếm `VALIDATED`; Generator sinh bù đúng các ô thiếu; prompt `test_generator/v2` kèm lý do loại. Dừng khi mọi ô có ≥ 3× câu `VALIDATED`, hoặc chạm `MAX_ROUNDS` / `MAX_TOKENS_PER_JOB` (một vòng = sinh + kiểm) thì `PARTIAL` kèm ô thiếu.

  **And** draft chưa kiểm của run trước được kiểm trước vòng đầu, mỗi ô chỉ gửi số câu đủ đưa ô lên 4× **And** `CELL_FULL` không đếm câu bị loại **And** câu gửi `MAX_CHECKS_PER_DRAFT` (2) lần vẫn chưa có kết quả thì ô sinh câu khác thay.
- [x] **AC-5** — Kết quả kiểm định lưu ở `ai.question_validations` và `questions.validation`, kèm `model`, `prompt_version`. `DRAFT` → `VALIDATED`/`REJECTED` qua `transitionTo`, audit cùng giao dịch, actor hệ thống. Message trùng không đổi thêm gì.
- [x] **AC-6** — `CENTER` gọi `POST /api/question-banks/{id}/lock` `{ rowVersion }` khi mọi ô có ≥ 3× `VALIDATED`: `OPEN → LOCKED` qua `transitionTo`, `locked_at` trong cùng UPDATE, `version` giữ nguyên, có audit.

  **And** `409`: `QUESTION_BANK_INCOMPLETE` (kèm ô thiếu), `QUESTION_GENERATION_RUNNING`, `QUESTION_BANK_JD_OUTDATED`, `QUESTION_BANK_LOCKED` **And** `HR`/`STUDENT` nhận `403` **And** hai yêu cầu cùng `row_version` thì một yêu cầu nhận `409`.
- [x] **AC-7** — Ngân hàng đã khóa: trigger DB từ chối INSERT/DELETE câu và UPDATE cột ngoài `status`/`row_version`/`updated_at` (Nguyên tắc 11). Status chỉ được `VALIDATED → RETIRED`; ma trận, `locked_at`, trạng thái ngân hàng không đổi được, `version` chỉ tăng. `retireQuestion()` tăng `version` lên 1 và ghi audit trong cùng giao dịch.
- [x] **AC-8** — `QuestionBankService.getDrawableQuestions(bankId)` trả `{ bankId, version, blueprint, questions }`: câu `VALIDATED` của các ô trong ma trận, ngân hàng đã khóa; `answer_key` chỉ dùng phía server. Chưa khóa thì `409 BANK_NOT_LOCKED`.
- [x] **AC-9** — Seed `apps/api/src/db/seed/locked-question-bank.ts` (`pnpm --filter @srm/api db:seed:question-bank`, hàm `seedLockedQuestionBank(db)` cho test): một đợt, một JD đã duyệt, một ngân hàng đã khóa với câu `VALIDATED` đủ 3× mỗi ô của ma trận mặc định. Tất định, không gọi LLM, chạy hai lần không trùng.
- [ ] **AC-10** — Tab "Ngân hàng câu hỏi" hiện số câu Đạt / Bị loại / Chờ kiểm từng ô; mã lý do loại kèm nhãn tiếng Việt; nút "Khóa ngân hàng" có xác nhận, bị tắt kèm lý do khi chưa khóa được; `version`, `locked_at` sau khi khóa. **And** dùng được ở 360 / 768 / 1024 px (kiểm tay; Playwright để US-6.6).
- [x] **AC-11** — JD có phiên bản yêu cầu mới (BR-18, `question_banks.jd_version` cũ hơn JD) và ngân hàng chưa khóa: khóa và "Sinh câu còn thiếu" nhận `409 QUESTION_BANK_JD_OUTDATED`; màn hình báo cần lưu lại ma trận; `PUT` ma trận gỡ chặn; câu của kỹ năng đã bỏ không được tính. **And** ngân hàng đã khóa giữ nguyên; Trung tâm đã nhận thông báo `JD_REQUIREMENTS_VERSIONED`.

## Tasks

- [x] **TASK-4.2.1** — Trạng thái, hợp đồng, DB (AC: 5–7), phiên 2a: `states/question.ts`, `question-bank.ts`; `QuestionValidation`, view mở rộng, `LockQuestionBankRequestSchema`, `contracts:gen`; migration `0030`, `0031` (trigger); `transitionTo({ set })`.
- [x] **TASK-4.2.2** — Backend (AC: 5–8, 11), phiên 2a: handler ghi kết quả; `domain/lock-readiness.ts`; `lock()`, `retireQuestion()`, `getDrawableQuestions()`; controller `question-banks`; integration test.
- [x] **TASK-4.2.3** — Agent Validator (AC: 1–3), phiên 2b: `app/agents/validator/`, prompt `validator/v1`.
- [x] **TASK-4.2.4** — Test Generator gọi Validator (AC: 4), phiên 2b: độ phủ theo kiểm định, prompt `test_generator/v2`, fixture, test.
- [x] **TASK-4.2.5** — Seed (AC: 9), phiên 2c: `db/seed/locked-question-bank.ts`, script, `locked-question-bank-seed.int-spec.ts`.
- [ ] **TASK-4.2.6** — Giao diện (AC: 10, 11), phiên 2c
  - [x] 4.2.6.1 — Đọc `DESIGN.md`, ghi `Design applied`.
  - [x] 4.2.6.2 — `features/center/question-bank/`: ô ma trận theo status và lý do, thẻ khóa + `AlertDialog`, banner JD có phiên bản mới, `useLockQuestionBank`.
  - [ ] 4.2.6.3 — Kiểm tay ở 360 / 768 / 1024 px (người dùng, checklist ở *Implementation notes*).

## Dev notes

### Architecture constraints

AD-2 (code quyết định verdict), AD-4 (AI Service chỉ ghi `ai.*`; `core.questions` do backend ghi khi nhận `ai.results`), AD-8 (`transitionTo` + audit + `row_version` cho câu và ngân hàng), AD-10, AD-12, Nguyên tắc 8 (`answer_key` không xuống client). Thiết kế chi tiết: CONTEXT D50.

### Giới hạn đã biết

- BR-18 với ngân hàng đã khóa: chưa có đường mở khóa hay sinh ngân hàng mới.
- `retireQuestion()` trên ngân hàng đã khóa không kiểm lại BR-05: loại nhiều câu có thể làm một ô còn ít hơn số câu mỗi đề. US-4.3 phải kiểm mỗi ô đủ câu khi rút đề; US-4.6, US-4.9 quyết có chặn loại hay không.
- Handler kết quả chạy `transitionTo` từng câu một, trong khóa dòng ngân hàng. Kết quả đầu tiên sau migration mang verdict của mọi draft cũ (≤ 1000), nên giữ khóa vài giây. Chấp nhận vì chỉ xảy ra một lần mỗi ngân hàng.
- Duyệt mẫu US-4.9 đặt trước hay sau khi khóa đều chạy được, vì `retireQuestion()` dùng được cả hai lúc.

### Cross-story dependencies

- **Builds on**: US-4.1 (bảng câu hỏi, `QuestionBankTools`, consumer, tab); US-1.2 (`transitionTo`, audit).
- **Required by**: US-4.3 (`getDrawableQuestions()`, seed, chặn thi khi chưa khóa); US-4.6, US-4.9 (`retireQuestion()`, thêm endpoint); US-6.3 (tỷ lệ câu hợp lệ từ `ai.question_validations`); US-6.6 (seed demo, Playwright).

### Performance budget

ARCH ước tính ~2,9 USD mỗi ngân hàng, gồm Validator. `MAX_TOKENS_PER_JOB` = 600K là số đề xuất: đo lại bằng `ai.llm_calls` sau một lần chạy thật, kèm tỷ lệ câu bị loại.

### References

PRD › GĐ5, FR-18, *Risks*, BR-18 · ARCHITECTURE › *Pipeline › Test Generator, Validator*, *Quản lý trạng thái*, *Các bảng chính* · CONTEXT D2, D8, D12, D49, D50 · [EPIC-4](../epics/EPIC-4.md).

## Verification commands

| AC | Command |
|---|---|
| AC-1–AC-4 | `ai-service/.venv/Scripts/pytest ai-service/tests/agents/test_validator.py ai-service/tests/agents/test_test_generator.py` (`test_gd5_*`) |
| AC-5 | `pnpm --filter @srm/shared test` (`states/__tests__/question*.spec.ts`) + `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/question-validation' --selectProjects integration` |
| AC-6–AC-8, AC-11 | Như trên với `'test/integration/(question-bank-lock\|question-bank\|transition-to\|ai-service-role)'`; `pnpm --filter @srm/api test:unit` (`lock-readiness.spec.ts`, `blueprint.spec.ts`) |
| AC-9 | Như trên với `'test/integration/locked-question-bank-seed'`; chạy tay `db:seed:question-bank` hai lần |
| AC-10 | Kiểm tay theo checklist trong *Implementation notes* |

## Changelog entry

### Added
- Validator kiểm từng câu nháp trong ngữ cảnh độc lập, không kèm đáp án: tự giải rồi code so đáp án. Câu sai bị loại kèm mã lý do và được sinh bù theo ô thiếu.
- Khóa ngân hàng câu hỏi (`OPEN → LOCKED`, `locked_at`, `version`), chỉ khi mọi ô đủ câu đã kiểm định. Sau khi khóa, trigger DB chặn sửa câu; loại câu thì tăng phiên bản và ghi nhật ký.
- Seed ngân hàng câu hỏi đã khóa cho test và demo, không gọi LLM.

**Commit**: a860c67

## Implementation notes

- Khác plan, phiên 2a: khóa chỉ ghi audit `TRANSITION` (cột `set` nằm trong `after`), không có action `QUESTION_BANK_LOCKED`. Thứ tự mã lý do theo `QUESTION_REJECT_REASONS`, chép sang `question_bank.json` › `reject_reasons` cho `verdict.py`.
- Khác plan, phiên 2b: `ValidationBatch` ở `app/agents/validator/schemas.py` (repo không có `app/schemas/`). Không sửa adapter nên không dùng skill `claude-api`. 3 fixture `test_generator/` ghi lại cho v2.
- Khác plan, phiên 2c: seed dùng JD Backend Java riêng (Java 3, SQL 2, Spring Boot 1, đủ ba độ khó), 66 câu. JD và câu chèn thẳng ở trạng thái đích như `seedDev`; chỉ bước khóa đi qua `transitionTo` (audit `SYSTEM`). Hộp thoại khóa gặp `409` thì đóng, `toast.error` và tải lại view; lỗi khác hiện trong hộp thoại.
- Phiên 3 (2026-11-07): `/code-review` nêu 10 điểm, sửa 6, ba điểm ghi ở *Giới hạn đã biết*, một điểm là cỡ story:
  - Validator chia đôi nhóm sai schema, kiểm ngân sách trước mỗi lượt gửi lại; mỗi ô chỉ gửi số câu chờ nó cần; câu gửi 2 lần chưa có kết quả thì ô sinh câu khác thay (LESSONS §37);
  - `lock()` đọc lại phiên bản JD trong giao dịch, `FOR SHARE` (`JdService.getForQuestionBank(jdId, { tx })`, LESSONS §38);
  - `getDrawableQuestions` bỏ câu của ô không còn trong ma trận (`blueprintCellFilter`).
  - koni-qc: AC-1–9, 11 đều có test. Thêm test lưu yêu cầu JD lúc đang khóa (đỏ khi bỏ `FOR SHARE`), rút đề sau khi bỏ kỹ năng, body sai `400`. Đã rà: không route nào trả `answer_key` (`GET`/`POST` chỉ trả view độ phủ); `HR`/`STUDENT` nhận `403`.
- **Design applied**: §1, §3 (`tabular-nums`), §4, §6 (`card`, `alert`, `alert-dialog`, `badge`, `table`, `progress`; đã ghi quy ước khóa ngân hàng vào §6), §7, §9, §10 (`formatDateTime`), §11 (lý do loại và lý do tắt nút bằng chữ).
- **Kiểm tay AC-10** (người dùng; Trung tâm thiết kế cho ≥ 1024 px, dùng được ở 768 px, 360 px chỉ cần không vỡ). `db:seed:question-bank` cho trạng thái đã khóa; các trạng thái chưa khóa cần một lượt sinh với key thật:
  1. Đã khóa: badge "Đã khóa", giờ khóa, phiên bản 1; không còn nút sinh, sửa ma trận.
  2. Có ô thiếu: ô hiện Đạt x/y, Bị loại, Chờ kiểm, lý do loại tiếng Việt, badge "Thiếu n"; nút khóa tắt, có lý do.
  3. Đang sinh: nút khóa tắt, lý do "AI đang sinh và kiểm câu".
  4. JD có phiên bản mới: banner có nút "Sửa ma trận"; nút sinh và nút khóa tắt; lưu lại ma trận thì hết chặn.
  5. Đủ câu: hộp thoại xác nhận, khóa xong có toast. Mở hộp thoại ở hai tab, khóa ở tab 1 rồi xác nhận ở tab 2: toast lỗi, view tải lại.
  6. Ở 360 / 768 / 1024 px: không cuộn ngang ngoài vùng bảng; nút cao 44 px khi giả lập cảm ứng; hộp thoại vừa màn.
- Còn chờ người dùng: `db:migrate` `0030`–`0031`; `evals/smoke_llm.py --bank` với key thật (token, chi phí, tỷ lệ loại); kiểm tay AC-10 (xong thì `[x]` AC-10, 4.2.6.3, TASK-4.2.6, story `done`).

## Files modified

- Tài liệu: story, CONTEXT D50, ARCHITECTURE, DESIGN §6, LESSONS §37–§38, AGENTS › *Mẫu có sẵn*, CHANGELOG, EPIC-4, W45.
- `packages/shared` (states, contracts, schemas) + output `contracts:gen`.
- `apps/api`: `drizzle/0030`–`0031`, `common/state`, `common/errors`, `db` (schema, lifecycles, seed), module `assessment`, `company` (`getForQuestionBank` với `tx`), test.
- `apps/web`: `shared/api`, `features/center/question-bank/`.
- `ai-service`: `app/agents/validator/` (mới), `agents/test_generator/`, `consumers/errors.py`, `llm/structured.py`, `prompts/`, `worker.py`, `handlers/`, `evals/smoke_llm.py`, test, fixture.

## Cross-references

- [PRD FR-18](../../PRD.md#functional-requirements)
- [Epic EPIC-4](../epics/EPIC-4.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D50](../../CONTEXT.md)
- [US-4.1 Ma trận đề và Test Generator](US-4.1-exam-blueprint-test-generator.md)
- [US-4.3 Phòng thi](US-4.3-exam-room.md)
