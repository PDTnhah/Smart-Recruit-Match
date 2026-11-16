---
id: US-2.8
title: "Tìm kỹ năng trong danh mục khi ô tìm còn trống"
epic: EPIC-2
status: review
priority: P1
points: 1
sprint: sprint-2026-W47
version_shipped: 0.25.1
prd_ref: [FR-13]
depends_on: [US-2.5]
assignee: PDTnhah
commit:
created: 2026-11-15
updated: 2026-11-16
---

## Goal

`GET /api/skills` không có `query` trả các kỹ năng đã duyệt, sắp theo tên, như web vẫn chờ, thay vì `500`. Ô chọn kỹ năng ở màn duyệt, gộp kỹ năng và taxonomy hiện được gợi ý ngay khi mở.

## Background

Phát hiện khi điều tra [US-1.8](US-1.8-profile-default-campaign.md) ngày 2026-11-15 ([CONTEXT D55](../../CONTEXT.md)). Log của container `api` ngày 13/11 có bốn lần `GET /api/skills?limit=6` → `500` (04:13:06, 04:13:09, 04:13:40, 04:13:44), lúc ADMIN gộp kỹ năng:

```
Failed query: select "id", "canonical_name", "group", "aliases" from "core"."skills"
where "core"."skills"."status" = $1 order by 0, "core"."skills"."canonical_name" asc limit $2
… ORDER BY position 0 is not in select list
```

`SkillRepository.search` (`apps/api/src/modules/skills/infrastructure/skill.repository.ts`) đặt `rank = sql\`0\`` khi key của `query` rỗng, rồi `orderBy(rank, asc(canonicalName))`. PostgreSQL hiểu số nguyên trong `ORDER BY` là vị trí cột, nên `0` không hợp lệ. Web gửi `{ limit }` không kèm `query` khi ô trống (`useCatalogSkills`, `features/center/skills/api.ts`; comment ghi "all of them by name when empty"). Query chỉ có khoảng trắng hoặc dấu câu cũng ra key rỗng và gặp cùng lỗi.

Integration test hiện chỉ gọi `GET /api/skills` không có `query` khi chưa đăng nhập (`401`), nên không chạm tới truy vấn.

**Lessons applied**: §15 (chạy `pnpm test` khi compose đã dừng), §21 (`--testPathPatterns` cho một file integration), §22 (các file test dùng chung DB: kiểm thứ tự của chính các dòng trả về, không so một danh sách cố định), §47 (hai file code là CRLF trong working tree, đổi về LF trước khi stage).

## Story refresh (2026-11-16)

AC-2 ghi "dấu câu": `skillMatchKey` chỉ bỏ khoảng trắng, `.`, `-`, `_`, `/` (giữ `+`, `#` cho "C++", "C#"). Query như `!?` có key khác rỗng, không gặp lỗi này, và chỉ trả rỗng vì không kỹ năng nào khớp. AC-2 hiểu là query chỉ gồm các ký tự bị bỏ.

## Acceptance criteria

- [x] **AC-1** — **Given** người dùng đã đăng nhập, **When** gọi `GET /api/skills?limit=6` (không có `query`), **Then** `200` với tối đa 6 kỹ năng `APPROVED`, sắp theo `canonical_name`.
- [x] **AC-2** — `query` chỉ có khoảng trắng hoặc các ký tự `skillMatchKey` bỏ (`.`, `-`, `_`, `/`), tức key rỗng, cũng như AC-1.
- [x] **AC-3** — Thứ tự khi có `query` giữ nguyên (khớp key → khớp đầu → còn lại, rồi theo tên): test `react js` hiện có vẫn xanh.

## Tasks

- [x] **TASK-2.8.1** — `SkillRepository.search` chỉ thêm `rank` vào `ORDER BY` khi key khác rỗng.
- [x] **TASK-2.8.2** — Ca integration `FR-13 US-2.8 …` trong `skills-catalog.int-spec.ts` › `AC-8 roles and lookup`: không có `query`, `'   '`, `' . - _ / '` → `200`, 6 kỹ năng `APPROVED`, thứ tự bằng thứ tự DB đọc lại theo `canonical_name`. Chạy đỏ (`500`) trước khi sửa.
- [ ] **TASK-2.8.3** — Kiểm tay (người dùng, trên compose): ở màn gộp kỹ năng, mở ô chọn kỹ năng đích khi chưa gõ gì thì thấy gợi ý, không có toast lỗi.

## Dev notes

- Sửa: `rank` là `SQL | undefined`, `orderBy(...(rank ? [rank] : []), asc(skills.canonicalName))`. Không đổi API, không migration.
- Test so thứ tự các id trả về với `SELECT … WHERE id IN (…) ORDER BY canonical_name` thay vì một danh sách cố định: file test khác ghi kỹ năng vào cùng DB lúc chạy song song, và collation của DB khác `localeCompare`.

## Verification commands

`pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/skills-catalog' --selectProjects integration`.

## Implementation notes

**Phiên 1 (2026-11-16): Plan + Execute + Review + Doc/Version gate**, gộp một phiên vì story 1 điểm. Người dùng chọn đóng W45, W46 và mở `sprint-2026-W47` cùng story này. Ca mới đỏ `500` trước khi sửa, 14/14 xanh sau khi sửa.

**Files modified**: `apps/api/src/modules/skills/infrastructure/`, `apps/api/test/integration/skills-catalog.int-spec.ts`; tài liệu: story, `sprint-2026-W45/W46/W47`, EPIC-2, PRD (bảng story), `sprints/README.md`, `CLAUDE.md` (`active_sprint`), VERSION, CHANGELOG, `package.json`.

Lessons: none new — sửa một dòng `ORDER BY`, lỗi đã có test tái hiện; bẫy không lặp lại ở chỗ khác (không còn `sql\`0\`` nào trong `ORDER BY`).

## Cross-references

- [PRD FR-13](../../PRD.md#functional-requirements) · [EPIC-2](../epics/EPIC-2.md) · [CONTEXT D39, D55](../../CONTEXT.md)
- [US-2.5 Embedding và danh mục kỹ năng](US-2.5-embeddings-skill-catalog.md)
- [Sprint W47](../sprint-2026-W47.md)
