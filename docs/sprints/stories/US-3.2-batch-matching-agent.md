---
id: US-3.2
title: "Matching Agent chạy hàng loạt"
epic: EPIC-3
status: backlog
priority: P0
points: 8
sprint:
version_shipped:
prd_ref: [FR-14, NFR-4, NFR-7]
arch_ref: [AD-2, AD-12]
depends_on: [US-2.2, US-2.5, US-2.6, US-3.1]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Cán bộ Trung tâm bấm "Chấm phù hợp" (hoặc hệ thống tự chạy khi hết hạn nộp CV). Sau đó mọi cặp SV × JD đạt điều kiện cứng và nằm trong top-M có verdict từng tiêu chí, bằng chứng đã kiểm tra trích dẫn và S_cv do backend tính. Với 500 SV × 50 JD, việc này chạy nền xong trong vài giờ và tốn khoảng 115 USD. Khi story xong, US-3.3 có dữ liệu để hiển thị shortlist có giải thích. US-4.4 dùng lại chế độ batch của `LLMClient` và định dạng fixture batch. US-6.3 dùng lại bộ test trích dẫn.

## Background

GĐ3 (PRD › *Quy trình nghiệp vụ theo giai đoạn*) chấm mọi cặp (SV, JD) khi CV và JD đều đã xác nhận: lọc điều kiện cứng bằng luật, lọc sơ bộ bằng embedding (top-M JD cho mỗi SV), rồi Matching Agent đánh giá từng tiêu chí có trích dẫn bằng chứng. Kết quả mỗi cặp gồm S_cv, điểm từng tiêu chí, kỹ năng đáp ứng và còn thiếu, nhận xét ngắn. ARCH › *Pipeline từng agent* › Matching chia việc này thành 6 bước, và ARCH › *Luồng chấm phù hợp hàng loạt* vẽ đường đi: backend → `ai.match.run` → AI Service → Message Batches → `ai.results` → backend tính S_cv.

Story dựa trên bốn quyết định. AD-2 ([CONTEXT D2](../../CONTEXT.md)): LLM chỉ trả verdict kèm bằng chứng, code tính S_cv bằng hàm của [US-3.1](US-3.1-hard-filters-and-scv-formula.md). AD-12 ([CONTEXT D12](../../CONTEXT.md)): Message Batches giảm 50% giá; rubric và yêu cầu JD đặt đầu prompt để dùng prompt caching (cache đọc khoảng 5% giá token vào). AD-11 ([CONTEXT D11](../../CONTEXT.md)): lọc top-M bằng embedding `bge-m3` trong pgvector, không dùng LLM. AD-4: AI Service chỉ đọc `profile_masked` qua view đã che PII (BR-03, NFR-3) và không ghi bảng nghiệp vụ.

Bằng chứng phải có thật (AGENTS › Nguyên tắc 5; PRD › *Điểm phù hợp CV–JD (S_cv)* › *Quy tắc bằng chứng*). Verdict `MET`/`PARTIAL` mà `evidence` không khớp văn bản nguồn (RapidFuzz < 85) thì bị hạ về `NOT_MET`. Đây là biện pháp chính chống "ảo giác" (PRD › *Kiểm soát rủi ro AI (guardrails)*). NFR-4 yêu cầu mọi điểm hiển thị kèm thành phần và bằng chứng, nên mỗi dòng `match_results` phải lưu đủ để US-3.3 giải thích. NFR-7 đặt ngân sách thời gian: 500 SV × 50 JD chạy nền xong trong vài giờ.

Theo lộ trình [D20](../../CONTEXT.md), story chạy ở T7 trên cả hai làn:

| Phần | Làn | Thư mục |
|---|---|---|
| Contract message, schema đầu ra LLM | Chung, merge trước hai làn | `packages/shared/contracts/` |
| Bảng `match_results`, endpoint, dựng cặp, nhận kết quả, tính S_cv | A (backend, TypeScript) | `apps/api/src/modules/matching/{api,application,infrastructure}/`, `apps/api/src/db/`, `apps/api/drizzle/` |
| Consumer, pipeline agent, prompt, chế độ batch của `LLMClient`, kiểm tra trích dẫn, fixture | B (AI Service, Python) | `ai-service/app/{consumers,agents/matching,prompts/matching,llm}/`, `ai-service/tests/` |

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** đợt có CV đã xác nhận và JD đã duyệt, **When** CENTER gọi `POST /api/campaigns/{id}/matching-runs`, **Then** API trả `202` kèm `job_id`. Backend dựng danh sách cặp và chạy `checkHardFilters` (US-3.1). Cặp không đạt được ghi vào `match_results` với `eligible = false` và `ineligible_reasons`, không gọi LLM. Sau đó backend phát đúng một message `ai.match.run` chỉ chứa `job_id`, `campaign_id` và ID của các cặp đạt điều kiện cứng (AD-5).
- [ ] **AC-2** — **Given** đợt vừa qua mốc `intake_end` và scheduler của US-1.4 chuyển đợt `INTAKE → PREFERENCE_SELECTION`, **When** sự kiện đổi pha được phát (tên đề xuất `campaign.phase_changed`), **Then** lượt chấm chạy như AC-1 với actor `SYSTEM`.
- [ ] **AC-3** — CV chưa được SV xác nhận hoặc không còn hiệu lực (BR-01), và JD chưa được HR xác nhận yêu cầu hoặc chưa được Trung tâm duyệt (BR-02), không xuất hiện trong cặp nào.
- [ ] **AC-4** — **Given** cặp đã có `match_results` cùng (`cv_id`, `jd_id`, `cv_version`, `jd_version`, `prompt_version`), **When** chạy lại, **Then** cặp đó không được gửi lại. **Given** SV có CV phiên bản mới hoặc JD có phiên bản yêu cầu mới (BR-18), **When** chạy lại, **Then** chỉ cặp của phiên bản mới được gửi; kết quả cũ giữ nguyên để truy vết. Chèn trùng khóa ở tầng DB bị unique index chặn (AGENTS › Nguyên tắc 11).
- [ ] **AC-5** — AI Service chỉ đọc hồ sơ qua `core.v_ai_cv_profile_masked` và yêu cầu JD qua `core.v_ai_jd_requirements`. Test chụp request gửi LLM (chế độ fixture) và khẳng định request không chứa tên, email, số điện thoại, ảnh, giới tính, ngày sinh, quê quán, tôn giáo, tình trạng hôn nhân (BR-03, NFR-3).
- [ ] **AC-6** — **Given** một CV có nhiều JD đạt điều kiện cứng hơn M, **When** AI Service lọc sơ bộ, **Then** chỉ M JD có cosine cao nhất (pgvector trên `ai.embeddings`) được gửi LLM. M lấy từ `campaigns.config.match_top_m` (đề xuất, mặc định 10 theo ARCH › *Ước tính chi phí (thô)*). CV có ≤ M JD thì gửi hết. Cặp bị lọc được trả về với cờ `skipped_by_prefilter` (đề xuất) và không có S_cv.
- [ ] **AC-7** — Mỗi request trong batch có `model = "claude-opus-5-5"`, `output_config.effort = "medium"` và `output_config.format` là JSON Schema sinh từ contract. `system` gồm hai khối: rubric từ `ai-service/app/prompts/matching/v1.md`, rồi yêu cầu JD dạng JSON `sort_keys=True` có `cache_control`. Tin nhắn `user` là hồ sơ đã che PII trong thẻ `<cv_profile>`, JSON `sort_keys=True`. Request không có `tool_choice`; `system` không chứa thời gian hay ID ngẫu nhiên. Các request được sắp theo JD, `custom_id = {cv_id}:{jd_id}:{prompt_version}`. Kiểm bằng snapshot test.
- [ ] **AC-8** — **Given** verdict `MET`/`PARTIAL` có `evidence` đạt độ khớp RapidFuzz < 85 với văn bản nguồn, hoặc `evidence` rỗng, **When** kiểm tra trích dẫn, **Then** verdict bị hạ về `NOT_MET` và `evidence_check` ghi điểm khớp cùng `downgraded: true`. **Given** `evidence` trùng văn bản nguồn, chỉ khác hoa thường hoặc khoảng trắng, **Then** verdict giữ nguyên. Bộ test có cả bằng chứng đúng và bằng chứng bịa.
- [ ] **AC-9** — Xử lý lỗi từng cặp. Request `errored` hoặc `expired` được gửi lại trong batch mới, tối đa 2 lần (đề xuất). Request có `stop_reason == "refusal"` được gửi lại đồng bộ qua `LLMClient` có `fallbacks`; nếu vẫn từ chối thì cặp được đánh dấu cần người xử lý. Đầu ra sai schema được thử lại tối đa 2 lần (PRD › *Kiểm soát rủi ro AI (guardrails)*). Job kết thúc với `status = PARTIAL` kèm danh sách cặp lỗi; backend lưu các cặp thành công; lượt chạy sau tự gửi lại cặp lỗi vì chúng chưa có kết quả. Job lỗi toàn phần sau 3 lần thì vào DLQ (US-2.1).
- [ ] **AC-10** — **Given** message `ai.results` loại MATCH, **When** backend nhận, **Then** backend kiểm tra bằng Zod, tính S_cv bằng `computeScv` (US-3.1) với `campaigns.config.scv_weights`, rồi upsert `match_results` (`eligible = true`, `criteria`, `s_cv`, `model`, `prompt_version`). Nhận trùng message không tạo dòng trùng và không đổi dữ liệu. Backend không đọc trường điểm tổng nào từ đầu ra LLM (AD-2).
- [ ] **AC-11** — **Given** đợt đã có `match_results`, **When** gọi `recomputeScv(campaignId)` với bộ `scv_weights` mới, **Then** backend tính lại `s_cv` từ `criteria` đã lưu. Không có message `ai.match.run` mới và `ai.llm_calls` không có dòng mới.
- [ ] **AC-12** — Mỗi dòng `eligible = true` lưu đủ dữ liệu để giải thích (NFR-4): verdict, `evidence` và `evidence_check` của từng kỹ năng; `score_0_4` kèm lý do; mức khớp ngành; verdict ngoại ngữ; bảng thành phần S_cv; `strengths`, `gaps`, `suggestions` (đề xuất) và `summary` viết bằng tiếng Việt.
- [ ] **AC-13** — STUDENT, HR hoặc ADMIN gọi `POST /api/campaigns/{id}/matching-runs` thì nhận `403`. Đợt không ở `INTAKE` hoặc `PREFERENCE_SELECTION` (đề xuất) thì `CampaignService.assertPhase` của US-1.4 trả `409` mã `CAMPAIGN_PHASE_MISMATCH`. Đợt đang có lượt chấm chưa xong thì nhận `409`.
- [ ] **AC-14** — Mỗi request trong batch ghi một dòng `ai.llm_calls` qua `LLMClient`, gồm `agent = matching`, `prompt_version`, `model`, `effort`, token vào/ra, `cache_read_tokens`, `cache_write_tokens`, `cost_usd`, `stop_reason`. Toàn bộ test dùng fixture và chạy được khi không có `ANTHROPIC_API_KEY`.
- [ ] **AC-15** — **Given** PostgreSQL và RabbitMQ thật (testcontainers), AI Service chạy ở chế độ fixture, **When** chạy lượt chấm cho bộ dữ liệu nhỏ (3 SV × 4 JD, có cặp không đạt điều kiện cứng và một bằng chứng bịa), **Then** mọi cặp đạt điều kiện có `match_results` với S_cv đúng theo US-3.1, cặp không đạt có lý do, và bằng chứng bịa đã bị hạ về `NOT_MET`.

## Tasks

- [ ] **TASK-3.2.1** — [Chung] Contract message và schema đầu ra LLM — một định nghĩa cho cả TS và Python, merge trước hai làn (AC: 1, 7, 10, 12)
  - [ ] Subtask 3.2.1.1 — `packages/shared/contracts/matching.ts`: thêm `MatchRunJob` (`job_id`, `campaign_id`, `pairs[]`) và `MatchResultItem` mở rộng `MatchCriteria` của US-3.1 bằng `evidence_check`, `strengths`, `gaps`, `suggestions`, `summary`, `skipped_by_prefilter`, `needs_review`. Kết quả mang `prompt_version` và `model`.
  - [ ] Subtask 3.2.1.2 — Xuất JSON Schema rồi sinh Pydantic vào `ai-service/app/schemas/` bằng script của US-2.1. Schema đầu ra LLM (`MatchResult`, `additionalProperties: false`) lấy từ đây; không viết tay ở phía nào (AD-6).
  - [ ] Subtask 3.2.1.3 — Merge trước, hai làn rebase sau ([sprints/README › Chạy song song](../README.md#chạy-song-song)).
- [ ] **TASK-3.2.2** — [Làn A] Bảng `match_results` — cache theo phiên bản và chống ghi trùng ở tầng DB (AC: 4, 10, 12)
  - [ ] Subtask 3.2.2.1 — Drizzle schema trong `apps/api/src/db/` và migration trong `apps/api/drizzle/`. Cột theo ARCH › *Các bảng chính*; `s_cv numeric(5,2)`; `unique(cv_id, jd_id, cv_version, jd_version, prompt_version)` dùng `NULLS NOT DISTINCT` (đề xuất, vì dòng không đạt điều kiện cứng có `prompt_version` rỗng); `index(jd_id, s_cv DESC)`.
  - [ ] Subtask 3.2.2.2 — `apps/api/src/modules/matching/infrastructure/match-results.repository.ts`: upsert idempotent theo khóa unique; cập nhật `s_cv` khi tính lại.
  - [ ] Subtask 3.2.2.3 — Theo [D20](../../CONTEXT.md), mỗi đợt merge chỉ một story được sinh migration; rebase trước khi sinh.
- [ ] **TASK-3.2.3** — [Làn A] Use case chạy chấm — lọc tất định trước, chỉ gửi cặp cần LLM (AC: 1, 2, 3, 4, 13)
  - [ ] Subtask 3.2.3.1 — `apps/api/src/modules/matching/api/matching-runs.controller.ts`: `POST /api/campaigns/{id}/matching-runs`, `@Roles('CENTER')`, trả `202` + `job_id`.
  - [ ] Subtask 3.2.3.2 — `apps/api/src/modules/matching/application/run-matching.service.ts`: lấy CV đã xác nhận qua service export của module `student`, JD đã duyệt và yêu cầu qua service export của module `company`, không truy vấn bảng của module khác (AGENTS › Nguyên tắc 13). Dựng `HardFilterFacts`, gọi `checkHardFilters`, ghi cặp không đạt, bỏ cặp đã có kết quả, phát job qua `aigateway` (US-2.1).
  - [ ] Subtask 3.2.3.3 — Listener sự kiện đổi pha của module `campaign` (`@nestjs/event-emitter`) để tự chạy khi đợt chuyển `INTAKE → PREFERENCE_SELECTION`. US-1.4 hiện chỉ phát `campaign.opened`; sự kiện đổi pha cần được thêm (tên đề xuất `campaign.phase_changed`), phối hợp với US-1.4.
  - [ ] Subtask 3.2.3.4 — Chặn chạy chồng: hỏi `aigateway` trạng thái job matching đang chạy của đợt; còn job chưa xong thì trả `409`.
- [ ] **TASK-3.2.4** — [Làn A] Nhận kết quả và tính S_cv — điểm tổng do code tính (AC: 9, 10, 11, 12)
  - [ ] Subtask 3.2.4.1 — `apps/api/src/modules/matching/application/match-results.handler.ts`: xử lý `ai.results` loại MATCH, parse Zod, gọi `computeScv`, upsert. Với `PARTIAL`, lưu phần thành công và ghi log danh sách cặp lỗi.
  - [ ] Subtask 3.2.4.2 — `recomputeScv(campaignId)` trong cùng module: chỉ đọc `criteria` đã lưu và `scv_weights` hiện hành, không phát job.
- [ ] **TASK-3.2.5** — [Làn B] Chế độ batch của `LLMClient` và prompt `matching/v1` — rẻ hơn 50% và dùng được cache (AC: 7, 9, 14)
  - [ ] Subtask 3.2.5.1 — Dùng skill `claude-api` trước khi viết code gọi LLM: tạo Message Batch, kiểm tra trạng thái, đọc kết quả theo `custom_id`, prompt caching trong batch, structured outputs, xử lý refusal. Không viết tham số API theo trí nhớ. Kiểm tra điều kiện để khối có `cache_control` thực sự được cache (độ dài tối thiểu của phần cache) và ghi kết luận vào Implementation notes.
  - [ ] Subtask 3.2.5.2 — `ai-service/app/llm/`: thêm `submit_batch`, `poll_batch`, `iter_batch_results`. US-2.2 cố ý không bọc Message Batches và để việc này cho story này. Ghi usage của từng request vào `ai.llm_calls`. Thêm chế độ fixture đọc `ai-service/tests/fixtures/batches/`. Agent không gọi SDK trực tiếp.
  - [ ] Subtask 3.2.5.3 — `ai-service/app/prompts/matching/v1.md` (Jinja2): định nghĩa verdict và "Một phần", rubric dự án 0–4, mức khớp ngành, yêu cầu `evidence` trích nguyên văn, nhận xét bằng tiếng Việt, enum bằng tiếng Anh. Chỉ dẫn tách khỏi dữ liệu; CV/JD là dữ liệu, không phải chỉ dẫn (AGENTS › Nguyên tắc 6). Prompt đã dùng thì không sửa, chỉ tạo `v2`.
- [ ] **TASK-3.2.6** — [Làn B] Pipeline agent matching — từ job đến kết quả đã kiểm tra (AC: 5, 6, 7, 9)
  - [ ] Subtask 3.2.6.1 — `ai-service/app/consumers/match_run.py`: subscriber FastStream cho `ai.match.run`; kiểm tra `ai.jobs` theo `job_id` trước khi xử lý (US-2.1).
  - [ ] Subtask 3.2.6.2 — `ai-service/app/agents/matching/pipeline.py`: đọc hai view `core.v_ai_*`; lọc top-M bằng `ai-service/app/embedding/` (US-2.5); dựng request sắp theo JD; gửi batch; poll đến khi xong; refusal thì gửi lại đồng bộ; sai schema thì thử lại tối đa 2 lần.
  - [ ] Subtask 3.2.6.3 — Gửi `ai.results` (`SUCCEEDED` / `PARTIAL` / `FAILED`). Kết quả lớn thì chia thành nhiều message theo JD cùng `job_id` (đề xuất); backend upsert theo cặp nên nhận lặp vẫn an toàn.
- [ ] **TASK-3.2.7** — [Làn B] Kiểm tra trích dẫn — chặn bằng chứng bịa bằng code (AC: 8, 12)
  - [ ] Subtask 3.2.7.1 — `ai-service/app/agents/matching/evidence.py`: chuẩn hóa chuỗi (Unicode NFC, chữ thường, gộp khoảng trắng), so bằng `rapidfuzz.fuzz.partial_ratio` (đề xuất) với văn bản nguồn, ngưỡng 85. Không đạt thì hạ về `NOT_MET` và ghi `evidence_check`.
  - [ ] Subtask 3.2.7.2 — Áp dụng cho `must_have`, `nice_to_have` và `language`.
  - [ ] Subtask 3.2.7.3 — Bộ cặp CV/bằng chứng đúng và bịa trong `ai-service/tests/fixtures/evidence/`; US-6.3 dùng lại.
- [ ] **TASK-3.2.8** — Fixture và test hai làn — không gọi API thật (AC: 5, 8, 9, 14, 15)
  - [ ] Subtask 3.2.8.1 — `ai-service/tests/fixtures/batches/`: kết quả batch ghi sẵn cho các trường hợp thành công, `errored`, `expired`, refusal, sai schema và bằng chứng bịa. US-4.4 dùng cùng định dạng.
  - [ ] Subtask 3.2.8.2 — pytest trong `ai-service/tests/agents/matching/`: request shape, PII, top-M, xử lý lỗi, kiểm tra trích dẫn.
  - [ ] Subtask 3.2.8.3 — Integration test Node `apps/api/test/integration/matching-run.int-spec.ts` (testcontainers PostgreSQL + RabbitMQ) cho luồng trọn vòng, phân quyền và idempotency.

## Dev notes

### Architecture constraints

- [AD-2](../../ARCHITECTURE.md#architecture-decisions): LLM trả verdict và bằng chứng; S_cv do backend tính bằng `computeScv` của US-3.1. Bị loại: để LLM trả điểm tổng; tính S_cv trong AI Service (AI Service không làm nghiệp vụ, AD-1).
- [AD-12](../../ARCHITECTURE.md#architecture-decisions): chạy qua Message Batches; rubric và yêu cầu JD đặt đầu prompt và gắn `cache_control`; prompt là file có phiên bản. Bị loại: gọi đồng bộ từng cặp (đắt gấp đôi). Ngoại lệ duy nhất là cặp bị refusal.
- AD-4: AI Service chỉ đọc view đã che PII và chỉ ghi `ai.*`. Kết quả về backend qua `ai.results`; chỉ backend ghi `match_results`. Bị loại: AI Service ghi thẳng `match_results`.
- AD-5: payload chỉ chứa ID; xử lý idempotent theo `job_id`; lỗi 3 lần thì vào DLQ.
- AD-6: contract và schema đầu ra LLM định nghĩa một lần bằng Zod, sinh Pydantic.
- AD-10: mọi lượt gọi đi qua `LLMClient`; dùng `claude-opus-5-5` với `effort` medium (ARCH › *Bản đồ sử dụng LLM theo giai đoạn*, GĐ3); lấy JSON bằng structured outputs; kiểm tra `stop_reason == "refusal"` trước khi đọc nội dung. Batches API không hỗ trợ `betas` và `fallbacks` (ARCH › *Code mẫu – lượt gọi của Matching Agent*), nên cặp bị refusal được gửi lại đồng bộ.
- AD-11: top-M dùng embedding `bge-m3` trong `ai.embeddings` (US-2.5), không dùng LLM.
- AGENTS › Nguyên tắc 13: module `matching` lấy CV và JD qua service export của `student` và `company`.
- Story không thêm AD mới.
- Các điểm spec chưa nói rõ. Story tạm dùng phương án dưới đây và **hỏi trước khi chốt**:
  - **Khi nào đổi trọng số.** AD-2 nói đổi trọng số không phải gọi lại LLM, nhưng US-1.4 khóa `campaigns.config` sau `DRAFT` (`CAMPAIGN_CONFIG_LOCKED`), tức trước khi có kết quả chấm. Story chỉ cung cấp `recomputeScv`; chưa có luồng nghiệp vụ nào gọi nó.
  - **Pha được phép chạy chấm:** tạm cho phép `INTAKE` (Trung tâm chạy sớm) và `PREFERENCE_SELECTION`. Chấm lại theo BR-18 khi đợt đã ở `TESTING` chưa có quy định.
  - **Văn bản nguồn để so trích dẫn.** PRD, ARCH và AGENTS đều nói "văn bản CV", nhưng Matching chỉ được nhận `profile_masked` (BR-03). Tạm so với văn bản CV đã che PII và đã loại chữ ẩn mà US-2.4 đề xuất lưu ở khóa `profile_masked.source_text`, đọc qua `core.v_ai_cv_profile_masked`. CV bản scan không có văn bản nguồn; với loại này tạm so với nội dung chuỗi của `profile_masked`.
  - **Dạng của `evidence`.** Ví dụ `PARTIAL` trong PRD ("Chỉ liệt kê 'MySQL' ở mục kỹ năng, không có dự án minh chứng") là lời giải thích, không phải trích dẫn, nên sẽ không đạt ngưỡng 85. Tạm tách thành `evidence` (trích nguyên văn, được kiểm tra) và `reason` (giải thích, không kiểm tra).
  - **Hàm so khớp RapidFuzz** không được nêu. Tạm dùng `partial_ratio`.
  - **"Gợi ý cải thiện"** có ở GĐ3 bước 4, FR-15 và ARCH › *Bản đồ sử dụng LLM*, nhưng không có trong đầu ra mẫu ở PRD. Tạm thêm trường `suggestions`. `match_results` cũng không có cột riêng cho `gaps`/`suggestions`/`summary`, nên tạm lưu chúng trong `criteria` (JSONB).
  - **Cặp đạt điều kiện cứng nhưng nằm ngoài top-M:** spec không nói có lưu hay không. Tạm không ghi `match_results`; lượt chạy sau lọc lại bằng embedding, việc này không tốn tiền LLM. M không có trong bảng tham số GĐ0; tạm dùng `campaigns.config.match_top_m`.
  - **Phiên bản trong payload.** ARCH › *Hàng đợi* chỉ ghi cặp (`cv_id`, `jd_id`). Tạm thêm `cv_version` và `jd_version` vào mỗi cặp (vẫn chỉ là ID) để kết quả khớp đúng phiên bản đã lọc điều kiện cứng.
  - **Ghim phiên bản prompt và model trong đợt** (PRD › *Kiểm soát rủi ro AI (guardrails)*): chưa có chỗ lưu. Nếu US-2.2 không có cơ chế ghim theo đợt, tạm lưu ở `campaigns.config`.
  - **Dòng không đạt điều kiện cứng** không có `prompt_version`, nên unique index thường cho phép trùng (PostgreSQL coi các NULL là khác nhau). Tạm dùng `NULLS NOT DISTINCT` (PostgreSQL 16).
- Chạm Q8: tạm dùng Đề xuất (lớp trừu tượng `LLMClient`, hiện gọi Claude theo AD-10). Đây không phải tham số đợt; hỏi trước khi chốt.

### Cross-story dependencies

- Builds on [US-2.1](US-2.1-ai-job-pipeline-message-contracts.md) — `aigateway`, `ai.jobs`, `ai.results`, DLQ, view `core.v_ai_cv_profile_masked` và `core.v_ai_jd_requirements`, script sinh Pydantic từ JSON Schema.
- Builds on [US-2.2](US-2.2-llm-client-versioned-prompts.md) — `LLMClient` (`ai-service/app/llm/`), chế độ fixture, `ai.llm_calls`, log prompt lên bucket `llm-logs`, quy ước `prompts/<agent>/v<N>.md`.
- Builds on [US-2.5](US-2.5-embeddings-skill-catalog.md) — embedding CV và JD trong `ai.embeddings`, truy vấn pgvector trong `ai-service/app/embedding/`.
- Builds on [US-2.6](US-2.6-student-profile-confirmation.md) — trạng thái CV đã xác nhận; chỉ CV đã xác nhận lọt vào view.
- Builds on [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md) — `profile_masked` và văn bản CV đã loại chữ ẩn (xem điểm mơ hồ ở trên).
- Builds on [US-3.1](US-3.1-hard-filters-and-scv-formula.md) — `checkHardFilters`, `computeScv`, `MatchCriteria`, `scv_weights`.
- Builds on [US-1.4](US-1.4-campaign-setup-and-config.md) — `campaigns.config` (`theta_cv`, `scv_weights`, `match_top_m`), `CampaignService.assertPhase`, scheduler chuyển pha theo `intake_end`.
- Required by [US-3.3](US-3.3-shortlist-and-preferences.md) — đọc `match_results` (S_cv, `criteria`, `ineligible_reasons`) để lập shortlist có giải thích.
- Required by [US-4.4](US-4.4-grading-stest-sfinal.md) — dùng lại chế độ batch của `LLMClient` và định dạng fixture trong `ai-service/tests/fixtures/batches/`.
- Required by [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md) — dùng bộ test trích dẫn trong `ai-service/tests/fixtures/evidence/` và `match_results` để tính Spearman/NDCG@k.
- Sibling [US-4.1](US-4.1-exam-blueprint-test-generator.md) — cùng làn B ở T7, cùng sửa `ai-service/app/llm/`; story nào merge sau thì rebase.
- Sibling [US-6.2](US-6.2-llm-cost-tracking.md) — dashboard chi phí đọc các dòng `agent = matching` mà story này ghi.

### Performance budget

- Thời gian (NFR-7): 500 SV × 50 JD chạy nền xong trong vài giờ. Top-M = 10 giới hạn số request ở 5.000. Đo bằng `ai.jobs.finished_at − ai.jobs.created_at` trong một lần chạy thủ công với API thật trên dữ liệu demo (US-6.6); không chạy trong CI. Batches có thể mất đến 24 giờ; nếu vượt "vài giờ" thì báo người dùng.
- Ngưỡng trích dẫn: RapidFuzz ≥ 85 (PRD › *Điểm phù hợp CV–JD (S_cv)*), kiểm bằng `test_evidence_check.py`.
- Chi phí: khoảng 115 USD cho 500 SV với top-10 JD (ARCH › *Ước tính chi phí (thô)*), tức khoảng 12 USD cho đợt demo 50 SV × 10 JD theo cùng giả định. Đo bằng tổng `ai.llm_calls.cost_usd` với `agent = matching`, và kiểm tra request thứ hai trở đi của cùng một JD có `cache_read_tokens > 0`.
- PR của story phải ghi rõ ba số đo trên.

### What we explicitly did NOT do

- Không chấm đồng bộ từng cặp, trừ cặp bị refusal. Lý do: AD-12.
- Không tự chạy lại mỗi khi SV cập nhật CV. Theo ARCH › *Luồng chấm phù hợp hàng loạt*, lượt chấm chạy khi hết hạn nộp CV hoặc khi Trung tâm bấm; cache theo phiên bản bảo đảm chỉ cặp thay đổi được gửi lại. Trigger để xem lại: Trung tâm cần shortlist trước hạn nộp CV.
- Không có bộ phát hiện "điểm cao bất thường so với bằng chứng" ngoài kiểm tra trích dẫn. Trigger: US-6.3 cho thấy S_cv cao trong khi bằng chứng yếu.
- Không làm kiểm tra thiên lệch theo nhóm SV (PRD › *Kiểm soát rủi ro AI (guardrails)*). Epic không giao việc này cho story nào; hỏi khi lập kế hoạch US-6.3.
- Không chạy đánh giá với API thật. Việc này thuộc US-6.3 (`ai-service/evals/`).

### References

- [Source: PRD › Functional Requirements — FR-14](../../PRD.md#functional-requirements)
- [Source: PRD › Non-Functional Requirements — NFR-3, NFR-4, NFR-7](../../PRD.md#non-functional-requirements)
- Source: PRD › GĐ3; *Điểm phù hợp CV–JD (S_cv)* (đầu ra mẫu, quy tắc bằng chứng); *Kiểm soát rủi ro AI (guardrails)*; *Quy tắc nghiệp vụ* BR-01, BR-02, BR-03, BR-18 ([PRD.md](../../PRD.md))
- [Source: ARCHITECTURE › Architecture decisions — AD-2, AD-4, AD-5, AD-6, AD-10, AD-11, AD-12](../../ARCHITECTURE.md#architecture-decisions)
- Source: ARCHITECTURE › *Pipeline từng agent* (Matching), *Quản lý prompt*, *Code mẫu – lượt gọi của Matching Agent* ([ARCHITECTURE.md](../../ARCHITECTURE.md))
- [Source: ARCHITECTURE › LLM usage and cost](../../ARCHITECTURE.md#llm-usage-and-cost) — bản đồ sử dụng LLM, tối ưu chi phí, ước tính chi phí
- [Source: ARCHITECTURE › Data architecture](../../ARCHITECTURE.md#data-architecture) — `match_results`, `ai.embeddings`, `ai.llm_calls`, `ai.jobs`, phân vùng schema
- [Source: ARCHITECTURE › Messaging and data flow](../../ARCHITECTURE.md#messaging-and-data-flow) — `ai.match.run`, `ai.results`, *Luồng chấm phù hợp hàng loạt*
- [Source: ARCHITECTURE › Testing strategy](../../ARCHITECTURE.md#testing-strategy)
- [Source: CONTEXT D2, D11, D12, D20](../../CONTEXT.md)
- [Source: Epic EPIC-3](../epics/EPIC-3.md)

## Verification commands

> Lệnh chạy cụ thể (`pnpm …`, `pytest …`) sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `apps/api/test/integration/matching-run.int-spec.ts` › `GĐ3 matching run: hard-filter rejects stored, eligible pairs published as IDs only` |
| AC-2 | `apps/api/test/integration/matching-run.int-spec.ts` › `GĐ3 matching run starts on CV deadline phase event` |
| AC-3 | `apps/api/test/integration/matching-run.int-spec.ts` › `BR-01 BR-02 only confirmed CVs and approved JDs are paired` |
| AC-4 | `apps/api/test/integration/matching-run.int-spec.ts` › `BR-18 cached pairs skipped, new versions re-sent, unique index blocks duplicates` |
| AC-5 | `ai-service/tests/agents/matching/test_pii.py` › `test_br03_llm_request_has_no_pii` |
| AC-6 | `ai-service/tests/agents/matching/test_prefilter.py` › `test_gd3_top_m_by_cosine` |
| AC-7 | `ai-service/tests/agents/matching/test_request_shape.py` › `test_ad12_batch_request_snapshot` |
| AC-8 | `ai-service/tests/agents/matching/test_evidence_check.py` › `test_fabricated_evidence_downgraded_to_not_met`, `test_true_evidence_kept` |
| AC-9 | `ai-service/tests/agents/matching/test_batch_errors.py` › `test_errored_expired_retried`, `test_refusal_resent_sync`, `test_schema_retry_then_partial` |
| AC-10 | `apps/api/test/integration/match-results.int-spec.ts` › `AD-2 backend computes S_cv; duplicate ai.results is idempotent` |
| AC-11 | `apps/api/test/integration/match-results.int-spec.ts` › `AD-2 weight change recomputes S_cv without new job` |
| AC-12 | `apps/api/test/integration/match-results.int-spec.ts` › `NFR-4 stored result carries verdicts, evidence and breakdown` |
| AC-13 | `apps/api/test/integration/matching-run.int-spec.ts` › `matching run: non-CENTER gets 403, wrong phase blocked, concurrent run 409` |
| AC-14 | `ai-service/tests/agents/matching/test_llm_calls.py` › `test_each_batch_request_logged`; chạy cả bộ pytest khi không đặt `ANTHROPIC_API_KEY` |
| AC-15 | `apps/api/test/integration/matching-run.int-spec.ts` › `GĐ3 end-to-end matching with AI fixture mode` |

## Changelog entry

### Added
- Chấm phù hợp hàng loạt: `POST /api/campaigns/{id}/matching-runs`, tự chạy khi hết hạn nộp CV; lọc điều kiện cứng trước, chỉ gửi cặp hợp lệ qua `ai.match.run`.
- Matching Agent (`ai-service/app/agents/matching/`, prompt `matching/v1`): lọc top-M bằng pgvector, gọi Message Batches có prompt caching, chỉ nhận `profile_masked`.
- Kiểm tra trích dẫn bằng RapidFuzz (ngưỡng 85); bằng chứng không khớp bị hạ về `NOT_MET`.
- Bảng `match_results`, unique theo CV, JD, phiên bản và `prompt_version`; S_cv do backend tính, lưu kèm `model` và `prompt_version`.
- Chế độ batch của `LLMClient` và fixture batch trong `ai-service/tests/fixtures/batches/`.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-14, NFR-4, NFR-7](../../PRD.md#functional-requirements)
- [Epic EPIC-3](../epics/EPIC-3.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D2, D11, D12](../../CONTEXT.md)
- [LESSONS](../../LESSONS.md)
