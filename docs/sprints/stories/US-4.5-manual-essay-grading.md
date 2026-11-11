---
id: US-4.5
title: "Chấm tay câu tự luận được chuyển"
epic: EPIC-4
status: review
priority: P0
points: 5
sprint: sprint-2026-W45
version_shipped: 0.24.0
prd_ref: [FR-23]
arch_ref: [AD-2, AD-8]
depends_on: [US-4.4]
assignee:
commit:
created: 2026-10-07
updated: 2026-11-11
---

## Story refresh — 2026-11-11 (bắt đầu story)

Story viết trước US-4.4 và D53. Phiên Plan ngày 2026-11-11 chốt các điểm mở theo Đề xuất ([D54](../../CONTEXT.md)). Hàm `finalizeSessionIfComplete()` mà story định viết đã có sẵn là `GradingService.finalizeIfReady` (D53). AC-5 viết lại theo D53: trước `testing_end` thì không công bố. AC-6 kiểm tay vì Playwright dời sang US-6.6 (D51). Ước lượng tăng từ 3 lên 5 điểm. Nhánh `us-4.5` tạo từ `dev` `c401e60`.

## Goal

Câu tự luận mà AI không chấm chắc chắn có người chấm lại. Cán bộ Trung tâm mở hàng đợi và chấm theo rubric mà không thấy danh tính sinh viên; điểm của họ là điểm cuối cùng của câu. Khi phiên thi không còn câu nào chờ chấm, hệ thống tính lại S_test, S_final và chuyển nguyện vọng sang *Đã chấm test*. Nhờ vậy mọi bài đều có điểm, kể cả bài AI không chấm được.

## Background

FR-23 (UC-06): Cán bộ Trung tâm hoặc giảng viên chấm tay các câu tự luận được chuyển. [US-4.4](US-4.4-grading-stest-sfinal.md) đặt `exam_answers.needs_human = true` và `needs_human_reasons` (`RUNS_DIVERGE`, `LOW_CONFIDENCE`, `FLAGGED`, `AI_FAILED`, `NEAR_THRESHOLD`; D53). Các câu này còn `final_score` trống, nên `finalizeIfReady` trả `NEEDS_HUMAN` và NV giữ `PENDING_TEST`.

BR-13: con người quyết định điểm cuối của câu. BR-03: màn chấm tay không hiện danh tính sinh viên.

**Lessons applied**: §10 schema theo rubric dựng bằng `z.tuple`, không `superRefine` · §12 khóa `exam_answers` bằng câu không join · §22 assert theo ID của test, không gọi `GradingScheduler.runOnce()` ngoài file của nó · §25 form gửi `rowVersion` của lúc mở · §26 tổng chỉ để hiển thị · §34 tác vụ quét là lưới an toàn khi `finalizeIfReady` lỗi · §38 kiểm điều kiện trong giao dịch, dưới khóa dòng.

## Acceptance criteria

- [x] **AC-1** — **Given** người dùng `CENTER`, **When** gọi `GET /api/campaigns/{id}/grading-queue?reason=&limit=&offset=`, **Then** nhận các câu có `needs_human = true` và chưa có `final_score`, nhóm theo phiên, kèm lý do chuyển. Lọc được theo lý do; phân trang tính theo phiên; có `totalSessions`, `totalAnswers`. Đợt không tồn tại thì `404` **And** `HR`, `STUDENT` nhận `403`.
- [x] **AC-2** — Hàng đợi và `GET /api/exam-answers/{id}/manual-grading` chỉ trả: mã phiên ("Bài #id"), tên JD và công ty, số câu, kỹ năng, đề, rubric, đáp án mẫu, bài làm, lý do chuyển, và hai lượt chấm của AI (điểm và lý do từng tiêu chí, độ tự tin, cờ, mã lỗi của lượt hỏng). Không có tên, mã sinh viên, ảnh hay trường nào của hồ sơ (BR-03). Test duyệt mọi khóa của response và so với whitelist. Câu không thuộc luồng chấm tay (trắc nghiệm, không `needs_human`) trả `404`.
- [x] **AC-3** — **Given** một câu đang chờ chấm, **When** `CENTER` gọi `PUT /api/exam-answers/{id}/manual-grade` với `rowVersion`, điểm nguyên của mọi tiêu chí và ghi chú tùy chọn, **Then** code cộng thành `final_score`; lưu `manual_grading`, `graded_by`, `graded_at`; tăng `row_version`; ghi `audit_logs` `EXAM_ANSWER_GRADED_MANUALLY` (trước/sau) trong cùng giao dịch **And** điểm tiêu chí ngoài `[0, max_points]`, không nguyên, thiếu, thừa hoặc sai thứ tự tiêu chí thì trả `400` kèm `criteria.N.points`.
- [x] **AC-4** — **Given** hai người cùng lưu một câu, **Then** một người nhận `200`, người kia nhận `409` và điểm của người thứ nhất giữ nguyên **And** `rowVersion` cũ thì `409 ROW_VERSION_CONFLICT` **And** chấm lại câu đã có `final_score` thì `409 EXAM_ANSWER_ALREADY_GRADED` (sửa điểm sau đó đi qua phúc khảo, [US-4.6](US-4.6-appeals-and-question-error-reports.md)).
- [x] **AC-5** — **Given** câu cuối cùng còn chờ của một phiên vừa được chấm, **When** giao dịch lưu điểm commit, **Then** API gọi `GradingService.finalizeIfReady` và response có `session.publication`:
  - `PUBLISHED` khi đã qua `testing_end`: S_test, `skill_scores`, S_final được tính; NV `PENDING_TEST → TEST_GRADED` qua `transitionTo` có audit; SV nhận `EXAM_RESULT_PUBLISHED`;
  - `AFTER_TESTING_END` khi chưa qua `testing_end`: không công bố gì, tác vụ quét công bố sau (D53);
  - `WAITING_OTHER_ANSWERS` khi phiên còn câu chờ: không tính S_test;
  - `NEXT_SWEEP` khi bước công bố lỗi hoặc xung đột: điểm đã lưu vẫn giữ, API trả `200`.

  **And** câu `NEAR_THRESHOLD` đã chấm tay không bị chuyển lại.
- [ ] **AC-6** — **Given** Cán bộ Trung tâm mở `/admin/grading`, **Then** thấy:
  - bảng hàng đợi lọc theo đợt và lý do, phân trang;
  - ngăn chi tiết có ô nhập điểm nguyên cho từng tiêu chí và tổng do hệ thống tự cộng;
  - hộp xác nhận trước khi lưu;
  - trạng thái rỗng "Không còn câu cần chấm", trạng thái đang tải và lỗi;
  - chuỗi tiếng Việt; dùng được ở 768 / 1024 px.

  Kiểm tay.
- [x] **AC-7** — Luồng chấm tay không gọi LLM và không phát job AI nào.

## Tasks

- [x] **TASK-4.5.1** — Shared và migration (AC: 2, 3)
  - [x] 4.5.1.1 — `packages/shared/schemas/manual-grading.ts` (`manualGradeCriteriaSchemaFor`), `StoredManualGrading`, `EXAM_ANSWER_ALREADY_GRADED`; unit test.
  - [x] 4.5.1.2 — Migration `0038`: cột và CHECK của `exam_answers` (D54).
- [x] **TASK-4.5.2** — Backend (AC: 1, 2, 3, 4, 5, 7)
  - [x] 4.5.2.1 — `domain/manual-grade.ts`, action audit; unit test.
  - [x] 4.5.2.2 — `ManualGradingRepository`.
  - [x] 4.5.2.3 — `ManualGradingService` (`finalizeIfReady` sau commit).
  - [x] 4.5.2.4 — `ManualGradingController` (`@Roles('CENTER')`), DTO; `pnpm api:sync`.
- [ ] **TASK-4.5.3** — Web (AC: 6)
  - [x] 4.5.3.1 — Đọc `DESIGN.md`, ghi `Design applied: …` vào *Implementation notes*.
  - [x] 4.5.3.2 — `features/center/grading/`, route `/admin/grading`, mục "Chấm tay"; DESIGN §6.
  - [ ] 4.5.3.3 — Kiểm tay ở 768 / 1024 px (người dùng; checklist ở *Implementation notes*).
- [x] **TASK-4.5.4** — Integration test `apps/api/test/integration/manual-grading.int-spec.ts` (AC: 1, 2, 3, 4, 5, 7)

## Dev notes

### Architecture constraints

- AD-2: người chấm nhập điểm từng tiêu chí; code cộng điểm câu và tính S_test, S_final. Không có ô nhập điểm tổng của câu.
- AD-8: ghi điểm có audit trong cùng giao dịch, chống ghi đè bằng `row_version`. Chuyển trạng thái NV đi qua `finalizeIfReady` → `PreferenceGradingService` của `matching` (Nguyên tắc 13).
- Nguyên tắc 4 và BR-03: màn chấm tay là một bước chấm điểm, nên không hiện thông tin định danh.
- Nguyên tắc 6: bài làm là dữ liệu. Giao diện hiện văn bản thuần, không render Markdown hay HTML.

### Cross-story dependencies

- Builds on [US-4.4](US-4.4-grading-stest-sfinal.md) (`needs_human`, `ai_grading`, `finalizeIfReady`, `test/helpers/grading.ts`), US-1.2 (`audit_logs`), US-1.3 (`@Roles()`).
- Required by [US-4.6](US-4.6-appeals-and-question-error-reports.md): dùng `exam_answers.id`, `row_version`, form chấm theo tiêu chí, `finalizeIfReady`; xem lại việc SV có thấy điểm tiêu chí do cán bộ chấm không (D54).

### What we explicitly did NOT do

- Không thêm vai trò giảng viên; không đổi trang kết quả của SV; không thêm TanStack Table (D54).

## Verification commands

Unit: `pnpm --filter @srm/shared test`, `pnpm --filter @srm/api test:unit`. Integration: `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/manual-grading' --selectProjects integration`.

| AC | Test (file › case) |
|---|---|
| AC-1 | `manual-grading.int-spec.ts` › `GĐ6 CENTER sees needs_human queue with reasons; HR/STUDENT 403` (cả `ADMIN` 403, chưa đăng nhập 401) |
| AC-2 | `manual-grading.int-spec.ts` › `BR-03 queue and detail responses contain no identity or profile fields` |
| AC-3 | `manual-grade.spec.ts`, `manual-grading.spec.ts` (shared); `manual-grading.int-spec.ts` › `GĐ6 manual criterion scores summed by code with audit; 400 out of range or missing criterion` (body có `finalScore`, `gradedBy` bị bỏ qua) |
| AC-4 | `manual-grading.int-spec.ts` › `GĐ6 concurrent manual grade 409 on stale row_version; 409 when already final` |
| AC-5 | `manual-grading.int-spec.ts` › `GĐ6 last pending answer triggers S_test, S_final and transition to graded`; `GĐ6 NEAR_THRESHOLD answers graded by hand are not handed over again; a failed publication keeps the grade` |
| AC-6 | Kiểm tay (checklist ở *Implementation notes*) |
| AC-7 | `manual-grading.int-spec.ts` › `BR-13 manual grading publishes no AI job` |

## Changelog entry

### Added
- Hàng đợi chấm tay ở cổng Trung tâm cho câu tự luận AI chuyển sang (lệch điểm, độ tự tin thấp, sát ngưỡng, có cờ, AI lỗi); màn chấm ẩn danh, chấm theo từng tiêu chí rubric.
- Chấm xong câu cuối của một bài thì hệ thống tính lại S_test, S_final và báo kết quả cho sinh viên (sau khi hết pha làm test).

**Commit**:

## Implementation notes

**Phiên 1 (2026-11-11): Plan.** Đã ghi D54; sửa ARCH, PRD FR-23, EPIC-4, W45. Plan (máy này): `C:\Users\PHAM TIEN BINH\.claude\plans\l-n-plan-th-c-hi-n-wild-dongarra.md`.

**Phiên 2 (2026-11-11): Execute + Self-verify.** Các điểm ngoài plan:
- `manualGradeCriteriaSchemaFor` khai kiểu trả về là `z.ZodType<ManualGradeCriterion[]>`. Lý do: tuple dựng từ rubric không có độ dài tĩnh, nên RHF không suy ra được `criteria.N.points`. Lúc chạy vẫn là `z.tuple`.
- Web chọn sẵn đợt `TESTING`; không có thì chọn đợt đầu tiên khác `DRAFT`, vì API hàng đợi cần mã đợt.
- `manual-grading.int-spec.ts` dùng `FakeClock` tháng 3/2002 (ghi ở `test/helpers/fake-clock.ts`). `core-schema.int-spec.ts` thêm `exam_answers` vào danh sách bảng có `row_version`.
- Design applied: §4–§11. Các quy ước mới (bảng nhóm theo bài, Sheet chấm, form theo tiêu chí) ghi ở `DESIGN.md` §6, §8.

**Phiên 3 (2026-11-11): Review + Doc/Version gate.** `/code-review` nêu 13 điểm, đã sửa 11:
- `grade` đọc mọi thứ response cần ngay trong giao dịch. Sau commit chỉ còn đếm câu chờ và công bố; lỗi ở hai bước này thì trả `NEXT_SWEEP` (LESSONS §44).
- Mọi lệnh UPDATE `exam_answers` của US-4.4 tăng `row_version`; test đọc phiên bản từ DB (LESSONS §43).
- Điều kiện "là tự luận", "đã nộp" chuyển vào SQL, để số dòng của trang khớp với tổng. Dùng chung `ofCampaign`.
- Web: đổi đợt hoặc lý do thì không giữ trang cũ (LESSONS §45); nhãn trang tính theo `offset` của dữ liệu; `Select` luôn là controlled; Back đóng Sheet; lưu xong không chờ tải lại hàng đợi; câu báo của `409` và `NEXT_SWEEP` viết trung tính.

koni-qc bảo mật (BR-03, phân quyền, IDOR, injection, mass assignment, XSS): không có phát hiện nào ≥ 8. Đã thêm test: `401` khi chưa đăng nhập; body gửi kèm `finalScore`, `gradedBy`, `gradedAt` thì bị bỏ qua; response không chứa tên SV. D54 thêm hai điểm sau review. Lessons: §43–§45 mới.

**Giới hạn đã biết**:
- Phân trang `offset` trên danh sách co dần: hai người chấm cùng lúc thì người ở trang sau có thể sót một bài vừa dồn lên trang trước. Keyset thì mất số trang.
- `NEXT_SWEEP` gộp cả `NO_SCV`: tác vụ quét thử lại nhưng chỉ thành khi có S_cv.
- Gửi lại sau khi mất response thì nhận `409 EXAM_ANSWER_ALREADY_GRADED`; chưa idempotent.

**Kiểm tay AC-6** (người dùng):

Chuẩn bị: `db:migrate` `0038`; compose với `LLM_PROVIDER=fixture`; một đợt `TESTING` có `testing_end` khoảng 15 phút sau. Bài làm thật không có fixture, nên cả hai lượt của Grader lỗi (`AI_FAILED`) và câu vào hàng đợi.

  1. SV làm hai câu tự luận rồi nộp. CENTER bấm "Chấm tự luận" ở trang đợt.
  2. "Chấm tay": thấy "Bài #id", hai câu, badge "AI không chấm được". Lọc "Hai lượt AI lệch điểm" thì thấy trạng thái rỗng.
  3. Bấm "Chấm": Sheet hiện lý do, đề, bài làm, đáp án mẫu, hai lượt AI kèm mã lỗi; không có tên hay mã SV. Back đóng Sheet.
  4. Điểm quá tối đa ở một ô, số lẻ ở ô khác: lỗi hiện ở đúng ô. Tổng tự cộng khi gõ.
  5. "Lưu điểm": hộp xác nhận nêu tổng; xác nhận thì toast "Bài còn 1 câu chờ chấm", câu rời hàng đợi.
  6. Chấm câu còn lại trước `testing_end`: toast báo công bố sau khi hết pha; hàng đợi rỗng. Khoảng 5 phút sau `testing_end`, SV thấy kết quả.
  7. Cùng một câu mở ở hai tab, lưu ở tab 1 rồi tab 2: tab 2 có toast lỗi và hiện điểm đã chấm, chỉ đọc.
  8. Ở 768 / 1024 px không cuộn ngang, nút cao 44 px khi giả lập cảm ứng; dưới 768 px Sheet mở từ cạnh dưới.

  Xong thì `[x]` AC-6, 4.5.3.3, TASK-4.5.3, và chuyển story sang `done`.

## Files modified

- `packages/shared/schemas/` (`manual-grading.ts`, `exam-result.ts`, `errors.ts`, test).
- `apps/api`: `drizzle/0038` + meta, `db/schema/assessment.ts`, `common/errors/`, module `assessment` (`api/`, `application/`, `domain/`, `infrastructure/`, gồm `exam-grading.repository.ts`); `test/integration/` (`manual-grading`, `core-schema`), `test/helpers/fake-clock.ts`.
- `apps/web`: `features/center/grading/`, `app/router.tsx`, `app/navigation.ts`, `shared/api/` (`errors.ts`; `openapi.json`, `schema.d.ts` sinh).
- Tài liệu: `DESIGN.md` §6, §8; CONTEXT D54; LESSONS §43–§45; AGENTS › *Mẫu có sẵn*; CHANGELOG, VERSION; story.

## Cross-references

- [PRD FR-23](../../PRD.md#functional-requirements) · [ARCHITECTURE AD-2, AD-8](../../ARCHITECTURE.md#architecture-decisions) · [EPIC-4](../epics/EPIC-4.md) · [CHANGELOG](../../CHANGELOG.md) · [CONTEXT D53, D54](../../CONTEXT.md)
- [US-4.4 Chấm bài, S_test và S_final](US-4.4-grading-stest-sfinal.md) · [US-4.6 Phúc khảo và báo lỗi câu hỏi](US-4.6-appeals-and-question-error-reports.md)
