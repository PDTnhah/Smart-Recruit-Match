---
id: EPIC-2
title: "Phân tích CV và JD bằng AI"
status: backlog
prd_ref:
  - FR-9
  - FR-10
  - FR-11
  - FR-12
  - FR-13
arch_ref:
  - AD-1
  - AD-4
  - AD-5
  - AD-6
  - AD-10
  - AD-11
  - AD-12
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Sinh viên và HR xem, sửa và xác nhận được dữ liệu do AI trích xuất từ CV và JD. Epic này cũng dựng toàn bộ đường ống AI dùng chung: hợp đồng message, hàng đợi job, `LLMClient`, prompt có phiên bản, embedding. Nhờ vậy các agent ở EPIC-3 và EPIC-4 chỉ còn phải viết prompt, schema và logic riêng của mình.

## Overview

### Business context

Sau EPIC-1, JD và CV mới chỉ là file gốc trên MinIO. EPIC-2 biến chúng thành dữ liệu có cấu trúc: yêu cầu chuẩn hóa của JD (GĐ1, bước 2–3) và hồ sơ năng lực của CV (GĐ2, bước 3–4). Con người luôn xác nhận: HR xác nhận yêu cầu, SV xác nhận hồ sơ. Chỉ dữ liệu đã xác nhận mới được dùng để chấm (BR-01, BR-02).

Ranh giới kiến trúc mà epic này giữ (AD-1, AD-4): AI Service không chuyển trạng thái nghiệp vụ và chỉ ghi schema `ai`. Nó đọc `core` qua view đã che PII và trả kết quả qua `ai.results`; Core Backend là nơi lưu kết quả và chuyển trạng thái. Epic này **không** chấm điểm. Matching thuộc [EPIC-3](EPIC-3.md); sinh và chấm đề thuộc [EPIC-4](EPIC-4.md).

### Feature pillars

| # | Pillar | Stories | Purpose |
|---|---|---|---|
| 1 | **Đường ống job AI** | US-2.1 | Hợp đồng Zod → JSON Schema → Pydantic, `aigateway`, worker FastStream, idempotent theo `job_id`, DLQ, view che PII |
| 2 | **Lớp gọi LLM** | US-2.2 | `LLMClient`: effort, structured outputs, refusal, retry, ghi usage/chi phí, prompt có phiên bản, fixture |
| 3 | **Trích xuất JD** | US-2.3 | JD Analyzer + màn HR sửa và xác nhận yêu cầu chuẩn hóa, phiên bản yêu cầu |
| 4 | **Trích xuất CV** | US-2.4, US-2.6 | CV Parser có phát hiện chữ ẩn và tách PII; màn SV sửa và xác nhận hồ sơ |
| 5 | **Embedding và danh mục kỹ năng** | US-2.5 | bge-m3, `ai.embeddings`, chuẩn hóa tên kỹ năng, quản trị duyệt kỹ năng mới |

### Schedule and dependencies

| Story | Điểm | Tuần | Làn | Phụ thuộc |
|---|---|---|---|---|
| US-2.1 | 8 | T3 (W43) | B | US-1.2 |
| US-2.2 | 5 | T4 (W44) | B | US-2.1 |
| US-2.3 | 8 | T5 (W45) | A | US-1.5, US-2.2 |
| US-2.4 | 8 | T5 (W45) | B | US-1.6, US-2.2 |
| US-2.5 | 5 | T6 (W46) | B | US-2.1, US-2.4 |
| US-2.6 | 5 | T6 (W46) | A | US-2.4 |

### Out of scope

- **Chấm phù hợp CV–JD, shortlist** — thuộc [EPIC-3](EPIC-3.md). EPIC-2 chỉ tạo embedding để EPIC-3 lọc sơ bộ.
- **Sinh ngân hàng câu hỏi** — thuộc [EPIC-4](EPIC-4.md) (US-4.1), dù job này chạy ngay sau khi JD được duyệt.
- **Dashboard chi phí LLM** — thuộc [EPIC-6](EPIC-6.md) (US-6.2). EPIC-2 chỉ ghi `ai.llm_calls`.
- **Bộ đánh giá chất lượng trích xuất (P/R/F1)** — thuộc [EPIC-6](EPIC-6.md) (US-6.3).
- **Mô hình mở tự host thay Claude (PRD Q8)** — chỉ thiết kế `LLMClient` để đổi được, không cài đặt.

## FR Coverage

| FR | Story | Status |
|----|-------|--------|
| FR-9 | US-2.3 | 📋 backlog |
| FR-10 | US-2.3 | 📋 backlog |
| FR-11 | US-2.4 | 📋 backlog |
| FR-12 | US-2.6 | 📋 backlog |
| FR-13 | US-2.5 | 📋 backlog |

> NFR-3 (không gửi PII không cần thiết cho LLM), NFR-6 (< 30 giây/CV), NFR-10 (job có retry) và NFR-12 (thay được mô hình) được thực thi trong epic này.

## AD Coverage

| AD | Title | Story |
|----|-------|-------|
| AD-1 | Tách tất định khỏi xác suất | US-2.1 |
| AD-4 | Schema `ai`, view `core.v_ai_*` đã che PII | US-2.1 |
| AD-5 | Job AI bất đồng bộ qua RabbitMQ, idempotent, DLQ | US-2.1 |
| AD-6 | Hợp đồng dữ liệu Zod → JSON Schema → Pydantic | US-2.1 |
| AD-10 | Một model Claude Opus 5.5, mọi lượt gọi qua `LLMClient` | US-2.2 |
| AD-11 | Embedding `bge-m3` tự host | US-2.5 |
| AD-12 | Prompt có phiên bản (phần Batches/caching dùng ở EPIC-3, EPIC-4) | US-2.2 |

## Stories

| ID | Title | Goal | Status | Version |
|---|---|---|---|---|
| US-2.1 | Hạ tầng job AI và hợp đồng message | Job AI đi từ backend sang AI Service và quay về, idempotent, có DLQ | 📋 backlog | — |
| US-2.2 | LLMClient và prompt có phiên bản | Mọi lượt gọi Claude đi qua một lớp có retry, refusal, ghi chi phí, fixture | 📋 backlog | — |
| US-2.3 | JD Analyzer và HR xác nhận yêu cầu | HR nhận yêu cầu chuẩn hóa do AI đề xuất, sửa và xác nhận | 📋 backlog | — |
| US-2.4 | CV Parser: chữ ẩn, tách PII | CV thành hồ sơ năng lực có `profile_masked`, chặn chữ ẩn | 📋 backlog | — |
| US-2.5 | Embedding và danh mục kỹ năng | Tên kỹ năng được chuẩn hóa; quản trị duyệt kỹ năng mới | 📋 backlog | — |
| US-2.6 | SV xác nhận hồ sơ năng lực | SV xem CV bên cạnh hồ sơ, sửa và xác nhận | 📋 backlog | — |

## Object map & user-story interactions

### US ↔ entity / subsystem matrix

| US | Primary entity / subsystem | FR |
|---|---|---|
| US-2.1 | `packages/shared/contracts`; module `aigateway`; `ai.jobs`; `ai-service/app/consumers`; view `core.v_ai_*` | – |
| US-2.2 | `ai-service/app/llm/`; `ai-service/app/prompts/`; `ai.llm_calls`; bucket `llm-logs` | – |
| US-2.3 | agent `jd_analyzer`; `job_descriptions.requirements`, `version` | FR-9, FR-10 |
| US-2.4 | agent `cv_parser`; `ai-service/app/parsing/`; `cvs.profile`, `cvs.pii`, `cvs.profile_masked`, `hidden_text_flag` | FR-11 |
| US-2.5 | `ai-service/app/embedding/`; `ai.embeddings`; `skills` | FR-13 |
| US-2.6 | `apps/web/src/features/student/`; vòng đời CV | FR-12 |

## Cross-cutting invariants

- **AI Service chỉ ghi schema `ai` và không chuyển trạng thái nghiệp vụ (AD-1, AD-4):** tài khoản DB của AI Service chỉ có quyền đọc view `core.v_ai_*` và quyền ghi `ai.*`. Thực thi ở US-2.1 bằng quyền DB, có integration test thử ghi `core` và bị từ chối.
- **Payload chỉ chứa ID, xử lý idempotent theo `job_id` (AD-5):** nhận trùng message không làm sai dữ liệu. Thực thi ở US-2.1; test gửi trùng message.
- **Hợp đồng message viết một lần (AD-6):** không viết tay model Pydantic; CI báo lỗi khi JSON Schema sinh ra lệch với model. Thực thi ở US-2.1.
- **Mọi lượt gọi LLM qua `LLMClient`, có `effort` ghi rõ, kiểm tra `stop_reason == "refusal"` trước khi đọc nội dung (AD-10):** agent không gọi SDK trực tiếp. Thực thi ở US-2.2.
- **Mọi kết quả LLM lưu kèm `model` và `prompt_version` (AGENTS › Nguyên tắc 12):** prompt đã dùng thì không sửa, chỉ tạo `v<N+1>`. Thực thi ở US-2.2.
- **CV/JD là dữ liệu, không phải chỉ dẫn (AGENTS › Nguyên tắc 6):** tách riêng trong prompt, loại chữ ẩn trước khi gửi, chỉ nhận đầu ra đúng schema. Thực thi ở US-2.3, US-2.4.
- **Thông tin nhạy cảm không đi vào bước chấm (BR-03, NFR-3):** PII tách sang `cvs.pii` (mã hóa pgcrypto); `profile_masked` không chứa ảnh, giới tính, ngày sinh, quê quán, tôn giáo, tình trạng hôn nhân. Thực thi ở US-2.4.
- **Chỉ dữ liệu đã xác nhận mới được chấm (BR-01, BR-02):** hồ sơ chưa xác nhận và JD chưa được HR xác nhận + Trung tâm duyệt không lọt vào view của matching. Thực thi ở US-2.3, US-2.6.
- **Sửa yêu cầu JD sau khi mở test thì tạo phiên bản mới (BR-18).** Thực thi ở US-2.3.

## Cross-story testing requirements

| Pattern | Stories that apply | Shared infra |
|---|---|---|
| **LLM thay bằng fixture, không gọi API thật trong test** | US-2.2 trở đi, mọi agent ở EPIC-3/EPIC-4 | chế độ fixture của `LLMClient` + `ai-service/tests/fixtures/` (US-2.2) |
| **Kiểm tra hợp đồng TS ↔ Python** | mọi story thêm loại message | script so JSON Schema ↔ Pydantic trong CI (US-2.1) |
| **Luồng job qua RabbitMQ thật** | US-2.1, US-2.3, US-2.4, EPIC-3, EPIC-4 | testcontainers RabbitMQ (US-2.1) |
| **Bộ CV mẫu có chữ ẩn, bản scan, DOCX** | US-2.4, US-6.3 | `ai-service/tests/fixtures/cv/` (US-2.4) |

## Performance budgets & invariants

| Concern | Budget | Story | Rationale |
|---|---|---|---|
| **Phân tích 1 CV** | < 30 giây (NFR-6) | US-2.4 | SV chờ để xác nhận hồ sơ |
| **Retry job** | tối đa 3 lần rồi vào DLQ (NFR-10) | US-2.1 | Lỗi tạm thời tự hồi phục; lỗi lâu dài hiện ra cho quản trị |
| **Sai schema đầu ra LLM** | thử lại tối đa 2 lần, sau đó chuyển người xử lý | US-2.2 | PRD › *Kiểm soát rủi ro AI (guardrails)* |
| **Ngưỡng chuẩn hóa kỹ năng** | cosine ≥ 0,85 thì gán | US-2.5 | ARCH › Pipeline CV Parser |

## Acceptance criteria (propagated from stories)

- [ ] Một job đi trọn vòng backend → RabbitMQ → AI Service → `ai.results` → backend; nhận trùng message không ghi trùng; lỗi 3 lần vào DLQ (US-2.1)
- [ ] `LLMClient` ghi usage và chi phí mỗi lượt gọi; test chạy bằng fixture, không gọi API thật (US-2.2)
- [ ] HR nhận yêu cầu chuẩn hóa do AI đề xuất, sửa và xác nhận; sửa sau khi mở test tạo phiên bản mới (US-2.3)
- [ ] CV có chữ ẩn bị gắn cờ và chữ ẩn bị loại; `profile_masked` không chứa PII (US-2.4)
- [ ] Kỹ năng "ReactJS", "React.js" được chuẩn hóa thành `React`; kỹ năng mới chờ quản trị duyệt (US-2.5)
- [ ] SV xem CV bên cạnh hồ sơ năng lực, sửa và xác nhận; hồ sơ chưa xác nhận không được chấm (US-2.6)
