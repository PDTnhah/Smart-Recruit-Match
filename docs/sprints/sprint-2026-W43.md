---
id: sprint-2026-W43
status: closed
start: 2026-10-19T00:00:00.000Z
end: 2026-10-25T00:00:00.000Z
goal: 'Ship US-2.1: job AI đi trọn vòng backend → RabbitMQ → AI Service → ai.results → backend, hợp đồng message Zod → JSON Schema → Pydantic có kiểm tra lệch trong CI, role DB riêng cho AI Service (v0.7.0); LLMClient hai nhà cung cấp và prompt có phiên bản (v0.8.0); đóng các story EPIC-1 đang review'
---
## Sprint scope

| US     | Title                                             | Epic   | Pri | Points | Status         | Carry    | Story file                                                                                                             |
| ------ | ------------------------------------------------- | ------ | --- | ------ | -------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| US-2.1 | Hạ tầng job AI và hợp đồng message                | EPIC-2 | P0  | 8      | 👀 review      | new      | [stories/US-2.1-ai-job-pipeline-message-contracts.md](stories/US-2.1-ai-job-pipeline-message-contracts.md)             |
| US-2.2 | LLMClient và prompt có phiên bản                  | EPIC-2 | P0  | 5      | 👀 review      | new      | [stories/US-2.2-llm-client-versioned-prompts.md](stories/US-2.2-llm-client-versioned-prompts.md)                       |
| US-2.3 | JD Analyzer và HR xác nhận yêu cầu             | EPIC-2 | P0  | 13     | 👀 review      | new      | [stories/US-2.3-jd-analyzer-hr-requirement-confirmation.md](stories/US-2.3-jd-analyzer-hr-requirement-confirmation.md) |
| US-1.1 | Scaffold monorepo, Docker Compose, CI             | EPIC-1 | P0  | 5      | 👀 review      | from W41 | [stories/US-1.1-scaffold-monorepo-docker-compose-ci.md](stories/US-1.1-scaffold-monorepo-docker-compose-ci.md)         |
| US-1.3 | Đăng nhập, phân quyền, DESIGN.md, khung giao diện | EPIC-1 | P0  | 8      | 👀 review      | from W41 | [stories/US-1.3-auth-rbac-design-system-app-shell.md](stories/US-1.3-auth-rbac-design-system-app-shell.md)             |
| US-1.4 | Tạo và cấu hình đợt thực tập                      | EPIC-1 | P0  | 5      | 👀 review      | from W42 | [stories/US-1.4-campaign-setup-and-config.md](stories/US-1.4-campaign-setup-and-config.md)                             |
| US-1.5 | Doanh nghiệp, tài khoản HR, đăng và duyệt JD      | EPIC-1 | P0  | 8      | 👀 review      | from W42 | [stories/US-1.5-company-hr-accounts-jd-posting-approval.md](stories/US-1.5-company-hr-accounts-jd-posting-approval.md) |
| US-1.6 | Đồng ý xử lý dữ liệu và nộp CV                    | EPIC-1 | P0  | 5      | 👀 review      | from W42 | [stories/US-1.6-data-consent-and-cv-upload.md](stories/US-1.6-data-consent-and-cv-upload.md)                           |
| US-1.7 | Thông báo trong app, SSE, email, nhắc hạn         | EPIC-1 | P1  | 5      | 👀 review      | from W42 | [stories/US-1.7-notifications-sse-email-reminders.md](stories/US-1.7-notifications-sse-email-reminders.md)             |

> **Convention**: AC + Tasks live inside each story file. This sprint file lists planned
> stories at a glance only. Design + decision docs cross-linked at the bottom.

## Sprint goal recap

Tuần T3 của lộ trình 13 tuần ([sprints/README › Lộ trình](README.md#lộ-trình)). Phần làn A của T3 và T4 (US-1.4 … US-1.7) đã xong ở W42, nên tuần này tập trung vào làn B: US-2.1 là nền cho cả EPIC-2 đến EPIC-4.

**Deliverable cut**: hợp đồng message trong `packages/shared/contracts` (Zod → JSON Schema → Pydantic, CI báo lệch), schema `ai` và bảng `ai.jobs`, hai view `core.v_ai_*` đã che PII, role `api_service` và `ai_service`, module `aigateway` (gửi job, nhận `ai.results`), worker FastStream với handler giả (idempotent, thử lại 3 lần rồi vào DLQ), service `ai-worker` và `ai-api` trong Docker Compose. US-2.2 kéo sớm từ W44 vào tuần này (v0.8.0): `LLMClient` với Gemini mặc định và Claude thay thế, bảng `ai.llm_calls` (migration `0007`), bucket `llm-logs`, prompt có phiên bản, chế độ fixture ([CONTEXT D34](../CONTEXT.md)). US-2.3 kéo sớm từ W45 vào tuần này (v0.9.0): JD Analyzer thật, `parsing/` loại chữ ẩn trong PDF/DOCX, worker dựng `LLMClient`, màn HR xác nhận yêu cầu chuẩn hóa, phiên bản yêu cầu theo BR-18 ([CONTEXT D35](../CONTEXT.md)); sinh migration `0009`, `0010`. Chưa làm: handler thật của CV (US-2.4). US-2.1 sinh migration `0005`, `0006` ([CONTEXT D33](../CONTEXT.md)); US-2.2 sinh `0007` sau khi US-2.1 đã merge.

Sáu story EPIC-1 chuyển từ W41, W42 ở trạng thái `review`, chờ xác nhận CI xanh và kiểm tay trong trình duyệt.

## Parked / deferred from W42

- 🚧 **Carried into W43**: US-1.1 — chờ xác nhận CI xanh (AC-4).
- 🚧 **Carried into W43**: US-1.3, US-1.4, US-1.5, US-1.6, US-1.7 — chờ kiểm tay trong trình duyệt.
- ⏭️ **Not started**: US-5.1 (làn B, kế hoạch W42) — bắt đầu sau US-2.1.

## Risks & dependencies

- **US-2.1 sửa `packages/shared/contracts` và sinh migration** — *Impact*: xung đột với story chạy song song (US-5.1, US-2.2). *Mitigation*: US-2.1 merge trước; story khác rebase rồi mới sinh migration ([README › Chạy song song](README.md#chạy-song-song)). *Owner*: @PDTnhah.

- **Integration test thêm RabbitMQ và container AI Service** — *Impact*: máy dev thiếu RAM, suite chậm. *Mitigation*: tắt compose trước khi chạy `pnpm test` ([LESSONS §15](../LESSONS.md)); chỉ test trọn vòng mới dựng container AI Service. *Owner*: @PDTnhah.

## Per-Epic Retrospective

| Epic   | Retro Status | Notes                                |
| ------ | ------------ | ------------------------------------ |
| EPIC-1 | optional     | Code xong; chờ kiểm tay để đóng epic |
| EPIC-2 | optional     | Epic còn chạy tới W46                |

## Retrospective

Đóng ngày 2026-10-25. Sprint ship ba version: 0.7.0 (US-2.1), 0.8.0 (US-2.2), 0.9.0 (US-2.3), tổng 26 điểm so với 8 điểm kế hoạch ban đầu (US-2.1). US-2.2 kéo sớm từ W44, US-2.3 kéo sớm từ W45. Cả ba còn ở `review`, chờ CI xanh, kiểm tay và chạy thử với key LLM thật.

### What went well

- Làn B đi nhanh: đường ống job AI, `LLMClient` hai nhà cung cấp và agent thật đầu tiên (JD Analyzer) xong trong một tuần, nên US-2.4 bắt đầu được ngay cuối tuần.
- Mỗi story một lượt sinh migration (`0005`–`0010`), không xung đột số thứ tự.
- Test trọn vòng chạy worker Python thật trong container; chế độ fixture giữ CI không gọi API thật.

### What didn't

- Việc kiểm tay dồn thêm: chín story ở `review`.
- `pip install` trong image test chạy lại mỗi lần làm `beforeAll` quá hạn ([LESSONS §18](../LESSONS.md)); chặn mạng trong pytest trên Windows cần cách khác ([LESSONS §19](../LESSONS.md)).
- US-5.1 (làn B, kế hoạch W42) vẫn chưa bắt đầu; mốc M1 còn thiếu US-5.1 và US-6.4.

### Followups

- Kiểm tay và xác nhận CI cho chín story `review`, ưu tiên đóng EPIC-1.
- Chạy `ai-service/evals/smoke_llm.py` với `GEMINI_API_KEY` cho US-2.2 và US-2.3.
- W44: US-2.4 (đang làm), rồi US-5.1, US-6.4 để kịp M1.

## Carry-overs to W44

| US | Lý do | Từ sprint |
|---|---|---|
| US-1.1 | `review`: chờ xác nhận CI xanh (AC-4) | W41 |
| US-1.3 | `review`: chờ kiểm tay AC-4 (web), AC-11, AC-12, AC-13 | W41 |
| US-1.4 | `review`: chờ kiểm tay AC-9 | W42 |
| US-1.5 | `review`: chờ kiểm tay AC-10 | W42 |
| US-1.6 | `review`: chờ kiểm tay AC-9 | W42 |
| US-1.7 | `review`: chờ kiểm tay AC-7 ở 360 px | W42 |
| US-2.1 | `review`: chờ CI xanh | W43 |
| US-2.2 | `review`: chờ CI xanh và `smoke_llm.py` với key thật | W43 |
| US-2.3 | `review`: chờ CI xanh, kiểm tay giao diện, JD giả qua Gemini | W43 |

## Cross-references

- [Story US-2.1](stories/US-2.1-ai-job-pipeline-message-contracts.md) — AC + Tasks
- [Story US-1.1](stories/US-1.1-scaffold-monorepo-docker-compose-ci.md), [US-1.3](stories/US-1.3-auth-rbac-design-system-app-shell.md), [US-1.4](stories/US-1.4-campaign-setup-and-config.md), [US-1.5](stories/US-1.5-company-hr-accounts-jd-posting-approval.md), [US-1.6](stories/US-1.6-data-consent-and-cv-upload.md), [US-1.7](stories/US-1.7-notifications-sse-email-reminders.md) — chuyển từ W41, W42
- [Sprint W42 (đã đóng)](sprint-2026-W42.md)
- [EPIC-1](epics/EPIC-1.md), [EPIC-2](epics/EPIC-2.md) — epic cha
- [CONTEXT D33](../CONTEXT.md) — đường ống job AI, hợp đồng message, role DB
- [README.md](README.md) — quy ước sprint
- [STATUS.md](STATUS.md) — bảng kanban tự sinh
