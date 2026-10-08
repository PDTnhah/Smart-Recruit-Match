---
id: EPIC-1
title: "Nền tảng, tài khoản và đợt thực tập"
status: backlog
prd_ref:
  - FR-1
  - FR-2
  - FR-3
  - FR-4
  - FR-5
  - FR-6
  - FR-7
  - FR-8
arch_ref:
  - AD-3
  - AD-4
  - AD-8
  - AD-9
  - AD-13
  - AD-14
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Cán bộ Trung tâm tạo được đợt, HR đăng được JD, sinh viên nộp được CV, trên hạ tầng chạy bằng một lệnh `docker compose up`. Sau epic này, các epic khác không phải lo về monorepo, CI, đăng nhập, phân quyền, chuyển trạng thái, nhật ký thao tác hay thông báo.

## Overview

### Business context

Trước EPIC-1 repo chỉ có tài liệu. Epic này dựng phần nền mà mọi giai đoạn nghiệp vụ dùng chung: monorepo pnpm (AD-3), lược đồ `core` bằng Drizzle (AD-4, AD-9), cơ chế `transitionTo` + bảng chuyển trạng thái + `row_version` (AD-8), đăng nhập và phân quyền theo vai trò, design system shadcn (AD-14), thông báo + SSE (AD-13). Về nghiệp vụ, nó phủ GĐ0 (thiết lập đợt), phần tiếp nhận của GĐ1 (HR đăng JD, Trung tâm duyệt) và phần tiếp nhận của GĐ2 (SV đồng ý điều khoản và nộp CV).

Epic này **không** gọi LLM. Phân tích JD/CV bằng AI thuộc [EPIC-2](EPIC-2.md); epic này chỉ lưu file gốc lên MinIO và giữ trạng thái "chờ phân tích".

### Feature pillars

| # | Pillar | Stories | Purpose |
|---|---|---|---|
| 1 | **Nền móng kỹ thuật** | US-1.1, US-1.2 | Monorepo, Docker Compose, CI, cổng commit; lược đồ `core`, `transitionTo`, nhật ký append-only |
| 2 | **Danh tính và giao diện nền** | US-1.3 | Đăng nhập JWT, RBAC + kiểm tra cấp bản ghi, `DESIGN.md`, khung 3 cổng |
| 3 | **Vận hành đợt** | US-1.4, US-1.5 | Cấu hình đợt và trạng thái theo mốc; doanh nghiệp, tài khoản HR, đăng và duyệt JD |
| 4 | **Tiếp nhận sinh viên** | US-1.6 | Đồng ý xử lý dữ liệu, nộp CV có phiên bản |
| 5 | **Thông báo** | US-1.7 | Thông báo trong app, SSE, email outbox, nhắc hạn |

### Schedule and dependencies

Lộ trình chung ở [sprints/README › Lộ trình](../README.md#lộ-trình) và [CONTEXT D20](../../CONTEXT.md).

| Story | Điểm | Tuần | Làn | Phụ thuộc |
|---|---|---|---|---|
| US-1.1 | 5 | T1 (W41) | A | – |
| US-1.2 | 5 | T1 (W41, kéo sớm từ T2) | A | US-1.1 |
| US-1.3 | 8 | T2 (W42) | A | US-1.1 |
| US-1.4 | 5 | T3 (W43) | A | US-1.2, US-1.3 |
| US-1.5 | 8 | T3 (W43) | A | US-1.2, US-1.3 |
| US-1.6 | 5 | T4 (W44) | A | US-1.4 |
| US-1.7 | 5 | T4 (W44) | A | US-1.2, US-1.3 |

### Out of scope

- **Phân tích JD/CV bằng LLM, màn xác nhận yêu cầu chuẩn hóa và hồ sơ năng lực** — thuộc [EPIC-2](EPIC-2.md).
- **Hạ tầng job AI (RabbitMQ, `aigateway`, schema `ai`)** — thuộc [EPIC-2](EPIC-2.md) (US-2.1). EPIC-1 chỉ khởi động RabbitMQ trong Docker Compose.
- **Bảng chuyển trạng thái của hồ sơ ứng tuyển và đề cử** — thuộc [EPIC-3](EPIC-3.md) (US-3.3) và [EPIC-5](EPIC-5.md). EPIC-1 chỉ làm cơ chế chung và vòng đời của đợt, JD, CV.
- **SSO của trường qua OIDC** — ARCH ghi là tùy chọn; ngoài phạm vi trừ khi GVHD yêu cầu (chốt ở US-1.3).

## FR Coverage

| FR | Story | Status |
|----|-------|--------|
| FR-1 | US-1.3 | 📋 backlog |
| FR-2 | US-1.4 | 📋 backlog |
| FR-3 | US-1.5 | 📋 backlog |
| FR-4 | US-1.5 | 📋 backlog |
| FR-5 | US-1.5 | 📋 backlog |
| FR-6 | US-1.6 | 📋 backlog |
| FR-7 | US-1.2 | 📋 backlog |
| FR-8 | US-1.7 | 📋 backlog |

## AD Coverage

| AD | Title | Story |
|----|-------|-------|
| AD-3 | Modular monolith + AI Service, monorepo pnpm | US-1.1 |
| AD-4 | Một nguồn sự thật (schema `core`) | US-1.2 |
| AD-8 | Bảng chuyển trạng thái + `transitionTo` + `row_version` | US-1.2 |
| AD-9 | Drizzle ORM + drizzle-kit | US-1.2 |
| AD-13 | Server-Sent Events | US-1.7 |
| AD-14 | shadcn/ui + Tailwind CSS | US-1.3 |

> AD-4 phần schema `ai` và view che PII được hiện thực ở [EPIC-2](EPIC-2.md) (US-2.1).

## Stories

| ID | Title | Goal | Status | Version |
|---|---|---|---|---|
| US-1.1 | Scaffold monorepo, Docker Compose, CI | Chạy toàn bộ hạ tầng bằng một lệnh; CI và cổng commit hoạt động | 👀 review | — |
| US-1.2 | Lược đồ DB lõi, `transitionTo`, nhật ký thao tác | Mọi thay đổi trạng thái đi qua một hàm, có audit trong cùng giao dịch | 👀 review | — |
| US-1.3 | Đăng nhập, phân quyền, DESIGN.md, khung giao diện | Bốn vai trò đăng nhập và thấy đúng cổng của mình | 📋 backlog | — |
| US-1.4 | Tạo và cấu hình đợt thực tập | Trung tâm tạo đợt với tham số và mốc; đợt tự chuyển trạng thái theo mốc | 📋 backlog | — |
| US-1.5 | Doanh nghiệp, tài khoản HR, đăng và duyệt JD | HR đăng JD; Trung tâm duyệt JD | 📋 backlog | — |
| US-1.6 | Đồng ý xử lý dữ liệu và nộp CV | Sinh viên đồng ý điều khoản và nộp CV có phiên bản | 📋 backlog | — |
| US-1.7 | Thông báo trong app, SSE, email, nhắc hạn | Người dùng nhận thông báo theo sự kiện nghiệp vụ | 📋 backlog | — |

## Object map & user-story interactions

### US ↔ entity / subsystem matrix

| US | Primary entity / subsystem | FR |
|---|---|---|
| US-1.1 | `package.json`, `pnpm-workspace.yaml`, `deploy/docker-compose.yml`, CI | – |
| US-1.2 | `campaigns`, `companies`, `users`, `students`, `job_descriptions`, `cvs`, `audit_logs`; `packages/shared/states` | FR-7 |
| US-1.3 | module `iam`; `apps/web/src/app`; `DESIGN.md` | FR-1 |
| US-1.4 | module `campaign`; `campaigns.config`, `phase_deadlines` | FR-2 |
| US-1.5 | module `company`; `companies`, `job_descriptions`, bucket `jd-files` | FR-3, FR-4, FR-5 |
| US-1.6 | module `student`; `cvs`, bucket `cv-files` | FR-6 |
| US-1.7 | module `notification`; `notifications`, `GET /api/events/stream` | FR-8 |

## Cross-cutting invariants

- **Mọi thay đổi trạng thái đi qua `transitionTo` (AD-8):** kiểm tra chuyển hợp lệ theo bảng trong `packages/shared/states`, kiểm tra điều kiện, ghi `audit_logs` trong cùng giao dịch; cập nhật kèm `row_version`, không có dòng nào bị cập nhật thì trả `409`. Thực thi ở US-1.2; unit test bảng chuyển + integration test xung đột đồng thời.
- **Nhật ký chỉ ghi thêm (FR-7, BR-10):** `audit_logs` không cho `UPDATE`/`DELETE` ở tầng DB (trigger hoặc quyền). Thực thi ở US-1.2.
- **Phân quyền cấp bản ghi (BR-11, NFR-1):** mọi endpoint kiểm tra vai trò bằng `@Roles()` và kiểm tra quyền sở hữu bản ghi trong service; HR chỉ thấy JD của công ty mình, SV chỉ thấy dữ liệu của mình. Thực thi ở US-1.3; mỗi story có endpoint mới thêm test IDOR.
- **Mỗi SV tối đa 1 CV hiệu lực trong một đợt (BR-01):** partial unique index `(student_id, campaign_id) WHERE active`. Thực thi ở US-1.6.
- **Thao tác đúng pha của đợt (FR-2):** endpoint của từng giai đoạn chặn khi đợt không ở trạng thái tương ứng. Thực thi ở US-1.4.
- **Không tin phần mở rộng file:** kiểm MIME thật bằng `file-type`, tối đa 5 MB; file CV/JD lưu có mã hóa phía server, tải qua URL tạm. Thực thi ở US-1.5, US-1.6.
- **Ranh giới module (AGENTS › Nguyên tắc 13):** module không truy vấn bảng của module khác; `domain/` không import NestJS hay Drizzle. dependency-cruiser chạy trong CI từ US-1.1.

## RBAC additions

| Resource | New action | Story | Default roles |
|---|---|---|---|
| `campaign` | create, update, read | US-1.4 | CENTER (ghi), mọi vai trò (đọc đợt mình tham gia) |
| `company` | create, update, invite-hr | US-1.5 | CENTER |
| `job_description` | create, update | US-1.5 | HR (công ty mình) |
| `job_description` | approve | US-1.5 | CENTER |
| `cv` | upload, read-own | US-1.6 | STUDENT |
| `notification` | read-own | US-1.7 | mọi vai trò |

## Cross-story testing requirements

| Pattern | Stories that apply | Shared infra |
|---|---|---|
| **Integration test với PostgreSQL thật** | US-1.2 trở đi | testcontainers dựng ở US-1.1 (`apps/api/test/`) |
| **Kiểm tra chuyển trạng thái** | US-1.2, US-1.4, US-1.5, US-1.6 và các epic sau | helper test cho `transitionTo` + bảng chuyển (US-1.2) |
| **Test phân quyền cấp bản ghi (IDOR)** | US-1.3 trở đi | helper đăng nhập theo vai trò + seed (US-1.3) |
| **Mã BR/GĐ trong tên test** | mọi story | quy ước ở AGENTS › Kiểm thử |

## Performance budgets & invariants

| Concern | Budget | Story | Rationale |
|---|---|---|---|
| **Kích thước file tải lên** | ≤ 5 MB | US-1.5, US-1.6 | ARCH › Security architecture |
| **URL tải file tạm** | hết hạn sau 5 phút | US-1.6 | Không để lộ file CV lâu dài |
| **Access token** | 15 phút; refresh token trong cookie httpOnly | US-1.3 | ARCH › Security architecture |
| **Khởi động hạ tầng** | một lệnh `docker compose up` | US-1.1 | Demo đồ án |

## Acceptance criteria (propagated from stories)

- [ ] `docker compose up` dựng đủ PostgreSQL/pgvector, Redis, RabbitMQ, MinIO, Mailpit, API, web; CI chạy typecheck, lint, test (US-1.1)
- [ ] Thay đổi trạng thái sai bảng chuyển bị từ chối; hai thao tác đồng thời trên cùng bản ghi trả 409; mọi thay đổi có audit (US-1.2)
- [ ] Bốn vai trò đăng nhập, vào đúng cổng; HR không đọc được JD của công ty khác (US-1.3)
- [ ] Trung tâm tạo đợt với đủ tham số; đợt tự chuyển trạng thái theo mốc và chặn thao tác sai pha (US-1.4)
- [ ] HR đăng JD bằng form hoặc file; Trung tâm duyệt JD (US-1.5)
- [ ] SV đồng ý điều khoản, nộp và cập nhật CV; chỉ có 1 CV hiệu lực mỗi đợt (US-1.6)
- [ ] Thông báo trong app hiện theo thời gian thực qua SSE; email được gửi qua outbox (US-1.7)
