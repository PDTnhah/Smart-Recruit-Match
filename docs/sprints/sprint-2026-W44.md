---
id: sprint-2026-W44
status: in-progress
start: 2026-10-26T00:00:00.000Z
end: 2026-11-01T00:00:00.000Z
goal: 'Ship US-2.4: CV sinh viên được AI phân tích thành hồ sơ năng lực, chữ ẩn bị loại và gắn cờ, thông tin cá nhân tách riêng và mã hóa, điều khoản v2 ghi tên Google (v0.10.0); bắt đầu US-5.1, US-6.4 để kịp mốc M1; đóng các story đang review'
---
## Sprint scope

| US     | Title                                             | Epic   | Pri | Points | Status     | Carry    | Story file                                                                                                             |
| ------ | ------------------------------------------------- | ------ | --- | ------ | ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| US-2.4 | CV Parser: chữ ẩn, tách PII                       | EPIC-2 | P0  | 8      | 👀 review  | new      | [stories/US-2.4-cv-parser-hidden-text-pii-split.md](stories/US-2.4-cv-parser-hidden-text-pii-split.md)                 |
| US-5.1 | Allocation Engine và property-based test          | EPIC-5 | P0  | 5      | 📋 backlog | new      | [stories/US-5.1-allocation-engine-property-tests.md](stories/US-5.1-allocation-engine-property-tests.md)               |
| US-6.4 | Mô phỏng phân bổ so với baseline                  | EPIC-6 | P1  | 5      | 📋 backlog | new      | [stories/US-6.4-allocation-simulation-vs-baselines.md](stories/US-6.4-allocation-simulation-vs-baselines.md)           |
| US-2.1 | Hạ tầng job AI và hợp đồng message                | EPIC-2 | P0  | 8      | 👀 review  | from W43 | [stories/US-2.1-ai-job-pipeline-message-contracts.md](stories/US-2.1-ai-job-pipeline-message-contracts.md)             |
| US-2.2 | LLMClient và prompt có phiên bản                  | EPIC-2 | P0  | 5      | 👀 review  | from W43 | [stories/US-2.2-llm-client-versioned-prompts.md](stories/US-2.2-llm-client-versioned-prompts.md)                       |
| US-2.3 | JD Analyzer và HR xác nhận yêu cầu                | EPIC-2 | P0  | 13     | 👀 review  | from W43 | [stories/US-2.3-jd-analyzer-hr-requirement-confirmation.md](stories/US-2.3-jd-analyzer-hr-requirement-confirmation.md) |
| US-1.1 | Scaffold monorepo, Docker Compose, CI             | EPIC-1 | P0  | 5      | 👀 review  | from W41 | [stories/US-1.1-scaffold-monorepo-docker-compose-ci.md](stories/US-1.1-scaffold-monorepo-docker-compose-ci.md)         |
| US-1.3 | Đăng nhập, phân quyền, DESIGN.md, khung giao diện | EPIC-1 | P0  | 8      | 👀 review  | from W41 | [stories/US-1.3-auth-rbac-design-system-app-shell.md](stories/US-1.3-auth-rbac-design-system-app-shell.md)             |
| US-1.4 | Tạo và cấu hình đợt thực tập                      | EPIC-1 | P0  | 5      | 👀 review  | from W42 | [stories/US-1.4-campaign-setup-and-config.md](stories/US-1.4-campaign-setup-and-config.md)                             |
| US-1.5 | Doanh nghiệp, tài khoản HR, đăng và duyệt JD      | EPIC-1 | P0  | 8      | 👀 review  | from W42 | [stories/US-1.5-company-hr-accounts-jd-posting-approval.md](stories/US-1.5-company-hr-accounts-jd-posting-approval.md) |
| US-1.6 | Đồng ý xử lý dữ liệu và nộp CV                    | EPIC-1 | P0  | 5      | 👀 review  | from W42 | [stories/US-1.6-data-consent-and-cv-upload.md](stories/US-1.6-data-consent-and-cv-upload.md)                           |
| US-1.7 | Thông báo trong app, SSE, email, nhắc hạn         | EPIC-1 | P1  | 5      | 👀 review  | from W42 | [stories/US-1.7-notifications-sse-email-reminders.md](stories/US-1.7-notifications-sse-email-reminders.md)             |

> **Convention**: AC + Tasks live inside each story file. This sprint file lists planned
> stories at a glance only. Design + decision docs cross-linked at the bottom.

## Sprint goal recap

Tuần T4 của lộ trình 13 tuần ([sprints/README › Lộ trình](README.md#lộ-trình)), cuối giai đoạn 1 (mốc **M1**). Làn A của T4 (US-1.6, US-1.7) và làn B của T4 (US-2.2) đã xong sớm ở W42, W43. Vì vậy tuần này kéo US-2.4 sớm từ W45 (8 điểm), cùng với US-5.1 và US-6.4 (10 điểm) còn thiếu cho M1.

**Deliverable cut**: CV Parser thật thay handler giả ([CONTEXT D37](../CONTEXT.md)):

- chữ ẩn bị loại và gắn cờ;
- bản scan được gửi nguyên file cho model;
- email, SĐT được che trước LLM;
- `profile_masked` và `masked_text` do code che;
- `cvs.pii` mã hóa pgcrypto;
- trạng thái "Lỗi phân tích", thông báo, trang "CV cần xử lý" của Trung tâm, lệnh chạy bù `cv:redispatch`;
- `TERMS_V2` ghi tên Google, sinh viên đồng ý lại.

US-2.4 sinh migration `0011`, `0012`. Đây là story duy nhất sinh migration đầu tuần; US-5.1 và US-6.4 là hàm thuần và mô phỏng, không cần migration.

## Parked / deferred from W43

- ✅ **Started in W43, carried as new**: US-2.4 — bắt đầu ngày 2026-10-25, ship 0.10.0, ở `review`.
- 🚧 **Carried into W44**: US-2.1, US-2.2, US-2.3 — chờ CI xanh, kiểm tay và chạy với key LLM thật.
- 🚧 **Carried into W44**: US-1.1, US-1.3, US-1.4, US-1.5, US-1.6, US-1.7 — chờ CI xanh hoặc kiểm tay trong trình duyệt.
- ⏭️ **Not started**: US-5.1 (kế hoạch W42), US-6.4 (kế hoạch W44).

## Risks & dependencies

- **US-2.4 cần người dùng duyệt `TERMS_V2` và chạy với key Gemini thật** — *Impact*: chưa gửi CV thật cho Gemini được; AC-12 (p95 < 30 giây) chưa có số liệu. *Mitigation*: compose mặc định `LLM_PROVIDER=fixture`; `perf_cv_parse.py` và `smoke_llm.py` chạy tay trên CV giả. *Owner*: @PDTnhah.

- **Máy dev thiếu RAM khi chạy integration test** — *Impact*: Jest worker hết bộ nhớ, suite đỏ ngẫu nhiên. *Mitigation*: dừng compose trước `pnpm test` ([LESSONS §15](../LESSONS.md)); chạy riêng các suite bị ảnh hưởng với `--runInBand`. *Owner*: @PDTnhah.

- **Mốc M1 cuối tuần** — *Impact*: US-5.1, US-6.4 chưa bắt đầu. *Mitigation*: hai story là hàm TS thuần và script mô phỏng, chạy song song được trong worktree riêng, không đụng `packages/shared/contracts` hay migration. *Owner*: @PDTnhah.

## Per-Epic Retrospective

| Epic   | Retro Status | Notes                                |
| ------ | ------------ | ------------------------------------ |
| EPIC-1 | optional     | Code xong; chờ kiểm tay để đóng epic |
| EPIC-2 | optional     | Epic còn chạy tới W46                |
| EPIC-5 | optional     | Bắt đầu với US-5.1                   |
| EPIC-6 | optional     | Bắt đầu với US-6.4                   |

## Retrospective

*Điền khi đóng sprint.*

## Cross-references

- [Story US-2.4](stories/US-2.4-cv-parser-hidden-text-pii-split.md) — AC + Tasks
- [Story US-5.1](stories/US-5.1-allocation-engine-property-tests.md), [US-6.4](stories/US-6.4-allocation-simulation-vs-baselines.md) — kế hoạch tuần
- [Story US-2.1](stories/US-2.1-ai-job-pipeline-message-contracts.md), [US-2.2](stories/US-2.2-llm-client-versioned-prompts.md), [US-2.3](stories/US-2.3-jd-analyzer-hr-requirement-confirmation.md) — chuyển từ W43
- [Story US-1.1](stories/US-1.1-scaffold-monorepo-docker-compose-ci.md), [US-1.3](stories/US-1.3-auth-rbac-design-system-app-shell.md), [US-1.4](stories/US-1.4-campaign-setup-and-config.md), [US-1.5](stories/US-1.5-company-hr-accounts-jd-posting-approval.md), [US-1.6](stories/US-1.6-data-consent-and-cv-upload.md), [US-1.7](stories/US-1.7-notifications-sse-email-reminders.md) — chuyển từ W41, W42
- [Sprint W43 (đã đóng)](sprint-2026-W43.md)
- [CONTEXT D37](../CONTEXT.md)
