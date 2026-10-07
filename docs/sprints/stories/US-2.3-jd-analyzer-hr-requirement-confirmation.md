---
id: US-2.3
title: "JD Analyzer và HR xác nhận yêu cầu"
epic: EPIC-2
status: backlog
priority: P0
points: 8
sprint:
version_shipped:
prd_ref: [FR-9, FR-10]
depends_on: [US-1.5, US-2.2]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

HR đăng JD xong thì nhận được yêu cầu chuẩn hóa do AI đề xuất: kỹ năng bắt buộc và bổ trợ có mức độ và trọng số, điều kiện cứng, nhóm vị trí. HR sửa trực tiếp và xác nhận; AI chỉ đề xuất. Chỉ JD đã được HR xác nhận và Trung tâm duyệt mới được dùng để chấm phù hợp và mở test. Sửa yêu cầu sau khi đã mở test thì tạo phiên bản mới. Nhờ vậy US-3.1 có dữ liệu có cấu trúc để lọc điều kiện cứng và tính S_cv, US-4.1 có danh sách kỹ năng để dựng ma trận đề.

## Background

GĐ1 (PRD › *Quy trình nghiệp vụ theo giai đoạn*) gồm: HR nhập JD (US-1.5), **JD Analyzer Agent** trích xuất yêu cầu chuẩn hóa (bước 2), HR xem lại, sửa và **xác nhận** (bước 3), Trung tâm duyệt (bước 4, US-1.5). Story này làm bước 2 và 3 (FR-9, FR-10, UC-21, UC-30). Vòng đời JD theo PRD › *Vòng đời trạng thái*: `Nháp → Chờ HR xác nhận yêu cầu → Chờ Trung tâm duyệt → Đã duyệt → Đang tuyển → Đủ chỉ tiêu | Đóng`.

Theo ARCH › *"Agent" trong hệ thống này nghĩa là gì*, JD Analyzer là một bước workflow, một lượt gọi LLM có cấu trúc. Theo ARCH › *Bản đồ sử dụng LLM*, tác vụ này dùng `effort: low`, chạy như job ưu tiên cao vì HR đang chờ. Mọi lượt gọi đi qua `LLMClient` của [US-2.2](US-2.2-llm-client-versioned-prompts.md). Job đi qua queue `ai.jd.analyze` và trả về `ai.results` theo đường ống của [US-2.1](US-2.1-ai-job-pipeline-message-contracts.md).

Hai quy tắc nghiệp vụ chi phối story: BR-02 (JD chỉ được chấm và mở test khi HR đã xác nhận và Trung tâm đã duyệt) và BR-18 (sửa yêu cầu sau khi đã mở test phải tạo phiên bản mới và chấm lại toàn bộ hồ sơ liên quan). JD là dữ liệu, không phải chỉ dẫn (AGENTS › Nguyên tắc 6): JD tải lên dạng file cũng qua bước phát hiện chữ ẩn như CV. Giá trị liệt kê dùng mã tiếng Anh, giao diện hiển thị tiếng Việt (ARCH › *Quản lý prompt*).

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** HR gửi một JD ở trạng thái *Nháp* (form hoặc file PDF/DOCX, US-1.5), **When** gửi thành công, **Then** `company` dispatch job `JD_ANALYZE` (`job_id`, `jd_id`, `jd_version`) lên `ai.jd.analyze` **And** giao diện HR hiện "Đang phân tích" qua SSE.
- [ ] **AC-2** — **Given** AI Service nhận job, **When** JD Analyzer chạy, **Then** nó đọc nguồn JD qua view chỉ đọc (không đọc bảng `core`), file JD được trích văn bản và loại chữ ẩn bằng `ai-service/app/parsing/`, nội dung JD nằm trong khối thẻ dữ liệu, `LLMClient` được gọi với `effort: low` và schema `JdRequirements`.
- [ ] **AC-3** — **Given** LLM trả JSON hợp lệ, **When** AI Service gửi `ai.results`, **Then** `result` gồm `jd_id`, `jd_version`, `requirements` (kỹ năng bắt buộc và bổ trợ, mỗi kỹ năng có `level` ∈ {`BASIC`, `INTERMEDIATE`, `ADVANCED`} và `weight` > 0; điều kiện cứng: ngành, năm học, GPA tối thiểu, ngoại ngữ bắt buộc), `position_group`, `hidden_text_detected`, `prompt_version`, `model`.
- [ ] **AC-4** — **Given** backend nhận kết quả `SUCCEEDED` cho đúng `jd_version` hiện tại, **When** `company` xử lý, **Then** lưu `job_descriptions.requirements` và `position_group`, chuyển JD *Nháp* → *Chờ HR xác nhận yêu cầu* bằng `transitionTo` với actor hệ thống, ghi `audit_logs` trong cùng giao dịch **And** gửi thông báo "Yêu cầu chuẩn hóa JD sẵn sàng để xác nhận" cho HR (US-1.7).
- [ ] **AC-5** — **Given** kết quả của một `jd_version` cũ hoặc kết quả trùng, **When** backend nhận, **Then** không ghi đè dữ liệu, không chuyển trạng thái, không ghi audit.
- [ ] **AC-6** — **Given** kết quả `FAILED` (LLM từ chối, sai schema sau 2 lần thử, hoặc job vào DLQ), **When** backend xử lý, **Then** JD giữ trạng thái *Nháp*, HR nhận thông báo lỗi **And** màn xác nhận cho HR nhập yêu cầu bằng tay rồi xác nhận như bình thường.
- [ ] **AC-7** — **Given** HR của công ty sở hữu JD ở trạng thái *Chờ HR xác nhận yêu cầu*, **When** mở màn xác nhận, **Then** thấy nội dung JD gốc cạnh bảng yêu cầu; sửa trực tiếp được kỹ năng, mức độ (hiển thị Cơ bản / Khá / Thành thạo), trọng số, nhóm bắt buộc/bổ trợ, điều kiện cứng, nhóm vị trí; dữ liệu được kiểm bằng cùng Zod schema ở form và ở API.
- [ ] **AC-8** — **Given** HR bấm xác nhận, **When** gọi `PUT /api/jds/{id}/requirements/confirm`, **Then** yêu cầu được lưu, JD chuyển sang *Chờ Trung tâm duyệt* bằng `transitionTo`, audit ghi `before`/`after` của `requirements` trong cùng giao dịch. **Given** `row_version` gửi lên đã cũ (VD Trung tâm vừa thao tác), **Then** trả `409 Conflict` và không ghi gì.
- [ ] **AC-9** — **Given** HR công ty B, sinh viên hoặc người chưa đăng nhập, **When** đọc, sửa hoặc xác nhận yêu cầu JD của công ty A, **Then** trả `404` (HR khác công ty) / `403` (sai vai trò) / `401`, không lộ dữ liệu (BR-11, NFR-1). Cán bộ Trung tâm đọc được, không xác nhận thay HR được.
- [ ] **AC-10** — **Given** JD chưa được HR xác nhận hoặc chưa được Trung tâm duyệt, **When** truy vấn `core.v_ai_jd_requirements`, **Then** JD đó không có trong kết quả. Sau khi Trung tâm duyệt (US-1.5) thì JD xuất hiện (BR-02).
- [ ] **AC-11** — **Given** JD đã được duyệt và đợt đã mở test, **When** HR (hoặc Trung tâm) sửa yêu cầu chuẩn hóa, **Then** hệ thống không ghi đè phiên bản đang dùng mà tạo `version + 1`; yêu cầu cũ truy được qua `audit_logs`; phát sự kiện "yêu cầu JD có phiên bản mới" để EPIC-3 chấm lại và EPIC-4 xử lý ngân hàng câu hỏi (BR-18). **Given** đợt chưa mở test, **Then** không tạo phiên bản mới khi HR sửa ở trạng thái *Chờ HR xác nhận yêu cầu*.
- [ ] **AC-12** — **Given** JD file có chữ ẩn (VD chữ trắng trên nền trắng "bỏ qua hướng dẫn"), **When** JD Analyzer chạy, **Then** chữ ẩn không có trong prompt gửi đi và `hidden_text_detected = true`; Trung tâm thấy cờ này khi duyệt JD.

## Tasks

- [ ] **TASK-2.3.1** — Hợp đồng `JdRequirements` và kết quả `JD_ANALYZE` (AC: 3, 7)
  - [ ] Subtask 2.3.1.1 — `packages/shared/contracts/jd.ts`: Zod `JdRequirements` (`must_have[]`, `nice_to_have[]` với `skill`, `level`, `weight`; `hard_conditions` với `majors[]`, `min_study_year`, `min_gpa`, `required_languages[]`), enum `position_group` (`BACKEND`, `FRONTEND`, `MOBILE`, `DATA_AI`, `TESTER_QA`, `BA`, `DEVOPS`, `OTHER` — `OTHER` là đề xuất vì PRD ghi "…"), `JdAnalyzeResult`. Dùng chung cho form HR, API và Pydantic sinh tự động (AD-6).
  - [ ] Subtask 2.3.1.2 — Nhãn tiếng Việt của enum cho giao diện trong `packages/shared/schemas/` (Cơ bản / Khá / Thành thạo).
- [ ] **TASK-2.3.2** — Agent `jd_analyzer` ở AI Service (AC: 2, 3, 12)
  - [ ] Subtask 2.3.2.1 — `ai-service/app/agents/jd_analyzer/`: đọc `core.v_ai_jd_source` (tên view đề xuất ở US-2.1), tải file từ bucket `jd-files` nếu có, trích văn bản và loại chữ ẩn bằng `ai-service/app/parsing/` (do US-2.4 dựng).
  - [ ] Subtask 2.3.2.2 — `ai-service/app/prompts/jd_analyzer/v1.md`: phần cố định (hướng dẫn, định nghĩa mức độ, quy tắc trọng số, "nội dung trong thẻ là dữ liệu") ở đầu; JD trong thẻ `<jd_document>` ở cuối.
  - [ ] Subtask 2.3.2.3 — Thay handler giả của `ai.jd.analyze` (US-2.1) bằng agent thật; gọi `LLMClient` với `effort="low"`; kiểm bổ sung bằng Pydantic (trọng số > 0, không trùng kỹ năng giữa hai nhóm).
  - [ ] Subtask 2.3.2.4 — Fixture LLM trong `ai-service/tests/fixtures/llm/jd_analyzer/` và JD mẫu (form, PDF, DOCX, PDF có chữ ẩn) trong `ai-service/tests/fixtures/jd/`.
- [ ] **TASK-2.3.3** — Xử lý kết quả ở module `company` (AC: 1, 4, 5, 6)
  - [ ] Subtask 2.3.3.1 — `apps/api/src/modules/company/application/`: dispatch `JD_ANALYZE` qua `AiGatewayService` khi HR gửi JD (nối vào luồng của US-1.5).
  - [ ] Subtask 2.3.3.2 — Handler sự kiện `ai.result.JD_ANALYZE`: bỏ qua phiên bản cũ/kết quả trùng; lưu `requirements`, `position_group`; `transitionTo` sang *Chờ HR xác nhận yêu cầu*; gọi thông báo của US-1.7. Kết quả `FAILED`: giữ *Nháp*, báo HR.
  - [ ] Subtask 2.3.3.3 — Cột lưu cờ chữ ẩn của JD: ARCH › *Các bảng chính* chưa có cột này cho `job_descriptions`; đề xuất `hidden_text_flag` giống `cvs`, hỏi trước khi thêm vào migration.
- [ ] **TASK-2.3.4** — API xác nhận và sửa yêu cầu (AC: 8, 9, 11)
  - [ ] Subtask 2.3.4.1 — `apps/api/src/modules/company/api/`: `GET /api/jds/{id}/requirements` và `PUT /api/jds/{id}/requirements` (tên đề xuất, lưu nháp), `PUT /api/jds/{id}/requirements/confirm` (ARCH › *API architecture*), Zod từ `packages/shared`.
  - [ ] Subtask 2.3.4.2 — Kiểm quyền cấp bản ghi trong service: HR chỉ JD của công ty mình; Trung tâm chỉ đọc.
  - [ ] Subtask 2.3.4.3 — `apps/api/src/modules/company/domain/requirements-versioning.ts`: hàm thuần quyết định "sửa tại chỗ" hay "tạo phiên bản mới" theo trạng thái JD và trạng thái đợt; phát sự kiện "yêu cầu JD có phiên bản mới" (tên sự kiện đề xuất `jd.requirements.versioned`).
- [ ] **TASK-2.3.5** — Màn HR xác nhận yêu cầu chuẩn hóa (AC: 6, 7, 8)
  - [ ] Subtask 2.3.5.1 — Đọc `DESIGN.md` trước khi code; ghi `Design applied: …` vào story.
  - [ ] Subtask 2.3.5.2 — `apps/web/src/features/hr/jd-requirements/`: JD gốc bên trái, bảng kỹ năng sửa trực tiếp bên phải (shadcn/ui + TanStack Table, React Hook Form + Zod); khối điều kiện cứng; chọn nhóm vị trí.
  - [ ] Subtask 2.3.5.3 — Đủ các trạng thái giao diện: đang phân tích (SSE), lỗi phân tích (nhập tay), đã có đề xuất, đã xác nhận (chỉ đọc), xung đột `409` (tải lại và báo).
- [ ] **TASK-2.3.6** — Test (AC: 1–12)
  - [ ] Subtask 2.3.6.1 — `ai-service/tests/agents/test_jd_analyzer.py` (fixture, không gọi API thật).
  - [ ] Subtask 2.3.6.2 — `apps/api/src/modules/company/domain/requirements-versioning.spec.ts` (unit).
  - [ ] Subtask 2.3.6.3 — `apps/api/test/company/jd-requirements.int-spec.ts` (Supertest + testcontainers: luồng kết quả, xác nhận, IDOR, 409, view BR-02).

## Dev notes

### Architecture constraints

- AD-1 ([D1](../../CONTEXT.md)): JD Analyzer chỉ trả dữ liệu; chuyển trạng thái JD do module `company` làm qua `transitionTo`. AI Service không ghi `job_descriptions`.
- AD-2 ([D2](../../CONTEXT.md)): JD Analyzer chỉ đề xuất trọng số; S_cv do code tính ở US-3.1 theo yêu cầu HR đã xác nhận.
- AD-6 ([D6](../../CONTEXT.md)): `JdRequirements` là Zod trong `packages/shared/contracts`, dùng chung cho form, API và schema đầu ra của LLM. Không viết schema riêng cho phía Python.
- AD-8: mọi chuyển trạng thái JD qua `transitionTo` + `row_version`; audit trong cùng giao dịch (US-1.2).
- AD-10, AD-12: gọi qua `LLMClient`, `effort: low`, prompt `jd_analyzer/v1`; kết quả lưu kèm `model`, `prompt_version`.
- Ranh giới module: `company` sở hữu `job_descriptions`; không module nào khác ghi `requirements`. Matching và assessment đọc qua service đã export hoặc qua view.
- Story này không thêm AD mới.
- Trạng thái JD dùng đúng enum trong `packages/shared/states` do US-1.2/US-1.5 định nghĩa. PRD không có trạng thái "đang phân tích"; EPIC-1 ghi JD "giữ trạng thái chờ phân tích". Story tạm giữ JD ở *Nháp* trong lúc phân tích và hiển thị tiến độ qua SSE (đã nêu là điểm mơ hồ).
- BR-18, "đã mở test": spec chưa định nghĩa bằng dữ liệu. Tạm dùng "đợt đã sang trạng thái *Làm test* (US-1.4)". Hỏi trước khi chốt.
- BR-18, phiên bản mới có cần Trung tâm duyệt lại không: spec không nói. Tạm đọc theo BR-02: phiên bản mới chỉ được chấm khi đã được xác nhận và duyệt. Hỏi trước khi chốt.

### Cross-story dependencies

- Builds on [US-1.5](US-1.5-company-hr-accounts-jd-posting-approval.md) — luồng HR đăng JD, bảng `job_descriptions` (`requirements`, `version`, `row_version`, `file_key`), bucket `jd-files`, bước Trung tâm duyệt.
- Builds on [US-2.2](US-2.2-llm-client-versioned-prompts.md) — `LLMClient`, registry prompt, chế độ fixture.
- Builds on [US-2.1](US-2.1-ai-job-pipeline-message-contracts.md) — queue `ai.jd.analyze`, `AiGatewayService.dispatch()`, sự kiện `ai.result.*`, view `core.v_ai_jd_requirements`.
- Builds on [US-1.7](US-1.7-notifications-sse-email-reminders.md) — thông báo cho HR và SSE tiến độ.
- Sibling [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md) — cùng tuần T5, làn khác. US-2.4 sở hữu `ai-service/app/parsing/` (trích văn bản, phát hiện chữ ẩn); story này dùng lại. Merge US-2.4 phần `parsing/` trước, hoặc US-2.3 làm luồng JD nhập bằng form trước rồi nối phần file sau.
- Sibling [US-3.1](US-3.1-hard-filters-and-scv-formula.md) — cùng tuần T5; hàm lọc điều kiện cứng đọc cấu trúc `hard_conditions` định nghĩa ở đây. Merge `packages/shared/contracts/jd.ts` trước.
- Required by [US-3.1](US-3.1-hard-filters-and-scv-formula.md), [US-3.2](US-3.2-batch-matching-agent.md) — đọc `requirements` đã xác nhận; chấm lại khi có phiên bản mới.
- Required by [US-4.1](US-4.1-exam-blueprint-test-generator.md) — dựng ma trận đề từ kỹ năng của JD.
- Required by [US-2.5](US-2.5-embeddings-skill-catalog.md) — chuẩn hóa tên kỹ năng trong `requirements` theo danh mục.
- Required by [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md) — đo P/R/F1 của JD Analyzer trên tập gán nhãn.

### Performance budget

- Epic không đặt ngân sách cho phân tích JD. ARCH xếp đây là job ưu tiên cao vì HR chờ kết quả. Độ trễ thực đo bằng `ai.llm_calls.latency_ms`.

### What we explicitly did NOT do

- Không chuẩn hóa tên kỹ năng theo danh mục — làm ở US-2.5 (cần bge-m3).
- Không chấm lại hồ sơ khi có phiên bản mới — story chỉ phát sự kiện; chấm lại ở US-3.2, xử lý ngân hàng câu hỏi ở EPIC-4.
- Không có bảng lịch sử phiên bản yêu cầu riêng. ARCH › *Các bảng chính* chỉ có cột `version`; yêu cầu cũ truy qua `before`/`after` của `audit_logs`. Trigger để làm lại: cần hiển thị so sánh hai phiên bản cho HR.
- Không cho HR yêu cầu chạy lại phân tích AI. Nếu kết quả kém, HR sửa tay.

### References

- [Source: PRD › GĐ1 – Doanh nghiệp đăng JD](../../PRD.md)
- [Source: PRD › Vòng đời trạng thái › JD](../../PRD.md)
- [Source: PRD › Quy tắc nghiệp vụ (BR-02, BR-11, BR-18)](../../PRD.md)
- [Source: PRD › Functional Requirements (FR-9, FR-10)](../../PRD.md#functional-requirements)
- [Source: PRD › Thông báo](../../PRD.md)
- [Source: ARCHITECTURE › AI Service và các AI Agent; Quản lý prompt](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Bản đồ sử dụng LLM theo giai đoạn (GĐ1)](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Các bảng chính (`job_descriptions`); API architecture](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Quản lý trạng thái](../../ARCHITECTURE.md)
- [Source: CONTEXT D1, D2, D6, D10, D12](../../CONTEXT.md)
- [Source: Epic EPIC-2](../epics/EPIC-2.md)

## Verification commands

> Lệnh chạy cụ thể (`pnpm …`, `pytest …`) sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `apps/api/test/company/jd-requirements.int-spec.ts` › "GĐ1 gửi JD dispatch job JD_ANALYZE" |
| AC-2 | `ai-service/tests/agents/test_jd_analyzer.py::test_gd1_reads_view_wraps_jd_effort_low` |
| AC-3 | `ai-service/tests/agents/test_jd_analyzer.py::test_gd1_result_matches_jd_requirements_schema` |
| AC-4 | `apps/api/test/company/jd-requirements.int-spec.ts` › "GĐ1 kết quả AI chuyển JD sang Chờ HR xác nhận, có audit và thông báo" |
| AC-5 | `apps/api/test/company/jd-requirements.int-spec.ts` › "GĐ1 bỏ qua kết quả trùng hoặc của phiên bản cũ" |
| AC-6 | `apps/api/test/company/jd-requirements.int-spec.ts` › "GĐ1 phân tích lỗi giữ Nháp, HR nhập tay được" |
| AC-7 | `apps/web/src/features/hr/jd-requirements/__tests__/requirements-form.test.tsx` › "sửa kỹ năng, mức độ, trọng số, điều kiện cứng" |
| AC-8 | `apps/api/test/company/jd-requirements.int-spec.ts` › "BR-02 HR xác nhận chuyển Chờ Trung tâm duyệt, audit cùng giao dịch"; "409 khi row_version cũ" |
| AC-9 | `apps/api/test/company/jd-requirements.int-spec.ts` › "BR-11 HR công ty khác nhận 404, sinh viên nhận 403" |
| AC-10 | `apps/api/test/company/jd-requirements.int-spec.ts` › "BR-02 JD chưa xác nhận hoặc chưa duyệt không có trong v_ai_jd_requirements" |
| AC-11 | `apps/api/src/modules/company/domain/requirements-versioning.spec.ts` › "BR-18 sửa sau khi mở test tạo phiên bản mới"; "BR-18 sửa trước khi mở test không tăng phiên bản" |
| AC-12 | `ai-service/tests/agents/test_jd_analyzer.py::test_hidden_text_removed_from_prompt_and_flagged` |

## Changelog entry

### Added
- JD Analyzer: AI đề xuất yêu cầu chuẩn hóa cho JD (kỹ năng bắt buộc/bổ trợ có mức độ và trọng số, điều kiện cứng, nhóm vị trí) qua job `ai.jd.analyze`, `effort: low`, prompt `jd_analyzer/v1`.
- Màn HR xem JD gốc cạnh bảng yêu cầu, sửa trực tiếp và xác nhận; JD chuyển sang chờ Trung tâm duyệt.
- Sửa yêu cầu JD sau khi đợt đã mở test tạo phiên bản mới và phát sự kiện để chấm lại (BR-18).

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-9, FR-10](../../PRD.md#functional-requirements)
- [Epic EPIC-2](../epics/EPIC-2.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D1, D2, D6](../../CONTEXT.md)
- [Story US-2.2](US-2.2-llm-client-versioned-prompts.md)
