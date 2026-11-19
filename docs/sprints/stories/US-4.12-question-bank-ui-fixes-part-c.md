---
id: US-4.12
title: "Sửa giao diện ngân hàng câu hỏi: ô độ phủ và đổi phần D thành C"
epic: EPIC-4
status: backlog
priority: P1
points: 3
sprint:
version_shipped:
prd_ref: [FR-18, FR-25]
depends_on: [US-4.2, US-4.8]
assignee:
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

## Acceptance criteria

- [ ] **AC-1** — **Given** màn ma trận đề của ngân hàng, **Then** mỗi ô hiện ba thông tin:
  - số câu của một đề ("1 câu mỗi đề");
  - số câu dùng được trong ngân hàng và mức tối thiểu (ví dụ "Ngân hàng: 4 câu · cần ≥ 3");
  - badge `Đủ` khi đạt mức tối thiểu, hoặc `Thiếu N`.

  **And** không còn phân số nào có tử số lớn hơn mẫu số **And** caption của bảng giải thích lại ý nghĩa ô **And** đọc được bằng trình đọc màn hình (`sr-only` như hiện nay).
- [ ] **AC-2** — `CV_VERIFICATION_PART = 'C'` nên `EXAM_PAPER_PARTS` thành `A, B, C`. Mọi nhãn trên giao diện đổi thành "Phần C – Xác minh CV…": màn ngân hàng (`center/question-bank/labels.ts`), phòng thi (`exam/labels.ts`, lưới câu, badge "Không tính điểm"), kết quả bài thi, khối chỉ số tin cậy trong Sheet chấm tay (`center/grading/cv-trust-section.tsx`). Grep `Phần D|phần D` trong `apps/web/src` không còn kết quả.
- [ ] **AC-3** — Kiểm lại rằng không dữ liệu nào đã lưu (PostgreSQL, Redis, `openapi.json`) chứa chữ phần `'D'`. Có thì viết migration chuyển sang `'C'` và thêm một ca integration cho phiên thi đang mở. Không có thì ghi kết quả grep vào *Implementation notes*.
- [ ] **AC-4** — Dùng được ở 360 / 768 / 1024 px (kiểm tay).

## Tasks

- [ ] **TASK-4.12.1** — Ô độ phủ (AC: 1, 4)
  - [ ] Subtask 4.12.1.1 — Đọc `DESIGN.md` §6 (badge, bảng) trước khi code; ghi `Design applied: …`.
  - [ ] Subtask 4.12.1.2 — Viết lại `CoverageCell` và caption trong `blueprint-table.tsx`; nhãn mới ở `labels.ts`.
- [ ] **TASK-4.12.2** — Đổi phần D thành C (AC: 2, 3)
  - [ ] Subtask 4.12.2.1 — `packages/shared/schemas/exam-session.ts`; sửa `exam-paper.spec.ts` theo hằng số mới.
  - [ ] Subtask 4.12.2.2 — Nhãn web (`question-bank`, `exam`, `grading`); `DESIGN.md` §6 dòng badge của phần xác minh CV.
  - [ ] Subtask 4.12.2.3 — `pnpm --filter @srm/api api:sync` nếu `openapi.json` có liệt kê chữ phần; grep dữ liệu đã lưu (AC-3).
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

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [CONTEXT D60](../../CONTEXT.md)
- [Epic EPIC-4](../epics/EPIC-4.md)
- [US-4.10 Kiểm câu bằng AI khi Trung tâm yêu cầu](US-4.10-on-demand-question-validation.md)
- [US-4.11 Xem toàn bộ câu và loại câu sai](US-4.11-question-bank-browser-and-rejection.md)
