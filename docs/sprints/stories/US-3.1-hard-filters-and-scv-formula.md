---
id: US-3.1
title: "Lọc điều kiện cứng và công thức S_cv"
epic: EPIC-3
status: backlog
priority: P0
points: 3
sprint:
version_shipped:
prd_ref: [FR-14]
arch_ref: [AD-2]
depends_on: [US-2.3]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Lọc điều kiện cứng và tính S_cv bằng hàm TypeScript thuần trong `apps/api/src/modules/matching/domain/`, mỗi thành phần của công thức có unit test. Khi story này xong, US-3.2 chỉ cần đưa verdict từng tiêu chí của Matching Agent vào hàm để có S_cv, còn US-3.3 dùng cùng hàm để lập shortlist. Khi Trung tâm đổi trọng số, S_cv được tính lại từ verdict đã lưu mà không phải gọi lại LLM.

## Background

GĐ3 (PRD › *Quy trình nghiệp vụ theo giai đoạn* › GĐ3) có ba bước: lọc điều kiện cứng bằng luật, lọc sơ bộ bằng embedding, rồi Matching Agent đánh giá từng tiêu chí. Story này làm hai phần tất định ở hai đầu: lọc điều kiện cứng trước khi gọi LLM và tính S_cv sau khi có verdict. Phần gọi LLM thuộc [US-3.2](US-3.2-batch-matching-agent.md).

Theo AD-2 ([CONTEXT D2](../../CONTEXT.md)), LLM không đưa ra con số tổng. LLM trả verdict `MET` / `PARTIAL` / `NOT_MET` cho từng kỹ năng, điểm rubric 0–4 cho dự án, mức khớp ngành và verdict ngoại ngữ. Code tính `S_cv = Σ wᵢ · sᵢ` theo bảng ở PRD › *Cơ chế chấm điểm* › *Điểm phù hợp CV–JD (S_cv)*:

| Tiêu chí | wᵢ mặc định | sᵢ (0–100) |
|---|---|---|
| Kỹ năng bắt buộc | 40% | Trung bình có trọng số theo từng kỹ năng: `MET` = 1, `PARTIAL` = 0,5, `NOT_MET` = 0 |
| Kỹ năng bổ trợ | 15% | Như trên, cho kỹ năng nice-to-have |
| Dự án / kinh nghiệm liên quan | 20% | Rubric 0–4 × 25 |
| Học vấn | 15% | Ngành đúng/gần/khác (100/60/20) × 0,6 + GPA quy về thang 100 × 0,4 |
| Ngoại ngữ, chứng chỉ | 10% | Mức đáp ứng so với yêu cầu của JD |

Điều kiện cứng (ngành học, năm học, GPA tối thiểu, ngoại ngữ bắt buộc) lấy từ yêu cầu chuẩn hóa mà HR đã xác nhận ở [US-2.3](US-2.3-jd-analyzer-hr-requirement-confirmation.md) (FR-9, FR-10). Cặp không đạt được đánh dấu "Không đủ điều kiện" kèm lý do và không bao giờ được gửi cho LLM. ARCH › *Những chỗ cố ý KHÔNG dùng LLM* liệt kê cả lọc điều kiện cứng lẫn tính S_cv.

FR-14 được chia cho hai story. Story này làm phần "lọc điều kiện cứng, tính S_cv, lập shortlist". Phần "chấm mọi cặp SV × JD: điểm từng tiêu chí, bằng chứng, kỹ năng thiếu" thuộc US-3.2. Story chỉ có hàm thuần và kiểu dùng chung; không có bảng, endpoint hay giao diện.

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** yêu cầu JD có điều kiện cứng (danh sách ngành, năm học cho phép, GPA tối thiểu, ngoại ngữ bắt buộc) và dữ kiện của một SV, **When** gọi `checkHardFilters(facts, hardConditions)`, **Then** hàm trả `{ eligible, ineligibleReasons }`. Mỗi điều kiện không đạt sinh đúng một lý do có mã tiếng Anh (`MAJOR_NOT_ALLOWED`, `YEAR_NOT_ALLOWED`, `GPA_BELOW_MIN`, `LANGUAGE_NOT_MET` — tên mã là đề xuất), kèm giá trị yêu cầu và giá trị thực tế. Nhiều điều kiện không đạt thì trả đủ các lý do. Đạt hết thì `eligible = true` và `ineligibleReasons = []`.
- [ ] **AC-2** — Kiểu đầu vào `HardFilterFacts` chỉ gồm ngành, năm học, GPA và chứng chỉ ngoại ngữ. Kiểu này không có trường ảnh, giới tính, ngày sinh, quê quán, tôn giáo, tình trạng hôn nhân (BR-03). Zod schema của nó dùng `.strict()`, nên đầu vào có trường lạ bị từ chối.
- [ ] **AC-3** — **Given** JD yêu cầu GPA tối thiểu nhưng SV chưa có GPA, **When** lọc, **Then** cặp không đủ điều kiện với lý do `GPA_MISSING` (đề xuất). **Given** JD không có điều kiện cứng nào, **When** lọc, **Then** `eligible = true`.
- [ ] **AC-4** — **Given** verdict như đầu ra mẫu ở PRD (Java `MET`, SQL `PARTIAL`, Docker `NOT_MET`; Redis `NOT_MET`; `score_0_4 = 3`; ngành `EXACT`, GPA 3,2/4; ngoại ngữ `MET`), trọng số các kỹ năng bằng nhau và trọng số tiêu chí mặc định, **When** gọi `computeScv`, **Then** S_cv = 58,80 (`scvX100 = 5880`), kèm bảng thành phần gồm sᵢ, wᵢ và wᵢ·sᵢ của 5 tiêu chí. Con số này dựa trên các quy đổi đề xuất ở AC-9.
- [ ] **AC-5** — **Given** kỹ năng bắt buộc có trọng số khác nhau (Java `MET` trọng số 3, SQL `PARTIAL` trọng số 1, Docker `NOT_MET` trọng số 1), **When** tính sᵢ của tiêu chí kỹ năng bắt buộc, **Then** sᵢ = 100 × (3·1 + 1·0,5 + 1·0) / 5 = 70.
- [ ] **AC-6** — **Given** cùng một `criteria`, **When** gọi lại `computeScv` với bộ trọng số tiêu chí khác, **Then** S_cv mới đúng công thức. Hàm chỉ nhận `criteria`, trọng số và dữ kiện học vấn; nó không phụ thuộc LLM, DB hay mạng (AD-2).
- [ ] **AC-7** — Property-based test (fast-check): với mọi đầu vào hợp lệ, 0 ≤ S_cv ≤ 100. Nâng một verdict (`NOT_MET` → `PARTIAL` → `MET`) hoặc tăng `score_0_4` không bao giờ làm S_cv giảm. Gọi hai lần với cùng đầu vào cho cùng kết quả.
- [ ] **AC-8** — **Given** tổng trọng số tiêu chí khác 100% hoặc có trọng số âm, **When** kiểm tra cấu hình, **Then** báo lỗi kiểm tra. **Given** JD không có kỹ năng bổ trợ hoặc không yêu cầu ngoại ngữ, **When** tính S_cv, **Then** hàm không chia cho 0, không trả `NaN`, và xử lý trọng số của tiêu chí rỗng theo quy tắc tạm ở Dev notes.
- [ ] **AC-9** — S_cv trả về dạng số nguyên ×100 (`scvX100`). Trọng số tính theo phần vạn. Chỉ làm tròn một lần ở bước cuối (half-up, đề xuất). Các quy đổi: ngành `EXACT` / `RELATED` / `OTHER` → 100 / 60 / 20; GPA thang 4 → thang 100 bằng `gpa4 × 25` (đề xuất); verdict ngoại ngữ `MET` / `PARTIAL` / `NOT_MET` → 100 / 50 / 0 (đề xuất).
- [ ] **AC-10** — **Given** danh sách kết quả của một SV, **When** gọi `selectShortlist(results, thetaCv)`, **Then** hàm trả các JD có `eligible = true` và `scvX100 ≥ θ_cv × 100`, sắp giảm dần theo S_cv. Hai JD bằng S_cv thì sắp theo `jd_id` tăng dần (đề xuất) để thứ tự tất định. JD có S_cv đúng bằng θ_cv được vào shortlist.
- [ ] **AC-11** — `apps/api/src/modules/matching/domain/` không import NestJS hay Drizzle (AGENTS › Nguyên tắc 13): `rg -l "@nestjs|drizzle-orm" apps/api/src/modules/matching/domain` không trả file nào, dependency-cruiser không báo vi phạm.

## Tasks

- [ ] **TASK-3.1.1** — Kiểu dùng chung trong `packages/shared` — FE, BE và AI Service dùng cùng một định nghĩa (AC: 2, 4, 8, 9)
  - [ ] Subtask 3.1.1.1 — `packages/shared/contracts/matching.ts`: Zod schema `MatchCriteria` theo đầu ra mẫu ở PRD: enum verdict `MET | PARTIAL | NOT_MET`, `must_have[]`, `nice_to_have[]` (skill, level_required, verdict, evidence), `project_relevance.score_0_4` (0–4), `education.major_match` (`EXACT | RELATED | OTHER`, đề xuất), `language`. [US-3.2](US-3.2-batch-matching-agent.md) dùng lại schema này trong contract message và sinh Pydantic từ đó (AD-6).
  - [ ] Subtask 3.1.1.2 — `packages/shared/schemas/`: thêm khóa `scv_weights` (đề xuất) vào schema `campaigns.config` trong `packages/shared/schemas/campaign.ts` mà [US-1.4](US-1.4-campaign-setup-and-config.md) đã tạo. Giá trị mặc định 40/15/20/15/10; refine kiểm tra tổng bằng 100% và không có trọng số âm.
  - [ ] Subtask 3.1.1.3 — `HardFilterFacts` (Zod `.strict()`): `major`, `yearOfStudy`, `gpa4` (có thể null), `languageCertificates[]`.
- [ ] **TASK-3.1.2** — Lọc điều kiện cứng — chặn cặp không đạt trước khi tốn tiền gọi LLM (AC: 1, 2, 3)
  - [ ] Subtask 3.1.2.1 — `apps/api/src/modules/matching/domain/hard-filter.ts`: `checkHardFilters(facts, hardConditions)`, đọc `hard_conditions` theo schema yêu cầu chuẩn hóa của US-2.3.
  - [ ] Subtask 3.1.2.2 — Mã lý do (`IneligibleReasonCode`) đặt trong `packages/shared/contracts/matching.ts` để US-3.3 hiển thị bằng tiếng Việt.
- [ ] **TASK-3.1.3** — Công thức S_cv — code tính điểm tổng, LLM chỉ cho verdict (AC: 4, 5, 6, 7, 8, 9)
  - [ ] Subtask 3.1.3.1 — `apps/api/src/modules/matching/domain/scv.ts`: `mustHaveScore`, `niceToHaveScore`, `projectScore`, `educationScore`, `languageScore` và `computeScv(criteria, educationFacts, weights)` trả `{ scvX100, breakdown }`.
  - [ ] Subtask 3.1.3.2 — Tính bằng số nguyên (điểm ×100, trọng số theo phần vạn), làm tròn một lần ở cuối.
  - [ ] Subtask 3.1.3.3 — Quy tắc tạm cho tiêu chí rỗng (Dev notes), có hằng số đặt tên rõ để dễ đổi khi được chốt.
- [ ] **TASK-3.1.4** — Lập shortlist — một định nghĩa cho cả backend và giao diện (AC: 10)
  - [ ] Subtask 3.1.4.1 — `apps/api/src/modules/matching/domain/shortlist.ts`: `selectShortlist(results, thetaCv)`.
- [ ] **TASK-3.1.5** — Test — mỗi công thức có unit test mang mã GĐ/BR trong tên (AC: 1–11)
  - [ ] Subtask 3.1.5.1 — `apps/api/src/modules/matching/domain/__tests__/hard-filter.spec.ts`.
  - [ ] Subtask 3.1.5.2 — `apps/api/src/modules/matching/domain/__tests__/scv.spec.ts` (gồm ví dụ mẫu PRD = 58,80) và `scv.property.spec.ts` (fast-check).
  - [ ] Subtask 3.1.5.3 — `apps/api/src/modules/matching/domain/__tests__/shortlist.spec.ts`.
  - [ ] Subtask 3.1.5.4 — Kiểm tra rule dependency-cruiser của US-1.1 đã phủ `modules/*/domain`; thiếu thì bổ sung.

## Dev notes

### Architecture constraints

- [AD-2](../../ARCHITECTURE.md#architecture-decisions): LLM trả verdict từng tiêu chí kèm bằng chứng; code tính S_cv. Bị loại: để LLM trả một con số tổng (không ổn định, không giải thích được, đổi trọng số phải gọi lại LLM).
- AD-1: phần tất định nằm ở Core Backend. Bị loại: tính S_cv trong AI Service (AI Service không làm nghiệp vụ).
- AGENTS › Nguyên tắc 13: `domain/` là TypeScript thuần, không import NestJS hay Drizzle. Application layer của US-3.2 đọc DB rồi truyền dữ liệu vào hàm.
- AGENTS › Nguyên tắc 14: kiểu dùng chung (`MatchCriteria`, `HardFilterFacts`, `scv_weights`) đặt ở `packages/shared`, không khai báo lại trong module.
- Điểm quy về số nguyên ×100, cùng cách làm với Allocation Engine (ARCH › *Allocation Engine*). Cột `match_results.s_cv` của US-3.2 lưu `numeric(5,2)`.
- Story không thêm AD mới.
- Các điểm spec chưa nói rõ. Story tạm dùng phương án dưới đây, để thành tham số hoặc hằng số có tên, và **hỏi trước khi chốt**:
  - Trọng số wᵢ lưu ở đâu: bảng tham số GĐ0 không có wᵢ, còn ARCH › *Pipeline từng agent* › Matching (bước 6) nói "theo trọng số của JD". Tạm dùng `campaigns.config.scv_weights`; chưa làm ghi đè ở cấp JD.
  - Tiêu chí rỗng (JD không có kỹ năng bổ trợ hoặc không yêu cầu ngoại ngữ): tạm chia lại trọng số của tiêu chí rỗng cho các tiêu chí còn lại theo tỷ lệ.
  - Nguồn GPA cho tiêu chí học vấn: tạm dùng `students.gpa` (dữ liệu học vụ) thay cho `education.gpa_4` do LLM trích.
  - Năm học: ARCH chỉ có `students.cohort`. Tạm để application layer suy ra `yearOfStudy` rồi truyền vào; quy tắc suy ra chưa có.
  - Ngoại ngữ bắt buộc: tạm chỉ so chứng chỉ cùng loại. Bảng quy đổi giữa các loại (TOEIC, IELTS…) chưa có.
- Story không chạm câu hỏi chưa chốt nào trong Q1–Q8.

### Cross-story dependencies

- Builds on [US-2.3](US-2.3-jd-analyzer-hr-requirement-confirmation.md) — dùng Zod schema yêu cầu chuẩn hóa (kỹ năng có mức độ và trọng số, `hard_conditions`) trong `packages/shared/schemas`.
- Builds on [US-1.4](US-1.4-campaign-setup-and-config.md) — mở rộng schema `campaigns.config` (đã có `theta_cv`) bằng khóa `scv_weights`. US-1.4 khóa cấu hình sau `DRAFT`, nên trọng số được chốt trước khi mở đợt. US-1.4 xong ở T3, trước story này.
- Required by [US-3.2](US-3.2-batch-matching-agent.md) — dùng `checkHardFilters`, `computeScv` và `MatchCriteria`.
- Required by [US-3.3](US-3.3-shortlist-and-preferences.md) — dùng `selectShortlist` và mã lý do `IneligibleReasonCode`.
- Sibling [US-4.4](US-4.4-grading-stest-sfinal.md) — S_final = α·S_cv + β·S_test lấy S_cv ×100 từ đây; hai story phải dùng cùng cách làm tròn.
- Sibling [US-5.1](US-5.1-allocation-engine-property-tests.md) — cùng quy ước điểm ×100.

### References

- [Source: PRD › Functional Requirements — FR-14](../../PRD.md#functional-requirements)
- Source: PRD › *Cơ chế chấm điểm* › *Điểm phù hợp CV–JD (S_cv)* — công thức, bảng trọng số, đầu ra mẫu ([PRD.md](../../PRD.md))
- Source: PRD › *Quy trình nghiệp vụ theo giai đoạn* › GĐ1 (điều kiện cứng), GĐ3 ([PRD.md](../../PRD.md))
- Source: PRD › *Quy tắc nghiệp vụ* — BR-03 ([PRD.md](../../PRD.md))
- [Source: ARCHITECTURE › Architecture decisions — AD-1, AD-2](../../ARCHITECTURE.md#architecture-decisions)
- Source: ARCHITECTURE › *Các module* (`matching`), *Kiểu kiến trúc* (`domain/`), *Allocation Engine* (điểm ×100), *Những chỗ cố ý KHÔNG dùng LLM* ([ARCHITECTURE.md](../../ARCHITECTURE.md))
- [Source: CONTEXT D2](../../CONTEXT.md)
- [Source: Epic EPIC-3](../epics/EPIC-3.md)

## Verification commands

> Lệnh chạy cụ thể (`pnpm …`) sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `apps/api/src/modules/matching/domain/__tests__/hard-filter.spec.ts` › `GĐ3 hard filter: each failed condition yields one reason code` |
| AC-2 | `apps/api/src/modules/matching/domain/__tests__/hard-filter.spec.ts` › `BR-03 hard filter facts reject sensitive fields (strict schema)` |
| AC-3 | `apps/api/src/modules/matching/domain/__tests__/hard-filter.spec.ts` › `GĐ3 hard filter: missing GPA and JD without conditions` |
| AC-4 | `apps/api/src/modules/matching/domain/__tests__/scv.spec.ts` › `GĐ3 S_cv: PRD sample output yields 58.80 with default weights` |
| AC-5 | `apps/api/src/modules/matching/domain/__tests__/scv.spec.ts` › `GĐ3 S_cv: must-have score is skill-weighted average` |
| AC-6 | `apps/api/src/modules/matching/domain/__tests__/scv.spec.ts` › `AD-2 S_cv recomputes from stored criteria when weights change` |
| AC-7 | `apps/api/src/modules/matching/domain/__tests__/scv.property.spec.ts` › `AD-2 S_cv bounded, monotonic and deterministic` |
| AC-8 | `apps/api/src/modules/matching/domain/__tests__/scv.spec.ts` › `GĐ3 S_cv: invalid weights rejected, empty criterion has no NaN` |
| AC-9 | `apps/api/src/modules/matching/domain/__tests__/scv.spec.ts` › `GĐ3 S_cv: integer x100 arithmetic and conversions` |
| AC-10 | `apps/api/src/modules/matching/domain/__tests__/shortlist.spec.ts` › `GĐ3 shortlist: eligible and S_cv >= theta, sorted desc, ties by jd_id` |
| AC-11 | `rg -l "@nestjs\|drizzle-orm" apps/api/src/modules/matching/domain` không trả file nào; dependency-cruiser chạy trong CI không báo lỗi |

## Changelog entry

### Added
- Module `matching` (`domain/`): hàm thuần lọc điều kiện cứng (ngành, năm học, GPA tối thiểu, ngoại ngữ bắt buộc), trả kèm mã lý do.
- Hàm thuần tính S_cv = Σ wᵢ·sᵢ theo bảng trọng số mặc định 40/15/20/15/10, tính bằng số nguyên ×100; đổi trọng số không phải gọi lại LLM (AD-2).
- Hàm lập shortlist: JD đủ điều kiện có S_cv ≥ θ_cv, sắp giảm dần theo S_cv.
- `packages/shared`: schema `MatchCriteria`, mã lý do không đủ điều kiện và khóa `scv_weights` trong cấu hình đợt.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-14](../../PRD.md#functional-requirements)
- [Epic EPIC-3](../epics/EPIC-3.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D2](../../CONTEXT.md)
- [LESSONS](../../LESSONS.md)
