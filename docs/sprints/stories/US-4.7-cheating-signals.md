---
id: US-4.7
title: "Tín hiệu gian lận"
epic: EPIC-4
status: backlog
priority: P1
points: 3
sprint:
version_shipped:
prd_ref: [FR-21]
depends_on: [US-4.3, US-2.5]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Cán bộ Trung tâm, và sau này HR, thấy các hành vi đáng chú ý khi sinh viên làm bài: chuyển tab, thoát toàn màn hình, cố copy/paste, bài tự luận giống bài của người khác. Đây chỉ là cảnh báo để người xem cân nhắc khi duyệt hồ sơ hay phỏng vấn. Hệ thống không tự đánh trượt và không đổi điểm vì các tín hiệu này.

## Background

FR-21: ghi nhận tín hiệu gian lận (chuyển tab, thoát toàn màn hình, copy/paste, bài tự luận tương đồng), chỉ dùng để cảnh báo. PRD › GĐ5 › *Tổ chức thi*: chặn copy/paste, ghi nhận số lần chuyển tab/thoát toàn màn hình, so sánh độ tương đồng bài tự luận giữa các sinh viên; các tín hiệu này chỉ để cảnh báo cho Trung tâm/HR. PRD › *Risks*: gian lận được giảm bằng giới hạn thời gian, rút đề ngẫu nhiên, ghi nhận hành vi, và HR kiểm chứng lại qua phỏng vấn.

ARCH › *Frontend › Phòng thi*: sự kiện `visibilitychange`, thoát Fullscreen API, copy/paste gửi về `POST /api/exam-sessions/{id}/events`. ARCH › *Bản đồ sử dụng LLM* xếp "Phát hiện bài tự luận giống nhau" vào embedding, job nền, chỉ cảnh báo. ARCH › *Những chỗ cố ý KHÔNG dùng LLM* có "tín hiệu gian lận". Dữ liệu: `exam_events` (session_id, type, occurred_at), `exam_sessions.flags`, `ai.embeddings` với `owner_type = essay`.

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** sinh viên đang làm bài, **When** tab bị ẩn (`visibilitychange`), thoát toàn màn hình, hoặc thử copy/cắt/dán trong vùng đề và ô trả lời, **Then** thao tác copy/dán bị chặn **And** sự kiện được gom và gửi về `POST /api/exam-sessions/{id}/events` **And** sự kiện phát sinh lúc mất mạng được giữ lại và gửi khi có mạng **And** trên thiết bị không hỗ trợ Fullscreen API, phòng thi không bắt toàn màn hình và không ghi sự kiện thoát.
- [ ] **AC-2** — Endpoint chỉ nhận từ chủ phiên (người khác nhận `404`) khi phiên đang mở (đã đóng thì `409`). Loại sự kiện kiểm bằng Zod theo enum (`TAB_HIDDEN`, `FULLSCREEN_EXIT`, `COPY_ATTEMPT`, `PASTE_ATTEMPT`, đề xuất). `occurred_at` lấy theo `Clock` của server. Kích thước lô có giới hạn và áp `ratelimit:{userId}:{route}` (`429` khi vượt).
- [ ] **AC-3** — Số lần mỗi loại sự kiện được cộng vào `exam_sessions.flags`. Test chứng minh cùng một bài, có hay không có sự kiện, cho cùng S_test, cùng S_final và cùng trạng thái NV.
- [ ] **AC-4** — **Given** cửa sổ thi đã đóng, **When** backend phát `ai.essay.similarity` (đề xuất) với `{ job_id, bank_id }`, **Then** AI Service tính embedding bài tự luận bằng bge-m3, lưu `ai.embeddings` (`owner_type = essay`), so cosine từng cặp bài của cùng một câu, và trả về các cặp ≥ `campaigns.config.essay_similarity_threshold` (đề xuất 0,9) qua `ai.results` **And** backend gắn cờ `ESSAY_SIMILAR` (kèm mã câu và mã phiên còn lại) vào `flags` của cả hai phiên **And** không có lượt gọi LLM nào.
- [ ] **AC-5** — **Given** người dùng `CENTER`, **When** mở danh sách cảnh báo của đợt (`GET /api/campaigns/{id}/exam-flags`, đề xuất), **Then** thấy các phiên có cờ, số lần từng loại, các cặp bài tương đồng xem cạnh nhau, và dòng chữ "Chỉ để tham khảo, không tự đánh trượt" **And** `HR`, `STUDENT` gọi endpoint này nhận `403`.
- [ ] **AC-6** — Module `assessment` export `ExamFlagsService.getForSession(sessionId)` (đề xuất) cho [US-5.3](US-5.3-hr-nomination-review.md). Bản cho HR chỉ có số lần từng loại và "tương đồng cao với N bài khác", không có mã phiên hay danh tính của sinh viên kia.

## Tasks

- [ ] **TASK-4.7.1** — Ghi nhận hành vi ở client (AC: 1)
  - [ ] Subtask 4.7.1.1 — `apps/web/src/features/exam/use-exam-signals.ts` (đề xuất): nghe `visibilitychange`, `fullscreenchange`, `copy`/`cut`/`paste`; chặn copy/dán; gom và gửi lại khi có mạng.
- [ ] **TASK-4.7.2** — Endpoint nhận sự kiện (AC: 2)
  - [ ] Subtask 4.7.2.1 — `packages/shared/schemas/exam-event.ts`: enum loại sự kiện, giới hạn lô.
  - [ ] Subtask 4.7.2.2 — `apps/api/src/modules/assessment/api/exam-event.controller.ts`: `POST /api/exam-sessions/{id}/events`, kiểm chủ sở hữu và trạng thái phiên, ghi `exam_events`.
- [ ] **TASK-4.7.3** — Cộng dồn vào `flags` (AC: 3)
  - [ ] Subtask 4.7.3.1 — `apps/api/src/modules/assessment/domain/exam-flags.ts`: hàm thuần cộng dồn số lần theo loại; không đụng điểm hay trạng thái.
- [ ] **TASK-4.7.4** — Phát hiện bài tự luận tương đồng (AC: 4)
  - [ ] Subtask 4.7.4.1 — `packages/shared/contracts/essay-similarity.ts` (đề xuất): Zod cho job và kết quả, sinh Pydantic theo AD-6.
  - [ ] Subtask 4.7.4.2 — `ai-service/app/consumers/essay_similarity.py` và `ai-service/app/embedding/essay_similarity.py` (đề xuất): dùng bge-m3 của US-2.5, đọc bài qua view chỉ đọc của US-4.4.
  - [ ] Subtask 4.7.4.3 — `apps/api/src/modules/assessment/application/essay-similarity.handler.ts`: ghi cờ cho cả hai phiên, idempotent theo `job_id`.
- [ ] **TASK-4.7.5** — Màn cảnh báo ở cổng Trung tâm và service cho HR (AC: 5, 6)
  - [ ] Subtask 4.7.5.1 — Đọc `DESIGN.md` trước khi code, ghi `Design applied: …` vào story.
  - [ ] Subtask 4.7.5.2 — `apps/web/src/features/center/exam-flags/`: bảng phiên có cờ, xem cặp bài tương đồng.
  - [ ] Subtask 4.7.5.3 — `apps/api/src/modules/assessment/application/exam-flags.service.ts`: bản cho Trung tâm và bản rút gọn cho HR.
- [ ] **TASK-4.7.6** — Test (AC: 2, 3, 4, 5, 6)
  - [ ] Subtask 4.7.6.1 — `apps/api/test/assessment/exam-events.spec.ts`, `ai-service/tests/embedding/test_essay_similarity.py` (dùng vector cố định, không tải mô hình trong unit test).

## Dev notes

### Architecture constraints

- ARCH › *Những chỗ cố ý KHÔNG dùng LLM*: tín hiệu gian lận chỉ dùng sự kiện trình duyệt và embedding. Phương án hỏi LLM "bài này có gian lận không" bị loại vì không tất định và không giải thích được.
- AGENTS › Nguyên tắc 8: tín hiệu gian lận chỉ để cảnh báo, không tự đánh trượt. Không có `transitionTo` hay phép tính điểm nào đọc `flags`.
- [AD-4](../../ARCHITECTURE.md#architecture-decisions), [AD-5](../../ARCHITECTURE.md#architecture-decisions): AI Service chỉ ghi `ai.embeddings`; kết quả cặp tương đồng đi về qua `ai.results`; Core Backend ghi `exam_sessions.flags`.
- [AD-11](../../ARCHITECTURE.md#architecture-decisions): embedding dùng bge-m3 tự host, bài làm không rời máy chủ.
- `occurred_at` lấy theo đồng hồ server để sinh viên không sửa được mốc thời gian.
- **Điểm chưa rõ trong spec — hỏi trước khi chốt:**
  - Ngưỡng cosine coi là "tương đồng": spec không có số. Tạm 0,9, đưa thành tham số `campaigns.config.essay_similarity_threshold`.
  - ARCH › *Hàng đợi* không có queue cho phát hiện tương đồng. `ai.essay.similarity` là đề xuất; phương án khác là gộp vào job `ai.essay.grade`.
  - HR thấy cặp bài tương đồng đến mức nào. Story tạm không cho HR thấy danh tính hay mã phiên của sinh viên kia (BR-11, PRD › *Personas*).
  - Bảng cảnh báo cho HR chỉ hiện được khi đã có đề cử ([US-5.2](US-5.2-allocation-round-draft-adjust-publish.md), [US-5.3](US-5.3-hr-nomination-review.md)), tức sau story này. Phần "HR thấy cảnh báo" của epic chỉ nghiệm thu được ở US-5.3.

### Cross-story dependencies

- Builds on [US-4.3](US-4.3-exam-room.md): bảng `exam_events`, `exam_sessions.flags`, giao diện `apps/web/src/features/exam/`, `Clock`, rate limit.
- Builds on [US-2.5](US-2.5-embeddings-skill-catalog.md): `ai-service/app/embedding/` (bge-m3), `ai.embeddings`.
- Builds on [US-4.4](US-4.4-grading-stest-sfinal.md): view chỉ đọc bài tự luận `core.v_ai_essay_answers` (đề xuất) và mốc "cửa sổ thi đã đóng".
- Required by [US-5.3](US-5.3-hr-nomination-review.md): `ExamFlagsService.getForSession()` trong hồ sơ đề cử.
- Sibling [US-4.4](US-4.4-grading-stest-sfinal.md), [US-4.5](US-4.5-manual-essay-grading.md) (cùng tuần T10): cùng sửa `exam_sessions.flags` (US-4.4 thêm cờ `INSTRUCTION_IN_ANSWER`); thống nhất cấu trúc JSON của `flags` trong `packages/shared/schemas`.

### References

- [Source: PRD › GĐ5 – Sinh và tổ chức bài test (Chống gian lận)](../../PRD.md)
- [Source: PRD › Functional Requirements (FR-21)](../../PRD.md#functional-requirements)
- [Source: PRD › Risks](../../PRD.md#risks)
- [Source: ARCHITECTURE › Frontend › Phòng thi](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › LLM usage and cost (Bản đồ sử dụng LLM, Những chỗ cố ý KHÔNG dùng LLM)](../../ARCHITECTURE.md#llm-usage-and-cost)
- [Source: ARCHITECTURE › Data architecture](../../ARCHITECTURE.md#data-architecture)
- [Source: CONTEXT D4, D5, D11](../../CONTEXT.md)
- [Source: Epic EPIC-4](../epics/EPIC-4.md)

## Verification commands

> Chưa có `package.json`/`pyproject.toml`. Lệnh chạy cụ thể sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `apps/web/e2e/exam-signals.spec.ts` (Playwright, đề xuất) › `GĐ5 tab hidden, fullscreen exit, copy/paste blocked and reported; offline events resent` |
| AC-2 | `apps/api/test/assessment/exam-events.spec.ts` › `GĐ5 owner only 404; closed session 409; invalid type 400; server occurred_at; 429 on rate limit` |
| AC-3 | `apps/api/test/assessment/exam-events.spec.ts` › `FR-21 flags counted; scores and preference state unchanged with or without events` |
| AC-4 | `ai-service/tests/embedding/test_essay_similarity.py` › `test_pairs_above_threshold_per_question_only`; `apps/api/test/assessment/essay-similarity.spec.ts` › `FR-21 ESSAY_SIMILAR flag on both sessions, idempotent`; `rg -n "LLMClient\|app\.llm" ai-service/app/embedding ai-service/app/consumers/essay_similarity.py` trả về 0 dòng |
| AC-5 | `apps/api/test/assessment/exam-flags.spec.ts` › `FR-21 CENTER lists flagged sessions; HR/STUDENT 403` |
| AC-6 | `apps/api/test/assessment/exam-flags.spec.ts` › `BR-11 HR view of flags has counts only, no peer session or identity` |

## Changelog entry

### Added
- Phòng thi ghi nhận chuyển tab, thoát toàn màn hình, cố copy/dán (copy/dán bị chặn) và gửi về server; số lần mỗi loại lưu vào cờ của bài thi.
- Phát hiện bài tự luận tương đồng giữa các sinh viên bằng embedding bge-m3, không dùng LLM.
- Màn cảnh báo ở cổng Trung tâm; tín hiệu chỉ để tham khảo, không đổi điểm hay trạng thái.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-21](../../PRD.md#functional-requirements)
- [Epic EPIC-4](../epics/EPIC-4.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D11](../../CONTEXT.md)
- [US-4.3 Phòng thi](US-4.3-exam-room.md)
- [US-5.3 HR duyệt danh sách đề cử](US-5.3-hr-nomination-review.md)
