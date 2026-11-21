---
id: US-4.13
title: "Trung tâm và HR tự thêm câu hỏi: điền form hoặc import file"
epic: EPIC-4
status: backlog
priority: P1
points: 8
sprint:
version_shipped:
prd_ref: [FR-42, FR-18]
depends_on: [US-4.11, US-4.9]
assignee:
commit:
created: 2026-11-21
updated: 2026-11-21
---

## Goal

Trung tâm và doanh nghiệp tự đưa câu hỏi của mình vào ngân hàng của một JD, bằng cách điền form hoặc import file `.xlsx`/`.csv` theo mẫu. Câu thêm tay qua cùng luật kiểm với câu AI sinh, dùng được ngay và được tính vào độ phủ. Nhờ vậy ngân hàng chứa được câu đã dùng thật ở doanh nghiệp, còn Test Generator chỉ cần sinh phần còn thiếu.

## Background

Từ US-4.1, mọi câu do Test Generator sinh ([CONTEXT D49](../../CONTEXT.md)). Bảng `core.questions` bắt buộc `draft_id` (khóa của `ai.question_drafts`), `model`, `prompt_version` (`apps/api/src/db/schema/assessment.ts`). Trung tâm xem và loại được câu ([US-4.11](US-4.11-question-bank-browser-and-rejection.md)); HR chỉ xem đề mẫu ([US-4.9](US-4.9-question-bank-sample-review.md)). Chưa có cách nào để đưa câu do người viết vào ngân hàng.

Ngày 2026-11-21 người dùng chốt phạm vi ([CONTEXT D62](../../CONTEXT.md)): quyền của HR (AC-1, AC-7), hai định dạng file (AC-3), chỉ thêm trước khi khóa (AC-6), xem trước rồi lưu tất cả hoặc không (AC-4, AC-5). Các mục ghi *Đề xuất* trong AC (route, cột, view, giới hạn) được chốt ở phiên Plan.

**Lessons applied**: *(điền ở phiên Plan; ứng viên §6, §9, §21, §22, §25, §30, §43, §44, §47)*

## Acceptance criteria

- [ ] **AC-1** — **Form.** **Given** CENTER (mọi JD trong đợt) hoặc HR của công ty sở hữu JD, ngân hàng `OPEN`, **When** gửi một câu, **Then** câu được lưu ở `questions` với trạng thái `DRAFT`, `source = MANUAL`, người thêm, kèm audit **And** câu dùng được ngay: tính vào độ phủ và điều kiện khóa, được rút trong phòng thi (`getDrawableQuestions`), có thể vào mẫu duyệt của US-4.9 **And** HR của công ty khác nhận `404`, `STUDENT` nhận `403`.
  - Trắc nghiệm: đề, 4 phương án, đúng 1 đáp án đúng, giải thích.
  - Tự luận: đề, rubric 1–`RUBRIC_MAX_CRITERIA` tiêu chí (điểm nguyên 1–`RUBRIC_MAX_POINTS`), đáp án mẫu, giải thích.
  - Loại câu, kỹ năng và độ khó phải là một ô của ma trận: phần A là trắc nghiệm, phần B là tự luận. Tên kỹ năng khớp theo `skillMatchKey`.
- [ ] **AC-2** — **Luật kiểm**, cùng luật với `submit_questions()` của Generator:
  - định dạng và giới hạn độ dài của `packages/shared/contracts/questions.ts`;
  - `UNKNOWN_CELL`: ô không có trong ma trận;
  - `CELL_FULL`: ô đã có `QUESTION_BANK_FACTORS.max` × số câu cần, không tính câu bị loại;
  - `BANK_FULL`: ngân hàng đã có `QUESTION_BANK_MAX_DRAFTS` câu;
  - `DUPLICATE`: trùng nguyên văn với một câu của ngân hàng hoặc với dòng khác của cùng file, chuẩn hóa như `stem_key` (NFKC, chữ thường, gộp khoảng trắng).

  Lỗi trả `400` kèm vị trí trường. Đề xuất: một Zod schema `ManualQuestionInputSchema` ở `packages/shared/schemas/`, dùng chung cho form (React Hook Form) và API.
- [ ] **AC-3** — **File mẫu.** **Given** người có quyền như AC-1, **When** tải file mẫu của một JD (đề xuất `GET /api/jds/{id}/question-bank/import-template?format=xlsx|csv`), **Then** nhận file có một bộ cột chung: Loại (`Trắc nghiệm`/`Tự luận`), Kỹ năng, Độ khó (`Dễ`/`Trung bình`/`Khó`), Đề, Phương án A–D, Đáp án đúng (A–D), Giải thích, Đáp án mẫu, Tiêu chí 1/Điểm 1 … Tiêu chí 10/Điểm 10 **And** bản `.xlsx` có thêm sheet "Hướng dẫn" liệt kê các ô của ma trận (kỹ năng × độ khó, số câu đang có/cần) **And** bản `.csv` dùng UTF-8, phân cách bằng dấu phẩy.
- [ ] **AC-4** — **Xem trước.** **When** tải lên một file `.xlsx` hoặc `.csv` (đề xuất `POST /api/jds/{id}/question-bank/import/preview`, multipart; ≤ 5 MB, ≤ 200 dòng), **Then** server đọc mọi dòng và trả bảng xem trước: mỗi dòng đã chuẩn hóa thành câu, kèm lỗi theo (dòng, cột, mã) của AC-2 **And** chưa lưu gì.
  - CSV nhận cả bản có BOM và không có BOM.
  - Ô chứa công thức bị báo lỗi; công thức không bao giờ được tính.
  - Lỗi cấp file (sai loại, không đọc được, thiếu cột tiêu đề, không có dòng nào, quá 200 dòng) trả `400`.
- [ ] **AC-5** — **Lưu tất cả hoặc không.** **When** xem trước không còn lỗi và người dùng bấm "Lưu N câu", **Then** mọi câu được ghi trong một giao dịch, dưới khóa của ngân hàng, sau khi kiểm lại mọi luật của AC-2 **And** chỉ cần một câu lỗi (ví dụ ô vừa đầy vì người khác mới thêm) thì không câu nào được lưu, response trả danh sách lỗi **And** audit ghi một lượt import gồm tên file và số câu. Đề xuất: form và import dùng chung route `POST /api/jds/{id}/question-bank/questions` `{ questions[1..200], origin, fileName? }`; client gửi lại các dòng đã chuẩn hóa, server kiểm lại từ đầu.
- [ ] **AC-6** — **Thời điểm.** Ngân hàng `LOCKED`: `409 QUESTION_BANK_LOCKED`. Đang có run sinh hoặc kiểm: `409 QUESTION_GENERATION_RUNNING`. Đợt đã đóng hoặc hủy: `409` qua `assertNotFinal` **And** DB chặn INSERT câu vào ngân hàng đã khóa (trigger, Nguyên tắc 11).
- [ ] **AC-7** — **Xem.**
  - CENTER thấy câu thêm tay trong mục "Câu hỏi (N)" của US-4.11, kèm nhãn "Thêm tay" và người thêm (Trung tâm hoặc HR, có tên), lọc được theo nguồn; loại được như câu AI (US-4.11 AC-3).
  - HR có route riêng (đề xuất `GET /api/jds/{id}/question-bank/manual-questions`), chỉ trả câu do HR của công ty thêm cho JD đó, kèm trạng thái và lý do nếu câu bị loại.
  - `GET /api/question-banks/{id}/questions` vẫn chỉ cho CENTER (US-4.11 AC-1).
- [ ] **AC-8** — **Dữ liệu.** Đề xuất: `questions.source` (`AI`/`MANUAL`) và `questions.created_by`. Câu AI có `draft_id`, `model`, `prompt_version`; câu thêm tay không có ba cột này và có `created_by`. CHECK của DB giữ cả hai chiều. Nguyên tắc 12 chỉ áp cho kết quả của LLM.
- [ ] **AC-9** — **Test Generator.** Lượt "Sinh câu còn thiếu" sau đó:
  - đếm câu thêm tay dùng được vào độ phủ, nên không sinh thừa và không vượt 5×;
  - kiểm trùng gần nghĩa (cosine ≥ 0,9) giữa câu mới và câu thêm tay;
  - đưa đề của câu thêm tay vào prompt trong `untrusted(...)` (Nguyên tắc 6), bằng prompt mới `test_generator/v4`.

  Đề xuất: AI Service đọc câu thêm tay qua view `core.v_ai_manual_questions` (`bank_id`, `question_id`, `type`, `skill`, `difficulty`, `stem`, `status`), chỉ cho ngân hàng chưa khóa. Vector của đề tính trong bộ nhớ lúc bắt đầu job, không ghi vào `ai.embeddings`.
- [ ] **AC-10** — **Giao diện.**
  - Trung tâm: nút "Thêm câu" và "Import file" ở mục "Câu hỏi" của tab "Ngân hàng câu hỏi".
  - HR: tab "Câu hỏi của công ty" (đề xuất `?tab=questions`) trên trang JD, có danh sách câu và cùng hai nút.
  - Form thêm câu chuyển giữa trắc nghiệm và tự luận. Rubric thêm hoặc bớt được tiêu chí; tổng điểm chỉ để hiển thị.
  - Hộp thoại import có ba bước: tải file mẫu → chọn file → bảng xem trước, lỗi tô theo ô. Nút "Lưu N câu" chỉ bật khi không còn lỗi.
  - Ngân hàng đã khóa: chỉ xem, có ghi chú lý do. Trạng thái rỗng khi chưa có câu.
  - Dùng được ở 360 / 768 / 1024 px; chuỗi tiếng Việt.

## Tasks

- [ ] **TASK-4.13.1** — Shared (AC: 1, 2, 3, 8)
  - [ ] Subtask 4.13.1.1 — `packages/shared/schemas/`: schema câu thêm tay, request/response xem trước và lưu, `QUESTION_SOURCES`, cột file mẫu; mã lỗi ở `errors.ts`.
- [ ] **TASK-4.13.2** — DB (AC: 6, 8, 9)
  - [ ] Subtask 4.13.2.1 — Migration theo AC-6, AC-8, AC-9 (cột, CHECK, trigger, view, quyền của `ai_service`); `db:generate`.
- [ ] **TASK-4.13.3** — Hàm thuần ở `apps/api/src/modules/assessment/domain/` (AC: 2, 4)
  - [ ] Subtask 4.13.3.1 — Đọc dòng (nhãn tiếng Việt → enum, A–D → vị trí đáp án, cặp Tiêu chí/Điểm → rubric) và kiểm ô, giới hạn, trùng. Trả lỗi theo (dòng, cột, mã).
- [ ] **TASK-4.13.4** — API (AC: 1, 3, 4, 5, 6, 7)
  - [ ] Subtask 4.13.4.1 — Thêm `exceljs` (đã có ở ARCH › *Thư viện chính*) để tạo file mẫu và đọc `.xlsx`/`.csv`. Kiểm bản CommonJS (LESSONS §9). Nếu exceljs không đọc được CSV đúng như AC-4 thì hỏi trước khi thêm thư viện khác.
  - [ ] Subtask 4.13.4.2 — Service riêng trong `assessment` (file mẫu, xem trước, lưu, danh sách của HR); controller `@Roles('HR', 'CENTER')`, kiểm công ty qua `JdService.get` như `review-sample.controller.ts`, upload qua `SingleFileUpload()`; response US-4.11 thêm nguồn và người thêm; `api:sync`.
  - [ ] Subtask 4.13.4.3 — "Kiểm câu bằng AI" (US-4.10) bỏ qua câu thêm tay, vì `draft_ids` chỉ có câu AI.
- [ ] **TASK-4.13.5** — ai-service (AC: 9)
  - [ ] Subtask 4.13.5.1 — `app/agents/test_generator/source.py` đọc view; `tools.py` đếm độ phủ và kiểm trùng cả câu thêm tay; prompt `test_generator/v4`, cập nhật `active.json`.
- [ ] **TASK-4.13.6** — Web (AC: 10)
  - [ ] Subtask 4.13.6.1 — Đọc `DESIGN.md` và skill shadcn trước khi code; ghi `Design applied: …`.
  - [ ] Subtask 4.13.6.2 — Form và hộp thoại import dùng chung cho `features/center/question-bank/` và trang JD của HR.
  - [ ] Subtask 4.13.6.3 — Người dùng kiểm tay theo checklist ở *Implementation notes*.
- [ ] **TASK-4.13.7** — Test (AC: 1–9)
  - [ ] Subtask 4.13.7.1 — Unit: hàm đọc dòng và hàm kiểm ở `domain/` (mỗi nhánh một ca); `superRefine` của schema shared.
  - [ ] Subtask 4.13.7.2 — Integration `question-bank.int-spec.ts`: mỗi AC 1, 3–8 một ca thành công và ca lỗi chính (IDOR, lưu tất cả hoặc không, `409`, CHECK, trigger); `ai-service-role.int-spec.ts`: quyền của view.
  - [ ] Subtask 4.13.7.3 — pytest `test_test_generator.py`: câu thêm tay được đếm vào độ phủ, câu mới trùng gần nghĩa bị loại, đề nằm trong `untrusted`.
- [ ] **TASK-4.13.8** — Tài liệu (AC: 8, 9)
  - [ ] Subtask 4.13.8.1 — ARCH › *Các bảng chính* (`questions`), *Pipeline › Test Generator*, *Phân vùng schema* (view), *API architecture*; DESIGN §6 nếu có mẫu mới (bảng xem trước import); FR-42.

## Dev notes

### Architecture constraints

- AGENTS › Nguyên tắc 3: AI Service đọc câu thêm tay qua view. Nguyên tắc 13: chỉ module `assessment` ghi `questions`, đọc JD qua `JdService`.
- AGENTS › Nguyên tắc 6: đề do người viết vào prompt của Generator như dữ liệu. Grader vẫn nhận đề, rubric, đáp án mẫu như câu AI; rủi ro này được chấp nhận vì người thêm có tài khoản và audit, và Trung tâm xem được câu trước khi khóa.
- AGENTS › Nguyên tắc 7, 8: HR chỉ thêm và xem trong JD của công ty mình; không route nào của sinh viên trả đáp án hay rubric.
- AGENTS › Nguyên tắc 11: không thêm sau khóa và CHECK theo `source` có ràng buộc DB. [CONTEXT D50](../../CONTEXT.md): ngân hàng đã khóa chỉ đổi khi loại câu.

### Cross-story dependencies

- Builds on [US-4.11](US-4.11-question-bank-browser-and-rejection.md): mục "Câu hỏi", loại câu, `QuestionBody`, response danh sách câu.
- Builds on [US-4.9](US-4.9-question-bank-sample-review.md): route `/api/jds/{id}/question-bank/…` cho HR và CENTER, cách kiểm công ty.
- Builds on [US-4.1](US-4.1-exam-blueprint-test-generator.md), [US-4.10](US-4.10-on-demand-question-validation.md): luật của `submit_questions()`, `QUESTION_BANK_FACTORS`, độ phủ `DRAFT` + `VALIDATED` ([D60](../../CONTEXT.md)), job kiểm theo `draft_ids`.
- Sibling [US-4.6](US-4.6-appeals-and-question-error-reports.md): câu thêm tay bị báo lỗi thì loại như câu AI.

### What we explicitly did NOT do

- Không sửa câu đã lưu, và HR không loại hay rút câu. Câu sai thì Trung tâm loại (US-4.11). Làm lại khi HR cần tự sửa.
- Không đưa câu thêm tay vào "Kiểm câu bằng AI": Validator đọc `ai.question_drafts` theo `draft_ids`. Làm lại khi Trung tâm muốn AI kiểm cả câu thêm tay.
- Không kiểm trùng gần nghĩa ngay lúc thêm tay, vì embedding nằm ở AI Service; chỉ kiểm trùng nguyên văn. Generator kiểm trùng gần nghĩa ở lượt sinh sau (AC-9).
- Không lưu file import vào MinIO; audit chỉ ghi tên file và số câu.
- Không thêm câu phần C (sinh riêng cho từng sinh viên); không báo tin cho Trung tâm khi HR thêm câu.

### References

- [Source: PRD › GĐ1, GĐ5 – Sinh và tổ chức bài test › Quy trình sinh đề](../../PRD.md)
- [Source: PRD › Functional Requirements (FR-18, FR-42)](../../PRD.md#functional-requirements)
- [Source: ARCHITECTURE › Pipeline › Test Generator, Các bảng chính, API architecture, Thư viện chính](../../ARCHITECTURE.md)
- [Source: CONTEXT D49, D50, D60, D62](../../CONTEXT.md)
- [Source: Epic EPIC-4](../epics/EPIC-4.md)

## Verification commands

| AC | Command |
|---|---|
| AC-1, AC-3…AC-8 | Integration (lệnh dưới bảng) |
| AC-2, AC-4 | `pnpm --filter @srm/api test:unit` (hàm đọc dòng, hàm kiểm ở `domain/`); `pnpm --filter @srm/shared test` (schema) |
| AC-9 | `ai-service/.venv/Scripts/pytest ai-service/tests/agents/test_test_generator.py` |
| AC-10 | Kiểm tay ở 360 / 768 / 1024 px (checklist ở *Implementation notes*) |

Integration: `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/(question-bank|ai-service-role)\.' --selectProjects integration`.

## Changelog entry

### Added
- Trung tâm và HR (JD của công ty mình) tự thêm câu hỏi vào ngân hàng chưa khóa: điền form, hoặc import file `.xlsx`/`.csv` theo mẫu, có bước xem trước báo lỗi theo dòng; lưu tất cả hoặc không. Câu thêm tay dùng được ngay và được tính vào độ phủ.

### Changed
- Danh sách câu của Trung tâm ghi nguồn của câu (AI hoặc thêm tay, kèm người thêm). Test Generator đếm câu thêm tay và tránh sinh câu trùng với chúng.

**Commit**:

## Implementation notes

*(Điền khi làm story.)*

## Files modified

*(Điền khi làm story.)*

## Cross-references

- [PRD FR-42](../../PRD.md#functional-requirements)
- [Epic EPIC-4](../epics/EPIC-4.md)
- [CONTEXT D62](../../CONTEXT.md)
- [US-4.11 Xem toàn bộ câu và loại câu sai](US-4.11-question-bank-browser-and-rejection.md)
- [US-4.9 Duyệt mẫu ngân hàng câu hỏi](US-4.9-question-bank-sample-review.md)
