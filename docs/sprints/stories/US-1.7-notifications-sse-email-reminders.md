---
id: US-1.7
title: "Thông báo trong app, SSE, email, nhắc hạn"
epic: EPIC-1
status: review
priority: P1
points: 5
sprint: sprint-2026-W42
version_shipped: 0.6.0
prd_ref: [FR-8]
arch_ref: [AD-13]
depends_on: [US-1.2, US-1.3]
assignee: PDTnhah
commit:
created: 2026-10-07
updated: 2026-10-19
---

## Story refresh — 2026-10-19

Đọc lại story ngày 2026-10-19 trên nhánh `us-1.7`, tách từ `dev` sau khi US-1.6 merge (migration `0003` đã có, story này sinh `0004`, không cần rebase). Số AC giữ nguyên ([CONTEXT D31](../../CONTEXT.md)).

**Người dùng chốt các điểm mở ở *Dev notes*:**

- **Xác thực SSE:** client mở stream bằng `fetch` + `ReadableStream`, gửi `Authorization: Bearer` như mọi request; `AccessGuard` dùng nguyên. Không có endpoint vé, không có khóa Redis `sse:ticket:*`. Client tự tách khung SSE, không thêm thư viện.
- **Thời điểm nhắc:** tham số đợt `campaigns.config.reminder_hours_before`, mặc định 24 (1–168), khóa sau khi mở đợt như mọi tham số khác.
- **Cột outbox và chống trùng:** `channels`, `email_status`, `email_attempts`, `email_sent_at`, `email_last_error`, `dedupe_key` + unique `(user_id, dedupe_key)`.
- **Số lần thử email:** tối đa 3.
- **Kênh của từng sự kiện:** mọi sự kiện có thông báo trong app; email cho mở đợt, nhắc hạn, lời mời HR. `HR_INVITED` chỉ có email: HR chưa đăng nhập được, và link chứa token mời.

**Quyết định kỹ thuật:**

- Thêm cột `email_next_attempt_at` để lùi lần thử (1 phút, 5 phút, rồi `FAILED`). `email_status ∈ {PENDING, SENT, FAILED, CANCELLED}` là trạng thái gửi kỹ thuật, không đi qua `transitionTo`.
- `notify(input)` tự mở giao dịch và đẩy SSE sau commit. `notify(input, { tx })` ghi trong giao dịch của caller và trả `PendingNotifications`; caller gọi `push(pending)` sau commit (cùng mẫu với `emitSafely`).
- Mời lại HR: email `HR_INVITED` còn `PENDING` của user đó chuyển `CANCELLED` trong cùng giao dịch với email mới.
- Địa chỉ email lấy lúc gửi qua `UserDirectory` (service mới của `iam`). Người nhận theo đối tượng đợt: `StudentService.listIdsInTarget` lọc bằng cùng hàm `isInTarget` mà `canSeeCampaign` dùng.
- Template Handlebars viết trong file `.ts` (`templates/*.ts`), không phải `.hbs`: `tsc` không chép `.hbs` sang `dist`.
- Biến môi trường mới: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `WEB_ORIGIN`.
- Danh sách phân trang theo con trỏ `?before=<id>&limit=` và chỉ trả dòng có kênh `IN_APP`.
- `dedupe_key`: `campaign_opened:{campaignId}`; `deadline:{campaignId}:intake_end:{deadline ISO}` (gia hạn mốc là một hạn mới).

## Story refresh — 2026-10-13 (từ US-1.5)

Ghi lúc US-1.5 làm xong. Khi bắt đầu story này, đọc lại ([CONTEXT D28, D29](../../CONTEXT.md)).

- **Sự kiện `hr.invited`** (export từ `modules/iam`): `{ userId, companyId, email, fullName, invitationPath, expiresAt }`.
  - `invitationPath` là đường dẫn tương đối `/accept-invitation#<token>`. Email phải ghép địa chỉ web vào trước; cần một biến cấu hình mới, ghi theo RULE-11.
  - Mỗi lần mời lại phát một sự kiện mới, và link cũ hết hiệu lực. Email chỉ được gửi link của sự kiện mới nhất.
- **`jd.submitted`, `jd.approved`** (export từ `modules/company`) chưa có thông báo nào trong PRD › *Thông báo*.

## Goal

Người dùng nhận thông báo theo sự kiện nghiệp vụ: trong ứng dụng ngay lúc sự kiện xảy ra (qua Server-Sent Events) và qua email. Hệ thống tự nhắc trước các hạn quan trọng. Sau story này, module nào cần báo tin chỉ cần gọi một service đã export hoặc phát sự kiện. Việc lưu, đẩy xuống trình duyệt, gửi email, thử lại khi lỗi và chống gửi trùng do module `notification` lo. Kênh SSE này cũng là kênh mà EPIC-2 dùng để báo tiến độ job AI và US-3.4 dùng để đẩy mức cạnh tranh.

## Background

FR-8 (UC-35) yêu cầu thông báo trong ứng dụng và email theo sự kiện nghiệp vụ, kèm nhắc hạn tự động. PRD › *Thông báo* liệt kê sự kiện và người nhận. Trong phạm vi EPIC-1 có các sự kiện: mở đợt; sắp hết hạn nộp CV; lời mời HR (để US-1.5 gửi được email mời). Các sự kiện còn lại của bảng (hồ sơ năng lực sẵn sàng, yêu cầu JD sẵn sàng, kết quả test, công bố đề cử, SLA, lịch và kết quả phỏng vấn, lời mời thực tập) do story của từng giai đoạn gọi service ở đây.

AD-13 ([CONTEXT D13](../../CONTEXT.md)): dùng SSE (`GET /api/events/stream`), Redis pub/sub khi chạy nhiều instance. WebSocket bị loại vì dữ liệu chỉ đi một chiều từ server. ARCH › *Các module*: module `notification` gồm email (nodemailer + template Handlebars), thông báo trong app, SSE (`@Sse()` của NestJS). ARCH › *Tác vụ định kỳ*: email được ghi vào bảng `notifications` trước (outbox) rồi gửi bằng tác vụ nền, gửi lỗi thì thử lại; tác vụ định kỳ dùng `pg_try_advisory_lock`. Môi trường dev bắt email bằng Mailpit (ARCH › *Docker Compose*). ARCH › *Những chỗ cố ý KHÔNG dùng LLM* có "SLA, nhắc hạn".

Story được đưa lên T4 (CONTEXT D20) vì US-3.4 và US-5.2 cần nó.

**Lessons applied**: §6 (migration `0004` sinh sau khi US-1.6 merge; `migrations-journal.spec.ts`), §7 (hàm Drizzle khai kiểu bảng cụ thể), §8 (ghim bản chính xác khi thêm gói), §9 (kiểm `npm view <gói> type` cho `nodemailer`, `handlebars` trước khi cài; chạy cả integration test), §11 (timeout của integration test qua `setupFilesAfterEnv`), §12 (`FOR UPDATE SKIP LOCKED` trên câu không join).

## Acceptance criteria

- [x] **AC-1** — Module `notification` export `NotificationService.notify({ userIds, type, payload, channels })`. `type` và `payload` được kiểm bằng Zod schema dạng union theo `type` trong `packages/shared/schemas/notification.ts`. **Given** caller truyền giao dịch của mình, **When** gọi `notify`, **Then** các dòng `notifications` được ghi trong cùng giao dịch đó: nghiệp vụ rollback thì thông báo cũng không còn **And** `type` hoặc `payload` sai schema thì ném lỗi, không ghi gì.
- [x] **AC-2** — **Given** người dùng đã đăng nhập (mọi vai trò), **When** gọi `GET /api/notifications`, **Then** chỉ nhận thông báo của mình, mới nhất trước, có phân trang và số chưa đọc **And** `POST /api/notifications/{id}/read` và `POST /api/notifications/read-all` đặt `read_at` **And** đánh dấu đã đọc thông báo của người khác thì trả `404`.
- [x] **AC-3** — **Given** người dùng A đang mở `GET /api/events/stream` trên instance 1, **When** một thông báo cho A được tạo ở instance 2, **Then** A nhận sự kiện SSE (qua Redis pub/sub) mà không phải tải lại trang **And** người dùng B không nhận sự kiện của A **And** mở stream khi chưa xác thực thì nhận `401` **And** server gửi heartbeat định kỳ để proxy không cắt kết nối **And** khi kết nối lại, client tải lại danh sách nên không mất thông báo (thông báo đã được lưu ở DB).
- [x] **AC-4** — **Given** một thông báo có kênh email, **When** tác vụ nền gửi outbox chạy, **Then** email được gửi qua nodemailer bằng template Handlebars tiếng Việt (môi trường dev: thấy trong Mailpit) và thời điểm gửi được ghi lại **And** SMTP lỗi thì tăng số lần thử và thử lại về sau, quá số lần tối đa thì đánh dấu thất bại và ghi log **And** SMTP lỗi không làm hỏng giao dịch nghiệp vụ đã tạo thông báo **And** hai instance chạy cùng lúc không gửi trùng một email.
- [x] **AC-5** — **Given** các sự kiện của EPIC-1, **When** sự kiện được phát qua `@nestjs/event-emitter`, **Then** `campaign.opened` (US-1.4) tạo thông báo "Mở đợt" trong app và qua email cho sinh viên thuộc đối tượng của đợt **And** `hr.invited` (US-1.5) gửi email chứa đường dẫn mời cho HR được mời.
- [x] **AC-6** — **Given** đợt ở `INTAKE` và còn trong khoảng nhắc trước `intake_end`, **When** tác vụ nhắc hạn chạy, **Then** sinh viên thuộc đối tượng của đợt mà chưa có CV hiệu lực nhận thông báo "Sắp hết hạn nộp CV" (trong app và email) **And** chạy lại tác vụ, hoặc chạy trên hai instance, không nhắc trùng cùng một người cho cùng một hạn **And** sinh viên đã nộp CV không nhận nhắc **And** tác vụ không gọi LLM. Cơ chế nhắc cho phép story sau đăng ký thêm hạn (chọn NV ở US-3.3, làm test ở US-4.3, SLA của HR ở US-5.3).
- [ ] **AC-7** — Khung của cả ba cổng có biểu tượng chuông kèm số chưa đọc, cập nhật theo SSE; mở ra danh sách thông báo (dạng sheet trên điện thoại) có nút đánh dấu đã đọc; bấm vào thông báo thì đi tới trang liên quan. Chuỗi tiếng Việt, ngày giờ theo date-fns locale `vi`, đủ bốn trạng thái theo `DESIGN.md`.

## Tasks

- [x] **TASK-1.7.1** — Bảng và service thông báo (AC: 1, 2)
  - [x] Subtask 1.7.1.1 — Drizzle schema `apps/api/src/db/schema/notifications.ts` theo ARCH (`id`, `user_id`, `type`, `payload`, `read_at`, index `(user_id, read_at)`) cùng các cột outbox và chống trùng ở *Dev notes*; migration.
  - [x] Subtask 1.7.1.2 — `packages/shared/schemas/notification.ts`: union theo `type`.
  - [x] Subtask 1.7.1.3 — `apps/api/src/modules/notification/application/notification.service.ts`; `api/notification.controller.ts` (`GET /api/notifications`, `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all`).
- [x] **TASK-1.7.2** — SSE (AC: 3)
  - [x] Subtask 1.7.2.1 — `apps/api/src/modules/notification/api/events.controller.ts`: `@Sse()` cho `GET /api/events/stream`, lọc theo `user_id`, heartbeat.
  - [x] Subtask 1.7.2.2 — `apps/api/src/modules/notification/infrastructure/redis-pubsub.ts`: publish khi tạo thông báo (sau khi giao dịch commit), subscribe kênh theo người dùng bằng ioredis.
  - [x] Subtask 1.7.2.3 — Xác thực stream theo cách được chốt (xem *Dev notes*).
- [x] **TASK-1.7.3** — Email outbox (AC: 4, 5)
  - [x] Subtask 1.7.3.1 — `apps/api/src/modules/notification/infrastructure/mailer.ts`: nodemailer, cấu hình SMTP từ biến môi trường (Mailpit khi dev).
  - [x] Subtask 1.7.3.2 — `apps/api/src/modules/notification/templates/*.hbs`: template tiếng Việt cho `campaign_opened`, `hr_invited`, `deadline_reminder`. *(Làm ở `templates/templates.ts`, không dùng `.hbs`: D31.)*
  - [x] Subtask 1.7.3.3 — `apps/api/src/modules/notification/application/email-outbox.worker.ts`: lấy dòng chờ gửi bằng `FOR UPDATE SKIP LOCKED`, gửi, ghi kết quả, thử lại.
- [x] **TASK-1.7.4** — Nghe sự kiện và nhắc hạn (AC: 5, 6)
  - [x] Subtask 1.7.4.1 — `apps/api/src/modules/notification/application/listeners/`: `campaign.opened`, `hr.invited`; lấy người nhận qua `CampaignService` và `StudentService` đã export.
  - [x] Subtask 1.7.4.2 — `apps/api/src/modules/notification/application/deadline-reminder.scheduler.ts`: `@nestjs/schedule` + `pg_try_advisory_lock`, đọc giờ qua `Clock` của US-1.4 (`apps/api/src/common/clock/`); giao diện đăng ký nguồn nhắc hạn; nguồn đầu tiên là hạn nộp CV.
- [x] **TASK-1.7.5** — Đọc `DESIGN.md` trước khi code giao diện; ghi dòng `Design applied: …` vào *Implementation notes* (AC: 7)
- [x] **TASK-1.7.6** — Giao diện thông báo (AC: 7)
  - [x] Subtask 1.7.6.1 — `apps/web/src/shared/notifications/`: hook SSE dùng chung (EPIC-2, US-3.4 dùng lại), chuông và danh sách; gắn vào layout ba cổng của US-1.3.
- [x] **TASK-1.7.7** — Test (AC: 1–6)
  - [x] Subtask 1.7.7.1 — Integration test với PostgreSQL, Redis thật (testcontainers); SMTP giả cho test lỗi; hai app instance trong cùng test cho AC-3, AC-4, AC-6.

## Dev notes

### Architecture constraints

- [AD-13](../../ARCHITECTURE.md#architecture-decisions): SSE qua `GET /api/events/stream`, Redis pub/sub khi chạy nhiều instance. Không dùng WebSocket hay Socket.IO. nginx đã tắt `proxy_buffering` cho đường dẫn này ở US-1.1.
- ARCH › *Tác vụ định kỳ*: email qua outbox trong bảng `notifications`, tác vụ nền gửi và thử lại; scheduler dùng `pg_try_advisory_lock`. Không gửi email ngay trong request nghiệp vụ.
- ARCH › *Những chỗ cố ý KHÔNG dùng LLM* và AGENTS › Nguyên tắc 2: nhắc hạn và SLA không dùng LLM.
- AGENTS › Nguyên tắc 7: người dùng chỉ đọc và chỉ nhận qua SSE thông báo của mình.
- AGENTS › Nguyên tắc 13: `notification` không truy vấn bảng `campaigns`, `students`, `cvs`; người nhận lấy qua `CampaignService`, `StudentService` đã export. Module khác báo tin bằng `NotificationService.notify` hoặc phát sự kiện.
- AGENTS › Nguyên tắc 14: schema `type`/`payload` của thông báo đặt ở `packages/shared` để web hiển thị đúng.
- Biến môi trường mới (SMTP host, cổng, người gửi) phải ghi ở `docs/SETUP.md`, `DEPLOY.md`, `.env.example` trong cùng commit (RULE-11).
- **Những chỗ spec thiếu, cần hỏi trước khi chốt:**
  - **Xác thực SSE.** `EventSource` của trình duyệt không gửi được header `Authorization`, trong khi access token (US-1.3) nằm trong bộ nhớ của client. Đề xuất: `POST /api/events/ticket` cấp vé dùng một lần, sống 30 giây, lưu Redis ở key `sse:ticket:{ticket}`; client mở `GET /api/events/stream?ticket=…`. Key này chưa có ở ARCH › *Redis*.
  - **Cột outbox và chống trùng.** `notifications` ở ARCH chỉ có `id, user_id, type, payload, read_at`. Đề xuất thêm `channels`, `email_status`, `email_attempts`, `email_sent_at`, `email_last_error` và `dedupe_key` với unique `(user_id, dedupe_key)` để nhắc hạn không trùng.
  - **Số lần thử email.** Spec chỉ nói "gửi lỗi thì thử lại". Đề xuất tối đa 3 lần, giống job AI (NFR-10).
  - **Thời điểm nhắc.** Spec không nói nhắc trước hạn bao lâu. Đề xuất tham số `campaigns.config.reminder_hours_before`, mặc định 24.
  - **Kênh của từng sự kiện.** PRD › *Thông báo* chỉ nêu người nhận, không nêu kênh. Đề xuất: mọi sự kiện có thông báo trong app; email cho mở đợt, nhắc hạn và lời mời HR.
- Kênh Redis pub/sub đề xuất: `notify:user:{userId}`. Tên endpoint `GET /api/notifications`, `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all` là đề xuất theo ARCH › *API architecture*; ARCH chỉ ghi sẵn `GET /api/events/stream`.
- Story này không thêm mục AD mới.

### Cross-story dependencies

- Builds on [US-1.2](US-1.2-core-db-schema-transition-audit-log.md): bảng `users` (người nhận), giao dịch dùng chung với `transitionTo`.
- Builds on [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md): xác thực, `@Roles()`, `loginAs`, layout ba cổng để gắn chuông, `DESIGN.md`.
- Builds on [US-1.4](US-1.4-campaign-setup-and-config.md): sự kiện `campaign.opened`, `phase_deadlines.intake_end`, đối tượng của đợt, `Clock` và `FakeClock`.
- Builds on [US-1.5](US-1.5-company-hr-accounts-jd-posting-approval.md): sự kiện `hr.invited` (đường dẫn mời trong payload).
- Sibling [US-1.6](US-1.6-data-consent-and-cv-upload.md): cùng tuần T4; nhắc hạn nộp CV cần biết sinh viên nào đã có CV hiệu lực qua service của module `student`. Cả hai story cần migration; story nào merge sau thì rebase rồi mới sinh ([sprints/README › Chạy song song](../README.md)).
- Required by [US-3.4](US-3.4-competition-level-and-suggestions.md): đẩy mức cạnh tranh qua SSE, dùng hook SSE ở `apps/web/src/shared/notifications/`.
- Required by [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md): thông báo công bố đề cử cho sinh viên và HR.
- Required by các story EPIC-2 (tiến độ job AI, hồ sơ năng lực và yêu cầu JD sẵn sàng), [US-3.3](US-3.3-shortlist-and-preferences.md) (nhắc hạn chọn NV), [US-4.3](US-4.3-exam-room.md) (nhắc hạn làm test), [US-5.3](US-5.3-hr-nomination-review.md) (nhắc SLA của HR).

### What we explicitly did NOT do

- Không làm thông báo đẩy trên điện thoại (push) hay SMS. Spec chỉ có trong app và email.
- Không cho người dùng tùy chỉnh nhận hay không nhận từng loại thông báo. Spec chưa có.
- Không làm các nguồn nhắc hạn chọn NV, làm test, SLA của HR. Mỗi nguồn thuộc story có dữ liệu tương ứng (US-3.3, US-4.3, US-5.3).
- Không dùng thư viện hàng đợi riêng cho email. Outbox trong PostgreSQL theo ARCH là đủ.

### References

- [Source: PRD › Functional Requirements (FR-8)](../../PRD.md#functional-requirements)
- [Source: PRD › Thông báo; Use case theo tác nhân (UC-35)](../../PRD.md)
- [Source: ARCHITECTURE › Component architecture › Cập nhật thời gian thực, Các module, Tác vụ định kỳ, Thư viện chính](../../ARCHITECTURE.md#component-architecture)
- [Source: ARCHITECTURE › Data architecture › Các bảng chính, Redis](../../ARCHITECTURE.md#data-architecture)
- [Source: ARCHITECTURE › LLM usage and cost › Những chỗ cố ý KHÔNG dùng LLM](../../ARCHITECTURE.md#llm-usage-and-cost)
- [Source: ARCHITECTURE › Deployment architecture](../../ARCHITECTURE.md#deployment-architecture)
- [Source: CONTEXT D13, D20](../../CONTEXT.md)

## Verification commands

| AC | Command |
|---|---|
| AC-1 | `apps/api/test/integration/notification.int-spec.ts` › "FR-8: notify writes rows in caller transaction and rolls back with it"; "FR-8: invalid payload is rejected and nothing is written" |
| AC-2 | `notification.int-spec.ts` › "FR-8: user lists only own notifications with unread count"; "FR-8: marking another user's notification returns 404" |
| AC-3 | `apps/api/test/integration/events-stream.int-spec.ts` › "FR-8: notification created on instance 2 reaches SSE client on instance 1 via Redis"; "FR-8: user B does not receive user A events"; "FR-8: unauthenticated stream returns 401" |
| AC-4 | `apps/api/test/integration/email-outbox.int-spec.ts` › "FR-8: outbox sends email and records sent time"; "FR-8: SMTP failure retries then marks failed without affecting business transaction"; "FR-8: two workers never send the same email twice" |
| AC-5 | `apps/api/test/integration/notification-listeners.int-spec.ts` › "GĐ0: campaign.opened notifies target students"; "FR-3: hr.invited emails the invite link" |
| AC-6 | `apps/api/test/integration/deadline-reminder.int-spec.ts` › "GĐ2: students without active CV get one reminder before intake_end"; "GĐ2: reminder is not duplicated across reruns and instances" |
| AC-7 | Kiểm tay chuông thông báo ở ba cổng và ở chế độ thiết bị 360 px theo `DESIGN.md`; mở Mailpit để xem email tiếng Việt |
| LLM | `rg -n "anthropic" apps/api/src/modules/notification` không ra dòng nào |

Integration test chạy bằng `pnpm --filter @srm/api exec jest --selectProjects integration test/integration/<file>`, cần Docker. Unit test: `pnpm --filter @srm/api test:unit` (`modules/notification/domain/__tests__/domain.spec.ts`: khung nhắc, lùi lần thử, dedupe key; `common/config/env.spec.ts`: `WEB_ORIGIN`, `SMTP_*`), `pnpm --filter @srm/shared test` (`schemas/__tests__/notification.spec.ts`, tham số `reminder_hours_before`).

Thêm vào bảng:
- AC-1: "FR-8: an email notification enters the outbox as PENDING", "FR-8: the same dedupe key notifies a user once".
- AC-2: "FR-8: pages back with before", "FR-8: marks one, then all, as read", "FR-8: anonymous callers get 401". Thông báo chỉ-email (`HR_INVITED`) không có trong danh sách và đánh dấu đọc thì nhận `404`.
- AC-3: "FR-8: a second stream of the same user also receives…", "FR-8: server sends heartbeat pings".
- AC-4: "FR-8: an inactive recipient is not emailed", "FR-8: a retried reminder is cancelled once its deadline has passed", "FR-3: the invitation email links to the current invitation; an accepted one is not emailed".
- AC-3: "FR-8: the stream ends when the access token that opened it expires".
- AC-5: "FR-3: after a re-invite only the newest invitation is emailed".
- AC-6: "GĐ2: the reminder lead time follows the campaign parameter".
- `core-schema.int-spec.ts` có thêm bảng `notifications`.

Lệnh chạy toàn bộ: `pnpm typecheck && pnpm lint && pnpm test`, `pnpm --filter @srm/shared test`, `pnpm build`, `pnpm depcruise && pnpm depcruise:fixture`, `pnpm --filter @srm/api db:generate && git status --porcelain apps/api/drizzle` (phải rỗng), `pnpm api:sync && git status --porcelain apps/web/src/shared/api` (phải rỗng).

**Kiểm tay AC-7.**

Chuẩn bị:
1. Chạy `docker compose -f deploy/docker-compose.yml up -d --build --wait`. Migration `0004` chạy ở service `migrate`.
2. Seed (nếu DB còn trống): `docker compose -f deploy/docker-compose.yml exec -e NODE_ENV=development api node dist/db/seed/dev-seed.js`.

Các bước:
1. Mở hai cửa sổ: `center@srm.local` ở `/admin`, `sv001@srm.local` ở `/sv` (mật khẩu seed `Srm-Dev-12345`).
2. Trung tâm tạo đợt có đối tượng `K66` / `Công nghệ thông tin`, đặt `intake_end` trong vòng 24 giờ tới, rồi mở đợt.
3. Bên sinh viên, chuông hiện số "1" mà không cần tải lại trang. Mở chuông thì thấy "Đợt thực tập đã mở" kèm hạn nộp (định dạng `dd/MM/yyyy HH:mm`) và nhãn "Mới".
4. Bấm vào thông báo: nhãn "Mới" mất, trang chuyển sang "Hồ sơ". "Đánh dấu tất cả đã đọc" đưa số về 0.
5. Đợi tối đa 5 phút: có thêm "Sắp hết hạn nộp CV".
6. Ở chế độ thiết bị cảm ứng rộng 360 px: chuông mở dạng sheet từ đáy màn hình, không có thanh cuộn ngang, mỗi mục cao ít nhất 44 px.
7. Làm lại ở `/hr` (đăng nhập `hr.alpha@srm.local`): danh sách rỗng hiện trạng thái "Chưa có thông báo".
8. Tắt API rồi bật lại (`docker compose … restart api`): trong lúc tắt, danh sách vẫn hiện. Bật lại thì client tự kết nối và danh sách đủ. Muốn xem trạng thái lỗi kèm "Thử lại" thì mở chuông lần đầu lúc API đang tắt.
9. Mailpit `http://localhost:8025`: email "Đợt thực tập … đã mở" và "Nhắc hạn: nộp CV …" bằng tiếng Việt, giờ Việt Nam, link `http://localhost:8080/sv/cv`.
10. Trung tâm mời một HR mới ở trang doanh nghiệp: Mailpit có email "Lời mời tham gia Smart Recruit Match" kèm link `http://localhost:8080/accept-invitation#…`. Mời lại cùng email: chỉ link trong email mới mở được.

## Changelog entry

### Added
- Thông báo trong ứng dụng: danh sách, số chưa đọc, đánh dấu đã đọc; cập nhật thời gian thực qua Server-Sent Events (`GET /api/events/stream`), chạy được nhiều instance nhờ Redis pub/sub.
- Gửi email qua outbox (nodemailer, template tiếng Việt), tự thử lại khi lỗi, không gửi trùng; môi trường dev xem email ở Mailpit.
- Thông báo mở đợt cho sinh viên, email mời HR, nhắc hạn nộp CV tự động.
- Chuông thông báo ở cả ba cổng.

**Commit**:

## Implementation notes

**2026-10-19, nhánh `us-1.7`.** Plan đã duyệt. Các quyết định chốt với người dùng ở *Story refresh* và [CONTEXT D31](../../CONTEXT.md).

Design applied: DESIGN.md
- §1: chỉ dùng primitive có sẵn (`popover`, `sheet`, `badge`, `button`, `empty`, `alert`, `skeleton`, `spinner`, `separator`), không thêm primitive hay gói; `className` chỉ cho bố cục.
- §2: chỉ token ngữ nghĩa; thông báo chưa đọc có nhãn chữ "Mới", không chỉ dùng màu.
- §3: tiêu đề thông báo `font-semibold` khi chưa đọc, `font-medium` khi đã đọc; thời gian `text-xs`; số trên chuông `tabular-nums`.
- §4: `gap-1`/`gap-2` trong danh sách; popover `w-96`, tối đa `100vw − 2rem`.
- §5: dưới `md` danh sách mở bằng `Sheet side="bottom"` (cao tối đa 85svh, có `safe-area-inset-bottom`); mục danh sách `pointer-coarse:min-h-11`; nội dung dài `break-words`.
- §6: badge số chưa đọc `default` (tối đa "9+"), badge "Mới"; `popover` dùng thêm cho chuông (đã ghi vào §6).
- §7: bốn trạng thái trong danh sách: Skeleton, Alert có "Thử lại" (lỗi qua `apiErrorMessage`), Empty "Chưa có thông báo", dữ liệu. Lỗi đánh dấu đã đọc hiện bằng `toast.error`.
- §9: chuỗi tiếng Việt viết hoa đầu câu, nút động từ + tân ngữ ("Đánh dấu tất cả đã đọc", "Xem thêm").
- §10: `formatDateTime` cho hạn trong nội dung, `formatRelative` cho thời điểm nhận ("3 phút trước"), có `title` là ngày giờ đầy đủ.
- §11: nút chuông có `aria-label` gồm số chưa đọc ("Thông báo, 3 chưa đọc"); badge số `aria-hidden`; `SheetTitle` "Thông báo", `SheetDescription` `sr-only`; danh sách dùng được bằng bàn phím (mỗi mục là `Button`).
- §12: chuông nằm trong header của `StudentLayout` và `PortalSidebarLayout` (HR, Trung tâm, Quản trị), cạnh menu tài khoản.

Áp cho `apps/web/src/shared/notifications/` và hai layout trong `apps/web/src/app/layouts/`.

**Module `notification`**
- `NotificationService.notify(input, { tx? })` parse `NotifyInputSchema` trước khi ghi, rồi chèn một dòng cho mỗi người nhận, mỗi lần 500 dòng, với `ON CONFLICT (user_id, dedupe_key) DO NOTHING`.
  - Có kênh email thì `email_status = 'PENDING'`, `email_next_attempt_at = now` (theo `Clock`).
  - Trả `PendingNotifications`. `push` chỉ chạy một lần cho mỗi đối tượng; lỗi Redis chỉ ghi log.
- `RealtimeSubscriber` dùng một kết nối `duplicate()` cho mỗi instance và đếm số listener theo kênh. `ready` chỉ được phát sau khi Redis xác nhận `SUBSCRIBE`, nên client tải lại danh sách lúc đó sẽ không lỡ thông báo nào.
- `EventStreamService.open` ghép `ready` + sự kiện của user + `ping` (25 s), và tự đóng khi access token đã mở stream hết hạn (`AccessTokenService.expiresAt`, tối đa 15 phút). Test thay chu kỳ ping qua token `EVENT_STREAM_SETTINGS`.
- `EmailOutboxWorker.runOnce` xử lý tối đa 500 email, mỗi email một giao dịch:
  1. `claimNextEmail` (`FOR UPDATE SKIP LOCKED LIMIT 1`, không join);
  2. `UserDirectory.findContacts`;
  3. parse `type`/`payload`, rồi kiểm `emailStillRelevant` (hạn đã qua thì hủy);
  4. với `HR_INVITED`, lấy link ký mới qua `InvitationService.currentInvitationLink` (không còn lời mời thì hủy);
  5. `EmailRenderer.render` rồi gửi qua SMTP pool (timeout 10/10/30 giây).

  Kết quả là `SENT`, hoặc `PENDING` với lần thử sau, hoặc `FAILED` (log error), hoặc `CANCELLED` (tài khoản bị khóa hay không còn, email quá hạn, lời mời đã nhận).
- `EmailRenderer` nhận nội dung đã parse (và link mời cho `HR_INVITED`), dựng link từ `WEB_ORIGIN`, định dạng giờ theo `Asia/Ho_Chi_Minh`. Handlebars chạy `strict` trên một instance riêng (`Handlebars.create()`).
- `HrInvitedListener`: khóa `pg_advisory_xact_lock(1702, hashtext(userId))`, hủy email cũ còn chờ, chèn email mới với kênh `['EMAIL']` và payload `{ companyId }`. Dòng không chứa link hay token ([CONTEXT D32](../../CONTEXT.md)).
- `CampaignOpenedListener` và `HrInvitedListener` bắt mọi lỗi và ghi log. Test cũ mở đợt hay mời HR rồi đóng app ngay vẫn chạy bình thường.
- `CvIntakeReminderSource` đăng ký vào `DeadlineReminderRegistry` trong `onModuleInit`. `DeadlineReminderScheduler` chạy mỗi 5 phút trong `withAdvisoryLock(1701)`; một nguồn lỗi không chặn các nguồn khác.

**Module khác**
- `campaign`:
  - Tách `isInTarget` ra khỏi `canSeeCampaign` và export.
  - `CampaignSettings` có thêm `name`.
  - Thêm `listSettingsInPhase` dùng `CampaignRepository.listByStatus`, bỏ qua dòng hỏng như `list`.
- `student`: `StudentService.listIdsInTarget` (lọc trong code), `CvService.studentIdsWithActiveCv`.
- `iam`: `UserDirectory` (`userIdsForStudents` chỉ lấy tài khoản đang hoạt động, `findContacts`); `InvitationService.currentInvitationLink` (ký token mới từ nonce hiện tại, `null` khi không còn lời mời).
- `common`: `AccessTokenService.expiresAt`, helper `errorMessage` (`common/errors`).

**Web**
- `connectEventStream` (`shared/notifications/event-stream.ts`) dùng `fetch` có header.
  - Token còn dưới 30 giây thì refresh trước khi kết nối. Gặp 401 thì refresh một lần; refresh thất bại thì `notifySessionExpired`.
  - Lỗi mạng thì kết nối lại sau 1, 2, 4… tối đa 30 giây. Server đóng stream thì kết nối lại sau 1 giây.
- `EventStreamProvider` invalidate `['notifications']` khi có `notification`, và khi có `ready` từ lần kết nối thứ hai trở đi.
- `useServerEvent` nằm ở `server-events.ts`: ESLint `react-refresh` không cho file component export hook.
- Thêm `expectOk` vào `shared/api/client.ts` cho endpoint `204`, vì `unwrap` đòi có `data`.
- Form tham số đợt có thêm trường "Nhắc trước hạn (giờ)".

**Test**
- Chỉ `email-outbox.int-spec.ts` chạy worker. Đồng hồ của nó đặt ở năm 1999 và worker chỉ lấy email đến hạn theo đồng hồ đó, nên không đụng email do file test khác tạo.
- Test nhắc hạn dùng tháng 2–3 năm 2001; test chuyển pha của US-1.4 chỉ dùng tháng 1. Đã ghi vào đầu `test/helpers/fake-clock.ts`.
- Helper mới:
  - `test/helpers/sse.ts`: `listen`, `openEventStream` bằng `fetch`;
  - `test/helpers/mail.ts`: `FakeMailTransport`;
  - `test/helpers/notifications.ts`: `notificationsOf`, `waitFor`.
- Kết quả (sau khi sửa theo review): `pnpm test` gồm API 45 suite, 269 test, và shared 93 test. Trước khi sửa theo review, bộ test (264 test) xanh hai lần liền. Chạy lúc compose stack đang bật thì máy dev hết RAM (V8 `Fatal process out of memory`) và mỗi lần đỏ ngẫu nhiên vài suite khác nhau. Dừng compose (`docker compose … stop`) rồi chạy lại thì xanh.

**Kiểm đầu-cuối trên compose (2026-10-19).** Script tạm ở scratchpad, đi qua nginx `:8080`:
- Đăng nhập `sv001` và mở stream: nhận `200 text/event-stream` và `ready`.
- Trung tâm tạo và mở đợt có đối tượng của seed: sinh viên nhận sự kiện `notification` ngay; `GET /api/notifications` trả `unreadCount 1`.
- Khoảng 3 giây sau, Mailpit có email "Đợt thực tập "…" đã mở" gửi `sv001` và `sv002`, nội dung tiếng Việt, giờ Việt Nam, link `http://localhost:8080/sv/cv`.
- Mời HR: email có đúng link `http://localhost:8080/accept-invitation#…`.
- Đánh dấu đã đọc xong thì `unreadCount 0`.
- Cron nhắc hạn của compose chạy lúc 16:10 UTC: Mailpit nhận "Nhắc hạn: nộp CV…" cho `sv001` và `sv002`, vì đợt thử có `intake_end` sau 2 giờ. Lúc 16:15 không có email trùng. Log API không có lỗi.

**Review** (`/code-review`, mức medium, 2026-10-19). Có 9 phát hiện; sửa 8 trong commit `fix: address review…`, ghi ở [CONTEXT D32](../../CONTEXT.md):
- Token mời nằm dạng thường trong `notifications.payload`, và việc chọn lời mời mới nhất dựa vào `expiresAt` không đáng tin. Sửa bằng cách ký link lúc gửi; payload chỉ còn `companyId`.
- Ép `userId::int` trong khóa advisory: đổi sang `hashtext`.
- Stream sống 15 phút tính từ lúc mở: đổi thành đóng khi token hết hạn.
- Client SSE kết nối lại liên tục khi gặp 401 liên tiếp: thêm back-off.
- Email nhắc hạn quá hạn vẫn được gửi khi thử lại: hủy thay vì gửi.
- SMTP không có timeout và chỉ gửi 50 email mỗi lượt: dùng pool, timeout 10/10/30 giây, 500 email mỗi lượt.
- `messageOf` bị chép nhiều chỗ: thay bằng helper `errorMessage`.
- Không sửa: `listIdsInTarget` đọc cả bảng `students` mỗi 5 phút trong khung nhắc. Lọc sơ bằng SQL `lower()` có thể bỏ sót do collation, còn chi phí ở quy mô đồ án không đáng kể (D32).

**Lệch so với spec**
- Template ở `templates/templates.ts`, không phải `templates/*.hbs` (D31).
- Tên `type` viết UPPER_SNAKE (`CAMPAIGN_OPENED`…), vì helper `oneOf` của DB chỉ nhận hằng UPPER_SNAKE.
- Thêm cột `email_next_attempt_at` ngoài danh sách cột đã chốt (D31).
- `jd.submitted`, `jd.approved` chưa tạo thông báo nào: PRD › *Thông báo* không có dòng cho hai sự kiện này.

**Lessons**: thêm [LESSONS §14](../../LESSONS.md) (compose truyền biến tùy chọn chưa đặt thành chuỗi rỗng), §15 (chạy test khi compose đang bật thì máy hết RAM) và bổ sung §9 (gói khai `"type": "module"` vẫn có thể có bản CommonJS dùng được).

## Files modified

- **Shared:** `packages/shared/schemas/notification.ts` (mới), `schemas/index.ts`, `schemas/campaign.ts` (`reminder_hours_before`); test `schemas/__tests__/notification.spec.ts` (mới), `campaign.spec.ts`.
- **DB:** `apps/api/src/db/schema/notifications.ts` (mới), `schema/index.ts`; `apps/api/drizzle/0004_notifications_email_outbox.sql`, `meta/0004_snapshot.json`, `meta/_journal.json`.
- **API, chung:** `common/errors/error-message.ts` (mới), `common/errors/index.ts`, `common/auth/access-token.service.ts` (`expiresAt`); `modules/iam/application/invitation.service.ts` (`currentInvitationLink`).
- **API, module mới** `apps/api/src/modules/notification/`:
  - `notification.module.ts`, `index.ts`;
  - `api/{dto,notification.controller,events.controller}.ts`;
  - `application/{notification.service,event-stream.service,email-outbox.worker,email-renderer,deadline-reminder.registry,deadline-reminder.scheduler}.ts`;
  - `application/listeners/{campaign-opened,hr-invited}.listener.ts`, `application/sources/cv-intake.source.ts`;
  - `domain/{reminder-window,email-retry,email-relevance,dedupe-keys}.ts`, `domain/__tests__/domain.spec.ts`;
  - `infrastructure/{notification.repository,redis-pubsub,mailer}.ts`, `templates/templates.ts`.
- **API, sửa:**
  - `app.module.ts`, `openapi/export.ts`;
  - `common/config/env.ts`, `env.spec.ts`, `common/scheduling/advisory-lock.ts`;
  - `modules/campaign/{index.ts,domain/visibility.ts,application/campaign.service.ts,infrastructure/campaign.repository.ts}`;
  - `modules/student/{application/student.service.ts,application/cv.service.ts,infrastructure/cv.repository.ts}`;
  - `modules/iam/{iam.module.ts,index.ts}`, `modules/iam/application/user-directory.service.ts` (mới);
  - `apps/api/package.json` (`nodemailer` 10.0.15, `handlebars` 4.7.10), `pnpm-lock.yaml`.
- **Test:**
  - `apps/api/test/integration/{notification,events-stream,email-outbox,notification-listeners,deadline-reminder}.int-spec.ts` (mới), `core-schema.int-spec.ts`;
  - `test/helpers/{sse,mail,notifications}.ts` (mới), `fake-clock.ts`;
  - `test/setup/global-setup.ts` (`WEB_ORIGIN`).
- **Web:**
  - `apps/web/src/shared/notifications/{event-stream,server-events,api,messages}.ts`, `{event-stream-provider,notification-bell,notification-list}.tsx` (mới);
  - `app/layouts/{portal-sidebar-layout,student-layout}.tsx`, `shared/api/client.ts` (`expectOk`);
  - `shared/api/{openapi.json,schema.d.ts}`, `features/center/campaigns/labels.ts`.
- **Triển khai và tài liệu:**
  - `deploy/docker-compose.yml`, `deploy/.env.example`, `DEPLOY.md`, `docs/SETUP.md`, `DESIGN.md` §6;
  - `docs/ARCHITECTURE.md`, `docs/PRD.md`, `docs/CONTEXT.md` (D31, D32), `docs/LESSONS.md` (§9, §14);
  - `docs/sprints/epics/EPIC-1.md`, `docs/sprints/sprint-2026-W42.md`, story này, `docs/CHANGELOG.md`, `VERSION`.

## Cross-references

- [PRD FR-8](../../PRD.md#functional-requirements)
- [Epic EPIC-1](../epics/EPIC-1.md)
- [ARCHITECTURE AD-13](../../ARCHITECTURE.md#architecture-decisions)
- [CONTEXT D13, D20, D31, D32](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
- `DESIGN.md` (gốc repo, tạo ở US-1.3)
