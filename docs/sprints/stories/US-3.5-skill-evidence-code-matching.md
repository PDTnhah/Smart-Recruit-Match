---
id: US-3.5
title: "Hồ sơ kỹ năng chi tiết và khớp kỹ năng bằng code"
epic: EPIC-3
status: review
priority: P0
points: 8
sprint: sprint-2026-W45
version_shipped: 0.15.0
prd_ref: [FR-40, FR-14, NFR-4]
arch_ref: [AD-15, AD-2]
depends_on: [US-2.7, US-3.1]
assignee: PDTnhah
commit:
created: 2026-11-02
updated: 2026-11-02
---

## Story refresh — 2026-11-02 (bắt đầu story)

Người dùng chốt các điểm mở ở phiên Plan ([CONTEXT D44](../../CONTEXT.md), sửa D42). So với spec ban đầu:

- **AC-1**: thời lượng chỉ đọc ở mục `experience`. Mốc của dự án và học vấn không được đọc. Mốc chỉ có năm lấy tháng 6; tháng đếm cả hai đầu.
- **AC-4**: bỏ vế "tổng ≥ 6 tháng" của T3 và vế "≥ 3 nguồn và ≥ 12 tháng" của T4 (đã sửa vào AC-4). Chứng chỉ chỉ cho T2. Một mục CV là một nguồn.
- **AC-5**: họ `FOREIGN_LANGUAGE` không áp luật cùng họ. `via` là kỹ năng có bậc cao nhất (IMPLIED: trong các kỹ năng CV có nêu), hòa thì lấy `skillId` nhỏ nhất.
- **AC-3**: danh sách từ thông dụng chốt ở D44. Kỹ năng mềm không đi qua bước quét n-gram.
- **AC-14**: test ở `ai-service/tests/prompts/test_cv_parser_v2.py`, vì thư mục `tests/agents/` phẳng.

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

- [x] **AC-1** — `period.ts` đọc mốc thời gian của CV.
  - Dạng nhận được: "09/2022", "9/2022", "T9/2022", "tháng 9 2022", "2022", "hiện tại", "nay", "present", "now".
  - "Hiện tại" tính theo `refDate`, tức `intake_end` của đợt.
  - Thời lượng của nhiều nguồn là **hợp các khoảng**, không cộng trùng.
  - Mốc không đọc được thì thời lượng `null`, nguồn vẫn được đếm.
- [x] **AC-2** — `buildSkillEvidence(profileMasked, taxonomy, refDate)` gom nguồn cho từng kỹ năng chuẩn. Mỗi nguồn có `section`, `index`, `text` chép từ CV.

  | Nguồn | Lấy từ |
  |---|---|
  | `SKILLS_LIST` | `skills[].canonical_name`; kỹ năng NEW so theo key |
  | `PROJECT` | `technologies` chuẩn hóa qua key/alias; `name`, `role`, `description` |
  | `EXPERIENCE` | `position`, `description` |
  | `CERTIFICATE` | `name` |
- [x] **AC-3** — Quét văn bản tự do so n-gram 1–8 từ (phiên 3: tên tiếng Việt trong danh mục dài tới 7 từ) bằng `skillMatchKey` với `nameKey`/`aliasKeys`. Key ngắn hơn 3 ký tự, hoặc nằm trong danh sách từ thông dụng (go, r, c, swift, rust, dart, spring…), chỉ khớp qua `skills` và `technologies`. Bộ ca test có cả câu dễ khớp nhầm.
- [x] **AC-4** — Bậc theo `matching-rules/v1`, hằng số trong `matching-rules.ts` ([CONTEXT D44](../../CONTEXT.md)):
  - T1: chỉ có ở `SKILLS_LIST`;
  - T2: ≥ 1 nguồn dự án, kinh nghiệm hoặc chứng chỉ;
  - T3: ≥ 2 nguồn dự án/kinh nghiệm;
  - T4: các mục kinh nghiệm có dùng kỹ năng, tổng ≥ 6 tháng.

  Bậc tính trên hợp nguồn của kỹ năng và mọi kỹ năng kéo theo nó (bao đóng của US-2.7).
- [x] **AC-5** — `matchSkills(requirements, evidence, taxonomy)` áp luật khớp cho từng kỹ năng của JD:
  - `EXACT`/`IMPLIED`: bậc ≥ mức JD (BASIC = T2, INTERMEDIATE = T3, ADVANCED = T4) thì `MET`; T1 tới dưới mức thì `PARTIAL`.
  - Không có kỹ năng đó: có kỹ năng cùng họ ≥ T2 thì `PARTIAL` (`FAMILY`, `via` là kỹ năng đó).
  - Còn lại `NOT_MET` (`NONE`).
  - Kỹ năng JD ngoài danh mục chỉ so theo key.
- [x] **AC-6** — `evidence` ghép từ `text` của các nguồn (tối đa 1000 ký tự), nên mọi `MET`/`PARTIAL` đều có bằng chứng có thật.
- [x] **AC-7** — Ví dụ ở PRD là một test cố định:
  - Java (INTERMEDIATE) với hai dự án Java: `MET`, `EXACT`, T3.
  - SQL (BASIC) khi CV chỉ liệt kê MySQL, có cạnh MySQL ⇒ SQL: `PARTIAL`, `IMPLIED`, T1, `via` MySQL.
  - Docker: `NOT_MET`.

  Đưa vào `computeScv` cùng đầu vào còn lại của US-3.1 AC-4 vẫn ra `scvX100 = 5880`.
- [x] **AC-8** — Kỹ năng mềm (`soft-skill-signals.ts`, có phiên bản):
  - tín hiệu theo năng lực chuẩn, so trên `role`, `position`, `description`, `certificates`;
  - chỉ tự khai là T1;
  - 1, 2 hoặc ≥ 3 tín hiệu từ các mục khác nhau là T2, T3, T4.

  Bộ ca test có tín hiệu đúng, câu có từ khóa nhưng không phải tín hiệu ("làm việc với trưởng nhóm"), và tín hiệu lặp trong cùng một mục.
- [x] **AC-9** — `zoneCoverage(requirements, verdicts, taxonomy)` trả mỗi vùng JD cần: `demandWeight` (tổng trọng số kỹ năng JD trong vùng) và `coverage` (MET = 1, PARTIAL = 0,5, theo trọng số), sắp theo vùng. Kỹ năng không có họ không vào vùng nào.
- [x] **AC-10** — `skillFit` = điểm hai nhóm kỹ năng (trọng số `scv_weight_must_have`, `scv_weight_nice_to_have` chia lại theo tỷ lệ), số nguyên ×100, cùng cách làm tròn với `computeScv`. Hàm này dùng để xếp top-M ở US-3.2; hòa thì `jdId` tăng dần.
- [x] **AC-11** — Property-based test (fast-check):
  - thêm một nguồn không làm bậc hay verdict nào giảm;
  - bỏ một cạnh kéo theo hoặc một họ không làm verdict nào tăng;
  - cùng đầu vào cho cùng kết quả;
  - 0 ≤ `skillFit` ≤ 10 000.
- [x] **AC-12** — Hợp đồng `MatchSkillVerdict` (`packages/shared/contracts/matching.ts`) thêm `match_kind` (`EXACT`, `IMPLIED`, `FAMILY`, `NONE`), `tier` (0–4), `via` (chuỗi hoặc null), `sources[]` (tối đa 10).
  - Refine: `NOT_MET` ⇔ `NONE`; `NONE` ⇔ `tier = 0` và `via = null`.
  - `pnpm contracts:gen`, commit output.
- [x] **AC-13** — `matching/domain/` không import NestJS hay Drizzle. Hàm nhận `CvProfileMasked`, không nhận `CvProfile` hay `CvPii` (BR-03, Nguyên tắc 4).
- [x] **AC-14** — Prompt `cv_parser/v2` (không đổi schema `CvExtraction`):
  - liệt kê mọi công nghệ của từng dự án vào `technologies`;
  - ghi `role` khi CV có;
  - chép tên kỹ năng mềm như CV viết.

  Dùng `active.json`; ghi fixture mới; `v1` giữ nguyên.

## Tasks

Đường dẫn domain: `apps/api/src/modules/matching/domain/`.

- [x] **TASK-3.5.1** — `packages/shared` (AC: 12): mở rộng `MatchSkillVerdict`, `MATCH_KINDS`, test schema, `contracts:gen`.
- [x] **TASK-3.5.2** — `period.ts`, `matching-rules.ts` (AC: 1, 4).
- [x] **TASK-3.5.3** — `skill-evidence.ts` (AC: 2, 3, 4, 13): quét n-gram, danh sách từ thông dụng, hợp nguồn theo bao đóng.
- [x] **TASK-3.5.4** — `soft-skill-signals.ts` (AC: 8).
- [x] **TASK-3.5.5** — `skill-match.ts`, `zone-profile.ts`, `skill-fit.ts` (AC: 5, 6, 7, 9, 10). Dùng lại `Ratio`/`roundHalfUp` của `scv.ts`; tách ra file dùng chung nếu cần.
- [x] **TASK-3.5.6** — Test (AC: 1–13): spec, property, fixture hồ sơ mẫu trong `__tests__/fixtures/`; `depcruise`, `depcruise:fixture`.
- [x] **TASK-3.5.7** — [Làn B] `ai-service/app/prompts/cv_parser/v2.md`, `active.json`, fixture, pytest (AC: 14).

## Dev notes

- AD-15, AD-2 ([CONTEXT D42](../../CONTEXT.md)): code ra verdict kỹ năng, code tính S_cv. LLM không đọc hay sửa các verdict này.
- Nguyên tắc 9 (tinh thần): số học ×100, kết quả tất định. "Hiện tại" lấy từ `refDate`, không lấy `Date.now()`.
- Nguyên tắc 13: application layer của US-3.2 lấy hồ sơ qua `student`, yêu cầu qua `company`, taxonomy qua `skills`, rồi truyền vào hàm thuần.
- Các điểm hỏi trước khi chốt (ngưỡng T3/T4, mốc chỉ có năm, từ thông dụng, chứng chỉ) đã chốt ở [CONTEXT D44](../../CONTEXT.md).
- Hồ sơ phân tích bằng `cv_parser/v1` vẫn chấm được, chỉ ít nguồn hơn. Không phân tích lại CV cũ.
- Liên quan:
  - builds on US-2.7 (`taxonomy()`), US-3.1 (`computeScv`, `MatchCriteria`), US-2.6 (`profile_masked` đã xác nhận);
  - required by US-3.2, US-3.3;
  - sibling US-3.6 (ngoại ngữ, ngành, cùng file `matching.ts`: story merge sau rebase).
- Tham chiếu: PRD FR-14, FR-40, NFR-4, *S_cv*; ARCH *Pipeline từng agent* › Matching; CONTEXT D39, D41, D42.

## Verification commands

> `pnpm --filter @srm/api exec jest --testPathPatterns 'modules/matching/domain' --selectProjects unit`; `pnpm --filter @srm/shared test`; `ai-service/.venv/Scripts/pytest ai-service/tests/prompts ai-service/tests/agents/test_cv_parser.py`.

| AC | Command |
|---|---|
| AC-1 | `__tests__/period.spec.ts` › `GĐ3 CV periods: formats, present uses intake_end, union of intervals` |
| AC-2, AC-3 | `__tests__/skill-evidence.spec.ts` › `GĐ3 FR-40 evidence sources by section; short and common keys not scanned in free text` |
| AC-4 | `__tests__/skill-evidence.spec.ts` › `GĐ3 FR-40 tiers T0–T4 and implication closure` |
| AC-5, AC-6 | `__tests__/skill-match.spec.ts` › `GĐ3 FR-40 exact, implied, family and none; evidence copied from CV` |
| AC-7 | `__tests__/skill-match.spec.ts` › `GĐ3 PRD sample: code verdicts feed computeScv to 58.80` |
| AC-8 | `__tests__/soft-skill-signals.spec.ts` › `GĐ3 FR-40 soft skills: claimed T1, signals from distinct entries` |
| AC-9, AC-10 | `__tests__/zone-profile.spec.ts`, `__tests__/skill-fit.spec.ts` |
| AC-11 | `__tests__/skill-match.property.spec.ts` › `GĐ3 FR-40 monotonic and deterministic` |
| AC-12 | `packages/shared/contracts/__tests__/matching.spec.ts` › `GĐ3 FR-40 skill verdict carries match kind, tier and sources` |
| AC-13 | `__tests__/masked-profile-only.spec.ts`; `pnpm depcruise`, `pnpm depcruise:fixture` xanh |
| AC-14 | `ai-service/tests/prompts/test_cv_parser_v2.py`; `test_cv_parser.py` › `test_gd2_v2_…` |

## Changelog entry

### Added
- Khớp kỹ năng CV–JD bằng code (`matching/domain/`): bậc bằng chứng T0–T4 từ mục kỹ năng, dự án, kinh nghiệm, chứng chỉ; khớp đúng kỹ năng, kéo theo hoặc cùng họ; kỹ năng mềm theo tín hiệu; độ phủ theo vùng; `skill_fit`. Bộ luật `matching-rules/v1`.
- Prompt `cv_parser/v2`: liệt kê đủ công nghệ của từng dự án, ghi vai trò, giữ kỹ năng mềm như CV viết.

### Changed
- `MatchSkillVerdict` có `match_kind`, `tier`, `via`, `sources`.
- PRD › *Khung quy đổi mức bằng chứng*: thời lượng chỉ tính ở mục kinh nghiệm; T3, T4 theo D44.

**Commit**:

## Implementation notes

**Phiên Plan, 2a, 2b, 2c (2026-11-02)** xong: TASK-3.5.1–.7. Điều code và [CONTEXT D44](../../CONTEXT.md) chưa nói:
- **Tách từ** (khác plan): từ là chuỗi chữ, số, `+`, `#`; mọi ký tự khác tách từ; key của n-gram bỏ dấu phân cách. Nhờ vậy "Java/Spring Boot", "Node.js", "CI/CD" khớp, còn n-gram qua dấu phẩy ("Java, Script") thì không.
- **Kiểu khớp**: `tier` của IMPLIED là bậc của hợp nguồn; `tier` của FAMILY là bậc của `via`. Kỹ năng mềm: tín hiệu của năng lực (họ) là nguồn riêng của mọi kỹ năng trong họ, nên ra EXACT; bậc đếm số mục khác nhau có tín hiệu (`SOFT_SKILL_TIER_RULES`).
- **Tín hiệu `soft-skill-signals/v1`**: đọc `role`/`position`, mô tả dự án, mô tả kinh nghiệm, tên chứng chỉ (không đọc `issuer`). Cụm từ có thể là tên tính năng ("hỗ trợ khách hàng", "xử lý sự cố") chỉ tìm ở `role`/`position` và mô tả kinh nghiệm. Không tính khi 40 ký tự trước đó kết thúc bằng tên sản phẩm ("ứng dụng tự học") hoặc, với vai trò lãnh đạo, người khác ("làm việc với trưởng nhóm"). Bảng cụm từ chưa được người dùng duyệt từng dòng.
- **Bằng chứng**: chứng chỉ chỉ ghi `Chứng chỉ '<tên>'`. `text` của nguồn và `evidence` cắt giữa các cụm, trong 1000 ký tự.
- **`zoneCoverage`**: `demandWeight` cộng trọng số của cả hai nhóm (chỉ để hiển thị).
- **`skillFit`** bằng `computeScv` khi các trọng số khác bằng 0 (có test); `toBasisPoints` export từ `scv.ts`.
- **Cho US-3.2**: dựng `indexTaxonomy` một lần mỗi lượt chạy, `buildSkillEvidence` một lần mỗi CV; lưu `MATCHING_RULES_VERSION` và `SOFT_SKILL_SIGNALS_VERSION` kèm kết quả.
- **AC-13**: `CvProfileMasked` là alias của `CvProfile`, nên `masked-profile-only.spec.ts` quét mã nguồn `matching/domain/*.ts`.
- **AC-14**: 8 fixture `cv_parser` đổi khóa sang v2, giữ `responses` (LESSONS §31). Chưa chạy `evals` với key thật.

**2026-11-02 — phiên 3** (Review, Doc/Version gate). `/code-review` ra 15 điểm, sửa 12. Luật mới ghi ở D44: `via` của IMPLIED, n-gram 1–8 từ không qua dấu hết câu, thêm từ thông dụng, tên ở mục kỹ năng giữ key, FAMILY chỉ `PARTIAL`. Ngoài ra: `period.ts` đọc thêm "09/22", "2022-09-15", "tới nay"; `evidenceOfSkill` nhớ kết quả theo (taxonomy, CV, kỹ năng); `computeScv` và `skillFit` dùng chung `weigh`/`averageX100`. Không sửa:
- EXACT xét trước FAMILY (đúng AC-5): thêm "Docker" vào mục kỹ năng đổi FAMILY T4 thành EXACT T1, verdict vẫn `PARTIAL`;
- fixture v2 giữ câu trả lời v1 là chủ ý; hành vi mới có fixture riêng;
- mục `languages` chưa là nguồn của kỹ năng ngoại ngữ (US-3.6, ghi ở D44).

Lessons: §31 mới.

**Còn chờ người dùng**: duyệt bảng cụm từ trong `soft-skill-signals.ts`; nếu có key, chạy `cv_parser/v2` với vài CV mẫu ở `ai-service/evals` để xem model có liệt kê đủ công nghệ nằm trong mô tả không.

## Files modified

- `packages/shared/contracts/`: `matching.ts` (`MATCH_KINDS`, `EVIDENCE_SECTIONS`, `MatchSkillSource`, refine nhất quán), `schemas.ts`, test; JSON Schema và Pydantic sinh lại.
- `ai-service/`: prompt `cv_parser/v2`, manifest, active; test prompt, CV Parser, fixture `cv_parser`. `ai-job-roundtrip.int-spec.ts`: `cv_parser/v2`.
- `apps/api/src/modules/matching/domain/`: `ratio.ts`, `matching-rules.ts`, `period.ts`, `taxonomy-index.ts`, `skill-evidence.ts`, `soft-skill-signals.ts`, `skill-match.ts`, `zone-profile.ts`, `skill-fit.ts`; `scv.ts` dùng `ratio.ts`; `__tests__/` (spec, property, fixtures).

## Cross-references

- [PRD FR-40, FR-14](../../PRD.md#functional-requirements)
- [Epic EPIC-3](../epics/EPIC-3.md)
- [CONTEXT D42](../../CONTEXT.md)
- [LESSONS](../../LESSONS.md)
