---
id: US-3.6
title: "Quy đổi ngoại ngữ CEFR và mức khớp ngành bằng code"
epic: EPIC-3
status: review
priority: P0
points: 5
sprint: sprint-2026-W45
version_shipped: 0.16.0
prd_ref: [FR-40, FR-14, FR-9, FR-10]
arch_ref: [AD-15]
depends_on: [US-3.1, US-2.3]
assignee: PDTnhah
commit:
created: 2026-11-02
updated: 2026-11-03
---

## Story refresh — 2026-11-03 (bắt đầu story)

Người dùng chốt các điểm mở ở phiên Plan; spec đổi theo [CONTEXT D45](../../CONTEXT.md) (sửa D42), số và luật chi tiết ở đó:

- **AC-1**: ngưỡng theo bảng D45 (khác đề xuất cũ ở TOEFL iBT B1 44 và TOEFL ITP), thêm kind `TOEFL_IBT_BAND` cho thang 1–6.
- **AC-4**: bộ đọc ngôn ngữ chuyển sang `packages/shared/contracts/languages.ts`; kết quả JD_ANALYZE có mục ưu tiên trùng thì backend bỏ mục đó.
- **AC-5**: gộp theo ngưỡng 0,75 / 0,25 và các luật `PARTIAL` của D45.
- **AC-6**: file là `packages/shared/schemas/majors.ts`.
- **AC-9**: chuỗi trợ giúp theo khung bậc D44, không theo ví dụ cũ.
- **Cambridge** để `language-cefr/v2`.

## Goal

Code quy chứng chỉ ngoại ngữ về CEFR, nên SV có IELTS không bị loại khỏi JD yêu cầu TOEIC. Code cũng chấm tiêu chí ngoại ngữ (bắt buộc và ưu tiên) và mức khớp ngành. HR thấy cùng định nghĩa mức Cơ bản / Khá / Thành thạo mà code dùng để chấm.

## Background

[CONTEXT D42](../../CONTEXT.md) sửa D41 ở hai điểm:
- chứng chỉ khác loại nhưng cùng ngôn ngữ được so theo CEFR, theo bảng chính thức của tổ chức thi, ở cả điều kiện cứng lẫn điểm;
- tiêu chí ngoại ngữ và mức khớp ngành do code chấm.

Bộ đọc chứng chỉ của [US-3.1](US-3.1-hard-filters-and-scv-formula.md) (`language-requirement.ts`) đã đọc được loại và điểm. Story này thêm bảng quy đổi và luật so khác loại.

JD có thêm `preferred_languages` (ngoại ngữ ưu tiên). Nhờ đó tiêu chí ngoại ngữ có ý nghĩa với cặp đã qua điều kiện cứng. Prompt `jd_analyzer/v2` trích trường này và ghi rõ khung bậc của PRD › *Khung quy đổi mức bằng chứng*.

**Lessons applied**: §6, §10 (lỗi của form khi trường khác lỗi), §15, §21, §25, §26 (`deps` để lỗi trùng ở ô ưu tiên mất khi sửa ô bắt buộc), §31 (chuyển fixture khi lên `jd_analyzer/v2`).

**Design applied**: DESIGN §6 (`Alert` mặc định với icon `Info` cho khối trợ giúp mức độ; `Field` + `FieldDescription` + `FieldError`), §8 (lỗi hiện sau khi rời ô; `deps` cho lỗi chéo), §9 (chuỗi tiếng Việt, câu hướng dẫn mệnh lệnh nhẹ), §5 (form HR dùng được ở 768 px, giữ bố cục một cột của các ô danh sách).

## Acceptance criteria

- [x] **AC-1** — `language-cefr.ts`, `LANGUAGE_CEFR_VERSION = 'language-cefr/v1'`: `cefrOf(certificate)` cho TOEIC (Listening & Reading), IELTS, TOEFL iBT, TOEFL ITP, VSTEP/CEFR.
  - Ngưỡng lấy từ nguồn chính thức (ETS, IELTS). Ghi nguồn và ngày đọc vào Implementation notes.
  - Đề xuất cần kiểm lại: TOEIC A2 225, B1 550, B2 785, C1 945; IELTS B1 4.0, B2 5.5, C1 7.0, C2 8.5; TOEFL iBT B1 42, B2 72, C1 95, C2 114; TOEFL ITP A2 337, B1 460, B2 543, C1 627.
  - Test biên: đúng ngưỡng ra bậc đó, thấp hơn một điểm ra bậc dưới.
- [x] **AC-2** — `meetsLanguageRequirement` (sửa D41):
  - cùng loại thì so điểm gốc như hiện nay;
  - khác loại nhưng cùng ngôn ngữ thì so bậc CEFR;
  - JLPT, TOPIK, HSK chỉ so cùng loại.

  Ví dụ: yêu cầu "TOEIC 550", SV có "IELTS 6.0" thì đạt; yêu cầu "IELTS 6.5", SV có "TOEIC 600" (B1) thì không đạt. Mọi ca test cùng loại của US-3.1 vẫn qua.
- [x] **AC-3** — `checkHardFilters` giữ mã `LANGUAGE_NOT_MET` và `required`/`actual`. Không đổi mã lý do nào.
- [x] **AC-4** — `JdRequirements` thêm `preferred_languages` ở cấp ngoài, không nằm trong `hard_conditions` vì không phải điều kiện cứng: mảng ≤ 10, mỗi mục ≤ 100 ký tự; một ngôn ngữ không nằm ở cả bắt buộc lẫn ưu tiên.
  - Migration điền `[]` cho `job_descriptions.requirements` đã có.
  - `pnpm contracts:gen`.
  - Form HR có ô "Ngoại ngữ ưu tiên".
- [x] **AC-5** — `scoreLanguage(requirements, entries)` trả `MatchLanguageVerdict` (`verdict`, `evidence`, `required`, `held`).
  - Mục bắt buộc mà SV đạt hoặc vượt là `MET`.
  - Mục ưu tiên: đạt là `MET`; thiếu một bậc CEFR, hoặc có ngôn ngữ mà không có chứng chỉ, là `PARTIAL`; còn lại `NOT_MET`.
  - Tiêu chí là trung bình các mục, quy về verdict theo bảng ở Dev notes.
  - Trả `null` khi JD không có mục nào.
  - `computeScv` coi tiêu chí là rỗng khi `required_languages` ∪ `preferred_languages` rỗng (sửa điều kiện của D41).
- [x] **AC-6** — `packages/shared/majors.ts` có `MAJOR_GROUPS` (alias tên ngành tiếng Việt, so bằng `normalizeAudienceValue`) và bảng `POSITION_MAJOR_FIT` theo `position_group`.

  `majorMatch(jd, studentMajor)`:
  - JD có `majors` thì cặp đã qua điều kiện cứng là `EXACT`;
  - JD không nêu ngành thì tra bảng;
  - ngành không nhận ra thì `OTHER` kèm `major_unrecognized: true`.
- [x] **AC-7** — Hợp đồng `MatchEducation` thêm `major_unrecognized` (boolean). `MatchLanguageVerdict` thêm `required`, `held` (chuỗi hiển thị, có bậc CEFR). `contracts:gen`.
- [x] **AC-8** — Prompt `jd_analyzer/v2`:
  - trích `preferred_languages`;
  - định nghĩa mức BASIC / INTERMEDIATE / ADVANCED theo khung bậc;
  - liệt kê kỹ năng mềm bằng tên năng lực chuẩn khi JD nêu.

  `active.json` dùng v2; ghi fixture mới; `v1` giữ nguyên.
- [ ] **AC-9** — Form xác nhận yêu cầu của HR có dòng trợ giúp cho từng mức, ví dụ "Khá: đã dùng trong ≥ 2 dự án hoặc ≥ 6 tháng", lấy từ một hằng số trong `packages/shared`, không viết tay. Chuỗi tiếng Việt. Bố cục đúng ở 768 / 1024 px.
- [x] **AC-10** — Property-based test: chứng chỉ điểm cao hơn không bao giờ trượt khi chứng chỉ thấp hơn cùng loại đã đạt; cùng đầu vào cho cùng kết quả.

## Tasks

- [x] **TASK-3.6.1** — `packages/shared` (AC: 4, 6, 7, 9): `preferred_languages`, `majors.ts`, mở rộng `MatchEducation`/`MatchLanguageVerdict`, hằng số mô tả mức, test, `contracts:gen`.
- [x] **TASK-3.6.2** — `matching/domain/` (AC: 1, 2, 3, 5, 6, 10): `language-cefr.ts`, sửa `language-requirement.ts`, `language-score.ts`, `major-match.ts`, sửa điều kiện tiêu chí rỗng trong `scv.ts`.
- [x] **TASK-3.6.3** — DB (AC: 4): migration điền `preferred_languages: []` (rebase trước khi sinh, D20).
- [x] **TASK-3.6.4** — Web (AC: 4, 9): ô ngoại ngữ ưu tiên, trợ giúp mức độ trên form HR; `api:sync`.
- [x] **TASK-3.6.5** — [Làn B] `ai-service/app/prompts/jd_analyzer/v2.md`, `active.json`, fixture, pytest; Pydantic sinh lại (AC: 8).

## Dev notes

- AD-15 ([CONTEXT D42](../../CONTEXT.md)); Nguyên tắc 2: ngoại ngữ là điều kiện cứng, không dùng LLM.
- Các điểm mở (ngưỡng CEFR, cách gộp mục ngoại ngữ, nhóm ngành, Cambridge) đã chốt ở D45.
- Liên quan:
  - builds on US-3.1 (bộ đọc chứng chỉ, `checkHardFilters`, `computeScv`), US-2.3 (`JdRequirements`, form HR, `jd_analyzer/v1`);
  - required by US-3.2, US-3.3;
  - sibling US-3.5 (cùng sửa `contracts/matching.ts`).
- Tham chiếu: PRD FR-9, FR-10, FR-14, FR-40, *Quy đổi ngoại ngữ (CEFR)*, *Mức khớp ngành*; CONTEXT D35, D41, D42.

## Verification commands

> `pnpm --filter @srm/api exec jest --testPathPatterns 'modules/matching/domain' --selectProjects unit`; `pnpm --filter @srm/shared test`; `ai-service/.venv/Scripts/pytest ai-service/tests/agents/jd_analyzer`.

| AC | Command |
|---|---|
| AC-1 | `__tests__/language-cefr.spec.ts` › `GĐ3 FR-40 CEFR conversion of certificates` |
| AC-2, AC-3 | `__tests__/language-requirement.spec.ts` › `cross-kind via CEFR, same kind by raw score`, `another kind counts only when both sides name the language` |
| AC-4 | `packages/shared/contracts/__tests__/jd.spec.ts` › `GĐ1 FR-9 preferred languages`; `jd-requirements.int-spec.ts`; migration `0023` |
| AC-5 | `__tests__/language-score.spec.ts` › `GĐ3 FR-40 language criterion over required and preferred` |
| AC-6, AC-7 | `__tests__/major-match.spec.ts`; `packages/shared/schemas/__tests__/majors.spec.ts` |
| AC-8 | `ai-service/tests/prompts/test_jd_analyzer_v2.py`; `tests/agents/test_jd_analyzer.py` › `test_ac8_preferred_languages_and_soft_skills_under_catalogue_names` |
| AC-9 | Kiểm tay form HR ở 768 / 1024 px |
| AC-10 | `__tests__/language-cefr.property.spec.ts` |

## Changelog entry

### Added
- Quy đổi chứng chỉ ngoại ngữ về CEFR (`language-cefr/v1`): khác loại so theo bậc CEFR, cùng loại so điểm gốc; dùng cho điều kiện cứng và điểm.
- Ngoại ngữ ưu tiên của JD; tiêu chí ngoại ngữ và mức khớp ngành do code chấm.
- Prompt `jd_analyzer/v2`; trợ giúp mức độ kỹ năng trên form HR.

**Commit**:

## Implementation notes

**Phiên Execute (2026-11-03)**: xong TASK-3.6.1 → 3.6.5 (nhánh `us-3.6` từ `dev`). Điểm lệch so với plan và điều người sau cần biết:

- `contracts` không import `schemas`: `normalizeAudienceValue` chuyển xuống `contracts/text.ts`, `schemas/campaign.ts` re-export (một lần, tránh TS2308).
- Migration `0023` là SQL tự viết (`drizzle-kit generate --custom`), như `0021`.

- Nguồn và ngày đọc của bảng CEFR (AC-1): bảng của [CONTEXT D45](../../CONTEXT.md), đọc ngày 2026-11-03; comment trong `language-cefr.ts` ghi nguồn từng dòng.
- Kiểm "một ngôn ngữ ở một danh sách" nằm ở `HrJdRequirementsSchema`, dùng cho `SaveJdRequirementsRequestSchema` (form HR và API), không ở `JdRequirementsSchema`. Consumer `ai.results` parse envelope bằng `JdRequirementsSchema`, nên đặt kiểm ở đó thì một mục trùng làm cả message vào DLQ. D45 đã ghi theo.
- Mô tả của `SkillLevelSchema` dựng từ `SKILL_LEVEL_EVIDENCE`, nên output schema của JD Analyzer mang định nghĩa mức. `test_jd_analyzer_v2.py` so số trong prompt với docstring `SkillLevel` sinh ra, và so tên kỹ năng mềm với seed `0015`/`0021` (13 tên, 12 họ).
- Bộ đọc: điểm IELTS và band TOEFL phải theo bước 0,5 (IELTS 6.3 không còn được đọc). Với chữ "TOEFL", số đầu tiên hợp lệ trong cửa sổ quyết định thang, nên "TOEFL iBT 100 4 kỹ năng" là 100.
- `scoreLanguage`: `required` ghi mục ưu tiên kèm "(ưu tiên)". Mục không có chứng chỉ giữ nguyên chữ HR hoặc SV viết.
- Form HR: `listErrors` hiện lỗi của từng mục trong ô danh sách. Trước đây lỗi mục (quá 100 ký tự) của ô ngành và ngoại ngữ không hiện.
- Fixture: khóa có cả `output_schema`, nên 6 fixture v1 đổi khóa, chuyển bằng script tạm (LESSONS §31); fixture mới `9bf6316512d9bb8a.json` (JD Tester có ngoại ngữ ưu tiên, kỹ năng mềm và một nét tính cách bị bỏ).

**Phiên Review (2026-11-03)**: `/code-review` ra 14 điểm. Đã sửa (D45 ghi thêm luật):

- Khác loại chỉ so qua CEFR khi cả hai phía nêu cùng ngôn ngữ; trước đó "Giấy phép lái xe B2", "DELF B2" đạt "TOEIC 550".
- Bậc CEFR ghi sau điểm ("TOEIC 650 (B1)"; "IELTS 6.5 (B2)" ở JD) là chú thích, không phải chứng chỉ riêng; trước đó nó hạ ngưỡng điểm gốc.
- `PARTIAL` cho ngôn ngữ không kèm chứng chỉ xét từng mục CV; trước đó ghi thêm chứng chỉ thấp làm verdict giảm. Property mới: thêm một mục CV không làm verdict giảm.
- `listErrors` đọc lỗi mục khi ô danh sách cũng có lỗi chung; dùng chung `VERDICT_HALVES`, `LANGUAGE_LIST_MAX`; mã GĐ trong tên test.

Chưa sửa:

- Cho US-3.2: lưu cả `LANGUAGE_CEFR_VERSION` lẫn `MATCHING_RULES_VERSION` với `match_results`; khi chấm hàng loạt, đọc mục ngoại ngữ của SV một lần (giờ mỗi lời gọi đọc lại).
- Điều kiện cứng so ngành bằng chuỗi chuẩn hóa, chưa theo `majorKey`/alias ("CNTT" khác "Công nghệ thông tin"): luật của US-3.1, cần người dùng quyết.
- Kết quả JD_ANALYZE của worker cũ (thiếu `preferred_languages`) còn trong `ai.results` lúc deploy sẽ vào DLQ; chấp nhận vì compose deploy cả hệ thống một lần.
- Một ngôn ngữ lặp trong cùng một danh sách tính hai lần; điểm dưới đáy bảng (IELTS < 4.0) không được `PARTIAL`. Giữ theo D45.

Self-verify sau review: `pnpm typecheck`, `lint`, `depcruise`, `pnpm test` (shared 310, api 701 kể cả integration), ai-service `ruff` + `pytest` (314), `gate-runner --phase release-commit` đều xanh.

Lessons: §32 mới (kiểm chéo trên schema hợp đồng message làm cả kết quả AI vào DLQ).

## Files modified

- `packages/shared`: `contracts/languages.ts`, `contracts/text.ts` (mới), `contracts/jd.ts`, `contracts/matching.ts`, `schemas/majors.ts` (mới), `schemas/campaign.ts`, `schemas/job-description.ts`, index, test; JSON Schema sinh lại.
- `apps/api`: `matching/domain` (`language-cefr.ts`, `language-score.ts`, `major-match.ts`, `quote.ts` mới; `language-requirement.ts`, `scv.ts`, `matching-rules.ts`, `skill-match.ts`; test); `company/application/jd-analysis.service.ts`; migration `0023_jd_preferred_languages`; `dev-seed.ts`; `test/helpers/jd.ts`, `jd-requirements.int-spec.ts`.
- `apps/web`: `features/jds/requirements/requirements-form.tsx`, `requirements-summary.tsx`; `openapi.json`, `schema.d.ts`.
- `ai-service`: prompt `jd_analyzer/v2.md`, `active.json`, `manifest.json`; `agents/jd_analyzer/agent.py`; Pydantic sinh lại; fixture `jd_analyzer`; test.

## Cross-references

- [PRD FR-40](../../PRD.md#functional-requirements)
- [Epic EPIC-3](../epics/EPIC-3.md)
- [CONTEXT D41, D42, D45](../../CONTEXT.md)
- [LESSONS](../../LESSONS.md)
