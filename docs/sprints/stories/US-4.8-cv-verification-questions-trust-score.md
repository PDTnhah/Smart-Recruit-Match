---
id: US-4.8
title: "Câu hỏi xác minh CV và chỉ số tin cậy"
epic: EPIC-4
status: backlog
priority: P1
points: 5
sprint:
version_shipped:
prd_ref: [FR-25]
depends_on: [US-4.1, US-2.4]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

HR có thêm một tín hiệu để biết sinh viên có thật sự làm những gì họ khai trong CV hay không. Khi phần D được bật cho JD, bài test có thêm 2–3 câu hỏi về chính dự án và kỹ năng mà sinh viên đã khai. Câu trả lời được đối chiếu với CV và quy thành "chỉ số tin cậy CV". Chỉ số này chỉ để HR tham khảo. Nó không tính vào S_test, S_final, và không ảnh hưởng tới phân bổ.

## Background

FR-25: câu hỏi xác minh CV (phần D) và chỉ số tin cậy CV cho HR tham khảo. PRD › GĐ5 › *Cấu trúc đề mặc định*: phần D (tùy chọn) gồm 2–3 câu hỏi về dự án/kỹ năng sinh viên khai trong CV; **không** tính vào S_test, chỉ tạo "chỉ số tin cậy CV" để HR tham khảo. Phần D là phần duy nhất của đề được cá nhân hóa theo CV. Điều này không trái BR-05 vì phần tính điểm vẫn giống nhau cho mọi sinh viên.

ARCH › *Bản đồ sử dụng LLM theo giai đoạn* có dòng "GĐ5 · Câu hỏi xác minh CV (tùy chọn) · Claude · `effort: medium` · Job nền · Không tính vào điểm". Các bước chấm chỉ nhận dữ liệu đã che PII (BR-03, NFR-3), nên câu hỏi sinh từ `cvs.profile_masked` mà [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md) tạo ra. Theo D2, LLM không tự cho chỉ số tổng. LLM chỉ trả nhận định từng câu kèm trích dẫn; code tính chỉ số.

EPIC-4 › *Cross-story testing requirements* ghi story này dùng chung hạ tầng fixture nhiều lượt của [US-4.1](US-4.1-exam-blueprint-test-generator.md).

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — `examBlueprintSchema` có thêm khối phần D (đề xuất: `enabled`, `count` từ 2 đến 3), mặc định tắt. `CENTER` bật hoặc tắt theo JD trước khi ngân hàng khóa. Bật với `count` ngoài khoảng 2–3 thì `400`.
- [ ] **AC-2** — **Given** phần D được bật và sinh viên có NV vào JD ở `PENDING_TEST`, **When** backend phát `ai.cv_verification.generate` (đề xuất) với `{ job_id, preference_id }`, **Then** agent đọc `profile_masked` và yêu cầu JD qua view chỉ đọc, sinh 2–3 câu, mỗi câu gắn với một mục cụ thể sinh viên đã khai (`claim_ref`), với `effort: medium` và structured output **And** câu hỏi lưu vào `cv_verification_questions` (bảng đề xuất) kèm `model`, `prompt_version` **And** `refusal` hoặc lỗi sau khi thử lại thì NV đó không có phần D, có ghi log, không chặn sinh viên thi.
- [ ] **AC-3** — Request gửi LLM ở cả bước sinh và bước đối chiếu chỉ chứa trường của `profile_masked`, yêu cầu JD và câu trả lời. Không có tên, email, số điện thoại, ảnh, ngày sinh, giới tính, quê quán, tôn giáo, tình trạng hôn nhân (BR-03). Test chụp request ở chế độ fixture và kiểm danh sách trường cấm.
- [ ] **AC-4** — **Given** phiên thi có phần D, **When** sinh viên làm bài, **Then** phần D hiện thành mục riêng có nhãn "Không tính điểm", tự lưu như các câu khác **And** response không có đáp án hay ý mong đợi **And** câu phần D chưa sinh xong lúc bắt đầu thi thì phiên bắt đầu không có phần D, không chờ.
- [ ] **AC-5** — **Given** phiên đã đóng, **When** chạy bước đối chiếu (đề xuất queue `ai.cv_verification.evaluate`), **Then** LLM trả nhận định cho từng câu (`CONSISTENT`/`PARTIAL`/`INCONSISTENT`/`NO_ANSWER`, đề xuất) kèm trích dẫn từ câu trả lời và lý do **And** trích dẫn không khớp câu trả lời (RapidFuzz < 85) thì nhận định bị hạ xuống `INCONSISTENT` hoặc `NO_ANSWER` **And** code tính chỉ số tin cậy từ các nhận định (đề xuất: 1 / 0,5 / 0 rồi lấy trung bình, chia mức Cao / Trung bình / Thấp theo ngưỡng là tham số).
- [ ] **AC-6** — Phần D không ảnh hưởng điểm: `computeSTest`, `computeSkillScores`, `computeSFinal` bỏ qua phần D. Property test cho thấy cùng bài làm phần A/B với mọi tổ hợp câu trả lời và nhận định phần D luôn cho cùng S_test, S_final. Không bước chuyển trạng thái nào đọc chỉ số tin cậy.
- [ ] **AC-7** — `CENTER` xem được chỉ số và chi tiết từng câu của một phiên qua `GET /api/exam-sessions/{id}/cv-trust` (đề xuất); `HR`, `STUDENT` gọi endpoint này nhận `403`. Module `assessment` export `CvTrustService.getForPreference(preferenceId)` (đề xuất) cho [US-5.3](US-5.3-hr-nomination-review.md) hiện cho HR, kèm kiểm tra BR-11 ở đó.
- [ ] **AC-8** — Fixture ở `ai-service/tests/fixtures/cv_verification/` có các ca: sinh câu bình thường, `refusal`, câu trả lời khớp CV, câu trả lời mâu thuẫn, trích dẫn bịa, bỏ trống. Fixture dùng bộ nạp fixture của US-4.1. Không test nào gọi API thật.

## Tasks

- [ ] **TASK-4.8.1** — Đọc skill `claude-api` trước khi viết code gọi LLM (AC: 2, 5)
  - [ ] Subtask 4.8.1.1 — Ghi vào Implementation notes tham số structured outputs và `effort: medium` cho hai bước sinh và đối chiếu.
- [ ] **TASK-4.8.2** — Cấu hình, bảng và hợp đồng (AC: 1, 2)
  - [ ] Subtask 4.8.2.1 — Mở rộng `packages/shared/schemas/exam-blueprint.ts` với khối phần D.
  - [ ] Subtask 4.8.2.2 — Migration: bảng `cv_verification_questions` (đề xuất: `id`, `preference_id`, `session_id`, `content` JSONB, `claim_ref`, `answer` JSONB, `evaluation` JSONB, `model`, `prompt_version`); cột chỉ số tin cậy (đề xuất `exam_sessions.cv_trust` JSONB).
  - [ ] Subtask 4.8.2.3 — `packages/shared/contracts/cv-verification.ts` (đề xuất): hai loại job và kết quả, sinh Pydantic theo AD-6.
- [ ] **TASK-4.8.3** — Agent sinh câu hỏi (AC: 2, 3)
  - [ ] Subtask 4.8.3.1 — `ai-service/app/agents/cv_verification/` (đề xuất) và `ai-service/app/prompts/cv_verification/v1.md`: hướng dẫn cố định ở đầu; `profile_masked` (JSON `sort_keys=True`) và yêu cầu JD ở cuối, trong thẻ dữ liệu riêng.
  - [ ] Subtask 4.8.3.2 — `ai-service/app/consumers/cv_verification.py`: idempotent theo `job_id`.
- [ ] **TASK-4.8.4** — Phần D trong phòng thi (AC: 4)
  - [ ] Subtask 4.8.4.1 — Đọc `DESIGN.md` trước khi code, ghi `Design applied: …` vào story.
  - [ ] Subtask 4.8.4.2 — Mở rộng `apps/api/src/modules/assessment/api/exam-session.controller.ts` và `apps/web/src/features/exam/` của US-4.3 với mục phần D.
- [ ] **TASK-4.8.5** — Đối chiếu và tính chỉ số (AC: 5, 6)
  - [ ] Subtask 4.8.5.1 — Bước đối chiếu trong `ai-service/app/agents/cv_verification/`, kiểm trích dẫn bằng RapidFuzz.
  - [ ] Subtask 4.8.5.2 — `apps/api/src/modules/assessment/domain/cv-trust.ts`: hàm thuần tính chỉ số và mức; unit test.
- [ ] **TASK-4.8.6** — Quyền xem và service cho HR (AC: 7)
  - [ ] Subtask 4.8.6.1 — `apps/api/src/modules/assessment/api/cv-trust.controller.ts`, `apps/api/src/modules/assessment/application/cv-trust.service.ts`.
- [ ] **TASK-4.8.7** — Fixture và test (AC: 2, 3, 5, 6, 7, 8)
  - [ ] Subtask 4.8.7.1 — `ai-service/tests/agents/test_cv_verification.py`; `apps/api/test/assessment/cv-trust.spec.ts`; property test trong `apps/api/src/modules/assessment/domain/scoring.spec.ts`.

## Dev notes

### Architecture constraints

- [AD-2](../../ARCHITECTURE.md#architecture-decisions): LLM trả nhận định từng câu kèm trích dẫn; code tính chỉ số. Phương án để LLM trả thẳng một "điểm tin cậy" bị loại.
- [AD-4](../../ARCHITECTURE.md#architecture-decisions): AI Service đọc `profile_masked` qua view đã che PII, kết quả đi về qua `ai.results`; Core Backend ghi bảng nghiệp vụ.
- [AD-10](../../ARCHITECTURE.md#architecture-decisions): mọi lượt gọi qua `LLMClient`, `effort: medium` theo ARCH, kiểm `refusal` trước khi đọc nội dung.
- AGENTS › Nguyên tắc 5 áp dụng tương tự: nhận định "khớp" phải có trích dẫn có thật trong câu trả lời.
- AGENTS › Nguyên tắc 6: CV và câu trả lời là dữ liệu, đặt trong thẻ riêng; chỉ nhận đầu ra đúng schema.
- **Điểm chưa rõ trong spec — hỏi trước khi chốt:**
  - ARCH không có agent, queue hay bảng cho phần D. `cv_verification` (agent), `ai.cv_verification.generate`, `ai.cv_verification.evaluate`, `cv_verification_questions`, `exam_sessions.cv_trust` đều là đề xuất.
  - PRD không nói câu trả lời phần D được đánh giá thế nào để ra chỉ số. Cách tính ở AC-5 là đề xuất.
  - Bảng *"Agent" nghĩa là gì* của ARCH không có agent này. EPIC-4 lại ghi story dùng fixture vòng lặp tool-use. Story tạm làm workflow có structured output (không cần vòng lặp công cụ) và chỉ dùng chung bộ nạp fixture của US-4.1.
  - Câu hỏi sinh khi nào và theo đơn vị nào (theo NV hay theo sinh viên). Story tạm sinh theo NV khi NV vào `PENDING_TEST`.
  - Thời gian làm phần D có tính trong T_test không. Story tạm tính chung trong T_test.
  - Sinh viên có được xem chỉ số của mình không. Story tạm không hiện cho sinh viên.
  - HR chỉ thấy hồ sơ đã được đề cử (BR-11), và đề cử chỉ có từ [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md). Phần "HR thấy chỉ số tin cậy" của epic nghiệm thu ở [US-5.3](US-5.3-hr-nomination-review.md); story này chỉ cung cấp service.

### Cross-story dependencies

- Builds on [US-4.1](US-4.1-exam-blueprint-test-generator.md): `examBlueprintSchema`, bộ nạp fixture `ai-service/tests/fixtures/test_generator/`.
- Builds on [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md): `cvs.profile_masked` và view `core.v_ai_cv_profile_masked`.
- Builds on [US-4.3](US-4.3-exam-room.md): API và giao diện phòng thi; [US-4.4](US-4.4-grading-stest-sfinal.md): `computeSTest`, `computeSkillScores` (phải bỏ qua phần D).
- Builds on [US-2.2](US-2.2-llm-client-versioned-prompts.md): `LLMClient`; [US-3.3](US-3.3-shortlist-and-preferences.md): NV ở `PENDING_TEST`.
- Required by [US-5.3](US-5.3-hr-nomination-review.md): `CvTrustService.getForPreference()` trong hồ sơ đề cử.
- Required by [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md) nếu đo chất lượng phần D.
- Sibling [US-4.3](US-4.3-exam-room.md) (cùng tuần T9): cùng sửa `apps/web/src/features/exam/` và `exam-session.controller.ts`; story này rebase sau US-4.3.

### References

- [Source: PRD › GĐ5 – Sinh và tổ chức bài test (Cấu trúc đề mặc định, phần D)](../../PRD.md)
- [Source: PRD › Functional Requirements (FR-25)](../../PRD.md#functional-requirements)
- [Source: PRD › Quy tắc nghiệp vụ (BR-03), Kiểm soát rủi ro AI (guardrails)](../../PRD.md)
- [Source: ARCHITECTURE › LLM usage and cost (Bản đồ sử dụng LLM)](../../ARCHITECTURE.md#llm-usage-and-cost)
- [Source: ARCHITECTURE › Phân vùng schema, Các bảng chính](../../ARCHITECTURE.md#data-architecture)
- [Source: CONTEXT D2, D4, D10](../../CONTEXT.md)
- [Source: Epic EPIC-4](../epics/EPIC-4.md)

## Verification commands

> Chưa có `package.json`/`pyproject.toml`. Lệnh chạy cụ thể sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `packages/shared/schemas/exam-blueprint.spec.ts` › `FR-25 part D disabled by default; count must be 2–3` |
| AC-2 | `ai-service/tests/agents/test_cv_verification.py` › `test_gd5_generates_2_3_questions_with_claim_ref_effort_medium`, `test_refusal_skips_part_d`; `apps/api/test/assessment/cv-trust.spec.ts` › `FR-25 questions stored with model and prompt_version` |
| AC-3 | `ai-service/tests/agents/test_cv_verification.py` › `test_br03_requests_contain_only_masked_profile_fields` |
| AC-4 | `apps/api/test/assessment/exam-room.spec.ts` › `FR-25 part D section labelled unscored, autosaved, no expected answer; missing part D does not block start` |
| AC-5 | `ai-service/tests/agents/test_cv_verification.py` › `test_fabricated_quote_downgraded`; `apps/api/src/modules/assessment/domain/cv-trust.spec.ts` › `FR-25 trust index from verdicts and level thresholds` |
| AC-6 | `apps/api/src/modules/assessment/domain/scoring.spec.ts` › `FR-25 property: part D never changes S_test or S_final` |
| AC-7 | `apps/api/test/assessment/cv-trust.spec.ts` › `FR-25 CENTER reads cv-trust; HR/STUDENT 403` |
| AC-8 | `ai-service/tests/agents/test_cv_verification.py` › `test_fixture_set_covers_required_cases_no_real_api` |

## Changelog entry

### Added
- Phần D của bài test (tùy chọn theo JD): 2–3 câu hỏi về dự án và kỹ năng sinh viên đã khai, sinh từ hồ sơ đã che PII.
- Chỉ số tin cậy CV do code tính từ nhận định từng câu có trích dẫn; chỉ để HR tham khảo, không tính vào S_test hay S_final.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-25](../../PRD.md#functional-requirements)
- [Epic EPIC-4](../epics/EPIC-4.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D2, D4](../../CONTEXT.md)
- [US-4.1 Ma trận đề và Test Generator](US-4.1-exam-blueprint-test-generator.md)
- [US-5.3 HR duyệt danh sách đề cử](US-5.3-hr-nomination-review.md)
