---
id: US-1.6
title: "Đồng ý xử lý dữ liệu và nộp CV"
epic: EPIC-1
status: backlog
priority: P0
points: 5
sprint:
version_shipped:
prd_ref: [FR-6, NFR-2]
depends_on: [US-1.4]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
external_deps: [llm_provider_data_terms]
---

## Goal

Sinh viên đọc và đồng ý điều khoản xử lý dữ liệu cá nhân, rồi nộp CV (PDF/DOCX) cho đợt đang mở và cập nhật được trước hạn. Mỗi lần cập nhật tạo một phiên bản mới, và tại mọi thời điểm chỉ có một CV hiệu lực trong một đợt. Sau story này, CV gốc nằm trên MinIO (mã hóa), bản ghi `cvs` ở trạng thái chờ phân tích, và có một sự kiện để EPIC-2 (US-2.4) gửi job phân tích. Không dữ liệu nào của sinh viên được xử lý trước khi sinh viên đồng ý.

## Background

FR-6 (UC-10, GĐ2 bước 1, 2 và 5) yêu cầu: sinh viên đồng ý điều khoản xử lý dữ liệu cá nhân; nộp và cập nhật CV PDF/DOCX; mỗi lần cập nhật tạo phiên bản mới; tối đa 1 CV hiệu lực mỗi đợt (BR-01). NFR-2 yêu cầu sinh viên đồng ý trước khi dữ liệu được xử lý và tuân thủ quy định hiện hành về bảo vệ dữ liệu cá nhân. Điều khoản theo PRD GĐ2 nêu hai việc: CV được AI phân tích, và CV được chia sẻ cho doanh nghiệp mà sinh viên được đề cử.

ARCH › *Security architecture* › *Gửi dữ liệu cho LLM*: bước phân tích CV gửi CV đầy đủ cho nhà cung cấp LLM, nên phải đọc kỹ điều khoản xử lý dữ liệu của nhà cung cấp (thời gian lưu, có dùng để huấn luyện không) và ghi vào phần đồng ý của sinh viên. Việc đọc điều khoản là việc Track B ở tuần T1–T2 ([sprints/README › Việc không phải code](../README.md)), nên story có `external_deps: [llm_provider_data_terms]`.

ARCH › *Các bảng chính*: `cvs(id, student_id, campaign_id, file_key, profile, pii, profile_masked, version, status, hidden_text_flag)` với partial unique index `(student_id, campaign_id) WHERE active`. EPIC-1 › *Cross-cutting invariants* giao BR-01 cho story này. ARCH › *Luồng nộp và phân tích CV*: `POST /api/cvs` lưu file mã hóa lên MinIO rồi trả `202 Accepted` với trạng thái đang phân tích. Phần gửi `ai.cv.parse`, trích xuất và che PII thuộc US-2.4; màn xác nhận hồ sơ năng lực thuộc US-2.6.

**Lessons applied**: none — LESSONS.md chỉ có §1 (nạp skill), không liên quan đồng ý dữ liệu hay tải file; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** sinh viên thuộc đối tượng của một đợt đang ở `INTAKE` và chưa đồng ý điều khoản, **When** mở cổng sinh viên, **Then** màn đồng ý hiện điều khoản có phiên bản: CV được AI phân tích (ghi tên nhà cung cấp LLM, thời gian nhà cung cấp lưu dữ liệu, dữ liệu có bị dùng để huấn luyện không), CV được chia sẻ cho doanh nghiệp mà sinh viên được đề cử, thời hạn lưu dữ liệu **And** khi sinh viên bấm đồng ý, hệ thống ghi sinh viên, đợt, phiên bản điều khoản và thời điểm đồng ý, có audit.
- [ ] **AC-2** — **Given** sinh viên chưa đồng ý phiên bản điều khoản hiện hành cho đợt, **When** gọi `POST /api/cvs`, **Then** API trả `403` mã `CONSENT_REQUIRED` **And** không có file nào được ghi lên MinIO, không có dòng `cvs` nào được tạo.
- [ ] **AC-3** — **Given** sinh viên đã đồng ý và đợt ở `INTAKE`, **When** gửi `POST /api/cvs` (multipart) với file PDF hoặc DOCX thật không quá 5 MB, **Then** API trả `202 Accepted` **And** file nằm trong bucket `cv-files` có mã hóa phía server **And** bản ghi `cvs` có `student_id` lấy từ token, `version = 1`, `status = PENDING_ANALYSIS`, `active = true` **And** phát sự kiện `cv.submitted` chứa `cv_id`, `cv_version` **And** không có lời gọi LLM nào.
- [ ] **AC-4** — **Given** file có đuôi `.pdf` hoặc `.docx` nhưng nội dung khác loại, hoặc file lớn hơn 5 MB, **When** nộp, **Then** API trả `415` (sai loại) hoặc `413` (quá cỡ) **And** không có gì được ghi lên MinIO hay DB.
- [ ] **AC-5** — **Given** sinh viên đã có CV hiệu lực phiên bản n trong đợt, **When** nộp CV mới trước hạn, **Then** trong cùng một giao dịch: dòng mới có `version = n + 1`, `active = true`, `status = PENDING_ANALYSIS`; dòng cũ có `active = false`; có audit **And** file cũ vẫn giữ trên MinIO **And** phát `cv.submitted` cho phiên bản mới.
- [ ] **AC-6** — **Given** partial unique index `(student_id, campaign_id) WHERE active` trên `core.cvs`, **When** chèn thẳng bằng SQL một dòng `active = true` thứ hai cho cùng sinh viên và đợt, **Then** PostgreSQL từ chối **And** hai lần nộp đồng thời của cùng một sinh viên cho ra đúng một CV hiệu lực, lần còn lại nhận `409`.
- [ ] **AC-7** — **Given** đợt không ở `INTAKE` (đã qua hạn nộp CV hoặc chưa mở), **When** sinh viên nộp hoặc cập nhật CV, **Then** API trả `409` mã `CAMPAIGN_PHASE_MISMATCH` **And** sinh viên ngoài đối tượng của đợt nhận `404`.
- [ ] **AC-8** — **Given** CV của sinh viên X, **When** X gọi `GET /api/cvs/me` hoặc lấy URL tạm của file bằng `GET /api/files/{id}/url`, **Then** X thấy các phiên bản của mình và nhận URL hết hạn sau 5 phút **And** sinh viên Y nhận `404` với CV của X **And** `HR` nhận `404` (HR chỉ được xem CV sau khi sinh viên được đề cử vào JD của công ty mình, thuộc US-5.3) **And** `CENTER` xem được.
- [ ] **AC-9** — Cổng sinh viên có màn "Hồ sơ" theo `DESIGN.md`: bước đồng ý điều khoản, tải CV (chọn file trên điện thoại được), tiến độ tải, nhãn trạng thái "Chờ phân tích", lịch sử phiên bản; báo lỗi tiếng Việt cho sai loại, quá cỡ, quá hạn; đủ bốn trạng thái rỗng, đang tải, lỗi, có dữ liệu; dùng được ở chiều rộng 360 px.

## Tasks

- [ ] **TASK-1.6.1** — Điều khoản và ghi nhận đồng ý (AC: 1, 2)
  - [ ] Subtask 1.6.1.1 — Viết nội dung điều khoản phiên bản 1 từ kết quả Track B; đặt ở `packages/shared/consent/terms-v1.md` để web hiển thị và API ghi đúng phiên bản.
  - [ ] Subtask 1.6.1.2 — `apps/api/src/modules/student/api/consent.controller.ts`: `GET /api/me/consents`, `POST /api/me/consents`; `application/consent.service.ts` ghi đồng ý và audit; export `ConsentService.hasConsent(studentId, campaignId)`.
- [ ] **TASK-1.6.2** — Migration cho BR-01 và đồng ý (AC: 1, 6)
  - [ ] Subtask 1.6.2.1 — Thêm cột `cvs.active boolean not null` và partial unique index `(student_id, campaign_id) WHERE active`.
  - [ ] Subtask 1.6.2.2 — Bảng lưu đồng ý (tên và cột chờ chốt, xem *Dev notes*); ghi mục D mới vào `docs/CONTEXT.md`.
- [ ] **TASK-1.6.3** — Nộp và cập nhật CV (AC: 3, 4, 5, 6, 7)
  - [ ] Subtask 1.6.3.1 — `apps/api/src/modules/student/api/cv.controller.ts`: `POST /api/cvs`, `GET /api/cvs/me`.
  - [ ] Subtask 1.6.3.2 — `apps/api/src/modules/student/application/cv.service.ts`: kiểm tra đồng ý, `CampaignService.assertPhase(…, ['INTAKE'])`, kiểm tra file bằng `upload-validation.ts`, lưu qua `StorageService`, đổi phiên bản trong một giao dịch, phát `cv.submitted`.
  - [ ] Subtask 1.6.3.3 — `apps/api/src/modules/student/infrastructure/cv.repository.ts`: bắt lỗi vi phạm unique index, đổi thành `409`.
- [ ] **TASK-1.6.4** — Quyền xem CV và URL tạm (AC: 8)
  - [ ] Subtask 1.6.4.1 — Thêm luật chủ sở hữu `cv:` vào `apps/api/src/common/storage/files.controller.ts` (tạo ở US-1.5): `STUDENT` chủ CV và `CENTER` được xem; `HR` bị từ chối cho đến US-5.3.
- [ ] **TASK-1.6.5** — Đọc `DESIGN.md` trước khi code giao diện; ghi dòng `Design applied: …` vào *Implementation notes* (AC: 9)
- [ ] **TASK-1.6.6** — Màn "Hồ sơ" ở cổng sinh viên (AC: 9)
  - [ ] Subtask 1.6.6.1 — `apps/web/src/features/student/profile/`: bước đồng ý, tải CV, lịch sử phiên bản.
- [ ] **TASK-1.6.7** — Test (AC: 1–8)
  - [ ] Subtask 1.6.7.1 — Integration test với PostgreSQL và MinIO thật; dùng lại fixture file của US-1.5 (`apps/api/test/fixtures/files/`), `loginAs` và fixture hai sinh viên của US-1.3.

## Dev notes

### Architecture constraints

- AGENTS › Nguyên tắc 11: BR-01 phải có ràng buộc DB (partial unique index), không chỉ kiểm trong code.
- AGENTS › Nguyên tắc 4 và NFR-3: story này không đọc nội dung CV và không tách PII. Cột `pii`, `profile_masked` do US-2.4 ghi. Hồ sơ chưa xác nhận không được chấm (BR-01), phần này thuộc US-2.6.
- AGENTS › Nguyên tắc 7: sinh viên chỉ thấy CV của mình. `student_id` luôn lấy từ token. HR không thấy CV ở story này.
- AGENTS › Nguyên tắc 13: `student` gọi `CampaignService.assertPhase` (US-1.4) và `StorageService` dùng chung (US-1.5). Story phát sự kiện `cv.submitted` thay vì gọi thẳng `aigateway`.
- AD-8 (đã hiện thực ở US-1.2): CV mới bắt đầu ở `PENDING_ANALYSIS`. Các chuyển trạng thái tiếp theo của CV (`PENDING_CONFIRMATION`, `CONFIRMED`) thuộc US-2.4, US-2.6 và đi qua `transitionTo`. Đổi cờ `active` khi có phiên bản mới không phải chuyển trạng thái, nhưng vẫn có audit trong cùng giao dịch.
- ARCH › *Lưu trữ file*: bucket `cv-files` mã hóa phía server, URL tạm 5 phút.
- **Chạm Q8:** nội dung điều khoản phụ thuộc nhà cung cấp LLM. Tạm viết theo AD-10 (Claude API) và điều khoản dữ liệu mà Track B tổng hợp. Điều khoản có phiên bản: đổi nhà cung cấp thì ra phiên bản mới và sinh viên phải đồng ý lại. Hỏi trước khi chốt.
- **Những chỗ spec thiếu, cần hỏi trước khi chốt:**
  - **Nơi lưu đồng ý.** ARCH không có bảng hay cột nào cho việc này. Đề xuất bảng `core.consents(id, student_id, campaign_id, terms_version, accepted_at)`, unique `(student_id, campaign_id, terms_version)`. Chốt xong thì ghi CONTEXT D-N.
  - **Rút lại đồng ý.** Spec không nói sinh viên có được rút lại không, và rút thì dữ liệu xử lý ra sao. Story này chưa làm.
  - **Cột `active`.** ARCH dùng `WHERE active` cho partial unique index nhưng không liệt kê cột `active`. Đề xuất cột `boolean`.
  - **Mô hình phiên bản CV.** Story đề xuất mỗi lần nộp tạo một dòng `cvs` mới (khớp partial unique index). Nhưng `match_results` và payload `ai.cv.parse` dùng cặp `cv_id` + `cv_version`, gợi ý `cv_id` cố định qua các phiên bản. Cần chốt trước khi US-2.4 và US-3.2 dựa vào.
  - **Xóa hoặc ẩn danh dữ liệu sau thời hạn lưu** (NFR-2, ARCH › *Lưu trữ file*: "sau khi đóng đợt X tháng") chưa có story nào nhận, và tham số thời hạn chưa có trong bảng GĐ0. Story này chưa làm.
  - **Thông tin học vụ.** PRD GĐ2 bước 2: nếu không tích hợp hệ thống đào tạo thì sinh viên tự khai MSSV, ngành, GPA và Trung tâm kiểm tra. Spec chưa giao việc này cho story nào. Tạm thời dữ liệu `students` đến từ tài khoản do Quản trị tạo (US-1.3).
- Tên endpoint `GET /api/cvs/me`, `GET|POST /api/me/consents` và mã lỗi `CONSENT_REQUIRED` là đề xuất theo ARCH › *API architecture*. ARCH chỉ ghi sẵn `POST /api/cvs` và `GET /api/files/{id}/url`.
- Story này không thêm mục AD mới.

### Cross-story dependencies

- Builds on [US-1.4](US-1.4-campaign-setup-and-config.md): `CampaignService.assertPhase`, đối tượng của đợt (`campaigns.config.target`).
- Builds on [US-1.5](US-1.5-company-hr-accounts-jd-posting-approval.md): `apps/api/src/common/storage/` (`StorageService`, `upload-validation.ts`, `files.controller.ts`), fixture file kiểm thử.
- Builds on [US-1.2](US-1.2-core-db-schema-transition-audit-log.md) và [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md): bảng `cvs`, vòng đời CV, `AuditService`; `@Roles()`, `loginAs`, layout `/sv`, `DESIGN.md`.
- Required by [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md): nghe `cv.submitted` để gửi `ai.cv.parse`; đọc `file_key`; ghi `profile`, `pii`, `profile_masked`, `hidden_text_flag`; chuyển `PENDING_ANALYSIS → PENDING_CONFIRMATION`.
- Required by [US-2.6](US-2.6-student-profile-confirmation.md): mở rộng màn "Hồ sơ" để xem CV bên cạnh hồ sơ năng lực; chuyển sang `CONFIRMED`.
- Required by [US-5.3](US-5.3-hr-nomination-review.md): thêm luật cho HR xem CV của sinh viên được đề cử vào `files.controller.ts`.
- Sibling [US-1.7](US-1.7-notifications-sse-email-reminders.md): cùng tuần T4, cả hai cần migration. Theo [sprints/README › Chạy song song](../README.md), story nào merge sau thì rebase rồi mới sinh migration. US-1.7 nhắc hạn nộp CV dựa trên dữ liệu `cvs` qua service đã export của module `student`.

### Performance budget

- File CV ≤ 5 MB, chặn trước khi ghi MinIO (EPIC-1 › *Performance budgets & invariants*). Kiểm chứng ở AC-4.
- URL tải CV hết hạn sau 5 phút (EPIC-1 › *Performance budgets & invariants*). Kiểm chứng ở AC-8.

### What we explicitly did NOT do

- Không trích xuất hồ sơ năng lực, không phát hiện chữ ẩn, không tách PII. Thuộc US-2.4.
- Không có màn xác nhận hồ sơ năng lực. Thuộc US-2.6.
- Không nhận ảnh (JPG/PNG). PRD nói "ảnh scan thì chạy OCR", còn ARCH đọc thẳng PDF khi là bản scan, nên story chỉ nhận PDF và DOCX. Trigger: người dùng cần nộp ảnh chụp CV.
- Không làm rút lại đồng ý và không xóa dữ liệu theo thời hạn lưu. Trigger: trả lời các câu hỏi ở *Dev notes*.
- Không quét virus bằng ClamAV. Ngoài phạm vi theo CONTEXT D20.

### References

- [Source: PRD › Functional Requirements (FR-6)](../../PRD.md#functional-requirements)
- [Source: PRD › Non-Functional Requirements (NFR-2, NFR-3)](../../PRD.md#non-functional-requirements)
- [Source: PRD › GĐ2 – Sinh viên nộp CV; Quy tắc nghiệp vụ (BR-01, BR-03); Các điểm cần chốt (Q8)](../../PRD.md)
- [Source: ARCHITECTURE › Data architecture › Các bảng chính, Lưu trữ file và thời hạn dữ liệu](../../ARCHITECTURE.md#data-architecture)
- [Source: ARCHITECTURE › Messaging and data flow › Luồng nộp và phân tích CV](../../ARCHITECTURE.md#messaging-and-data-flow)
- [Source: ARCHITECTURE › Security architecture](../../ARCHITECTURE.md#security-architecture)
- [Source: sprints/README › Việc không phải code (Track B)](../README.md)
- [Source: CONTEXT D20](../../CONTEXT.md)

## Verification commands

| AC | Command |
|---|---|
| AC-1 | `apps/api/test/integration/consent.int-spec.ts` › "NFR-2: student consent records terms version and timestamp with audit" |
| AC-2 | `apps/api/test/integration/cv-upload.int-spec.ts` › "NFR-2: upload without consent returns 403 CONSENT_REQUIRED and stores nothing" |
| AC-3 | `cv-upload.int-spec.ts` › "GĐ2: valid PDF returns 202, stored encrypted in cv-files, status PENDING_ANALYSIS, emits cv.submitted" |
| AC-4 | `cv-upload.int-spec.ts` › "GĐ2: fake .pdf returns 415 and 6 MB file returns 413 with nothing stored" |
| AC-5 | `cv-upload.int-spec.ts` › "BR-01: new upload creates version n+1 and deactivates previous version in one transaction" |
| AC-6 | `apps/api/test/integration/cv-active-constraint.int-spec.ts` › "BR-01: database rejects a second active CV for same student and campaign"; "BR-01: concurrent uploads leave exactly one active CV and one 409" |
| AC-7 | `cv-upload.int-spec.ts` › "GĐ2: upload outside INTAKE returns 409 CAMPAIGN_PHASE_MISMATCH"; "GĐ2: student outside campaign target gets 404" |
| AC-8 | `apps/api/test/integration/cv-access.int-spec.ts` › "NFR-1: student Y and HR get 404 on student X CV and file URL"; "GĐ2: presigned CV URL expires after 5 minutes" |
| AC-9 | Kiểm tay màn "Hồ sơ" ở chế độ thiết bị 360 px theo `DESIGN.md`; `/code-review` và skill shadcn ở bước Review |
| LLM | `rg -n "anthropic\|ai\.cv\.parse" apps/api/src/modules/student` không ra dòng nào |

Lệnh chạy: các file test trên chạy bằng script `pnpm test` / `pnpm --filter <package> test` do US-1.1 tạo; ghi lệnh đầy đủ vào bảng này khi US-1.1 xong (AGENTS › *Lệnh*).

## Changelog entry

### Added
- Sinh viên đồng ý điều khoản xử lý dữ liệu cá nhân (có phiên bản) trước khi nộp CV; chưa đồng ý thì không nộp được.
- Nộp và cập nhật CV PDF/DOCX (kiểm tra MIME thật, tối đa 5 MB, lưu mã hóa trên MinIO); mỗi lần cập nhật tạo phiên bản mới, CV chờ phân tích.
- Mỗi sinh viên tối đa 1 CV hiệu lực mỗi đợt, đảm bảo bằng partial unique index (BR-01).
- Màn "Hồ sơ" ở cổng sinh viên, dùng được trên điện thoại.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-6, NFR-2](../../PRD.md#functional-requirements)
- [Epic EPIC-1](../epics/EPIC-1.md)
- [CONTEXT D20](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
- `DESIGN.md` (gốc repo, tạo ở US-1.3)
