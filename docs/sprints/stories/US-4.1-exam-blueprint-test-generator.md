---
id: US-4.1
title: "Ma trận đề và Test Generator"
epic: EPIC-4
status: backlog
priority: P0
points: 8
sprint:
version_shipped:
prd_ref: [FR-18, NFR-11]
depends_on: [US-2.3, US-2.5]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Mỗi JD đã được HR xác nhận yêu cầu và Trung tâm duyệt có một ma trận đề và một ngân hàng câu hỏi nháp phủ đủ mọi ô kỹ năng × độ khó. Mỗi ô có số câu gấp 3–5 lần số câu cần rút, và không có câu trùng. Ngân hàng là đầu vào cho Validator ([US-4.2](US-4.2-validator-and-question-bank-lock.md)) và phòng thi ([US-4.3](US-4.3-exam-room.md)). Ngân hàng sinh một lần cho mỗi JD, nên chi phí LLM không tăng theo số sinh viên.

## Background

FR-18 yêu cầu AI sinh ngân hàng câu hỏi theo ma trận đề (trắc nghiệm, tự luận kèm rubric). Story này làm phần **sinh**. Validator, khóa và phiên bản ngân hàng thuộc [US-4.2](US-4.2-validator-and-question-bank-lock.md). Theo PRD › GĐ5, sinh đề chạy một lần khi JD được duyệt, trước khi sinh viên làm bài. Test Generator nhận yêu cầu chuẩn hóa và ma trận đề, sinh 3–5 lần số câu cần cho mỗi ô. Câu trắc nghiệm có kỹ năng, độ khó, đáp án, giải thích. Câu tự luận có thêm rubric chấm và đáp án mẫu.

Ma trận đề là cách giữ BR-05: mọi sinh viên dự tuyển cùng JD làm đề tương đương, cùng phân bố kỹ năng × độ khó, số câu và thời gian; chỉ khác câu cụ thể. Cấu trúc đề mặc định theo PRD › GĐ5: phần A 20 câu trắc nghiệm 4 phương án (60% S_test), phần B 2–3 câu tự luận (40%). Phần C (lập trình) là mở rộng (Q7), ngoài phạm vi theo D20. Phần D (xác minh CV) thuộc [US-4.8](US-4.8-cv-verification-questions-trust-score.md).

Theo ARCH › *"Agent" trong hệ thống này nghĩa là gì*, Test Generator là agent duy nhất trong MVP chạy **vòng lặp có công cụ**: `get_blueprint_coverage()`, `find_similar_questions(text)`, `submit_questions(questions)`. Công cụ chỉ ghi được câu hỏi nháp. ARCH › *Bản đồ sử dụng LLM theo giai đoạn* xếp tác vụ này `effort: high`, chạy job nền. NFR-11 và ARCH › *Tối ưu chi phí* yêu cầu sinh ngân hàng một lần cho mỗi JD (hoặc mỗi nhóm vị trí), không sinh riêng cho từng sinh viên. Ước tính thô ở ARCH là khoảng 145 USD cho 50 ngân hàng.

Quyết định liên quan: D2 (LLM không tính điểm), D5 (job AI bất đồng bộ, payload chỉ có ID), D10 (một model, `effort` theo tác vụ, mọi lượt gọi qua `LLMClient`), D12 (prompt có phiên bản, kết quả lưu `model` + `prompt_version`).

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** một JD có `requirements` đã được HR xác nhận, kỹ năng bắt buộc có trọng số, **When** hàm thuần `buildDefaultBlueprint(requirements, defaults)` chạy, **Then** nó trả về ma trận phần A có 20 câu, chia theo kỹ năng tỷ lệ với trọng số, mỗi kỹ năng chia theo độ khó Dễ/Trung bình/Khó, cùng phần B 2–3 câu tự luận, tỷ trọng A/B = 0,6/0,4 và thời gian bằng `campaigns.config.T_test` **And** cùng đầu vào luôn cho cùng ma trận (cách làm tròn số câu mỗi ô là tất định, tổng luôn đúng số câu).
- [ ] **AC-2** — Ma trận đề có Zod schema `examBlueprintSchema` trong `packages/shared/schemas`. Schema bắt buộc: tổng số câu các ô phần A bằng số câu phần A; tỷ trọng các phần cộng lại bằng 1; mọi kỹ năng trong ma trận có trong `requirements` của JD; chỉ có phần A và B (không có phần C, Q7). Dữ liệu sai schema thì API trả `400` kèm lỗi theo từng trường.
- [ ] **AC-3** — **Given** người dùng vai trò `CENTER`, **When** gọi `GET`/`PUT /api/jds/{id}/exam-blueprint` (đề xuất) trước khi ngân hàng của JD bị khóa, **Then** xem và sửa được ma trận **And** vai trò `HR`, `STUDENT` nhận `403` **And** sửa khi ngân hàng đã khóa thì nhận `409`.
- [ ] **AC-4** — **Given** JD chuyển sang *Đã duyệt* (HR đã xác nhận yêu cầu và Trung tâm đã duyệt, BR-02), **When** module `assessment` nhận sự kiện JD được duyệt, **Then** nó tạo một bản ghi `question_banks` với `blueprint` là bản chụp ma trận của JD, `version = 1`, và phát đúng một message `ai.questions.generate` có payload `{ job_id, bank_id }` **And** nhận trùng sự kiện không tạo thêm ngân hàng hay job **And** JD chưa đủ hai bước xác nhận/duyệt thì không có ngân hàng.
- [ ] **AC-5** — **Given** LLM được thay bằng fixture nhiều lượt, **When** agent chạy, **Then** nó gọi `get_blueprint_coverage()`, `find_similar_questions()`, `submit_questions()` lặp lại cho đến khi mọi ô có từ 3 đến 5 lần số câu cần **And** khi chạm giới hạn số vòng hoặc số token thì dừng, trả `status = PARTIAL` kèm danh sách ô còn thiếu, không lặp vô hạn.
- [ ] **AC-6** — Agent có đúng ba công cụ ở trên. Công cụ chỉ ghi vào bảng nháp `ai.question_drafts` (đề xuất) và `ai.embeddings`; không có công cụ nào ghi schema `core`, đổi trạng thái hay gọi mạng ngoài. Integration test xác nhận tài khoản DB của AI Service bị từ chối khi ghi `core.questions`.
- [ ] **AC-7** — **Given** `submit_questions` nhận một lô câu, **When** một câu sai schema (trắc nghiệm không đủ 4 phương án hoặc không đúng 1 đáp án đúng; thiếu giải thích; tự luận thiếu rubric có điểm tối đa từng tiêu chí hoặc thiếu đáp án mẫu; kỹ năng hoặc độ khó không có trong ma trận), **Then** câu đó bị loại, không được lưu, và agent nhận lý do loại cho từng câu **And** các câu hợp lệ trong cùng lô vẫn được lưu.
- [ ] **AC-8** — **Given** ngân hàng đã có câu X, **When** agent nộp câu trùng nguyên văn (sau khi chuẩn hóa khoảng trắng, hoa thường) hoặc câu có cosine embedding với X ≥ ngưỡng trùng (tham số, đề xuất 0,9), **Then** câu mới bị loại với lý do `DUPLICATE` kèm mã câu gần nhất **And** ngân hàng cuối cùng không có cặp câu nào vượt ngưỡng.
- [ ] **AC-9** — **Given** job xong, **When** AI Service trả `ai.results` loại `QUESTIONS_GENERATE` (đề xuất) với `status` `SUCCEEDED`/`PARTIAL`/`FAILED`, **Then** Core Backend upsert các câu vào `questions` với `status = DRAFT`, mỗi câu lưu kèm `model` và `prompt_version` **And** nhận trùng message cùng `job_id` không sinh dòng trùng.
- [ ] **AC-10** — Mọi lượt gọi LLM của agent đi qua `LLMClient` (US-2.2) với `effort: high`, kiểm tra `stop_reason == "refusal"` trước khi đọc nội dung, và ghi một dòng `ai.llm_calls` với `agent = test_generator`. Prompt nằm ở `ai-service/app/prompts/test_generator/v1.md`. Yêu cầu JD là khối dữ liệu riêng, JSON có `sort_keys=True`. `system` không chứa thời gian hay ID ngẫu nhiên. Thư mục agent không import SDK Anthropic trực tiếp.
- [ ] **AC-11** — **Given** Cán bộ Trung tâm mở JD đã duyệt ở cổng Trung tâm, **When** job đang chạy hoặc đã xong, **Then** màn hình hiện trạng thái job và độ phủ từng ô (số câu cần, số câu nháp hiện có) **And** có trạng thái rỗng, đang tải, lỗi, chuỗi giao diện tiếng Việt.

## Tasks

- [ ] **TASK-4.1.1** — Đọc skill `claude-api` trước khi viết code gọi LLM — không viết tham số API theo trí nhớ (AC: 5, 10)
  - [ ] Subtask 4.1.1.1 — Ghi vào Implementation notes: cách khai báo `tools`, vòng lặp `tool_use`/`tool_result`, `output_config.effort`, xử lý `refusal` của `claude-opus-5-5`; không dùng `tool_choice` để ép gọi công cụ (AGENTS › Gọi Claude API).
- [ ] **TASK-4.1.2** — Ma trận đề: schema và hàm thuần (AC: 1, 2)
  - [ ] Subtask 4.1.2.1 — `packages/shared/schemas/exam-blueprint.ts`: `examBlueprintSchema` (phần A theo ô kỹ năng × độ khó, phần B, tỷ trọng, thời gian).
  - [ ] Subtask 4.1.2.2 — `apps/api/src/modules/assessment/domain/blueprint.ts`: `buildDefaultBlueprint()`, chia số câu theo trọng số bằng cách làm tròn tất định (đề xuất: phần dư lớn nhất, hòa thì theo tên kỹ năng).
  - [ ] Subtask 4.1.2.3 — `apps/api/src/modules/assessment/domain/blueprint.spec.ts`: ví dụ "Thực tập sinh Backend Java" ở PRD › GĐ5 là một test cố định.
- [ ] **TASK-4.1.3** — Bảng, API ma trận và khởi tạo ngân hàng (AC: 3, 4)
  - [ ] Subtask 4.1.3.1 — `apps/api/src/db/` + migration `apps/api/drizzle/`: bảng `question_banks`, `questions` theo ARCH › *Các bảng chính* (`index(bank_id, skill, difficulty, status)`).
  - [ ] Subtask 4.1.3.2 — `apps/api/src/modules/assessment/api/blueprint.controller.ts`: `GET`/`PUT /api/jds/{id}/exam-blueprint`, guard `@Roles('CENTER')`.
  - [ ] Subtask 4.1.3.3 — `apps/api/src/modules/assessment/application/question-bank.service.ts`: nghe sự kiện JD được duyệt (qua `@nestjs/event-emitter`, không đọc bảng của `company`), tạo ngân hàng, gọi `aigateway` phát job.
  - [ ] Subtask 4.1.3.4 — `packages/shared/contracts/questions-generate.ts`: Zod schema cho `ai.questions.generate` và kết quả `QUESTIONS_GENERATE`, sinh JSON Schema → Pydantic theo AD-6.
- [ ] **TASK-4.1.4** — Công cụ và vòng lặp agent (AC: 5, 6, 7)
  - [ ] Subtask 4.1.4.1 — `ai-service/app/schemas/question.py`: model Pydantic cho câu trắc nghiệm và tự luận (đầu ra LLM).
  - [ ] Subtask 4.1.4.2 — `ai-service/app/agents/test_generator/tools.py`: ba công cụ; `submit_questions` kiểm schema rồi ghi `ai.question_drafts` (đề xuất; migration theo cách US-2.1 quản lý schema `ai`).
  - [ ] Subtask 4.1.4.3 — `ai-service/app/agents/test_generator/agent.py`: vòng lặp đến khi đủ độ phủ hoặc chạm giới hạn số vòng/token (hằng số trong `ai-service/app/agents/test_generator/config.py`, đề xuất).
- [ ] **TASK-4.1.5** — Chống trùng bằng embedding (AC: 8)
  - [ ] Subtask 4.1.5.1 — `find_similar_questions` và bước kiểm trùng trong `submit_questions` dùng `ai-service/app/embedding/` (US-2.5), lưu vector câu vào `ai.embeddings` với `owner_type = question`.
- [ ] **TASK-4.1.6** — Prompt, consumer và nhận kết quả ở backend (AC: 9, 10)
  - [ ] Subtask 4.1.6.1 — `ai-service/app/prompts/test_generator/v1.md`: phần cố định (hướng dẫn, ràng buộc chất lượng, câu hỏi viết tiếng Việt) ở đầu; yêu cầu JD và ma trận ở cuối, trong thẻ dữ liệu riêng.
  - [ ] Subtask 4.1.6.2 — `ai-service/app/consumers/questions_generate.py`: FastStream subscriber, kiểm `ai.jobs` trước khi xử lý (idempotent).
  - [ ] Subtask 4.1.6.3 — `apps/api/src/modules/assessment/application/question-results.handler.ts`: upsert `questions` (`DRAFT`, `model`, `prompt_version`) theo `job_id`.
- [ ] **TASK-4.1.7** — Màn hình độ phủ ngân hàng ở cổng Trung tâm (AC: 3, 11)
  - [ ] Subtask 4.1.7.1 — Đọc `DESIGN.md` trước khi code, ghi `Design applied: …` vào story.
  - [ ] Subtask 4.1.7.2 — `apps/web/src/features/center/question-bank/`: bảng ma trận (sửa được trước khi khóa), độ phủ từng ô, trạng thái job; dùng component shadcn.
- [ ] **TASK-4.1.8** — Fixture và test (AC: 4, 5, 6, 7, 8, 9)
  - [ ] Subtask 4.1.8.1 — `ai-service/tests/fixtures/test_generator/`: kịch bản nhiều lượt (gọi công cụ → nhận kết quả → gọi tiếp → kết thúc), một kịch bản chạm giới hạn vòng, một kịch bản `refusal`. Đây là hạ tầng dùng chung với US-4.8.
  - [ ] Subtask 4.1.8.2 — `ai-service/tests/agents/test_test_generator.py` và `apps/api/test/assessment/question-bank.spec.ts`.

## Dev notes

### Architecture constraints

- [AD-2](../../ARCHITECTURE.md#architecture-decisions): LLM chỉ sinh nội dung câu hỏi theo schema. Code quyết định câu nào được nhận (kiểm schema, kiểm trùng) và đếm độ phủ.
- [AD-4](../../ARCHITECTURE.md#architecture-decisions): AI Service chỉ ghi schema `ai`. ARCH › *Pipeline từng agent* nói `submit_questions` "lưu dạng nháp", nhưng `questions` thuộc `core`. Vì vậy nháp nằm ở `ai.question_drafts` (tên đề xuất), còn Core Backend ghi `questions` khi nhận `ai.results`. Phương án cho AI Service ghi thẳng `core.questions` bị loại vì trái AD-4 và nguyên tắc 3 ở AGENTS.
- [AD-5](../../ARCHITECTURE.md#architecture-decisions): queue `ai.questions.generate` chỉ mang `job_id`, `bank_id`. AI Service đọc yêu cầu JD qua view `core.v_ai_jd_requirements`; ma trận đọc qua view chỉ đọc của `question_banks` (đề xuất `core.v_ai_question_banks`).
- [AD-6](../../ARCHITECTURE.md#architecture-decisions): hợp đồng message định nghĩa một lần bằng Zod ở `packages/shared/contracts`, không viết tay model Pydantic.
- [AD-10](../../ARCHITECTURE.md#architecture-decisions): một model `claude-opus-5-5`, `effort: high`. Không dùng `tool_choice` để ép gọi công cụ (Opus 5.5 không hỗ trợ).
- [AD-12](../../ARCHITECTURE.md#architecture-decisions): prompt là file có phiên bản; đã dùng thì không sửa mà tạo `v2`.
- Ranh giới module (AGENTS › Nguyên tắc 13): `assessment` không đọc bảng `job_descriptions`. Nó nhận ma trận và yêu cầu qua service đã export của `company` hoặc qua sự kiện.
- Ma trận có ở hai chỗ trong ARCH: `job_descriptions.exam_blueprint` và `question_banks.blueprint`. Story này hiểu cột thứ nhất là cấu hình đề theo JD, cột thứ hai là bản chụp lúc sinh ngân hàng. Cách hiểu này cần xác nhận.
- **Chạm Q2:** tạm dùng Đề xuất "Theo JD; các JD cùng nhóm vị trí được phép dùng chung". Đưa thành tham số `campaigns.config.share_exam_by_position_group` (mặc định `false`, nghĩa là mỗi JD một ngân hàng). Khi bật, `question_banks` gắn với `position_group` thay vì `jd_id`. Chưa rõ ma trận chung của nhóm lấy từ JD nào. Hỏi trước khi chốt.
- **Chạm Q7:** tạm dùng Đề xuất "MVP dùng trắc nghiệm + tự luận"; phần C ngoài phạm vi (D20). Schema ma trận không có phần C. Hỏi trước khi chốt.
- **Điểm chưa rõ trong spec:** ai sửa ma trận đề (story tạm cho `CENTER`); ngưỡng cosine coi là trùng; giới hạn số vòng/token của agent; phân bố độ khó mặc định (tạm theo ví dụ GĐ5: 8/9/3 trên 20 câu). Các giá trị này để thành tham số và hỏi trước khi chốt.

### Cross-story dependencies

- Builds on [US-2.3](US-2.3-jd-analyzer-hr-requirement-confirmation.md): `job_descriptions.requirements` đã xác nhận, `position_group`, sự kiện JD được duyệt; view `core.v_ai_jd_requirements`.
- Builds on [US-2.5](US-2.5-embeddings-skill-catalog.md): `ai-service/app/embedding/` (bge-m3) và `ai.embeddings` để tìm câu gần nhất.
- Builds on [US-2.1](US-2.1-ai-job-pipeline-message-contracts.md) và [US-2.2](US-2.2-llm-client-versioned-prompts.md): `aigateway`, `ai.jobs`, `ai.results`, `LLMClient` có chế độ fixture.
- Builds on [US-1.4](US-1.4-campaign-setup-and-config.md): `campaigns.config` (`T_test`) và [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md): `@Roles()`, `DESIGN.md`.
- Required by [US-4.2](US-4.2-validator-and-question-bank-lock.md): Validator chạy trên câu `DRAFT` và đẩy câu bị loại về vòng sinh tiếp theo của agent này.
- Required by [US-4.3](US-4.3-exam-room.md): rút đề theo `question_banks.blueprint`.
- Required by [US-4.8](US-4.8-cv-verification-questions-trust-score.md): dùng lại fixture nhiều lượt `ai-service/tests/fixtures/test_generator/`.
- Required by [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md): đo tỷ lệ câu hợp lệ, độ khó thực tế.
- Sibling [US-3.2](US-3.2-batch-matching-agent.md) (cùng tuần T7): cả hai thêm loại message vào `packages/shared/contracts`; story nào xong trước merge trước (D20).

### Performance budget

- Kích thước ngân hàng: mỗi ô có 3–5 lần số câu cần rút (EPIC-4 › *Performance budgets*). Đo bằng `get_blueprint_coverage()` ở cuối job và bằng test AC-5.
- Chi phí: ARCH ước tính khoảng 145 USD cho 50 ngân hàng, tức khoảng 2,9 USD/ngân hàng (vào ~170K, ra ~110K token, gồm cả Validator). Đo lại bằng `ai.llm_calls` sau khi chạy thử một JD, ghi số thật vào Implementation notes.

### What we explicitly did NOT do

- Không có Validator, khóa ngân hàng hay phiên bản sau khóa: thuộc [US-4.2](US-4.2-validator-and-question-bank-lock.md).
- Không sinh câu riêng cho từng sinh viên: trái BR-05 và NFR-11.
- Không có phần C lập trình (Q7, D20) và phần D xác minh CV ([US-4.8](US-4.8-cv-verification-questions-trust-score.md)).
- Không có HR/giảng viên duyệt mẫu: thuộc [US-4.9](US-4.9-question-bank-sample-review.md).
- Không dùng Message Batches: vòng lặp công cụ cần phản hồi từng lượt. Xem lại nếu chi phí đo được vượt nhiều so với ước tính.

### References

- [Source: PRD › GĐ5 – Sinh và tổ chức bài test](../../PRD.md)
- [Source: PRD › Functional Requirements (FR-18), Non-Functional Requirements (NFR-11)](../../PRD.md#functional-requirements)
- [Source: PRD › Quy tắc nghiệp vụ (BR-02, BR-05)](../../PRD.md)
- [Source: ARCHITECTURE › AI Service và các AI Agent (Test Generator, Quản lý prompt)](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › LLM usage and cost](../../ARCHITECTURE.md#llm-usage-and-cost)
- [Source: ARCHITECTURE › Data architecture (Các bảng chính, Phân vùng schema)](../../ARCHITECTURE.md#data-architecture)
- [Source: ARCHITECTURE › Messaging and data flow (Hàng đợi)](../../ARCHITECTURE.md#messaging-and-data-flow)
- [Source: CONTEXT D2, D5, D10, D12, D20](../../CONTEXT.md)
- [Source: Epic EPIC-4](../epics/EPIC-4.md)

## Verification commands

> Chưa có `package.json`/`pyproject.toml`. Lệnh chạy cụ thể sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `apps/api/src/modules/assessment/domain/blueprint.spec.ts` › `GĐ5 default blueprint: 20 MC split by skill weight, deterministic rounding`; `GĐ5 PRD example Backend Java blueprint` |
| AC-2 | `packages/shared/schemas/exam-blueprint.spec.ts` › `BR-05 blueprint rejects cell sum mismatch, weights ≠ 1, unknown skill, part C` |
| AC-3 | `apps/api/test/assessment/blueprint.spec.ts` › `GĐ5 CENTER edits blueprint; HR/STUDENT 403; 409 after bank locked` |
| AC-4 | `apps/api/test/assessment/question-bank.spec.ts` › `BR-02 approved JD creates one bank and one ai.questions.generate job; duplicate event is idempotent` |
| AC-5 | `ai-service/tests/agents/test_test_generator.py` › `test_gd5_loop_until_every_cell_3x`, `test_gd5_stops_at_turn_limit_returns_partial` |
| AC-6 | `ai-service/tests/agents/test_test_generator.py` › `test_tool_registry_has_exactly_three_tools`; `ai-service/tests/integration/test_db_permissions.py` › `test_ai_role_cannot_write_core_questions` |
| AC-7 | `ai-service/tests/agents/test_test_generator.py` › `test_submit_rejects_invalid_questions_with_reasons_keeps_valid_ones` |
| AC-8 | `ai-service/tests/agents/test_test_generator.py` › `test_submit_rejects_exact_and_near_duplicates` |
| AC-9 | `apps/api/test/assessment/question-results.spec.ts` › `GĐ5 results upsert DRAFT questions with model and prompt_version; duplicate job_id no new rows` |
| AC-10 | `rg -n "import anthropic\|from anthropic" ai-service/app/agents/test_generator` trả về 0 dòng; `ai-service/tests/agents/test_test_generator.py` › `test_effort_high_refusal_checked_llm_call_logged` |
| AC-11 | `apps/web/e2e/center-question-bank.spec.ts` (Playwright, đề xuất) › `GĐ5 coverage table shows needed/drafted per cell, empty/loading/error states` |

## Changelog entry

### Added
- Ma trận đề theo JD (`examBlueprintSchema`, `buildDefaultBlueprint`): mặc định 20 câu trắc nghiệm chia theo trọng số kỹ năng và độ khó, 2–3 câu tự luận, tỷ trọng 60/40; Trung tâm xem và sửa trước khi khóa.
- Test Generator, agent có công cụ (`get_blueprint_coverage`, `find_similar_questions`, `submit_questions`), sinh ngân hàng câu hỏi nháp gấp 3–5 lần số câu mỗi ô, loại câu sai schema và câu trùng.
- Bảng `question_banks`, `questions`; queue `ai.questions.generate`; ngân hàng tự tạo khi JD được duyệt.
- Fixture nhiều lượt cho vòng lặp tool-use ở `ai-service/tests/fixtures/test_generator/`.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-18, NFR-11](../../PRD.md#functional-requirements)
- [Epic EPIC-4](../epics/EPIC-4.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D2, D5, D10, D12, D20](../../CONTEXT.md)
- [US-4.2 Validator và khóa ngân hàng](US-4.2-validator-and-question-bank-lock.md)
- [US-4.8 Câu hỏi xác minh CV](US-4.8-cv-verification-questions-trust-score.md)
