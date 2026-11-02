---
id: US-2.7
title: "Vùng, họ và quan hệ kéo theo của kỹ năng"
epic: EPIC-2
status: review
priority: P0
points: 8
sprint: sprint-2026-W45
version_shipped: 0.14.0
prd_ref: [FR-39, FR-13]
arch_ref: [AD-15]
depends_on: [US-2.5]
assignee: PDTnhah
commit: 0d88d96a47a5759c61d1958666d6c53b80ff8e80
created: 2026-11-02
updated: 2026-11-02
---

## Story refresh — 2026-11-02 (bắt đầu story)

Người dùng chốt các điểm mở ở phiên Plan ([CONTEXT D43](../../CONTEXT.md)). So với spec ban đầu:

- **AC-1**: 15 vùng, thêm `SECURITY_NETWORK`, `EMBEDDED_IOT`, `GAME_DEV`, `BLOCKCHAIN` trước `SOFT_SKILL`. Có 70 họ: 58 họ kỹ thuật, trong đó có `FOREIGN_LANGUAGE` (vùng `FOUNDATION`) cho English, Japanese, và 12 năng lực mềm.
- **AC-3**: 179 kỹ năng có họ (174 có sẵn và 5 kỹ năng mềm mới), 81 cạnh kéo theo. Bảng họ và cạnh nằm trong migration `0021_skill_taxonomy_seed`; người dùng đã duyệt bảng khi duyệt plan.
- **AC-7 bỏ**: chỉ kỹ năng `PENDING` gộp được, và kỹ năng `PENDING` không có cạnh kéo theo nào.
- Thêm mã lỗi `SKILL_NOT_APPROVED` (422) bên cạnh `SKILL_IMPLICATION_CYCLE`. Kéo theo chính mình trả lỗi chu trình với đường đi `[A, A]`. Mỗi kỹ năng kéo theo trực tiếp tối đa 5 kỹ năng. PATCH đổi `row_version`.

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

**Lessons applied**: §6 (`db:generate`, commit `apps/api/drizzle`), §7 (hàm dùng chung nhiều bảng khai kiểu cụ thể), §10 (refine của form chạy cả khi trường khác lỗi), §12 (`FOR UPDATE OF` có schema), §22 (integration test dùng chung DB), §25 (form gửi `row_version` lúc nạp), §26 (lỗi họ theo nhóm: `deps`).

## Acceptance criteria

- [x] **AC-1** — `packages/shared/contracts/skills.ts` có:
  - `SKILL_ZONES` gồm `FOUNDATION`, `BACKEND`, `FRONTEND`, `MOBILE`, `DATABASE`, `DATA_AI`, `DEVOPS_CLOUD`, `TESTING_QA`, `BUSINESS_ANALYSIS`, `PROCESS`, `SECURITY_NETWORK`, `EMBEDDED_IOT`, `GAME_DEV`, `BLOCKCHAIN`, `SOFT_SKILL` (D43);
  - `SKILL_FAMILIES` và bảng `FAMILY_ZONE`, mỗi họ đúng một vùng. Test chặn họ không có vùng.
  - Các họ của vùng `SOFT_SKILL` là 12 năng lực chuẩn: COMMUNICATION, TEAMWORK, LEADERSHIP, PROBLEM_SOLVING, PRESENTATION, CRITICAL_THINKING, SELF_LEARNING, TIME_MANAGEMENT, PROACTIVENESS, RESPONSIBILITY, ADAPTABILITY, ATTENTION_TO_DETAIL.
- [x] **AC-2** — Migration:
  - thêm `core.skills.family` (nullable, CHECK theo `SKILL_FAMILIES`), kèm CHECK kỹ năng nhóm `SOFT_SKILL` ⇔ họ thuộc vùng `SOFT_SKILL` khi có họ;
  - tạo bảng `core.skill_implications(skill_id, implied_skill_id)`: khóa chính là cặp, khóa ngoại hai đầu tới `core.skills`, CHECK hai đầu khác nhau.

  Danh sách giá trị của CHECK sinh từ `packages/shared` như các CHECK khác.
- [x] **AC-3** — Seed:
  - gán họ cho cả 174 kỹ năng có sẵn và 81 cạnh kéo theo (D43);
  - thêm 5 kỹ năng mềm kèm alias tiếng Việt: Proactiveness / Chủ động, Responsibility / Tinh thần trách nhiệm, Attention to Detail / Cẩn thận tỉ mỉ, Adaptability / Thích nghi, Stress Tolerance / Chịu áp lực (họ ADAPTABILITY);
  - thêm alias "Ham học hỏi" cho Self-learning.

  Test kiểm: không có chu trình; mọi kỹ năng mềm có họ năng lực chuẩn; không key nào trùng (trigger `skills_keys_distinct` của D39 vẫn qua).
- [x] **AC-4** — **Given** ADMIN thêm cạnh A ⇒ B mà B đã kéo theo A (trực tiếp hoặc qua nhiều bước), **When** lưu, **Then** API trả `422` mã `SKILL_IMPLICATION_CYCLE`, `details` nêu đường đi của chu trình, không ghi gì. Kiểm chu trình chạy trong giao dịch dưới khóa advisory `SKILL_CATALOGUE` exclusive (D39).
- [ ] **AC-5** — Dialog duyệt kỹ năng mới có ô chọn **Họ** (không bắt buộc, gom theo vùng, nhãn tiếng Việt) và ô **Kéo theo** (tìm theo `GET /api/skills`, tối đa 5 kỹ năng). Gợi ý của AI (nếu có) điền sẵn nhóm như hiện nay. `POST /api/admin/skills/{id}/approve` nhận thêm `family`, `impliesSkillIds`.
- [x] **AC-6** — Kỹ năng đã duyệt sửa được họ và kéo theo qua `PATCH /api/admin/skills/{id}/taxonomy` (`family`, `impliesSkillIds`, `rowVersion`).
  - `rowVersion` lệch trả `409 ROW_VERSION_CONFLICT`.
  - Audit `SKILL_TAXONOMY_UPDATED` ghi `before`/`after`.
  - Kéo theo chỉ trỏ tới kỹ năng `APPROVED`; sai thì trả `422`.
- [x] ~~**AC-7** — Gộp kỹ năng X vào Y chuyển các cạnh kéo theo của X sang Y.~~ Bỏ theo [CONTEXT D43](../../CONTEXT.md): kỹ năng `PENDING` không có cạnh.
- [x] **AC-8** — `SkillCatalogService.taxonomy()` trả mọi kỹ năng `APPROVED` gồm `skillId`, `canonicalName`, `nameKey`, `aliasKeys`, `group`, `family`, `zone` và `impliedSkillIds`. `impliedSkillIds` là **bao đóng** của quan hệ kéo theo, tính bằng hàm thuần `implicationClosure` trong `skills/domain/`. Kết quả tất định: sắp theo `skillId`.
- [x] **AC-9** — Chỉ ADMIN gọi được các endpoint sửa taxonomy; STUDENT, HR, CENTER nhận `403`. `GET /api/admin/skills` trả thêm `family`, `zone` và danh sách kéo theo trực tiếp.
- [ ] **AC-10** — Bảng `/admin/skills` có cột Vùng và Họ, lọc được theo vùng. Nhãn tiếng Việt của vùng và họ đặt ở `apps/web/src/features/center/skills/labels.ts`. Bố cục đúng ở 360 / 768 / 1024 px.

## Tasks

- [x] **TASK-2.7.1** — `packages/shared` (AC: 1): enum, `FAMILY_ZONE`, schema payload duyệt/sửa, mã lỗi `SKILL_IMPLICATION_CYCLE`, test.
- [x] **TASK-2.7.2** — DB (AC: 2, 3): Drizzle schema, migration (`db:generate`, rebase trước khi sinh theo D20), seed họ và cạnh theo bảng đã duyệt (D43).
- [x] **TASK-2.7.3** — `skills/domain/` (AC: 4, 8): `implicationClosure`, `findCycle` (DFS, trả đường đi), unit test và property test (bao đóng bắc cầu, không chứa chính nó).
- [x] **TASK-2.7.4** — `skills` application/api (AC: 4–9): duyệt kèm taxonomy, `PATCH …/taxonomy`, `taxonomy()` export, audit.
- [x] **TASK-2.7.5** — Web (AC: 5, 10): ô Họ và Kéo theo trong dialog duyệt, dialog sửa taxonomy, cột và bộ lọc, `api:sync`.
- [x] **TASK-2.7.6** — Integration test (AC: 2–6, 8, 9): testcontainers PostgreSQL; tên test ghi FR-39.

## Dev notes

- AD-15 ([CONTEXT D42](../../CONTEXT.md)): taxonomy là dữ liệu do người duyệt. Không LLM hay embedding nào quyết định họ hoặc kéo theo. Gợi ý `SKILL_NORMALIZE` của D39 chưa gợi ý họ; nếu cần, làm ở prompt `skill_normalizer/v2`, ngoài phạm vi story.
- Nguyên tắc 11: khóa ngoại, CHECK và trigger `skill_implications_valid` (đầu chưa duyệt, chu trình) ở DB. API kiểm trước bằng TS dưới khóa advisory, như quy tắc key của D39.
- Nguyên tắc 13: `matching` chỉ gọi `taxonomy()`, không đọc `core.skills` hay `core.skill_implications`.
- View `core.v_ai_skills` không đổi: AI Service chưa cần họ.
- Danh sách họ và bảng seed đã chốt ở phiên Plan (D43, *Story refresh*).
- Liên quan:
  - builds on US-2.5 (`core.skills`, khóa `SKILL_CATALOGUE`, dialog duyệt);
  - required by US-3.5 (khớp kỹ năng), US-3.3 (độ phủ theo vùng).
- Tham chiếu: PRD FR-13, FR-39, *Vùng và họ kỹ năng*; ARCH *Các bảng chính*, *Các module*; CONTEXT D39, D42.

## Verification commands

> Domain: `pnpm --filter @srm/api exec jest --testPathPatterns 'modules/skills/domain' --selectProjects unit`. Integration: `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/skill-taxonomy' --selectProjects integration` (dừng compose trước, LESSONS §15).

| AC | Command |
|---|---|
| AC-1 | `packages/shared/contracts/__tests__/skills.spec.ts` › `FR-39 every family belongs to exactly one zone` |
| AC-2, AC-3 | `test/integration/skill-taxonomy.int-spec.ts` › `FR-39 seed: families assigned, no cycle, soft skills mapped`, hai test `FR-39 Invariant 11: DB rejects …` |
| AC-4 | `skills/domain/__tests__/implications.spec.ts` › `FR-39 cycle is rejected with its path`; integration › `FR-39 cycle returns 422 and writes nothing` |
| AC-5, AC-6 | integration › `FR-39 approve with family and implications; taxonomy patch checks row_version`, `FR-39 implied skills must be approved; only an approved skill has a taxonomy` |
| AC-8 | `skills/domain/__tests__/implications.property.spec.ts` › `FR-39 closure is transitive and irreflexive`; integration › `FR-39 taxonomy() lists approved skills by id with the closure of their implications` |
| AC-9 | integration › `FR-39 only ADMIN edits taxonomy` |
| AC-10 | Kiểm tay `/admin/skills` ở 360 / 768 / 1024 px |

## Changelog entry

Mục `[0.14.0]` trong [CHANGELOG](../../CHANGELOG.md): vùng, họ, kéo theo (migration `0020`–`0022`), `PATCH …/taxonomy`, `taxonomy()`, giao diện `/admin/skills`; sửa phím của `SkillInput`.

**Commit**: 0d88d96

## Implementation notes

**2026-11-02 — phiên 2a** (TASK-2.7.1, 2.7.3).

- **Migration:** `0021_skill_taxonomy_seed` sinh bằng script từ bảng của plan. Kỹ năng mềm mới hoặc alias "Ham học hỏi" trùng key kỹ năng khác thì bị bỏ qua kèm `NOTICE` (chỉ ở DB dev có người nhập tay). Số dòng của họ (174) hoặc cạnh (81) lệch thì `RAISE EXCEPTION`.
- **`skillName` bỏ `abort: true`** (LESSONS §10). `whenValid` chuyển sang `schemas/common.ts`.
- **Kiểm họ hợp nhóm:** `familyFitsGroup` (contracts) trả đúng/sai; `familyGroupError` (schemas) trả thông báo, API dùng để trả `400` khi PATCH.
- **`findCycle(edges, from)`** tìm từ `from`: đường đi bắt đầu và kết thúc ở kỹ năng đang sửa.

**2026-11-02 — phiên 2b** (TASK-2.7.2, 2.7.4, 2.7.6).

- **Thứ tự kiểm khi PATCH:** 404 → 409 → `422 SKILL_NOT_APPROVED` (chính kỹ năng) → `400` họ không hợp nhóm → kéo theo: tự trỏ (lỗi chu trình `[A, A]`), đích chưa duyệt, rồi `findCycle`.
- **Thứ tự sắp:** `AdminSkill.implies` theo tên (để hiển thị); `impliedSkillIds` của `taxonomy()` theo id. Audit ghi `impliesSkillIds` tăng dần.
- **`taxonomy()`** đọc trong một giao dịch `repeatable read, read only`, không cache; US-3.5 tự quyết có cache hay không.

**2026-11-02 — phiên 2c** (TASK-2.7.5).

- **Web:** `FamilyField` chỉ hiện họ hợp nhóm; đổi nhóm làm họ không hợp thì về "Không có họ". `ImpliedSkillsField` gợi ý dưới ô như `SkillInput`, bỏ chính kỹ năng và kỹ năng đã chọn; Enter chỉ gửi form khi ô tìm rỗng.
- **`pnpm test` đầy đủ:** hai test cũ đỏ vì bảng mới, đã sửa (LESSONS §30).
- **Design applied**: DESIGN §1, §5 (bảng cuộn ngang, bộ lọc `w-full` dưới `sm`, sheet `bottom` dưới `md`), §6 (đã ghi thêm: `alert-dialog` cuộn, `sheet` cho form sửa, `select` gom nhóm, chọn nhiều theo `SkillInput`), §7, §8, §9, §11.

**2026-11-02 — phiên 3** (Review, Doc/Version gate). `/code-review` ra 14 điểm. Đã sửa:

- ô Kéo theo: Esc chỉ đóng danh sách gợi ý (LESSONS §29); Enter không chọn kỹ năng của kết quả tìm cũ; ArrowUp khi chưa chọn tới gợi ý cuối. Hook `useListboxActive` dùng chung với `SkillInput`, nên hai lỗi phím ở đó cũng hết;
- PATCH bắt buộc gửi `family` và `impliesSkillIds` (trước đó body chỉ có `rowVersion` xóa hết); lưu không đổi gì thì không tăng `row_version`, không ghi audit;
- trigger `skill_implications_valid` (`0022`, Nguyên tắc 11). Khi duyệt không đọc cả đồ thị: kỹ năng `PENDING` không nằm trong cạnh nào;
- `zoneOf` dùng chung; `useIsMobile` gọi một lần cho cả bảng.

Không sửa: `row_version` tăng làm embedding của kỹ năng được tính lại (đã chấp nhận ở D43); `ImpliedSkillsField` và `SkillInput` vẫn là hai combobox, chỉ chung hook phím; `updateTaxonomy` tự kiểm 404/409, không dùng chung `checkedPending`.

Lessons: §29, §30 mới; §10 bổ sung.

**Còn chờ người kiểm tay** (AC-5, AC-10), ở 360 / 768 / 1024 px:
- duyệt kỹ năng có chọn họ và kéo theo; đổi nhóm sang Kỹ năng mềm thì họ đang chọn bị bỏ;
- sửa họ, kéo theo của kỹ năng đã duyệt; thử tạo chu trình (VD: sửa Java kéo theo Spring Boot) và thấy thông báo có đường đi;
- trong dialog và sheet, Esc ở ô Kéo theo chỉ đóng danh sách gợi ý; bấm Esc lần nữa mới đóng form;
- lọc theo vùng và trạng thái rỗng của vùng; bảng không làm vỡ trang ở 360 px.

## Files modified

- `packages/shared`: `contracts/skills.ts`; `schemas/{skill,errors,common,campaign}.ts`; test của contracts và schemas.
- `apps/api`: `src/db/schema/skills.ts`; `drizzle/0020_*`–`0022_*` và `meta/`; `src/modules/skills/` (domain, application, infrastructure, api); `src/common/errors/domain-error.ts`; `test/integration/` (`skill-taxonomy` mới; `core-schema`, `ai-service-role` sửa theo bảng mới).
- `apps/web`: `src/features/center/skills/` (`taxonomy-fields.tsx`, `edit-taxonomy-sheet.tsx` mới); `src/features/student/profile/skill-input.tsx`; `src/hooks/` (`use-debounced.ts`, `use-listbox-active.ts`); `src/shared/api/` (`errors.ts`, OpenAPI và kiểu sinh ra).
- Docs: CONTEXT D43, LESSONS, ARCHITECTURE, AGENTS, PRD, EPIC-2, sprint W44, W45, STATUS, CHANGELOG, VERSION, `CLAUDE.md`, DESIGN.md.

## Cross-references

- [PRD FR-39](../../PRD.md#functional-requirements)
- [Epic EPIC-2](../epics/EPIC-2.md)
- [CONTEXT D39, D42](../../CONTEXT.md)
- [LESSONS](../../LESSONS.md)
