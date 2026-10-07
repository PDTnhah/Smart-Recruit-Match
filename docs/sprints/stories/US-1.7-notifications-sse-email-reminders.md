---
id: US-1.7
title: "Thông báo trong app, SSE, email, nhắc hạn"
epic: EPIC-1
status: backlog
priority: P1
points: 5
sprint:
version_shipped:
prd_ref: [FR-8]
arch_ref: [AD-13]
depends_on: [US-1.2, US-1.3]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Người dùng nhận thông báo theo sự kiện nghiệp vụ: trong ứng dụng ngay lúc sự kiện xảy ra (qua Server-Sent Events) và qua email. Hệ thống tự nhắc trước các hạn quan trọng. Sau story này, module nào cần báo tin chỉ cần gọi một service đã export hoặc phát sự kiện. Việc lưu, đẩy xuống trình duyệt, gửi email, thử lại khi lỗi và chống gửi trùng do module `notification` lo. Kênh SSE này cũng là kênh mà EPIC-2 dùng để báo tiến độ job AI và US-3.4 dùng để đẩy mức cạnh tranh.

## Background

FR-8 (UC-35) yêu cầu thông báo trong ứng dụng và email theo sự kiện nghiệp vụ, kèm nhắc hạn tự động. PRD › *Thông báo* liệt kê sự kiện và người nhận. Trong phạm vi EPIC-1 có các sự kiện: mở đợt; sắp hết hạn nộp CV; lời mời HR (để US-1.5 gửi được email mời). Các sự kiện còn lại của bảng (hồ sơ năng lực sẵn sàng, yêu cầu JD sẵn sàng, kết quả test, công bố đề cử, SLA, lịch và kết quả phỏng vấn, lời mời thực tập) do story của từng giai đoạn gọi service ở đây.

AD-13 ([CONTEXT D13](../../CONTEXT.md)): dùng SSE (`GET /api/events/stream`), Redis pub/sub khi chạy nhiều instance. WebSocket bị loại vì dữ liệu chỉ đi một chiều từ server. ARCH › *Các module*: module `notification` gồm email (nodemailer + template Handlebars), thông báo trong app, SSE (`@Sse()` của NestJS). ARCH › *Tác vụ định kỳ*: email được ghi vào bảng `notifications` trước (outbox) rồi gửi bằng tác vụ nền, gửi lỗi thì thử lại; tác vụ định kỳ dùng `pg_try_advisory_lock`. Môi trường dev bắt email bằng Mailpit (ARCH › *Docker Compose*). ARCH › *Những chỗ cố ý KHÔNG dùng LLM* có "SLA, nhắc hạn".

Story được đưa lên T4 (CONTEXT D20) vì US-3.4 và US-5.2 cần nó.

**Lessons applied**: none — LESSONS.md chỉ có §1 (nạp skill), không liên quan thông báo hay SSE; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — Module `notification` export `NotificationService.notify({ userIds, type, payload, channels })`. `type` và `payload` được kiểm bằng Zod schema dạng union theo `type` trong `packages/shared/schemas/notification.ts`. **Given** caller truyền giao dịch của mình, **When** gọi `notify`, **Then** các dòng `notifications` được ghi trong cùng giao dịch đó: nghiệp vụ rollback thì thông báo cũng không còn **And** `type` hoặc `payload` sai schema thì ném lỗi, không ghi gì.
- [ ] **AC-2** — **Given** người dùng đã đăng nhập (mọi vai trò), **When** gọi `GET /api/notifications`, **Then** chỉ nhận thông báo của mình, mới nhất trước, có phân trang và số chưa đọc **And** `POST /api/notifications/{id}/read` và `POST /api/notifications/read-all` đặt `read_at` **And** đánh dấu đã đọc thông báo của người khác thì trả `404`.
- [ ] **AC-3** — **Given** người dùng A đang mở `GET /api/events/stream` trên instance 1, **When** một thông báo cho A được tạo ở instance 2, **Then** A nhận sự kiện SSE (qua Redis pub/sub) mà không phải tải lại trang **And** người dùng B không nhận sự kiện của A **And** mở stream khi chưa xác thực thì nhận `401` **And** server gửi heartbeat định kỳ để proxy không cắt kết nối **And** khi kết nối lại, client tải lại danh sách nên không mất thông báo (thông báo đã được lưu ở DB).
- [ ] **AC-4** — **Given** một thông báo có kênh email, **When** tác vụ nền gửi outbox chạy, **Then** email được gửi qua nodemailer bằng template Handlebars tiếng Việt (môi trường dev: thấy trong Mailpit) và thời điểm gửi được ghi lại **And** SMTP lỗi thì tăng số lần thử và thử lại về sau, quá số lần tối đa thì đánh dấu thất bại và ghi log **And** SMTP lỗi không làm hỏng giao dịch nghiệp vụ đã tạo thông báo **And** hai instance chạy cùng lúc không gửi trùng một email.
- [ ] **AC-5** — **Given** các sự kiện của EPIC-1, **When** sự kiện được phát qua `@nestjs/event-emitter`, **Then** `campaign.opened` (US-1.4) tạo thông báo "Mở đợt" trong app và qua email cho sinh viên thuộc đối tượng của đợt **And** `hr.invited` (US-1.5) gửi email chứa đường dẫn mời cho HR được mời.
- [ ] **AC-6** — **Given** đợt ở `INTAKE` và còn trong khoảng nhắc trước `intake_end`, **When** tác vụ nhắc hạn chạy, **Then** sinh viên thuộc đối tượng của đợt mà chưa có CV hiệu lực nhận thông báo "Sắp hết hạn nộp CV" (trong app và email) **And** chạy lại tác vụ, hoặc chạy trên hai instance, không nhắc trùng cùng một người cho cùng một hạn **And** sinh viên đã nộp CV không nhận nhắc **And** tác vụ không gọi LLM. Cơ chế nhắc cho phép story sau đăng ký thêm hạn (chọn NV ở US-3.3, làm test ở US-4.3, SLA của HR ở US-5.3).
- [ ] **AC-7** — Khung của cả ba cổng có biểu tượng chuông kèm số chưa đọc, cập nhật theo SSE; mở ra danh sách thông báo (dạng sheet trên điện thoại) có nút đánh dấu đã đọc; bấm vào thông báo thì đi tới trang liên quan. Chuỗi tiếng Việt, ngày giờ theo date-fns locale `vi`, đủ bốn trạng thái theo `DESIGN.md`.

## Tasks

- [ ] **TASK-1.7.1** — Bảng và service thông báo (AC: 1, 2)
  - [ ] Subtask 1.7.1.1 — Drizzle schema `apps/api/src/db/schema/notifications.ts` theo ARCH (`id`, `user_id`, `type`, `payload`, `read_at`, index `(user_id, read_at)`) cùng các cột outbox và chống trùng ở *Dev notes*; migration.
  - [ ] Subtask 1.7.1.2 — `packages/shared/schemas/notification.ts`: union theo `type`.
  - [ ] Subtask 1.7.1.3 — `apps/api/src/modules/notification/application/notification.service.ts`; `api/notification.controller.ts` (`GET /api/notifications`, `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all`).
- [ ] **TASK-1.7.2** — SSE (AC: 3)
  - [ ] Subtask 1.7.2.1 — `apps/api/src/modules/notification/api/events.controller.ts`: `@Sse()` cho `GET /api/events/stream`, lọc theo `user_id`, heartbeat.
  - [ ] Subtask 1.7.2.2 — `apps/api/src/modules/notification/infrastructure/redis-pubsub.ts`: publish khi tạo thông báo (sau khi giao dịch commit), subscribe kênh theo người dùng bằng ioredis.
  - [ ] Subtask 1.7.2.3 — Xác thực stream theo cách được chốt (xem *Dev notes*).
- [ ] **TASK-1.7.3** — Email outbox (AC: 4, 5)
  - [ ] Subtask 1.7.3.1 — `apps/api/src/modules/notification/infrastructure/mailer.ts`: nodemailer, cấu hình SMTP từ biến môi trường (Mailpit khi dev).
  - [ ] Subtask 1.7.3.2 — `apps/api/src/modules/notification/templates/*.hbs`: template tiếng Việt cho `campaign_opened`, `hr_invited`, `deadline_reminder`.
  - [ ] Subtask 1.7.3.3 — `apps/api/src/modules/notification/application/email-outbox.worker.ts`: lấy dòng chờ gửi bằng `FOR UPDATE SKIP LOCKED`, gửi, ghi kết quả, thử lại.
- [ ] **TASK-1.7.4** — Nghe sự kiện và nhắc hạn (AC: 5, 6)
  - [ ] Subtask 1.7.4.1 — `apps/api/src/modules/notification/application/listeners/`: `campaign.opened`, `hr.invited`; lấy người nhận qua `CampaignService` và `StudentService` đã export.
  - [ ] Subtask 1.7.4.2 — `apps/api/src/modules/notification/application/deadline-reminder.scheduler.ts`: `@nestjs/schedule` + `pg_try_advisory_lock`, đọc giờ qua `Clock` của US-1.4 (`apps/api/src/common/clock/`); giao diện đăng ký nguồn nhắc hạn; nguồn đầu tiên là hạn nộp CV.
- [ ] **TASK-1.7.5** — Đọc `DESIGN.md` trước khi code giao diện; ghi dòng `Design applied: …` vào *Implementation notes* (AC: 7)
- [ ] **TASK-1.7.6** — Giao diện thông báo (AC: 7)
  - [ ] Subtask 1.7.6.1 — `apps/web/src/shared/notifications/`: hook SSE dùng chung (EPIC-2, US-3.4 dùng lại), chuông và danh sách; gắn vào layout ba cổng của US-1.3.
- [ ] **TASK-1.7.7** — Test (AC: 1–6)
  - [ ] Subtask 1.7.7.1 — Integration test với PostgreSQL, Redis thật (testcontainers); SMTP giả cho test lỗi; hai app instance trong cùng test cho AC-3, AC-4, AC-6.

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

Lệnh chạy: các file test trên chạy bằng script `pnpm test` / `pnpm --filter <package> test` do US-1.1 tạo; ghi lệnh đầy đủ vào bảng này khi US-1.1 xong (AGENTS › *Lệnh*).

## Changelog entry

### Added
- Thông báo trong ứng dụng: danh sách, số chưa đọc, đánh dấu đã đọc; cập nhật thời gian thực qua Server-Sent Events (`GET /api/events/stream`), chạy được nhiều instance nhờ Redis pub/sub.
- Gửi email qua outbox (nodemailer, template tiếng Việt), tự thử lại khi lỗi, không gửi trùng; môi trường dev xem email ở Mailpit.
- Thông báo mở đợt cho sinh viên, email mời HR, nhắc hạn nộp CV tự động.
- Chuông thông báo ở cả ba cổng.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-8](../../PRD.md#functional-requirements)
- [Epic EPIC-1](../epics/EPIC-1.md)
- [ARCHITECTURE AD-13](../../ARCHITECTURE.md#architecture-decisions)
- [CONTEXT D13, D20](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
- `DESIGN.md` (gốc repo, tạo ở US-1.3)
