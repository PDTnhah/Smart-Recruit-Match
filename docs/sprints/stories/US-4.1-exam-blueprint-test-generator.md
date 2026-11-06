---
id: US-4.1
title: "Ma trận đề và Test Generator"
epic: EPIC-4
status: review
priority: P0
points: 8
sprint: sprint-2026-W45
version_shipped: 0.20.0
prd_ref: [FR-18, NFR-11]
depends_on: [US-2.3, US-2.5]
assignee:
commit: 43e1a54
created: 2026-10-07
updated: 2026-11-06
---

## Story refresh — 2026-11-05 (bắt đầu story)

Người dùng chốt [CONTEXT D49](../../CONTEXT.md) (bản cũ viết trước D34). Đã viết lại AC-1, 3, 5, 6, 10, 11, task và lệnh kiểm tra.

## Goal

Mỗi JD đã được HR xác nhận yêu cầu và Trung tâm duyệt (BR-02) có một ma trận đề (BR-05) và một ngân hàng câu hỏi nháp. Ngân hàng phủ mọi ô kỹ năng × độ khó; mỗi ô có từ 3 đến 5 lần số câu cần rút, và không có câu trùng. Ngân hàng là đầu vào cho Validator ([US-4.2](US-4.2-validator-and-question-bank-lock.md)) và phòng thi ([US-4.3](US-4.3-exam-room.md)). Ngân hàng sinh một lần cho mỗi JD, nên chi phí LLM không tăng theo số sinh viên (NFR-11).

## Background

FR-18: AI sinh ngân hàng theo ma trận đề (trắc nghiệm, tự luận kèm rubric). Story này làm phần sinh; Validator, khóa, phiên bản thuộc US-4.2. Cấu trúc mặc định theo PRD › GĐ5: phần A 20 câu trắc nghiệm 4 phương án (60%), phần B 2–3 câu tự luận (40%). Quyết định liên quan: D2, D5, D12, D33, D34, D39, D46, D49.

**Lessons applied**: §6, §10, §12, §15, §19, §21, §22, §24 (kiểm trùng trong bộ nhớ), §25, §26, §30, §31, §32, §33 (`job_id` trước khi dispatch), §34 (nút chạy lại).

## Acceptance criteria

- [x] **AC-1** — **Given** `requirements` đã được HR xác nhận, **When** hàm thuần `buildDefaultBlueprint(requirements, { durationMinutes })` chạy, **Then** nó trả về:
  - phần A gồm 20 câu MCQ, chia cho các kỹ năng `must_have` theo trọng số và chia theo độ khó Dễ/TB/Khó = 40/45/15;
  - phần B gồm 2 câu ESSAY độ khó TB, gán cho 2 kỹ năng trọng số cao nhất;
  - `weight_percent` 60/40, thời gian bằng `t_test_minutes`.

  **And** tổng hàng, tổng cột, tổng câu luôn đúng, và cùng đầu vào luôn cho cùng ma trận (làm tròn hai chiều theo D49) **And** ví dụ "Backend Java" ở GĐ5 cho đúng 2/3/1, 2/3/1, 2/2/1, 2/1/0.
- [x] **AC-2** — `ExamBlueprintSchema` (`packages/shared/contracts`) chỉ có phần A và B. `examBlueprintRequestSchema(requirements)` (`packages/shared/schemas`) bắt buộc:
  - tổng các ô bằng `question_count`;
  - `weight_percent` của hai phần cộng lại bằng 100;
  - phần B có 2–3 câu;
  - mọi kỹ năng có trong `requirements`, so bằng `skillKey`;
  - không có ô trùng.

  Dữ liệu sai thì API trả `400` kèm lỗi theo từng trường.
- [x] **AC-3** — **Given** người dùng vai trò `CENTER`, **When** gọi `GET`/`PUT /api/jds/{id}/exam-blueprint` và `POST /api/jds/{id}/question-bank/generate`, **Then** xem được ma trận và độ phủ, sửa được ma trận, và chạy được lượt sinh câu còn thiếu **And** `HR`, `STUDENT` nhận `403` **And** sửa khi ngân hàng đã khóa nhận `409 QUESTION_BANK_LOCKED`, khi đang sinh nhận `409 QUESTION_GENERATION_RUNNING`, khi lệch `row_version` nhận `409` **And** JD chưa duyệt nhận `409 JD_NOT_APPROVED`.
- [x] **AC-4** — **Given** JD chuyển sang `APPROVED`, **When** `assessment` nhận `jd.approved`, **Then**:
  - nó tạo một `question_banks` với `blueprint` mặc định và `version = 1`;
  - nó ghi `question_generation_runs` kèm `job_id` trước khi phát đúng một message `ai.questions.generate` `{ job_id, bank_id }`.

  **And** nhận trùng sự kiện, hoặc gọi `POST …/generate` khi đang có run `RUNNING`, không tạo thêm ngân hàng hay job **And** JD chưa duyệt thì không có ngân hàng.
- [x] **AC-5** — **Given** LLM được thay bằng fixture, **When** Test Generator chạy, **Then** code lặp lại `get_blueprint_coverage()` → một lượt `generate` cho nhóm ô còn thiếu → `submit_questions()`, cho đến khi mọi ô có ít nhất 3× số câu cần **And** khi chạm `MAX_ROUNDS` hoặc `MAX_TOKENS_PER_JOB` thì dừng, trả `PARTIAL` kèm `missing_cells`.
- [x] **AC-6** — `QuestionBankTools` có đúng ba phương thức công khai: `get_blueprint_coverage`, `find_similar_questions`, `submit_questions`. LLM không gọi công cụ. Công cụ chỉ ghi `ai.question_drafts` và `ai.embeddings`; không ghi `core`, không đổi trạng thái, không gọi mạng. `ai-service-role.int-spec.ts` xác nhận role `ai_service` bị từ chối khi ghi `core.questions`.
- [x] **AC-7** — **Given** `submit_questions` nhận một lô, **When** một câu sai, **Then** câu đó không được lưu và có lý do riêng. Các trường hợp sai:
  - MCQ không đủ 4 phương án hoặc không đúng 1 đáp án đúng;
  - thiếu giải thích;
  - ESSAY thiếu rubric có điểm tối đa từng tiêu chí, hoặc thiếu đáp án mẫu;
  - ô không có trong ma trận;
  - ô đã đủ 5×.

  **And** các câu hợp lệ trong cùng lô vẫn được lưu.
- [x] **AC-8** — **Given** ngân hàng đã có câu X, **When** nộp câu trùng nguyên văn (sau khi chuẩn hóa khoảng trắng và hoa thường) hoặc có cosine với X ≥ 0,9, kể cả câu trong cùng lô, **Then** câu bị loại với lý do `DUPLICATE` kèm `nearest_draft_id` **And** ngân hàng cuối cùng không có cặp câu nào vượt ngưỡng.
- [x] **AC-9** — **Given** `ai.results` loại `QUESTIONS_GENERATE` (`SUCCEEDED`/`PARTIAL`/`FAILED`), **When** Core Backend nhận, **Then**:
  - nó upsert mọi draft vào `questions` theo `draft_id`, `status = DRAFT`, kèm `model` và `prompt_version`;
  - nó đóng run với `missing_cells`.

  **And** nhận trùng message, hoặc kết quả về trước khi `dispatch` trả, không sinh dòng trùng và không làm kẹt run.
- [x] **AC-10** — Mọi lượt gọi LLM đi qua `LLMClient` với `effort: high` (`EFFORT_BY_AGENT["test_generator"]`). Refusal thì job `FAILED`, `needs_human`, và có dòng `ai.llm_calls` với `agent = test_generator`. Prompt nằm ở `ai-service/app/prompts/test_generator/v1.md`:
  - yêu cầu JD ở block `shared`, dùng `tojson_sorted` và `untrusted`;
  - `system` không có biến.

  Thư mục agent không import SDK của nhà cung cấp.
- [ ] **AC-11** — **Given** CENTER mở JD đã duyệt ở cổng Trung tâm, **When** job đang chạy hoặc đã xong, **Then** tab "Ngân hàng câu hỏi" hiện ma trận (sửa được trước khi khóa), độ phủ từng ô (đã có / cần, 3×–5×), trạng thái run và các ô còn thiếu **And** có trạng thái rỗng, đang tải, lỗi; chuỗi tiếng Việt; dùng được ở 360 / 768 / 1024 px (kiểm tay).

## Tasks

- [x] **TASK-4.1.1** — Hợp đồng và ma trận (AC: 1, 2), phiên 2a: `contracts/exam-blueprint.ts`, `questions.ts`, `QUESTIONS_GENERATE`; `schemas/exam-blueprint.ts`, `states/question.ts`; `assessment/domain/blueprint.ts` + test GĐ5 + property test.
- [x] **TASK-4.1.2** — DB (AC: 4, 6, 9), phiên 2a: `0028`; `0029` (view `core.v_ai_question_banks`, GRANT); `CORE_TABLES`.
- [x] **TASK-4.1.3** — Module `assessment` (AC: 3, 4, 9), phiên 2a: `JdService.getForQuestionBank`, `question-bank.service.ts`, `blueprint.service.ts` + controller, `question-results.handler.ts`, `question-bank.int-spec.ts`.
- [x] **TASK-4.1.4** — Test Generator (AC: 5–8, 10), phiên 2b: `LLMResult.usage`, `app/agents/test_generator/`, prompt `test_generator/v1`, `kinds.py` (`PARTIAL`), `worker.py`, test + fixture.
- [ ] **TASK-4.1.5** — Giao diện (AC: 3, 11), phiên 2c
  - [x] 4.1.5.1 — Đọc `DESIGN.md`, ghi `Design applied: …`.
  - [x] 4.1.5.2 — `features/center/question-bank/`: tab, bảng ma trận và độ phủ, form RHF, "Sinh câu còn thiếu", poll khi `RUNNING`.
  - [ ] 4.1.5.3 — Kiểm tay ở 360 / 768 / 1024 px (người dùng, checklist ở *Implementation notes*).

## Dev notes

### Architecture constraints

- AD-2: LLM chỉ sinh nội dung theo schema. Code chọn ô, kiểm từng câu, kiểm trùng, đếm độ phủ.
- AD-4 (Nguyên tắc 3): AI Service chỉ ghi `ai.question_drafts` và `ai.embeddings`. Core Backend ghi `questions` khi nhận `ai.results`.
- Nguyên tắc 8: `answer_key` (đáp án, giải thích, đáp án mẫu) tách khỏi `content`.
- Nguyên tắc 13: `assessment` không đọc bảng của `company`; chỉ dùng `JdService`, `CampaignService`, `AiGatewayService`.
- Giới hạn của agent (`config.py`) theo D49.

### Cross-story dependencies

- Builds on: US-2.3, US-2.5 (`app/embedding/`), US-2.1/US-2.2 (`LLMClient`), US-1.4 (`t_test_minutes`), US-3.2 (mẫu `match_runs`).
- Required by: US-4.2 (Validator, `QUESTION_STATES`, `locked_at`, `jd.requirements.versioned`), US-4.3, US-6.3.

### Performance budget

- Mỗi ô có 3–5× số câu cần, đo bằng `coverage` trong kết quả.
- Chi phí: ARCH ước tính khoảng 2,9 USD mỗi ngân hàng, gồm cả Validator. Đo lại bằng `ai.llm_calls` (`agent = test_generator`) sau một lần chạy thật, ghi số vào *Implementation notes*.

### What we explicitly did NOT do

- Không có: tool-use trong `LLMClient` (D49); Validator, khóa ngân hàng, phiên bản sau khóa (US-4.2); dùng chung theo nhóm vị trí (Q2 còn mở); phần C (Q7), phần D (US-4.8); duyệt mẫu (US-4.9); SSE (web poll khi run đang chạy).
- Không sinh câu riêng cho từng SV (BR-05, NFR-11). Không dùng Message Batches, vì mỗi vòng cần kết quả vòng trước.

### References

PRD › GĐ5, FR-18, NFR-11, BR-02, BR-05, Q2, Q7 · ARCHITECTURE › *Pipeline › Test Generator*, *Các bảng chính*, *Hàng đợi* · CONTEXT D33, D34, D39, D46, D49 · [EPIC-4](../epics/EPIC-4.md).

## Verification commands

| AC | Command |
|---|---|
| AC-1 | `pnpm --filter @srm/api test:unit` › `assessment/domain/__tests__/blueprint.spec.ts` (`GĐ5 …`, `BR-05 … (property)`) |
| AC-2 | `pnpm --filter @srm/shared test` › `schemas/__tests__/exam-blueprint.spec.ts` (`BR-05 …`) |
| AC-3, AC-4, AC-9 | `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/question-bank' --selectProjects integration` |
| AC-5, AC-7, AC-8, AC-10 | `ai-service/.venv/Scripts/pytest ai-service/tests/agents/test_test_generator.py` (`test_gd5_*`) |
| AC-6 | `test_gd5_tools_expose_exactly_three` + như AC-3 với `'test/integration/(ai-service-role\|core-schema)'` |
| AC-10 | Test chặn import SDK ngoài `app/llm/` (có sẵn) + `test_gd5_refusal_fails_with_llm_call_logged` |
| AC-11 | Kiểm tay theo checklist trong *Implementation notes* |

## Changelog entry

### Added
- Ma trận đề theo JD, Test Generator (3–5× mỗi ô, loại câu sai và câu trùng), các bảng của ngân hàng câu hỏi, tab "Ngân hàng câu hỏi". Chi tiết ở [CHANGELOG 0.20.0](../../CHANGELOG.md).

**Commit**: 43e1a54

## Implementation notes

- Phiên: 2a (TASK 1–3), 2b (TASK 4), 2c (TASK 5), 3 (Review, v0.20.0). Plan: `~/.claude/plans/l-n-plan-th-c-hi-n-purrfect-quiche.md` (máy PDTnhah).
- `GET`/`PUT exam-blueprint` tự tạo ngân hàng (không gửi job) khi JD đã duyệt mà chưa có; listener `jd.approved` gửi job khi ngân hàng chưa có run nào, nên màn hình tạo trước cũng không làm mất job đầu.
- Fixture 3 vòng ở `tests/fixtures/llm/test_generator/` ghi bằng script tạm từ `BANK` của `tests/agents/generator_support.py`; đổi prompt, `BANK` hay cách dựng request thì ghi lại (LESSONS §31).
- Zod 4: ô có số câu lẻ che lỗi tổng, tỷ trọng tới khi sửa (LESSONS §10, test ghim).
- **Design applied**: §1, §3–§11; thêm vào §6 (tab trang chi tiết, bảng ma trận, badge ngân hàng) và §8 (resolver tự viết).
- **Phiên 3, `/code-review`** (10 điểm, sửa 8):
  - `GET` đóng run quá hạn `STALE`, vì giao diện tắt cả hai nút khi run `RUNNING` (LESSONS §34);
  - các phần thay phiên, ô ít được hỏi đi trước, nên một ô không đầy được không chặn ô khác hay phần B;
  - `MAX_TOKENS_PER_JOB` cộng token các lần chạy lại của job (`ai.llm_calls`);
  - kiểm trùng chạy trong thread; `PUT` ghi `jd_version` của yêu cầu đã dùng để kiểm;
  - tab chỉ gắn panel khi đã mở, chỉ poll khi tab hiện;
  - `QUESTION_BANK_JD_STATES` và `part_types` (manifest) dùng chung.
- **Giới hạn đã biết**:
  - Hai job cùng một ngân hàng (chỉ khi `markDispatched` lỗi và job đầu chạy quá 15 phút) có thể vượt 5× một ô; khóa theo ngân hàng phía AI Service để US-4.2.
  - Kết quả mang mọi draft của ngân hàng (D49), khoảng 110 câu với ma trận mặc định; ngân hàng rất lớn thì message lớn.
  - `apps/web` chưa có test runner: logic form ma trận (`blueprint-form-values.ts`) chỉ kiểm bằng script tạm và kiểm tay.
- **koni-qc**: AC-1…AC-10 có ca đúng, sai, biên; thêm test `BANK_FULL`, chạy lại job, thay phiên phần, `GET` đóng run `STALE`. Self-verify: typecheck, lint, depcruise, `pnpm test` 808/808 + shared 340/340, pytest 397, ruff, `pnpm build`.
- **Checklist AC-11** (cần `db:migrate`):
  1. Chỉ JD đã duyệt có tab; tải lại vẫn ở tab đó. Có trạng thái tải, lỗi ("Thử lại"), rỗng.
  2. "Sinh câu còn thiếu": hiện "Đang sinh câu", nút và "Sửa ma trận" tắt, tự cập nhật khi xong; ô thiếu có "Thiếu n".
  3. Sửa: lỗi tổng mất khi sửa một ô; tỷ trọng khác 100 báo ở phần B; lưu sau khi tab khác đã lưu thì báo xung đột.
  4. 360 / 768 / 1024 px: bảng cuộn ngang trong khung riêng, trang không cuộn ngang.
- **Còn chờ người dùng**: `db:migrate` `0028`–`0029`; đo chi phí một ngân hàng bằng `evals/smoke_llm.py --bank` với key thật, ghi số vào đây; kiểm tay AC-11 (xong thì `[x]` AC-11, 4.1.5.3, story `done`).

## Files modified

- `packages/shared` (`contracts/`, `schemas/`, `states/`), `scripts/gen-contracts.mjs`.
- `apps/api`: module `assessment`, `company`, `db/schema/`, `drizzle/0028`–`0029`, `common/`, `test/integration/`.
- `ai-service`: `app/agents/test_generator/`, `app/prompts/test_generator/`, `app/llm/` (`usage`), `app/contracts/`, `consumers/kinds.py`, `handlers/`, `worker.py`, `evals/smoke_llm.py`, `tests/`.
- `apps/web`: `features/center/question-bank/`, `jd-approval-detail-page.tsx`, `shared/api/`, `shared/forms/server-errors.ts`; `DESIGN.md`; docs: CONTEXT D49, ARCHITECTURE, PRD, sprint W45.

## Cross-references

- [PRD FR-18, NFR-11](../../PRD.md#functional-requirements)
- [Epic EPIC-4](../epics/EPIC-4.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D49](../../CONTEXT.md)
- [US-4.2 Validator và khóa ngân hàng](US-4.2-validator-and-question-bank-lock.md)
- [US-4.3 Phòng thi](US-4.3-exam-room.md)
