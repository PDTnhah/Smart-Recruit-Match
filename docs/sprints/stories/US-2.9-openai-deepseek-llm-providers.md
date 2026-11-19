---
id: US-2.9
title: "Thêm nhà cung cấp LLM OpenAI và DeepSeek"
epic: EPIC-2
status: review
priority: P1
points: 5
sprint: sprint-2026-W47
version_shipped: 0.27.0
prd_ref: [NFR-11, NFR-12]
arch_ref: [AD-10, AD-12]
depends_on: [US-2.2, US-3.2]
assignee: PDTnhah
commit: ce090c0
created: 2026-11-19
updated: 2026-11-19
---

## Goal

AI Service chạy được với OpenAI (GPT) hoặc DeepSeek, chọn bằng `LLM_PROVIDER=openai|deepseek`, khi không có key Gemini hay Claude. Agent và lõi `StructuredLLMClient` / `StructuredBatchClient` không đổi.

## Background

Ngày 2026-11-18, Gemini trả `503 UNAVAILABLE` (quá tải) làm job `ai.questions.generate` thất bại sau 3 lượt. Người dùng không có key Gemini hay Claude, nên cần nhà cung cấp thay thế. D34 chỉ có `gemini | anthropic | fixture`. D46 giả định nhà cung cấp nào cũng có Batch API.

Tài liệu chính thức đọc ngày 2026-11-19 (api-docs.deepseek.com, developers.openai.com):

| | OpenAI `gpt-6.2-sol` | DeepSeek `deepseek-flash` |
|---|---|---|
| Endpoint | Chat Completions, `store` mặc định `false` | Chat Completions, tương thích OpenAI, `base_url=https://api.deepseek.com` |
| JSON | `response_format` `json_schema` (`name`, `schema`, `strict`) | Chỉ `json_object`; prompt phải chứa chữ "json"; output không phải JSON thì API trả chuỗi trống |
| Effort | `reasoning_effort` low…max, từ chối `none` | `reasoning_effort` none/low/high/max (`medium` → `high`) |
| PDF | part `{"type":"file","file":{"filename","file_data"}}` | Chỉ qua Files API (`file_id`), không nhận nội dung file trong request |
| Từ chối | `message.refusal`, `finish_reason=content_filter` | `content_filter`; thêm `insufficient_system_resource`, `aborted` |
| Batch | `/v1/batches`, JSONL, `24h`, ≤ 50.000 request / 200 MB, giảm 50% | Không có |

**Lessons applied**: §6 (migration sinh trên nhánh mới nhất, không sửa migration cũ), §14 (compose truyền biến chưa đặt thành `""`: `load_llm_settings` coi rỗng là chưa đặt, thêm ca `""`), §15 (dừng compose trước `pnpm test`), §19 (giữ ca gọi thật SDK `openai` trong `tests/test_no_network.py`), §31 (fixture LLM khóa theo request: không đổi prompt, fixture cũ giữ nguyên), §47 (kiểm CRLF trước khi stage).

Lessons: none new — các lỗi review tìm ra (batch inline gửi lại khi đọc lại, dòng kết quả hỏng) chỉ có ở adapter của story này, đã sửa và có test.

## Acceptance criteria

- [x] **AC-1** — **Given** `LLM_PROVIDER=openai`, `OPENAI_API_KEY`, **When** một agent gọi `LLMClient.generate`, **Then** request đi qua Chat Completions với `response_format` `json_schema` (`strict: true` khi mọi object có đủ thuộc tính trong `required`, không thì `false`), `reasoning_effort` theo `EFFORT_BY_AGENT`, `max_completion_tokens`, `store: false`, không có `temperature`. Dòng `ai.llm_calls` có `provider = OPENAI`, `model` lấy từ phản hồi, `cost_usd` theo bảng giá.
- [x] **AC-2** — **Given** `LLM_PROVIDER=deepseek`, `DEEPSEEK_API_KEY`, **When** một agent gọi `generate`, **Then** request đi tới `https://api.deepseek.com` với `response_format` `json_object` và một system message cố định chứa JSON Schema của agent, đặt sau system của prompt. Effort low/medium/high gửi `low`/`high`/`high`. Câu trả lời sai schema hoặc trống được thử lại như mọi nhà cung cấp.
- [x] **AC-3** — Phản hồi được kiểm từ chối trước khi đọc nội dung: OpenAI `message.refusal` khác null hoặc `content_filter` → `REFUSAL`. `length` → `MAX_TOKENS`. DeepSeek `insufficient_system_resource` / `aborted` → lỗi thử lại được.
- [x] **AC-4** — Usage: OpenAI `input = prompt_tokens − cached_tokens − cache_write_tokens`, `cache_read = cached_tokens`, `cache_write = cache_write_tokens`; DeepSeek `input = prompt_cache_miss_tokens`, `cache_read = prompt_cache_hit_tokens`; `output = completion_tokens` ở cả hai.
- [x] **AC-5** — CV bản scan gửi được dưới dạng part `file` (`data:application/pdf;base64,…`) với OpenAI. Với DeepSeek, request có file bị từ chối trước khi gửi, bằng lỗi không thử lại có ghi rõ cần nhà cung cấp khác (DeepSeek chỉ đọc PDF qua Files API).
- [x] **AC-6** — Lỗi API: 408, 409, 429, ≥ 500 và mất kết nối thử lại được. 429 hết hạn mức, 400, 401, 402 dừng hẳn.
- [x] **AC-7** — Matching với OpenAI dùng Batch API: JSONL `/v1/chat/completions`, `completion_window=24h`, ánh xạ trạng thái về `RUNNING`/`ENDED`/`FAILED` (`expired` vẫn đọc được phần đã xong), đọc file kết quả và file lỗi, xóa file input sau khi đọc, file output/error tự hết hạn sau 2 ngày (file đã mất thì coi như không có kết quả và gửi lại), tính giá batch. Matching với DeepSeek dùng `InlineBatchProvider`: `submit` không gọi mạng, `status` là `ENDED`, `results` gửi từng request song song tối đa `LLM_INLINE_BATCH_CONCURRENCY` (mặc định 16), tính giá thường.
- [x] **AC-8** — Thiếu key của nhà cung cấp đang chọn thì worker không khởi động và báo rõ biến thiếu; key của nhà cung cấp khác không bắt buộc. Biến rỗng `""` coi như chưa đặt.
- [x] **AC-9** — Chỉ `app/llm/` import `openai` (`test_no_direct_sdk_import.py`); test không gọi mạng thật, có ca SDK `openai` trong `test_no_network.py`.
- [x] **AC-10** — CHECK `provider` của `ai.llm_calls` và `ai.llm_batches` nhận `OPENAI`, `DEEPSEEK` (migration mới).
- [x] **AC-11** — DEPLOY.md (bảng biến mà SETUP.md trỏ tới), `deploy/.env.example` ghi cách bật hai nhà cung cấp, và ghi rõ chỉ dùng với dữ liệu giả cho tới khi có điều khoản ghi tên chúng.

## Tasks

- [x] **TASK-2.9.1** — Thêm `openai==<bản ổn định mới nhất, phát hành ít nhất 2 tuần>` vào `ai-service/pyproject.toml` rồi cài vào `.venv`. Đối chiếu SDK đã cài, ghi kết luận vào *Implementation notes*: `max_retries` mặc định, kiểu `ChatCompletion` (`message.refusal`, `prompt_tokens_details`, `completion_tokens_details`), `file_data` dạng data URL trong Chat Completions, trường usage cho token ghi cache, mã lỗi 429 hết hạn mức, batch `expired` có file kết quả một phần không.
- [x] **TASK-2.9.2** — `Provider` thêm `OPENAI`, `DEEPSEEK` (`types.py`). `settings.py`: `ProviderName`, `DEFAULT_MODELS` (`gpt-6.2-sol`, `deepseek-flash`), `openai_api_key`, `deepseek_api_key`, `inline_batch_concurrency`, validator. Thêm ca vào `tests/llm/test_settings.py` (AC-8, gồm ca `""`).
- [x] **TASK-2.9.3** — `app/llm/providers/openai_provider.py`: `ChatCompletionsProvider(client, model, dialect)` với dialect `OPENAI` / `DEEPSEEK`, `build_openai_client`, `build_deepseek_client` (`max_retries=2`, timeout 600 s). Tạo `tests/llm/test_openai_provider.py` (AC-1…AC-6).
- [x] **TASK-2.9.4** — `app/llm/providers/openai_batch.py` (`OpenAIBatchProvider`) và `inline_batch.py` (`InlineBatchProvider`); thêm ca vào `tests/llm/test_batch_adapters.py` (AC-7).
- [x] **TASK-2.9.5** — `factory.py` (hai nhánh cho cả `build_provider` và `build_batch_provider`), `usage.py` (giá thường và giá batch, ghi ngày đọc). Thêm `openai` vào `SDK_PACKAGES` và ca vào `tests/test_no_network.py` (AC-9).
- [x] **TASK-2.9.6** — `LLM_PROVIDERS` ở `apps/api/src/db/schema/ai.ts`, chạy `db:generate` để sinh migration `0042_*` (AC-10).
- [x] **TASK-2.9.7** — `deploy/docker-compose.yml` (`OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `LLM_INLINE_BATCH_CONCURRENCY` cho `ai-worker`), `deploy/.env.example`, DEPLOY.md, docstring của `evals/smoke_llm.py` (AC-11).
- [x] **TASK-2.9.8** — Tài liệu: ARCH › *Tech stack*, *Chọn model*; AGENTS › *Stack*, *Gọi LLM*; EPIC-2 › *Out of scope* (Q8).
- [ ] **TASK-2.9.9** — (Người dùng, key thật, dữ liệu giả) Chạy `evals/smoke_llm.py` (thường, `--cv tests/fixtures/cv/cv_scanned.pdf`, `--grader`) cho `openai` và `deepseek`. Chạy matching một đợt demo trên compose, kiểm `ai.llm_batches` (OpenAI có batch id thật, DeepSeek có id `inline-…` và file `inline-batches/…` trong `llm-logs`), `cache_read_tokens` của batch OpenAI.

## Dev notes

### Architecture constraints

- Chỉ `app/llm/` import SDK (AD-10). Adapter chỉ dựng tham số và chuẩn hóa phản hồi; refusal, thử lại và ghi log là việc của lõi (D34).
- Không gửi `temperature` (D34). Prompt có phiên bản không đổi; schema của DeepSeek nằm trong tham số do adapter dựng, nên vẫn có trong log (AD-12).
- Chọn nhà cung cấp là quy tắc vận hành: không đổi `LLM_PROVIDER`/`LLM_MODEL` khi đợt đang chấm (D46).

### Thiết kế ([D58](../../CONTEXT.md))

| | OPENAI | DEEPSEEK |
|---|---|---|
| `messages` | system → user (`shared` có `prompt_cache_breakpoint` → file → `user`) | system → system phụ có JSON Schema (`json.dumps(schema, sort_keys=True)`) → user là một chuỗi (`shared` + `user`) |
| `response_format` | `json_schema`, `name=agent`, `strict` theo `required` | `json_object` |
| Effort low/medium/high | low/medium/high | low/high/high |
| Giới hạn token | `max_completion_tokens` | `max_tokens` |
| Khác | `store: False` | không gửi `store` |

- File đính kèm (chỉ OpenAI) dùng lại `document_placeholder` / `fill_documents` (data URL). DeepSeek: `send` ném `ProviderCallError(retryable=False)` trước khi gọi mạng.
- `OpenAIBatchProvider`: chỉ xóa file input lúc đọc (xóa output trước khi `job.complete` commit thì lần poll sau lỗi mãi); file 404 → `NO_RESULT` → gửi lại. Đọc file theo dòng (`with_streaming_response`), dòng hỏng bỏ qua.
- `InlineBatchProvider`: câu trả lời lưu ở `llm-logs/inline-batches/<batch id>/<key>.json`, lần đọc lại chỉ gửi request chưa có. Giá thường (`build_batch_client` chọn `settings.pricing`), lấy giờ cao điểm làm cận trên.
- Lỗi SDK đổi sang `ProviderCallError` ở một chỗ (`api_errors`, `is_retryable` của `openai_provider.py`).

Plan đã duyệt (máy này): `C:\Users\PHAM TIEN BINH\.claude\plans\noble-frolicking-rocket.md`.

### Cross-story dependencies

- Builds on: [US-2.2](US-2.2-llm-client-versioned-prompts.md) (`LLMProvider`, `StructuredLLMClient`), [US-3.2](US-3.2-batch-matching-agent.md) (`BatchProvider`, bộ poll).
- Ảnh hưởng: [US-6.2](US-6.2-llm-cost-tracking.md) (chi phí theo nhà cung cấp), [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md) (evals theo nhà cung cấp).

### Giới hạn đã biết

- Không tự chuyển nhà cung cấp khi lỗi (người dùng chọn, D58).
- Chỉ dùng dữ liệu giả: TERMS_V2 chỉ ghi tên Google và Anthropic. Gửi CV thật cho OpenAI hay DeepSeek cần TERMS_V3 và sinh viên đồng ý lại (D30, D37). DeepSeek xử lý dữ liệu ở Trung Quốc.
- `cost_usd` của DeepSeek theo giá giờ cao điểm, nên ngoài giờ cao điểm cao gấp đôi thực tế.
- DeepSeek không đọc được CV bản scan: CV đó lỗi phân tích (`LLM_BAD_REQUEST`). Muốn hỗ trợ thì tải file lên Files API của DeepSeek (`purpose=text_recognition`, tính phí theo trang) rồi tham chiếu `file_id`; để sau, khi có key để kiểm.
- Matching với DeepSeek không được giảm giá, và tốc độ phụ thuộc `LLM_INLINE_BATCH_CONCURRENCY` cùng số replica `ai-worker`.
- Review, không sửa: (1) bộ poll mất lease (gia hạn lỗi suốt 15 phút) thì poller sau có thể gửi lại request DeepSeek chưa có câu trả lời mà poller trước còn đang gửi; (2) `batches.create` hết giờ sau khi OpenAI đã nhận thì batch đó mồ côi, như adapter Claude, Gemini; (3) batch OpenAI dùng TTL cache mặc định 30 phút: SDK có `ttl: "12h"` nhưng chưa rõ giá ghi cache 12 giờ; (4) lượt DeepSeek bị `aborted` ghi `API_ERROR` không có token (vẫn thử lại được, AC-3).

## Verification commands

| AC | Command |
|---|---|
| AC-1…AC-10 (phía Python) | `ai-service/.venv/Scripts/ruff check ai-service && ai-service/.venv/Scripts/pytest ai-service/tests/llm ai-service/tests/test_no_network.py` (`test_llm_calls_table.py` so CHECK ở migration mới nhất với `Provider`) |
| AC-10 | `pnpm --filter @srm/api db:generate` (không sinh thêm gì sau migration mới); `pnpm typecheck && pnpm lint`; `pnpm test` sau khi dừng compose |
| TASK-2.9.9 | `LLM_PROVIDER=openai OPENAI_API_KEY=… ai-service/.venv/Scripts/python ai-service/evals/smoke_llm.py` (rồi `--cv tests/fixtures/cv/cv_scanned.pdf`, `--grader`); lặp lại với `deepseek` |

## Changelog entry

### Added
- AI Service có thêm hai nhà cung cấp LLM, chọn bằng `LLM_PROVIDER`: OpenAI (`openai`, mặc định `gpt-6.2-sol`) và DeepSeek (`deepseek`, mặc định `deepseek-flash`). Hai nhà cung cấp này chỉ dùng với dữ liệu giả, cho tới khi điều khoản xử lý dữ liệu ghi tên chúng.
- Chấm phù hợp hàng loạt với OpenAI chạy qua Batch API (giá giảm 50%). Với DeepSeek, bộ poll gửi từng request với giá thường (`LLM_INLINE_BATCH_CONCURRENCY`, mặc định 16). DeepSeek không đọc được CV bản scan.

### Changed
- Bộ poll batch không đọc batch của nhà cung cấp hay model khác cấu hình hiện tại.

**Commit**: `ce090c0`

## Implementation notes

- **Phiên 1 (Plan)**: người dùng chốt ba điểm của D58; tạo story và tài liệu trên nhánh `us-2.9` (từ `dev` `7c91673`).
- **Phiên 2 (Execute + Self-verify)**: xong TASK-2.9.1…2.9.8, chưa commit. Kết luận TASK-2.9.1 (`openai==3.46.0`, phát hành 2026-11-05, dùng `httpx2`; tài liệu đọc 2026-11-19):
  - Kết luận đối chiếu SDK và tài liệu (retry, usage, mã hết tiền, batch `expired`, `finish_reason` riêng của DeepSeek đọc được nhờ `construct`) ghi ở docstring `openai_provider.py`, `openai_batch.py`, `usage.py`. DeepSeek chỉ nhận file qua `file_id`, nên đã sửa AC-5 và D58.
  - Chưa kiểm được, để TASK-2.9.9: `prompt_cache_breakpoint` trong Chat Completions và Batch (SDK có trường, tài liệu chỉ có ví dụ Responses API); `json_object` khi DeepSeek đang thinking.
  - Test: SDK `openai` để `RuntimeError` của bộ chặn mạng lọt ra thay vì bọc thành `APIConnectionError`, nên ca mới dùng `pytest.raises(Exception)` như ca Gemini. `test_llm_calls_table.py` đọc CHECK ở migration mới nhất.
  - Self-verify: `ruff`, `pytest ai-service` (508), `pnpm typecheck`, `pnpm lint` xanh; `pnpm test`: shared 403, api 993/999, 6 ca đỏ ở `events-stream.int-spec.ts` do lỗi môi trường (LESSONS §11, §15), chạy lại riêng 28/28 xanh.
- **Phiên 3 (Review + Doc/Version gate)**: `/code-review` so với `dev` nêu 15 điểm, sửa 11: batch inline lưu câu trả lời, đọc lại không trả tiền lần nữa; bộ poll để dòng của nhà cung cấp/model khác chờ; file kết quả OpenAI đọc theo dòng, dòng hỏng bỏ qua, dòng 200 rỗng hoặc body không phải object thử lại được; DeepSeek gửi `user` là một chuỗi; giá batch DeepSeek lấy từ bảng giá thường; gộp chỗ đổi lỗi SDK; `conftest.py` xóa `OPENAI_BASE_URL`; test batch đặt tên `test_gd3_*`; DEPLOY.md, AGENTS › *Gọi LLM* (ngoại lệ `json_object`). Bốn điểm không sửa ở *Giới hạn đã biết*. `ruff`, `pytest ai-service` 510 xanh.

## Files modified

- `ai-service/app/llm/` (3 adapter mới, settings, factory, giá, `batch_expired`), `ai-service/tests/`, `pyproject.toml`, `evals/smoke_llm.py`.
- `apps/api/src/db/schema/ai.ts`, migration `0042`.
- `deploy/`, `DEPLOY.md`; tài liệu (story, D58, ARCH, AGENTS, PRD, EPIC-2, W47, sprints README, STATUS).

## Cross-references

- [PRD › NFR-11, NFR-12](../../PRD.md) · [ARCH › Chọn model](../../ARCHITECTURE.md) · [EPIC-2](../epics/EPIC-2.md) · [CONTEXT D34, D46, D58](../../CONTEXT.md) · [Sprint W47](../sprint-2026-W47.md)
