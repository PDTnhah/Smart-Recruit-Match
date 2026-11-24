---
id: US-5.6
title: "Tóm tắt hồ sơ đề cử bằng AI cho HR"
epic: EPIC-5
status: backlog
priority: P2
points: 5
sprint:
version_shipped:
prd_ref:
  - FR-28
arch_ref:
  - AD-2
  - AD-5
depends_on:
  - US-5.3
  - US-2.2
assignee:
commit:
created: 2026-11-24
updated: 2026-11-24
---

## Goal

HR mở một đề cử và đọc thêm một đoạn tóm tắt hồ sơ do AI viết, gắn nhãn "Tóm tắt do AI – chỉ để tham khảo". Tóm tắt không đổi thứ tự danh sách, không đổi điểm và không thay quyết định của HR. **Người dùng chưa quyết có làm story này hay không** ([CONTEXT D65](../../CONTEXT.md)); đây là phần AC-11 và TASK-5.3.6 tách khỏi [US-5.3](US-5.3-hr-nomination-review.md).

## Background

ARCH › *Bản đồ sử dụng LLM theo giai đoạn* có tác vụ GĐ8 "Tóm tắt hồ sơ cho HR" (effort `low`, job nền sau khi có S_final, HR đọc tham khảo) và *Ước tính chi phí* có dòng cho nó, nhưng ARCH chưa có queue, thư mục agent hay cột lưu kết quả. US-5.3 đã có màn chi tiết đủ thông tin của FR-28 mà không cần tóm tắt.

**Lessons applied**: none yet — story tạo ở backlog lúc làm US-5.3; đọc mục lục `docs/LESSONS.md` khi bắt đầu story.

Ràng buộc: AGENTS › Nguyên tắc 1, 2 (LLM không quyết định, không sắp thứ tự); BR-03, NFR-3 (chỉ gửi `profile_masked` và điểm, không có tên, liên hệ hay CV gốc); Nguyên tắc 6 (hồ sơ là dữ liệu, không phải chỉ dẫn); Nguyên tắc 12 (lưu `model`, `prompt_version`); Nguyên tắc 15 (payload chỉ chứa ID, idempotent theo `job_id`).

## Acceptance criteria

- [ ] **AC-1** — **Given** một vòng vừa công bố, **When** job tóm tắt chạy cho các đề cử của vòng, **Then** mỗi đề cử có một tóm tắt lưu kèm `model` và `prompt_version`; dữ liệu gửi LLM chỉ gồm `profile_masked` và điểm.
- [ ] **AC-2** — Màn chi tiết đề cử của HR hiện tóm tắt với nhãn "Tóm tắt do AI – chỉ để tham khảo"; không có tóm tắt thì màn vẫn đủ thông tin như US-5.3.
- [ ] **AC-3** — Danh sách đề cử giữ nguyên thứ tự khi có hoặc không có tóm tắt (BR-13); không đường code nào dùng tóm tắt để quyết định.
- [ ] **AC-4** — Test của AI Service dùng fixture, không gọi API thật; LLM từ chối hoặc sai schema thì không có tóm tắt, màn chi tiết vẫn dùng được.

## Tasks

- [ ] **TASK-5.6.1** — Chốt queue (đề xuất `ai.profile.summarize`), agent (`profile_summarizer`), chỗ lưu (đề xuất cột `nominations.ai_summary` JSONB `text`, `model`, `prompt_version`, hoặc bảng của `review`); ghi CONTEXT.
- [ ] **TASK-5.6.2** — Hợp đồng message trong `packages/shared/contracts` (Zod → JSON Schema → Pydantic, `pnpm contracts:gen`).
- [ ] **TASK-5.6.3** — Agent theo mẫu `ai-service/app/agents/jd_analyzer/`, prompt `ai-service/app/prompts/profile_summarizer/v1.md`, effort `low`, qua `LLMClient`; fixture và test.
- [ ] **TASK-5.6.4** — Core Backend gửi job sau khi công bố vòng, nhận `ai.result.PROFILE_SUMMARY`, lưu; màn chi tiết của US-5.3 hiện tóm tắt.

## Dev notes

- Đọc [US-5.3](US-5.3-hr-nomination-review.md) › *Implementation notes* trước: chi tiết đề cử dựng ở `NominationQueryService.detail` (module `review`), đề cử thuộc `allocation` (CONTEXT D64).
- Chi phí ước tính ở ARCH › *Ước tính chi phí* (~600 lượt, ~14 USD mỗi đợt).

## Verification commands

| AC | Command |
|---|---|
| AC-1, AC-4 | `ai-service/tests/agents/test_profile_summarizer.py` (fixture) |
| AC-2, AC-3 | `apps/api/test/integration/nomination-review.int-spec.ts` |

## Changelog entry

### Added
- Tóm tắt hồ sơ đề cử bằng AI cho HR, chỉ để tham khảo.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [US-5.3](US-5.3-hr-nomination-review.md) · [EPIC-5](../epics/EPIC-5.md) · [CONTEXT D65](../../CONTEXT.md)
- [ARCHITECTURE › Bản đồ sử dụng LLM theo giai đoạn](../../ARCHITECTURE.md)
