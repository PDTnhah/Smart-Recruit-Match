---
id: US-6.5
title: "Xuất báo cáo đóng đợt"
epic: EPIC-6
status: backlog
priority: P1
points: 3
sprint:
version_shipped:
prd_ref: [FR-34]
depends_on: [US-5.5]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Khi đợt đã đóng, Cán bộ Trung tâm xuất được báo cáo Excel và PDF (UC-08) gồm kết quả cuối của đợt và các chỉ số đo được từ dữ liệu đợt. Trung tâm có tài liệu nộp nhà trường mà không phải tự tổng hợp; đồ án có số liệu "toàn hệ thống" của một đợt chạy trọn. Báo cáo là bản chốt: dữ liệu đợt đã khóa, xuất lại bao nhiêu lần cũng ra cùng số liệu.

## Background

FR-34 (P1) ứng với UC-08 và bước 5 của PRD GĐ10: "Đóng đợt: khóa dữ liệu, xuất báo cáo (các chỉ số ở mục *Chỉ số đánh giá hệ thống*)". Việc đóng đợt và khóa dữ liệu do [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) làm; story này chỉ đọc dữ liệu đã khóa. ARCH › *Các module* giao "xuất Excel/PDF" cho module `reporting`; ARCH › *Thư viện chính* chọn sẵn `exceljs` và `pdfmake`; ARCH › *Lưu trữ file và thời hạn dữ liệu* có bucket `reports` cho báo cáo xuất ra. Story làm ở T12 (W52), làn B, cùng tuần với [US-6.1](US-6.1-campaign-dashboard.md).

Từ PRD › *Chỉ số đánh giá hệ thống*, báo cáo chỉ lấy các chỉ số đo được từ dữ liệu của chính đợt: hàng *Phân bổ* (tỷ lệ lấp đầy, tỷ lệ SV có đề cử, tỷ lệ vào NV1 / top-3, độ lệch hồ sơ/chỉ tiêu giữa các JD, số cặp bất ổn định) và hàng *Toàn hệ thống* (thời gian xử lý đợt, chi phí LLM trên mỗi SV). Chỉ số chất lượng AI (P/R/F1, Spearman…) cần tập gán nhãn nên thuộc [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md); mức hài lòng lấy bằng khảo sát, ngoài hệ thống.

Phần duy nhất dùng LLM là đoạn tổng hợp lý do HR từ chối dạng văn bản (ARCH › *Bản đồ sử dụng LLM theo giai đoạn*, GĐ10: Claude, effort `low`, theo yêu cầu). Invariant của EPIC-6 giới hạn đúng như vậy: số đếm theo lý do do code tính, LLM chỉ viết đoạn tóm tắt. Lý do từ chối được lưu từ GĐ8 để đánh giá và hiệu chỉnh cho đợt sau (PRD › *Vòng phản hồi*).

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** đợt đã đóng, **When** Cán bộ Trung tâm yêu cầu xuất báo cáo định dạng `xlsx` hoặc `pdf`, **Then** file được tạo, lưu vào bucket `reports` với key theo đợt **And** `GET /api/campaigns/{id}/reports` liệt kê các báo cáo đã xuất (định dạng, người xuất, thời điểm) **And** tải file qua URL tạm có hạn 5 phút.
- [ ] **AC-2** — File Excel có các sheet: *Tổng quan* (tên đợt, mốc thời gian, tham số `N_NV`, θ_cv, θ_test, α, β, k, R_max, T_test, SLA_HR, T_offer, số vòng phân bổ, `model` và `prompt_version` đã dùng theo snapshot của các vòng — BR-17); *Chỉ số*; *Theo JD* (công ty, vị trí, chỉ tiêu, số NV, số đề cử, số mời phỏng vấn, số đạt, số đã nhận, tỷ lệ lấp đầy); *Theo sinh viên* (MSSV, họ tên, ngành, kết quả cuối "Đã có nơi thực tập" / "Chưa được phân bổ", JD đã nhận và thứ tự NV của JD đó); *Lý do từ chối* (số lượt theo `reason_code`, theo JD, và đoạn tổng hợp).
- [ ] **AC-3** — Sheet *Chỉ số* có: tỷ lệ lấp đầy = Σ đã nhận / Σ chỉ tiêu; tỷ lệ SV có đề cử = số SV có ít nhất một đề cử / số SV đã chọn NV; tỷ lệ vào NV1 và top-3 trên số SV đã nhận thực tập; độ lệch chuẩn giữa các JD của (số NV / chỉ tiêu) và của (số đề cử / chỉ tiêu); số cặp bất ổn định của kết quả đã công bố mỗi vòng (sau điều chỉnh tay), tính lại từ `input_snapshot` bằng hàm kiểm tra ổn định của US-5.1; thời gian xử lý đợt và từng giai đoạn theo thời điểm chuyển trạng thái của đợt; chi phí LLM trên mỗi SV **And** định nghĩa từng chỉ số in ngay cạnh số liệu. PRD không nêu mẫu số của các tỷ lệ này; mẫu số ở trên là đề xuất, chốt với người dùng khi bắt đầu story.
- [ ] **AC-4** — Số liệu chung với dashboard (tỷ lệ lấp đầy, số theo JD) được tính bằng chính các hàm trong `apps/api/src/modules/reporting/domain/` của US-6.1; với cùng một đợt, số trong file bằng số trên dashboard.
- [ ] **AC-5** — File PDF gồm *Tổng quan*, *Chỉ số*, *Theo JD* và *Lý do từ chối* (danh sách từng sinh viên chỉ có trong Excel — đề xuất) **And** chữ tiếng Việt có dấu hiển thị đúng (font nhúng hỗ trợ tiếng Việt), kiểm bằng một chuỗi mẫu có đủ dấu.
- [ ] **AC-6** — **Given** đợt chưa đóng, **When** yêu cầu xuất, **Then** nhận `409` và không có file nào được tạo **And** vai trò `HR`, `STUDENT`, `ADMIN` nhận `403`; không có token nhận `401`; đợt không tồn tại nhận `404`.
- [ ] **AC-7** — **Given** đợt đã đóng và dữ liệu không đổi, **When** xuất hai lần, **Then** mọi giá trị trong sheet *Chỉ số*, *Theo JD*, *Theo sinh viên* giống nhau; chỉ thời điểm xuất khác.
- [ ] **AC-8** — Số lượt từ chối theo `reason_code` do code đếm. Đoạn tổng hợp do LLM viết qua một job bất đồng bộ: payload chỉ chứa `job_id` và `campaign_id`; AI Service đọc lý do và ghi chú qua view đã che PII, không có mã hay tên sinh viên; mọi lượt gọi qua `LLMClient` với effort `low`, structured output theo schema; ghi chú của HR được đặt trong phần dữ liệu của prompt, không phải chỉ dẫn **And** kết quả lưu kèm `model` và `prompt_version`, hai giá trị này in trong báo cáo cạnh đoạn tổng hợp **And** schema đầu ra không có trường số đếm nào.
- [ ] **AC-9** — **Given** job tổng hợp chưa xong, lỗi, hoặc LLM trả `stop_reason == "refusal"`, **When** xuất báo cáo, **Then** báo cáo vẫn được tạo với đủ số đếm theo lý do, phần tổng hợp ghi "Chưa có bản tổng hợp tự động".
- [ ] **AC-10** — Test của story dùng fixture cho LLM, không gọi API thật.

## Tasks

- [ ] **TASK-6.5.1** — Hàm thuần tính số liệu báo cáo (AC: 2, 3, 4, 7)
  - [ ] Subtask 6.5.1.1 — `apps/api/src/modules/reporting/domain/close-report.ts`: dựng nội dung báo cáo từ số đếm do các module export; dùng lại `computeFillRates` và các hàm của US-6.1.
  - [ ] Subtask 6.5.1.2 — Số cặp bất ổn định: gọi hàm kiểm tra ổn định của `allocation/domain/` (US-5.1) qua service của module `allocation`, trên `input_snapshot` và đề cử đã công bố.
  - [ ] Subtask 6.5.1.3 — Số liệu theo sinh viên, theo JD, theo vòng, thời điểm chuyển trạng thái lấy qua service export của `student`, `matching`, `allocation`, `review`, `interview`, `campaign` (Nguyên tắc 13).
- [ ] **TASK-6.5.2** — Dựng file Excel và PDF (AC: 2, 5)
  - [ ] Subtask 6.5.2.1 — `apps/api/src/modules/reporting/infrastructure/excel-report.builder.ts` dùng `exceljs`.
  - [ ] Subtask 6.5.2.2 — `apps/api/src/modules/reporting/infrastructure/pdf-report.builder.ts` dùng `pdfmake`, nhúng font có đủ glyph tiếng Việt.
- [ ] **TASK-6.5.3** — Endpoint, lưu file, tải về (AC: 1, 6)
  - [ ] Subtask 6.5.3.1 — `apps/api/src/modules/reporting/api/reports.controller.ts`: đề xuất `POST /api/campaigns/:id/reports` (xuất) và `GET /api/campaigns/:id/reports` (liệt kê, có trong ARCH); `@Roles('CENTER')`; `409` khi đợt chưa đóng.
  - [ ] Subtask 6.5.3.2 — Ghi vào bucket `reports` (đề xuất key `campaigns/{campaignId}/report-{timestamp}.{xlsx|pdf}`), liệt kê theo prefix, không thêm bảng mới; tải qua URL tạm 5 phút như `GET /api/files/{id}/url`.
- [ ] **TASK-6.5.4** — Dùng skill `claude-api` trước khi viết code gọi LLM; làm job tổng hợp lý do từ chối (AC: 8, 10)
  - [ ] Subtask 6.5.4.1 — `packages/shared/contracts/`: Zod schema cho message của job (đề xuất hàng đợi `ai.report.summarize`) và kết quả; sinh JSON Schema và Pydantic theo AD-6. Merge trước các story khác đang sửa `packages/shared`.
  - [ ] Subtask 6.5.4.2 — View đề xuất `core.v_ai_hr_rejections`: `jd_id`, vị trí, `reason_code`, ghi chú; không có `student_id`, mã hay tên sinh viên.
  - [ ] Subtask 6.5.4.3 — Agent đề xuất `ai-service/app/agents/rejection_summary/`, prompt `ai-service/app/prompts/rejection_summary/v1.md`; consumer FastStream trong `ai-service/app/consumers/`; trả qua `ai.results`.
  - [ ] Subtask 6.5.4.4 — Fixture phản hồi LLM trong `ai-service/tests/fixtures/` (gồm một ca refusal).
- [ ] **TASK-6.5.5** — Phát job khi đợt đóng, nhận và lưu kết quả (AC: 8, 9)
  - [ ] Subtask 6.5.5.1 — Module `reporting` nghe sự kiện đóng đợt của US-5.5, phát job qua `aigateway` (idempotent theo `job_id`, AD-5).
  - [ ] Subtask 6.5.5.2 — Lưu kết quả (đoạn tổng hợp, `model`, `prompt_version`) thành file JSON trong bucket `reports` cạnh báo cáo; chưa có file thì báo cáo dùng câu "Chưa có bản tổng hợp tự động".
- [ ] **TASK-6.5.6** — Test (AC: 1–10)
  - [ ] Subtask 6.5.6.1 — `apps/api/src/modules/reporting/domain/close-report.spec.ts`, `apps/api/test/reporting/close-report.int-spec.ts` (testcontainers PostgreSQL + MinIO), `ai-service/tests/agents/test_rejection_summary.py`.

## Dev notes

### Architecture constraints

- ARCH › *Thư viện chính*: `exceljs` và `pdfmake` có sẵn trong danh sách, không cần hỏi thêm thư viện.
- ARCH › *Lưu trữ file và thời hạn dữ liệu*: bucket `reports`; tải qua URL tạm 5 phút.
- AGENTS › Nguyên tắc 1–2 và invariant của EPIC-6: mọi số liệu do code tính. LLM chỉ viết đoạn văn tổng hợp; schema đầu ra không có trường số để LLM không "đếm" thay code.
- [AD-4](../../ARCHITECTURE.md#architecture-decisions), [AD-5](../../ARCHITECTURE.md#architecture-decisions), [AD-6](../../ARCHITECTURE.md#architecture-decisions): AI Service đọc `core` qua view đã che PII, nhận job qua RabbitMQ với payload chỉ chứa ID, hợp đồng message viết một lần bằng Zod. Core Backend là bên lưu kết quả.
- [AD-10](../../ARCHITECTURE.md#architecture-decisions), [AD-12](../../ARCHITECTURE.md#architecture-decisions): gọi qua `LLMClient`, effort `low` theo ARCH, prompt có phiên bản; kiểm tra refusal trước khi đọc nội dung.
- AGENTS › Nguyên tắc 13: `reporting` không truy vấn bảng của module khác; lấy số qua service export (giống US-6.1).
- Tên hàng đợi `ai.report.summarize`, view `core.v_ai_hr_rejections`, agent `rejection_summary`, endpoint `POST /api/campaigns/{id}/reports` và key trong bucket đều là **đề xuất**; ARCH chưa định nghĩa. ARCH › API architecture chỉ có `GET /api/campaigns/{id}/reports`.
- **Điểm cần hỏi — PII trong ghi chú của HR.** Ghi chú là văn bản tự do, HR có thể gõ tên sinh viên. View chỉ bỏ được cột định danh, không lọc được chữ trong ghi chú. Đề xuất: view thay tên và MSSV của sinh viên được đề cử trong ghi chú bằng `[SV]` trước khi AI Service đọc (NFR-3). Hỏi trước khi làm Subtask 6.5.4.2.
- **Điểm cần hỏi — báo cáo chứa dữ liệu cá nhân.** Sheet *Theo sinh viên* có họ tên và MSSV. ARCH chỉ ghi bật mã hóa phía server cho `cv-files` và `jd-files`, và không nói báo cáo bị xóa theo thời hạn lưu trữ của NFR-2 hay không. Hỏi trước khi chốt cấu hình bucket.
- **Điểm cần hỏi — chi phí LLM trên mỗi SV.** Số này nằm ở `ai.llm_calls`, đọc qua endpoint của `ai-api` ([US-6.2](US-6.2-llm-cost-tracking.md)). Core Backend lấy số này qua đường nào phụ thuộc câu trả lời ở TASK-6.2.1. Chưa chốt thì ô này ghi "Chưa có số liệu".
- Không có chuyển trạng thái nghiệp vụ; xuất báo cáo chỉ đọc dữ liệu đã khóa.
- Story này không thêm AD mới.

### Cross-story dependencies

- Builds on [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) — trạng thái đã đóng của đợt, sự kiện đóng đợt, dữ liệu đã khóa.
- Builds on [US-6.1](US-6.1-campaign-dashboard.md) — các hàm trong `reporting/domain/` và các hàm đếm mà module nguồn đã export.
- Builds on [US-5.1](US-5.1-allocation-engine-property-tests.md), [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md) — hàm kiểm tra ổn định, `input_snapshot`, `config_snapshot`, đề cử đã công bố.
- Builds on [US-5.3](US-5.3-hr-nomination-review.md) — `hr_reviews.reason_code`, `note`.
- Builds on [US-2.1](US-2.1-ai-job-pipeline-message-contracts.md), [US-2.2](US-2.2-llm-client-versioned-prompts.md) — `aigateway`, `ai.results`, view `core.v_ai_*`, `LLMClient`, fixture.
- Builds on [US-1.6](US-1.6-data-consent-and-cv-upload.md) — cách lưu file lên MinIO và URL tạm 5 phút.
- Sibling [US-6.1](US-6.1-campaign-dashboard.md) — cùng module `reporting`, cùng T12; làm US-6.1 trước.
- Required by [US-6.6](US-6.6-demo-data-e2e-load-test.md) — đợt demo phải xuất được báo cáo khi đóng.

### What we explicitly did NOT do

- Không đưa chỉ số chất lượng AI (P/R/F1, Spearman, MAE…) vào báo cáo đợt. Các chỉ số này đo trên tập gán nhãn ở [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md).
- Không có biểu đồ trong file. Báo cáo dạng bảng; biểu đồ xem trên dashboard. Mở lại nếu Trung tâm cần biểu đồ trong bản in.
- Không gửi báo cáo qua email.

### References

- [Source: PRD › Functional Requirements (FR-34)](../../PRD.md#functional-requirements)
- [Source: PRD › Success Criteria (Chỉ số đánh giá hệ thống)](../../PRD.md#success-criteria)
- [Source: PRD › GĐ8, GĐ10; Use case theo tác nhân (UC-08); Vòng phản hồi](../../PRD.md)
- [Source: ARCHITECTURE › Component architecture (Các module, Thư viện chính)](../../ARCHITECTURE.md#component-architecture)
- [Source: ARCHITECTURE › LLM usage and cost (Bản đồ sử dụng LLM theo giai đoạn)](../../ARCHITECTURE.md#llm-usage-and-cost)
- [Source: ARCHITECTURE › Data architecture (Lưu trữ file và thời hạn dữ liệu)](../../ARCHITECTURE.md#data-architecture)
- [Source: CONTEXT D4, D5, D6, D12](../../CONTEXT.md)
- [Source: EPIC-6](../epics/EPIC-6.md)

## Verification commands

Lệnh chạy cụ thể sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `apps/api/test/reporting/close-report.int-spec.ts` › `GĐ10 export stores file in reports bucket and lists it` |
| AC-2 | `apps/api/test/reporting/close-report.int-spec.ts` › `GĐ10 xlsx has Tổng quan, Chỉ số, Theo JD, Theo sinh viên, Lý do từ chối sheets` |
| AC-3 | `apps/api/src/modules/reporting/domain/close-report.spec.ts` › `GĐ10 metrics follow PRD definitions`; `BR-10 manual adjustment can create blocking pairs and is counted` |
| AC-4 | `apps/api/test/reporting/close-report.int-spec.ts` › `report fill rates equal dashboard fill rates` |
| AC-5 | `apps/api/test/reporting/close-report.int-spec.ts` › `pdf renders Vietnamese diacritics sample` (trích văn bản từ PDF và so chuỗi mẫu) |
| AC-6 | `apps/api/test/reporting/close-report.int-spec.ts` › `GĐ10 export rejected with 409 before campaign is closed`; `NFR-1 export returns 403 for HR, STUDENT, ADMIN` |
| AC-7 | `apps/api/test/reporting/close-report.int-spec.ts` › `two exports of a closed campaign have identical values` |
| AC-8 | `ai-service/tests/agents/test_rejection_summary.py` › `test_br03_input_has_no_student_identity`; `test_output_schema_has_no_counts`; `test_result_has_model_and_prompt_version` |
| AC-9 | `apps/api/test/reporting/close-report.int-spec.ts` › `export works when summary is missing or refused` |
| AC-10 | `ai-service/tests/agents/test_rejection_summary.py` chạy với fixture; `rg -n "^\s*(import anthropic\|from anthropic)" ai-service/app/agents/rejection_summary` không trả dòng nào |

## Changelog entry

### Added
- Xuất báo cáo đóng đợt dạng Excel và PDF (FR-34): tổng quan và tham số đợt, chỉ số phân bổ theo PRD, số liệu theo JD và theo sinh viên, lý do HR từ chối; file lưu ở bucket `reports`, tải qua URL tạm.
- Job tổng hợp lý do từ chối bằng LLM (effort `low`), chỉ viết đoạn văn; số đếm theo lý do do code tính. Báo cáo vẫn xuất được khi chưa có bản tổng hợp.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-34](../../PRD.md#functional-requirements)
- [Epic EPIC-6](../epics/EPIC-6.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D4, D5, D6](../../CONTEXT.md)
- [US-6.1 — Dashboard đợt](US-6.1-campaign-dashboard.md)
- [US-5.5 — Vòng bổ sung và đóng đợt](US-5.5-supplementary-rounds-and-campaign-close.md)
