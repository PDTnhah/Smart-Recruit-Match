---
id: US-1.3
title: "Đăng nhập, phân quyền, DESIGN.md, khung giao diện"
epic: EPIC-1
status: review
priority: P0
points: 8
sprint: sprint-2026-W41
version_shipped: 0.2.0
prd_ref: [FR-1, NFR-1, NFR-13]
arch_ref: [AD-14]
depends_on: [US-1.1, US-1.2]
assignee:
commit: 340e62e690eb36e84bf2ae97b81c0c13e12c32b7
created: 2026-10-07
updated: 2026-10-08
---

## Story refresh — 2026-10-08

Đọc lại story vào ngày 2026-10-08 trên nhánh `us-1.3` (cùng nội dung với `dev`, đã có US-1.2). Các quyết định sau được chốt vào story; số AC giữ nguyên:

- **Sprint**: kéo story vào `sprint-2026-W41`, giống US-1.2. Lộ trình gốc đặt story ở T2 (W42).
- **Các đề xuất ở *Dev notes* được giữ** ([CONTEXT D25](../../CONTEXT.md)): sai vai trò trả `403`, bản ghi ngoài phạm vi trả `404`; băm mật khẩu bằng `scrypt` của `node:crypto`; tự đọc header `Cookie`; `ADMIN` dùng chung `/admin` với `CENTER`; ADMIN tạo từng tài khoản sinh viên, demo dùng seed.
- **Refresh token**: chuỗi ngẫu nhiên 32 byte, Redis lưu SHA-256 của nó ở `auth:refresh:{sha256}`, TTL 7 ngày (`REFRESH_TOKEN_TTL_DAYS`). Không dùng `jti` trong JWT: chuỗi ngẫu nhiên đã là định danh, và không cần khóa ký thứ hai. Xoay vòng bằng `GETDEL`, nên token đã dùng, đã thu hồi hay đã hết hạn đều trả `401`.
- **Không dùng passport**: guard JWT tự viết trên `@nestjs/jwt`. ARCH › *Thư viện chính* bỏ `passport-jwt`.
- **Một guard global `AccessGuard`** thay cho `JwtAuthGuard` + `RolesGuard` (Subtask 1.3.2.1). NestJS không ghi rõ thứ tự chạy của nhiều `APP_GUARD`, nên gộp thành một guard kiểm theo thứ tự: `@Public` → token → `@Roles`. Request thiếu token tới route `@Roles` trả `401`, không phải `403`.
- **`record-access.ts` ném `EntityNotFoundError`** (lỗi miền, body `{ code, message }`) thay cho `NotFoundException` (Subtask 1.3.2.2), để mọi lỗi API cùng một dạng `ApiError`.
- **Mật khẩu ban đầu** (AC-7): body tạo tài khoản có `password` (8–128 ký tự) do ADMIN nhập. Spec chưa nói tài khoản do ADMIN tạo lấy mật khẩu từ đâu.
- **Nền shadcn và API client** ([CONTEXT D26](../../CONTEXT.md)): Radix (preset `radix-nova`); openapi-typescript sinh kiểu, openapi-fetch gọi API.
- **Phiên bản ghim**: `@nestjs/jwt` 11.0.2, `@nestjs/swagger` 11.4.7 (12.x cần NestJS 12), `nestjs-zod` 5.5.0, `ioredis` 5.11.1 (6.0.0 mới ra 2 ngày). Web: `react-router` 8.4.0, `@tanstack/react-query` 5.103.2, `react-hook-form` 7.88.0, `@hookform/resolvers` 5.9.1, `date-fns` 4.4.0, `tailwindcss` + `@tailwindcss/vite` 4.3.3, `openapi-typescript` 7.13.0, `openapi-fetch` 0.17.0, CLI `shadcn` 4.21.0. Chỉ chọn bản đã phát hành ít nhất 2 tuần.
- **Version**: 0.2.0, vì đây là tính năng đầu tiên người dùng thấy được.

## Goal

Bốn vai trò (Cán bộ Trung tâm, Sinh viên, HR, Quản trị) đăng nhập được và chỉ vào được cổng của mình. Mỗi API kiểm tra cả vai trò lẫn quyền trên từng bản ghi. Story này cũng tạo `DESIGN.md` và chạy `shadcn init` trước màn hình đầu tiên, rồi dựng khung ba cổng `/sv`, `/hr`, `/admin`. Sau story này, story nào thêm endpoint chỉ cần gắn `@Roles()`, gọi helper kiểm tra quyền sở hữu và viết test IDOR bằng helper đăng nhập theo vai trò. Story nào thêm màn hình chỉ cần đọc `DESIGN.md` và đặt trang vào đúng cổng.

## Background

FR-1 yêu cầu đăng nhập, phân quyền theo vai trò và kiểm tra quyền cấp bản ghi (BR-11). NFR-1 yêu cầu mọi API kiểm tra vai trò và quyền cấp bản ghi. NFR-13 yêu cầu giao diện tiếng Việt, phần sinh viên dùng tốt trên điện thoại. PRD › *Personas* nêu nguyên tắc truy cập: HR chỉ thấy hồ sơ sinh viên được đề cử vào JD của công ty mình; sinh viên chỉ thấy điểm của chính mình.

ARCH › *Security architecture*: JWT với access token 15 phút, refresh token trong cookie httpOnly; RBAC bốn vai trò `CENTER`, `STUDENT`, `HR`, `ADMIN`; tài khoản HR do Trung tâm mời (US-1.5). ARCH › *Thư viện chính*: @nestjs/jwt + passport-jwt, guard `@Roles()` tự viết; kiểm tra cấp bản ghi đặt trong service.

AD-14 ([CONTEXT D14](../../CONTEXT.md)): shadcn/ui + Tailwind CSS thay cho Ant Design, vì phải khớp chuẩn review UI của quy trình koni. Design system ghi ở `DESIGN.md`, tạo trong EPIC-1 trước màn hình đầu tiên. Bỏ Ant Design nghĩa là mất locale tiếng Việt có sẵn: chuỗi giao diện tự viết bằng tiếng Việt, component ngày giờ dùng locale `vi` của date-fns. ARCH › *Frontend*: một SPA, điều hướng theo vai trò `/sv/*`, `/hr/*`, `/admin/*`, API client sinh từ OpenAPI.

SSO của trường qua OIDC là tùy chọn ở ARCH, và CONTEXT D20 đưa nó ra ngoài phạm vi. EPIC-1 › *Out of scope* hẹn chốt ở story này: không làm (xem *What we explicitly did NOT do*).

**Lessons applied**: §1 — liên kết `.claude/skills/shadcn` đã có; §2 — chạy `koni-docs sync` chỉ khi trạng thái đổi, rồi xem diff PRD và epic; §4 — image Redis cho testcontainers kiểm bằng `docker manifest inspect` và ghim cùng tag với compose; §5 — chạy lại `pnpm depcruise:fixture` sau khi thêm module `iam`, `student`; §6 — story không sinh migration, CI vẫn kiểm `apps/api/drizzle` sạch; §7 — helper Drizzle khai kiểu cụ thể, chạy `pnpm lint` chứ không chỉ `tsc`.

## Acceptance criteria

- [x] **AC-1** — **Given** một tài khoản đang hoạt động, **When** gửi email và mật khẩu đúng tới `POST /api/auth/login`, **Then** API trả access token JWT (hết hạn sau 15 phút, chứa `sub`, `role`, `company_id` hoặc `student_id` nếu có) **And** đặt refresh token trong cookie `httpOnly`, `Secure`, `SameSite=Strict`, chỉ gửi cho đường dẫn `/api/auth`. Mật khẩu chỉ lưu dạng băm, không bao giờ xuất hiện trong log hay response.
- [x] **AC-2** — **Given** email không tồn tại hoặc mật khẩu sai, **When** gọi đăng nhập, **Then** API trả `401` với cùng một thông báo cho cả hai trường hợp (không lộ email nào đã có tài khoản).
- [x] **AC-3** — **Given** refresh token hợp lệ, **When** gọi `POST /api/auth/refresh`, **Then** API trả access token mới và thay refresh token mới (refresh token cũ hết hiệu lực) **And** refresh token đã thu hồi, hết hạn hoặc dùng lại lần hai thì trả `401` và xóa cookie. `POST /api/auth/logout` thu hồi refresh token hiện tại.
- [ ] **AC-4** — **Given** access token đã hết hạn hoặc sai chữ ký, **When** gọi một API cần đăng nhập, **Then** API trả `401`. Web client tự gọi refresh một lần rồi gửi lại yêu cầu; refresh lỗi thì chuyển về `/login`.
- [x] **AC-5** — **Given** API đã dựng xong, **When** chạy test duyệt mọi route qua discovery của NestJS, **Then** route nào không có `@Roles(...)` hoặc `@Public()` thì test đỏ (mặc định từ chối) **And** gọi route bằng vai trò không nằm trong `@Roles` thì nhận `403`.
- [x] **AC-6** — **Given** HR của công ty A và một bản ghi thuộc công ty B (resource kiểm thử đăng ký riêng trong test), **When** HR của A đọc hoặc sửa bản ghi đó bằng ID, **Then** API trả `404` như khi bản ghi không tồn tại **And** sinh viên X đọc bản ghi của sinh viên Y cũng nhận `404`. Kiểm tra nằm trong service qua helper chung, không nằm ở controller.
- [x] **AC-7** — **Given** người gọi có vai trò `ADMIN`, **When** tạo tài khoản `CENTER`, `ADMIN` hoặc `STUDENT` (kèm `student_code`, `full_name`, `major`, `cohort`, `gpa`), **Then** tài khoản được tạo **And** tạo tài khoản `HR` qua đường này bị từ chối `422` (HR chỉ vào qua lời mời ở US-1.5) **And** email trùng trả `409` **And** người gọi không phải `ADMIN` nhận `403`.
- [x] **AC-8** — Script seed chỉ dùng cho môi trường dev/test tạo một tài khoản cho mỗi vai trò, cùng hai công ty, mỗi công ty một HR, và hai sinh viên. Chạy lại không tạo trùng. `apps/api/test/helpers/auth.ts` có `loginAs(role, options)` trả về agent Supertest đã gắn token, đủ để story sau viết test IDOR trong một dòng.
- [x] **AC-9** — `DESIGN.md` ở gốc repo có trước màn hình đầu tiên và ghi: token màu ngữ nghĩa, chữ, khoảng cách, bo góc; danh sách primitive shadcn được dùng; bốn trạng thái bắt buộc của mọi màn (rỗng, đang tải, lỗi, có dữ liệu); quy tắc viết chuỗi tiếng Việt; định dạng ngày giờ bằng date-fns locale `vi`; breakpoint và quy tắc cho điện thoại ở cổng sinh viên; mức tương phản tối thiểu.
- [x] **AC-10** — `apps/web/components.json` có sau khi chạy `shadcn init`. Lựa chọn nền Radix hay Base UI được hỏi người dùng trước khi chạy và ghi thành một mục D mới trong `docs/CONTEXT.md`. Token Tailwind khớp với `DESIGN.md`. Component sinh vào `apps/web/src/components/ui/`.
- [ ] **AC-11** — **Given** người dùng đã đăng nhập, **When** vào `/`, **Then** web chuyển tới cổng theo vai trò: `STUDENT` → `/sv`, `HR` → `/hr`, `CENTER` và `ADMIN` → `/admin` (menu khác nhau theo vai trò) **And** mở đường dẫn của cổng khác thì bị chuyển về cổng của mình **And** chưa đăng nhập thì về `/login`. Hàm ánh xạ vai trò → cổng là hàm thuần trong `packages/shared`, có unit test.
- [ ] **AC-12** — Form đăng nhập dùng React Hook Form + một Zod schema trong `packages/shared/schemas/`, chính schema này cũng validate request ở API (nestjs-zod). Form có đủ trạng thái: đang gửi, lỗi trường, lỗi đăng nhập. Mọi chuỗi bằng tiếng Việt.
- [ ] **AC-13** — Khung cổng sinh viên dùng được ở chiều rộng 360 px: không cuộn ngang, menu chuyển thành dạng sheet hoặc thanh dưới, vùng chạm theo kích thước ghi trong `DESIGN.md`.

## Tasks

- [x] **TASK-1.3.1** — Module `iam`: đăng nhập, refresh, đăng xuất (AC: 1, 2, 3, 4)
  - [x] Subtask 1.3.1.1 — `apps/api/src/modules/iam/domain/password.ts`: băm và so khớp bằng `scrypt` của `node:crypto` (không thêm thư viện).
  - [x] Subtask 1.3.1.2 — `apps/api/src/modules/iam/application/auth.service.ts`: phát access token, xoay vòng refresh token, thu hồi khi đăng xuất.
  - [x] Subtask 1.3.1.3 — `apps/api/src/modules/iam/api/auth.controller.ts`: `POST /api/auth/login`, `/refresh`, `/logout`, `GET /api/me`.
- [x] **TASK-1.3.2** — Guard và kiểm tra cấp bản ghi dùng chung (AC: 5, 6)
  - [x] Subtask 1.3.2.1 — `apps/api/src/common/auth/`: `JwtAuthGuard` và `RolesGuard` đăng ký global; decorator `@Roles()`, `@Public()`, `@CurrentUser()`.
  - [x] Subtask 1.3.2.2 — `apps/api/src/common/auth/record-access.ts`: helper ném `NotFoundException` khi bản ghi không thuộc phạm vi của người gọi (công ty với HR, sinh viên với STUDENT).
  - [x] Subtask 1.3.2.3 — `apps/api/test/integration/route-guards.int-spec.ts`: duyệt mọi route bằng `DiscoveryService`.
- [x] **TASK-1.3.3** — Quản trị tài khoản và seed (AC: 7, 8)
  - [x] Subtask 1.3.3.1 — `apps/api/src/modules/iam/api/admin-users.controller.ts`: `POST /api/admin/users`, `GET /api/admin/users`.
  - [x] Subtask 1.3.3.2 — Khung module `student`: `apps/api/src/modules/student/application/student.service.ts` export `createStudent()` để `iam` gọi, không ghi thẳng bảng `students`.
  - [x] Subtask 1.3.3.3 — `apps/api/src/db/seed/dev-seed.ts`; `apps/api/test/helpers/auth.ts` (`loginAs`) và `apps/api/test/helpers/fixtures.ts` (hai công ty, hai sinh viên).
- [x] **TASK-1.3.4** — `DESIGN.md` và `shadcn init` (AC: 9, 10)
  - [x] Subtask 1.3.4.1 — Viết `DESIGN.md` theo skill `shadcn` (`.agents/skills/shadcn/`) và AC-9.
  - [x] Subtask 1.3.4.2 — Hỏi người dùng Radix hay Base UI; ghi CONTEXT D-N; chạy `shadcn init` trong `apps/web`; ghi token vào CSS theo `DESIGN.md`.
- [x] **TASK-1.3.5** — Đọc `DESIGN.md` trước khi code giao diện; ghi dòng `Design applied: …` vào *Implementation notes* của story này (AC: 9, 11, 12, 13)
- [x] **TASK-1.3.6** — Khung ba cổng và trang đăng nhập (AC: 4, 11, 12, 13)
  - [x] Subtask 1.3.6.1 — `packages/shared/schemas/auth.ts` (schema form đăng nhập) và `packages/shared/schemas/portal.ts` (`portalForRole`).
  - [x] Subtask 1.3.6.2 — `apps/web/src/app/router.tsx`, `apps/web/src/app/layouts/` (layout `/sv`, `/hr`, `/admin`), route guard theo vai trò.
  - [x] Subtask 1.3.6.3 — `apps/web/src/shared/api/`: API client sinh từ OpenAPI (công cụ chờ chốt), interceptor tự refresh một lần.
  - [x] Subtask 1.3.6.4 — `apps/web/src/features/auth/login-page.tsx`.
- [x] **TASK-1.3.7** — OpenAPI cho API (AC: 12)
  - [x] Subtask 1.3.7.1 — @nestjs/swagger + nestjs-zod sinh tài liệu OpenAPI từ Zod schema; script xuất file OpenAPI để web sinh client.

## Dev notes

### Architecture constraints

- [AD-14](../../ARCHITECTURE.md#architecture-decisions): shadcn/ui + Tailwind CSS. Không dùng Ant Design hay thư viện component khác. Component sinh bằng CLI vào `apps/web/src/components/ui/` và được sửa trực tiếp.
- ARCH › *Security architecture*: access token 15 phút; refresh token trong cookie httpOnly; bốn vai trò `CENTER`, `STUDENT`, `HR`, `ADMIN`; kiểm tra cấp bản ghi đặt trong service (ARCH › *Thư viện chính*), không dựa vào việc ẩn nút ở giao diện.
- AGENTS › Nguyên tắc 2: phân quyền không dùng LLM.
- AGENTS › Nguyên tắc 7: HR chỉ thấy dữ liệu thuộc JD của công ty mình; sinh viên chỉ thấy dữ liệu của mình. Helper ở AC-6 là cơ chế chung; mỗi story có endpoint mới tự thêm test IDOR (EPIC-1 › *Cross-cutting invariants*).
- AGENTS › Nguyên tắc 13: `iam` tạo bản ghi sinh viên qua `StudentService` đã export của module `student`, không ghi thẳng bảng `students`.
- AGENTS › Nguyên tắc 14: schema form đăng nhập và hàm `portalForRole` đặt ở `packages/shared`.
- Story này không sinh migration. Bảng `users`, `students` và hằng `ROLES` có từ US-1.2. Theo [sprints/README › Chạy song song](../README.md), story này rebase lên US-1.2 trước khi merge.
- **Đề xuất, cần hỏi trước khi chốt:**
  - Quy ước mã lỗi: sai vai trò trả `403`; bản ghi ngoài phạm vi trả `404` để không lộ sự tồn tại. Các story sau dùng chung quy ước này.
  - Băm mật khẩu bằng `scrypt` của `node:crypto`. Danh sách thư viện ở ARCH không có bcrypt hay argon2.
  - Đọc cookie: ARCH không có `cookie-parser`. Đề xuất tự đọc header `Cookie` ở endpoint refresh; muốn thêm `cookie-parser` thì hỏi trước.
  - Lưu refresh token: ghi `jti` vào Redis với TTL bằng thời hạn refresh, để thu hồi và chống dùng lại. Key `auth:refresh:{jti}` chưa có ở ARCH › *Redis*; cần bổ sung ARCH khi chốt. Thời hạn refresh token chưa có trong spec; đề xuất 7 ngày.
  - Cổng của `ADMIN`: ARCH có ba cổng (Sinh viên, HR, Trung tâm) cho bốn vai trò. Đề xuất `ADMIN` dùng chung `/admin/*` với `CENTER`, menu khác nhau.
  - Cách cấp tài khoản sinh viên khi không có SSO chưa có trong spec. Đề xuất: `ADMIN` tạo từng tài khoản (AC-7), demo dùng seed. Phần "sinh viên tự khai, Trung tâm kiểm tra" ở PRD GĐ2 bước 2 chưa có story nào nhận.
  - Công cụ sinh API client: ARCH ghi "orval hoặc openapi-typescript". Hỏi trước khi chọn.
  - Nền của shadcn (Radix hay Base UI): câu hỏi mở ở ARCH › *Open architecture questions*. Hỏi trước khi chạy `shadcn init`, không tự chốt.
- Epic ghi AC "HR không đọc được JD của công ty khác" cho story này, nhưng endpoint JD thuộc US-1.5. Story này chứng minh cơ chế bằng resource kiểm thử (AC-6). Test trên JD thật nằm ở US-1.5.

### Cross-story dependencies

- Builds on [US-1.1](US-1.1-scaffold-monorepo-docker-compose-ci.md): khung `apps/web/src/app/`, cấu hình Jest và testcontainers ở `apps/api/test/`.
- Builds on [US-1.2](US-1.2-core-db-schema-transition-audit-log.md) (cùng tuần T2): bảng `users`, `students`, hằng `ROLES` trong `packages/shared/schemas/roles.ts`.
- Required by [US-1.4](US-1.4-campaign-setup-and-config.md), [US-1.5](US-1.5-company-hr-accounts-jd-posting-approval.md), [US-1.6](US-1.6-data-consent-and-cv-upload.md), [US-1.7](US-1.7-notifications-sse-email-reminders.md): dùng `@Roles()`, `record-access.ts`, `loginAs`, layout ba cổng và `DESIGN.md`.
- Required by [US-5.3](US-5.3-hr-nomination-review.md) và [US-5.4](US-5.4-interviews-reserve-and-offers.md): test IDOR cho HR dùng `loginAs` và fixture hai công ty (EPIC-5 › *Cross-story testing requirements*).
- Required by mọi story có giao diện: đọc `DESIGN.md`, ghi `Design applied:` (cổng `design-first` của koni-harness kiểm tra dòng này).

### Performance budget

- Access token hết hạn sau 15 phút; refresh token chỉ nằm trong cookie httpOnly (EPIC-1 › *Performance budgets & invariants*). Kiểm chứng ở AC-1, AC-4.
- Guard xác thực và phân quyền chạy trên mọi request nhưng không truy vấn DB: vai trò và `company_id`/`student_id` lấy từ access token. Kiểm tra cấp bản ghi dùng chính truy vấn đọc bản ghi đó, không thêm truy vấn riêng.

### What we explicitly did NOT do

- Không thu hồi cả chuỗi refresh token khi phát hiện token cũ bị dùng lại; token dùng lại chỉ bị từ chối (AC-3). Trigger: review bảo mật yêu cầu, hoặc trước khi mở demo ra ngoài ([CONTEXT D25](../../CONTEXT.md)).
- Cookie refresh luôn `Secure` (AC-1), nên mở web qua HTTP bằng IP LAN thì tải lại trang sẽ mất phiên; trên `localhost` thì không sao. Không thêm chế độ tắt `Secure`. Trigger: cần demo trên điện thoại thật thì dựng HTTPS (DEPLOY.md).
- Không tách bundle web theo route (hiện 692 kB, gzip 217 kB). Trigger: đo NFR hiệu năng của cổng sinh viên ở US-6.6.
- Không làm SSO OIDC của trường. Ngoài phạm vi theo CONTEXT D20. Trigger xem lại: giảng viên hướng dẫn yêu cầu, khi đó cột `users.sso_subject` ở ARCH được thêm.
- Không làm quên mật khẩu, đặt lại mật khẩu qua email. Spec chưa có. Trigger: người dùng thật cần tự đặt lại.
- Không giới hạn số lần đăng nhập sai. ARCH chỉ nêu giới hạn tần suất cho phòng thi. Trigger: review bảo mật (skill koni-qc) yêu cầu, hoặc trước khi mở demo ra ngoài.
- Không nhập danh sách sinh viên hàng loạt. Trigger: chốt cách cấp tài khoản sinh viên.
- Không làm màn nghiệp vụ nào trong ba cổng. Mỗi màn thuộc story của nó.

### References

- [Source: PRD › Functional Requirements (FR-1)](../../PRD.md#functional-requirements)
- [Source: PRD › Non-Functional Requirements (NFR-1, NFR-13)](../../PRD.md#non-functional-requirements)
- [Source: PRD › Personas](../../PRD.md#personas)
- [Source: ARCHITECTURE › Security architecture](../../ARCHITECTURE.md#security-architecture)
- [Source: ARCHITECTURE › Component architecture › Frontend; Core Backend › Thư viện chính](../../ARCHITECTURE.md#component-architecture)
- [Source: ARCHITECTURE › Open architecture questions](../../ARCHITECTURE.md#open-architecture-questions)
- [Source: CONTEXT D14, D20](../../CONTEXT.md)
- [Source: skill shadcn](../../../.agents/skills/shadcn/SKILL.md)

## Verification commands

Chạy tại gốc repo sau `nvm use` và `pnpm install`. Integration test cần Docker (testcontainers khởi động PostgreSQL và Redis).

| AC | Command |
|---|---|
| AC-1 | `pnpm --filter @srm/api exec jest --selectProjects integration --testPathPatterns auth.int-spec` › "FR-1: login returns 15-minute access token and httpOnly refresh cookie" |
| AC-2 | `auth.int-spec.ts` › "FR-1: unknown email and wrong password return the same 401" |
| AC-3 | `auth.int-spec.ts` › "FR-1: refresh rotates token and reused refresh token returns 401"; "FR-1: logout revokes refresh token" |
| AC-4 | `auth.int-spec.ts` › "FR-1: expired access token returns 401" (phía API); phía web: kiểm tay (bên dưới) |
| AC-5 | `pnpm --filter @srm/api exec jest --selectProjects integration --testPathPatterns route-guards` › "NFR-1: every route declares @Roles or @Public"; "NFR-1: wrong role returns 403" |
| AC-6 | `pnpm --filter @srm/api exec jest --selectProjects integration --testPathPatterns record-access` › "BR-11: HR of company A gets 404 on company B record"; "NFR-1: student X gets 404 on student Y record"; unit `src/common/auth/record-access.spec.ts` |
| AC-7 | `pnpm --filter @srm/api exec jest --selectProjects integration --testPathPatterns admin-users` › "FR-1: admin creates CENTER, ADMIN, STUDENT accounts; HR is rejected with 422; duplicate email returns 409; non-admin gets 403" |
| AC-8 | `admin-users.int-spec.ts` › "dev seed is idempotent"; `rg -l "loginAs\(" apps/api/test/integration` ra ít nhất 3 file (hiện 4) |
| AC-9 | `test -f DESIGN.md && grep -cE "^## " DESIGN.md` ≥ 6 (hiện 12); reviewer đối chiếu danh sách mục ở AC-9 |
| AC-10 | `test -f apps/web/components.json`; `grep -n "shadcn" docs/CONTEXT.md` ra D26 |
| AC-11 | `pnpm --filter @srm/shared test` › "FR-1: each role maps to exactly one portal"; kiểm tay: đăng nhập bằng 4 tài khoản seed, mở chéo `/hr` bằng tài khoản sinh viên |
| AC-12 | `pnpm --filter @srm/shared test` › "FR-1: login schema rejects malformed email"; `auth.int-spec.ts` › "rejects a malformed login body with 400 without echoing the input" (API dùng cùng schema); kiểm tay 3 trạng thái của form |
| AC-13 | Kiểm tay ở chế độ thiết bị 360 px (thiết bị cảm ứng) theo checklist [DESIGN.md](../../../DESIGN.md) §5; E2E di động thuộc US-6.6 |

Toàn bộ: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm depcruise && pnpm depcruise:fixture`; `pnpm api:sync` không làm đổi `apps/web/src/shared/api/`.

**Kiểm tay (AC-4, AC-11, AC-12, AC-13)** — dựng hệ thống, seed, mở `http://localhost:8080` (hoặc Vite `:5173`), mật khẩu seed `Srm-Dev-12345`:

1. Đăng nhập lần lượt `sv001@`, `hr.alpha@`, `center@`, `admin@srm.local`: vào đúng `/sv`, `/hr`, `/admin`, `/admin`; menu của `center` và `admin` khác nhau.
2. Bằng tài khoản sinh viên mở `/hr` và `/admin/users`: bị chuyển về `/sv`. Đăng xuất rồi mở `/sv/results`: về `/login`, đăng nhập xong quay lại `/sv/results`.
3. Form: bấm "Đăng nhập" khi để trống (lỗi trường), nhập sai mật khẩu (lỗi đăng nhập trong `Alert`), quan sát nút có Spinner khi đang gửi.
4. Tải lại trang khi đang đăng nhập: vẫn giữ phiên. Xóa cookie `srm_refresh` (DevTools › Application › Cookies) rồi tải lại: về `/login`.
5. AC-4 phía web: trang chủ của mỗi cổng gọi `GET /api/me` qua client. Đăng nhập, để tab mở hơn 15 phút, chuyển sang mục khác rồi về "Trang chủ"/"Tổng quan": trang vẫn hiện, tab Network thấy `/api/me` 401 → `/api/auth/refresh` 200 → `/api/me` 200. Làm lại sau khi xóa cookie `srm_refresh`: về `/login`.
6. DevTools, chế độ thiết bị 360 px có cảm ứng: cổng `/sv` không cuộn ngang, có thanh điều hướng dưới, nút và ô nhập cao 44 px; `/hr` dưới 768 px mở menu dạng sheet.

## Changelog entry

Mục thật nằm ở [CHANGELOG › 0.2.0](../../CHANGELOG.md). Tóm tắt:

### Added
- Đăng nhập bằng email và mật khẩu: access token JWT 15 phút, refresh token xoay vòng trong cookie httpOnly, đăng xuất thu hồi token.
- Phân quyền theo vai trò `CENTER`, `STUDENT`, `HR`, `ADMIN`: guard mặc định từ chối, `@Roles()`, helper kiểm tra quyền trên từng bản ghi.
- Quản trị tạo tài khoản Trung tâm, Quản trị, Sinh viên; seed dữ liệu dev; helper `loginAs` cho test phân quyền.
- `DESIGN.md` và shadcn/ui; khung ba cổng `/sv`, `/hr`, `/admin` và trang đăng nhập tiếng Việt, cổng sinh viên dùng được trên điện thoại.

**Commit**: 340e62e

## Implementation notes

**2026-10-08 — nhánh `us-1.3`.** Plan đã duyệt; các quyết định chốt với người dùng ở *Story refresh* và [CONTEXT D25, D26](../../CONTEXT.md).

Design applied: DESIGN.md §2 (token, tương phản §11), §5 (360 px, vùng chạm 44 px), §6 (primitive), §7 (bốn trạng thái: `FullPageSpinner`, `Empty`, `Alert`), §8 (form đăng nhập), §9 (chuỗi tiếng Việt), §12 (khung ba cổng, menu theo vai trò) — áp cho `apps/web/src/app/` và `apps/web/src/features/auth/login-page.tsx`.

Lessons: §8 mới — CLI shadcn 4.21 không nhận preset `radix-nova` và tự thêm gói bằng dải `^` bản mới nhất.

- **API.** `common/auth` có `AccessGuard` (một `APP_GUARD`: `@Public` → token → `@Roles`), `AccessTokenService` (bọc `JwtService`, HS256, kiểm claims bằng Zod), decorator và `record-access.ts`. `common/auth` không import `modules/iam`; `iam` dùng `common`. Module `iam` (`domain/password.ts`, `infrastructure/refresh-token.store.ts`, `application/auth.service.ts`, `application/admin-users.service.ts`, `api/`) và `student` (`StudentService.createStudent(tx, …)` trong giao dịch của phía gọi). `RedisModule` global, `lazyConnect`.
- **Validate và lỗi.** Pipe global bọc `createZodValidationPipe` của nestjs-zod với `strictSchemaDeclaration` (body/query/params không có DTO Zod thì lỗi 500), bỏ qua tham số `custom` như `@CurrentUser()`. Một filter `ApiExceptionFilter` cho mọi lỗi HTTP. Lỗi unique do Drizzle bọc lại nên đọc `err.cause` (`db/errors.ts`).
- **Env.** `AppModule` không còn gọi `loadEnv()` lúc import (`LoggerModule.forRootAsync`); `configureApp` dùng chung cho `main.ts`, test và `openapi:export`. `JWT_ACCESS_SECRET` từ chối giá trị `change-me…`.
- **Test.** Global setup chạy song song PostgreSQL và Redis (`redis:7.4-alpine`, cùng tag với compose). `test/helpers/auth.ts`: `createAuthTestApp({ controllers?, imports? })` trả `{ app, db, http, createLoginUser, loginAs, close }`; `loginAs(role, { companyId?, studentId? })` trả `{ agent, user, accessToken }`. Mật khẩu test băm một lần cho mỗi worker. Supertest không gửi cookie `Secure` qua http, nên test refresh tự đặt header `Cookie`. Đã thử đột biến: bỏ `@Roles('ADMIN')` khỏi `AdminUsersController` thì "every route declares @Roles or @Public" đỏ.
- **Web.** Tailwind 4 + shadcn (nền Radix, `--base radix --preset nova`, LESSONS §8), alias `@/*` không dùng `baseUrl` (TS 6). Token sửa so với preset: `primary` xanh, `muted-foreground` và `input` đậm hơn để đạt tương phản (DESIGN.md §11). Primitive đã sửa: `button`/`input` (`pointer-coarse:` 44 px), `sonner` (bỏ `next-themes`), `use-mobile` (`useSyncExternalStore`), `spinner`/`sheet`/`sidebar` (chuỗi trợ năng tiếng Việt). Access token chỉ trong bộ nhớ; khi tải trang gọi refresh một lần; middleware openapi-fetch refresh một lần khi gặp 401 rồi gửi lại; một promise refresh cho cả tab và Web Lock giữa các tab (refresh token xoay vòng nên hai lần refresh song song sẽ đá nhau). Sau đăng nhập, nhánh `authenticated` của `LoginPage` là chỗ duy nhất điều hướng. Trang chủ mỗi cổng gọi `GET /api/me` qua client (để đường refresh-một-lần có chỗ chạy) và là mẫu bốn trạng thái §7 cho story sau.
- **OpenAPI.** `pnpm api:sync` = build shared → `openapi:export` (dựng app không `listen`, env giả) → `openapi-typescript`. `openapi.json` và `schema.d.ts` được commit; CI kiểm không lệch. Lần chạy lại cho cùng checksum.
- **Kiểm đã chạy.** `pnpm typecheck`, `pnpm lint`, `pnpm test` (shared 18, api 80), `pnpm build`, `pnpm depcruise`, `pnpm depcruise:fixture` đều qua. Compose: `up -d --build --wait` healthy cả 8 service; seed vào DB compose; qua nginx `:8080`: đăng nhập trả cookie đúng cờ, `/api/me` 200, sinh viên gọi `/api/admin/users` 403, email sai và mật khẩu sai cùng body 401, refresh bằng cookie 200, các route SPA 200, `/api/docs` 404 ở production; log API che `cookie`/`set-cookie` thành `[Redacted]`, không có token hay mật khẩu.
- **Review (`/code-review`).** Đã sửa: khóa JWT mẫu qua được kiểm tra env; `verifyPassword` chưa chặn `r`/`p`/`N` lạ (có thể ném lỗi hoặc chạy rất lâu); lỗi không phải lỗi miền trả body khác `ApiError`; điều hướng sau đăng nhập có thể mất trang định mở; `from` có query string bị bỏ; kiểm tra trùng với schema trong `AdminUsersService`. Ghi vào *What we explicitly did NOT do*: thu hồi cả chuỗi refresh token khi thấy token cũ bị dùng lại; cookie `Secure` trên HTTP qua IP LAN. Để sau: clone mọi request để gửi lại (ghi chú trong `client.ts`), gom các lần `loadEnv()` thành một provider.
- **Chưa xong.** AC-4 (phía web), AC-11, AC-12, AC-13 cần kiểm tay trong trình duyệt theo *Verification commands*; phiên làm việc này không có trình duyệt. Story ở `review` tới khi kiểm tay xong và CI xanh.

## Files modified

- `packages/shared/schemas/`: `auth.ts`, `portal.ts`, `errors.ts` (mã lỗi mới), `index.ts`, `__tests__/auth.spec.ts`, `__tests__/portal.spec.ts`.
- `apps/api/src/`: `app.module.ts`, `app.setup.ts`, `main.ts`, `common/config/env.ts` (+ spec), `common/errors/` (`domain-error.ts`, `domain-error.filter.ts`, `api-exception.filter.ts` + spec, `index.ts`), `common/auth/` (`auth-user.ts`, `decorators.ts`, `access-token.service.ts`, `access.guard.ts`, `record-access.ts` + spec, `auth.module.ts`, `index.ts`), `common/validation/` (`zod-validation.pipe.ts`, `id-param.dto.ts`), `redis/redis.module.ts`, `db/errors.ts`, `db/seed/dev-seed.ts`, `openapi/export.ts`, `health/health.controller.ts`, `modules/iam/**` (mới), `modules/student/**` (mới).
- `apps/api/test/`: `setup/` (Redis), `helpers/auth.ts`, `helpers/fixtures.ts`, `helpers/factories.ts` (`createUser`), `integration/auth.int-spec.ts`, `route-guards.int-spec.ts`, `record-access.int-spec.ts`, `admin-users.int-spec.ts`.
- `apps/web/`: `components.json`, `package.json`, `tsconfig.json`, `tsconfig.app.json`, `vite.config.ts`, `src/index.css`, `src/main.tsx`, `src/app/**`, `src/components/ui/**` (16 primitive), `src/hooks/use-mobile.ts`, `src/lib/{utils,format}.ts`, `src/shared/api/**` (`openapi.json`, `schema.d.ts` sinh ra), `src/features/auth/login-page.tsx`.
- Gốc repo: `DESIGN.md` (mới), `VERSION`, `package.json` (`api:sync`, version), `eslint.config.mjs`, `pnpm-lock.yaml`, `.github/workflows/ci.yml` (bước OpenAPI), `deploy/docker-compose.yml`, `deploy/.env.example`, `DEPLOY.md`.
- Tài liệu: `docs/CONTEXT.md` (D25, D26), `docs/ARCHITECTURE.md`, `docs/LESSONS.md` (§8), `docs/SETUP.md`, `docs/CHANGELOG.md`, `docs/sprints/sprint-2026-W41.md`, story này.

## Cross-references

- [PRD FR-1, NFR-1, NFR-13](../../PRD.md#functional-requirements)
- [Epic EPIC-1](../epics/EPIC-1.md)
- [ARCHITECTURE AD-14](../../ARCHITECTURE.md#architecture-decisions)
- [CONTEXT D14, D20](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
- [`DESIGN.md`](../../../DESIGN.md) (tạo trong story này, ở gốc repo)
- [CONTEXT D25, D26](../../CONTEXT.md); [LESSONS §8](../../LESSONS.md)
