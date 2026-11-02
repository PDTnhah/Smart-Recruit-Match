---
id: US-3.6
title: "Quy đổi ngoại ngữ CEFR và mức khớp ngành bằng code"
epic: EPIC-3
status: backlog
priority: P0
points: 5
sprint:
version_shipped:
prd_ref: [FR-40, FR-14, FR-9, FR-10]
arch_ref: [AD-15]
depends_on: [US-3.1, US-2.3]
assignee:
commit:
created: 2026-11-02
updated: 2026-11-02
---

## Goal

Code quy chứng chỉ ngoại ngữ về CEFR, nên SV có IELTS không bị loại khỏi JD yêu cầu TOEIC. Code cũng chấm tiêu chí ngoại ngữ (bắt buộc và ưu tiên) và mức khớp ngành. HR thấy cùng định nghĩa mức Cơ bản / Khá / Thành thạo mà code dùng để chấm.

## Background

[CONTEXT D42](../../CONTEXT.md) sửa D41 ở hai điểm:
- chứng chỉ khác loại nhưng cùng ngôn ngữ được so theo CEFR, theo bảng chính thức của tổ chức thi, ở cả điều kiện cứng lẫn điểm;
- tiêu chí ngoại ngữ và mức khớp ngành do code chấm.

Bộ đọc chứng chỉ của [US-3.1](US-3.1-hard-filters-and-scv-formula.md) (`language-requirement.ts`) đã đọc được loại và điểm. Story này thêm bảng quy đổi và luật so khác loại.

JD có thêm `preferred_languages` (ngoại ngữ ưu tiên). Nhờ đó tiêu chí ngoại ngữ có ý nghĩa với cặp đã qua điều kiện cứng. Prompt `jd_analyzer/v2` trích trường này và ghi rõ khung bậc của PRD › *Khung quy đổi mức bằng chứng*.

**Lessons applied**: §6, §10 (lỗi của form khi trường khác lỗi), §15, §21, §25.

## Acceptance criteria

- [ ] **AC-1** — `language-cefr.ts`, `LANGUAGE_CEFR_VERSION = 'language-cefr/v1'`: `cefrOf(certificate)` cho TOEIC (Listening & Reading), IELTS, TOEFL iBT, TOEFL ITP, VSTEP/CEFR.
  - Ngưỡng lấy từ nguồn chính thức (ETS, IELTS). Ghi nguồn và ngày đọc vào Implementation notes.
  - Đề xuất cần kiểm lại: TOEIC A2 225, B1 550, B2 785, C1 945; IELTS B1 4.0, B2 5.5, C1 7.0, C2 8.5; TOEFL iBT B1 42, B2 72, C1 95, C2 114; TOEFL ITP A2 337, B1 460, B2 543, C1 627.
  - Test biên: đúng ngưỡng ra bậc đó, thấp hơn một điểm ra bậc dưới.
- [ ] **AC-2** — `meetsLanguageRequirement` (sửa D41):
  - cùng loại thì so điểm gốc như hiện nay;
  - khác loại nhưng cùng ngôn ngữ thì so bậc CEFR;
  - JLPT, TOPIK, HSK chỉ so cùng loại.

  Ví dụ: yêu cầu "TOEIC 550", SV có "IELTS 6.0" thì đạt; yêu cầu "IELTS 6.5", SV có "TOEIC 600" (B1) thì không đạt. Mọi ca test cùng loại của US-3.1 vẫn qua.
- [ ] **AC-3** — `checkHardFilters` giữ mã `LANGUAGE_NOT_MET` và `required`/`actual`. Không đổi mã lý do nào.
- [ ] **AC-4** — `JdRequirements` thêm `preferred_languages` ở cấp ngoài, không nằm trong `hard_conditions` vì không phải điều kiện cứng: mảng ≤ 10, mỗi mục ≤ 100 ký tự; một ngôn ngữ không nằm ở cả bắt buộc lẫn ưu tiên.
  - Migration điền `[]` cho `job_descriptions.requirements` đã có.
  - `pnpm contracts:gen`.
  - Form HR có ô "Ngoại ngữ ưu tiên".
- [ ] **AC-5** — `scoreLanguage(requirements, entries)` trả `MatchLanguageVerdict` (`verdict`, `evidence`, `required`, `held`).
  - Mục bắt buộc mà SV đạt hoặc vượt là `MET`.
  - Mục ưu tiên: đạt là `MET`; thiếu một bậc CEFR, hoặc có ngôn ngữ mà không có chứng chỉ, là `PARTIAL`; còn lại `NOT_MET`.
  - Tiêu chí là trung bình các mục, quy về verdict theo bảng ở Dev notes.
  - Trả `null` khi JD không có mục nào.
  - `computeScv` coi tiêu chí là rỗng khi `required_languages` ∪ `preferred_languages` rỗng (sửa điều kiện của D41).
- [ ] **AC-6** — `packages/shared/majors.ts` có `MAJOR_GROUPS` (alias tên ngành tiếng Việt, so bằng `normalizeAudienceValue`) và bảng `POSITION_MAJOR_FIT` theo `position_group`.

  `majorMatch(jd, studentMajor)`:
  - JD có `majors` thì cặp đã qua điều kiện cứng là `EXACT`;
  - JD không nêu ngành thì tra bảng;
  - ngành không nhận ra thì `OTHER` kèm `major_unrecognized: true`.
- [ ] **AC-7** — Hợp đồng `MatchEducation` thêm `major_unrecognized` (boolean). `MatchLanguageVerdict` thêm `required`, `held` (chuỗi hiển thị, có bậc CEFR). `contracts:gen`.
- [ ] **AC-8** — Prompt `jd_analyzer/v2`:
  - trích `preferred_languages`;
  - định nghĩa mức BASIC / INTERMEDIATE / ADVANCED theo khung bậc;
  - liệt kê kỹ năng mềm bằng tên năng lực chuẩn khi JD nêu.

  `active.json` dùng v2; ghi fixture mới; `v1` giữ nguyên.
- [ ] **AC-9** — Form xác nhận yêu cầu của HR có dòng trợ giúp cho từng mức, ví dụ "Khá: đã dùng trong ≥ 2 dự án hoặc ≥ 6 tháng", lấy từ một hằng số trong `packages/shared`, không viết tay. Chuỗi tiếng Việt. Bố cục đúng ở 768 / 1024 px.
- [ ] **AC-10** — Property-based test: chứng chỉ điểm cao hơn không bao giờ trượt khi chứng chỉ thấp hơn cùng loại đã đạt; cùng đầu vào cho cùng kết quả.

## Tasks

- [ ] **TASK-3.6.1** — `packages/shared` (AC: 4, 6, 7, 9): `preferred_languages`, `majors.ts`, mở rộng `MatchEducation`/`MatchLanguageVerdict`, hằng số mô tả mức, test, `contracts:gen`.
- [ ] **TASK-3.6.2** — `matching/domain/` (AC: 1, 2, 3, 5, 6, 10): `language-cefr.ts`, sửa `language-requirement.ts`, `language-score.ts`, `major-match.ts`, sửa điều kiện tiêu chí rỗng trong `scv.ts`.
- [ ] **TASK-3.6.3** — DB (AC: 4): migration điền `preferred_languages: []` (rebase trước khi sinh, D20).
- [ ] **TASK-3.6.4** — Web (AC: 4, 9): ô ngoại ngữ ưu tiên, trợ giúp mức độ trên form HR; `api:sync`.
- [ ] **TASK-3.6.5** — [Làn B] `ai-service/app/prompts/jd_analyzer/v2.md`, `active.json`, fixture, pytest; Pydantic sinh lại (AC: 8).

## Dev notes

- AD-15 ([CONTEXT D42](../../CONTEXT.md)); Nguyên tắc 2: ngoại ngữ là điều kiện cứng, không dùng LLM.
- Quy đổi trung bình mục ngoại ngữ sang verdict (đề xuất): trung bình ≥ 0,75 là `MET`, ≥ 0,25 là `PARTIAL`, còn lại `NOT_MET`. Hoặc đưa thẳng phần trăm vào `computeScv` nếu muốn mịn hơn; **hỏi khi bắt đầu story**.
- **Điểm hỏi trước khi chốt:**
  - số ngưỡng CEFR sau khi đối chiếu nguồn. ETS có thể đã đổi thang TOEFL iBT từ 2026; nếu vậy thì đọc cả hai thang;
  - danh sách nhóm ngành và bảng theo nhóm vị trí;
  - Cambridge (B1 Preliminary, B2 First…) để v2.
- Liên quan:
  - builds on US-3.1 (bộ đọc chứng chỉ, `checkHardFilters`, `computeScv`), US-2.3 (`JdRequirements`, form HR, `jd_analyzer/v1`);
  - required by US-3.2, US-3.3;
  - sibling US-3.5 (cùng sửa `contracts/matching.ts`).
- Tham chiếu: PRD FR-9, FR-10, FR-14, FR-40, *Quy đổi ngoại ngữ (CEFR)*, *Mức khớp ngành*; CONTEXT D35, D41, D42.

## Verification commands

> `pnpm --filter @srm/api exec jest --testPathPatterns 'modules/matching/domain' --selectProjects unit`; `pnpm --filter @srm/shared test`; `ai-service/.venv/Scripts/pytest ai-service/tests/agents/jd_analyzer`.

| AC | Command |
|---|---|
| AC-1 | `__tests__/language-cefr.spec.ts` › `FR-40 CEFR thresholds at boundaries` |
| AC-2, AC-3 | `__tests__/language-requirement.spec.ts` › `GĐ3 language requirement: cross-kind via CEFR, same kind by raw score` |
| AC-4 | `packages/shared/contracts/__tests__/jd.spec.ts` › `FR-9 preferred languages`; migration áp được bằng `db:migrate` |
| AC-5 | `__tests__/language-score.spec.ts` › `FR-40 language criterion over required and preferred` |
| AC-6, AC-7 | `__tests__/major-match.spec.ts` › `FR-40 major match by JD majors, position group table, unrecognized flag` |
| AC-8 | `ai-service/tests/agents/jd_analyzer/test_prompt_v2.py` |
| AC-9 | Kiểm tay form HR ở 768 / 1024 px |
| AC-10 | `__tests__/language-cefr.property.spec.ts` |

## Changelog entry

### Added
- Quy đổi chứng chỉ ngoại ngữ về CEFR (`language-cefr/v1`): khác loại so theo bậc CEFR, cùng loại so điểm gốc; dùng cho điều kiện cứng và điểm.
- Ngoại ngữ ưu tiên của JD; tiêu chí ngoại ngữ và mức khớp ngành do code chấm.
- Prompt `jd_analyzer/v2`; trợ giúp mức độ kỹ năng trên form HR.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-40](../../PRD.md#functional-requirements)
- [Epic EPIC-3](../epics/EPIC-3.md)
- [CONTEXT D41, D42](../../CONTEXT.md)
- [LESSONS](../../LESSONS.md)
