---
id: US-2.8
title: "Tìm kỹ năng trong danh mục khi ô tìm còn trống"
epic: EPIC-2
status: backlog
priority: P1
points: 1
sprint:
version_shipped:
prd_ref: [FR-13]
depends_on: [US-2.5]
assignee:
commit:
created: 2026-11-15
updated: 2026-11-15
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

**Lessons applied**: none yet — story tạo ở backlog lúc điều tra US-1.8; đọc mục lục `docs/LESSONS.md` khi bắt đầu story.

## Acceptance criteria (nháp)

- [ ] **AC-1** — **Given** người dùng đã đăng nhập, **When** gọi `GET /api/skills?limit=6` (không có `query`), **Then** `200` với tối đa 6 kỹ năng `APPROVED`, sắp theo `canonical_name`.
- [ ] **AC-2** — `query` chỉ có khoảng trắng hoặc dấu câu (key rỗng) cũng như AC-1.
- [ ] **AC-3** — Thứ tự khi có `query` giữ nguyên (khớp key → khớp đầu → còn lại, rồi theo tên): test `react js` hiện có vẫn xanh.

## Dev notes

- Sửa: chỉ thêm `rank` vào `ORDER BY` khi key khác rỗng. Ví dụ: `orderBy(...(key === '' ? [] : [rank]), asc(skills.canonicalName))`. Không đổi API, không migration.
- Test: thêm ca vào `apps/api/test/integration/skills-catalog.int-spec.ts` › `AC-8 roles and lookup`, tên có `FR-13`.
- Kiểm tay: ở màn gộp kỹ năng, mở ô chọn kỹ năng đích khi chưa gõ gì thì thấy gợi ý, không có toast lỗi.

## Verification commands

`pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/skills-catalog' --selectProjects integration`.

## Cross-references

- [PRD FR-13](../../PRD.md#functional-requirements) · [EPIC-2](../epics/EPIC-2.md) · [CONTEXT D39, D55](../../CONTEXT.md)
- [US-2.5 Embedding và danh mục kỹ năng](US-2.5-embeddings-skill-catalog.md)
