---
id: US-2.2
title: "LLMClient và prompt có phiên bản"
epic: EPIC-2
status: backlog
priority: P0
points: 5
sprint:
version_shipped:
prd_ref: [NFR-11, NFR-12]
arch_ref: [AD-10, AD-12]
depends_on: [US-2.1]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
external_deps: [anthropic_api]
---

## Goal

Mọi lượt gọi Claude trong AI Service đi qua một lớp duy nhất là `LLMClient`. Lớp này ghi rõ `effort`, lấy JSON bằng structured outputs, kiểm tra refusal trước khi đọc nội dung, thử lại khi sai schema, và ghi usage, chi phí, `model`, `prompt_version` của từng lượt vào `ai.llm_calls`. Prompt là file có phiên bản, bản đã dùng thì không sửa. Test chạy bằng fixture, không gọi API thật. Nhờ vậy các agent ở US-2.3, US-2.4, EPIC-3 và EPIC-4 chỉ còn viết prompt và schema của mình. US-6.2 có sẵn dữ liệu chi phí.

## Background

AD-10 ([D10](../../CONTEXT.md)) chọn một model `claude-opus-5-5` cho mọi agent và chỉnh độ sâu suy luận bằng `output_config.effort`. ARCH › *Chọn model* nêu ba đặc điểm API cần xử lý: model luôn suy luận và `effort` mặc định là `medium`, nên phải ghi rõ cho từng tác vụ; không hỗ trợ ép gọi công cụ bằng `tool_choice`, muốn có JSON thì dùng `output_config.format`; luôn kiểm tra `stop_reason == "refusal"` trước khi đọc nội dung. AGENTS › *Gọi Claude API* biến các điểm này thành quy tắc bắt buộc.

AD-12 ([D12](../../CONTEXT.md)) yêu cầu prompt là file có phiên bản trong git (`ai-service/app/prompts/<agent>/v<N>.md`, Jinja2). Mọi kết quả lưu kèm `prompt_version` và `model` (AGENTS › Nguyên tắc 12). Phần cố định của prompt đặt đầu, phần thay đổi đặt cuối, không chèn thời gian hay ID ngẫu nhiên vào `system`, JSON đưa vào prompt dùng `sort_keys=True` để prompt caching hoạt động (ARCH › *Quản lý prompt*). Phần Message Batches và cache theo JD được dùng ở US-3.2 và EPIC-4; story này chỉ dựng nền.

PRD › *Kiểm soát rủi ro AI (guardrails)* quy định: sai schema thì thử lại tối đa 2 lần, vẫn lỗi thì chuyển người xử lý; lưu prompt, phản hồi, phiên bản mô hình và thời điểm của mọi lượt gọi AI ảnh hưởng đến điểm. NFR-11 yêu cầu theo dõi token và chi phí; NFR-12 yêu cầu lớp trừu tượng để đổi nhà cung cấp mà không sửa nghiệp vụ. Câu hỏi Q8 (API thương mại hay mô hình mở tự host) chưa chốt, nên story chỉ thiết kế để đổi được.

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** một agent gọi `LLMClient`, **When** request được dựng, **Then** `model` là `claude-opus-5-5` (đọc từ cấu hình, không viết cứng trong agent), `output_config.effort` luôn có giá trị tường minh, `output_config.format` chứa JSON Schema của schema đầu ra **And** request không có `tool_choice` loại `any`/`tool`, không có `temperature`.
- [ ] **AC-2** — **Given** một agent gọi `LLMClient` mà không truyền `effort`, **When** chạy, **Then** lỗi ngay ở lúc gọi (tham số bắt buộc, không có giá trị mặc định ngầm). Bảng effort của từng agent khớp ARCH › *Bản đồ sử dụng LLM theo giai đoạn*.
- [ ] **AC-3** — **Given** phản hồi có `stop_reason == "refusal"`, **When** `LLMClient` xử lý, **Then** không đọc `content`, ghi `ai.llm_calls` với `stop_reason = refusal`, ném `NeedsHumanReview` (một `PermanentError` của US-2.1) kèm `stop_details.category` nếu có.
- [ ] **AC-4** — **Given** phản hồi không qua được kiểm tra Pydantic (hoặc `stop_reason == "max_tokens"`), **When** `LLMClient` xử lý, **Then** thử lại tối đa 2 lần; lần thứ 3 vẫn lỗi thì ném `NeedsHumanReview`. Mỗi lần thử ghi một dòng `ai.llm_calls`.
- [ ] **AC-5** — **Given** một lượt gọi xong (thành công hay lỗi), **When** kiểm tra `ai.llm_calls`, **Then** có một dòng với `job_id`, `agent`, `prompt_version` (dạng `<agent>/v<N>`), `model` (model thực sự trả lời, lấy từ phản hồi), `effort`, `input_tokens`, `cache_read_tokens`, `cache_write_tokens`, `output_tokens`, `cost_usd`, `latency_ms`, `stop_reason`, `log_key`, `created_at`. `cost_usd` tính từ usage theo bảng giá cấu hình được.
- [ ] **AC-6** — **Given** một lượt gọi, **When** xong, **Then** request và phản hồi đầy đủ được lưu thành file JSON trong bucket MinIO `llm-logs` tại `log_key`, không lưu trong DB.
- [ ] **AC-7** — **Given** `LLMClient` trả kết quả thành công, **When** agent nhận, **Then** kết quả là object Pydantic đã kiểm, kèm `model` và `prompt_version` để agent đưa vào `ai.results`.
- [ ] **AC-8** — **Given** file prompt `ai-service/app/prompts/<agent>/v<N>.md` đã được ghi trong manifest, **When** nội dung file bị sửa, **Then** test kiểm tra manifest thất bại và yêu cầu tạo `v<N+1>`. Phiên bản prompt đang dùng của mỗi agent được chọn bằng cấu hình, không tự lấy file mới nhất.
- [ ] **AC-9** — **Given** hai lần dựng request cho cùng agent với dữ liệu khác nhau, **When** so sánh phần `system`, **Then** phần `system` giống hệt từng byte (không có thời gian, UUID); dữ liệu thay đổi nằm sau phần cố định; mọi JSON đưa vào prompt được dump bằng helper `sort_keys=True`.
- [ ] **AC-10** — **Given** CV/JD/bài làm đưa vào prompt, **When** dựng request, **Then** dữ liệu nằm trong khối thẻ riêng (VD `<cv_document>…</cv_document>`) ở phần `user`, thẻ đóng xuất hiện trong dữ liệu bị vô hiệu hóa, và phần `system` nói rõ nội dung trong thẻ là dữ liệu, không phải chỉ dẫn (AGENTS › Nguyên tắc 6).
- [ ] **AC-11** — **Given** chế độ fixture (mặc định khi chạy test), **When** chạy toàn bộ test của `ai-service/tests/`, **Then** không có lượt gọi mạng nào tới Claude API và không cần `ANTHROPIC_API_KEY`. Fixture thiếu thì test lỗi rõ ràng, không rơi sang gọi API thật. Fixture mô phỏng được: thành công, refusal, sai schema, `max_tokens`.
- [ ] **AC-12** — **Given** mã nguồn `ai-service/app/agents/`, **When** quét import, **Then** không agent nào import `anthropic` trực tiếp; chỉ `ai-service/app/llm/` được import SDK.

## Tasks

- [ ] **TASK-2.2.1** — Dùng skill `claude-api` trước khi viết code gọi LLM; không viết tham số API theo trí nhớ (AC: 1, 3, 5)
  - [ ] Subtask 2.2.1.1 — Đối chiếu với skill: tên tham số `output_config.effort`, `output_config.format`, cách đọc `stop_reason`/`stop_details`, tên trường usage cache (`cache_read_input_tokens`, `cache_creation_input_tokens`), tham số `fallbacks` + beta header cho lượt gọi đồng bộ (ARCH › *Code mẫu – lượt gọi của Matching Agent*), giới hạn JSON Schema của structured outputs, giá hiện hành của `claude-opus-5-5`.
  - [ ] Subtask 2.2.1.2 — Ghi kết quả đối chiếu (phiên bản SDK, tham số đã kiểm) vào *Implementation notes*.
- [ ] **TASK-2.2.2** — `LLMClient` và bản cài đặt Anthropic (AC: 1, 2, 3, 4, 7, 12)
  - [ ] Subtask 2.2.2.1 — `ai-service/app/llm/client.py`: `Protocol` `LLMClient` với hàm sinh đầu ra có cấu trúc (tham số: `agent`, `prompt`, `output_model`, `effort` bắt buộc, `job_id`, tài liệu đính kèm tùy chọn) trả `LLMResult[T]` (`data`, `model`, `prompt_version`, `call_id`).
  - [ ] Subtask 2.2.2.2 — `ai-service/app/llm/anthropic_client.py`: dùng Anthropic Python SDK; kiểm refusal trước; validate bằng Pydantic; thử lại khi sai schema tối đa 2 lần; ném `NeedsHumanReview`. Lỗi mạng/429/5xx để SDK tự thử lại, hết lượt thì ném `RetryableError` cho tầng job (US-2.1).
  - [ ] Subtask 2.2.2.3 — `ai-service/app/llm/effort.py`: bảng effort theo agent lấy từ ARCH › *Bản đồ sử dụng LLM* (`jd_analyzer`, `cv_parser`, chuẩn hóa kỹ năng: `low`; `matching`, câu hỏi xác minh CV: `medium`; `test_generator`, `validator`, `grader`: `high`).
  - [ ] Subtask 2.2.2.4 — `ai-service/app/llm/settings.py`: `model`, chế độ (`live` / `fixture`), bảng giá, tên bucket log — đọc từ biến môi trường; API key chỉ nằm ở AI Service (ARCH › *Security architecture*).
- [ ] **TASK-2.2.3** — Ghi `ai.llm_calls` và log MinIO (AC: 5, 6)
  - [ ] Subtask 2.2.3.1 — Migration Drizzle trong `apps/api/drizzle/`: bảng `ai.llm_calls` đúng cột ARCH › *Các bảng chính*, `index(agent, created_at)`; quyền ghi cho role `ai_service`.
  - [ ] Subtask 2.2.3.2 — `ai-service/app/llm/usage.py`: tính `cost_usd` từ usage (token vào, cache đọc, cache ghi, token ra) và bảng giá.
  - [ ] Subtask 2.2.3.3 — Ghi file JSON request/phản hồi vào bucket `llm-logs`; khóa dạng `<agent>/<yyyy>/<mm>/<call_id>.json` (đề xuất).
- [ ] **TASK-2.2.4** — Prompt có phiên bản (AC: 8, 9, 10)
  - [ ] Subtask 2.2.4.1 — `ai-service/app/prompts/registry.py`: nạp `ai-service/app/prompts/<agent>/v<N>.md` bằng Jinja2, trả `prompt_version = "<agent>/v<N>"`; phiên bản đang dùng của từng agent lấy từ cấu hình.
  - [ ] Subtask 2.2.4.2 — `ai-service/app/prompts/manifest.json` (đề xuất): băm SHA-256 của mọi file prompt đã phát hành; test so băm.
  - [ ] Subtask 2.2.4.3 — `ai-service/app/llm/render.py`: helper `dumps_sorted()` (`ensure_ascii=False`, `sort_keys=True`) và helper bọc dữ liệu không tin cậy trong thẻ, vô hiệu hóa thẻ đóng lẫn trong dữ liệu.
- [ ] **TASK-2.2.5** — Chế độ fixture (AC: 11)
  - [ ] Subtask 2.2.5.1 — `ai-service/app/llm/fixture_client.py`: tra phản hồi theo khóa băm của (agent, `prompt_version`, request đã chuẩn hóa) trong `ai-service/tests/fixtures/llm/<agent>/`.
  - [ ] Subtask 2.2.5.2 — `ai-service/tests/conftest.py`: ép chế độ fixture, xóa `ANTHROPIC_API_KEY`, chặn khởi tạo client thật.
  - [ ] Subtask 2.2.5.3 — Fixture dùng chung: `success`, `refusal`, `invalid_schema`, `max_tokens` cho một agent mẫu.
- [ ] **TASK-2.2.6** — Test (AC: 1–12)
  - [ ] Subtask 2.2.6.1 — `ai-service/tests/llm/test_llm_client.py`, `ai-service/tests/llm/test_usage_cost.py`, `ai-service/tests/prompts/test_prompt_manifest.py`, `ai-service/tests/llm/test_no_direct_sdk_import.py`.

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

> Lệnh chạy cụ thể (`pytest …`) sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `ai-service/tests/llm/test_llm_client.py::test_ad10_request_has_model_effort_format_no_tool_choice` |
| AC-2 | `ai-service/tests/llm/test_llm_client.py::test_ad10_missing_effort_raises`; `::test_ad10_effort_map_matches_arch` |
| AC-3 | `ai-service/tests/llm/test_llm_client.py::test_refusal_checked_before_content` |
| AC-4 | `ai-service/tests/llm/test_llm_client.py::test_guardrail_invalid_schema_retries_twice_then_human_review` |
| AC-5 | `ai-service/tests/llm/test_usage_cost.py::test_nfr11_llm_calls_row_has_usage_cost_model_prompt_version` |
| AC-6 | `ai-service/tests/llm/test_llm_client.py::test_nfr5_request_response_logged_to_minio` |
| AC-7 | `ai-service/tests/llm/test_llm_client.py::test_result_carries_model_and_prompt_version` |
| AC-8 | `ai-service/tests/prompts/test_prompt_manifest.py::test_ad12_released_prompt_unchanged` |
| AC-9 | `ai-service/tests/llm/test_llm_client.py::test_ad12_system_prefix_stable_and_json_sorted` |
| AC-10 | `ai-service/tests/llm/test_llm_client.py::test_untrusted_data_wrapped_in_tags` |
| AC-11 | Chạy toàn bộ `ai-service/tests/` khi không có `ANTHROPIC_API_KEY` và không có mạng ra ngoài: mọi test qua |
| AC-12 | `ai-service/tests/llm/test_no_direct_sdk_import.py`; hoặc `rg -l "import anthropic\|from anthropic" ai-service/app` chỉ trả file trong `ai-service/app/llm/` |

## Changelog entry

### Added
- `LLMClient` trong `ai-service/app/llm/`: mọi lượt gọi Claude ghi rõ `effort`, lấy JSON bằng structured outputs, kiểm tra refusal trước khi đọc nội dung, thử lại tối đa 2 lần khi sai schema rồi chuyển người xử lý.
- Bảng `ai.llm_calls` ghi token, chi phí, độ trễ, `model`, `prompt_version` của từng lượt gọi; request và phản hồi đầy đủ lưu trong bucket `llm-logs`.
- Prompt có phiên bản tại `ai-service/app/prompts/<agent>/v<N>.md` kèm manifest băm, test báo lỗi khi sửa prompt đã phát hành.
- Chế độ fixture cho `LLMClient`: test của AI Service không gọi API thật.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD NFR-11, NFR-12](../../PRD.md#non-functional-requirements)
- [Epic EPIC-2](../epics/EPIC-2.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D10, D12](../../CONTEXT.md)
- [ARCHITECTURE › Architecture decisions](../../ARCHITECTURE.md#architecture-decisions)
