---
id: US-4.12
title: "Sửa giao diện ngân hàng câu hỏi: ô độ phủ và đổi phần D thành C"
epic: EPIC-4
status: review
priority: P1
points: 3
sprint: sprint-2026-W47
version_shipped: 0.27.1
prd_ref: [FR-18, FR-25]
depends_on: [US-4.2, US-4.8]
assignee: PDTnhah
commit:
created: 2026-11-19
updated: 2026-11-19
---

## Goal

Màn ngân hàng câu hỏi của Trung tâm hết hai lỗi hiển thị mà người dùng báo ngày 2026-11-19. Thứ nhất, ô độ phủ không còn hiện kiểu "Đạt 4/3". Thứ hai, các phần của đề được đánh chữ liên tục A, B, C, không nhảy từ B sang D.

## Background

Phản hồi của người dùng sau khi xem ngân hàng của JD 5 ([CONTEXT D60](../../CONTEXT.md)):

- **"Đạt 4/3" trông rất tệ.** `CoverageCell` ở `apps/web/src/features/center/question-bank/blueprint-table.tsx` in `Đạt {validated}/{min}`. `min` là mức tối thiểu (3 × số câu mỗi đề), không phải mức tối đa, nên tử số thường lớn hơn mẫu số.
- **Thiếu phần C.** Màn hiện "Phần A – Trắc nghiệm…", "Phần B – Tự luận chấm theo rubric" rồi "Phần D – Xác minh CV". Lý do là chữ C từng dành cho bài lập trình, nhưng phần này đã bị bỏ (Q7, [CONTEXT D49](../../CONTEXT.md)). Người dùng chốt đổi cả mã trong code: phần xác minh CV là `C` ở mọi nơi. PRD, ARCH và EPIC-4 đã đổi theo D60.

Grep lúc lập story cho thấy chữ `D` chỉ được gán khi dựng đề (`CV_VERIFICATION_PART` ở `packages/shared/schemas/exam-session.ts`, dùng ở `exam-paper.ts`). Câu của phần này nằm ở `exam_sessions.verification_question_ids`, không lưu kèm chữ phần ([CONTEXT D57](../../CONTEXT.md)). Chữ `'D'` trong `exam-answer-store.ts` là thao tác xóa của script Lua, không liên quan.

**Lessons applied**: §47 (working tree CRLF: kiểm `git ls-files --eol` trước khi stage file web), §21 (chỉ chạy test của phần đang sửa).

**Design applied**: DESIGN.md §6 `table` (ma trận: `TableCaption` giải thích ô, ô không xuống dòng, bảng cuộn ngang ở điện thoại), §6 `badge` (`IconBadge` với bảng giá trị → biến thể + icon), §11 (nghĩa không chỉ dựa vào màu; `sr-only` cho ký hiệu).

## Acceptance criteria

- [x] **AC-1** — **Given** màn ma trận đề của ngân hàng, **Then** mỗi ô hiện ba thông tin:
  - số câu của một đề ("1 câu mỗi đề");
  - số câu dùng được trong ngân hàng và mức tối thiểu (ví dụ "Ngân hàng: 4 câu · cần ≥ 3");
  - badge `Đủ` khi đạt mức tối thiểu, hoặc `Thiếu N`.

  **And** không còn phân số nào có tử số lớn hơn mẫu số **And** caption của bảng giải thích lại ý nghĩa ô **And** đọc được bằng trình đọc màn hình (`sr-only` như hiện nay).
- [x] **AC-2** — `CV_VERIFICATION_PART = 'C'` nên `EXAM_PAPER_PARTS` thành `A, B, C`. Mọi nhãn trên giao diện đổi thành "Phần C – Xác minh CV…": màn ngân hàng (`center/question-bank/labels.ts`), phòng thi (`exam/labels.ts`, lưới câu, badge "Không tính điểm"), kết quả bài thi, khối chỉ số tin cậy trong Sheet chấm tay (`center/grading/cv-trust-section.tsx`). Grep `Phần D|phần D` trong `apps/web/src` không còn kết quả.
- [x] **AC-3** — Kiểm lại rằng không dữ liệu nào đã lưu (PostgreSQL, Redis, `openapi.json`) chứa chữ phần `'D'`. Có thì viết migration chuyển sang `'C'` và thêm một ca integration cho phiên thi đang mở. Không có thì ghi kết quả grep vào *Implementation notes*.
- [ ] **AC-4** — Dùng được ở 360 / 768 / 1024 px (kiểm tay).

## Tasks

- [x] **TASK-4.12.1** — Ô độ phủ (AC: 1, 4)
  - [x] Subtask 4.12.1.1 — Đọc `DESIGN.md` §6 (badge, bảng) trước khi code; ghi `Design applied: …`.
  - [x] Subtask 4.12.1.2 — Viết lại `CoverageCell` và caption trong `blueprint-table.tsx`; nhãn mới ở `labels.ts`.
- [x] **TASK-4.12.2** — Đổi phần D thành C (AC: 2, 3)
  - [x] Subtask 4.12.2.1 — `packages/shared/schemas/exam-session.ts`; sửa `exam-paper.spec.ts` theo hằng số mới.
  - [x] Subtask 4.12.2.2 — Nhãn web (`question-bank`, `exam`, `grading`); `DESIGN.md` §6 dòng badge của phần xác minh CV.
  - [x] Subtask 4.12.2.3 — `pnpm --filter @srm/api api:sync` nếu `openapi.json` có liệt kê chữ phần; grep dữ liệu đã lưu (AC-3).
- [ ] **TASK-4.12.3** — Kiểm tay 360 / 768 / 1024 px (AC: 4)

## Dev notes

### Architecture constraints

- Không đổi cách tính độ phủ; story này chỉ đổi cách hiện. Ý nghĩa "câu dùng được" đổi ở [US-4.10](US-4.10-on-demand-question-validation.md). Làm story này trước thì ô hiện số câu `VALIDATED`, làm sau thì hiện số câu dùng được. Nhãn chung "câu" đúng trong cả hai trường hợp.
- Chuỗi giao diện tiếng Việt (AGENTS › *Ngôn ngữ*).
- Không có test FE (AGENTS › *Kiểm thử*). Đổi hằng số chỉ cần sửa test cũ đang dùng chữ `'D'`.

### Cross-story dependencies

- Builds on [US-4.2](US-4.2-validator-and-question-bank-lock.md): bảng độ phủ (AC-10).
- Builds on [US-4.8](US-4.8-cv-verification-questions-trust-score.md): phần xác minh CV, `CV_VERIFICATION_PART`.
- Sibling [US-4.11](US-4.11-question-bank-browser-and-rejection.md): chia lại tab ngân hàng. Làm story này trước để US-4.11 dùng lại ô độ phủ mới.

### References

- [Source: PRD › GĐ5 – Sinh và tổ chức bài test](../../PRD.md)
- [Source: CONTEXT D57, D60](../../CONTEXT.md)
- [Source: DESIGN.md §6](../../../DESIGN.md)
- [Source: Epic EPIC-4](../epics/EPIC-4.md)

## Verification commands

| AC | Command |
|---|---|
| AC-1, AC-4 | Kiểm tay tab "Ngân hàng câu hỏi" ở 360 / 768 / 1024 px |
| AC-2 | `pnpm --filter @srm/api exec jest --testPathPatterns 'exam-paper' --selectProjects unit`; `grep -rn "Phần D\|phần D" apps/web/src` không ra kết quả |
| AC-3 | Grep chữ phần trong migration, `openapi.json`, `exam-answer-store.ts`; kết quả ghi ở *Implementation notes* |

## Changelog entry

### Fixed
- Ô độ phủ của ma trận đề hiện số câu trong ngân hàng và mức tối thiểu kèm badge Đủ/Thiếu, thay cho phân số "Đạt 4/3".

### Changed
- Phần xác minh CV đổi từ phần D thành phần C trên mọi màn (Trung tâm, phòng thi, kết quả, chấm tay) và trong mã `CV_VERIFICATION_PART`.

**Commit**:

## Implementation notes

**Phiên 1 (2026-11-19): Plan + Execute + Self-verify + Doc/Version gate**, gộp một phiên vì story 3 điểm. Nhánh `us-4.12` từ `dev` `b37f533`.

- **Ô độ phủ** (`CoverageCell`): "n câu mỗi đề"; "Ngân hàng: x câu · cần ≥ y", trong đó " · cần ≥ " là `aria-hidden` và trình đọc màn hình nghe "cần tối thiểu y"; badge "Đủ" (`secondary` + `CircleCheck`) hoặc "Thiếu n" (`outline` + `CircleAlert`) qua `IconBadge`. Badge đứng ngay sau dòng ngân hàng, trước câu bị loại / chờ kiểm. Caption và nhãn badge ở `labels.ts` (`COVERAGE_CAPTION`, `coverageStatusLabel`). Caption ghi "câu đạt kiểm định": **US-4.10 sửa chữ này thành "câu dùng được"** khi đổi cách đếm.
- **Phần D → C**: ngoài các chỗ trong AC-2 còn đổi thông báo lỗi Zod của `cvVerification` (`exam-blueprint.ts`), nhãn "Số câu phần C mỗi bài" của form ma trận, id `blueprint-part-C`, comment, docstring Python, log và mô tả contract; helper test `createPartD` → `createPartC`. Màn kết quả bài thi chỉ có phần A, B nên không phải sửa.
- **Không đổi phần LLM thấy**: prompt `cv_verification/v1`, `cv_verification_check/v1` (đã phát hành) vẫn ghi "part D". Mô tả `CvVerificationCheckItem` nằm trong output schema gửi cho LLM nên cũng giữ "part D" (comment trong `contracts/cv-verification.ts`). Lý do: đổi mô tả thì request khác `prompt_version` đã ghi, hash fixture đổi và 3 ca pytest đỏ. Đổi cả hai ở phiên bản prompt kế tiếp.
- **AC-3, grep dữ liệu đã lưu** (không cần migration):
  - PostgreSQL: không cột nào lưu chữ phần. `exam_sessions` chỉ có ID câu (`question_ids`, `verification_question_ids`); các cột JSON `option_layout`, `skill_scores`, `flags` không có `part`; migration duy nhất có cột `part` là `ai.llm_batches.part` (số thứ tự phần của batch, không liên quan).
  - Redis (`exam-answer-store.ts`): `exam:{id}:session` có `q:{questionId}` → `*` hoặc mã phương án, `exam:{id}:answers` có `{questionId}` → `C:`/`T:`. Chữ `'D'` là thao tác xóa của script Lua.
  - localStorage của phòng thi: câu trả lời chờ gửi theo `questionId`.
  - `openapi.json`: `ExamPaperDto_Output.part` từng là `A | B | D`, đã sinh lại bằng `pnpm api:sync` thành `A | B | C`.
  - `ai.llm_calls` / `llm-logs` có chữ "part D" trong văn bản prompt đã gửi: đó là log, không phải dữ liệu phần.
- **Self-verify**: typecheck, lint xanh; API unit 617/617, shared 403/403; integration `exam-room` + `grading` 26/26 (compose vẫn bật, `--runInBand`); ruff, pytest 512 xanh; `grep "Phần D|phần D" apps/web/src` không ra kết quả. Chưa chạy cả bộ `pnpm test` (compose đang chạy, LESSONS §15): ngoài hai file trên không test nào dùng chữ phần.
- **Chưa làm**: TASK-4.12.3 kiểm tay 360 / 768 / 1024 px (không có trình duyệt trong phiên). Checklist: tab "Ngân hàng câu hỏi" của một JD đã có câu (ô đủ và ô thiếu, caption, bảng cuộn ngang ở 360 px); form ma trận đề (khối "Phần C – Xác minh CV"); phòng thi có phần C (lưới câu, badge "Không tính điểm"); Sheet chấm tay (khối chỉ số tin cậy CV).

Lessons: none new — đổi hằng số và nhãn theo spec; mô tả contract nằm trong output schema của LLM bị pytest bắt ngay (fixture theo hash request), không tốn thời gian, đã ghi comment tại chỗ.

## Files modified

- Shared: `schemas/exam-session.ts` (`CV_VERIFICATION_PART = 'C'`), `schemas/exam-blueprint.ts`, `schemas/cv-trust.ts`, `contracts/cv-verification.ts` + output `contracts:gen` (`contracts/json-schema/`, `ai-service/app/contracts/`).
- API: comment, log trong `modules/assessment/`, `db/schema/assessment.ts`, `common/scheduling/advisory-lock.ts`; test `exam-paper.spec.ts`, `test/helpers/`, `test/integration/` (`exam-room`, `grading`, `ai-service-role`, `question-bank`).
- Web: `features/center/question-bank/` (`blueprint-table.tsx`, `labels.ts`, form), `features/exam/labels.ts`, `features/center/grading/`, `shared/api/openapi.json` + `schema.d.ts` (`api:sync`).
- ai-service: docstring `app/agents/cv_verification/`, `app/handlers/__init__.py`, `tests/agents/test_cv_verification.py`, `tests/consumers/test_idempotency.py`.
- Tài liệu: `DESIGN.md` §6, story, PRD (bảng story), EPIC-4, W47, CHANGELOG, VERSION + `package.json` (0.27.1).

## Cross-references

- [CONTEXT D60](../../CONTEXT.md)
- [Epic EPIC-4](../epics/EPIC-4.md)
- [US-4.10 Kiểm câu bằng AI khi Trung tâm yêu cầu](US-4.10-on-demand-question-validation.md)
- [US-4.11 Xem toàn bộ câu và loại câu sai](US-4.11-question-bank-browser-and-rejection.md)
