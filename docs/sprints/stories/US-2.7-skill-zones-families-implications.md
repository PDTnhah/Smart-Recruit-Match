---
id: US-2.7
title: "Vùng, họ và quan hệ kéo theo của kỹ năng"
epic: EPIC-2
status: backlog
priority: P0
points: 8
sprint:
version_shipped:
prd_ref: [FR-39, FR-13]
arch_ref: [AD-15]
depends_on: [US-2.5]
assignee:
commit:
created: 2026-11-02
updated: 2026-11-02
---

## Goal

Danh mục kỹ năng biết ba điều mà hiện chưa biết:
- kỹ năng thuộc **vùng** công việc nào (Backend, CSDL, Kỹ năng mềm…);
- kỹ năng nào **cùng họ**, tức thay được cho nhau (MySQL ↔ PostgreSQL);
- kỹ năng nào **kéo theo** kỹ năng nào (Spring Boot ⇒ Java).

ADMIN gán và sửa các thông tin này. Module `matching` đọc chúng qua `SkillCatalogService.taxonomy()`, để [US-3.5](US-3.5-skill-evidence-code-matching.md) khớp kỹ năng bằng code.

## Background

[CONTEXT D42](../../CONTEXT.md) chuyển việc khớp kỹ năng CV–JD từ LLM sang code. Danh mục của US-2.5 ([CONTEXT D39](../../CONTEXT.md)) chỉ chuẩn hóa tên: "React.js" thành "React". Embedding không thay được quan hệ giữa hai kỹ năng: D39 đo React ~ React Native đạt 0,807, "Học máy" ~ "Machine Learning" chỉ 0,664. Người dùng chọn lưu taxonomy trong DB cùng danh mục, không lưu trong file code, để kỹ năng ADMIN vừa duyệt có họ ngay.

Ba khái niệm cần phân biệt:
- `group` (đã có) là *loại* kỹ năng: ngôn ngữ, framework, CSDL…
- **vùng** là *lĩnh vực công việc*;
- **họ** là *nhóm thay thế*. Mỗi họ thuộc đúng một vùng. Họ một phần tử được phép, để kỹ năng không có kỹ năng thay thế vẫn có vùng.

Vùng của kỹ năng suy ra từ họ. Kỹ năng mềm có mỗi họ là một **năng lực chuẩn** (PRD › *Kỹ năng mềm*).

**Lessons applied**: §6 (`db:generate`, commit `apps/api/drizzle`), §7 (hàm dùng chung nhiều bảng khai kiểu cụ thể), §10 (refine của form chạy cả khi trường khác lỗi), §12 (`FOR UPDATE OF` có schema), §22 (integration test dùng chung DB), §25 (form gửi `row_version` lúc nạp).

## Acceptance criteria

- [ ] **AC-1** — `packages/shared/contracts/skills.ts` có:
  - `SKILL_ZONES` gồm `FOUNDATION`, `BACKEND`, `FRONTEND`, `MOBILE`, `DATABASE`, `DATA_AI`, `DEVOPS_CLOUD`, `TESTING_QA`, `BUSINESS_ANALYSIS`, `PROCESS`, `SOFT_SKILL`;
  - `SKILL_FAMILIES` và bảng `FAMILY_ZONE`, mỗi họ đúng một vùng. Test chặn họ không có vùng.
  - Các họ của vùng `SOFT_SKILL` là 12 năng lực chuẩn: COMMUNICATION, TEAMWORK, LEADERSHIP, PROBLEM_SOLVING, PRESENTATION, CRITICAL_THINKING, SELF_LEARNING, TIME_MANAGEMENT, PROACTIVENESS, RESPONSIBILITY, ADAPTABILITY, ATTENTION_TO_DETAIL.
- [ ] **AC-2** — Migration:
  - thêm `core.skills.family` (nullable, CHECK theo `SKILL_FAMILIES`), kèm CHECK kỹ năng nhóm `SOFT_SKILL` ⇔ họ thuộc vùng `SOFT_SKILL` khi có họ;
  - tạo bảng `core.skill_implications(skill_id, implied_skill_id)`: khóa chính là cặp, khóa ngoại hai đầu tới `core.skills`, CHECK hai đầu khác nhau.

  Danh sách giá trị của CHECK sinh từ `packages/shared` như các CHECK khác.
- [ ] **AC-3** — Seed:
  - gán họ cho cả 174 kỹ năng có sẵn và khoảng 60 cạnh kéo theo;
  - thêm 5 kỹ năng mềm kèm alias tiếng Việt: Proactiveness / Chủ động, Responsibility / Tinh thần trách nhiệm, Attention to Detail / Cẩn thận tỉ mỉ, Adaptability / Thích nghi, Stress Tolerance / Chịu áp lực (họ ADAPTABILITY);
  - thêm alias "Ham học hỏi" cho Self-learning.

  Test kiểm: không có chu trình; mọi kỹ năng mềm có họ năng lực chuẩn; không key nào trùng (trigger `skills_keys_distinct` của D39 vẫn qua).
- [ ] **AC-4** — **Given** ADMIN thêm cạnh A ⇒ B mà B đã kéo theo A (trực tiếp hoặc qua nhiều bước), **When** lưu, **Then** API trả `422` mã `SKILL_IMPLICATION_CYCLE`, `details` nêu đường đi của chu trình, không ghi gì. Kiểm chu trình chạy trong giao dịch dưới khóa advisory `SKILL_CATALOGUE` exclusive (D39).
- [ ] **AC-5** — Dialog duyệt kỹ năng mới có ô chọn **Họ** (không bắt buộc, gom theo vùng, nhãn tiếng Việt) và ô **Kéo theo** (tìm theo `GET /api/skills`, tối đa 5 kỹ năng). Gợi ý của AI (nếu có) điền sẵn nhóm như hiện nay. `POST /api/admin/skills/{id}/approve` nhận thêm `family`, `impliesSkillIds`.
- [ ] **AC-6** — Kỹ năng đã duyệt sửa được họ và kéo theo qua `PATCH /api/admin/skills/{id}/taxonomy` (`family`, `impliesSkillIds`, `rowVersion`).
  - `rowVersion` lệch trả `409 ROW_VERSION_CONFLICT`.
  - Audit `SKILL_TAXONOMY_UPDATED` ghi `before`/`after`.
  - Kéo theo chỉ trỏ tới kỹ năng `APPROVED`; sai thì trả `422`.
- [ ] **AC-7** — Gộp kỹ năng X vào Y (luồng D39):
  - các cạnh của X chuyển sang Y;
  - cạnh trùng và cạnh tự trỏ bị bỏ;
  - chuyển xong mà tạo chu trình thì trả `422 SKILL_IMPLICATION_CYCLE`.
- [ ] **AC-8** — `SkillCatalogService.taxonomy()` trả mọi kỹ năng `APPROVED` gồm `skillId`, `canonicalName`, `nameKey`, `aliasKeys`, `group`, `family`, `zone` và `impliedSkillIds`. `impliedSkillIds` là **bao đóng** của quan hệ kéo theo, tính bằng hàm thuần `implicationClosure` trong `skills/domain/`. Kết quả tất định: sắp theo `skillId`.
- [ ] **AC-9** — Chỉ ADMIN gọi được các endpoint sửa taxonomy; STUDENT, HR, CENTER nhận `403`. `GET /api/admin/skills` trả thêm `family`, `zone` và danh sách kéo theo trực tiếp.
- [ ] **AC-10** — Bảng `/admin/skills` có cột Vùng và Họ, lọc được theo vùng. Nhãn tiếng Việt của vùng và họ đặt ở `apps/web/src/features/center/skills/labels.ts`. Bố cục đúng ở 360 / 768 / 1024 px.

## Tasks

- [ ] **TASK-2.7.1** — `packages/shared` (AC: 1): enum, `FAMILY_ZONE`, schema payload duyệt/sửa, mã lỗi `SKILL_IMPLICATION_CYCLE`, test.
- [ ] **TASK-2.7.2** — DB (AC: 2, 3): Drizzle schema, migration (`db:generate`, rebase trước khi sinh theo D20), seed họ và cạnh. Danh sách seed đưa người dùng duyệt trước khi commit.
- [ ] **TASK-2.7.3** — `skills/domain/` (AC: 4, 7, 8): `implicationClosure`, `findCycle` (DFS, trả đường đi), unit test và property test (bao đóng bắc cầu, không chứa chính nó).
- [ ] **TASK-2.7.4** — `skills` application/api (AC: 4–9): duyệt kèm taxonomy, `PATCH …/taxonomy`, gộp chuyển cạnh, `taxonomy()` export, audit.
- [ ] **TASK-2.7.5** — Web (AC: 5, 10): ô Họ và Kéo theo trong dialog duyệt, dialog sửa taxonomy, cột và bộ lọc, `api:sync`.
- [ ] **TASK-2.7.6** — Integration test (AC: 2–9): testcontainers PostgreSQL; tên test ghi FR-39.

## Dev notes

- AD-15 ([CONTEXT D42](../../CONTEXT.md)): taxonomy là dữ liệu do người duyệt. Không LLM hay embedding nào quyết định họ hoặc kéo theo. Gợi ý `SKILL_NORMALIZE` của D39 chưa gợi ý họ; nếu cần, làm ở prompt `skill_normalizer/v2`, ngoài phạm vi story.
- Nguyên tắc 11: khóa ngoại và CHECK ở DB. Chu trình không kiểm được bằng CHECK nên kiểm bằng TS dưới khóa advisory, như quy tắc key của D39.
- Nguyên tắc 13: `matching` chỉ gọi `taxonomy()`, không đọc `core.skills` hay `core.skill_implications`.
- View `core.v_ai_skills` không đổi: AI Service chưa cần họ.
- **Điểm hỏi trước khi chốt:** danh sách họ cụ thể và bảng seed. Story đề xuất khoảng 40 họ; người dùng duyệt ở phiên Execute trước khi sinh migration.
- Liên quan:
  - builds on US-2.5 (`core.skills`, khóa `SKILL_CATALOGUE`, dialog duyệt);
  - required by US-3.5 (khớp kỹ năng), US-3.3 (độ phủ theo vùng).
- Tham chiếu: PRD FR-13, FR-39, *Vùng và họ kỹ năng*; ARCH *Các bảng chính*, *Các module*; CONTEXT D39, D42.

## Verification commands

> Domain: `pnpm --filter @srm/api exec jest --testPathPatterns 'modules/skills/domain' --selectProjects unit`. Integration: `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/skill-taxonomy' --selectProjects integration` (dừng compose trước, LESSONS §15).

| AC | Command |
|---|---|
| AC-1 | `packages/shared/contracts/__tests__/skills.spec.ts` › `FR-39 every family belongs to exactly one zone` |
| AC-2, AC-3 | `test/integration/skill-taxonomy.int-spec.ts` › `FR-39 seed: families assigned, no cycle, soft skills mapped` |
| AC-4 | `skills/domain/__tests__/implications.spec.ts` › `FR-39 cycle is rejected with its path`; integration › `FR-39 cycle returns 422 and writes nothing` |
| AC-5, AC-6 | integration › `FR-39 approve with family and implications; taxonomy patch checks row_version` |
| AC-7 | integration › `FR-39 merge moves implications, drops duplicates and self-loops` |
| AC-8 | `skills/domain/__tests__/implications.property.spec.ts` › `FR-39 closure is transitive and irreflexive` |
| AC-9 | integration › `FR-39 only ADMIN edits taxonomy` |
| AC-10 | Kiểm tay `/admin/skills` ở 360 / 768 / 1024 px |

## Changelog entry

### Added
- Danh mục kỹ năng có vùng, họ (nhóm kỹ năng thay thế được) và quan hệ kéo theo; 12 năng lực chuẩn cho kỹ năng mềm. ADMIN gán khi duyệt và sửa cho kỹ năng đã duyệt; chặn quan hệ kéo theo tạo chu trình.
- `SkillCatalogService.taxonomy()` cho module `matching`.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-39](../../PRD.md#functional-requirements)
- [Epic EPIC-2](../epics/EPIC-2.md)
- [CONTEXT D39, D42](../../CONTEXT.md)
- [LESSONS](../../LESSONS.md)
