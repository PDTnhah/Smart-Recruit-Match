---
id: US-4.11
title: "Tab Ngân hàng câu hỏi: xem toàn bộ câu và loại câu sai"
epic: EPIC-4
status: review
priority: P1
points: 5
sprint: sprint-2026-W47
version_shipped: 0.30.0
prd_ref: [FR-18]
depends_on: [US-4.10]
assignee: PDTnhah
commit: a7c932d
created: 2026-11-19
updated: 2026-11-20
---

## Goal

Trung tâm xem được toàn bộ câu AI đã sinh cho một JD, không chỉ ma trận của một đề. Trung tâm cũng loại được câu sai: trước khi khóa thì ô thiếu được sinh bù; sau khi khóa thì câu không còn được rút. Đây là bước kiểm bằng người, thay cho Validator chạy tự động ([US-4.10](US-4.10-on-demand-question-validation.md)).

## Background

Tab `?tab=question-bank` chỉ có thẻ sinh câu, thẻ khóa và bảng ma trận của một đề kèm độ phủ, nên người dùng tưởng đang xem một đề. Không có chỗ xem nội dung câu, chưa có API liệt kê câu của ngân hàng: để xem 96 câu của JD 5 phải xuất báo cáo riêng.

Ngày 2026-11-19 người dùng chốt ([CONTEXT D60](../../CONTEXT.md)): Trung tâm xem mọi câu và được loại câu sai. Validator chỉ chạy khi Trung tâm bấm (US-4.10). [US-4.9](US-4.9-question-bank-sample-review.md) (HR duyệt mẫu) và [US-4.6](US-4.6-appeals-and-question-error-reports.md) (SV báo lỗi) giữ nguyên.

**Lessons applied**: §25 (hộp thoại gửi `row_version` của lúc mở), §43 (mọi UPDATE của `questions` tăng `row_version`), §44 (việc sau commit lỗi thì không trả 500 cho thao tác đã lưu), §30 (view mới trong `core`), §22 (integration test dùng chung DB), §6, §21, §47 (kiểm CRLF), §8 (`shadcn add` ở `apps/web`).

**Design applied**: DESIGN.md §6 `tabs` (mục con `variant="line"`, `?section=`), `collapsible` (mới), `badge`/`IconBadge` (trạng thái câu), `select` (bộ lọc), `alert-dialog` (loại câu), `table` (ma trận hai chế độ); §7 (bốn trạng thái, rỗng theo bộ lọc); §9; §11. DESIGN §6 đã ghi các quy ước mới.

## Acceptance criteria

- [x] **AC-1** — **Given** CENTER, **When** gọi `GET /api/question-banks/{id}/questions`, **Then** nhận mọi câu của ngân hàng, ở mọi trạng thái. Mỗi câu có:
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
- [x] **AC-3** — **Given** CENTER và một câu `DRAFT` hoặc `VALIDATED`, **When** bấm "Loại câu", chọn lý do trong `QUESTION_REJECT_REASONS`, ghi chú (tùy chọn), xác nhận (đề xuất `POST /api/questions/{id}/reject` `{ reason, note?, rowVersion }`), **Then**:
  - ngân hàng chưa khóa: câu đổi sang `REJECTED` qua `transitionTo`, có audit, lý do lưu ở `questions.manual_rejection` (đề xuất, JSONB);
  - ngân hàng đã khóa: gọi `retireQuestion()`, câu sang `RETIRED`, `version` của ngân hàng tăng 1; màn cảnh báo khi một ô còn ít câu hơn số câu cần rút cho một đề.

  **And** `409` khi lệch `row_version`, khi đang có run (sinh hay kiểm), hoặc khi câu đã `REJECTED`/`RETIRED` **And** `HR`, `STUDENT` nhận `403`.
- [x] **AC-4** — Câu Trung tâm loại không được Test Generator đếm vào độ phủ. Lý do loại được đưa vào prompt của lượt sinh bù sau đó, như lý do Validator loại. Đề xuất: view `core.v_ai_question_rejections` (`bank_id`, `draft_id`, `reasons`) chỉ trả ngân hàng chưa khóa; AI Service đọc view này lúc bắt đầu job.

## Tasks

- [x] **TASK-4.11.1** — Shared và DB (AC: 1, 3, 4)
  - [x] Subtask 4.11.1.1 — `packages/shared`: schema response danh sách câu, `RejectQuestionRequestSchema`; bảng chuyển trạng thái thêm `VALIDATED → REJECTED` (trước khóa, do người).
  - [x] Subtask 4.11.1.2 — Migration: cột `questions.manual_rejection`, view `core.v_ai_question_rejections` và quyền của role `ai_service`; `db:generate`.
- [x] **TASK-4.11.2** — API (AC: 1, 3)
  - [x] Subtask 4.11.2.1 — `QuestionBankService`: `listQuestions(bankId)`, `rejectQuestion(questionId, input, actor)` (khóa dòng, kiểm run đang chạy, `transitionTo` hoặc `retireQuestion()`).
  - [x] Subtask 4.11.2.2 — Controller `@Roles('CENTER')`; `api:sync`.
- [x] **TASK-4.11.3** — ai-service (AC: 4)
  - [x] Subtask 4.11.3.1 — `app/agents/test_generator/source.py` đọc view; `tools.py` không đếm câu bị loại; prompt nhận lý do loại.
- [ ] **TASK-4.11.4** — Web (AC: 2, 3)
  - [x] Subtask 4.11.4.1 — Đọc `DESIGN.md` và skill shadcn trước khi code; ghi `Design applied: …`.
  - [x] Subtask 4.11.4.2 — `apps/web/src/features/center/question-bank/`: ba mục, danh sách câu (lọc phía client; một ngân hàng tối đa 1000 câu, thường khoảng 100), hộp thoại "Loại câu" gửi `rowVersion` của lúc mở.
  - [ ] Subtask 4.11.4.3 — Người dùng kiểm tay theo checklist ở *Implementation notes* (AC-2).
- [x] **TASK-4.11.5** — Test (AC: 1, 3, 4)
  - [x] Subtask 4.11.5.1 — Integration `question-bank.int-spec.ts`: CENTER thấy đủ trường; `HR`/`STUDENT` `403`; loại câu trước khóa và sau khóa (`version` tăng); `409` khi lệch `row_version` hay có run.
  - [x] Subtask 4.11.5.2 — pytest `test_test_generator.py`: câu bị Trung tâm loại không được đếm, lý do có trong prompt.

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
- Sibling [US-4.9](US-4.9-question-bank-sample-review.md), [US-4.6](US-4.6-appeals-and-question-error-reports.md): cùng loại câu sau khóa bằng `retireQuestion()`.

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
| AC-2 | Kiểm tay tab "Ngân hàng câu hỏi" ở 360 / 768 / 1024 px (checklist ở *Implementation notes*) |
| AC-4 | `ai-service/.venv/Scripts/pytest ai-service/tests/agents/test_test_generator.py` |

## Changelog entry

### Added
- Mục "Câu hỏi" của tab "Ngân hàng câu hỏi": Trung tâm xem mọi câu đã sinh, lọc, tìm và loại câu sai kèm lý do.

### Changed
- Tab "Ngân hàng câu hỏi" chia thành Tổng quan, Câu hỏi, Ma trận đề.

**Commit**: `a7c932d`

## Implementation notes

2026-11-19 → 20, nhánh `us-4.11` từ `dev` `d5e11dc`.

- **Lý do loại**: `MANUAL_QUESTION_REJECT_REASONS` = mã của Validator trừ `VALIDATOR_REFUSAL`, lọc theo loại câu như Validator (`manualRejectReasonsFor`; lý do của loại kia `400`); ghi chú tùy chọn (rỗng lưu `null`). Cùng bộ mã nên không cần prompt mới: `test_generator/v3` ghi "the reviewer rejected", `VERDICT_TEXT` dùng lại.
- **`questions.manual_rejection`** ghi cùng UPDATE với trạng thái (`set` của `transitionTo`), cả khi `RETIRED` sau khóa (`retireQuestion` nhận `manualRejection`), để danh sách luôn nói ai loại, vì sao. Migration `0045`: `questions_validation_check` đòi câu `REJECTED` có verdict `REJECTED` hoặc `manual_rejection`; CHECK mới `questions_manual_rejection_check`; trigger của ngân hàng đã khóa chỉ cho ghi `manual_rejection` (từ `null`) cùng bước sang `RETIRED`.
- **View** `core.v_ai_question_rejections`: câu `REJECTED` có `manual_rejection` của ngân hàng chưa khóa; không đưa ghi chú vào prompt. Generator đọc lúc bắt đầu job (`BankSourceRepo.rejections`); lý do của Trung tâm thắng verdict `VALIDATED` của cùng câu.
- **API**: `BankQuestionsService` riêng (không dồn vào `QuestionBankService`). `list`: một snapshot, phần A → B, theo thứ tự ô của ma trận (ô không còn trong ma trận cuối phần, theo `skillKey` rồi mức độ khó), rồi id; tên người loại qua `UserDirectory`. `reject`: `assertNotFinal` → khóa `QUESTION_BANK` của JD → khóa dòng ngân hàng → `409 QUESTION_NOT_REJECTABLE` (mã mới) → `409 QUESTION_GENERATION_RUNNING` → `409 ROW_VERSION_CONFLICT`; response (ô của câu sau khi loại) đọc trong giao dịch (§44). `countRejectReasons` đếm cả lý do của Trung tâm; `ExamBlueprintView.questionCount` cho nhãn "Câu hỏi (N)". Bảng chuyển thêm `VALIDATED → REJECTED`.
- **Web**: ba mục (`?section=`); "Độ phủ từng ô" sang Tổng quan, Ma trận đề chỉ hiện cấu trúc (`BlueprintTable mode`). `QuestionList` tải lại khi view của ngân hàng đổi tham chiếu và mục đang hiện (`active`); loại câu xong chỉ invalidate view, để danh sách không tải hai lần. `QuestionBody` tách từ thẻ duyệt mẫu để hai màn dùng chung; nhãn "AI đã loại" ở đó thành "Bị loại". `ShortAfterLockAlert` tách file, hiện cả ở mục Câu hỏi.
- **Giới hạn đã biết**: không hoàn tác được việc loại câu (như US-4.9). Câu bị loại trước khi khóa chỉ được thay khi Trung tâm bấm "Sinh câu còn thiếu".

**Self-verify** (2026-11-20): typecheck, lint, depcruise, unit API 623, shared 406, web build, integration 5 file liên quan, `ruff`, pytest 516 xanh. Chưa chạy cả bộ `pnpm test` (compose bật, §15).

**Review** (2026-11-20, `/code-review high` so với `dev`): sửa lý do loại theo loại câu, CHECK của `REJECTED`, tải lại danh sách (hai lần sau khi loại, cả khi mục bị ẩn), thứ tự câu ngoài ma trận. Sau sửa: typecheck, lint, unit API, web build, integration 6 file (66 ca) xanh.

**Checklist kiểm tay (AC-2)**, sau `db:migrate` `0045`, ở 360 / 768 / 1024 px:

1. Trung tâm › JD đã duyệt › tab "Ngân hàng câu hỏi": ba mục "Tổng quan", "Câu hỏi (N)", "Ma trận đề"; đổi mục thì URL có `?section=`, tải lại vẫn giữ mục.
2. Tổng quan: thẻ sinh câu, kiểm bằng AI, khóa, và "Độ phủ từng ô" (badge Đủ/Thiếu, lý do loại).
3. Câu hỏi: nhóm theo phần rồi theo ô; bấm một câu thì mở đủ (đáp án đúng viền + badge, giải thích, rubric của câu tự luận, kết quả kiểm bằng AI, "Sinh bởi …"); lọc phần, kỹ năng, độ khó, trạng thái và ô tìm; bộ lọc không khớp → trạng thái rỗng có "Xóa bộ lọc".
4. "Loại câu" (ngân hàng chưa khóa): chọn lý do, ghi chú, xác nhận → toast, câu thành "Bị loại" với "Trung tâm loại: …"; Tổng quan giảm số câu dùng được; "Sinh câu còn thiếu" bật khi ô thiếu.
5. Ngân hàng đã khóa: loại một câu ở ô còn đúng số câu một đề rút → hộp thoại báo "Phòng thi sẽ không rút được đề"; sau khi loại, phiên bản tăng và có cảnh báo ô thiếu câu.
6. Ma trận đề: ghi rõ cấu trúc một đề, ô chỉ có "n câu"; "Sửa ma trận" vẫn chạy như trước. 360 px: không cuộn ngang, bộ lọc một cột.

Lessons: none new — view mới trong `core`, `row_version` của hộp thoại và việc sau commit đã có ở §30, §25, §44; CHECK và trigger mới có test integration.

## Files modified

- `packages/shared/`: `schemas/bank-question.ts` (mới), `exam-blueprint.ts` (`questionCount`), `errors.ts`, `index.ts`; `states/question.ts` + test.
- `apps/api/src/db/schema/assessment.ts`, `apps/api/drizzle/0045_question_manual_rejection.sql` + `meta/`.
- `apps/api/src/modules/assessment/` (`bank-questions.service.ts`, `question.controller.ts` mới; controller, DTO, `question-bank.service.ts`, `blueprint.service.ts`, repository, module); `common/errors/`.
- `apps/api/test/integration/`: `question-bank.int-spec.ts`, `ai-service-role.int-spec.ts`.
- `ai-service/app/agents/test_generator/` (`source.py`, `tools.py`, `agent.py`); `tests/agents/` (`generator_support.py`, `test_test_generator.py`).
- `apps/web/src/`: `components/ui/collapsible.tsx` (mới), `features/center/question-bank/` (4 file mới; panel, bảng, nhãn, API), `features/jds/question-review/` (`question-body.tsx` mới), `shared/api/`.
- Tài liệu: DESIGN §6, ARCH (`questions`, trigger), PRD (bảng story), EPIC-4, W47, CHANGELOG, VERSION.

## Cross-references

- [CONTEXT D60](../../CONTEXT.md)
- [Epic EPIC-4](../epics/EPIC-4.md)
- [US-4.10 Kiểm câu bằng AI khi Trung tâm yêu cầu](US-4.10-on-demand-question-validation.md)
- [US-4.12 Sửa giao diện ngân hàng, phần C](US-4.12-question-bank-ui-fixes-part-c.md)
- [US-4.9 Duyệt mẫu ngân hàng câu hỏi](US-4.9-question-bank-sample-review.md)
