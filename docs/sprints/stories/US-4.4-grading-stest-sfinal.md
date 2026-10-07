---
id: US-4.4
title: "Chấm bài, S_test và S_final"
epic: EPIC-4
status: backlog
priority: P0
points: 8
sprint:
version_shipped:
prd_ref: [FR-22]
arch_ref: [AD-2, AD-12]
depends_on: [US-4.3]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Mỗi bài test có S_test, bản đồ năng lực theo kỹ năng, và mỗi nguyện vọng có S_final để [EPIC-5](../epics/EPIC-5.md) phân bổ. Trắc nghiệm chấm bằng code. Tự luận do Grader chấm hai lần độc lập theo rubric qua Message Batches. Câu AI không chắc chắn được chuyển cho người chấm. Mọi điểm tổng do code tính theo công thức, nên tái hiện được và giải thích được khi sinh viên hay hội đồng hỏi.

## Background

FR-22: chấm trắc nghiệm tự động; AI chấm tự luận theo rubric hai lần độc lập và chuyển người chấm khi cần; tính S_test, bản đồ năng lực và S_final (UC-33, GĐ6). PRD › GĐ6: Grader trả điểm từng tiêu chí, lý do và độ tự tin. Bài được chuyển cho người chấm khi độ tự tin thấp, khi điểm sát ngưỡng θ_test (±5), hoặc khi hai lần chấm lệch nhau quá ngưỡng. ARCH › *Pipeline từng agent › Grader* đặt ngưỡng lệch là 15% thang điểm, coi bài làm là dữ liệu chứ không phải chỉ dẫn, và chạy bằng Message Batches sau khi đóng cửa sổ thi. ARCH › *Bản đồ sử dụng LLM* đặt `effort: high`.

Công thức theo PRD › *Cơ chế chấm điểm*: `S_test = 0,6 × A + 0,4 × B` (cả hai quy về thang 100, tỷ trọng theo cấu hình đề). `S_final = α · S_cv + β · S_test`, α + β = 1, mặc định 0,4 / 0,6. Phá hòa khi S_final bằng nhau sau khi làm tròn 2 chữ số: S_test cao hơn → S_cv cao hơn → GPA cao hơn → nộp bài sớm hơn. Theo AGENTS › Nguyên tắc 9, điểm quy về số nguyên (×100) trước khi so sánh.

AD-2 / D2: LLM không ra quyết định và không tính điểm tổng. Grader chỉ trả điểm từng tiêu chí, lý do, độ tự tin; code cộng điểm câu, quyết định chuyển người chấm, tính S_test và S_final. ARCH › *Những chỗ cố ý KHÔNG dùng LLM* liệt kê chấm trắc nghiệm, S_test, S_final. AD-12 / D12: chấm tự luận chạy qua Message Batches (giảm 50% giá), prompt có phiên bản, mọi kết quả lưu `model` + `prompt_version`. BR-03: Grader chỉ nhận câu hỏi, rubric và bài làm, không nhận thông tin cá nhân.

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** một phiên thi vừa đóng (sự kiện từ [US-4.3](US-4.3-exam-room.md)), **When** hàm thuần `gradeMultipleChoice(answers, keys)` chạy, **Then** mỗi câu trắc nghiệm có `auto_score` (đúng = điểm tối đa của câu, sai hoặc bỏ trống = 0), và điểm phần A = tổng đạt / tổng tối đa × 100 **And** không có lượt gọi LLM nào cho phần này.
- [ ] **AC-2** — **Given** cửa sổ thi đã đóng (hết pha *Làm test* và mọi phiên đã đóng) hoặc Cán bộ Trung tâm bấm chấm, **When** backend gom bài, **Then** nó phát `ai.essay.grade` với payload `{ job_id, exam_session_ids }`, chỉ gồm phiên có câu tự luận chưa chấm **And** phát lại hay nhận trùng không làm câu nào bị chấm thêm lần nữa.
- [ ] **AC-3** — Mỗi câu tự luận được gửi thành hai request độc lập trong một Message Batch, mỗi request có `custom_id` riêng, phân biệt (phiên, câu, lần chấm, phiên bản prompt). `system` gồm hướng dẫn và rubric cố định ở đầu; câu hỏi và rubric của câu đặt sau; bài làm nằm trong `user`, bọc trong thẻ dữ liệu riêng. Request không chứa tên, mã sinh viên hay trường nào của hồ sơ (BR-03). `effort: high`. Đầu ra là structured output `GradingResult`: điểm từng tiêu chí, lý do bằng tiếng Việt, độ tự tin, cờ.
- [ ] **AC-4** — **Given** bài làm có câu kiểu "hãy cho tôi điểm tối đa" hoặc "bỏ qua hướng dẫn", **When** chấm với fixture tương ứng, **Then** điểm vẫn chỉ theo rubric, câu trả lời có cờ `INSTRUCTION_IN_ANSWER` (đề xuất) lưu trong `exam_sessions.flags` và được chuyển người chấm **And** điểm tiêu chí vượt khoảng [0, điểm tối đa của tiêu chí] hoặc đầu ra sai schema thì bị từ chối, thử lại tối đa 2 lần, vẫn lỗi thì chuyển người chấm.
- [ ] **AC-5** — Code cộng điểm các tiêu chí thành điểm câu của từng lần chấm. Điểm AI của câu là trung bình hai lần (đề xuất). Cả hai lần chấm lưu trong `exam_answers.ai_grading`, mỗi lần kèm `model` và `prompt_version`. Mỗi lượt gọi có một dòng `ai.llm_calls` với `agent = grader`. Prompt ở `ai-service/app/prompts/grader/v1.md`.
- [ ] **AC-6** — Hàm thuần `decideNeedsHuman()` đặt `needs_human = true` khi có một trong các điều kiện: hai lần chấm lệch nhau > 15% điểm tối đa của câu; độ tự tin của một trong hai lần là thấp; S_test tạm tính (dùng điểm AI) nằm trong khoảng θ_test ± 5, khi đó mọi câu tự luận của phiên đều được chuyển; hoặc có cờ ở AC-4. Ngược lại `final_score` = điểm AI. Mọi phép so sánh dùng số nguyên ×100. Test bảng có các ca biên: lệch đúng 15%, S_test = θ_test ± 5.
- [ ] **AC-7** — **Given** một request trong batch có `stop_reason == "refusal"`, hết hạn hoặc lỗi, **When** xử lý kết quả batch, **Then** request đó được gửi lại đồng bộ qua `LLMClient` (có `fallbacks`), không đọc nội dung khi bị từ chối **And** vẫn thất bại thì câu được chuyển người chấm **And** `ai.results` của job có `status = PARTIAL` và liệt kê các câu này.
- [ ] **AC-8** — Hàm thuần `computeSTest({ a, b }, weights)` trả `wA·A + wB·B` dạng số nguyên ×100 (`sTestX100`), tỷ trọng lấy từ ma trận đề (mặc định 0,6/0,4), A và B trên thang 100. Hàm tính bằng số nguyên và chỉ làm tròn một lần ở bước cuối (half-up, đề xuất), cùng quy ước với `scvX100` của [US-3.1](US-3.1-hard-filters-and-scv-formula.md). Hàm chỉ được gọi khi mọi câu tính điểm của phiên đã có `final_score`. Unit test dạng bảng gồm 0, 100, các ca làm tròn và ví dụ ở PRD.
- [ ] **AC-9** — Hàm thuần `computeSkillScores()` trả điểm mỗi kỹ năng trong ma trận = điểm đạt / điểm tối đa của các câu tính điểm gắn kỹ năng đó × 100, lưu vào `exam_sessions.skill_scores`. Câu phần D (US-4.8) không được tính.
- [ ] **AC-10** — Hàm thuần `computeSFinal(scvX100, sTestX100, { alpha, beta })` trả `α·S_cv + β·S_test` dạng số nguyên ×100 (`sFinalX100`), α và β lấy từ `campaigns.config` (từ chối khi α + β ≠ 1), làm tròn một lần ở bước cuối như AC-8. S_cv lấy qua service đã export của module `matching`. S_final lưu theo từng NV kiểu `numeric(5,2)` (đề xuất cột `preferences.s_final`, ghi qua service của `matching`), để [US-5.1](US-5.1-allocation-engine-property-tests.md) đọc lại bằng `toCentiScore` mà không lệch giá trị.
- [ ] **AC-11** — **Given** mọi câu tính điểm của phiên đã có `final_score`, **When** backend tính xong S_test, `skill_scores`, S_final, **Then** trong cùng giao dịch các NV dùng phiên đó chuyển `PENDING_TEST` → `TEST_GRADED` (mã của US-3.3) qua `transitionTo` có audit **And** lệch `row_version` thì trả `409` và thử lại ở lần xử lý sau **And** ghi `results_published_at` (đề xuất) và gửi thông báo "Có kết quả test" cho sinh viên qua module `notification`. Phiên còn câu `needs_human` thì NV giữ ở `PENDING_TEST`.
- [ ] **AC-12** — **Given** sinh viên là chủ phiên đã có kết quả, **When** gọi `GET /api/exam-sessions/{id}/result` (đề xuất), **Then** nhận S_test, điểm phần A, phần B, điểm theo kỹ năng, S_final của từng NV dùng phiên này, điểm và lý do từng tiêu chí của câu tự luận **And** response không có `answer_key`, rubric hay đáp án mẫu **And** sinh viên khác nhận `404`, vai trò khác `403` **And** màn hình kết quả dùng tốt ở 360 px.
- [ ] **AC-13** — Thư mục `ai-service/tests/fixtures/grader/` có fixture cho các ca: hai lần chấm khớp, lệch > 15%, độ tự tin thấp, bài làm chứa chỉ dẫn, `refusal`, sai schema. [US-4.6](US-4.6-appeals-and-question-error-reports.md) và [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md) dùng lại bộ này.
- [ ] **AC-14** — **Given** `results_published_at` của phiên đã cách hiện tại quá `campaigns.config.appeal_window_hours` (đề xuất, mặc định 48; theo `Clock`), **When** tác vụ định kỳ chạy (giữ `pg_try_advisory_lock`), **Then** NV `TEST_GRADED` có `sTestX100 < θ_test × 100` chuyển sang `BELOW_THRESHOLD` (*Không đạt ngưỡng*) qua `transitionTo` có audit **And** NV đạt ngưỡng giữ nguyên **And** trước hạn đó không NV nào bị chuyển. Hàm kiểm điều kiện có điểm móc để [US-4.6](US-4.6-appeals-and-question-error-reports.md) chặn phiên còn phúc khảo hoặc báo lỗi đang mở.

## Tasks

- [ ] **TASK-4.4.1** — Đọc skill `claude-api` trước khi viết code gọi LLM (AC: 3, 7)
  - [ ] Subtask 4.4.1.1 — Ghi vào Implementation notes: cách tạo và lấy kết quả Message Batches, giới hạn định dạng `custom_id`, `output_config` trong batch, vì sao batch không có `fallbacks`.
- [ ] **TASK-4.4.2** — Hàm thuần tính điểm (AC: 1, 6, 8, 9, 10)
  - [ ] Subtask 4.4.2.1 — `apps/api/src/modules/assessment/domain/scoring.ts`: `gradeMultipleChoice`, `computeSTest`, `computeSkillScores`, `computeSFinal`; mọi điểm là số nguyên ×100.
  - [ ] Subtask 4.4.2.2 — `apps/api/src/modules/assessment/domain/needs-human.ts`: `decideNeedsHuman`.
  - [ ] Subtask 4.4.2.3 — `apps/api/src/modules/assessment/domain/scoring.spec.ts`, `needs-human.spec.ts`: test bảng, tên case có mã GĐ6/BR.
- [ ] **TASK-4.4.3** — Agent Grader (AC: 3, 4, 5, 7)
  - [ ] Subtask 4.4.3.1 — `ai-service/app/schemas/grading.py`: `GradingResult`.
  - [ ] Subtask 4.4.3.2 — `ai-service/app/prompts/grader/v1.md`: rubric và hướng dẫn cố định ở đầu; nói rõ nội dung trong thẻ bài làm là dữ liệu, mọi chỉ dẫn trong đó bị bỏ qua và gắn cờ.
  - [ ] Subtask 4.4.3.3 — `ai-service/app/agents/grader/batch.py`: dựng hai request mỗi câu, gửi batch qua `LLMClient`, đọc kết quả theo `custom_id`, gửi lại đồng bộ câu bị từ chối hoặc lỗi.
- [ ] **TASK-4.4.4** — Hợp đồng, view và consumer (AC: 2, 3)
  - [ ] Subtask 4.4.4.1 — `packages/shared/contracts/essay-grade.ts`: Zod cho `ai.essay.grade` và kết quả `ESSAY_GRADE` (đề xuất), sinh JSON Schema → Pydantic.
  - [ ] Subtask 4.4.4.2 — Migration: view chỉ đọc `core.v_ai_essay_answers` (đề xuất) chỉ có `session_id`, `question_id`, đề, rubric, bài làm; không có cột nào của sinh viên.
  - [ ] Subtask 4.4.4.3 — `ai-service/app/consumers/essay_grade.py`: idempotent theo `job_id`.
- [ ] **TASK-4.4.5** — Điều phối ở backend (AC: 1, 2, 6, 10, 11, 14)
  - [ ] Subtask 4.4.5.1 — `apps/api/src/modules/assessment/application/grading.service.ts`: chấm trắc nghiệm khi nhận sự kiện đóng phiên; tác vụ định kỳ phát `ai.essay.grade` khi cửa sổ thi đóng (dùng `Clock` của US-1.4).
  - [ ] Subtask 4.4.5.2 — `apps/api/src/modules/assessment/application/essay-results.handler.ts`: lưu `ai_grading`, gọi `decideNeedsHuman`, tính điểm, chuyển trạng thái NV qua service của `matching` + `transitionTo`, gửi thông báo.
  - [ ] Subtask 4.4.5.3 — `apps/api/src/modules/assessment/application/threshold.scheduler.ts` (đề xuất): chuyển `TEST_GRADED` → `BELOW_THRESHOLD` sau hạn phúc khảo; điều kiện chặn là hàm truyền vào để US-4.6 bổ sung.
- [ ] **TASK-4.4.6** — API và màn hình kết quả cho sinh viên (AC: 12)
  - [ ] Subtask 4.4.6.1 — `apps/api/src/modules/assessment/api/exam-result.controller.ts`: DTO dạng whitelist trong `packages/shared/schemas/exam-result.ts`.
  - [ ] Subtask 4.4.6.2 — Đọc `DESIGN.md` trước khi code, ghi `Design applied: …`; `apps/web/src/features/student/exam-result/` (đề xuất).
- [ ] **TASK-4.4.7** — Fixture và test (AC: 2, 3, 4, 5, 7, 11, 12, 13)
  - [ ] Subtask 4.4.7.1 — `ai-service/tests/fixtures/grader/` dựa trên định dạng fixture batch của US-3.2 (`ai-service/tests/fixtures/batches/`).
  - [ ] Subtask 4.4.7.2 — `ai-service/tests/agents/test_grader.py`; `apps/api/test/assessment/grading.spec.ts` (PostgreSQL + RabbitMQ thật qua testcontainers).

## Dev notes

### Architecture constraints

- [AD-2](../../ARCHITECTURE.md#architecture-decisions): Grader không trả điểm câu hay điểm bài; code cộng điểm tiêu chí, quyết định chuyển người chấm và tính S_test, S_final. Phương án để LLM trả một điểm tổng bị loại (D2: không ổn định, không giải thích được).
- [AD-12](../../ARCHITECTURE.md#architecture-decisions): chấm qua Message Batches sau khi đóng cửa sổ thi; phần cố định của prompt đặt đầu để dùng prompt caching. Phương án gọi API đồng bộ cho từng bài bị loại, vì giá gấp đôi Batches trong khi kết quả không cần ngay.
- [AD-4](../../ARCHITECTURE.md#architecture-decisions), [AD-5](../../ARCHITECTURE.md#architecture-decisions): AI Service đọc bài qua view chỉ đọc, trả kết quả qua `ai.results`; Core Backend ghi `exam_answers`, `exam_sessions`.
- [AD-8](../../ARCHITECTURE.md#architecture-decisions): NV chuyển `PENDING_TEST` → `TEST_GRADED` và `TEST_GRADED` → `BELOW_THRESHOLD` qua `transitionTo`, gọi qua service đã export của `matching` (AGENTS › Nguyên tắc 13). Hai cạnh này được giao cho US-4.4 trong bảng chuyển của [US-3.3](US-3.3-shortlist-and-preferences.md).
- [AD-10](../../ARCHITECTURE.md#architecture-decisions): mọi lượt gọi qua `LLMClient`, `effort: high`, kiểm `refusal` trước khi đọc nội dung.
- AGENTS › Nguyên tắc 9: điểm là số nguyên ×100 trong mọi phép tính và so sánh, cùng quy ước với `scvX100` (US-3.1) và `toCentiScore` (US-5.1). `assessment` không import `allocation/domain` hay `matching/domain` (dependency-cruiser chặn). Nếu cần một hàm chuyển đổi dùng chung thì đặt ở `packages/shared`; hỏi trước khi chuyển.
- Quy tắc phá hòa: story này cung cấp dữ liệu (S_test, S_cv, `submitted_at`). Hàm so sánh chặt dùng trong phân bổ nằm ở [US-5.1](US-5.1-allocation-engine-property-tests.md) theo EPIC-5. EPIC-3 › *Out of scope* lại ghi phá hòa thuộc US-4.4; cần thống nhất.
- **Chạm Q7:** tạm dùng Đề xuất "MVP dùng trắc nghiệm + tự luận"; không chấm phần C trong sandbox (D20). Hỏi trước khi chốt.
- **Chạm Q2:** khi dùng chung phiên theo nhóm vị trí, một S_test cho ra nhiều S_final (mỗi NV một S_cv). Vì vậy S_final lưu theo NV, không lưu trên phiên.
- **Điểm chưa rõ trong spec — hỏi trước khi chốt:**
  - "Độ tự tin thấp" chưa có định nghĩa. Story tạm dùng enum `LOW`/`MEDIUM`/`HIGH` và coi `LOW` là thấp.
  - Điểm AI khi hai lần chấm khớp: tạm lấy trung bình.
  - "Sau khi đóng cửa sổ thi": tạm hiểu là hết pha *Làm test* của đợt. Hệ quả là sinh viên chờ đến hết pha mới có điểm.
  - Khi nào NV chuyển `TEST_GRADED` → `BELOW_THRESHOLD`: PRD không nói. `BELOW_THRESHOLD` là trạng thái cuối, nên chuyển ngay khi có điểm sẽ làm phúc khảo vô tác dụng với NV đó. Story tạm chuyển sau khi hết hạn phúc khảo (AC-14). Phân bổ vẫn lọc theo BR-07 nên không phụ thuộc thời điểm này.
  - ARCH chưa có cột lưu S_final trước phân bổ (`nominations.s_final` chỉ có khi đã đề cử). Cột `preferences.s_final` là đề xuất.
  - Định dạng `custom_id` của ARCH (`{cv_id}:{jd_id}:{prompt_version}`) có dấu `:` và `/`. Cần kiểm bằng skill `claude-api` xem API có nhận không; nếu không thì mã hóa lại.

### Cross-story dependencies

- Builds on [US-4.3](US-4.3-exam-room.md): sự kiện đóng phiên, `exam_answers`, `submitted_at`. `Clock`/`FakeClock` lấy từ [US-1.4](US-1.4-campaign-setup-and-config.md).
- Builds on [US-4.1](US-4.1-exam-blueprint-test-generator.md) / [US-4.2](US-4.2-validator-and-question-bank-lock.md): `answer_key`, `rubric`, tỷ trọng phần trong ma trận đề.
- Builds on [US-3.2](US-3.2-batch-matching-agent.md): cách chạy Message Batches và định dạng fixture `ai-service/tests/fixtures/batches/`; S_cv trong `match_results`.
- Builds on [US-3.3](US-3.3-shortlist-and-preferences.md): bảng chuyển trạng thái hồ sơ ứng tuyển; [US-2.2](US-2.2-llm-client-versioned-prompts.md): `LLMClient`; [US-1.7](US-1.7-notifications-sse-email-reminders.md): thông báo.
- Required by [US-4.5](US-4.5-manual-essay-grading.md): hàng đợi câu `needs_human`, các hàm tính lại S_test/S_final.
- Required by [US-4.6](US-4.6-appeals-and-question-error-reports.md): `results_published_at`, fixture Grader, hàm tính lại điểm.
- Required by [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md): S_test, S_final theo NV và `submitted_at` qua service đã export của `assessment`, làm đầu vào phân bổ.
- Builds on [US-3.1](US-3.1-hard-filters-and-scv-formula.md): `scvX100` và cách làm tròn. Sibling [US-5.1](US-5.1-allocation-engine-property-tests.md): cùng quy ước điểm ×100 (`toCentiScore`) và hàm so sánh phá hòa.
- Required by [US-5.3](US-5.3-hr-nomination-review.md): S_test và bản đồ năng lực trong hồ sơ cho HR (FR-28).
- Required by [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md): đo MAE và kappa của Grader.
- Sibling [US-4.5](US-4.5-manual-essay-grading.md), [US-4.7](US-4.7-cheating-signals.md) (cùng tuần T10): cùng sửa `apps/api/src/modules/assessment/` và `exam_sessions.flags`; story này merge trước.

### Performance budget

- Chuyển người chấm khi hai lần chấm lệch > 15% thang điểm, độ tự tin thấp, hoặc điểm sát θ_test ±5 (EPIC-4 › *Performance budgets*). Bảo vệ bằng `needs-human.spec.ts`.
- Chi phí: ARCH ước tính khoảng 135 USD cho 7.500 lượt chấm (500 sinh viên, mỗi câu 2 lần, qua Batches). Đo lại bằng `ai.llm_calls` sau đợt demo.
- Batches có thể mất đến 24 giờ; kết quả không cần ngay nên chấp nhận được.

### What we explicitly did NOT do

- Không dùng LLM để chấm trắc nghiệm, tính S_test, S_final hay quyết định chuyển người chấm.
- Không tự đánh trượt vì cờ: cờ chỉ chuyển câu cho người chấm.
- Không có màn chấm tay: thuộc [US-4.5](US-4.5-manual-essay-grading.md). Không có phúc khảo: [US-4.6](US-4.6-appeals-and-question-error-reports.md).
- Không đo chất lượng Grader so với người chấm: [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md).

### References

- [Source: PRD › GĐ6 – Chấm test và tính điểm tổng hợp](../../PRD.md)
- [Source: PRD › Cơ chế chấm điểm › Điểm test (S_test), Điểm tổng hợp (S_final)](../../PRD.md)
- [Source: PRD › Kiểm soát rủi ro AI (guardrails)](../../PRD.md)
- [Source: PRD › Functional Requirements (FR-22)](../../PRD.md#functional-requirements)
- [Source: ARCHITECTURE › Pipeline từng agent › Grader](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › LLM usage and cost](../../ARCHITECTURE.md#llm-usage-and-cost)
- [Source: ARCHITECTURE › Luồng làm và chấm bài test](../../ARCHITECTURE.md#messaging-and-data-flow)
- [Source: ARCHITECTURE › Architecture decisions (AD-2, AD-12)](../../ARCHITECTURE.md#architecture-decisions)
- [Source: CONTEXT D2, D5, D10, D12](../../CONTEXT.md)
- [Source: Epic EPIC-4](../epics/EPIC-4.md)

## Verification commands

> Chưa có `package.json`/`pyproject.toml`. Lệnh chạy cụ thể sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `apps/api/src/modules/assessment/domain/scoring.spec.ts` › `GĐ6 multiple choice graded by code, blank = 0, part A on 100 scale` |
| AC-2 | `apps/api/test/assessment/grading.spec.ts` › `GĐ6 essay job published after exam window closes with session ids only; republish does not regrade` |
| AC-3 | `ai-service/tests/agents/test_grader.py` › `test_gd6_two_independent_requests_per_answer_unique_custom_id`, `test_br03_request_has_no_student_fields` |
| AC-4 | `ai-service/tests/agents/test_grader.py` › `test_gd6_instruction_in_answer_ignored_and_flagged`, `test_out_of_range_or_bad_schema_retried_then_needs_human` |
| AC-5 | `ai-service/tests/agents/test_grader.py` › `test_question_score_summed_by_code_both_runs_stored_with_model_prompt_version` |
| AC-6 | `apps/api/src/modules/assessment/domain/needs-human.spec.ts` › `GĐ6 handoff when diff > 15%, low confidence, S_test within θ_test ± 5, flagged; boundaries` |
| AC-7 | `ai-service/tests/agents/test_grader.py` › `test_refused_or_errored_batch_item_resent_sync_then_needs_human_partial` |
| AC-8 | `apps/api/src/modules/assessment/domain/scoring.spec.ts` › `GĐ6 S_test = 0.6A + 0.4B integer rounding table` |
| AC-9 | `apps/api/src/modules/assessment/domain/scoring.spec.ts` › `GĐ6 skill scores per blueprint skill, part D excluded` |
| AC-10 | `apps/api/src/modules/assessment/domain/scoring.spec.ts` › `GĐ6 S_final = α·S_cv + β·S_test in integer x100, rejects α + β ≠ 1` |
| AC-11 | `apps/api/test/assessment/grading.spec.ts` › `GĐ6 all final scores → preferences to graded with audit; needs_human keeps awaiting; 409 on stale row_version; result notification` |
| AC-12 | `apps/api/test/assessment/exam-result.spec.ts` › `GĐ6 owner sees scores without answer_key or rubric; other student 404; other roles 403` |
| AC-13 | `ai-service/tests/agents/test_grader.py` › `test_grader_fixture_set_covers_required_cases` |
| AC-14 | `apps/api/test/assessment/threshold.spec.ts` › `BR-07 after appeal window TEST_GRADED below θ_test → BELOW_THRESHOLD with audit; none before window` |

## Changelog entry

### Added
- Chấm trắc nghiệm bằng code khi phiên thi đóng.
- Grader chấm mỗi câu tự luận hai lần độc lập theo rubric qua Message Batches; bài làm được coi là dữ liệu, câu chứa chỉ dẫn bị gắn cờ.
- Chuyển người chấm khi hai lần chấm lệch > 15% thang điểm, độ tự tin thấp, điểm sát θ_test ±5 hoặc có cờ.
- Code tính S_test = 0,6A + 0,4B, bản đồ năng lực theo kỹ năng và S_final = α·S_cv + β·S_test theo cấu hình đợt, bằng số nguyên ×100; sinh viên xem kết quả của mình.
- Hết hạn phúc khảo, NV có S_test dưới θ_test chuyển sang *Không đạt ngưỡng*.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-22](../../PRD.md#functional-requirements)
- [ARCHITECTURE AD-2, AD-12](../../ARCHITECTURE.md#architecture-decisions)
- [Epic EPIC-4](../epics/EPIC-4.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D2, D12](../../CONTEXT.md)
- [US-4.5 Chấm tay câu tự luận](US-4.5-manual-essay-grading.md)
- [US-5.1 Allocation Engine](US-5.1-allocation-engine-property-tests.md)
