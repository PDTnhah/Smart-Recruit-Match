---
id: US-3.5
title: "Hồ sơ kỹ năng chi tiết và khớp kỹ năng bằng code"
epic: EPIC-3
status: backlog
priority: P0
points: 8
sprint:
version_shipped:
prd_ref: [FR-40, FR-14, NFR-4]
arch_ref: [AD-15, AD-2]
depends_on: [US-2.7, US-3.1]
assignee:
commit:
created: 2026-11-02
updated: 2026-11-02
---

## Goal

Với mỗi cặp CV × JD, code (không dùng LLM) trả:
- verdict cho từng kỹ năng bắt buộc và bổ trợ của JD, kể cả kỹ năng mềm;
- kèm theo mỗi verdict: kiểu khớp, bậc bằng chứng T0–T4 và nguồn trong CV;
- độ phủ theo vùng;
- `skill_fit`.

[US-3.2](US-3.2-batch-matching-agent.md) dùng kết quả này để lưu `match_results`, lọc top-M và tính S_cv. [US-3.3](US-3.3-shortlist-and-preferences.md) dùng nó để giải thích cho SV.

## Background

[CONTEXT D42](../../CONTEXT.md) chuyển verdict kỹ năng từ Matching Agent sang code. PRD › *Điểm phù hợp CV–JD (S_cv)* định nghĩa:
- *Khung quy đổi mức bằng chứng*: T1 đã nêu, T2 đã dùng (đáp ứng Cơ bản), T3 dùng nhiều (Khá), T4 thành thạo (Thành thạo);
- *Luật khớp kỹ năng*: đúng kỹ năng hoặc kéo theo, rồi tới cùng họ;
- *Kỹ năng mềm*: bậc lấy từ tín hiệu.

Verdict giữ ba giá trị `MET` / `PARTIAL` / `NOT_MET`, nên `computeScv` của [US-3.1](US-3.1-hard-filters-and-scv-formula.md) không đổi.

Code chỉ đọc `profile_masked` (BR-03). Taxonomy lấy từ `SkillCatalogService.taxonomy()` ([US-2.7](US-2.7-skill-zones-families-implications.md)). Phía CV, LLM vẫn trích hồ sơ như cũ; prompt `cv_parser/v2` chỉ yêu cầu liệt kê đủ công nghệ của từng dự án để code có nhiều nguồn hơn.

**Lessons applied**: §5 (kiểm `domain-no-framework` bằng fixture), §10, §15, §21 (`--testPathPatterns`). Phía Python: §19 (chặn mạng trong pytest trên Windows).

## Acceptance criteria

- [ ] **AC-1** — `period.ts` đọc mốc thời gian của CV.
  - Dạng nhận được: "09/2022", "9/2022", "T9/2022", "tháng 9 2022", "2022", "hiện tại", "nay", "present", "now".
  - "Hiện tại" tính theo `refDate`, tức `intake_end` của đợt.
  - Thời lượng của nhiều nguồn là **hợp các khoảng**, không cộng trùng.
  - Mốc không đọc được thì thời lượng `null`, nguồn vẫn được đếm.
- [ ] **AC-2** — `buildSkillEvidence(profileMasked, taxonomy, refDate)` gom nguồn cho từng kỹ năng chuẩn. Mỗi nguồn có `section`, `index`, `text` chép từ CV.

  | Nguồn | Lấy từ |
  |---|---|
  | `SKILLS_LIST` | `skills[].canonical_name`; kỹ năng NEW so theo key |
  | `PROJECT` | `technologies` chuẩn hóa qua key/alias; `name`, `role`, `description` |
  | `EXPERIENCE` | `position`, `description` |
  | `CERTIFICATE` | `name` |
- [ ] **AC-3** — Quét văn bản tự do so n-gram 1–4 từ bằng `skillMatchKey` với `nameKey`/`aliasKeys`. Key ngắn hơn 3 ký tự, hoặc nằm trong danh sách từ thông dụng (go, r, c, swift, rust, dart, spring…), chỉ khớp qua `skills` và `technologies`. Bộ ca test có cả câu dễ khớp nhầm.
- [ ] **AC-4** — Bậc theo `matching-rules/v1`, hằng số trong `matching-rules.ts`:
  - T1: chỉ có ở `SKILLS_LIST`;
  - T2: 1 nguồn dự án, kinh nghiệm hoặc chứng chỉ;
  - T3: ≥ 2 nguồn dự án/kinh nghiệm, hoặc tổng ≥ 6 tháng;
  - T4: kinh nghiệm ≥ 6 tháng có dùng kỹ năng, hoặc ≥ 3 nguồn và ≥ 12 tháng.

  Bậc tính trên hợp nguồn của kỹ năng và mọi kỹ năng kéo theo nó (bao đóng của US-2.7).
- [ ] **AC-5** — `matchSkills(requirements, evidence, taxonomy)` áp luật khớp cho từng kỹ năng của JD:
  - `EXACT`/`IMPLIED`: bậc ≥ mức JD (BASIC = T2, INTERMEDIATE = T3, ADVANCED = T4) thì `MET`; T1 tới dưới mức thì `PARTIAL`.
  - Không có kỹ năng đó: có kỹ năng cùng họ ≥ T2 thì `PARTIAL` (`FAMILY`, `via` là kỹ năng đó).
  - Còn lại `NOT_MET` (`NONE`).
  - Kỹ năng JD ngoài danh mục chỉ so theo key.
- [ ] **AC-6** — `evidence` ghép từ `text` của các nguồn (tối đa 1000 ký tự), nên mọi `MET`/`PARTIAL` đều có bằng chứng có thật.
- [ ] **AC-7** — Ví dụ ở PRD là một test cố định:
  - Java (INTERMEDIATE) với hai dự án Java: `MET`, `EXACT`, T3.
  - SQL (BASIC) khi CV chỉ liệt kê MySQL, có cạnh MySQL ⇒ SQL: `PARTIAL`, `IMPLIED`, T1, `via` MySQL.
  - Docker: `NOT_MET`.

  Đưa vào `computeScv` cùng đầu vào còn lại của US-3.1 AC-4 vẫn ra `scvX100 = 5880`.
- [ ] **AC-8** — Kỹ năng mềm (`soft-skill-signals.ts`, có phiên bản):
  - tín hiệu theo năng lực chuẩn, so trên `role`, `position`, `description`, `certificates`;
  - chỉ tự khai là T1;
  - 1, 2 hoặc ≥ 3 tín hiệu từ các mục khác nhau là T2, T3, T4.

  Bộ ca test có tín hiệu đúng, câu có từ khóa nhưng không phải tín hiệu ("làm việc với trưởng nhóm"), và tín hiệu lặp trong cùng một mục.
- [ ] **AC-9** — `zoneCoverage(requirements, verdicts, taxonomy)` trả mỗi vùng JD cần: `demandWeight` (tổng trọng số kỹ năng JD trong vùng) và `coverage` (MET = 1, PARTIAL = 0,5, theo trọng số), sắp theo vùng. Kỹ năng không có họ không vào vùng nào.
- [ ] **AC-10** — `skillFit` = điểm hai nhóm kỹ năng (trọng số `scv_weight_must_have`, `scv_weight_nice_to_have` chia lại theo tỷ lệ), số nguyên ×100, cùng cách làm tròn với `computeScv`. Hàm này dùng để xếp top-M ở US-3.2; hòa thì `jdId` tăng dần.
- [ ] **AC-11** — Property-based test (fast-check):
  - thêm một nguồn không làm bậc hay verdict nào giảm;
  - bỏ một cạnh kéo theo hoặc một họ không làm verdict nào tăng;
  - cùng đầu vào cho cùng kết quả;
  - 0 ≤ `skillFit` ≤ 10 000.
- [ ] **AC-12** — Hợp đồng `MatchSkillVerdict` (`packages/shared/contracts/matching.ts`) thêm `match_kind` (`EXACT`, `IMPLIED`, `FAMILY`, `NONE`), `tier` (0–4), `via` (chuỗi hoặc null), `sources[]` (tối đa 10).
  - Refine: `NOT_MET` ⇔ `NONE`; `NONE` ⇔ `tier = 0` và `via = null`.
  - `pnpm contracts:gen`, commit output.
- [ ] **AC-13** — `matching/domain/` không import NestJS hay Drizzle. Hàm nhận `CvProfileMasked`, không nhận `CvProfile` hay `CvPii` (BR-03, Nguyên tắc 4).
- [ ] **AC-14** — Prompt `cv_parser/v2` (không đổi schema `CvExtraction`):
  - liệt kê mọi công nghệ của từng dự án vào `technologies`;
  - ghi `role` khi CV có;
  - chép tên kỹ năng mềm như CV viết.

  Dùng `active.json`; ghi fixture mới; `v1` giữ nguyên.

## Tasks

Đường dẫn domain: `apps/api/src/modules/matching/domain/`.

- [ ] **TASK-3.5.1** — `packages/shared` (AC: 12): mở rộng `MatchSkillVerdict`, `MATCH_KINDS`, test schema, `contracts:gen`.
- [ ] **TASK-3.5.2** — `period.ts`, `matching-rules.ts` (AC: 1, 4).
- [ ] **TASK-3.5.3** — `skill-evidence.ts` (AC: 2, 3, 4, 13): quét n-gram, danh sách từ thông dụng, hợp nguồn theo bao đóng.
- [ ] **TASK-3.5.4** — `soft-skill-signals.ts` (AC: 8).
- [ ] **TASK-3.5.5** — `skill-match.ts`, `zone-profile.ts`, `skill-fit.ts` (AC: 5, 6, 7, 9, 10). Dùng lại `Ratio`/`roundHalfUp` của `scv.ts`; tách ra file dùng chung nếu cần.
- [ ] **TASK-3.5.6** — Test (AC: 1–13): spec, property, fixture hồ sơ mẫu trong `__tests__/fixtures/`; `depcruise`, `depcruise:fixture`.
- [ ] **TASK-3.5.7** — [Làn B] `ai-service/app/prompts/cv_parser/v2.md`, `active.json`, fixture, pytest (AC: 14).

## Dev notes

- AD-15, AD-2 ([CONTEXT D42](../../CONTEXT.md)): code ra verdict kỹ năng, code tính S_cv. LLM không đọc hay sửa các verdict này.
- Nguyên tắc 9 (tinh thần): số học ×100, kết quả tất định. "Hiện tại" lấy từ `refDate`, không lấy `Date.now()`.
- Nguyên tắc 13: application layer của US-3.2 lấy hồ sơ qua `student`, yêu cầu qua `company`, taxonomy qua `skills`, rồi truyền vào hàm thuần.
- **Điểm hỏi trước khi chốt:**
  - ngưỡng T3/T4 (6 và 12 tháng, 2 và 3 nguồn);
  - mốc chỉ có năm ("2023 – 2024"): đề xuất tính tháng 6 của năm đó;
  - danh sách từ thông dụng không quét;
  - chứng chỉ IT (AWS, CCNA) có nên tính như dự án không (đề xuất: tính T2).
- Hồ sơ phân tích bằng `cv_parser/v1` vẫn chấm được, chỉ ít nguồn hơn. Không phân tích lại CV cũ.
- Liên quan:
  - builds on US-2.7 (`taxonomy()`), US-3.1 (`computeScv`, `MatchCriteria`), US-2.6 (`profile_masked` đã xác nhận);
  - required by US-3.2, US-3.3;
  - sibling US-3.6 (ngoại ngữ, ngành, cùng file `matching.ts`: story merge sau rebase).
- Tham chiếu: PRD FR-14, FR-40, NFR-4, *S_cv*; ARCH *Pipeline từng agent* › Matching; CONTEXT D39, D41, D42.

## Verification commands

> `pnpm --filter @srm/api exec jest --testPathPatterns 'modules/matching/domain' --selectProjects unit`; `pnpm --filter @srm/shared test`; `ai-service/.venv/Scripts/pytest ai-service/tests/agents/cv_parser`.

| AC | Command |
|---|---|
| AC-1 | `__tests__/period.spec.ts` › `GĐ3 CV periods: formats, present uses intake_end, union of intervals` |
| AC-2, AC-3 | `__tests__/skill-evidence.spec.ts` › `FR-40 evidence sources by section; short and common keys not scanned in free text` |
| AC-4 | `__tests__/skill-evidence.spec.ts` › `FR-40 tiers T0–T4 and implication closure` |
| AC-5, AC-6 | `__tests__/skill-match.spec.ts` › `FR-40 exact, implied, family and none; evidence copied from CV` |
| AC-7 | `__tests__/skill-match.spec.ts` › `GĐ3 PRD sample: code verdicts feed computeScv to 58.80` |
| AC-8 | `__tests__/soft-skill-signals.spec.ts` › `FR-40 soft skills: claimed T1, signals from distinct entries` |
| AC-9, AC-10 | `__tests__/zone-profile.spec.ts`, `__tests__/skill-fit.spec.ts` |
| AC-11 | `__tests__/skill-match.property.spec.ts` › `FR-40 monotonic and deterministic` |
| AC-12 | `packages/shared/contracts/__tests__/matching.spec.ts` › `FR-40 skill verdict carries match kind, tier and sources` |
| AC-13 | `pnpm depcruise`, `pnpm depcruise:fixture` xanh |
| AC-14 | `ai-service/tests/agents/cv_parser/test_prompt_v2.py` |

## Changelog entry

### Added
- Khớp kỹ năng CV–JD bằng code (`matching/domain/`): bậc bằng chứng T0–T4 từ mục kỹ năng, dự án, kinh nghiệm, chứng chỉ; khớp đúng kỹ năng, kéo theo hoặc cùng họ; kỹ năng mềm theo tín hiệu; độ phủ theo vùng; `skill_fit`. Bộ luật `matching-rules/v1`.
- Prompt `cv_parser/v2`: liệt kê đủ công nghệ của từng dự án.

### Changed
- `MatchSkillVerdict` có `match_kind`, `tier`, `via`, `sources`.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-40, FR-14](../../PRD.md#functional-requirements)
- [Epic EPIC-3](../epics/EPIC-3.md)
- [CONTEXT D42](../../CONTEXT.md)
- [LESSONS](../../LESSONS.md)
