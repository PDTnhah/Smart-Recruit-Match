---
id: US-1.3
title: "Đăng nhập, phân quyền, DESIGN.md, khung giao diện"
epic: EPIC-1
status: backlog
priority: P0
points: 8
sprint:
version_shipped:
prd_ref: [FR-1, NFR-1, NFR-13]
arch_ref: [AD-14]
depends_on: [US-1.1]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Bốn vai trò (Cán bộ Trung tâm, Sinh viên, HR, Quản trị) đăng nhập được và chỉ vào được cổng của mình. Mỗi API kiểm tra cả vai trò lẫn quyền trên từng bản ghi. Story này cũng tạo `DESIGN.md` và chạy `shadcn init` trước màn hình đầu tiên, rồi dựng khung ba cổng `/sv`, `/hr`, `/admin`. Sau story này, story nào thêm endpoint chỉ cần gắn `@Roles()`, gọi helper kiểm tra quyền sở hữu và viết test IDOR bằng helper đăng nhập theo vai trò. Story nào thêm màn hình chỉ cần đọc `DESIGN.md` và đặt trang vào đúng cổng.

## Background

FR-1 yêu cầu đăng nhập, phân quyền theo vai trò và kiểm tra quyền cấp bản ghi (BR-11). NFR-1 yêu cầu mọi API kiểm tra vai trò và quyền cấp bản ghi. NFR-13 yêu cầu giao diện tiếng Việt, phần sinh viên dùng tốt trên điện thoại. PRD › *Personas* nêu nguyên tắc truy cập: HR chỉ thấy hồ sơ sinh viên được đề cử vào JD của công ty mình; sinh viên chỉ thấy điểm của chính mình.

ARCH › *Security architecture*: JWT với access token 15 phút, refresh token trong cookie httpOnly; RBAC bốn vai trò `CENTER`, `STUDENT`, `HR`, `ADMIN`; tài khoản HR do Trung tâm mời (US-1.5). ARCH › *Thư viện chính*: @nestjs/jwt + passport-jwt, guard `@Roles()` tự viết; kiểm tra cấp bản ghi đặt trong service.

AD-14 ([CONTEXT D14](../../CONTEXT.md)): shadcn/ui + Tailwind CSS thay cho Ant Design, vì phải khớp chuẩn review UI của quy trình koni. Design system ghi ở `DESIGN.md`, tạo trong EPIC-1 trước màn hình đầu tiên. Bỏ Ant Design nghĩa là mất locale tiếng Việt có sẵn: chuỗi giao diện tự viết bằng tiếng Việt, component ngày giờ dùng locale `vi` của date-fns. ARCH › *Frontend*: một SPA, điều hướng theo vai trò `/sv/*`, `/hr/*`, `/admin/*`, API client sinh từ OpenAPI.

SSO của trường qua OIDC là tùy chọn ở ARCH, và CONTEXT D20 đưa nó ra ngoài phạm vi. EPIC-1 › *Out of scope* hẹn chốt ở story này: không làm (xem *What we explicitly did NOT do*).

**Lessons applied**: none — LESSONS.md chỉ có §1 (nạp skill); story này dùng skill `shadcn`, nên kiểm tra liên kết `.claude/skills` đã có theo §1 trước khi bắt đầu.

## Acceptance criteria

- [ ] **AC-1** — **Given** một tài khoản đang hoạt động, **When** gửi email và mật khẩu đúng tới `POST /api/auth/login`, **Then** API trả access token JWT (hết hạn sau 15 phút, chứa `sub`, `role`, `company_id` hoặc `student_id` nếu có) **And** đặt refresh token trong cookie `httpOnly`, `Secure`, `SameSite=Strict`, chỉ gửi cho đường dẫn `/api/auth`. Mật khẩu chỉ lưu dạng băm, không bao giờ xuất hiện trong log hay response.
- [ ] **AC-2** — **Given** email không tồn tại hoặc mật khẩu sai, **When** gọi đăng nhập, **Then** API trả `401` với cùng một thông báo cho cả hai trường hợp (không lộ email nào đã có tài khoản).
- [ ] **AC-3** — **Given** refresh token hợp lệ, **When** gọi `POST /api/auth/refresh`, **Then** API trả access token mới và thay refresh token mới (refresh token cũ hết hiệu lực) **And** refresh token đã thu hồi, hết hạn hoặc dùng lại lần hai thì trả `401` và xóa cookie. `POST /api/auth/logout` thu hồi refresh token hiện tại.
- [ ] **AC-4** — **Given** access token đã hết hạn hoặc sai chữ ký, **When** gọi một API cần đăng nhập, **Then** API trả `401`. Web client tự gọi refresh một lần rồi gửi lại yêu cầu; refresh lỗi thì chuyển về `/login`.
- [ ] **AC-5** — **Given** API đã dựng xong, **When** chạy test duyệt mọi route qua discovery của NestJS, **Then** route nào không có `@Roles(...)` hoặc `@Public()` thì test đỏ (mặc định từ chối) **And** gọi route bằng vai trò không nằm trong `@Roles` thì nhận `403`.
- [ ] **AC-6** — **Given** HR của công ty A và một bản ghi thuộc công ty B (resource kiểm thử đăng ký riêng trong test), **When** HR của A đọc hoặc sửa bản ghi đó bằng ID, **Then** API trả `404` như khi bản ghi không tồn tại **And** sinh viên X đọc bản ghi của sinh viên Y cũng nhận `404`. Kiểm tra nằm trong service qua helper chung, không nằm ở controller.
- [ ] **AC-7** — **Given** người gọi có vai trò `ADMIN`, **When** tạo tài khoản `CENTER`, `ADMIN` hoặc `STUDENT` (kèm `student_code`, `full_name`, `major`, `cohort`, `gpa`), **Then** tài khoản được tạo **And** tạo tài khoản `HR` qua đường này bị từ chối `422` (HR chỉ vào qua lời mời ở US-1.5) **And** email trùng trả `409` **And** người gọi không phải `ADMIN` nhận `403`.
- [ ] **AC-8** — Script seed chỉ dùng cho môi trường dev/test tạo một tài khoản cho mỗi vai trò, cùng hai công ty, mỗi công ty một HR, và hai sinh viên. Chạy lại không tạo trùng. `apps/api/test/helpers/auth.ts` có `loginAs(role, options)` trả về agent Supertest đã gắn token, đủ để story sau viết test IDOR trong một dòng.
- [ ] **AC-9** — `DESIGN.md` ở gốc repo có trước màn hình đầu tiên và ghi: token màu ngữ nghĩa, chữ, khoảng cách, bo góc; danh sách primitive shadcn được dùng; bốn trạng thái bắt buộc của mọi màn (rỗng, đang tải, lỗi, có dữ liệu); quy tắc viết chuỗi tiếng Việt; định dạng ngày giờ bằng date-fns locale `vi`; breakpoint và quy tắc cho điện thoại ở cổng sinh viên; mức tương phản tối thiểu.
- [ ] **AC-10** — `apps/web/components.json` có sau khi chạy `shadcn init`. Lựa chọn nền Radix hay Base UI được hỏi người dùng trước khi chạy và ghi thành một mục D mới trong `docs/CONTEXT.md`. Token Tailwind khớp với `DESIGN.md`. Component sinh vào `apps/web/src/components/ui/`.
- [ ] **AC-11** — **Given** người dùng đã đăng nhập, **When** vào `/`, **Then** web chuyển tới cổng theo vai trò: `STUDENT` → `/sv`, `HR` → `/hr`, `CENTER` và `ADMIN` → `/admin` (menu khác nhau theo vai trò) **And** mở đường dẫn của cổng khác thì bị chuyển về cổng của mình **And** chưa đăng nhập thì về `/login`. Hàm ánh xạ vai trò → cổng là hàm thuần trong `packages/shared`, có unit test.
- [ ] **AC-12** — Form đăng nhập dùng React Hook Form + một Zod schema trong `packages/shared/schemas/`, chính schema này cũng validate request ở API (nestjs-zod). Form có đủ trạng thái: đang gửi, lỗi trường, lỗi đăng nhập. Mọi chuỗi bằng tiếng Việt.
- [ ] **AC-13** — Khung cổng sinh viên dùng được ở chiều rộng 360 px: không cuộn ngang, menu chuyển thành dạng sheet hoặc thanh dưới, vùng chạm theo kích thước ghi trong `DESIGN.md`.

## Tasks

- [ ] **TASK-1.3.1** — Module `iam`: đăng nhập, refresh, đăng xuất (AC: 1, 2, 3, 4)
  - [ ] Subtask 1.3.1.1 — `apps/api/src/modules/iam/domain/password.ts`: băm và so khớp bằng `scrypt` của `node:crypto` (không thêm thư viện).
  - [ ] Subtask 1.3.1.2 — `apps/api/src/modules/iam/application/auth.service.ts`: phát access token, xoay vòng refresh token, thu hồi khi đăng xuất.
  - [ ] Subtask 1.3.1.3 — `apps/api/src/modules/iam/api/auth.controller.ts`: `POST /api/auth/login`, `/refresh`, `/logout`, `GET /api/me`.
- [ ] **TASK-1.3.2** — Guard và kiểm tra cấp bản ghi dùng chung (AC: 5, 6)
  - [ ] Subtask 1.3.2.1 — `apps/api/src/common/auth/`: `JwtAuthGuard` và `RolesGuard` đăng ký global; decorator `@Roles()`, `@Public()`, `@CurrentUser()`.
  - [ ] Subtask 1.3.2.2 — `apps/api/src/common/auth/record-access.ts`: helper ném `NotFoundException` khi bản ghi không thuộc phạm vi của người gọi (công ty với HR, sinh viên với STUDENT).
  - [ ] Subtask 1.3.2.3 — `apps/api/test/integration/route-guards.int-spec.ts`: duyệt mọi route bằng `DiscoveryService`.
- [ ] **TASK-1.3.3** — Quản trị tài khoản và seed (AC: 7, 8)
  - [ ] Subtask 1.3.3.1 — `apps/api/src/modules/iam/api/admin-users.controller.ts`: `POST /api/admin/users`, `GET /api/admin/users`.
  - [ ] Subtask 1.3.3.2 — Khung module `student`: `apps/api/src/modules/student/application/student.service.ts` export `createStudent()` để `iam` gọi, không ghi thẳng bảng `students`.
  - [ ] Subtask 1.3.3.3 — `apps/api/src/db/seed/dev-seed.ts`; `apps/api/test/helpers/auth.ts` (`loginAs`) và `apps/api/test/helpers/fixtures.ts` (hai công ty, hai sinh viên).
- [ ] **TASK-1.3.4** — `DESIGN.md` và `shadcn init` (AC: 9, 10)
  - [ ] Subtask 1.3.4.1 — Viết `DESIGN.md` theo skill `shadcn` (`.agents/skills/shadcn/`) và AC-9.
  - [ ] Subtask 1.3.4.2 — Hỏi người dùng Radix hay Base UI; ghi CONTEXT D-N; chạy `shadcn init` trong `apps/web`; ghi token vào CSS theo `DESIGN.md`.
- [ ] **TASK-1.3.5** — Đọc `DESIGN.md` trước khi code giao diện; ghi dòng `Design applied: …` vào *Implementation notes* của story này (AC: 9, 11, 12, 13)
- [ ] **TASK-1.3.6** — Khung ba cổng và trang đăng nhập (AC: 4, 11, 12, 13)
  - [ ] Subtask 1.3.6.1 — `packages/shared/schemas/auth.ts` (schema form đăng nhập) và `packages/shared/schemas/portal.ts` (`portalForRole`).
  - [ ] Subtask 1.3.6.2 — `apps/web/src/app/router.tsx`, `apps/web/src/app/layouts/` (layout `/sv`, `/hr`, `/admin`), route guard theo vai trò.
  - [ ] Subtask 1.3.6.3 — `apps/web/src/shared/api/`: API client sinh từ OpenAPI (công cụ chờ chốt), interceptor tự refresh một lần.
  - [ ] Subtask 1.3.6.4 — `apps/web/src/features/auth/login-page.tsx`.
- [ ] **TASK-1.3.7** — OpenAPI cho API (AC: 12)
  - [ ] Subtask 1.3.7.1 — @nestjs/swagger + nestjs-zod sinh tài liệu OpenAPI từ Zod schema; script xuất file OpenAPI để web sinh client.

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

| AC | Command |
|---|---|
| AC-1 | `apps/api/test/integration/auth.int-spec.ts` › "FR-1: login returns 15-minute access token and httpOnly refresh cookie" |
| AC-2 | `auth.int-spec.ts` › "FR-1: unknown email and wrong password return the same 401" |
| AC-3 | `auth.int-spec.ts` › "FR-1: refresh rotates token and reused refresh token returns 401"; "FR-1: logout revokes refresh token" |
| AC-4 | `auth.int-spec.ts` › "FR-1: expired access token returns 401" |
| AC-5 | `apps/api/test/integration/route-guards.int-spec.ts` › "NFR-1: every route declares @Roles or @Public"; "NFR-1: wrong role returns 403" |
| AC-6 | `apps/api/test/integration/record-access.int-spec.ts` › "BR-11: HR of company A gets 404 on company B record"; "NFR-1: student X gets 404 on student Y record" |
| AC-7 | `apps/api/test/integration/admin-users.int-spec.ts` › "FR-1: admin creates CENTER, ADMIN, STUDENT accounts; HR is rejected with 422; duplicate email returns 409; non-admin gets 403" |
| AC-8 | `admin-users.int-spec.ts` › "dev seed is idempotent"; `rg -l "loginAs\(" apps/api/test/integration` ra ít nhất 3 file |
| AC-9 | `test -f DESIGN.md && grep -cE "^## " DESIGN.md` ≥ 6; reviewer đối chiếu danh sách mục ở AC-9 |
| AC-10 | `test -f apps/web/components.json`; `grep -n "shadcn" docs/CONTEXT.md` ra mục D mới ghi lựa chọn Radix/Base UI |
| AC-11 | `packages/shared/schemas/__tests__/portal.spec.ts` › "FR-1: each role maps to exactly one portal"; kiểm tay: đăng nhập bằng 4 tài khoản seed, mở chéo `/hr` bằng tài khoản sinh viên |
| AC-12 | `packages/shared/schemas/__tests__/auth.spec.ts` › "FR-1: login schema rejects malformed email"; kiểm tay 3 trạng thái của form |
| AC-13 | Kiểm tay ở chế độ thiết bị 360 px của trình duyệt theo checklist trong `DESIGN.md`; E2E di động thuộc US-6.6 |

Lệnh chạy: các file test trên chạy bằng script `pnpm test` / `pnpm --filter <package> test` do US-1.1 tạo; ghi lệnh đầy đủ vào bảng này khi US-1.1 xong (AGENTS › *Lệnh*).

## Changelog entry

### Added
- Đăng nhập bằng email và mật khẩu: access token JWT 15 phút, refresh token xoay vòng trong cookie httpOnly, đăng xuất thu hồi token.
- Phân quyền theo vai trò `CENTER`, `STUDENT`, `HR`, `ADMIN`: guard mặc định từ chối, `@Roles()`, helper kiểm tra quyền trên từng bản ghi.
- Quản trị tạo tài khoản Trung tâm, Quản trị, Sinh viên; seed dữ liệu dev; helper `loginAs` cho test phân quyền.
- `DESIGN.md` và shadcn/ui; khung ba cổng `/sv`, `/hr`, `/admin` và trang đăng nhập tiếng Việt, cổng sinh viên dùng được trên điện thoại.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-1, NFR-1, NFR-13](../../PRD.md#functional-requirements)
- [Epic EPIC-1](../epics/EPIC-1.md)
- [ARCHITECTURE AD-14](../../ARCHITECTURE.md#architecture-decisions)
- [CONTEXT D14, D20](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
- `DESIGN.md` (tạo trong story này, ở gốc repo)
