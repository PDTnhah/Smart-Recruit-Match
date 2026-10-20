---
id: US-2.2
title: "LLMClient và prompt có phiên bản"
epic: EPIC-2
status: review
priority: P0
points: 5
sprint: sprint-2026-W43
version_shipped: 0.8.0
prd_ref: [NFR-11, NFR-12]
arch_ref: [AD-10, AD-12]
depends_on: [US-2.1]
assignee: PDTnhah
commit: 2cca379c9a1f128774776e8b7610e3fbe9604ffb
created: 2026-10-07
updated: 2026-10-20
external_deps: [gemini_api, anthropic_api]
---

## Goal

Mọi lượt gọi Claude trong AI Service đi qua một lớp duy nhất là `LLMClient`. Lớp này ghi rõ `effort`, lấy JSON bằng structured outputs, kiểm tra refusal trước khi đọc nội dung, thử lại khi sai schema, và ghi usage, chi phí, `model`, `prompt_version` của từng lượt vào `ai.llm_calls`. Prompt là file có phiên bản, bản đã dùng thì không sửa. Test chạy bằng fixture, không gọi API thật. Nhờ vậy các agent ở US-2.3, US-2.4, EPIC-3 và EPIC-4 chỉ còn viết prompt và schema của mình. US-6.2 có sẵn dữ liệu chi phí.

## Background

AD-10 ([D10](../../CONTEXT.md)) chọn một model `claude-opus-5-5` cho mọi agent và chỉnh độ sâu suy luận bằng `output_config.effort`. ARCH › *Chọn model* nêu ba đặc điểm API cần xử lý: model luôn suy luận và `effort` mặc định là `medium`, nên phải ghi rõ cho từng tác vụ; không hỗ trợ ép gọi công cụ bằng `tool_choice`, muốn có JSON thì dùng `output_config.format`; luôn kiểm tra `stop_reason == "refusal"` trước khi đọc nội dung. AGENTS › *Gọi Claude API* biến các điểm này thành quy tắc bắt buộc.

AD-12 ([D12](../../CONTEXT.md)) yêu cầu prompt là file có phiên bản trong git (`ai-service/app/prompts/<agent>/v<N>.md`, Jinja2). Mọi kết quả lưu kèm `prompt_version` và `model` (AGENTS › Nguyên tắc 12). Phần cố định của prompt đặt đầu, phần thay đổi đặt cuối, không chèn thời gian hay ID ngẫu nhiên vào `system`, JSON đưa vào prompt dùng `sort_keys=True` để prompt caching hoạt động (ARCH › *Quản lý prompt*). Phần Message Batches và cache theo JD được dùng ở US-3.2 và EPIC-4; story này chỉ dựng nền.

PRD › *Kiểm soát rủi ro AI (guardrails)* quy định: sai schema thì thử lại tối đa 2 lần, vẫn lỗi thì chuyển người xử lý; lưu prompt, phản hồi, phiên bản mô hình và thời điểm của mọi lượt gọi AI ảnh hưởng đến điểm. NFR-11 yêu cầu theo dõi token và chi phí; NFR-12 yêu cầu lớp trừu tượng để đổi nhà cung cấp mà không sửa nghiệp vụ. Câu hỏi Q8 (API thương mại hay mô hình mở tự host) chưa chốt, nên story chỉ thiết kế để đổi được.

**Lessons applied**: §4 (code chỉ phụ thuộc biến `MINIO_*`, không phụ thuộc server cụ thể), §6 (commit cả `drizzle/meta`, mốc thời gian migration tăng dần), §14 (biến môi trường rỗng coi như chưa đặt), §17 (lỗi LLM phân loại rõ `RetryableError` / `PermanentError`, không để thư viện tự quyết), §18 (Dockerfile giữ layer phụ thuộc riêng; thêm thư viện thì layer đó build lại một lần).

### Story refresh (2026-10-20)

Spec đổi theo [CONTEXT D34](../../CONTEXT.md): cài hai nhà cung cấp sau `LLMClient`, mặc định Gemini (`gemini-3.8-flash`), Claude (`claude-opus-5-5`) là phương án thay thế. Các AC bên dưới đọc theo cách sau; chỗ nào khác chữ gốc thì theo khối này:

- **AC-1:** `model` đọc từ cấu hình theo nhà cung cấp (`LLM_PROVIDER`, `LLM_MODEL`). Effort luôn tường minh: Claude `output_config.effort`, Gemini `thinking_config.thinking_level`. Schema đầu ra: Claude `output_config.format`, Gemini `response_json_schema`. Không `temperature`, không `tool_choice`.
- **AC-3:** refusal chuẩn hóa thành `StopReason.REFUSAL`. Claude: `stop_reason == "refusal"`, category lấy từ `stop_details.category`. Gemini: `prompt_feedback.block_reason`, hoặc `finish_reason` thuộc nhóm an toàn, category là mã gốc. `ai.llm_calls` ghi `stop_reason = REFUSAL`, `outcome = REFUSED`, mã gốc ở `raw_stop_reason`.
- **AC-4:** `MAX_TOKENS` và `OTHER` (Gemini `LANGUAGE`, `MALFORMED_FUNCTION_CALL`…) xử lý như sai schema.
- **AC-5:** thêm cột `provider`, `attempt`, `outcome`, `raw_stop_reason`. Lỗi API sau khi SDK đã thử lại cũng ghi một dòng (`outcome = API_ERROR`, `model` là model cấu hình vì không có phản hồi).
- **AC-11:** không cần `GEMINI_API_KEY`, `GOOGLE_API_KEY` hay `ANTHROPIC_API_KEY`; fixture trung lập nhà cung cấp.
- **AC-12:** chỉ `ai-service/app/llm/` được import `anthropic` và `google.genai`.
- `fallbacks` chỉ có ở Claude; Gemini không có model dự phòng phía server.
- Agent lấy tên từ `prompt_version` của prompt đã render, không truyền riêng (tránh lệch giữa hai giá trị).
- Không nối `LLMClient` vào `worker.py`, không thêm biến LLM vào compose: US-2.3 làm khi có handler thật đầu tiên.

## Acceptance criteria

- [x] **AC-1** — **Given** một agent gọi `LLMClient`, **When** request được dựng, **Then** `model` là `claude-opus-5-5` (đọc từ cấu hình, không viết cứng trong agent), `output_config.effort` luôn có giá trị tường minh, `output_config.format` chứa JSON Schema của schema đầu ra **And** request không có `tool_choice` loại `any`/`tool`, không có `temperature`.
- [x] **AC-2** — **Given** một agent gọi `LLMClient` mà không truyền `effort`, **When** chạy, **Then** lỗi ngay ở lúc gọi (tham số bắt buộc, không có giá trị mặc định ngầm). Bảng effort của từng agent khớp ARCH › *Bản đồ sử dụng LLM theo giai đoạn*.
- [x] **AC-3** — **Given** phản hồi có `stop_reason == "refusal"`, **When** `LLMClient` xử lý, **Then** không đọc `content`, ghi `ai.llm_calls` với `stop_reason = refusal`, ném `NeedsHumanReview` (một `PermanentError` của US-2.1) kèm `stop_details.category` nếu có.
- [x] **AC-4** — **Given** phản hồi không qua được kiểm tra Pydantic (hoặc `stop_reason == "max_tokens"`), **When** `LLMClient` xử lý, **Then** thử lại tối đa 2 lần; lần thứ 3 vẫn lỗi thì ném `NeedsHumanReview`. Mỗi lần thử ghi một dòng `ai.llm_calls`.
- [x] **AC-5** — **Given** một lượt gọi xong (thành công hay lỗi), **When** kiểm tra `ai.llm_calls`, **Then** có một dòng với `job_id`, `agent`, `prompt_version` (dạng `<agent>/v<N>`), `model` (model thực sự trả lời, lấy từ phản hồi), `effort`, `input_tokens`, `cache_read_tokens`, `cache_write_tokens`, `output_tokens`, `cost_usd`, `latency_ms`, `stop_reason`, `log_key`, `created_at`. `cost_usd` tính từ usage theo bảng giá cấu hình được.
- [x] **AC-6** — **Given** một lượt gọi, **When** xong, **Then** request và phản hồi đầy đủ được lưu thành file JSON trong bucket MinIO `llm-logs` tại `log_key`, không lưu trong DB.
- [x] **AC-7** — **Given** `LLMClient` trả kết quả thành công, **When** agent nhận, **Then** kết quả là object Pydantic đã kiểm, kèm `model` và `prompt_version` để agent đưa vào `ai.results`.
- [x] **AC-8** — **Given** file prompt `ai-service/app/prompts/<agent>/v<N>.md` đã được ghi trong manifest, **When** nội dung file bị sửa, **Then** test kiểm tra manifest thất bại và yêu cầu tạo `v<N+1>`. Phiên bản prompt đang dùng của mỗi agent được chọn bằng cấu hình, không tự lấy file mới nhất.
- [x] **AC-9** — **Given** hai lần dựng request cho cùng agent với dữ liệu khác nhau, **When** so sánh phần `system`, **Then** phần `system` giống hệt từng byte (không có thời gian, UUID); dữ liệu thay đổi nằm sau phần cố định; mọi JSON đưa vào prompt được dump bằng helper `sort_keys=True`.
- [x] **AC-10** — **Given** CV/JD/bài làm đưa vào prompt, **When** dựng request, **Then** dữ liệu nằm trong khối thẻ riêng (VD `<cv_document>…</cv_document>`) ở phần `user`, thẻ đóng xuất hiện trong dữ liệu bị vô hiệu hóa, và phần `system` nói rõ nội dung trong thẻ là dữ liệu, không phải chỉ dẫn (AGENTS › Nguyên tắc 6).
- [x] **AC-11** — **Given** chế độ fixture (mặc định khi chạy test), **When** chạy toàn bộ test của `ai-service/tests/`, **Then** không có lượt gọi mạng nào tới Claude API và không cần `ANTHROPIC_API_KEY`. Fixture thiếu thì test lỗi rõ ràng, không rơi sang gọi API thật. Fixture mô phỏng được: thành công, refusal, sai schema, `max_tokens`.
- [x] **AC-12** — **Given** mã nguồn `ai-service/app/agents/`, **When** quét import, **Then** không agent nào import `anthropic` trực tiếp; chỉ `ai-service/app/llm/` được import SDK.

## Tasks

- [x] **TASK-2.2.1** — Dùng skill `claude-api` trước khi viết code gọi LLM; không viết tham số API theo trí nhớ (AC: 1, 3, 5)
  - [x] Subtask 2.2.1.1 — Đối chiếu với skill: tên tham số `output_config.effort`, `output_config.format`, cách đọc `stop_reason`/`stop_details`, tên trường usage cache (`cache_read_input_tokens`, `cache_creation_input_tokens`), tham số `fallbacks` + beta header cho lượt gọi đồng bộ (ARCH › *Code mẫu – lượt gọi của Matching Agent*), giới hạn JSON Schema của structured outputs, giá hiện hành của `claude-opus-5-5`.
  - [x] Subtask 2.2.1.2 — Ghi kết quả đối chiếu (phiên bản SDK, tham số đã kiểm) vào *Implementation notes*.
- [x] **TASK-2.2.2** — `LLMClient` và bản cài đặt Anthropic (AC: 1, 2, 3, 4, 7, 12)
  - [x] Subtask 2.2.2.1 — `ai-service/app/llm/client.py`: `Protocol` `LLMClient` với hàm sinh đầu ra có cấu trúc (tham số: `agent`, `prompt`, `output_model`, `effort` bắt buộc, `job_id`, tài liệu đính kèm tùy chọn) trả `LLMResult[T]` (`data`, `model`, `prompt_version`, `call_id`). *(agent lấy từ `prompt.prompt_version`; tài liệu đính kèm để US-2.4 thêm khi cần gửi PDF scan, xem Implementation notes)*
  - [x] Subtask 2.2.2.2 — `ai-service/app/llm/anthropic_client.py`: dùng Anthropic Python SDK; kiểm refusal trước; validate bằng Pydantic; thử lại khi sai schema tối đa 2 lần; ném `NeedsHumanReview`. Lỗi mạng/429/5xx để SDK tự thử lại, hết lượt thì ném `RetryableError` cho tầng job (US-2.1). *(theo D34: lõi chung `app/llm/structured.py` + `app/llm/providers/anthropic_provider.py` và `gemini_provider.py`)*
  - [x] Subtask 2.2.2.3 — `ai-service/app/llm/effort.py`: bảng effort theo agent lấy từ ARCH › *Bản đồ sử dụng LLM* (`jd_analyzer`, `cv_parser`, chuẩn hóa kỹ năng: `low`; `matching`, câu hỏi xác minh CV: `medium`; `test_generator`, `validator`, `grader`: `high`).
  - [x] Subtask 2.2.2.4 — `ai-service/app/llm/settings.py`: `model`, chế độ (`live` / `fixture`), bảng giá, tên bucket log — đọc từ biến môi trường; API key chỉ nằm ở AI Service (ARCH › *Security architecture*).
- [x] **TASK-2.2.3** — Ghi `ai.llm_calls` và log MinIO (AC: 5, 6)
  - [x] Subtask 2.2.3.1 — Migration Drizzle trong `apps/api/drizzle/`: bảng `ai.llm_calls` đúng cột ARCH › *Các bảng chính*, `index(agent, created_at)`; quyền ghi cho role `ai_service`.
  - [x] Subtask 2.2.3.2 — `ai-service/app/llm/usage.py`: tính `cost_usd` từ usage (token vào, cache đọc, cache ghi, token ra) và bảng giá.
  - [x] Subtask 2.2.3.3 — Ghi file JSON request/phản hồi vào bucket `llm-logs`; khóa dạng `<agent>/<yyyy>/<mm>/<call_id>.json` (đề xuất).
- [x] **TASK-2.2.4** — Prompt có phiên bản (AC: 8, 9, 10)
  - [x] Subtask 2.2.4.1 — `ai-service/app/prompts/registry.py`: nạp `ai-service/app/prompts/<agent>/v<N>.md` bằng Jinja2, trả `prompt_version = "<agent>/v<N>"`; phiên bản đang dùng của từng agent lấy từ cấu hình.
  - [x] Subtask 2.2.4.2 — `ai-service/app/prompts/manifest.json` (đề xuất): băm SHA-256 của mọi file prompt đã phát hành; test so băm.
  - [x] Subtask 2.2.4.3 — `ai-service/app/llm/render.py`: helper `dumps_sorted()` (`ensure_ascii=False`, `sort_keys=True`) và helper bọc dữ liệu không tin cậy trong thẻ, vô hiệu hóa thẻ đóng lẫn trong dữ liệu.
- [x] **TASK-2.2.5** — Chế độ fixture (AC: 11)
  - [x] Subtask 2.2.5.1 — `ai-service/app/llm/fixture_client.py`: tra phản hồi theo khóa băm của (agent, `prompt_version`, request đã chuẩn hóa) trong `ai-service/tests/fixtures/llm/<agent>/`. *(`app/llm/providers/fixture_provider.py`)*
  - [x] Subtask 2.2.5.2 — `ai-service/tests/conftest.py`: ép chế độ fixture, xóa `ANTHROPIC_API_KEY`, chặn khởi tạo client thật. *(chặn kết nối ra ngoài thay cho chặn khởi tạo client: mạnh hơn và bắt được cả SDK; LESSONS §19)*
  - [x] Subtask 2.2.5.3 — Fixture dùng chung: `success`, `refusal`, `invalid_schema`, `max_tokens` cho một agent mẫu.
- [x] **TASK-2.2.6** — Test (AC: 1–12)
  - [x] Subtask 2.2.6.1 — `ai-service/tests/llm/test_llm_client.py`, `ai-service/tests/llm/test_usage_cost.py`, `ai-service/tests/prompts/test_prompt_manifest.py`, `ai-service/tests/llm/test_no_direct_sdk_import.py`.

## Dev notes

### Architecture constraints

- [AD-10](../../ARCHITECTURE.md#architecture-decisions): một model cho mọi agent; độ sâu chỉnh bằng `effort`. Loại phương án trộn nhiều model theo tác vụ (Sonnet/Haiku chỉ thử sau khi đo bằng bộ đánh giá, ARCH › *Chọn model*). Agent không gọi SDK trực tiếp.
- [AD-12](../../ARCHITECTURE.md#architecture-decisions): prompt là file có phiên bản; caching cần phần đầu ổn định. Batches không làm ở đây (xem bên dưới).
- Không dùng `tool_choice` để ép JSON; dùng `output_config.format` (ARCH › *Chọn model*). Test Generator ở US-4.1 dùng công cụ với `tool_choice` tự động, không ép.
- Bật `fallbacks` cho lượt gọi đồng bộ theo ARCH › *Code mẫu*. Model dự phòng có thể khác `claude-opus-5-5`, nên `ai.llm_calls.model` và `model` trong `ai.results` phải lấy từ phản hồi, không lấy từ cấu hình.
- Không gửi `temperature`. PRD › *Kiểm soát rủi ro AI* ghi "temperature thấp", nhưng theo skill `claude-api` thì `claude-opus-5-5` từ chối tham số sampling. Tính nhất quán dựa vào cố định model + phiên bản prompt và cache kết quả. Đây là chỗ PRD cần sửa; hỏi người dùng trước khi sửa PRD.
- Ba tầng thử lại tách bạch: SDK tự thử lại lỗi mạng/429/5xx; `LLMClient` thử lại khi sai schema (tối đa 2 lần); tầng job ở US-2.1 thử lại `RetryableError` (tối đa 3 lần rồi DLQ). Refusal và sai schema sau 2 lần là `PermanentError`, không thử lại ở tầng job.
- **Chạm Q8:** tạm dùng Đề xuất "thiết kế lớp trừu tượng để đổi được". Agent chỉ phụ thuộc `Protocol` `LLMClient`; nhà cung cấp chọn bằng cấu hình AI Service. Không cài mô hình mở tự host. Hỏi trước khi chốt.
- Cố định phiên bản prompt và model trong một đợt (PRD › guardrails): story chỉ cung cấp cấu hình phiên bản đang dùng. Chưa có cơ chế gắn phiên bản prompt vào từng đợt (`campaigns.config`); đã nêu là điểm mơ hồ.
- Story này không thêm AD mới.

### Cross-story dependencies

- Builds on [US-2.1](US-2.1-ai-job-pipeline-message-contracts.md) — schema `ai`, role `ai_service`, `job_id` trong `ai.jobs`, lớp lỗi `RetryableError` / `PermanentError` trong `ai-service/app/consumers/errors.py`.
- Required by [US-2.3](US-2.3-jd-analyzer-hr-requirement-confirmation.md), [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md) — gọi `LLMClient` với effort `low`, prompt `jd_analyzer/v1`, `cv_parser/v1`.
- Required by [US-2.5](US-2.5-embeddings-skill-catalog.md) — gọi Claude cho kỹ năng chưa có trong danh mục.
- Required by [US-3.2](US-3.2-batch-matching-agent.md) — mở rộng `LLMClient` cho Message Batches và `cache_control`.
- Required by [US-4.1](US-4.1-exam-blueprint-test-generator.md) — vòng lặp công cụ của Test Generator dùng cùng lớp ghi usage.
- Required by [US-6.2](US-6.2-llm-cost-tracking.md) — đọc `ai.llm_calls` để dựng màn chi phí.
- Required by [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md) — bộ đánh giá chạy `LLMClient` ở chế độ `live` trong `ai-service/evals/`.

### What we explicitly did NOT do

- Không bọc Message Batches. Làm ở US-3.2, nơi đầu tiên cần. Lý do: Batches không nhận `fallbacks`, cần luồng xử lý lại riêng (ARCH › *Code mẫu*).
- Không làm dashboard chi phí — thuộc US-6.2.
- Không cài nhà cung cấp thứ hai hay mô hình mở (Q8 chưa chốt).
- Không có chế độ ghi fixture tự động từ API thật trong CI. Ghi fixture mới chỉ làm thủ công.

### References

- [Source: PRD › Non-Functional Requirements (NFR-11, NFR-12)](../../PRD.md#non-functional-requirements)
- [Source: PRD › Kiểm soát rủi ro AI (guardrails); Các điểm cần chốt (Q8)](../../PRD.md)
- [Source: ARCHITECTURE › Quản lý prompt; Code mẫu – lượt gọi của Matching Agent](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › LLM usage and cost (Bản đồ sử dụng LLM, Chọn model, Tối ưu chi phí, Ước tính chi phí)](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Các bảng chính (`ai.llm_calls`); Lưu trữ file (`llm-logs`)](../../ARCHITECTURE.md)
- [Source: CONTEXT D10, D12](../../CONTEXT.md)
- [Source: AGENTS › Gọi Claude API (ai-service)](../../../AGENTS.md)
- [Source: Epic EPIC-2](../epics/EPIC-2.md)

## Verification commands

Chạy trong `ai-service/` (Windows: `.venv/Scripts/`, Linux: `.venv/bin/`): `pytest tests/llm tests/prompts tests/test_no_network.py`.

| AC | Command |
|---|---|
| AC-1 | `tests/llm/test_gemini_provider.py::test_ad10_request_has_model_effort_format_no_tool_choice`, `::test_ad10_effort_maps_to_thinking_level`; `tests/llm/test_anthropic_provider.py::test_ad10_request_has_model_effort_format_no_tool_choice`; `tests/llm/test_schema.py` |
| AC-2 | `tests/llm/test_llm_client.py::test_ad10_missing_effort_raises`, `::test_ad10_effort_has_no_default_in_the_protocol`, `::test_ad10_effort_map_matches_arch` |
| AC-3 | `tests/llm/test_llm_client.py::test_refusal_checked_before_content`, `::test_refusal_from_fixture`; `test_gemini_provider.py::test_refusal_finish_reasons_are_refusals_without_text`, `::test_blocked_prompt_is_a_refusal`; `test_anthropic_provider.py::test_refusal_has_category_and_no_text` |
| AC-4 | `tests/llm/test_llm_client.py::test_guardrail_invalid_schema_retries_twice_then_human_review`, `::test_guardrail_invalid_output_then_valid_succeeds`, `::test_guardrail_max_tokens_is_retried`, `::test_guardrail_unfinished_reply_counts_as_invalid` |
| AC-5 | `tests/llm/test_usage_cost.py::test_nfr11_llm_calls_row_has_usage_cost_model_prompt_version` và các test giá; `tests/llm/test_llm_calls_table.py`; `apps/api/test/integration/ai-service-role.int-spec.ts` › `NFR-11 ai_service logs an LLM call…` |
| AC-6 | `tests/llm/test_llm_client.py::test_nfr5_request_response_logged_to_minio`, `::test_each_attempt_has_its_own_log_file`; `tests/llm/test_recorder.py` |
| AC-7 | `tests/llm/test_llm_client.py::test_result_carries_model_and_prompt_version` |
| AC-8 | `tests/prompts/test_prompt_manifest.py::test_ad12_released_prompt_unchanged`, `::test_ad12_released_prompts_in_the_repo_are_unchanged`, `::test_ad12_active_version_comes_from_config_not_newest_file` |
| AC-9 | `tests/llm/test_llm_client.py::test_ad12_system_prefix_stable_and_json_sorted`, `::test_ad12_system_block_with_variables_is_rejected` |
| AC-10 | `tests/llm/test_llm_client.py::test_untrusted_data_wrapped_in_tags` |
| AC-11 | `tests/test_no_network.py` (hai SDK gọi thật đều bị chặn); `tests/llm/test_llm_client.py::test_missing_fixture_fails_clearly`; cả bộ `pytest` chạy không có key nào |
| AC-12 | `tests/llm/test_no_direct_sdk_import.py`; hoặc `rg -l "import anthropic\|from anthropic\|google.genai\|from google import genai" ai-service/app` chỉ trả file trong `ai-service/app/llm/` |
| Thủ công | `evals/smoke_llm.py` với `LLM_PROVIDER=gemini` + `GEMINI_API_KEY` (và `anthropic` nếu có key) |

## Changelog entry

Xem [CHANGELOG › 0.8.0](../../CHANGELOG.md). Tóm tắt:

### Added
- `LLMClient` trong `ai-service/app/llm/` với hai nhà cung cấp (Gemini mặc định, Claude thay thế): effort tường minh, structured output, refusal kiểm trước, thử lại tối đa 2 lần khi sai schema rồi chuyển người xử lý.
- Bảng `ai.llm_calls` (migration `0007`) ghi token, chi phí, độ trễ, `provider`, `model`, `prompt_version`, `outcome` của từng lần thử; request và phản hồi đầy đủ lưu trong bucket `llm-logs`.
- Prompt có phiên bản tại `ai-service/app/prompts/<agent>/v<N>.md` kèm manifest băm, test báo lỗi khi sửa prompt đã phát hành.
- Chế độ fixture cho `LLMClient`; test của AI Service chặn mọi kết nối ra ngoài.

**Commit**: 2cca379

## Implementation notes

**Đối chiếu API (TASK-2.2.1, 2026-10-20).**
- Claude: theo skill `claude-api`, kiểm trên `anthropic` 1.11.0. `client.beta.messages.create` nhận `output_config` (`effort`: `low`…`max`; `format`: `{"type": "json_schema", "schema": …}`) và `fallbacks="default"` cùng beta `server-side-fallback-2026-07-01`. `stop_details` (`category`, `explanation`) chỉ có khi `stop_reason == "refusal"`. Usage: `input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens`. Structured outputs bắt buộc `additionalProperties: false`, nhận `$ref`, không nhận `minLength`/`maxLength`/`minimum`/`maximum`/schema đệ quy. SDK tự thử lại 408/409/429/5xx và lỗi mạng 2 lần. Giá `claude-opus-5-5`: 4 / 20 USD, cache đọc 0,20, cache ghi (TTL 5 phút) bằng 1,25 lần giá vào = 5. Lỗi: `APIStatusError` (`status_code`), `APIConnectionError` (gồm timeout). SDK 1.x chạy trên `httpx2`.
- Gemini: không có skill; đối chiếu ai.google.dev (structured output, thinking, pricing, Interactions) và kiểu dữ liệu của `google-genai` 2.28.0. `GenerateContentConfig` có `system_instruction`, `response_mime_type`, `response_json_schema`, `thinking_config` (`ThinkingLevel`: `MINIMAL`/`LOW`/`MEDIUM`/`HIGH`), `max_output_tokens`. Phản hồi: `model_version`, `candidates[0].finish_reason` (`STOP`, `MAX_TOKENS`, `SAFETY`, `RECITATION`, `BLOCKLIST`, `PROHIBITED_CONTENT`, `SPII`, `IMAGE_*`, `LANGUAGE`, `OTHER`…), `prompt_feedback.block_reason`, `usage_metadata` (`prompt_token_count` gồm cả phần cache, `cached_content_token_count`, `candidates_token_count`, `thoughts_token_count`). **SDK mặc định không thử lại** (`retry_options=None` nghĩa là chỉ 1 lần), nên bật `HttpRetryOptions(attempts=3)` (thử lại 408/429/5xx và lỗi mạng của httpx). `HttpOptions.timeout` tính bằng mili giây. Lỗi: `errors.APIError` (`code`), `ClientError` 4xx, `ServerError` 5xx. `gemini-3.8-flash` có free tier; paid 0,75 / 3,75 / cache 0,075 USD, gấp đôi từ 2027-01-01. Interactions API là API Google khuyên cho dự án mới nhưng mặc định `store=true`; `generate_content` vẫn được hỗ trợ đầy đủ (D34).
- Phiên bản: bản mới nhất phát hành trước 2026-10-06 (luật ≥ 2 tuần của D33): google-genai 2.28.0 (2026-10-02), anthropic 1.11.0 (2026-09-30), minio 7.2.20, Jinja2 3.1.6.

**Khác so với Tasks gốc:**
- Hai nhà cung cấp (D34) nên tách lõi chung `StructuredLLMClient` khỏi adapter. Adapter có `build_params` (thuần, JSON-serializable, chính là thứ ghi vào log) và `send`; test AC-1 chỉ cần gọi `build_params`.
- `generate` không nhận `agent`: lấy từ `prompt.prompt_version`, tránh hai giá trị lệch nhau. Tài liệu đính kèm (PDF scan) chưa làm vì chưa agent nào cần; US-2.4 thêm vào `LLMRequest` cho cả hai adapter.
- `ai.llm_calls` chỉ ghi thêm với `ai_service` (migration `0008`), thêm `provider`, `attempt`, `outcome`, `raw_stop_reason`; có FK `job_id → ai.jobs` (nullable cho evals) và CHECK `stop_reason IS NULL ⇔ outcome = API_ERROR`. Giá trị liệt kê viết hoa như mọi CHECK khác (`effort` = `LOW`/`MEDIUM`/`HIGH`). Quyền đến từ `ALTER DEFAULT PRIVILEGES` của `0006`, không cần GRANT mới.
- Không nối `LLMClient` vào `worker.py` và không thêm biến LLM vào compose (chưa có handler thật); `build_llm_client` sẵn trong `app/llm/factory.py` cho US-2.3.
- `tests/conftest.py` chặn kết nối ra ngoài thay vì chặn khởi tạo client. Bản đầu chỉ thay `socket.connect` và không chặn được client async trên Windows (LESSONS §19); `tests/test_no_network.py` giữ cho hàng rào đúng.
- Prompt mẫu `echo/v1` nằm ở `tests/fixtures/prompts/`, không phải prompt sản phẩm; `app/prompts/manifest.json` và `active.json` bắt đầu rỗng. Prompt smoke riêng ở `evals/prompts/smoke/v1.md`.
- Thử lại sai schema gửi lại request y hệt (không chèn thông báo lỗi) để giữ phần đầu prompt cache được.
- Chưa chạy được `evals/smoke_llm.py` với API thật vì máy phát triển không có key. Đã chạy khô qua `FixtureProvider` (2 lần thử, 2 file log, 2 dòng). Người dùng cần chạy với `GEMINI_API_KEY` trước khi US-2.3 dùng.

**Review (`/code-review`, 2026-10-20)**: 10 điểm, sửa 9:
- Ghi log hỏng không còn che refusal hay lỗi gốc: log của lần thử thất bại ghi best-effort, log của kết quả được dùng vẫn bắt buộc.
- Lỗi lạ từ adapter vẫn ghi một dòng `API_ERROR` rồi lan lên nguyên dạng.
- `oneOf` (discriminated union) đổi thành `anyOf`; tuple, `not`, điều kiện và `allOf` nhiều nhánh báo lỗi thay vì thành `{}`.
- Registry production kiểm manifest lúc render.
- `ai.llm_calls` chỉ ghi thêm (migration `0008`).
- Fixture phát lại từ đầu cho mỗi lượt `generate`.
- `max_output_tokens=0` báo lỗi.
- Test migration báo rõ khi thiếu `apps/api`.
- `_Attempt` không còn đọc thuộc tính private của client.

Giữ nguyên: `MAX_TOKENS` được thử lại với cùng `max_output_tokens`, đúng chữ AC-4. Tăng ngân sách token khi thử lại sẽ đụng giới hạn thời gian của request không streaming trong SDK Anthropic (khoảng trên 21 nghìn token). Agent có đầu ra dài (Test Generator) truyền `max_output_tokens` lớn hơn, hoặc dùng streaming ở US-4.1.

**Lessons**: §19 (hàng rào mạng trong pytest phải chặn cả `getaddrinfo` và `loop.create_connection`).

## Files modified

- `ai-service/app/llm/`: `__init__.py`, `types.py`, `client.py`, `structured.py`, `schema.py`, `render.py`, `effort.py`, `usage.py`, `settings.py`, `recorder.py`, `factory.py`, `providers/__init__.py`, `providers/gemini_provider.py`, `providers/anthropic_provider.py`, `providers/fixture_provider.py` (mới)
- `ai-service/app/prompts/`: `__init__.py`, `files.py`, `registry.py`, `manifest.py`, `manifest.json`, `active.json` (mới)
- `ai-service/app/consumers/errors.py` (`NeedsHumanReview`)
- `ai-service/pyproject.toml` (google-genai, anthropic, jinja2, minio; package-data `app.prompts`)
- `ai-service/evals/smoke_llm.py`, `ai-service/evals/prompts/smoke/v1.md` (mới)
- `ai-service/tests/conftest.py`, `tests/test_no_network.py`, `tests/llm/` (mới: `llm_support.py`, `conftest.py`, `test_llm_client.py`, `test_gemini_provider.py`, `test_anthropic_provider.py`, `test_usage_cost.py`, `test_llm_calls_table.py`, `test_recorder.py`, `test_schema.py`, `test_settings.py`, `test_no_direct_sdk_import.py`), `tests/prompts/test_prompt_manifest.py`, `tests/fixtures/prompts/`, `tests/fixtures/llm/echo/`
- `apps/api/src/db/schema/ai.ts` (`aiLlmCalls`), `apps/api/drizzle/0007_ai_llm_calls.sql`, `apps/api/drizzle/0008_ai_llm_calls_append_only.sql` (viết tay), `apps/api/drizzle/meta/0007_snapshot.json`, `0008_snapshot.json`, `_journal.json`
- `apps/api/test/integration/ai-service-role.int-spec.ts`
- `.gitattributes`, `.gitignore`, `.github/workflows/ci.yml` (comment)
- `docs/CONTEXT.md` (D34), `docs/ARCHITECTURE.md`, `docs/PRD.md`, `docs/LESSONS.md` (§19), `docs/CHANGELOG.md`, `AGENTS.md`, `docs/sprints/epics/EPIC-2.md`, `docs/sprints/stories/US-2.4-cv-parser-hidden-text-pii-split.md` (ghi chú)
- `VERSION`, `package.json`, `apps/api/package.json`, `apps/web/package.json`, `packages/shared/package.json` (0.8.0)

## Cross-references

- [PRD NFR-11, NFR-12](../../PRD.md#non-functional-requirements)
- [Epic EPIC-2](../epics/EPIC-2.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D10, D12, D34](../../CONTEXT.md)
- [LESSONS §19](../../LESSONS.md)
- [ARCHITECTURE › Architecture decisions](../../ARCHITECTURE.md#architecture-decisions)
