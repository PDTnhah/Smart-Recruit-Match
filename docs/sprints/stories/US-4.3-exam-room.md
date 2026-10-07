---
id: US-4.3
title: "Phòng thi"
epic: EPIC-4
status: backlog
priority: P0
points: 8
sprint:
version_shipped:
prd_ref: [FR-20, NFR-9, NFR-10]
depends_on: [US-4.1, US-3.3]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Sinh viên làm bài test cho từng nguyện vọng trên điện thoại hoặc máy tính. Mỗi bài chỉ làm một lần. Server quyết định giờ hết hạn. Bài làm tự lưu và làm tiếp được khi mất mạng. Đáp án không bao giờ rời server. Mọi sinh viên cùng JD làm đề tương đương. Phòng thi được thiết kế để chịu khoảng 200 sinh viên làm cùng lúc. Mọi logic thời gian của phòng thi dùng đồng hồ inject được (`Clock`, `FakeClock`) mà [US-1.4](US-1.4-campaign-setup-and-config.md) đã tạo, để [US-4.4](US-4.4-grading-stest-sfinal.md), [US-4.6](US-4.6-appeals-and-question-error-reports.md) và các story EPIC-5 tua được thời gian trong test.

## Background

FR-20: sinh viên làm bài test, rút đề ngẫu nhiên theo ma trận, giới hạn T_test, tự lưu, làm tiếp khi mất kết nối, chỉ làm một lần (UC-14, BR-06). PRD › GĐ5 › *Tổ chức thi*: khi sinh viên bắt đầu, hệ thống rút ngẫu nhiên câu theo ma trận, xáo thứ tự câu và phương án; hết giờ tự nộp; không làm trước hạn thì NV bị hủy. BR-05 yêu cầu đề tương đương: cùng ma trận, chỉ khác câu cụ thể; phần tính điểm không cá nhân hóa theo CV. NFR-9: khoảng 200 sinh viên làm đồng thời. NFR-10: bài làm tự lưu mỗi 30 giây.

ARCH › *Frontend › Phòng thi*: server trả `deadline_at`, client chỉ đếm ngược; hết giờ server tự đóng bài kể cả khi client mất kết nối. Tự lưu mỗi lần đổi đáp án (debounce) và định kỳ 30 giây. Câu hỏi và phương án đã xáo phía server, không gửi đáp án đúng xuống client. ARCH › *Luồng làm và chấm bài test* mô tả trình tự: `POST /api/preferences/{id}/exam/start` → rút câu, lưu seed → tạo phiên thi và deadline trong Redis → tự lưu vào Redis → nộp bài hoặc server tự đóng. ARCH › *Redis* có `exam:{sessionId}:answers` và `exam:{sessionId}:deadline`. ARCH › *Security architecture › Thi*: đáp án không rời server, đồng hồ phía server, giới hạn tần suất gọi API. ARCH › *Tác vụ định kỳ* có tác vụ hủy NV quá hạn làm test, chạy bằng `@nestjs/schedule` + `pg_try_advisory_lock`.

Vòng đời hồ sơ ứng tuyển (PRD › *Vòng đời trạng thái*): *Chờ làm test* (`PENDING_TEST`) → *Đóng* (`CLOSED`) khi quá hạn không làm. Bảng chuyển trạng thái và các mã trạng thái (đề xuất) do [US-3.3](US-3.3-shortlist-and-preferences.md) đưa vào `packages/shared/states/application.ts`. Chuyển `PENDING_TEST` → `TEST_GRADED` thuộc [US-4.4](US-4.4-grading-stest-sfinal.md). Kiểm thử tải 200 sinh viên chạy ở [US-6.6](US-6.6-demo-data-e2e-load-test.md) bằng k6. Story này chỉ phải thiết kế để đạt mức đó (EPIC-4 › *Out of scope*).

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** sinh viên có một NV ở trạng thái `PENDING_TEST` (*Chờ làm test*), đợt đang ở pha *Làm test*, ngân hàng của JD đã khóa, **When** gọi `POST /api/preferences/{id}/exam/start`, **Then** server rút đúng số câu mỗi ô (kỹ năng × độ khó) của `question_banks.blueprint` từ các câu `VALIDATED`, không câu nào lặp lại, xáo thứ tự câu và phương án phía server **And** lưu `exam_sessions` với `seed`, `question_ids`, `started_at`, `deadline_at = started_at + T_test` (theo đồng hồ server), ghi `exam:{sessionId}:deadline` vào Redis **And** trả về câu hỏi, `deadline_at` và `server_now`.
- [ ] **AC-2** — Đề tương đương (BR-05): property test (fast-check) với nhiều seed và nhiều ngân hàng hợp lệ cho thấy mọi đề rút ra có cùng số câu ở mỗi ô, cùng số câu phần B, cùng thời gian. Cùng `seed` và cùng phiên bản ngân hàng luôn cho cùng đề và cùng thứ tự. Hàm rút đề không nhận dữ liệu CV.
- [ ] **AC-3** — Không response nào của API phòng thi (bắt đầu, làm tiếp, tự lưu, nộp bài) chứa `answer_key`, `rubric`, giải thích, đáp án mẫu, cờ đúng/sai hay vị trí gốc của phương án. Mã phương án gửi xuống là mã mờ theo từng phiên. Test duyệt đệ quy mọi khóa JSON của từng response và so với danh sách cấm.
- [ ] **AC-4** — Mỗi bài chỉ làm một lần (BR-06): gọi bắt đầu lần nữa khi phiên đang mở thì trả lại đúng phiên đó, không rút đề mới **And** gọi sau khi đã nộp hoặc đã đóng thì trả `409` mã `EXAM_ALREADY_TAKEN` **And** DB có ràng buộc unique `exam_sessions(student_id, bank_id)` (đề xuất), nên hai yêu cầu bắt đầu đồng thời chỉ tạo một phiên.
- [ ] **AC-5** — Phân quyền và điều kiện: sinh viên khác gọi bắt đầu, làm tiếp, tự lưu hay nộp bài trên phiên/NV không phải của mình thì nhận `404` (không lộ sự tồn tại) **And** vai trò `HR`, `CENTER` không gọi được các endpoint này (`403`) **And** NV không ở `PENDING_TEST`, đợt không ở pha *Làm test*, hoặc ngân hàng chưa khóa thì nhận `409` kèm mã lỗi.
- [ ] **AC-6** — **Given** phiên đang mở, **When** client gọi `PUT /api/exam-sessions/{id}/answers` với một hoặc nhiều câu trả lời, **Then** server ghi vào hash Redis `exam:{sessionId}:answers`, không ghi PostgreSQL ở mỗi lần tự lưu **And** gửi cùng payload hai lần cho cùng kết quả **And** khi đồng hồ server đã qua `deadline_at` thì trả `409` mã `EXAM_CLOSED` và không lưu.
- [ ] **AC-7** — **Given** sinh viên mất kết nối hoặc tải lại trang, **When** gọi `GET /api/exam-sessions/{id}` (đề xuất), **Then** nhận lại đúng đề đã rút theo đúng thứ tự, các câu trả lời đã lưu và `deadline_at` cũ. Thời gian mất kết nối không được cộng thêm.
- [ ] **AC-8** — **When** sinh viên gọi `POST /api/exam-sessions/{id}/submit`, **Then** trong một giao dịch: câu trả lời từ Redis được ghi vào `exam_answers`, `submitted_at` lấy theo đồng hồ server, phiên chuyển sang đã nộp qua `transitionTo` có audit **And** phát sự kiện đóng phiên (đề xuất `exam.session.closed`) cho [US-4.4](US-4.4-grading-stest-sfinal.md) chấm **And** nộp lần hai trả cùng kết quả, không ghi lại.
- [ ] **AC-9** — **Given** một phiên đã qua `deadline_at` mà chưa nộp, client không kết nối lại, **When** tác vụ định kỳ chạy (mỗi phút, giữ `pg_try_advisory_lock`), **Then** server tự đóng phiên như AC-8 với `submitted_at = deadline_at` **And** hai instance chạy cùng lúc không đóng trùng.
- [ ] **AC-10** — **Given** hạn pha *Làm test* đã qua, **When** tác vụ định kỳ chạy, **Then** mọi NV còn ở `PENDING_TEST` mà chưa có phiên thi chuyển sang `CLOSED` qua `transitionTo` với lý do `TEST_NOT_TAKEN`, audit trong cùng giao dịch (BR-06) **And** lệch `row_version` thì bỏ qua dòng đó, lần chạy sau xử lý lại **And** sinh viên nhận thông báo qua module `notification`.
- [ ] **AC-11** — Mọi logic thời gian của module `assessment` (hạn phiên, tự đóng, tác vụ định kỳ) dùng `Clock` được inject từ `apps/api/src/common/clock/` (tạo ở [US-1.4](US-1.4-campaign-setup-and-config.md)), không gọi `Date.now()`/`new Date()` trực tiếp. Test tua thời gian bằng `FakeClock` ở `apps/api/test/helpers/fake-clock.ts`; story này không tạo bản thứ hai.
- [ ] **AC-12** — Gọi API phòng thi vượt giới hạn tần suất (`ratelimit:{userId}:{route}`) thì nhận `429`; tự lưu với debounce và chu kỳ 30 giây của client không bao giờ chạm giới hạn.
- [ ] **AC-13** — Giao diện `apps/web/src/features/exam/` là route riêng, layout tối giản. Ở màn hình rộng 360 px không có thanh cuộn ngang. Đồng hồ đếm ngược tính từ `deadline_at` và độ lệch `server_now`, không dùng giờ máy khách. Có chỉ báo "Đã lưu / Đang lưu / Mất kết nối – sẽ lưu lại". Câu trả lời chưa gửi được giữ lại và gửi lại khi có mạng. Về 0 thì khóa ô nhập và hiện "Hết giờ". Có hộp thoại xác nhận trước khi nộp. Mọi chuỗi bằng tiếng Việt.
- [ ] **AC-14** — Với `campaigns.config.share_exam_by_position_group = false` (mặc định), mỗi NV có phiên thi riêng. Với `true`, các NV của cùng sinh viên vào những JD dùng chung một ngân hàng dùng chung một phiên: bắt đầu từ NV thứ hai trả lại phiên đã có, không rút đề mới.

## Tasks

- [ ] **TASK-4.3.1** — Dùng đồng hồ inject được của US-1.4 (AC: 11)
  - [ ] Subtask 4.3.1.1 — Inject `Clock` từ `apps/api/src/common/clock/` vào service, scheduler của module `assessment`; không tạo `Clock` mới.
  - [ ] Subtask 4.3.1.2 — Dùng `FakeClock` ở `apps/api/test/helpers/fake-clock.ts` trong test hết giờ; thêm phương thức nếu thiếu, không tạo file mới.
- [ ] **TASK-4.3.2** — Bảng, ràng buộc và trạng thái phiên thi (AC: 4, 8, 9)
  - [ ] Subtask 4.3.2.1 — Migration `apps/api/drizzle/`: `exam_sessions`, `exam_answers` (`PK(session_id, question_id)`), `exam_events` (`index(session_id)`) theo ARCH › *Các bảng chính*; thêm `status`, `row_version`, unique `(student_id, bank_id)` (đề xuất).
  - [ ] Subtask 4.3.2.2 — `packages/shared/states/exam-session.ts` (đề xuất): `IN_PROGRESS` → `SUBMITTED` | `EXPIRED`, bảng chuyển, unit test.
  - [ ] Subtask 4.3.2.3 — Liên kết NV ↔ phiên: đề xuất cột `preferences.exam_session_id`, ghi qua service đã export của module `matching` (không ghi thẳng bảng `preferences`).
- [ ] **TASK-4.3.3** — Hàm thuần rút đề (AC: 1, 2, 3)
  - [ ] Subtask 4.3.3.1 — `apps/api/src/modules/assessment/domain/draw-exam.ts`: `drawExam(questions, blueprint, seed)` dùng PRNG có seed, xáo câu và phương án, sinh mã phương án mờ theo phiên.
  - [ ] Subtask 4.3.3.2 — `apps/api/src/modules/assessment/domain/draw-exam.spec.ts`: property test BR-05.
- [ ] **TASK-4.3.4** — API phòng thi (AC: 1, 3, 4, 5, 6, 7, 8, 12, 14)
  - [ ] Subtask 4.3.4.1 — `apps/api/src/modules/assessment/api/exam-session.controller.ts`: start, `GET` session, answers, submit; `@Roles('STUDENT')`, kiểm chủ sở hữu trong service.
  - [ ] Subtask 4.3.4.2 — `packages/shared/schemas/exam-session.ts`: DTO response dạng whitelist (chỉ liệt kê trường được gửi), không có trường đáp án.
  - [ ] Subtask 4.3.4.3 — Kiểm pha đợt qua service đã export của `campaign` (US-1.4); đọc tham số chia sẻ ngân hàng (Q2).
- [ ] **TASK-4.3.5** — Lưu tạm trong Redis và đổ về PostgreSQL (AC: 6, 8, 9)
  - [ ] Subtask 4.3.5.1 — `apps/api/src/modules/assessment/infrastructure/exam-answer-store.ts`: `HSET` vào `exam:{sessionId}:answers`, TTL đến khi nộp + 1 ngày; `flushToDb()` trong giao dịch nộp/đóng.
- [ ] **TASK-4.3.6** — Tác vụ định kỳ (AC: 9, 10)
  - [ ] Subtask 4.3.6.1 — `apps/api/src/modules/assessment/application/exam-scheduler.ts`: đóng phiên hết giờ; hủy NV quá hạn làm test qua service của `matching` + `transitionTo`; giữ `pg_try_advisory_lock`.
- [ ] **TASK-4.3.7** — Giao diện phòng thi (AC: 13)
  - [ ] Subtask 4.3.7.1 — Đọc `DESIGN.md` trước khi code, ghi `Design applied: …` vào story; theo quy tắc của skill shadcn.
  - [ ] Subtask 4.3.7.2 — `apps/web/src/features/exam/`: trang bắt đầu (thông tin T_test, số câu, cảnh báo làm một lần), trang làm bài (điều hướng câu, đồng hồ, chỉ báo lưu), hook tự lưu (debounce + 30 giây + gửi lại khi có mạng).
- [ ] **TASK-4.3.8** — Test (AC: 1–14)
  - [ ] Subtask 4.3.8.1 — `apps/api/test/assessment/exam-room.spec.ts`: luồng đầy đủ với PostgreSQL + Redis thật (testcontainers), quét khóa cấm trong response, IDOR, hai yêu cầu bắt đầu đồng thời, `FakeClock` cho hết giờ.
  - [ ] Subtask 4.3.8.2 — `apps/web/e2e/exam-room.spec.ts` (Playwright, đề xuất): viewport 360 px, mất mạng rồi có lại, hết giờ.

## Dev notes

### Architecture constraints

- AGENTS › Nguyên tắc 8: đáp án không bao giờ xuống client; deadline do server quyết định. DTO response viết dạng whitelist để thêm cột mới vào `questions` không vô tình lộ ra.
- [AD-8](../../ARCHITECTURE.md#architecture-decisions): đổi trạng thái phiên và NV đi qua `transitionTo` + audit + `row_version`. Không dùng thư viện state machine.
- AGENTS › Nguyên tắc 11: BR-06 có ràng buộc ở DB (unique `(student_id, bank_id)`), không chỉ kiểm trong code. Ràng buộc này tự đúng cho cả hai chế độ của Q2, vì khi dùng chung thì các JD chung một ngân hàng.
- AGENTS › Nguyên tắc 13: `assessment` không đọc hay ghi bảng `preferences` (của `matching`) và `campaigns` (của `campaign`). Nó gọi service đã export.
- Tự lưu chỉ ghi Redis (ARCH › *Data architecture*). Ghi PostgreSQL ở mỗi lần tự lưu bị loại vì 200 sinh viên × (debounce + 30 giây) tạo tải ghi không cần thiết.
- **Chạm Q2:** tạm dùng Đề xuất "Theo JD; các JD cùng nhóm vị trí được phép dùng chung". Tham số `campaigns.config.share_exam_by_position_group` (mặc định `false`). Hỏi trước khi chốt.
- **Điểm chưa rõ trong spec — hỏi trước khi chốt:**
  - Sinh viên bắt đầu sát hạn pha *Làm test*: story tạm đặt `deadline_at = started_at + T_test` và không cho bắt đầu sau hạn pha. Phương án khác là cắt `deadline_at` theo hạn pha.
  - ARCH không có cột nối NV với phiên thi, cũng không có `status`, `row_version` trên `exam_sessions`. Các cột trên là đề xuất.
  - Có cho vài giây ân hạn với lần tự lưu đến sau `deadline_at` do trễ mạng không. Story tạm không cho.
- Phần D (xác minh CV) chèn vào phòng thi ở [US-4.8](US-4.8-cv-verification-questions-trust-score.md). Ghi nhận hành vi (chuyển tab, toàn màn hình, copy/paste) và endpoint `POST /api/exam-sessions/{id}/events` thuộc [US-4.7](US-4.7-cheating-signals.md). Story này chỉ tạo bảng `exam_events` trong cùng migration.

### Cross-story dependencies

- Builds on [US-4.1](US-4.1-exam-blueprint-test-generator.md): `question_banks.blueprint`, bảng `questions`.
- Builds on [US-4.2](US-4.2-validator-and-question-bank-lock.md): `getDrawableQuestions()` và seed ngân hàng đã khóa `apps/api/src/db/seeds/locked-question-bank.ts`. Bảng epic không ghi US-4.2 vào `depends_on`, nhưng lịch D20 đặt US-4.2 ở T8, trước story này.
- Builds on [US-3.3](US-3.3-shortlist-and-preferences.md): `preferences` (NV ở `PENDING_TEST`) và bảng chuyển trạng thái hồ sơ ứng tuyển trong `packages/shared/states/application.ts`.
- Builds on [US-1.2](US-1.2-core-db-schema-transition-audit-log.md) (`transitionTo`, audit), [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md) (`@Roles()`, helper test IDOR, `DESIGN.md`), [US-1.4](US-1.4-campaign-setup-and-config.md) (pha đợt, `T_test`, `phase_deadlines`, `Clock`/`FakeClock`), [US-1.7](US-1.7-notifications-sse-email-reminders.md) (thông báo hủy NV).
- Required by [US-4.4](US-4.4-grading-stest-sfinal.md): sự kiện đóng phiên, `exam_answers`, `submitted_at`.
- Required by [US-4.7](US-4.7-cheating-signals.md) (bảng `exam_events`, giao diện phòng thi) và [US-4.8](US-4.8-cv-verification-questions-trust-score.md) (thêm phần D vào phòng thi).
- Required by [US-6.6](US-6.6-demo-data-e2e-load-test.md): kịch bản k6 gọi đúng các endpoint ở đây.
- Sibling [US-4.8](US-4.8-cv-verification-questions-trust-score.md) và [US-4.9](US-4.9-question-bank-sample-review.md) (cùng tuần T9): US-4.8 sửa `apps/web/src/features/exam/`; story này merge trước.

### Performance budget

- Khoảng 200 sinh viên làm đồng thời (NFR-9). Kiểm thử tải bằng k6 ở [US-6.6](US-6.6-demo-data-e2e-load-test.md): không lỗi, không mất bài.
- Tự lưu mỗi lần đổi đáp án (debounce) và mỗi 30 giây (NFR-10). Mỗi lần tự lưu là một lệnh `HSET` vào Redis, không có truy vấn PostgreSQL.
- Rút đề là một giao dịch ngắn; danh sách câu `VALIDATED` của ngân hàng đã khóa đọc một lần rồi cache theo `(bank_id, version)`.
- PR của story phải ghi rõ các quy tắc thiết kế trên đã được giữ.

### What we explicitly did NOT do

- Không chấm bài, không tính S_test: thuộc [US-4.4](US-4.4-grading-stest-sfinal.md).
- Không chạy kiểm thử tải trong story này: thuộc [US-6.6](US-6.6-demo-data-e2e-load-test.md).
- Không dùng WebSocket để giữ phiên: REST + tự lưu là đủ (AD-13 chỉ dùng SSE cho luồng một chiều).
- Không chặn thi trên thiết bị không có Fullscreen API: tín hiệu chỉ để cảnh báo ([US-4.7](US-4.7-cheating-signals.md)).

### References

- [Source: PRD › GĐ5 – Sinh và tổ chức bài test (Tổ chức thi)](../../PRD.md)
- [Source: PRD › Vòng đời trạng thái › Hồ sơ ứng tuyển](../../PRD.md)
- [Source: PRD › Quy tắc nghiệp vụ (BR-05, BR-06)](../../PRD.md)
- [Source: PRD › Functional Requirements (FR-20), Non-Functional Requirements (NFR-9, NFR-10)](../../PRD.md#functional-requirements)
- [Source: ARCHITECTURE › Frontend › Phòng thi](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Luồng làm và chấm bài test](../../ARCHITECTURE.md#messaging-and-data-flow)
- [Source: ARCHITECTURE › Data architecture (Các bảng chính, Redis)](../../ARCHITECTURE.md#data-architecture)
- [Source: ARCHITECTURE › Security architecture](../../ARCHITECTURE.md#security-architecture)
- [Source: ARCHITECTURE › Tác vụ định kỳ, Quản lý trạng thái](../../ARCHITECTURE.md)
- [Source: CONTEXT D8, D20](../../CONTEXT.md)
- [Source: Epic EPIC-4](../epics/EPIC-4.md)

## Verification commands

> Chưa có `package.json`. Lệnh chạy cụ thể sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `apps/api/test/assessment/exam-room.spec.ts` › `GĐ5 start draws per blueprint cell, shuffles server-side, stores seed and deadline_at` |
| AC-2 | `apps/api/src/modules/assessment/domain/draw-exam.spec.ts` › `BR-05 property: every draw has same cell counts and duration`; `BR-05 same seed and bank version reproduce draw` |
| AC-3 | `apps/api/test/assessment/exam-room.spec.ts` › `GĐ5 no response of exam API contains answer_key, rubric, explanation, sample answer or correctness` |
| AC-4 | `apps/api/test/assessment/exam-room.spec.ts` › `BR-06 restart returns same session; 409 after submit; concurrent starts create one session` |
| AC-5 | `apps/api/test/assessment/exam-room.spec.ts` › `GĐ5 IDOR other student 404; HR/CENTER 403; wrong phase, state or unlocked bank 409` |
| AC-6 | `apps/api/test/assessment/exam-room.spec.ts` › `NFR-10 autosave writes Redis only, idempotent; 409 EXAM_CLOSED after deadline` |
| AC-7 | `apps/api/test/assessment/exam-room.spec.ts` › `GĐ5 resume returns same questions, order, saved answers and unchanged deadline` |
| AC-8 | `apps/api/test/assessment/exam-room.spec.ts` › `GĐ5 submit flushes answers in one transaction, audits, emits closed event; second submit idempotent` |
| AC-9 | `apps/api/test/assessment/exam-scheduler.spec.ts` › `GĐ5 expired session auto-closed with submitted_at = deadline_at; advisory lock prevents double close` |
| AC-10 | `apps/api/test/assessment/exam-scheduler.spec.ts` › `BR-06 untaken preference closed with TEST_NOT_TAKEN and audit; stale row_version skipped` |
| AC-11 | `rg -n "Date\.now\(\)\|new Date\(\)" apps/api/src/modules/assessment` trả về 0 dòng; `apps/api/test/assessment/exam-room.spec.ts` › `GĐ5 auto-closes expired session using FakeClock` |
| AC-12 | `apps/api/test/assessment/exam-room.spec.ts` › `GĐ5 rate limit returns 429; debounced 30s autosave stays under limit` |
| AC-13 | `apps/web/e2e/exam-room.spec.ts` (Playwright, đề xuất) › `NFR-13 360px no horizontal scroll; countdown from server time; offline answers resent; locked at zero` |
| AC-14 | `apps/api/test/assessment/exam-room.spec.ts` › `Q2 shared bank reuses one session across preferences when enabled; separate sessions by default` |

## Changelog entry

### Added
- Phòng thi cho sinh viên: rút đề theo ma trận đề có lưu seed, xáo câu và phương án phía server, giờ hết hạn do server quyết định, tự lưu mỗi lần đổi đáp án và mỗi 30 giây, làm tiếp khi mất mạng, giao diện dùng tốt trên điện thoại.
- Mỗi bài chỉ làm một lần (BR-06), có ràng buộc unique ở DB; server tự đóng bài hết giờ và tự hủy NV không làm test trước hạn.
- Bảng `exam_sessions`, `exam_answers`, `exam_events`.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-20, NFR-9, NFR-10](../../PRD.md#functional-requirements)
- [Epic EPIC-4](../epics/EPIC-4.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D8, D20](../../CONTEXT.md)
- [US-4.4 Chấm bài, S_test và S_final](US-4.4-grading-stest-sfinal.md)
- [US-6.6 Dữ liệu demo, E2E, kiểm thử tải](US-6.6-demo-data-e2e-load-test.md)
