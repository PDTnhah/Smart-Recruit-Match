---
id: US-4.8
title: "Câu hỏi xác minh CV và chỉ số tin cậy"
epic: EPIC-4
status: review
priority: P1
points: 8
sprint: sprint-2026-W47
version_shipped: 0.26.0
prd_ref: [FR-25]
arch_ref: [AD-2, AD-4, AD-5, AD-6, AD-10]
depends_on: [US-4.1, US-4.3, US-4.4, US-2.4]
assignee:
commit: cfbb63c
created: 2026-10-07
updated: 2026-11-18
---

## Story refresh — 2026-11-16 (bắt đầu story)

Story viết trước D49, D51, D53. Phiên Plan chốt các điểm mở ([D57](../../CONTEXT.md)): sinh câu khi đợt sang `TESTING`, ngưỡng chỉ số là hằng số, thời gian tính chung trong T_test, thêm khối xem cho Trung tâm. Thay đổi so với bản trước:

- AC-1: bật/tắt phần D là cột riêng của `question_banks`, không nằm trong contract `ExamBlueprintSchema`.
- AC-2: payload thêm `cv_id`, `cv_version`, `jd_id`, `question_count`. Câu được sinh bởi tác vụ quét khi đợt ở `TESTING`.
- AC-6: phần D tách khỏi `question_ids`/`exam_answers` bằng cấu trúc, nên dùng unit test thay property test.
- AC-7: thêm khối xem cho CENTER. AC-8: fixture ở `tests/fixtures/llm/`.
- Bỏ TASK-4.8.1 (agent chỉ gọi `LLMClient`) và fixture vòng lặp tool-use của EPIC-4 (D49). Ước lượng 5 → 8 điểm.

## Goal

HR có thêm một tín hiệu để biết sinh viên có thật sự làm những gì họ khai trong CV hay không. Khi phần D được bật cho JD, bài test có thêm 2–3 câu hỏi về chính dự án và kỹ năng mà sinh viên đã khai. Câu trả lời được đối chiếu với CV và quy thành "chỉ số tin cậy CV". Chỉ số này chỉ để tham khảo. Nó không tính vào S_test, S_final, và không ảnh hưởng tới phân bổ.

## Background

FR-25, PRD › GĐ5 › *Cấu trúc đề mặc định*: phần D (tùy chọn) gồm 2–3 câu về dự án/kỹ năng SV khai trong CV, **không** tính vào S_test. Đây là phần duy nhất cá nhân hóa theo CV; không trái BR-05 vì phần tính điểm vẫn giống nhau cho mọi SV. Câu hỏi sinh từ `profile_masked` ([US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md), BR-03), LLM `medium`.

**Lessons applied**: §22 (lọc theo đợt của test), §30 (`CORE_TABLES`, `ai-service-role`), §31 (khóa fixture), §32 (contract chỉ kiểm hình dạng), §33 (`job_id` trước dispatch), §34 (tác vụ quét ở mốc pha), §43 (`row_version`), §44 (lỗi sau commit), §47 (CRLF).

Lessons: none new — bẫy `partial_ratio` (trích dẫn dài hơn nguồn được 100 điểm) chỉ gặp khi đối chiếu với câu trả lời ngắn của phần D; đã ghi ở `quote_score` và có test.

## Acceptance criteria

- [ ] **AC-1** — `question_banks` có `cv_verification_enabled` (mặc định `false`) và `cv_verification_count` (CHECK 2–3). `GET`/`PUT /api/jds/{id}/exam-blueprint` có khối `cvVerification: { enabled, questionCount }`. `CENTER` bật hoặc tắt khi ngân hàng còn sửa được (trước khi khóa). `questionCount` ngoài 2–3 thì `400`.
- [x] **AC-2** — **Given** đợt ở `TESTING`, JD bật phần D, NV `PENDING_TEST` chưa có phiên thi, **When** tác vụ quét chạy, **Then** một dòng `cv_verifications` (`RUNNING`, `job_id`) được ghi trước khi phát `ai.cv_verification.generate` với `{ job_id, preference_id, cv_id, cv_version, jd_id, question_count }` **And** agent đọc `profile_masked` và yêu cầu JD qua view chỉ đọc, sinh 2–3 câu, mỗi câu gắn với một mục SV đã khai (`claim_ref`), `effort: medium`, structured output **And** câu lưu vào `cv_verification_questions`, dòng `READY` kèm `model`, `prompt_version` **And** refusal hoặc sai schema sau khi thử lại thì dòng `FAILED`, có log, NV không có phần D, không chặn SV thi.
- [x] **AC-3** — Request gửi LLM ở cả bước sinh và bước đối chiếu chỉ chứa trường của `profile_masked`, yêu cầu JD và câu trả lời. Không có tên, email, số điện thoại, ảnh, ngày sinh, giới tính, quê quán, tôn giáo, tình trạng hôn nhân (BR-03). Test chụp request ở chế độ fixture và kiểm danh sách khóa và giá trị cấm.
- [ ] **AC-4** — **Given** NV có câu `READY` lúc bắt đầu thi, **When** SV làm bài, **Then** phần D hiện thành mục riêng có nhãn "Không tính điểm", tự lưu như câu tự luận **And** response không có đáp án hay ý mong đợi **And** NV chưa có câu `READY` lúc bắt đầu thì phiên bắt đầu không có phần D, không chờ. Thời gian làm phần D tính chung trong T_test.
- [x] **AC-5** — **Given** phiên đã đóng, **When** tác vụ quét phát `ai.cv_verification.evaluate`, **Then** mỗi câu có nhận định `CONSISTENT`/`PARTIAL`/`INCONSISTENT`/`NO_ANSWER` kèm trích dẫn từ câu trả lời và lý do **And** câu bỏ trống là `NO_ANSWER` do code đặt, không gửi LLM **And** trích dẫn không khớp câu trả lời (RapidFuzz < 85) thì `CONSISTENT`/`PARTIAL` bị hạ xuống `INCONSISTENT` **And** code tính chỉ số = trung bình của 1 / 0,5 / 0 / 0 (×100, half-up); mức Cao ≥ 75, Trung bình ≥ 40, còn lại Thấp (hằng số ở `@srm/shared`).
- [x] **AC-6** — Phần D không ảnh hưởng điểm: câu D nằm ở `exam_sessions.verification_question_ids`, không ở `question_ids`, nên không vào `exam_answers`, `computeSTest`, `computeSkillScores`, `computeSFinal`. Không bước chuyển trạng thái nào đọc chỉ số tin cậy.
- [ ] **AC-7** — `CENTER` xem chỉ số và chi tiết từng câu của một phiên qua `GET /api/exam-sessions/{id}/cv-trust`, và trong Sheet chấm tay; `HR`, `STUDENT` gọi endpoint này nhận `403`. Module `assessment` export `CvTrustService.getForPreference(preferenceId)` cho [US-5.3](US-5.3-hr-nomination-review.md), kèm kiểm tra BR-11 ở đó. SV không xem được chỉ số của mình.
- [x] **AC-8** — Fixture ở `ai-service/tests/fixtures/llm/cv_verification/` và `cv_verification_check/` có các ca: sinh câu bình thường, refusal, câu trả lời khớp CV, câu trả lời mâu thuẫn, trích dẫn bịa. Ca bỏ trống không cần fixture vì không gọi LLM. Không test nào gọi API thật.

## Tasks

- [x] **TASK-4.8.2** — Hợp đồng `cv-verification.ts` + `contracts:gen`, `cv-trust.ts`, `cvVerification` của ma trận đề, phần `D` của đề; migration `0040`, `0041` (view `v_ai_cv_verification_answers`) (AC: 1, 2, 5, 6) — phiên 2a
- [x] **TASK-4.8.4** — Phòng thi phía API: gắn câu `READY` khi mở phiên, nối phần D vào đề, lưu câu trả lời khi đóng (AC: 4, 6) — phiên 2a
- [x] **TASK-4.8.5** — `CvVerificationScheduler`, `CvVerificationResultsHandler`, `domain/cv-verification.ts` (AC: 2, 5) — phiên 2a
- [x] **TASK-4.8.6** — `CvTrustService`, `GET /api/exam-sessions/{id}/cv-trust`, `api:sync` (AC: 7) — phiên 2a
- [x] **TASK-4.8.3** — AI Service: agent `app/agents/cv_verification/`, prompt `cv_verification/v1`, `cv_verification_check/v1` (AC: 2, 3, 5, 8) — phiên 2b
- [ ] **TASK-4.8.7** — Giao diện (AC: 1, 4, 7) — phiên 2c
  - [x] 4.8.7.1 — Đọc `DESIGN.md` trước khi code, ghi `Design applied: …` vào story.
  - [x] 4.8.7.2 — `features/center/question-bank/blueprint-form.tsx`: khối "Phần D · Xác minh CV" (`Select`: Không dùng / 2 câu / 3 câu).
  - [x] 4.8.7.3 — `features/exam/`: nhóm "Phần D · Không tính điểm" trong `question-grid`, `Badge` trong `question-view`.
  - [x] 4.8.7.4 — `features/center/grading/manual-grade-sheet.tsx`: khối chỉ đọc "Chỉ số tin cậy CV".
  - [ ] 4.8.7.5 — Kiểm tay ở 360 / 768 / 1024 px.
- [x] **TASK-4.8.8** — Test (AC: 2–8) — theo từng phiên
  - [x] 4.8.8.1 — Unit: `domain/__tests__/cv-verification.spec.ts`; thêm ca `storedAnswersOf` / `verificationAnswersOf` vào spec sẵn có của `exam-paper`.
  - [x] 4.8.8.2 — Integration: thêm ca vào `exam-room.int-spec.ts` (AC-4, AC-6) và `grading.int-spec.ts` (AC-2, AC-5, AC-7); `CORE_TABLES`, `ai-service-role`.
  - [x] 4.8.8.3 — pytest `ai-service/tests/agents/test_cv_verification.py` + fixture (AC-2, AC-3, AC-5, AC-8).

## Dev notes

### Architecture constraints

- AD-2: LLM trả nhận định từng câu kèm trích dẫn, code tính chỉ số (không để LLM trả thẳng "điểm tin cậy").
- AD-4, AD-10: AI Service đọc view đã che PII, gọi `LLMClient` với effort `medium` cho cả hai bước; Core Backend ghi bảng nghiệp vụ.
- Nguyên tắc 5, 6: "khớp" phải có trích dẫn có thật trong câu trả lời (`quote_score` của `evaluator.py`, ngưỡng của matching); CV, JD, câu trả lời nằm trong `untrusted("…")`.

### Thiết kế (D57)

Cột và CHECK: ARCH › *Các bảng chính*. ID câu D lấy `core.questions_id_seq`, nên Redis, Lua script và tự lưu ở web dùng chung với câu A/B. Câu sinh xong sau lúc bắt đầu thi thì không gắn vào phiên nữa.

### Cross-story dependencies

- Builds on [US-4.1](US-4.1-exam-blueprint-test-generator.md), [US-4.3](US-4.3-exam-room.md), [US-4.4](US-4.4-grading-stest-sfinal.md), [US-4.5](US-4.5-manual-essay-grading.md), [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md), [US-3.3](US-3.3-shortlist-and-preferences.md).
- Required by [US-5.3](US-5.3-hr-nomination-review.md) (`CvTrustService.getForPreference()`); [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md) nếu đo chất lượng phần D.

### Giới hạn đã biết

- SV bắt đầu thi trước khi câu được sinh (khoảng 1 phút đầu của `TESTING`) thì không có phần D.
- Không thử lại job đã `FAILED` (gồm `STALE` sau 6 giờ). Job chưa tới broker thì lượt quét sau gửi lại cùng `job_id`.
- Khối của CENTER chỉ hiện trong Sheet chấm tay, tức là với bài có câu chờ chấm tay; bài khác xem qua API.
- Chất lượng nhận định của LLM chưa được đo (US-6.3).
- Hạn `STALE` so mốc của `Clock` với `created_at` do DB ghi, như `GradingScheduler`. `cv_verifications` chưa có partial index cho điều kiện quét; bảng mỗi NV một dòng nên chưa cần.

## Verification commands

| AC | Command |
|---|---|
| AC-2, AC-5, AC-7 | `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/grading' --selectProjects integration` › `FR-25` |
| AC-4, AC-6 | như trên với `exam-room`; `pnpm --filter @srm/api test:unit` (exam-paper, cv-verification) |
| AC-2, AC-3, AC-5, AC-8 | `ai-service/.venv/Scripts/pytest ai-service/tests/agents/test_cv_verification.py` |

## Changelog entry

### Added
- Phần D của bài test (tùy chọn theo JD): 2–3 câu hỏi về dự án và kỹ năng sinh viên đã khai, sinh từ hồ sơ đã che PII khi đợt sang giai đoạn làm test.
- Chỉ số tin cậy CV do code tính từ nhận định từng câu có trích dẫn; Trung tâm xem trong màn chấm tay; không tính vào S_test hay S_final.

**Commit**: `cfbb63c`

## Implementation notes

- **Phiên 1 (Plan)**: người dùng chốt 4 điểm (D57); đã sửa CONTEXT, ARCH, PRD GĐ5, EPIC-4, W47.
- **Phiên 2a (shared + DB + API)**: typecheck, lint, depcruise, unit, integration xanh. Khác plan:
  - `dispatched_at`, `evaluation_dispatched_at`: lượt quét gửi lại job chưa tới broker. `STALE` sau 6 giờ (không phải 1 giờ): lượt đầu của đợt lớn gửi một job cho mỗi NV. ARCH đã sửa.
  - `claim_ref.section` dùng mã `PROJECT`/`EXPERIENCE`/`SKILLS_LIST` như `EVIDENCE_SECTIONS`. `PUT exam-blueprint` thiếu `cvVerification` thì giữ nguyên phần D.
  - Test phòng thi ghi dòng phần D trực tiếp, phần D của ngân hàng tắt: lượt quét của `grading.int-spec.ts` (chạy song song) không được chạm NV của file khác.
- **Phiên 2b (ai-service)**: ruff, pytest xanh. Prompt chỉ nhận các mục `{section, index, entry}` của `claims.py` (BR-03). `schemas.py` dựng model đầu ra theo từng job, sai thì LLMClient hỏi lại.
- Design applied: DESIGN.md §6 (`select`, `badge`, `sheet`, `card`; DESIGN §6 thêm badge phần D và chỗ đặt khối tham khảo trong Sheet chấm tay), §7 (bốn trạng thái của khối chỉ số), §8, §9, §11 (badge luôn kèm icon).
- **Phiên 2c (web)**: typecheck, lint xanh.
  - Form ma trận: phần D là `Select` trong RHF nhưng ngoài resolver (chỉ có lựa chọn hợp lệ); tắt phần D giữ số câu cũ. Màn xem có dòng phần D.
  - Khối "Chỉ số tin cậy CV" (`cv-trust-section.tsx`) đặt sau ô nhập điểm (prop `after` của `ManualGradeForm`), để không chen giữa người chấm và bài làm.
  - Màn "Bài test" của SV vẫn ghi số câu không gồm phần D trước khi bắt đầu (lúc đó chưa biết có phần D).
- **Phiên 3 (review so với `dev`)**: đã sửa các lỗi review tìm ra; typecheck, lint, depcruise, unit (617), pytest (471), integration `grading`/`exam-room`/`question-bank` xanh.
  - Trích dẫn dài hơn câu trả lời được so cả chuỗi (`fuzz.ratio`): `partial_ratio` cho 100 khi trích dẫn bịa chỉ chứa câu trả lời ngắn. Không dùng `EvidenceCheck` (tối đa 500 ký tự, trích dẫn phần D tới 1000).
  - API chỉ trả trích dẫn có điểm ≥ `EVIDENCE_MATCH_MIN_SCORE` (`foundQuoteOf`). Câu bỏ trống lưu `NO_ANSWER_REASON`, không giữ trích dẫn hay lý do của LLM.
  - Lượt quét: job sinh chỉ gửi cho đợt còn mở `TESTING`; bỏ qua đợt `CLOSED`/`CANCELLED` khi đối chiếu; mỗi dòng một `try/catch`; NV đã có dòng bị loại trước khi đọc phiên và CV; insert một lệnh mỗi 1000 dòng.
  - Số câu khi nộp bài gồm phần D, khớp lưới câu. Bước đối chiếu có effort riêng `cv_verification_check`. `IconBadge` dùng chung ở `src/shared/ui/`.
- **Còn lại**: TASK-4.8.7.5 kiểm tay 360 / 768 / 1024 px. Bạn chạy `db:migrate` `0040`–`0041`. Rồi `pnpm test`, `pnpm build`, VERSION 0.26.0, CHANGELOG, cổng `release-commit`.

## Files modified

- `packages/shared/contracts` (`cv-verification.ts`, job, queue, envelope, JSON Schema), `packages/shared/schemas` (`cv-trust.ts`, `exam-blueprint.ts`, `exam-session.ts`); `ai-service/app/contracts` (sinh).
- `apps/api/drizzle` (`0040`, `0041`), `src/db/schema/assessment.ts`, module `assessment` (scheduler, handler, `CvTrustService`, controller, phòng thi, blueprint), `aigateway/domain/events.ts`, advisory lock; test unit, integration, helper `test/helpers/cv-verification.ts`.
- `ai-service`: agent `app/agents/cv_verification/`, prompt `cv_verification/v1`, `cv_verification_check/v1`, `kinds.py`, `build_handlers`, `worker.py`; test `tests/agents/test_cv_verification.py`, fixture `tests/fixtures/llm/cv_verification*/`.
- `apps/web`: `openapi.json`, `schema.d.ts` (`api:sync`); `features/center/question-bank` (phần D), `features/exam` (lưới câu, câu hỏi), `features/center/grading` (khối chỉ số tin cậy), `shared/ui/icon-badge.tsx` (dùng lại ở `features/student/preferences`); `DESIGN.md` §6.

## Cross-references

- [PRD › GĐ5, FR-25](../../PRD.md#functional-requirements) · [ARCH](../../ARCHITECTURE.md) · [Epic EPIC-4](../epics/EPIC-4.md) · [CHANGELOG](../../CHANGELOG.md) · [CONTEXT D49, D51, D53, D57](../../CONTEXT.md)
