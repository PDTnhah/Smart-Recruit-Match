---
id: US-3.1
title: "Lọc điều kiện cứng và công thức S_cv"
epic: EPIC-3
status: review
priority: P0
points: 5
sprint: sprint-2026-W44
version_shipped: 0.13.0
prd_ref: [FR-14]
arch_ref: [AD-2]
depends_on: [US-2.3, US-1.4]
assignee: PDTnhah
commit:
created: 2026-10-07
updated: 2026-10-28
---

## Story refresh — 2026-10-28 (bắt đầu story)

Người dùng chốt bốn điểm mở ([CONTEXT D41](../../CONTEXT.md)): 5 khóa phẳng `scv_weight_*` trong `campaigns.config` có ô trên form đợt; tiêu chí rỗng chia lại trọng số theo tỷ lệ; GPA lấy từ `students.gpa`, thang 4; ngoại ngữ bắt buộc do code đọc chứng chỉ, chỉ so cùng loại. So với spec ban đầu:

- `JdHardConditions` (D35) có `min_study_year` là năm học **tối thiểu**: AC-1 dùng `YEAR_BELOW_MIN`, thêm `MAJOR_MISSING`, `YEAR_MISSING`.
- `HardFilterFacts`, `IneligibleReason` nằm ở `schemas/matching.ts`. `MatchCriteria.education` bỏ `gpa_4`; `computeScv` nhận thêm yêu cầu JD để lấy trọng số kỹ năng.
- Phạm vi thêm (AC-12…AC-14): 5 ô trọng số, migration `0019` (CHECK GPA 0–4), bộ đọc chứng chỉ, devDependency `fast-check`. Story tăng từ 3 lên 5 điểm, kéo sớm từ W45 vào W44.

## Goal

Lọc điều kiện cứng và tính S_cv bằng hàm TypeScript thuần trong `apps/api/src/modules/matching/domain/`. US-3.2 đưa verdict của Matching Agent vào hàm để có S_cv, US-3.3 dùng cùng hàm để lập shortlist; đổi trọng số thì tính lại từ verdict đã lưu, không gọi lại LLM.

## Background

GĐ3: lọc điều kiện cứng bằng luật, lọc sơ bộ bằng embedding, rồi Matching Agent đánh giá từng tiêu chí ([US-3.2](US-3.2-batch-matching-agent.md)). Story này làm hai phần tất định ở hai đầu. Theo AD-2 ([CONTEXT D2](../../CONTEXT.md)), LLM trả verdict, code tính `S_cv = Σ wᵢ · sᵢ` (PRD › *Cơ chế chấm điểm* › *S_cv*). Cặp không đạt điều kiện cứng không bao giờ được gửi cho LLM. Không có bảng hay endpoint mới.

**Lessons applied**: §5 (kiểm `domain-no-framework` bằng fixture), §6 (`db:generate`, commit cả `apps/api/drizzle`), §10 (lỗi tổng trọng số dùng `whenValid`), §15 (dừng compose trước `pnpm test`), §21 (`--testPathPatterns`).

## Acceptance criteria

- [x] **AC-1** — **Given** điều kiện cứng của JD (`majors[]`, `min_study_year`, `min_gpa`, `required_languages[]`) và dữ kiện của một SV, **When** gọi `checkHardFilters(facts, hardConditions)`, **Then** trả `{ eligible, ineligibleReasons }`. Mỗi điều kiện không đạt sinh đúng một lý do (`MAJOR_NOT_ALLOWED`, `MAJOR_MISSING`, `YEAR_BELOW_MIN`, `YEAR_MISSING`, `GPA_BELOW_MIN`, `GPA_MISSING`, `LANGUAGE_NOT_MET`) kèm `required` và `actual`; mỗi ngoại ngữ không đạt là một lý do. Đạt hết thì `eligible = true`, `ineligibleReasons = []`.
- [x] **AC-2** — `HardFilterFacts` chỉ gồm `major`, `yearOfStudy`, `gpa4`, `languageCertificates[]`, không có ảnh, giới tính, ngày sinh, quê quán, tôn giáo, tình trạng hôn nhân (BR-03); `.strict()` từ chối trường lạ.
- [x] **AC-3** — JD có GPA tối thiểu mà SV chưa có GPA thì không đủ điều kiện, lý do `GPA_MISSING`. JD không có điều kiện cứng nào thì `eligible = true`.
- [x] **AC-4** — **Given** verdict như đầu ra mẫu ở PRD (Java `MET`, SQL `PARTIAL`, Docker `NOT_MET`; Redis `NOT_MET`; `score_0_4 = 3`; ngành `EXACT`; ngoại ngữ `MET`), GPA 3,2, trọng số kỹ năng bằng nhau, trọng số tiêu chí mặc định, **When** gọi `computeScv`, **Then** `scvX100 = 5880`, kèm bảng sᵢ, wᵢ, wᵢ·sᵢ của 5 tiêu chí.
- [x] **AC-5** — Java `MET` trọng số 3, SQL `PARTIAL` trọng số 1, Docker `NOT_MET` trọng số 1 cho sᵢ kỹ năng bắt buộc = 100 × (3 + 0,5 + 0) / 5 = 70.
- [x] **AC-6** — Cùng `criteria`, bộ trọng số khác cho S_cv mới đúng công thức. Hàm chỉ nhận yêu cầu JD, `criteria`, trọng số và GPA; không phụ thuộc LLM, DB hay mạng (AD-2).
- [x] **AC-7** — Property-based test (fast-check): 0 ≤ S_cv ≤ 100; nâng một verdict hoặc `score_0_4` không làm S_cv giảm; cùng đầu vào cho cùng kết quả.
- [x] **AC-8** — Tổng trọng số tiêu chí khác 1 hoặc có trọng số âm thì cấu hình báo lỗi. JD không có kỹ năng bổ trợ hoặc không yêu cầu ngoại ngữ thì không chia cho 0, không `NaN`, trọng số tiêu chí rỗng chia lại theo tỷ lệ (D41); tổng còn lại bằng 0 thì `scvX100 = 0`.
- [x] **AC-9** — `scvX100` là số nguyên ×100; trọng số theo phần vạn; làm tròn half-up một lần ở cuối. Quy đổi: ngành `EXACT` / `RELATED` / `OTHER` → 100 / 60 / 20; GPA thang 4 × 25, thiếu GPA tính 0; ngoại ngữ `MET` / `PARTIAL` / `NOT_MET` → 100 / 50 / 0.
- [x] **AC-10** — `selectShortlist(results, thetaCv)` trả JD có `eligible = true` và `scvX100 ≥ θ_cv × 100` (đúng bằng θ_cv vẫn vào), sắp S_cv giảm dần, hòa thì `jdId` tăng dần. Cặp bị lọc sơ bộ (chưa có S_cv) không vào.
- [x] **AC-11** — `matching/domain/` không import NestJS hay Drizzle (Nguyên tắc 13).
- [x] **AC-12** — Yêu cầu có chứng chỉ (TOEIC, IELTS, TOEFL iBT/ITP, JLPT, TOPIK, HSK, VSTEP/CEFR) chỉ đạt khi SV có chứng chỉ cùng loại với điểm hoặc bậc ≥ yêu cầu. Yêu cầu chỉ nêu tên ngôn ngữ đạt khi SV có ngôn ngữ đó. Yêu cầu không đọc được thì so chuỗi đã chuẩn hóa. Không quy đổi giữa các loại (D41).
- [ ] **AC-13** — Form tạo đợt có 5 ô trọng số S_cv, mặc định 0,40 / 0,15 / 0,20 / 0,15 / 0,10. Tổng khác 1 thì form và API báo lỗi ở ô cuối, kể cả khi ô khác đang lỗi. Sau `DRAFT`, 5 trọng số chỉ đọc. Đợt tạo trước bản này nhận giá trị mặc định.
- [x] **AC-14** — GPA thang 4: `StudentProfileInputSchema` và CHECK `students_gpa_check` chỉ nhận 0–4.

## Tasks

Chi tiết thiết kế ở [CONTEXT D41](../../CONTEXT.md). Đường dẫn domain: `apps/api/src/modules/matching/domain/`.

- [x] **TASK-3.1.1** — `packages/shared` (AC: 2, 4, 8, 9, 13, 14): `contracts/matching.ts` (`MatchCriteria`, refine `MET`/`PARTIAL` cần `evidence`, `contracts:gen`); 5 khóa `scv_weight_*` và `checkScvWeights` trong `schemas/campaign.ts`; `schemas/matching.ts`; GPA 0–`GPA_SCALE_MAX` trong `schemas/auth.ts`.
- [x] **TASK-3.1.2** — Lọc điều kiện cứng (AC: 1, 2, 3, 12): `language-requirement.ts`, `hard-filter.ts`.
- [x] **TASK-3.1.3** — `scv.ts` (AC: 4–9): phân số `bigint`, half-up một lần, tiêu chí rỗng chia lại trọng số, verdict ghép với kỹ năng JD theo `skillKey`.
- [x] **TASK-3.1.4** — `shortlist.ts`: `meetsCvThreshold`, `selectShortlist`, dùng chung cho cả hai chiều đọc của D36 (AC: 10).
- [x] **TASK-3.1.5** — Cấu hình đợt và thang GPA (AC: 13, 14): nhóm 5 ô ở `parameter-fields.tsx` (form và trang chỉ đọc), `api:sync`, CHECK 0–4 và migration `0019`.
- [x] **TASK-3.1.6** — Test, tên ghi mã GĐ/BR (AC: 1–14): `fast-check` 4.10.2 cho `@srm/api` (US-5.1 cũng cần: nhánh merge sau rebase lockfile); spec domain, shared; `depcruise`, `depcruise:fixture`.

## Dev notes

- AD-2: LLM trả verdict kèm bằng chứng, code tính S_cv; AD-1: phần tất định ở Core Backend, không ở AI Service.
- Nguyên tắc 13, 14: `domain/` là TS thuần, application layer của US-3.2 đọc DB rồi truyền dữ liệu vào; kiểu dùng chung ở `packages/shared`.
- Điểm ×100 như Allocation Engine; `match_results.s_cv` của US-3.2 lưu `numeric(5,2)`. Quy tắc suy ra `yearOfStudy` từ `cohort` để US-3.2.
- Liên quan: builds on US-2.3 (`JdRequirements`), US-1.4 (`campaigns.config`, khóa sau `DRAFT`); required by US-3.2, US-3.3; sibling US-4.4 (cùng cách làm tròn), US-5.1 (điểm ×100).
- Tham chiếu: PRD FR-14, *S_cv*, GĐ3, BR-03; ARCH AD-1, AD-2, *Những chỗ cố ý KHÔNG dùng LLM*; CONTEXT D2, D35, D36, D41.

## Verification commands

> File `__tests__/` nằm trong `apps/api/src/modules/matching/domain/`. Test domain: `pnpm --filter @srm/api exec jest --testPathPatterns 'modules/matching/domain' --selectProjects unit`. Test schema: `pnpm --filter @srm/shared test`.

| AC | Command |
|---|---|
| AC-1 | `__tests__/hard-filter.spec.ts` › `GĐ3 hard filter: each failed condition yields one reason code` |
| AC-2 | `__tests__/hard-filter.spec.ts` › `BR-03 hard filter facts reject sensitive fields (strict schema)` |
| AC-3 | `__tests__/hard-filter.spec.ts` › `GĐ3 hard filter: missing GPA and JD without conditions` |
| AC-4 | `__tests__/scv.spec.ts` › `GĐ3 S_cv: PRD sample output yields 58.80 with default weights` |
| AC-5 | `__tests__/scv.spec.ts` › `GĐ3 S_cv: must-have score is skill-weighted average` |
| AC-6 | `__tests__/scv.spec.ts` › `AD-2 S_cv recomputes from stored criteria when weights change` |
| AC-7 | `__tests__/scv.property.spec.ts` › `GĐ3 AD-2 S_cv bounded, monotonic and deterministic` |
| AC-8 | `packages/shared/schemas/__tests__/campaign.spec.ts` › `GĐ0 S_cv weights must sum to 1 and be non-negative`; `__tests__/scv.spec.ts` › `GĐ3 S_cv: empty criterion is redistributed, never NaN` |
| AC-9 | `__tests__/scv.spec.ts` › `GĐ3 S_cv: integer x100 arithmetic and conversions` |
| AC-10 | `__tests__/shortlist.spec.ts` › `GĐ3 shortlist: eligible and S_cv >= theta, sorted desc, ties by jdId` |
| AC-11 | `rg -l "@nestjs\|drizzle-orm" apps/api/src/modules/matching/domain` không trả file nào; `pnpm depcruise`, `pnpm depcruise:fixture` xanh |
| AC-12 | `__tests__/language-requirement.spec.ts` › `GĐ3 language requirement: same certificate type only, language name, unparsed text` |
| AC-13 | `packages/shared/schemas/__tests__/campaign.spec.ts` › `GĐ0 S_cv weights default and sum error shows with other errors`; kiểm tay form đợt ở 360 / 768 / 1024 px |
| AC-14 | `packages/shared/schemas/__tests__/auth.spec.ts` › GPA thang 4; migration `0019` áp được bằng `pnpm --filter @srm/api db:migrate` |

## Changelog entry

### Added
- Module `matching` (`domain/`): hàm thuần lọc điều kiện cứng (ngành, năm học, GPA, ngoại ngữ bắt buộc) kèm mã lý do; tính S_cv bằng số nguyên ×100 từ verdict từng tiêu chí (AD-2); lập shortlist.
- `packages/shared`: hợp đồng `MatchCriteria`, `HardFilterFacts`, `IneligibleReason`, 5 trọng số S_cv trong cấu hình đợt.
- Form tạo đợt: nhóm 5 ô trọng số S_cv, tổng bằng 1.

### Changed
- GPA sinh viên dùng thang 4 (migration `0019`); ngành so khớp không phân biệt cách gõ dấu (NFC).

**Commit**:

## Implementation notes

- Phiên 1 (Plan), phiên 2 (Execute + Self-verify), phiên 3 (Review + Doc/Version gate), cùng ngày 2026-10-28. Kết thúc phiên 3: `typecheck`, `lint`, shared 220, api 496 (gồm integration), `depcruise` xanh.
- Bộ đọc ngoại ngữ, ngoài D41 (sửa theo `/code-review`):
  - nhiều chứng chỉ hoặc ngôn ngữ trong một yêu cầu là các lựa chọn; các phần nối bằng "và" / "and" phải đạt hết, khi mỗi phần nêu ngôn ngữ hoặc chứng chỉ;
  - ngôn ngữ ngoài bảng ghi theo từ sau "tiếng" (`other:lào`), không khớp ngôn ngữ khác; CEFR và "bậc 1–6" chỉ khớp khi ngôn ngữ hai phía trùng hoặc một phía không nêu;
  - "HSK5", "TOEIC650đ" tách chữ và số; điểm là số hợp lệ đầu tiên trong 4 từ sau tên chứng chỉ; tên chứng chỉ không có điểm vẫn cho biết ngôn ngữ; TOEFL ITP (310–677) là loại riêng.
- `computeScv`: verdict không có `evidence` tính `NOT_MET`; kỹ năng JD bị LLM xếp nhầm nhóm vẫn được tính; kỹ năng lặp lấy verdict thấp hơn.
- Migration `0019` xóa GPA > 4 (nhập theo thang 10 cũ) trước khi thêm CHECK, đã thử trên Postgres có dữ liệu.
- Form: lỗi tổng gắn vào ô cuối của tổng, các ô khác của tổng kiểm lại ô đó bằng `deps` (LESSONS §26).
- Cho story sau: US-3.2 viết `CheckedMatchCriteria` lặp lại refine `evidence` phía Python (như `CheckedJdAnalysis`), và đọc ngoại ngữ một lần cho mỗi SV, mỗi JD nếu lô chậm; nếu cần cho HR thấy cách code đọc yêu cầu thì đọc lúc HR xác nhận JD. US-4.4 chuyển `Ratio` / `roundHalfUp` của `scv.ts` vào `packages/shared` để S_final làm tròn giống S_cv.
- **Design applied**: DESIGN §1, §3 (tiêu đề mục, `tabular-nums`), §4, §6 (`FieldSet`, `FieldLegend`, `FieldSeparator`, `separator`), §8, §9, §10 (`formatNumber`).
- **Còn chờ (status `review`):** người dùng kiểm tay AC-13 ở 360 / 768 / 1024 px.

## Files modified

- `packages/shared`: `contracts/matching.ts`, `schemas/{matching,campaign,auth,index}.ts`, test, output `contracts:gen` (`json-schema/`, `ai-service/app/contracts/`).
- `apps/api`: `src/modules/matching/domain/` + `__tests__/`, `src/db/schema/students.ts`, `drizzle/0019_*`, `fast-check`.
- `apps/web`: `features/center/campaigns/`, `shared/api/`.
- Tài liệu: CONTEXT D41, LESSONS §26, CHANGELOG, story, sprint W44, EPIC-3.

## Cross-references

- [PRD FR-14](../../PRD.md#functional-requirements)
- [Epic EPIC-3](../epics/EPIC-3.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D2](../../CONTEXT.md)
- [LESSONS](../../LESSONS.md)
