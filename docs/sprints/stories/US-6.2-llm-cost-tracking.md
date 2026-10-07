---
id: US-6.2
title: "Theo dõi chi phí LLM"
epic: EPIC-6
status: backlog
priority: P1
points: 3
sprint:
version_shipped:
prd_ref: [FR-37, NFR-11]
depends_on: [US-2.2]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Quản trị hệ thống thấy LLM đã tiêu bao nhiêu token và bao nhiêu tiền, chia theo agent, theo đợt và theo ngày; thấy tỷ lệ cache hit và tỷ lệ refusal; được cảnh báo khi chi phí trong ngày vượt ngưỡng. Nhóm đồ án có số đo thật cho chỉ số "chi phí LLM trên mỗi sinh viên" (PRD › *Chỉ số đánh giá hệ thống*) để so với ước tính ~0,9 USD/SV (BRIEF › Success Criteria), và kiểm chứng được Batches và prompt caching có giảm chi phí như thiết kế hay không.

## Background

FR-37 và NFR-11 yêu cầu theo dõi token và chi phí theo đợt. Personas giao việc "giám sát chi phí" cho Quản trị hệ thống. ARCH › *Tối ưu chi phí* quy định mọi lượt gọi ghi `usage` vào `ai.llm_calls`; [US-2.2](US-2.2-llm-client-versioned-prompts.md) làm việc ghi này trong `LLMClient`, kể cả `cost_usd`. EPIC-2 › Out of scope để phần dashboard cho story này.

ARCH › *Deployment architecture* › *Giám sát* mô tả "Dashboard AI từ bảng `ai.llm_calls`: token, chi phí theo agent/ngày, độ trễ, tỷ lệ cache hit, tỷ lệ bị từ chối" và cảnh báo "chi phí vượt ngưỡng ngày". ARCH › *AI Service và các AI Agent* › *Vai trò* đặt endpoint thống kê chi phí ở FastAPI của AI Service (`ai-api`). EPIC-6 loại Prometheus/Grafana: dashboard đọc thẳng `ai.llm_calls`.

Story làm ở T6 (W46), làn A, ngay sau `LLMClient` (T4). Làm sớm để từ M2 trở đi, mỗi lần chạy thử CV Parser, JD Analyzer, Matching đều có số chi phí thật. ARCH › *Ước tính chi phí (thô)* ghi rõ số token là giả định, có thể chênh 2–3 lần, cần đo lại sau khoảng 20 CV. Liên quan: AD-10, AD-12 (CONTEXT D10, D12).

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** `ai.llm_calls` có các lượt gọi của nhiều agent, nhiều ngày, nhiều đợt, **When** Quản trị gọi endpoint thống kê với khoảng thời gian [`from`, `to`) và `group_by` là `agent`, `campaign` hoặc `day`, **Then** mỗi nhóm có: số lượt gọi, Σ `input_tokens`, Σ `cache_read_tokens`, Σ `cache_write_tokens`, Σ `output_tokens`, Σ `cost_usd`, độ trễ p50/p95 từ `latency_ms`, tỷ lệ cache hit, tỷ lệ refusal **And** tổng của mọi nhóm bằng tổng toàn bộ dòng trong khoảng (không mất, không đếm trùng dòng nào).
- [ ] **AC-2** — Tỷ lệ cache hit = Σ `cache_read_tokens` / (Σ `input_tokens` + Σ `cache_read_tokens` + Σ `cache_write_tokens`). Tỷ lệ refusal = số dòng có `stop_reason = 'refusal'` / số dòng. Mẫu số bằng 0 thì trả `null`, không trả `NaN` hay `500`.
- [ ] **AC-3** — **Given** một đợt có lượt gọi LLM, **When** xem nhóm theo `campaign`, **Then** mỗi đợt có chi phí trên mỗi sinh viên = Σ `cost_usd` của đợt / số sinh viên có CV trong đợt, hiển thị cạnh mốc tham chiếu 0,9 USD/SV **And** đợt chưa có sinh viên nào thì giá trị là `null`.
- [ ] **AC-4** — **Given** lượt gọi không thuộc đợt nào (VD: lần chạy bộ đánh giá của [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md)), **When** nhóm theo `campaign`, **Then** các lượt này nằm trong nhóm "Không thuộc đợt" và không được tính vào chi phí trên mỗi sinh viên của đợt nào.
- [ ] **AC-5** — **Given** ngưỡng chi phí ngày đã được cấu hình, **When** Σ `cost_usd` của một ngày trong khoảng xem vượt ngưỡng, **Then** response có mục `alerts` ghi ngày, chi phí, ngưỡng **And** màn chi phí hiện cảnh báo nổi bật **And** AI Service ghi log mức WARN kèm ngày và chi phí **And** chưa cấu hình ngưỡng thì không có cảnh báo và màn hiện "Chưa đặt ngưỡng chi phí ngày".
- [ ] **AC-6** — **Given** người dùng có vai trò `CENTER`, `HR` hoặc `STUDENT`, **When** gọi endpoint thống kê, **Then** nhận `403` **And** không có token thì nhận `401`. Endpoint chỉ đọc: không ghi bảng nào, không đọc `core` ngoài view đã che PII.
- [ ] **AC-7** — **Given** Quản trị mở màn chi phí LLM, **When** dữ liệu tải xong, **Then** màn có: các ô số tổng (chi phí trong khoảng, chi phí/SV của đợt đang chọn, tỷ lệ cache hit, tỷ lệ refusal), biểu đồ chi phí theo ngày, bảng theo agent và bảng theo đợt **And** có trạng thái đang tải, rỗng ("Chưa có lượt gọi LLM nào trong khoảng này"), lỗi **And** chuỗi tiếng Việt, màu theo token của `DESIGN.md`.
- [ ] **AC-8** — Story không thêm service nào vào `deploy/docker-compose.yml` (không Prometheus, không Grafana) và không sửa cách `LLMClient` tính `cost_usd`.

## Tasks

- [ ] **TASK-6.2.1** — Hỏi người dùng các điểm chưa rõ trước khi code; ghi mục D mới vào `docs/CONTEXT.md` nếu ra quyết định (AC: 3, 4, 5, 6)
  - [ ] Subtask 6.2.1.1 — Lấy `campaign_id` của một lượt gọi từ đâu (xem Dev notes › Architecture constraints).
  - [ ] Subtask 6.2.1.2 — Web gọi endpoint của `ai-api` qua đường nào và xác thực JWT ở đâu.
  - [ ] Subtask 6.2.1.3 — Cảnh báo vượt ngưỡng chỉ hiện trên màn + log, hay gửi thêm thông báo/email cho Quản trị.
- [ ] **TASK-6.2.2** — Hàm tổng hợp thuần trong AI Service (AC: 1, 2, 3, 4, 5)
  - [ ] Subtask 6.2.2.1 — `ai-service/app/llm/usage_stats.py`: nhận các dòng `ai.llm_calls` (hoặc kết quả `GROUP BY`), trả số liệu theo nhóm, công thức cache hit/refusal ở AC-2, phát hiện ngày vượt ngưỡng.
  - [ ] Subtask 6.2.2.2 — Truy vấn SQL `GROUP BY` trên `ai.llm_calls`, dùng index `(agent, created_at)` có sẵn ở ARCH; đếm số SV theo đợt qua view đã che PII (VD `core.v_ai_cv_profile_masked`).
- [ ] **TASK-6.2.3** — Schema dùng chung và endpoint thống kê (AC: 1, 6)
  - [ ] Subtask 6.2.3.1 — `packages/shared/schemas/`: Zod schema `LlmUsageStats` (response), xuất JSON Schema rồi sinh Pydantic theo AD-6; không viết tay ở phía Python.
  - [ ] Subtask 6.2.3.2 — Router FastAPI của `ai-api` (đề xuất `ai-service/app/api/admin_usage.py`): `GET` thống kê, chỉ vai trò `ADMIN`, theo cách xác thực đã chốt ở Subtask 6.2.1.2.
- [ ] **TASK-6.2.4** — Ngưỡng chi phí ngày là biến môi trường (AC: 5)
  - [ ] Subtask 6.2.4.1 — Biến đề xuất `LLM_DAILY_COST_ALERT_USD` cho `ai-api`; thêm vào `docs/SETUP.md`, `DEPLOY.md`, `.env.example` trong cùng commit (RULE-11).
- [ ] **TASK-6.2.5** — Đọc `DESIGN.md` trước khi code giao diện, ghi `Design applied: …` vào Implementation notes (AC: 7)
- [ ] **TASK-6.2.6** — Màn chi phí LLM của Quản trị (AC: 7)
  - [ ] Subtask 6.2.6.1 — Thư mục màn hình theo cách US-1.3 tổ chức cổng của vai trò `ADMIN` (đề xuất `apps/web/src/features/admin/llm-costs/`); biểu đồ theo ngày bằng shadcn Chart, bảng bằng TanStack Table.
- [ ] **TASK-6.2.7** — Test bằng dữ liệu cố định, không gọi API thật (AC: 1, 2, 3, 4, 5, 6, 8)
  - [ ] Subtask 6.2.7.1 — `ai-service/tests/llm/test_usage_stats.py`: các dòng `ai.llm_calls` mẫu với tổng đã tính tay.
  - [ ] Subtask 6.2.7.2 — `ai-service/tests/api/test_admin_usage.py`: phân quyền `401`/`403`.

## Dev notes

### Architecture constraints

- [AD-10](../../ARCHITECTURE.md#architecture-decisions): mọi lượt gọi đi qua `LLMClient`, nên `ai.llm_calls` là nguồn đầy đủ. Story chỉ đọc bảng này, không gọi LLM.
- [AD-12](../../ARCHITECTURE.md#architecture-decisions): Batches và prompt caching là hai biện pháp chính; tỷ lệ cache hit và chi phí theo agent là cách kiểm chứng chúng.
- [AD-4](../../ARCHITECTURE.md#architecture-decisions): AI Service sở hữu schema `ai`, đọc `core` chỉ qua view đã che PII. Đếm số sinh viên của đợt phải đi qua view, không đọc bảng `cvs`.
- `cost_usd` do `LLMClient` tính lúc gọi (US-2.2). Story này chỉ cộng lại, không tính lại theo bảng giá, nên đổi giá sau này không làm thay đổi chi phí đã ghi.
- Loại Prometheus/Grafana và prom-client cho màn này (EPIC-6 › Out of scope; ARCH ghi là tùy chọn).
- **Điểm cần hỏi — chi phí theo đợt.** `ai.llm_calls` và `ai.jobs` trong ARCH › *Các bảng chính* không có cột `campaign_id`. Payload của `ai.match.run` có `campaign_id`, các hàng đợi khác chỉ có `cv_id`, `jd_id`, `bank_id`, `exam_session_id`. Đề xuất: thêm cột `campaign_id` (nullable) vào `ai.jobs`, do AI Service điền khi nhận job (lấy từ payload hoặc từ view che PII), và nhóm theo đợt bằng cách nối `ai.llm_calls.job_id` với `ai.jobs`. Việc này đổi lược đồ của US-2.1, nên hỏi trước khi làm.
- **Điểm cần hỏi — đường gọi và xác thực.** ARCH › *Các kênh* chỉ có Frontend → Backend (REST + JWT) và Backend ↔ AI Service (RabbitMQ). Chưa có đường nào từ web tới `ai-api`, và JWT do module `iam` của Core Backend cấp. Hỏi trước TASK-6.2.3.
- **Điểm cần hỏi — kênh cảnh báo.** ARCH nêu cảnh báo "chi phí vượt ngưỡng ngày" nhưng không nói gửi qua đâu. AI Service không được ghi `core.notifications`. Tạm làm: cảnh báo trên màn + log WARN.
- ARCH › *Giám sát* còn liệt kê "tỷ lệ lỗi schema", nhưng `ai.llm_calls` không có cột cho việc này. Story không làm chỉ số đó; ghi vào câu hỏi ở TASK-6.2.1 nếu người dùng cần.
- Chạm Q8: số tiền dựa trên đơn giá Claude API. Nếu Q8 chốt dùng mô hình tự host, `cost_usd` mất ý nghĩa và màn chỉ còn token. Tạm dùng Đề xuất (thiết kế lớp trừu tượng, hiện dùng Claude API); hỏi trước khi chốt.
- Ngày tính theo giờ Việt Nam (đề xuất); `created_at` lưu UTC.
- Story này không thêm AD mới.

### Cross-story dependencies

- Builds on [US-2.2](US-2.2-llm-client-versioned-prompts.md) — `LLMClient` ghi `ai.llm_calls` (`agent`, `prompt_version`, `model`, `effort`, các cột token, `cost_usd`, `latency_ms`, `stop_reason`).
- Builds on [US-2.1](US-2.1-ai-job-pipeline-message-contracts.md) — `ai.jobs`, view `core.v_ai_*`, cách sinh Pydantic từ Zod.
- Builds on [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md) — vai trò `ADMIN`, JWT, `DESIGN.md`.
- Required by [US-6.5](US-6.5-campaign-close-report-export.md) — báo cáo đóng đợt ghi chi phí LLM trên mỗi sinh viên.
- Required by [US-6.6](US-6.6-demo-data-e2e-load-test.md) — đo chi phí thật của đợt demo, so với ước tính ~60 USD ở ARCH.
- Sibling [US-2.6](US-2.6-student-profile-confirmation.md) — cùng T6, làn A; không sửa chung file.

### Performance budget

- Chi phí LLM mỗi sinh viên: đo bằng `usage` thực tế, so với ước tính ~0,9 USD/SV (EPIC-6 › Performance budgets; BRIEF › Success Criteria). Đây là số để báo cáo, không phải ngưỡng chặn.
- Cảnh báo khi Σ `cost_usd` trong ngày vượt `LLM_DAILY_COST_ALERT_USD`. Kiểm chứng bằng `ai-service/tests/llm/test_usage_stats.py` › `NFR-11 day over threshold raises alert`.
- Giới hạn chi tiêu cứng đặt trên trang quản lý Claude API (ARCH › *Ước tính chi phí (thô)*), ghi cách làm vào `docs/SETUP.md`.

### What we explicitly did NOT do

- Không dùng Prometheus/Grafana. Mở lại nếu hệ thống chạy thật nhiều instance và cần cảnh báo tập trung.
- Không tính chi phí theo từng sinh viên hay từng JD. Chỉ theo agent, đợt, ngày như FR-37.
- Không tự dừng gọi LLM khi vượt ngưỡng. Cảnh báo chỉ để con người xử lý.

### References

- [Source: PRD › Functional Requirements (FR-37)](../../PRD.md#functional-requirements)
- [Source: PRD › Non-Functional Requirements (NFR-11)](../../PRD.md#non-functional-requirements)
- [Source: PRD › Success Criteria (Chỉ số đánh giá hệ thống), Personas](../../PRD.md#success-criteria)
- [Source: BRIEF › Success Criteria](../../BRIEF.md#success-criteria)
- [Source: ARCHITECTURE › LLM usage and cost (Tối ưu chi phí, Ước tính chi phí)](../../ARCHITECTURE.md#llm-usage-and-cost)
- [Source: ARCHITECTURE › Data architecture (`ai.llm_calls`, `ai.jobs`)](../../ARCHITECTURE.md#data-architecture)
- [Source: ARCHITECTURE › Deployment architecture (Giám sát)](../../ARCHITECTURE.md#deployment-architecture)
- [Source: CONTEXT D10, D12, D20](../../CONTEXT.md)
- [Source: EPIC-6](../epics/EPIC-6.md)

## Verification commands

Lệnh chạy cụ thể sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `ai-service/tests/llm/test_usage_stats.py` › `test_nfr11_group_totals_equal_sum_of_rows` (chạy cho `agent`, `campaign`, `day`) |
| AC-2 | `ai-service/tests/llm/test_usage_stats.py` › `test_nfr11_cache_hit_and_refusal_rates_null_on_empty` |
| AC-3 | `ai-service/tests/llm/test_usage_stats.py` › `test_nfr11_cost_per_student_by_campaign` |
| AC-4 | `ai-service/tests/llm/test_usage_stats.py` › `test_nfr11_calls_without_campaign_excluded_from_cost_per_student` |
| AC-5 | `ai-service/tests/llm/test_usage_stats.py` › `test_nfr11_day_over_threshold_raises_alert`; `test_nfr11_no_threshold_no_alert` |
| AC-6 | `ai-service/tests/api/test_admin_usage.py` › `test_nfr1_usage_stats_forbidden_for_center_hr_student`; `test_nfr1_usage_stats_requires_token` |
| AC-7 | Review giao diện theo `DESIGN.md` và skill shadcn; chụp màn hình trạng thái rỗng, có dữ liệu, có cảnh báo đính kèm PR |
| AC-8 | `git diff --stat main -- deploy/docker-compose.yml` không có dòng nào; review PR xác nhận không đổi hàm tính `cost_usd` của `LLMClient` |

## Changelog entry

### Added
- Màn chi phí LLM cho Quản trị (FR-37): token, chi phí theo agent, theo đợt, theo ngày; tỷ lệ cache hit, tỷ lệ refusal; chi phí trên mỗi sinh viên so với ước tính 0,9 USD/SV.
- Endpoint thống kê chi phí của `ai-api`, đọc từ `ai.llm_calls`; cảnh báo khi chi phí ngày vượt `LLM_DAILY_COST_ALERT_USD`.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-37, NFR-11](../../PRD.md#functional-requirements)
- [Epic EPIC-6](../epics/EPIC-6.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D10, D12](../../CONTEXT.md)
- [US-2.2 — LLMClient và prompt có phiên bản](US-2.2-llm-client-versioned-prompts.md)
