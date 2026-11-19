---
id: US-4.9
title: "Duyệt mẫu ngân hàng câu hỏi"
epic: EPIC-4
status: review
priority: P2
points: 2
sprint: sprint-2026-W47
version_shipped: 0.29.0
prd_ref: [FR-19]
depends_on: [US-4.2]
assignee: PDTnhah
commit:
created: 2026-10-07
updated: 2026-11-19
external_deps: [hr_lecturer_reviewers]
---

## Goal

Ngoài Validator, ngân hàng câu hỏi có thêm một lớp kiểm tra của người có chuyên môn. HR của doanh nghiệp (hoặc giảng viên) xem một mẫu ngẫu nhiên của ngân hàng và đánh dấu câu sai. Câu bị đánh dấu sai bị loại trước khi đến tay sinh viên. Bước này là tùy chọn: không ai duyệt thì kỳ thi vẫn chạy.

## Background

FR-19 (P2): HR hoặc giảng viên duyệt một mẫu ngẫu nhiên của ngân hàng câu hỏi (UC-22). PRD › GĐ1 bước 5: HR có thể duyệt nhanh đề mẫu (tùy chọn). PRD › GĐ5 › *Quy trình sinh đề* bước 3: (tùy chọn) HR hoặc giảng viên duyệt một mẫu ngẫu nhiên, trước bước khóa ngân hàng. PRD › *Risks* liệt kê "duyệt mẫu" là một biện pháp chống câu hỏi sai đáp án, cùng với Validator và báo lỗi của sinh viên.

ARCH › *API architecture* có `GET /api/jds/{id}/question-bank/sample` trong nhóm HR. ARCH › *Màn hình theo cổng* có màn "Duyệt đề mẫu" ở cổng HR. Story phụ thuộc người duyệt bên ngoài (`external_deps: hr_lecturer_reviewers`): theo sprints/README › *Việc không phải code (Track B)*, cần mời 2–3 người đánh giá (giảng viên, HR) từ T1–T2.

**Story refresh (2026-11-19)**: người dùng chốt các điểm mở theo đề xuất ([CONTEXT D61](../../CONTEXT.md)). Spec đổi so với bản lập story:

- Sau [D60](../../CONTEXT.md), câu `DRAFT` (chưa kiểm) cũng dùng được, nên mẫu rút từ câu `DRAFT` + `VALIDATED`, không chỉ `VALIDATED` (AC-1).
- "Seed lưu lại": seed là id của ngân hàng, không thêm cột. Vị trí của một câu trong ô chỉ phụ thuộc seed và id của câu, nên mẫu giữ nguyên qua các lần tải lại và qua các phiên bản; loại một câu chỉ thay đúng một câu của mẫu. Câu đã có người duyệt ở lại trong mẫu (câu bị báo lỗi hiện "Đã loại").
- Body của `POST …/sample/reviews` là một câu mỗi lần: `{ questionId, verdict, reason?, rowVersion? }`; `ERROR` cần `reason` và `rowVersion` của lúc mở.
- Thêm phạm vi theo yêu cầu người dùng: màn "Duyệt JD" của Trung tâm giữ JD đã duyệt (bộ lọc trạng thái, mặc định "Tất cả"), vì trước đây JD biến mất sau khi duyệt và tab "Ngân hàng câu hỏi" chỉ mở được qua link (AC-7).

**Lessons applied**: §6 (commit cả `apps/api/drizzle`), §10 (`superRefine` chạy cả khi trường khác lỗi: `whenValid`), §22 (assertion giới hạn theo ID của test), §25 (hộp thoại báo lỗi gửi `rowVersion` của lúc mở), §30 (bảng mới trong `core`: thêm vào `core-schema`, chạy `ai-service-role`), §39 (mẫu chỉ đi tới HR và Trung tâm, không có giá trị nào cho SV), §47 (kiểm CRLF), §21.

**Design applied**: DESIGN.md §6 `tabs` (tab của trang chi tiết, `forceMount`, `?tab=review`), `alert-dialog` (form lý do trong `AlertDialogContent`, nút xác nhận `destructive`, `409` đóng hộp thoại + `toast.error`), `badge`/`IconBadge` ("Đáp án đúng", "Đã xác nhận đúng" `default` + `CircleCheck`; "Đã loại", "AI đã loại" `outline` + `CircleX`; "Chưa duyệt" `outline`), `select` (bộ lọc có `aria-label`, giá trị riêng cho "Tất cả"), `alert` (cảnh báo ô thiếu câu sau khi khóa); §7 (bốn trạng thái của panel); §9 (nút "Xác nhận đúng", không dùng "OK"); §11 (đáp án đúng có cả viền `primary` lẫn badge chữ).

## Acceptance criteria

- [x] **AC-1** — **Given** HR thuộc công ty của JD và ngân hàng của JD đã có câu dùng được (`DRAFT`/`VALIDATED`, D60), **When** gọi `GET /api/jds/{id}/question-bank/sample`, **Then** nhận một mẫu ngẫu nhiên phân tầng theo các ô của ma trận, cỡ mẫu theo `campaigns.config.bank_review_sample_size` **And** mẫu được rút bằng seed tái lập được (id của ngân hàng), nên tải lại trang cho cùng mẫu **And** mỗi câu có đáp án, giải thích, rubric để người duyệt kiểm tra.
- [x] **AC-2** — HR của công ty khác gọi endpoint thì nhận `404`. `STUDENT` nhận `403`. `CENTER` xem và duyệt được mọi JD trong đợt.
- [x] **AC-3** — **Given** người duyệt có quyền, **When** gửi kết quả qua `POST /api/jds/{id}/question-bank/sample/reviews` với nhận định `OK` hoặc `ERROR` cho một câu (`ERROR` bắt buộc có lý do), **Then** kết quả lưu kèm người duyệt và thời điểm (bảng `question_reviews`), có audit **And** `ERROR` thiếu lý do hoặc câu không thuộc mẫu thì `400`.
- [x] **AC-4** — **Given** một câu bị đánh dấu `ERROR`, **When** lưu kết quả, **Then** trong cùng giao dịch câu bị loại qua `retireQuestion()` của [US-4.2](US-4.2-validator-and-question-bank-lock.md) (ngân hàng đã khóa thì tăng `version`) **And** nếu một ô không còn đủ số câu cần rút thì Cán bộ Trung tâm nhận cảnh báo trên màn ngân hàng.
- [x] **AC-5** — Không có lượt duyệt nào thì khóa ngân hàng và phòng thi vẫn chạy bình thường. Test xác nhận không bước nào chờ kết quả duyệt.
- [ ] **AC-6** — **Given** HR mở màn "Duyệt đề mẫu", **Then** thấy từng câu với phương án và đáp án đúng được tô sáng, rubric của câu tự luận, nút `Xác nhận đúng`/`Báo lỗi` kèm ô lý do, trạng thái rỗng khi ngân hàng chưa sẵn sàng; chuỗi tiếng Việt. *(Đã code; chờ người dùng kiểm tay ở 768 / 1024 px.)*
- [ ] **AC-7** — **Given** Trung tâm đã duyệt một JD, **When** mở màn "Duyệt JD", **Then** JD vẫn hiện (bộ lọc trạng thái mặc định "Tất cả", có cột trạng thái, JD chờ duyệt xếp đầu) và mở được trang chi tiết với tab "Ngân hàng câu hỏi", "Duyệt đề mẫu". *(Đã code; chờ người dùng kiểm tay.)*

## Tasks

- [x] **TASK-4.9.1** — Hàm thuần rút mẫu (AC: 1)
  - [x] Subtask 4.9.1.1 — `apps/api/src/modules/assessment/domain/review-sample.ts`: rút mẫu phân tầng theo ô, thứ tự trong ô theo hash của seed và id câu; unit test tính tất định.
- [x] **TASK-4.9.2** — API duyệt mẫu (AC: 1, 2, 3)
  - [x] Subtask 4.9.2.1 — `apps/api/src/modules/assessment/api/review-sample.controller.ts`: `GET` mẫu, `POST` kết quả; `@Roles('HR', 'CENTER')`, kiểm công ty của JD qua `JdService.get` của `company`.
  - [x] Subtask 4.9.2.2 — Migration `0044_question_reviews` (`id`, `question_id`, `bank_version`, `reviewer_id`, `verdict`, `reason`, `reviewed_at`).
- [x] **TASK-4.9.3** — Loại câu bị báo lỗi (AC: 4, 5)
  - [x] Subtask 4.9.3.1 — `apps/api/src/modules/assessment/application/review-sample.service.ts`: gọi `retireQuestion()` (nay nhận `tx`); cảnh báo cho `CENTER` ở thẻ "Khóa ngân hàng" của tab ngân hàng.
- [x] **TASK-4.9.4** — Màn "Duyệt đề mẫu" (AC: 6)
  - [x] Subtask 4.9.4.1 — Đọc `DESIGN.md` trước khi code, ghi `Design applied: …` vào story.
  - [x] Subtask 4.9.4.2 — `apps/web/src/features/jds/question-review/` (dùng chung cho tab "Duyệt đề mẫu" ở cổng HR và cổng Trung tâm).
  - [ ] Subtask 4.9.4.3 — Người dùng kiểm tay theo checklist ở *Implementation notes*.
- [x] **TASK-4.9.5** — Test (AC: 1, 2, 3, 4, 5)
  - [x] Subtask 4.9.5.1 — `apps/api/test/integration/review-sample.int-spec.ts`: `loginAs` theo vai trò cho test IDOR.
- [x] **TASK-4.9.6** — Màn "Duyệt JD" giữ JD đã duyệt (AC: 7)
  - [x] Subtask 4.9.6.1 — `apps/web/src/features/center/jd-approval/jd-approval-list-page.tsx`: bộ lọc trạng thái, cột trạng thái, nút "Xem" cho JD đã duyệt.

## Dev notes

### Architecture constraints

- [AD-8](../../ARCHITECTURE.md#architecture-decisions): loại câu là chuyển trạng thái, đi qua `transitionTo` + audit; ngân hàng đã khóa thì tăng phiên bản (FR-18).
- AGENTS › Nguyên tắc 7: HR chỉ thấy dữ liệu thuộc JD của công ty mình.
- AGENTS › Nguyên tắc 8: đáp án chỉ hiện cho người duyệt (`HR`, `CENTER`), không bao giờ qua API của sinh viên.
- Không dùng LLM ở bước này; người duyệt quyết định.
- Điểm mở đã chốt ở [CONTEXT D61](../../CONTEXT.md): giảng viên dùng tài khoản `CENTER`; duyệt cả trước và sau khi khóa; ô thiếu câu chỉ cảnh báo, không sinh câu thay; cỡ mẫu là tham số đợt; bảng `question_reviews`.

### Cross-story dependencies

- Builds on [US-4.2](US-4.2-validator-and-question-bank-lock.md): `retireQuestion()`, kiểm độ phủ, màn ngân hàng ở cổng Trung tâm.
- Builds on [US-4.1](US-4.1-exam-blueprint-test-generator.md): `question_banks.blueprint` để phân tầng mẫu.
- Builds on [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md) và [US-1.5](US-1.5-company-hr-accounts-jd-posting-approval.md): vai trò HR, công ty của JD.
- Sibling [US-4.6](US-4.6-appeals-and-question-error-reports.md), [US-4.11](US-4.11-question-bank-browser-and-rejection.md): cùng loại câu bằng `retireQuestion()`; cảnh báo ô thiếu câu sau khi khóa dùng chung.
- Sibling [US-4.3](US-4.3-exam-room.md): câu bị loại ở đây không còn được rút trong phòng thi (qua `getDrawableQuestions()`).

### References

- [Source: PRD › GĐ1 – Doanh nghiệp đăng JD, GĐ5 – Sinh và tổ chức bài test](../../PRD.md)
- [Source: PRD › Functional Requirements (FR-19)](../../PRD.md#functional-requirements)
- [Source: ARCHITECTURE › API architecture, Các bảng chính, Màn hình theo cổng](../../ARCHITECTURE.md)
- [Source: Epic EPIC-4](../epics/EPIC-4.md)

## Verification commands

| AC | Command |
|---|---|
| AC-1 | `pnpm --filter @srm/api exec jest --testPathPatterns 'review-sample'` (unit `domain/__tests__/review-sample.spec.ts` › `GĐ5 AC-1 sample stratified by cell, same seed same sample`); integration `test/integration/review-sample.int-spec.ts` › `GĐ5 AC-1 HR of the JD company gets a stratified sample with answer keys` |
| AC-2 | `review-sample.int-spec.ts` › `BR-11 AC-2 HR of another company gets 404, STUDENT 403` |
| AC-3 | `review-sample.int-spec.ts` › `FR-19 AC-3 a review is stored with its reviewer and audited`; `packages/shared/schemas/__tests__/question-review.spec.ts` (luật `ERROR` cần lý do) |
| AC-4, AC-5 | `review-sample.int-spec.ts` › `FR-19 AC-4 AC-5 an ERROR on a locked bank retires the question and raises the version`; `FR-19 Invariant 11 the database refuses …` |
| AC-6, AC-7 | Kiểm tay (checklist ở *Implementation notes*) |

Integration: `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/(review-sample|core-schema|ai-service-role|question-bank-lock|campaign\.)' --selectProjects integration`.

## Changelog entry

### Added
- HR (hoặc giảng viên qua tài khoản Trung tâm) duyệt một mẫu ngẫu nhiên, phân tầng theo ma trận đề, của ngân hàng câu hỏi; câu bị báo lỗi bị loại khỏi ngân hàng và tăng phiên bản nếu ngân hàng đã khóa.

### Changed
- Màn "Duyệt JD" của Trung tâm giữ JD đã duyệt (bộ lọc trạng thái).

**Commit**:

## Implementation notes

2026-11-19, một phiên (Plan + Execute + Self-verify + Doc/Version gate), nhánh `us-4.9` từ `dev` `c5d71fa`.

- **Rút mẫu** (`drawReviewSample`): mỗi ô xếp câu theo hash(seed, id); các ô lần lượt góp một câu mỗi vòng, phần B (tự luận) trước rồi phần A, thứ tự ô trong mỗi phần theo hash(seed, khóa ô). Mẫu nhỏ hơn số ô vẫn có câu tự luận. Ứng viên = câu dùng được + câu đã có người duyệt (mọi trạng thái), nên câu bị báo lỗi giữ chỗ trong mẫu và hiện "Đã loại"; câu bị loại bằng đường khác (phúc khảo, US-4.11) thì được thay.
- **Ghi**: khóa dòng ngân hàng (`FOR UPDATE`) rồi tính lại mẫu trong giao dịch, nên "câu không thuộc mẫu" (`400 VALIDATION_FAILED`, `path: questionId`) xét theo mẫu hiện tại. Câu trong mẫu nhưng đã `RETIRED`/`REJECTED`: `409 QUESTION_NOT_REVIEWABLE` (mã lỗi mới). `rowVersion` cũ: `409 ROW_VERSION_CONFLICT` từ `transitionTo`. Đợt đóng/hủy: `409` qua `assertNotFinal`. `retireQuestion` nhận `tx` tùy chọn.
- **AC-5**: test AC-4 khóa ngân hàng khi chưa có lượt duyệt nào; `lock()`, `getDrawableQuestions()` không đọc `question_reviews`.
- **AC-4 cảnh báo**: `ShortAfterLockAlert` trong thẻ "Khóa ngân hàng" khi ô có `usable < min`; `destructive` khi `usable < needed` (phòng thi trả `409 EXAM_BANK_INCOMPLETE` cho bài chưa bắt đầu).
- **Integration test** ở file mới `review-sample.int-spec.ts` (như `manual-grading.int-spec.ts` của US-4.5), không thêm vào `question-bank-lock`: tính năng có route, vai trò và bảng riêng.
- **Giới hạn đã biết**: ô thiếu câu sau khi khóa không sửa được trên giao diện (không mở lại, không sinh câu thay; D61). Thông báo cho Trung tâm (chuông, email) chưa có. Màn "Duyệt JD" lọc trạng thái ở web (API `GET /api/jds` chỉ nhận một `status`).

**Self-verify** (2026-11-19): `pnpm typecheck`, `pnpm lint`, `pnpm depcruise`, unit API 622/622, shared 406/406, `pnpm --filter @srm/web build`, integration `review-sample` + `core-schema` + `ai-service-role` + `question-bank-lock` + `campaign` 69/69 xanh. Chưa chạy cả bộ `pnpm test`, chưa `/code-review`.

**Checklist kiểm tay (AC-6, AC-7)**, sau `db:migrate` `0044`:

1. Trung tâm › Duyệt JD: JD vừa duyệt vẫn trong danh sách, cột "Trạng thái", nút "Xem"; bộ lọc "Chờ duyệt" / "Đã duyệt" / "Tất cả" đổi đúng; trạng thái rỗng theo bộ lọc.
2. Trung tâm › JD đã duyệt › tab "Duyệt đề mẫu" (`?tab=review`): tóm tắt "Đã duyệt x/n câu", phần A rồi B; câu trắc nghiệm có đáp án đúng viền `primary` + badge "Đáp án đúng"; câu tự luận có "Đáp án mẫu", rubric và tổng điểm.
3. HR của công ty › JD đã duyệt › tab "Duyệt đề mẫu": cùng mẫu với Trung tâm; "Xác nhận đúng" → badge "Đã xác nhận đúng", nút biến mất; "Báo lỗi" → hộp thoại bắt buộc lý do, gửi → toast, câu thành "Đã loại" kèm lý do.
4. Ngân hàng đã khóa: báo lỗi một câu ở ô vừa đủ 3× → tab "Ngân hàng câu hỏi" có cảnh báo ô thiếu câu, phiên bản tăng.
5. JD chưa có câu: trạng thái rỗng "Chưa có câu hỏi để duyệt". 768 / 1024 px: không cuộn ngang, nút xuống dòng gọn.

Lessons: none new — bảng mới trong `core`, `superRefine` và `rowVersion` của form đã có ở §30, §10, §25.

## Files modified

- `packages/shared/schemas/`: `question-review.ts` (mới), `campaign.ts` (`bank_review_sample_size`), `errors.ts`, `index.ts`, test.
- `apps/api/src/db/schema/assessment.ts`, `apps/api/drizzle/0044_question_reviews.sql` + `meta/`.
- `apps/api/src/modules/assessment/`: `domain/review-sample.ts` + test, `application/review-sample.service.ts`, `api/review-sample.controller.ts`, `infrastructure/question-reviews.repository.ts`, `question-banks.repository.ts`, `question-bank.service.ts` (`retireQuestion` nhận `tx`), `dto.ts`, `audit-actions.ts`, module; `common/errors/domain-error.ts`.
- `apps/api/test/integration/`: `review-sample.int-spec.ts` (mới), `core-schema.int-spec.ts`.
- `apps/web/src/`: `features/jds/question-review/` (mới), `features/hr/jds/hr-jd-pages.tsx`, `features/center/jd-approval/`, `features/center/question-bank/question-bank-panel.tsx`, `features/center/campaigns/labels.ts`, `shared/api/` (`errors.ts`, `openapi.json`, `schema.d.ts`).
- Tài liệu: CONTEXT D61, PRD (tham số, FR-19, bảng story), ARCH (`question_reviews`, API), EPIC-4, W47, CHANGELOG, VERSION.

## Cross-references

- [PRD FR-19](../../PRD.md#functional-requirements)
- [Epic EPIC-4](../epics/EPIC-4.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D61](../../CONTEXT.md)
- [US-4.2 Validator và khóa ngân hàng](US-4.2-validator-and-question-bank-lock.md)
- [US-4.6 Phúc khảo và báo lỗi câu hỏi](US-4.6-appeals-and-question-error-reports.md)
- [US-4.11 Xem toàn bộ câu và loại câu sai](US-4.11-question-bank-browser-and-rejection.md)
