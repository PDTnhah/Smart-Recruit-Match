---
id: US-3.2
title: "Matching Agent chạy hàng loạt"
epic: EPIC-3
status: review
priority: P0
points: 13
sprint: sprint-2026-W45
version_shipped: 0.17.0
prd_ref: [FR-14, NFR-4, NFR-7]
arch_ref: [AD-2, AD-4, AD-5, AD-12, AD-15]
depends_on: [US-2.2, US-2.5, US-2.6, US-3.1, US-3.5, US-3.6]
assignee: PDTnhah
commit: db5378c
created: 2026-10-07
updated: 2026-11-03
---

## Story refresh — 2026-11-03 (bắt đầu story)

AC và task viết lại theo [CONTEXT D42, D46](../../CONTEXT.md): batch cho Gemini và Claude; tạm không hạ điểm dự án, chỉ lưu `evidence_check`; ghim prompt theo đợt; năm học đọc bằng code từ hồ sơ; ack sớm + bộ poll nền; yêu cầu JD ở block `shared` của prompt. Thêm AC-16, AC-17; 8 → 13 điểm.

## Goal

Trung tâm gọi `POST /api/campaigns/{id}/matching-runs`, hoặc hệ thống tự chạy khi đợt chuyển `INTAKE → PREFERENCE_SELECTION`. Xong lượt chấm, mọi cặp SV × JD đạt điều kiện cứng có verdict do code tính và `skill_fit`; top-M JD của mỗi CV có thêm điểm dự án, nhận xét của LLM (trích dẫn đã kiểm) và S_cv do backend tính. US-3.3 dùng kết quả để lập shortlist; US-4.4 dùng lại chế độ batch và bộ poll.

## Background

GĐ3 của PRD; ARCH › *Pipeline từng agent* › Matching, *Luồng chấm phù hợp hàng loạt*. Code (US-3.1, US-3.5, US-3.6) chấm điều kiện cứng, kỹ năng, ngoại ngữ, ngành; LLM chỉ chấm dự án (D42); code tính S_cv (AD-2). AI Service chỉ đọc view đã che PII, chỉ ghi `ai.*` (AD-4).

**Lessons applied**: §6, §7, §12 (Drizzle, migration); §10, §32 (Zod, hợp đồng message); §15, §21, §22 (chạy test); §16, §17 (RabbitMQ, listener `suppressErrors: false`); §19 (chặn mạng pytest); §30 (bảng `core` mới); §31 (khóa fixture).

## Acceptance criteria

- [x] **AC-1** — CENTER gọi `POST /api/campaigns/{id}/matching-runs` thì nhận `202 { job_id }`. Một giao dịch ghi `match_runs` ở `RUNNING`, cặp không đạt điều kiện cứng (`eligible = false`, `ineligible_reasons`) và phần code của cặp đạt (`criteria`, `skill_fit`, `facts`, `rules_version`; `s_cv` null). Sau commit phát đúng một `ai.match.run` chỉ gồm ID, phiên bản và `prompt_version` đã ghim (hoặc null). Không cặp nào cần gửi thì run kết thúc ngay.
- [x] **AC-2** — Đợt chuyển `INTAKE → PREFERENCE_SELECTION` thì lượt chấm chạy như AC-1 với actor `SYSTEM`; đổi pha khác thì không.
- [x] **AC-3** — CV chưa xác nhận hoặc không active (BR-01), JD chưa duyệt (BR-02) không nằm trong cặp nào.
- [x] **AC-4** — Cặp đã có kết quả cho (`cv_id`, `jd_id`, `cv_version`, `jd_version`, `rules_version`, prompt đã ghim) không được gửi lại; CV hoặc JD có phiên bản mới thì chỉ cặp mới được gửi (BR-18). Đợt đã có kết quả thì job mang `prompt_version` đó và AI Service render đúng bản này. Unique index `NULLS NOT DISTINCT` chặn chèn trùng.
- [x] **AC-5** — AI Service chỉ đọc `core.v_ai_cv_profile_masked`, `core.v_ai_jd_requirements`, `core.v_ai_match_pairs`; request không có tên, email, số điện thoại, ảnh, giới tính, ngày sinh, quê quán, tôn giáo, tình trạng hôn nhân (BR-03, NFR-3).
- [x] **AC-6** — Mỗi CV chỉ gửi M JD có `skill_fit` cao nhất (hòa thì `jd_id` nhỏ trước); M = `campaigns.config.match_top_m` (1–50, mặc định 10). Cặp còn lại có `skipped_by_prefilter = true`.
- [x] **AC-7** — Snapshot request Claude và Gemini: effort medium; structured output theo `MatchAssessment`; không `tool_choice`, không `temperature`; `system` chỉ có rubric `matching/v1`; block `shared` chứa yêu cầu JD (Claude gắn `cache_control`); `user` chứa hồ sơ đã che PII và bảng verdict của code; sắp theo `jd_id` rồi `cv_id`; khóa request đúng ràng buộc ký tự của API.
- [x] **AC-8** — Mỗi trích dẫn trong `project_relevance.evidence` được chuẩn hóa (NFC, chữ thường, gộp khoảng trắng) rồi so bằng `partial_ratio` với `masked_text` nối các chuỗi của `profile_masked`. `evidence_check` lưu `quote`, `score`, `matched` (≥ 85); `score_0_4` không đổi (D46). Bộ ca: trích đúng, khác hoa thường hoặc khoảng trắng, trích bịa.
- [x] **AC-9** — Request `errored`, `expired`, sai schema, `MAX_TOKENS` được gửi lại ở batch mới, tối đa 2 vòng. Refusal được gửi lại đồng bộ; vẫn từ chối thì cặp có `needs_review` và lượt sau không gửi lại. Job kết thúc `PARTIAL` kèm `failed_pairs`; lượt sau gửi lại cặp lỗi. Job lỗi toàn phần sau 3 lần thì vào DLQ.
- [x] **AC-10** — Backend nhận `ai.results` loại `MATCH`: kiểm bằng Zod và kiểm `jd_version` còn hiện hành; ghép `assessment`, tính S_cv với `facts` đã chụp và trọng số của đợt; ghi `s_cv`, `scv_breakdown`, `prompt_version`, `model`. Nhận trùng không đổi dữ liệu; không đọc điểm tổng nào từ LLM (AD-2). Message `final` đóng `match_runs`.
- [x] **AC-11** — `recomputeScv(campaignId)` tính lại `s_cv` với trọng số hiện hành; không có job mới, không có dòng `ai.llm_calls` mới.
- [x] **AC-12** — Dòng có `s_cv` đủ để giải thích điểm (NFR-4): verdict kỹ năng kèm `match_kind`, bậc, nguồn, `evidence`; ngoại ngữ, ngành, độ phủ vùng; `score_0_4` kèm lý do, trích dẫn, `evidence_check`; bảng thành phần S_cv; `strengths`, `gaps`, `suggestions`, `summary` tiếng Việt; `rules_version`, `prompt_version`, `model`.
- [x] **AC-13** — STUDENT, HR, ADMIN nhận `403`; đợt ngoài `INTAKE`, `PREFERENCE_SELECTION` nhận `409 CAMPAIGN_PHASE_MISMATCH`; đợt đang có run `RUNNING` nhận `409`, partial unique index chặn cả ở DB.
- [x] **AC-14** — Mỗi request trong batch ghi một dòng `ai.llm_calls` (`agent = matching`, `prompt_version`, `model`, `effort`, token, `cache_read_tokens`, `cache_write_tokens`, `cost_usd` giá batch, `stop_reason`, `batch_id`) và một file `llm-logs`. Mọi test chạy được khi không có key.
- [x] **AC-15** — PostgreSQL, RabbitMQ thật, AI worker ở chế độ fixture, 3 SV × 4 JD: có cặp không đạt điều kiện cứng, cặp khớp nhờ kéo theo, cặp khớp cùng họ, một trích dẫn bịa. Mọi cặp đạt có S_cv đúng theo US-3.1, US-3.5; cặp không đạt có lý do; trích dẫn bịa có `matched = false`, điểm dự án không đổi.
- [x] **AC-16** — `yearOfStudy` đọc từ `profile_masked`: ưu tiên "sinh viên năm N" ("năm cuối" bỏ qua); không có thì lấy mục học vấn đang học (năm học chứa `intake_end`, bắt đầu tháng 9, − năm bắt đầu + 1, giới hạn 1–6); không đọc được thì null → `YEAR_MISSING`.
- [x] **AC-17** — Worker ack `ai.match.run` sau khi gửi batch và ghi `ai.llm_batches`; khởi động lại thì bộ poll làm tiếp; hai replica không cùng xử lý một batch; message giao lại không tạo batch mới.

## Tasks

- [x] **TASK-3.2.1** — [Chung] Hợp đồng: job `MATCH`, queue `ai.match.run`, `MatchAssessment`, `EvidenceCheck`, `MatchRunOutput`; `match_top_m`; `pnpm contracts:gen` (AC: 1, 4, 7, 10, 12).
- [x] **TASK-3.2.2** — [Backend] DB: `core.match_results`, `core.match_runs`, view `core.v_ai_match_pairs`, `ai.llm_batches`, `ai.llm_calls.batch_id`; `CORE_TABLES`, `ai-service-role` (AC: 4, 12, 13, 17).
- [x] **TASK-3.2.3** — [Backend] Chạy chấm: domain (`year-of-study`, `rules-version`, `gaps`, `select-top-m`, `match-plan`), service export, `run-matching.service.ts`, controller, listener đổi pha (AC: 1, 2, 3, 4, 6, 13, 16).
- [x] **TASK-3.2.4** — [Backend] Nhận kết quả: `match-results.handler.ts`, `recompute-scv.ts`, `domain/pair-scv.ts` (AC: 9, 10, 11, 12).
- [x] **TASK-3.2.5** — [AI] Chế độ batch của `LLMClient`: đối chiếu tài liệu, `RenderedPrompt.shared`, `StructuredBatchClient`, ba adapter, giá batch (AC: 7, 9, 14, 17).
- [x] **TASK-3.2.6** — [AI] `Deferred`, bộ poll, Matching Agent, kiểm trích dẫn, prompt `matching/v1`, `rapidfuzz` (AC: 5, 6, 7, 8, 9, 17).
- [x] **TASK-3.2.7** — Test: pytest `tests/agents/matching/`, `tests/llm/test_batch_adapters.py`; integration `matching-run`, `match-results`; E2E `matching-end-to-end.int-spec.ts` (AC: 5, 7, 8, 9, 14, 15, 17).

## Dev notes

### Cross-story dependencies

- Builds on US-2.1, US-2.2, US-2.4, US-2.6, US-3.1, US-3.5, US-3.6, US-1.4.
- Required by US-3.3 (shortlist, cảnh báo `evidence_check`), US-4.4 (batch, bộ poll), US-6.2 (`batch_id`), US-6.3 (bộ ca trích dẫn).
- Sibling US-4.1 cùng sửa `ai-service/app/llm/`: story nào merge sau thì rebase.

### Performance budget

- NFR-7: 500 SV × 50 JD xong trong vài giờ (`ai.jobs.finished_at − created_at`); chi phí tối đa ~115 USD (top-10), ~12 USD đợt demo (tổng `cost_usd` với `agent = matching`); request thứ hai trở đi của cùng JD có `cache_read_tokens > 0`. Đo bằng một lần chạy tay với key thật. **Chưa đo.**

### What we explicitly did NOT do

- Không chấm đồng bộ từng cặp, trừ cặp bị từ chối (AD-12). Không tự chạy lại khi SV sửa CV.
- Không hạ điểm dự án khi trích dẫn không khớp (D46). Trigger: US-6.3 đo được tỷ lệ không khớp.
- Không có nút "Chấm phù hợp" trên web, không có endpoint `recomputeScv`. Trigger: US-3.3 hoặc Trung tâm cần.
- Không ghim model bằng code (quy tắc vận hành, D46). Không kiểm thiên lệch, không chạy evals với API thật (US-6.3).

## Verification commands

| AC | Command |
|---|---|
| AC-1, AC-6 | `matching-run.int-spec.ts` › `GĐ3 matching run: hard-filter rejects stored, code part saved, top-M pairs published as IDs only`; `select-top-m.spec.ts` |
| AC-2 | `matching-run.int-spec.ts` › `GĐ3 matching run starts on INTAKE → PREFERENCE_SELECTION` |
| AC-3 | `matching-run.int-spec.ts` › `BR-01 BR-02 only confirmed CVs and approved JDs are paired` |
| AC-4 | `matching-run.int-spec.ts` › `BR-18 cached pairs skipped, new versions sent, prompt pinned per campaign, unique index blocks duplicates` |
| AC-5 | `test_pii.py` › `test_br03_llm_request_has_no_pii` |
| AC-7 | `test_request_shape.py` › `test_ad12_batch_request_snapshot_anthropic`, `test_ad12_batch_request_snapshot_gemini` |
| AC-8 | `test_evidence_check.py` › `test_gd3_true_evidence_matched`, `test_gd3_case_and_space_only_matched`, `test_gd3_fabricated_evidence_flagged_score_kept` |
| AC-9 | `test_batch_errors.py` › `test_gd3_errored_expired_invalid_resubmitted`, `test_gd3_refusal_resent_sync_then_needs_review`, `test_gd3_partial_lists_failed_pairs`; `match-results.int-spec.ts` › `GĐ3 AC-9 …` |
| AC-10 | `match-results.int-spec.ts` › `AD-2 backend computes S_cv; duplicate ai.results is idempotent`, `AD-2 an assessment of a JD version no longer current is not applied; …` |
| AC-11 | `match-results.int-spec.ts` › `AD-2 weight change recomputes S_cv without new job` |
| AC-12 | `match-results.int-spec.ts` › `NFR-4 stored result carries verdicts, evidence and breakdown` |
| AC-13 | `matching-run.int-spec.ts` › `matching run: non-CENTER 403, wrong phase 409, concurrent run 409` |
| AC-14 | `test_llm_calls.py` › `test_gd3_each_batch_request_logged`; cả bộ pytest chạy khi không có key |
| AC-15 | `matching-end-to-end.int-spec.ts` › `GĐ3 end-to-end matching with AI fixture mode` |
| AC-16 | `year-of-study.spec.ts` › `GĐ3 year of study from confirmed profile` |
| AC-17 | `test_batch_poller.py` › `test_gd3_ack_after_submit_resume_after_restart`, `test_gd3_two_replicas_one_batch`, `test_gd3_long_read_keeps_its_lease` |

- `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/(matching-run|match-results|matching-end-to-end|core-schema|ai-service-role)' --selectProjects integration`
- `ai-service/.venv/Scripts/pytest ai-service/tests/agents/matching ai-service/tests/llm`

## Changelog entry

Xem [CHANGELOG 0.17.0](../../CHANGELOG.md).

**Commit**: db5378c

## Implementation notes

Thiết kế nằm ở [CONTEXT D46](../../CONTEXT.md), ARCH › *Pipeline từng agent* › Matching, *Chọn model* (kết luận đối chiếu API của Claude và Gemini), *Các bảng chính*, *Hàng đợi*; bẫy về thứ tự kết quả ở [LESSONS §33](../../LESSONS.md). Dưới đây là điều code và các file đó chưa nói.

**Cho US-3.3 (đọc kết quả)**:

- Run `SUCCEEDED` chưa chắc đủ dữ liệu: message cuối có thể đóng run trước chunk (§33); chunk vào DLQ, hay item bị bỏ vì JD đã sang phiên bản khác, cũng không hạ trạng thái. Kiểm `pairs_scored + pairs_failed` so với `pairs_sent`.
- Dòng `needs_review` cần người xử lý. Trích dẫn `matched = false` nằm trong `assessment.evidence_check`.
- JD chuyển `FILLED`/`CLOSED` trong lúc chấm vẫn nhận điểm (khớp với `v_ai_jd_requirements`). JD sang phiên bản mới hoặc quay lại duyệt thì item bị bỏ, cặp mới chờ lượt sau.
- `RecomputeScvService` chỉ tính lại dòng của JD ở phiên bản hiện hành (DB không lưu yêu cầu của phiên bản cũ); dòng khác giữ S_cv cũ (`kept`).

**Fixture E2E**: khóa fixture phụ thuộc prompt, tức cả verdict do code viết vào prompt, nên đổi luật khớp hay dữ liệu E2E thì phải ghi lại. Test ghi request còn thiếu fixture ra `<tmpdir>/srm-matching-fixtures/`.

**Review (phiên 3)** đã sửa: `job_id` ghi trước khi dispatch (cột `dispatched_at`); bộ poll gia hạn lease; `STALE` sau 7 ngày; `409 MATCHING_RUN_TOO_LARGE`; giữ kết quả của JD đã `FILLED`/`CLOSED`; tên test pytest có mã `gd3`.

**Giới hạn đã biết** (review nêu, chưa sửa):

- Lỗi sau khi đọc kết quả một part (publish chunk, `finish`, commit) làm bộ poll đọc lại cả part: `ai.llm_calls` ghi lặp, cặp bị từ chối được gửi lại đồng bộ lần nữa. Backend vẫn đúng nhờ nhận trùng.
- Nhà cung cấp đã nhận batch mà worker chưa ghi `provider_batch_id` thì dòng `PREPARING` được gửi lại khi hết lease; batch đầu bị bỏ mà vẫn tính tiền. Chưa tìm lại theo `display_name`.
- Listener đổi pha gặp run đang chạy (409) thì chỉ ghi log; CV xác nhận sau lượt đó chờ lượt chạy tay.
- Mỗi chunk `ai.results` mang cả `job` (tới 50.000 cặp, khoảng 3 MB). US-4.4 nên cân nhắc echo gọn.
- `MATCHING_RUN_TOO_LARGE` chưa có test (cần hơn 50.000 cặp).
- `StudentRecord` (domain) và `StudentSchoolRecord` (module student) trùng hình dạng: domain không import module được.
- Cặp đã có kết quả không bị lọc lại khi GPA, ngành đổi mà phiên bản CV, JD giữ nguyên. Phần code chạy đồng bộ trong request, chưa đo với 500 × 50.

**Còn chờ người dùng**: chạy `ai-service/evals/smoke_llm.py` cho batch với key thật; ba số đo của *Performance budget*.

## Files modified

- `packages/shared` (contracts `jobs`, `queues`, `matching`, `envelope` + output sinh ra; schemas `campaign`, `matching`, `errors`).
- `apps/api`: `src/db/schema` (`matching.ts`, `ai.ts`), `drizzle/0024`, `0025`; `src/modules/matching/` (domain, application, infrastructure, api); service export ở `student`, `company`; `aigateway` (`dispatch` nhận `jobId`, `AI_RESULT_EVENTS.MATCH`); `common/errors`; test integration (`matching-run`, `match-results`, `matching-end-to-end`, `core-schema`, `ai-service-role`), `helpers/ai-results.ts`.
- `apps/web`: `labels.ts`, `errors.ts`, `openapi.json`, `schema.d.ts`.
- `ai-service`: `app/llm` (batch, adapter, `shared`, giá batch), `app/consumers` (`batches.py`, `batch_poller.py`, `Deferred`), `app/agents/matching/`, prompt `matching/v1`, `worker.py`, `config.py`, `pyproject.toml`; test `tests/agents/matching/`, `tests/llm/`, fixture `tests/fixtures/llm/matching/`.
- `deploy` (`LLM_BATCH_POLL_SECONDS`), `DEPLOY.md`; tài liệu AGENTS, PRD, ARCHITECTURE, CONTEXT, LESSONS, CHANGELOG.

## Cross-references

- [PRD FR-14, NFR-4, NFR-7](../../PRD.md#functional-requirements)
- [Epic EPIC-3](../epics/EPIC-3.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D2, D12, D42, D46](../../CONTEXT.md)
- [LESSONS §33](../../LESSONS.md)
