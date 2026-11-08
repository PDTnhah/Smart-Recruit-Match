---
id: US-4.3
title: "Phòng thi"
epic: EPIC-4
status: review
priority: P0
points: 8
sprint: sprint-2026-W45
version_shipped: 0.22.0
prd_ref: [FR-20, NFR-9, NFR-10]
depends_on: [US-4.1, US-3.3]
assignee:
commit:
created: 2026-10-07
updated: 2026-11-08
---

## Story refresh — 2026-11-08 (bắt đầu story)

Người dùng chốt bốn điểm theo cột Đề xuất ([D51](../../CONTEXT.md)): `deadline_at` không vượt `testing_end`; ân hạn 10 s; AC-14 cũ (dùng chung bài theo nhóm vị trí) bỏ theo D49, AC-14 mới là `GET /api/me/exams`; AC-13 kiểm tay, Playwright để US-6.6. Liên kết NV ↔ phiên suy ra từ `(student_id, bank.jd_id)`. Nhánh `us-4.3` từ `dev` `513708c`.

## Goal

Sinh viên làm bài test cho từng nguyện vọng trên điện thoại hoặc máy tính, mỗi bài một lần. Server quyết định giờ hết hạn. Bài làm tự lưu và làm tiếp được khi mất mạng. Đáp án không rời server. Mọi SV cùng JD làm đề tương đương. Phòng thi được thiết kế cho khoảng 200 SV làm cùng lúc. Mọi logic thời gian dùng `Clock` / `FakeClock` của [US-1.4](US-1.4-campaign-setup-and-config.md).

## Background

FR-20 (UC-14), BR-05 (đề tương đương), BR-06 (một lần; không làm trước hạn thì NV bị hủy), NFR-9 (200 SV), NFR-10 (tự lưu 30 giây). NV `PENDING_TEST → CLOSED` ở story này; `→ TEST_GRADED` thuộc [US-4.4](US-4.4-grading-stest-sfinal.md).

**Lessons applied**: §12, §15, §21, §22 (chỉ `exam-scheduler.int-spec.ts` gọi `runOnce()`), §30, §34, §35, §36, §38 (NV, pha, ngân hàng đọc lại trong giao dịch có khóa).

## Acceptance criteria

- [x] **AC-1** — **Given** NV `PENDING_TEST`, đợt `TESTING` trước `testing_end`, ngân hàng của JD đã khóa, **When** `POST /api/preferences/{id}/exam/start`, **Then** server rút từ câu `VALIDATED` đúng số câu mỗi ô (kỹ năng × độ khó) của `blueprint`, không lặp, xáo câu và phương án phía server **And** lưu `exam_sessions` (`seed`, `bank_version`, `question_ids`, `option_layout`, `started_at`, `deadline_at = min(started_at + duration_minutes, testing_end)` theo `Clock`) và `exam:{id}:session` ở Redis **And** trả đề, `deadline_at`, `server_now`.
- [x] **AC-2** — Đề tương đương (BR-05): property test (fast-check) với nhiều seed và ngân hàng: cùng số câu mỗi ô, cùng số câu phần B, cùng thời lượng. Cùng `seed` và phiên bản ngân hàng cho cùng đề và thứ tự, bất kể thứ tự đầu vào. Hàm rút đề không nhận dữ liệu CV.
- [x] **AC-3** — Không response nào của phòng thi chứa `answer_key`, `rubric`, giải thích, đáp án mẫu, cờ đúng/sai hay vị trí gốc của phương án; mã phương án mờ theo từng phiên. Test duyệt đệ quy mọi khóa JSON của từng response.
- [x] **AC-4** — Một lần mỗi bài (BR-06): bắt đầu lại khi phiên đang mở thì trả đúng phiên đó **And** đã đóng thì `409 EXAM_ALREADY_TAKEN` **And** unique `exam_sessions(student_id, bank_id)`: hai lần bắt đầu đồng thời chỉ tạo một phiên.
- [x] **AC-5** — NV/phiên của SV khác: `404` **And** `HR`, `CENTER`: `403` **And** NV không `PENDING_TEST` (`409 PREFERENCE_NOT_PENDING_TEST`), ngoài pha hoặc qua `testing_end` (`409 CAMPAIGN_PHASE_MISMATCH`), ngân hàng chưa khóa (`409 BANK_NOT_LOCKED`).
- [x] **AC-6** — `PUT /api/exam-sessions/{id}/answers` ghi `exam:{id}:answers` bằng một script Lua, không truy vấn PostgreSQL **And** gửi lại cùng payload cho cùng kết quả **And** câu lạ hoặc mã lạ: `422 EXAM_ANSWER_INVALID` **And** đã nộp hoặc đã qua `deadline_at + 10 s` (`EXAM_SAVE_GRACE_MS`): `409 EXAM_CLOSED`, không lưu.
- [x] **AC-7** — Mất mạng hoặc tải lại: `GET /api/exam-sessions/{id}` trả đúng đề và thứ tự (cả câu bị loại sau khi rút), câu đã lưu và `deadline_at` cũ; thời gian mất mạng không được cộng.
- [x] **AC-8** — `POST .../submit`: Redis đóng phiên trước, rồi một giao dịch ghi `exam_answers` và `IN_PROGRESS → SUBMITTED` qua `transitionTo` có audit, `submitted_at = min(now, deadline_at)` **And** phát `exam.session.closed` **And** nộp lần hai trả cùng kết quả **And** nộp sau `deadline_at + 10 s` thì `EXPIRED`, `submitted_at = deadline_at`.
- [x] **AC-9** — Phiên qua `deadline_at + 10 s` chưa nộp: tác vụ định kỳ (mỗi phút, `withAdvisoryLock(EXAM_SWEEP)`) đóng như AC-8 với `EXPIRED` **And** hai lần chạy cùng lúc không đóng trùng.
- [x] **AC-10** — Đợt `TESTING`/`ALLOCATION_REVIEW` đã qua `testing_end`: NV `PENDING_TEST` chưa có phiên chuyển `CLOSED` qua `transitionTo`, lý do `TEST_NOT_TAKEN`, audit cùng giao dịch (BR-06) **And** lệch `row_version` thì bỏ qua, lần sau xử lý **And** SV nhận `EXAM_NOT_TAKEN` (app và email).
- [x] **AC-11** — Logic thời gian của `assessment` dùng `Clock` inject, không `Date.now()`/`new Date()`; test dùng `FakeClock` ở `test/helpers/fake-clock.ts`.
- [x] **AC-12** — Quá giới hạn (`ratelimit:{userId}:{route}`, 60 s): `429 RATE_LIMITED` kèm `Retry-After`. Bắt đầu 10, xem phiên 30, tự lưu 120, nộp 10, danh sách 30. Client (debounce 1,5 s, chu kỳ 30 s) không chạm giới hạn.
- [ ] **AC-13** — Giao diện `features/exam/`, chuỗi tiếng Việt, kiểm tay ở 360 / 768 / 1024 px:
  - `/sv/exams`: NV kèm T_test, số câu, "chỉ làm một lần", cảnh báo khi còn ít hơn T_test tới `testing_end`; xác nhận trước khi bắt đầu.
  - Phòng thi `/sv/exam/:sessionId` ngoài `StudentLayout`, layout tối giản, 360 px không cuộn ngang; đồng hồ theo `deadline_at` và độ lệch `server_now`; chỉ báo "Đã lưu / Đang lưu / Mất kết nối – sẽ lưu lại".
  - Câu chưa gửi được giữ lại (cả khi tải lại) và gửi khi có mạng. Về 0 thì khóa ô nhập, hiện "Hết giờ", gửi phần còn chờ rồi nộp. Xác nhận trước khi nộp.
- [x] **AC-14** — `GET /api/me/exams`: NV của đợt hiện tại với `preferenceId`, thứ hạng, JD, trạng thái bài test (`NOT_STARTED` / `IN_PROGRESS` / `SUBMITTED` / `EXPIRED` / `CLOSED`), `sessionId`, thời lượng, số câu, `deadlineAt`, thời gian còn lại nếu bắt đầu ngay, `serverNow`.

## Tasks

- [x] **TASK-4.3.1** — `packages/shared/states/exam-session.ts` + `examSessionLifecycle`; migration `0032` (`exam_sessions`, `exam_answers`, `exam_events`), `CORE_TABLES` (AC: 4, 8, 9)
- [x] **TASK-4.3.2** — `assessment/domain/draw-exam.ts`, `exam-deadline.ts` + test property BR-05 (AC: 1, 2, 3, 11)
- [x] **TASK-4.3.3** — `PreferenceExamService` của `matching`: đọc/khóa NV, NV `PENDING_TEST`, `closeTestNotTaken` (AC: 1, 5, 10)
- [x] **TASK-4.3.4** — API: schema `packages/shared/schemas/exam-session.ts` + mã lỗi; `common/rate-limit/`; `ExamSessionService` + cache ngân hàng; controller; `pnpm api:sync` (AC: 1, 3–8, 12, 14)
- [x] **TASK-4.3.5** — `exam-answer-store.ts`: Lua lưu, đóng-rồi-đọc, mở lại, dựng lại khi mất key (AC: 6, 8)
- [x] **TASK-4.3.6** — `exam-scheduler.ts`: đóng phiên hết giờ, hủy NV không làm test, `EXAM_NOT_TAKEN` + migration `0033` + template email (AC: 9, 10)
- [ ] **TASK-4.3.7** — Giao diện (AC: 13)
  - [x] 4.3.7.1 — Đọc `DESIGN.md`, ghi `Design applied:`; theo skill shadcn.
  - [x] 4.3.7.2 — `/sv/exams`, `/sv/exam/:sessionId`, đồng hồ server, tự lưu; việc "Làm bài test" ở trang chủ SV.
  - [ ] 4.3.7.3 — Kiểm tay theo checklist ở *Implementation notes*.
- [x] **TASK-4.3.8** — Integration test `exam-room.int-spec.ts`, `exam-scheduler.int-spec.ts`, helper `test/helpers/exam.ts` (AC: 1, 3–12, 14)

## Dev notes

- Nguyên tắc 8: response dạng whitelist, câu hiển thị không chọn `answer_key`, mã phương án từ `crypto.randomInt` ([D52](../../CONTEXT.md)). Nguyên tắc 10, 11: `transitionTo`, unique cho BR-06. Nguyên tắc 13: `assessment` gọi `PreferenceExamService`, `CampaignService`, `JdService`.
- Hiệu năng (NFR-9, k6 ở US-6.6): tự lưu là một lượt Redis (Lua); câu của ngân hàng cache theo `(bank_id, version)`, nạp đồng thời dùng chung; giao dịch bắt đầu không chứa phép rút đề.
- Cho story sau: US-4.4 nghe `exam.session.closed` và cần tác vụ quét phiên chưa chấm (LESSONS §34); US-4.7 ghi `exam_events` và `POST .../events`; US-4.8 thêm phần D. Không làm: chấm (US-4.4), k6 (US-6.6), WebSocket (AD-13), Fullscreen (US-4.7), dùng chung bài giữa JD (Q2, D49).

### Giới hạn đã biết

- Nộp trong ân hạn mà tác vụ quét lấy khóa dòng trước thì phiên thành `EXPIRED` thay vì `SUBMITTED`; `submitted_at` và câu trả lời như nhau.
- Mở lại Redis sau giao dịch đóng lỗi có thể trùng một lần nộp khác vừa commit (hai tab, lỗi DB đúng lúc): lần lưu kế tiếp được nhận nhưng không vào bài ([D52](../../CONTEXT.md)).
- Hàng chờ ghi `localStorage` mỗi lần gõ (chỉ câu chưa lưu; chưa đo trên máy yếu), dạng rõ tới khi nộp. Rate limit cho qua khi Redis lỗi (D51).

## Verification commands

Integration: `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/(exam-room|exam-scheduler)' --selectProjects integration`. Unit: `--testPathPatterns 'assessment' --selectProjects unit`. R = `apps/api/test/integration/exam-room.int-spec.ts`, S = `exam-scheduler.int-spec.ts`, D = `apps/api/src/modules/assessment/domain/__tests__/draw-exam.spec.ts`, C = `application/drawable-bank-cache.spec.ts`.

| AC | Test |
|---|---|
| AC-1 | R › `GĐ5 start draws per cell, shuffles, stores seed, caps deadline` |
| AC-2 | D › `BR-05 property: same cell counts and duration`; `BR-05 same seed reproduces draw` |
| AC-3 | R › `GĐ5 no exam response carries answer key fields`; D › `GĐ5 AC-3 the option codes come from their own source, not from the seed` |
| AC-4 | R › `BR-06 restart resumes; 409 after submit; concurrent starts make one session` |
| AC-5 | R › `GĐ5 IDOR 404; HR/CENTER 403; state, phase, bank 409` |
| AC-6 | R › `NFR-10 autosave Redis only, idempotent; 422; 409 after grace` |
| AC-7 | R › `GĐ5 resume keeps paper, order, answers, deadline` |
| AC-8 | R › `GĐ5 submit flushes in one transaction, emits event, idempotent`; `GĐ5 a close that fails lets saves in again; Redis rebuilt open meanwhile is closed by the submit` |
| AC-9 | S › `GĐ5 expired session closed at deadline_at; concurrent sweeps close once` |
| AC-10 | S › `BR-06 untaken preference closed TEST_NOT_TAKEN; stale row skipped` (NV đã có phiên không bị khóa) |
| AC-11 | `rg -n "Date\.now\(\)\|new Date\(\)" apps/api/src/modules/assessment` = 0 dòng |
| AC-12 | R › `GĐ5 rate limit 429; autosave cadence under limit` |
| AC-13 | Kiểm tay (checklist ở *Implementation notes*) |
| AC-14 | R › `GĐ5 my exams lists status and remaining time` |
| NFR-9 | C › `concurrent starts share one read`; `a failed read is not kept` |

## Changelog entry

Đã chép vào [CHANGELOG 0.22.0](../../CHANGELOG.md).

## Implementation notes

- **Phiên 1–2c:** thiết kế ở D51. Seed `randomInt(0, 2 ** 31)` (cột `integer`). Migration `0033` cho loại thông báo mới. Route `/sv/exam/:id` thay `/exam/:id` để đăng nhập lại quay về phòng thi (DESIGN §12). **Design applied:** §1, §4, §5 (360 px, 44 px, `Sheet` dưới), §6 (`radio-group`, `badge`, `alert`, `alert-dialog`), §7, §9, §10 (`formatMinutes`, `formatCountdown`), §11 (`role="timer"`, `role="status"` khi lỗi), §12.
- **Phiên 3:** `/code-review` nêu 15 điểm, sửa 12 (hai điểm ở *Giới hạn đã biết*, một là cỡ story). Web: tự lưu không bỏ qua debounce, lô ≤ 50 câu và 80 KB (LESSONS §41), hết giờ đóng hộp thoại nộp, 422 hiện lại câu server giữ, tự luận chỉ khoảng trắng không tính, lỗi `/api/me/exams` không che trang chủ. API: đóng lỗi thì mở lại Redis, đóng cả bản Redis vừa dựng lại (D52), cache gộp lần nạp, tác vụ quét bỏ NV đã có phiên và phân trang, `RedisModule.quit()` lỗi thì `disconnect()`. koni-qc bảo mật (một lượt, tự phản biện): mã phương án từ mulberry32 lộ vị trí gốc → `crypto.randomInt` (D52, LESSONS §39); đã loại IDOR, đổi hạn từ client, Lua injection, XSS. Self-verify: typecheck, lint, depcruise, `pnpm test` 870/870, shared 348/348, `pnpm build`.
- **Checklist AC-13** (TASK-4.3.7.3, người dùng làm). Dữ liệu: `db:migrate`, `db:seed`, `db:seed:question-bank`; đợt mẫu sang `TESTING` (`UPDATE core.campaigns SET status = 'TESTING', phase_deadlines = phase_deadlines || jsonb_build_object('testing_end', '<ISO>')`); NV1 cho `sv001@srm.local` (`INSERT INTO core.preferences (campaign_id, student_id, jd_id, rank)`, `jd_id` của `core.question_banks`).
  1. `/sv/exams` (360 / 768 / 1024 px): thẻ có NV, T_test, số câu, "Chỉ làm một lần", không cuộn ngang; `testing_end` gần hơn T_test thì có cảnh báo ở thẻ và hộp thoại.
  2. "Bắt đầu làm bài": `Sheet` dưới ở 360 px, `AlertDialog` từ 768 px. Trang chủ có việc "Làm bài test".
  3. Phòng thi 360 px: không cuộn ngang; chọn phương án → "Đang lưu…" rồi "Đã lưu"; "Câu trước/sau", lưới câu; `?q=` giữ câu khi tải lại.
  4. DevTools Offline: sửa câu → "Mất kết nối – sẽ lưu lại", bật mạng → "Đã lưu". Offline, sửa, đóng tab, bật mạng, mở "Làm tiếp": câu vừa sửa còn và được lưu.
  5. Tải lại: đề, thứ tự, câu đã lưu, hạn nộp giữ nguyên.
  6. Hết giờ (bắt đầu khi `testing_end` còn 2–3 phút), thử cả khi hộp thoại "Nộp bài?" đang mở: toast còn 1 phút; về 0 thì hộp thoại đóng, ô nhập khóa, "Hết giờ", tự nộp.
  7. "Nộp bài": hộp thoại có số câu chưa trả lời; kết quả có số câu đã trả lời; `/sv/exams` hiện "Đã nộp".

## Files modified

`packages/shared/` (states, schemas), `apps/api/drizzle/` (`0032`, `0033`), `apps/api/src/` (`db/`, `common/`, `redis/`, `modules/` assessment, matching, company, notification), `apps/api/test/`, `apps/web/src/` (`features/exam/`, router, trang chủ SV, `lib/format.ts`, API client); `DESIGN.md`, `AGENTS.md`; `docs/` (CONTEXT D51–D52, LESSONS §39–§41, ARCHITECTURE, PRD, EPIC-4, W45, CHANGELOG).

## Cross-references

- [PRD FR-20, NFR-9, NFR-10](../../PRD.md#functional-requirements) · [Epic EPIC-4](../epics/EPIC-4.md) · [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D51, D52](../../CONTEXT.md) · [US-4.4](US-4.4-grading-stest-sfinal.md) · [US-6.6](US-6.6-demo-data-e2e-load-test.md)
