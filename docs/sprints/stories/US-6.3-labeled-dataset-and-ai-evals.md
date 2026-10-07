---
id: US-6.3
title: "Tập gán nhãn và bộ đánh giá AI"
epic: EPIC-6
status: backlog
priority: P1
points: 8
sprint:
version_shipped:
prd_ref: [FR-35]
depends_on: [US-2.3, US-2.4, US-3.2, US-4.2, US-4.4]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
external_deps: [labeled_dataset, anthropic_api]
---

## Goal

Có số liệu chất lượng của từng agent (CV Parser, JD Analyzer, Matching, Test Generator + Validator, Grader) trên một tập dữ liệu gán nhãn tay, đủ để chương thực nghiệm chứng minh các agent AI đủ chính xác. Bộ đánh giá cũng là cổng bắt buộc trước khi dùng một phiên bản prompt mới hoặc đổi model (ARCH › *Quản lý prompt*, *Chọn model*): đổi gì cũng chạy lại, so số liệu, rồi mới quyết định.

## Background

FR-35 (P1) yêu cầu bộ đánh giá chất lượng AI theo PRD › *Chỉ số đánh giá hệ thống*:

| Thành phần | Chỉ số | Cách đo |
|---|---|---|
| Phân tích CV/JD | Precision / Recall / F1 theo từng trường | Khoảng 50 CV và 20 JD gán nhãn tay |
| Chấm phù hợp | Spearman, NDCG@k giữa xếp hạng của AI và của người | 2–3 người đánh giá xếp hạng độc lập |
| Sinh đề | Tỷ lệ câu hợp lệ; độ khó thực tế so với nhãn; độ phân biệt | Chuyên gia đánh giá + dữ liệu làm bài thử |
| Chấm tự luận | MAE; Cohen's kappa có trọng số | Bài làm đã có điểm của người chấm |

Dữ liệu đến từ Track B ([sprints/README › Lộ trình](../README.md#lộ-trình)): thu khoảng 50 CV (ẩn danh, có đồng ý) và 20 JD, gán nhãn trường trích xuất ở T1–T5; người đánh giá xếp hạng các cặp CV–JD ở T5–T8; bài làm thử, điểm người chấm và đánh giá chất lượng câu hỏi ở T8–T10. Thiếu dữ liệu thật thì dùng dữ liệu tổng hợp. Vì vậy story có `external_deps: labeled_dataset` (thời gian của người đánh giá, nằm ngoài tầm kiểm soát của dev) và `anthropic_api` (lần chạy thật cần API key và ngân sách). Story chạy ở T9–T10 (W49–W50), làn B, khi các agent ở US-2.3, US-2.4, US-3.2, US-4.2, US-4.4 đã xong.

Ba ràng buộc định hình story. Một: API thật chỉ chạy trong `ai-service/evals/`, khởi động thủ công, không chạy trong CI (AGENTS › *Gọi Claude API*; ARCH › CI). Hai: dữ liệu đánh giá đã ẩn danh, CV thật cần sinh viên đồng ý (NFR-2; ARCH › *Lưu trữ file và thời hạn dữ liệu* cho phép giữ dữ liệu đã ẩn danh để đánh giá mô hình). Ba: kết quả chỉ dùng để hiệu chỉnh cho đợt sau, không đổi trọng số hay prompt của đợt đang chạy (PRD › *Vòng phản hồi*). CONTEXT D10 chọn một model cho mọi agent để có "một bộ đánh giá"; D12 cố định prompt theo phiên bản, nên mỗi số liệu phải gắn với `model` và `prompt_version` mới tái hiện được.

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — `ai-service/evals/data/` có manifest (đề xuất `manifest.json`) ghi `dataset_version` và, cho từng mục: `id`, loại (`cv`, `jd`, `cv_jd_ranking`, `essay`, `question_review`), nguồn (`real` / `synthetic`), `consent` (với CV thật), `anonymized`, `sha256` của file. **Given** một file bị sửa mà `dataset_version` không đổi, **When** loader đọc tập dữ liệu, **Then** dừng và báo tên file có hash lệch.
- [ ] **AC-2** — **Given** một mục nguồn `real` thiếu `consent: true` hoặc chưa `anonymized`, **When** loader đọc, **Then** dừng với lỗi ghi `id` của mục và không gửi gì cho LLM **And** mục đã đánh dấu ẩn danh mà hàm che PII của US-2.4 vẫn tìm thấy email hoặc số điện thoại thì cũng dừng.
- [ ] **AC-3** — **Given** nhãn tay cho các trường của hồ sơ năng lực (CV) và yêu cầu chuẩn hóa (JD), **When** chạy eval cho `cv_parser` và `jd_analyzer`, **Then** báo cáo có Precision, Recall, F1 cho từng trường, kèm trung bình micro và macro **And** trường dạng danh sách (VD kỹ năng) so như tập hợp sau khi chuẩn hóa tên theo danh mục kỹ năng của US-2.5; trường đơn so khớp chính xác sau chuẩn hóa **And** quy tắc đếm TP/FP/FN được in trong báo cáo.
- [ ] **AC-4** — **Given** xếp hạng độc lập của 2–3 người đánh giá trên các cặp CV–JD mẫu, **When** chạy eval cho `matching`, **Then** với mỗi JD, AI xếp hạng theo S_cv tính bằng chính hàm S_cv của US-3.1 từ verdict của Matching Agent (không viết lại công thức) **And** báo cáo có Spearman ρ và NDCG@k (k là tham số, đề xuất 3, 5, 10) giữa AI và từng người, giữa AI và xếp hạng trung bình của người **And** có Spearman giữa các người đánh giá với nhau làm mốc trần.
- [ ] **AC-5** — **Given** bộ cặp CV / bằng chứng đúng và bịa của US-3.2, **When** chạy eval, **Then** báo cáo có tỷ lệ bằng chứng bịa bị hạ về `NOT_MET` và tỷ lệ bằng chứng đúng bị hạ nhầm (ngưỡng RapidFuzz 85) **And** trên đầu ra thật của Matching Agent, báo cáo tỷ lệ verdict `MET`/`PARTIAL` bị hạ vì trích dẫn không khớp văn bản CV.
- [ ] **AC-6** — **Given** ngân hàng câu hỏi đã khóa (US-4.2), đánh giá của chuyên gia trên một mẫu câu và dữ liệu làm bài thử, **When** chạy eval câu hỏi, **Then** báo cáo có: tỷ lệ câu hợp lệ theo chuyên gia; độ đồng thuận giữa kết luận của Validator và của chuyên gia; độ khó thực tế (tỷ lệ làm đúng) theo từng mức khó được gán; độ phân biệt của từng câu trắc nghiệm (đề xuất chỉ số nhóm trên − nhóm dưới, mỗi nhóm 27%).
- [ ] **AC-7** — **Given** bài tự luận có điểm của người chấm, **When** chạy eval cho `grader`, **Then** báo cáo có MAE giữa điểm AI và điểm người theo thang của từng câu, Cohen's kappa có trọng số (đề xuất trọng số bậc hai) **And** tỷ lệ bài bị chuyển người chấm theo quy tắc của US-4.4 và độ lệch trung bình giữa hai lần chấm độc lập.
- [ ] **AC-8** — Mỗi lần chạy tạo `ai-service/evals/reports/<run_id>/` gồm số liệu dạng JSON và bảng tóm tắt Markdown cho chương thực nghiệm **And** mỗi số liệu ghi kèm `dataset_version`, `model`, `prompt_version` và `effort` của từng agent, commit git, thời điểm chạy, tham số (k, ngưỡng) **And** báo cáo có tổng token và chi phí của lần chạy lấy từ `usage` mà `LLMClient` trả về.
- [ ] **AC-9** — Chế độ gọi API thật chỉ chạy khi người dùng bật cờ rõ ràng và có `ANTHROPIC_API_KEY`; **Given** biến môi trường `CI` có giá trị, **When** khởi động chế độ thật, **Then** từ chối chạy **And** mọi lượt gọi đi qua `LLMClient`, `ai-service/evals/` không import SDK `anthropic` trực tiếp **And** lượt có `stop_reason == "refusal"` được ghi là `refused`, đếm riêng, không làm dừng cả lần chạy.
- [ ] **AC-10** — Phản hồi của lần chạy thật được ghi lại. **Given** bản ghi của một lần chạy, **When** chạy lại ở chế độ replay, **Then** ra đúng số liệu cũ mà không gọi API. CI chỉ dùng chế độ replay hoặc fixture.
- [ ] **AC-11** — Hàm tính chỉ số có unit test trên giá trị biết trước: Spearman của hai xếp hạng trùng nhau = 1, đảo ngược = −1; NDCG trên ví dụ tính tay; kappa có trọng số trên một ví dụ công bố sẵn; P/R/F1 khi tập dự đoán hoặc tập nhãn rỗng có quy ước rõ, không chia cho 0. Đường MAE/kappa chạy được trên fixture Grader của US-4.4.
- [ ] **AC-12** — Bộ đánh giá không đổi gì của hệ thống đang chạy: không ghi schema `core`, không sửa file prompt đã có, không đổi `campaigns.config` (PRD › *Vòng phản hồi*) **And** Matching và Grader chỉ nhận dữ liệu đã che PII (`profile_masked`, bài làm không kèm danh tính) theo BR-03.

## Tasks

- [ ] **TASK-6.3.1** — Dùng skill `claude-api` trước khi viết code gọi LLM; xác nhận `LLMClient` (US-2.2) có chế độ thật, fixture và ghi lại phản hồi dùng được cho evals (AC: 9, 10)
  - [ ] Subtask 6.3.1.1 — Nếu `LLMClient` chưa có chế độ ghi lại (record), thêm vào `ai-service/app/llm/` thay vì viết lớp gọi riêng trong `ai-service/evals/`.
- [ ] **TASK-6.3.2** — Định dạng tập dữ liệu và loader có chặn đồng ý, PII (AC: 1, 2)
  - [ ] Subtask 6.3.2.1 — `ai-service/evals/data/`: manifest, thư mục con theo loại mục; thống nhất định dạng nhãn với người gán nhãn của Track B trước T5.
  - [ ] Subtask 6.3.2.2 — `ai-service/evals/dataset.py`: đọc manifest, kiểm hash, kiểm `consent`/`anonymized`, gọi hàm che PII của `ai-service/app/parsing/` (US-2.4).
  - [ ] Subtask 6.3.2.3 — Hỏi người dùng chỗ lưu file CV thật đã ẩn danh (commit vào git hay để ngoài repo) trước khi thêm file đầu tiên.
- [ ] **TASK-6.3.3** — Thư viện chỉ số và unit test (AC: 11)
  - [ ] Subtask 6.3.3.1 — `ai-service/evals/metrics.py`: P/R/F1, Spearman, NDCG@k, MAE, kappa có trọng số, độ phân biệt câu hỏi.
  - [ ] Subtask 6.3.3.2 — `ai-service/tests/evals/test_metrics.py`. Hỏi người dùng trước nếu muốn dùng scipy hoặc scikit-learn (không có trong ARCH › Tech stack).
- [ ] **TASK-6.3.4** — Eval trích xuất CV và JD (AC: 3, 8)
  - [ ] Subtask 6.3.4.1 — `ai-service/evals/extraction.py`: gọi agent `cv_parser` và `jd_analyzer` qua đúng đường code mà worker dùng, so với nhãn, chuẩn hóa kỹ năng bằng `ai-service/app/embedding/` (US-2.5).
- [ ] **TASK-6.3.5** — Eval matching và kiểm tra trích dẫn (AC: 4, 5, 12)
  - [ ] Subtask 6.3.5.1 — `ai-service/evals/matching.py`: gọi agent `matching` trên `profile_masked`, chạy bước kiểm tra trích dẫn của US-3.2, lấy S_cv từ hàm của US-3.1 (xem Dev notes › Architecture constraints về cách gọi hàm TS).
  - [ ] Subtask 6.3.5.2 — Dùng lại bộ test trích dẫn (bằng chứng đúng và bịa) của US-3.2, không tạo bộ thứ hai.
- [ ] **TASK-6.3.6** — Eval câu hỏi và Grader (AC: 6, 7, 12)
  - [ ] Subtask 6.3.6.1 — `ai-service/evals/questions.py`: đọc ngân hàng đã khóa, đánh giá của chuyên gia, dữ liệu làm bài thử.
  - [ ] Subtask 6.3.6.2 — `ai-service/evals/grader.py`: chấm 2 lần qua agent `grader`, áp quy tắc chuyển người chấm của US-4.4, so với điểm người; dùng fixture `ai-service/tests/fixtures/grader/` cho test.
- [ ] **TASK-6.3.7** — Runner, báo cáo, record/replay (AC: 8, 9, 10)
  - [ ] Subtask 6.3.7.1 — `ai-service/evals/run.py`: chọn agent, chế độ (`live` / `replay`), tham số; chặn chế độ `live` khi có biến `CI`.
  - [ ] Subtask 6.3.7.2 — Ghi `ai-service/evals/reports/<run_id>/` (JSON + Markdown) kèm siêu dữ liệu ở AC-8.
  - [ ] Subtask 6.3.7.3 — `ai-service/tests/evals/test_runner.py`: replay trên bản ghi mẫu, kiểm siêu dữ liệu và việc chặn `CI`.
- [ ] **TASK-6.3.8** — Chạy thật một lần trên toàn bộ tập dữ liệu, lưu báo cáo, viết bảng số liệu cho chương thực nghiệm (AC: 8)
  - [ ] Subtask 6.3.8.1 — Ghi đường dẫn báo cáo và chi phí thật vào Implementation notes.

## Dev notes

### Architecture constraints

- [AD-10](../../ARCHITECTURE.md#architecture-decisions): một model `claude-opus-5-5` cho mọi agent, mọi lượt gọi qua `LLMClient`. Bộ đánh giá nhận tham số `model` (mặc định `claude-opus-5-5`) để đo các model rẻ hơn mà ARCH › *Chọn model* gợi ý thử (Sonnet 5.5, Haiku 4.5) trước khi quyết định đổi; không tự đổi model của hệ thống.
- [AD-12](../../ARCHITECTURE.md#architecture-decisions): prompt là file có phiên bản; eval chạy đúng phiên bản được chỉ định và ghi `prompt_version`. Eval cho matching và grader đi qua Message Batches như worker thật, vừa đo đúng đường chạy thật vừa rẻ hơn 50%.
- [AD-2](../../ARCHITECTURE.md#architecture-decisions): xếp hạng của AI dựa trên S_cv do code tính, không phải số do LLM đưa ra.
- [AD-4](../../ARCHITECTURE.md#architecture-decisions), BR-03: Matching và Grader chỉ nhận dữ liệu đã che PII. Eval không ghi `core`.
- AGENTS › *Gọi Claude API*: API thật chỉ chạy trong `ai-service/evals/`, khởi động thủ công; test dùng fixture. ARCH › CI xác nhận: "Bộ đánh giá AI với API thật chạy thủ công khi đổi prompt".
- **Điểm cần hỏi — gọi hàm S_cv viết bằng TypeScript từ Python.** Hàm S_cv nằm ở `apps/api/src/modules/matching/domain/` (US-3.1). Spec không nói Python gọi nó thế nào. Đề xuất dùng chung cách của [US-6.4](US-6.4-allocation-simulation-vs-baselines.md): một script Node chạy trên bản build của `apps/api`, đọc JSON verdict, trả JSON S_cv. Phương án viết lại công thức bằng Python bị loại vì hai bản có thể lệch nhau.
- **Điểm cần hỏi — thư viện thống kê.** ARCH › Tech stack của AI Service không có scipy hay scikit-learn. Tạm tự viết các hàm trong `metrics.py` (đều ngắn) và kiểm bằng giá trị biết trước; muốn dùng thư viện thì hỏi trước.
- **Điểm cần hỏi — chỗ lưu dữ liệu thật.** File CV thật dù đã ẩn danh vẫn là dữ liệu cá nhân có đồng ý (NFR-2). Spec không nói có commit vào git không. Đề xuất: chỉ commit dữ liệu tổng hợp, nhãn và manifest; file từ CV thật để ngoài git (VD bucket MinIO riêng hoặc thư mục bị `.gitignore`), manifest giữ hash để kiểm.
- Chạm Q8: bộ đánh giá là cách đo chất lượng khi cân nhắc đổi nhà cung cấp hay model. Tạm dùng Đề xuất (lớp trừu tượng `LLMClient`, hiện dùng Claude API); hỏi trước khi chốt.
- Chạm Q7: không đánh giá phần C (lập trình), vì MVP chỉ có trắc nghiệm và tự luận theo Đề xuất của Q7.
- Story này không thêm AD mới.

### Cross-story dependencies

- Builds on [US-2.2](US-2.2-llm-client-versioned-prompts.md) — `LLMClient` (chế độ thật/fixture, `usage`, chi phí), quy ước `ai-service/app/prompts/<agent>/v<N>.md`.
- Builds on [US-2.3](US-2.3-jd-analyzer-hr-requirement-confirmation.md) — agent `jd_analyzer`, schema yêu cầu chuẩn hóa.
- Builds on [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md) — agent `cv_parser`, hàm che PII trong `ai-service/app/parsing/`, bộ CV mẫu `ai-service/tests/fixtures/cv/`.
- Builds on [US-2.5](US-2.5-embeddings-skill-catalog.md) — chuẩn hóa tên kỹ năng theo danh mục (so trường danh sách ở AC-3).
- Builds on [US-3.1](US-3.1-hard-filters-and-scv-formula.md) — hàm tính S_cv.
- Builds on [US-3.2](US-3.2-batch-matching-agent.md) — agent `matching`, bước kiểm tra trích dẫn (RapidFuzz ≥ 85), bộ test bằng chứng đúng và bịa.
- Builds on [US-4.1](US-4.1-exam-blueprint-test-generator.md) và [US-4.2](US-4.2-validator-and-question-bank-lock.md) — ngân hàng câu hỏi đã kiểm định và khóa, kết luận của Validator.
- Builds on [US-4.4](US-4.4-grading-stest-sfinal.md) — agent `grader`, quy tắc chuyển người chấm, fixture `ai-service/tests/fixtures/grader/`.
- Required by mọi phiên bản prompt `v<N+1>` sau này (ARCH › *Quản lý prompt*: đổi prompt thì chạy bộ đánh giá trước khi dùng).
- Required by [US-6.6](US-6.6-demo-data-e2e-load-test.md) — báo cáo phát hành 1.0.0 trích số liệu đánh giá.
- Sibling [US-4.8](US-4.8-cv-verification-questions-trust-score.md) (T9) và [US-4.7](US-4.7-cheating-signals.md) (T10) — cùng làn B; không sửa chung file, nhưng cùng dùng `LLMClient` và `ai-service/tests/fixtures/`.
- Phụ thuộc ngoài: Track B (người gán nhãn, 2–3 người đánh giá là giảng viên/HR, bài làm thử). Tập dữ liệu phải xong trước T9.

### Performance budget

- Không nằm trên đường nóng; epic không đặt ngân sách thời gian cho story này.
- Chi phí mỗi lần chạy thật được đo từ `usage` và ghi vào báo cáo (AC-8). Lần chạy thật cũng xuất hiện trên màn chi phí của [US-6.2](US-6.2-llm-cost-tracking.md) ở nhóm "Không thuộc đợt".
- Chạy lại ở chế độ replay không tốn chi phí API; dùng chế độ này khi chỉ sửa cách tính chỉ số.

### What we explicitly did NOT do

- Không tự hiệu chỉnh α, β, wᵢ hay prompt từ kết quả đánh giá. PRD › *Vòng phản hồi* chỉ cho hiệu chỉnh cho đợt sau, do người quyết định; "học trọng số từ phản hồi HR" là phần *Mở rộng*.
- Không chạy chế độ gọi API thật trong CI.
- Không làm kiểm tra thiên lệch theo nhóm sinh viên (ngành, khoa) nêu ở PRD › *Kiểm soát rủi ro AI (guardrails)*. Epic không giao việc này cho story nào; hỏi người dùng có cần thêm story không.
- Không đo tương quan giữa S_final và quyết định thực tế của HR (PRD › *Vòng phản hồi*). Việc này cần dữ liệu của một đợt thật; epic chưa giao cho story nào.
- Không đánh giá câu hỏi xác minh CV (phần D, US-4.8). PRD › *Chỉ số đánh giá hệ thống* không có chỉ số cho phần này.
- Không làm giao diện web cho kết quả đánh giá; báo cáo là file JSON và Markdown.

### References

- [Source: PRD › Success Criteria (Chỉ số đánh giá hệ thống)](../../PRD.md#success-criteria)
- [Source: PRD › Functional Requirements (FR-35)](../../PRD.md#functional-requirements)
- [Source: PRD › Non-Functional Requirements (NFR-2, NFR-3)](../../PRD.md#non-functional-requirements)
- [Source: PRD › Kiến trúc AI Agent (Kiểm soát rủi ro AI, Vòng phản hồi); Cơ chế chấm điểm; GĐ5, GĐ6](../../PRD.md)
- [Source: ARCHITECTURE › AI Service và các AI Agent (Pipeline từng agent, Quản lý prompt)](../../ARCHITECTURE.md#component-architecture)
- [Source: ARCHITECTURE › LLM usage and cost (Chọn model)](../../ARCHITECTURE.md#llm-usage-and-cost)
- [Source: ARCHITECTURE › Testing strategy (Đánh giá AI)](../../ARCHITECTURE.md#testing-strategy)
- [Source: ARCHITECTURE › Project structure (`ai-service/evals/`)](../../ARCHITECTURE.md#project-structure)
- [Source: sprints/README › Lộ trình (Track B)](../README.md#lộ-trình)
- [Source: CONTEXT D10, D12, D20](../../CONTEXT.md)
- [Source: EPIC-6](../epics/EPIC-6.md)

## Verification commands

Lệnh chạy cụ thể sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case. Mọi test ở đây chạy bằng fixture hoặc replay, không gọi API thật.

| AC | Command |
|---|---|
| AC-1 | `ai-service/tests/evals/test_dataset.py` › `test_hash_mismatch_without_version_bump_stops_loader` |
| AC-2 | `ai-service/tests/evals/test_dataset.py` › `test_nfr2_real_cv_without_consent_is_rejected`; `test_br03_anonymized_item_with_email_is_rejected` |
| AC-3 | `ai-service/tests/evals/test_extraction.py` › `test_gd2_field_level_prf1_with_skill_normalization` |
| AC-4 | `ai-service/tests/evals/test_matching_eval.py` › `test_gd3_ranking_uses_scv_from_ts_formula`; `test_gd3_spearman_ndcg_against_each_rater` |
| AC-5 | `ai-service/tests/evals/test_matching_eval.py` › `test_gd3_fabricated_evidence_demoted_rate` |
| AC-6 | `ai-service/tests/evals/test_questions.py` › `test_gd5_validity_difficulty_discrimination` |
| AC-7 | `ai-service/tests/evals/test_grader_eval.py` › `test_gd6_mae_weighted_kappa_on_grader_fixture` |
| AC-8 | `ai-service/tests/evals/test_runner.py` › `test_report_contains_model_prompt_version_dataset_version` |
| AC-9 | `ai-service/tests/evals/test_runner.py` › `test_live_mode_refused_when_ci_set`; `test_refusal_counted_not_fatal`; `rg -n "^\s*(import anthropic\|from anthropic)" ai-service/evals` không trả dòng nào |
| AC-10 | `ai-service/tests/evals/test_runner.py` › `test_replay_reproduces_recorded_metrics_without_api` |
| AC-11 | `ai-service/tests/evals/test_metrics.py` (toàn bộ file) |
| AC-12 | `ai-service/tests/evals/test_matching_eval.py` › `test_br03_matching_eval_reads_profile_masked_only`; `git diff --stat main -- ai-service/app/prompts` chỉ có file mới, không sửa file cũ |

## Changelog entry

### Added
- Bộ đánh giá AI trong `ai-service/evals/` (FR-35): P/R/F1 theo trường cho CV Parser và JD Analyzer; Spearman, NDCG@k cho Matching; tỷ lệ câu hợp lệ, độ khó thực tế, độ phân biệt cho ngân hàng câu hỏi; MAE và kappa có trọng số cho Grader.
- Tập dữ liệu gán nhãn có manifest, phiên bản và hash; loader chặn CV thật chưa có đồng ý hoặc chưa ẩn danh.
- Báo cáo mỗi lần chạy ghi `model`, `prompt_version`, phiên bản tập dữ liệu và chi phí; chạy lại ở chế độ replay không gọi API. Chế độ gọi API thật chỉ chạy thủ công, bị chặn trong CI.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-35](../../PRD.md#functional-requirements)
- [PRD › Success Criteria](../../PRD.md#success-criteria)
- [Epic EPIC-6](../epics/EPIC-6.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D10, D12](../../CONTEXT.md)
- [US-6.4 — Mô phỏng phân bổ so với baseline](US-6.4-allocation-simulation-vs-baselines.md)
