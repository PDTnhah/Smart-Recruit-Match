---
id: US-1.6
title: "Đồng ý xử lý dữ liệu và nộp CV"
epic: EPIC-1
status: review
priority: P0
points: 5
sprint: sprint-2026-W42
version_shipped: 0.5.0
prd_ref: [FR-6, NFR-2]
arch_ref: [AD-8, AD-10]
depends_on: [US-1.4]
assignee: PDTnhah
commit:
created: 2026-10-07
updated: 2026-10-14
external_deps: [llm_provider_data_terms]
---

## Story refresh — 2026-10-14

Đọc lại story ngày 2026-10-14 trên nhánh `us-1.6`, tách từ `dev` sau khi US-1.5 merge. Các quyết định dưới đây được chốt vào story, số AC giữ nguyên ([CONTEXT D30](../../CONTEXT.md)).

**Sprint và version:** story vào `sprint-2026-W42`, version 0.5.0. US-1.6 là story duy nhất sinh migration trong đợt; US-1.7 rebase sau.

**Người dùng chốt bốn điểm mở ở *Dev notes*:**

- **Mô hình phiên bản CV:** mỗi lần nộp một dòng `cvs` mới (id mới, `version = n + 1`, `active = true`); dòng cũ `active = false`. `cv_id` trỏ đúng một phiên bản.
- **Nơi lưu đồng ý:** bảng `core.consents(id, student_id, campaign_id, terms_version, terms_sha256, accepted_at)`, unique `(student_id, campaign_id, terms_version)`.
- **Điều khoản v1 (Q8):** agent đọc chính sách dữ liệu API hiện hành của Anthropic, viết nháp kèm nguồn; người dùng duyệt trước khi commit. Thay cho kết quả Track B (`external_deps: [llm_provider_data_terms]`).
- **Thời hạn lưu:** 12 tháng sau khi đóng đợt, số cố định trong điều khoản v1.

**Quyết định kỹ thuật:**

- **Điều khoản:** module TS `packages/shared/consent/terms-v1.ts` thay cho `terms-v1.md` (Subtask 1.6.1.1): `tsc` của shared không chép `.md` sang `dist`. Unit test ghim hash của v1.
- **Cột mới của `cvs`:** `active` (mặc định `true`) và `file_name` (tên file gốc, cần cho `Content-Disposition` khi tải). Unique `(student_id, campaign_id, version)` bên cạnh partial unique index của BR-01.
- **Đồng ý:** chỉ ghi khi đợt ở `INTAKE`; client gửi `termsVersion` đã xem, khác bản hiện hành thì `409 TERMS_OUTDATED`; đồng ý lại là idempotent.
- **Thứ tự kiểm tra của `POST /api/cvs`:** 413 → đợt không thấy (404, kể cả `DRAFT`, như D29) → sai pha (409) → chưa đồng ý (403) → sai loại (415) → ghi MinIO → giao dịch. Hai lần nộp đồng thời: lần thua `409 CV_SUBMISSION_CONFLICT`.
- **AC-7 "chưa mở":** đợt `DRAFT` trả `404` vì sinh viên không thấy đợt nháp (D27). `409` áp cho đợt đã qua `intake_end` hoặc đã sang pha sau.
- **Sự kiện `cv.submitted`:** payload camelCase `{ cvId, cvVersion, campaignId, studentId }`, như mọi sự kiện hiện có.
- **Mã lỗi mới:** `CONSENT_REQUIRED` (403), `TERMS_OUTDATED` (409), `CV_SUBMISSION_CONFLICT` (409).
- **Web:** tiến độ tải bằng `XMLHttpRequest`; thêm primitive `progress`. Màn nằm ở `/sv/cv` (mục "Hồ sơ" đã có trong menu), code ở `apps/web/src/features/student/profile/`.

## Story refresh — 2026-10-13 (từ US-1.5)

Ghi lúc US-1.5 làm xong. Khi bắt đầu story này, đọc lại ([CONTEXT D28, D29](../../CONTEXT.md)).

- **Dùng lại `apps/api/src/common/storage/`:**
  - `StorageService.put(BUCKETS.CV_FILES, key, buffer, mime)`: SSE-S3 sẵn; bucket `cv-files` đã được tạo.
  - `SingleFileUpload()` cho controller: 5 MB, tên file UTF-8 (LESSONS §13).
  - `detectDocument()` (PDF/DOCX theo magic bytes, `415` nếu sai), `displayFileName()`, `requireFile()`.
- **File của sinh viên.** Đăng ký resolver `cv` vào `FileAccessRegistry` (cùng mẫu `JdService.onModuleInit`), rồi thêm `STUDENT` vào `@Roles` của `FilesController`. Sinh viên chỉ lấy được URL file của chính mình.
- **Tải file qua nginx.** URL tạm đi qua nginx (`/cv-files/` đã được proxy). `MINIO_PUBLIC_ENDPOINT` mặc định là địa chỉ web.
- **Test.** testcontainers đã có MinIO (biến `MINIO_*` đặt ở `test/setup/global-setup.ts`). Helper ở `test/helpers/jd.ts` (`testS3`, `fixtureFile`) và fixture `test/fixtures/files/` dùng lại được.

## Goal

Sinh viên đọc và đồng ý điều khoản xử lý dữ liệu cá nhân, rồi nộp CV (PDF/DOCX) cho đợt đang mở và cập nhật được trước hạn. Mỗi lần cập nhật tạo một phiên bản mới, và tại mọi thời điểm chỉ có một CV hiệu lực trong một đợt. Sau story này, CV gốc nằm trên MinIO (mã hóa), bản ghi `cvs` ở trạng thái chờ phân tích, và có một sự kiện để EPIC-2 (US-2.4) gửi job phân tích. Không dữ liệu nào của sinh viên được xử lý trước khi sinh viên đồng ý.

## Background

FR-6 (UC-10, GĐ2 bước 1, 2 và 5) yêu cầu: sinh viên đồng ý điều khoản xử lý dữ liệu cá nhân; nộp và cập nhật CV PDF/DOCX; mỗi lần cập nhật tạo phiên bản mới; tối đa 1 CV hiệu lực mỗi đợt (BR-01). NFR-2 yêu cầu sinh viên đồng ý trước khi dữ liệu được xử lý và tuân thủ quy định hiện hành về bảo vệ dữ liệu cá nhân. Điều khoản theo PRD GĐ2 nêu hai việc: CV được AI phân tích, và CV được chia sẻ cho doanh nghiệp mà sinh viên được đề cử.

ARCH › *Security architecture* › *Gửi dữ liệu cho LLM*: bước phân tích CV gửi CV đầy đủ cho nhà cung cấp LLM, nên phải đọc kỹ điều khoản xử lý dữ liệu của nhà cung cấp (thời gian lưu, có dùng để huấn luyện không) và ghi vào phần đồng ý của sinh viên. Việc đọc điều khoản là việc Track B ở tuần T1–T2 ([sprints/README › Việc không phải code](../README.md)), nên story có `external_deps: [llm_provider_data_terms]`.

ARCH › *Các bảng chính*: `cvs(id, student_id, campaign_id, file_key, profile, pii, profile_masked, version, status, hidden_text_flag)` với partial unique index `(student_id, campaign_id) WHERE active`. EPIC-1 › *Cross-cutting invariants* giao BR-01 cho story này. ARCH › *Luồng nộp và phân tích CV*: `POST /api/cvs` lưu file mã hóa lên MinIO rồi trả `202 Accepted` với trạng thái đang phân tích. Phần gửi `ai.cv.parse`, trích xuất và che PII thuộc US-2.4; màn xác nhận hồ sơ năng lực thuộc US-2.6.

**Lessons applied**:
- §2: xem `git diff --stat` sau `koni-docs sync`.
- §6: story duy nhất sinh migration trong đợt.
- §8: `shadcn add progress` thì ghim lại bản gói và đọc lại file sinh ra.
- §9: không thêm gói mới; chạy cả integration test sau khi đổi module.
- §11: timeout của integration test đặt qua `test/setup/timeout.ts`.
- §12: khóa dòng `cvs` bằng câu không join, không dùng `.for(..., { of })`.
- §13: tải file qua `SingleFileUpload()`; tên file lọc bằng `displayFileName()`, key MinIO là UUID.

## Acceptance criteria

- [x] **AC-1** — **Given** sinh viên thuộc đối tượng của một đợt đang ở `INTAKE` và chưa đồng ý điều khoản, **When** mở cổng sinh viên, **Then** màn đồng ý hiện điều khoản có phiên bản: CV được AI phân tích (ghi tên nhà cung cấp LLM, thời gian nhà cung cấp lưu dữ liệu, dữ liệu có bị dùng để huấn luyện không), CV được chia sẻ cho doanh nghiệp mà sinh viên được đề cử, thời hạn lưu dữ liệu **And** khi sinh viên bấm đồng ý, hệ thống ghi sinh viên, đợt, phiên bản điều khoản và thời điểm đồng ý, có audit.
- [x] **AC-2** — **Given** sinh viên chưa đồng ý phiên bản điều khoản hiện hành cho đợt, **When** gọi `POST /api/cvs`, **Then** API trả `403` mã `CONSENT_REQUIRED` **And** không có file nào được ghi lên MinIO, không có dòng `cvs` nào được tạo.
- [x] **AC-3** — **Given** sinh viên đã đồng ý và đợt ở `INTAKE`, **When** gửi `POST /api/cvs` (multipart) với file PDF hoặc DOCX thật không quá 5 MB, **Then** API trả `202 Accepted` **And** file nằm trong bucket `cv-files` có mã hóa phía server **And** bản ghi `cvs` có `student_id` lấy từ token, `version = 1`, `status = PENDING_ANALYSIS`, `active = true` **And** phát sự kiện `cv.submitted` chứa `cv_id`, `cv_version` **And** không có lời gọi LLM nào.
- [x] **AC-4** — **Given** file có đuôi `.pdf` hoặc `.docx` nhưng nội dung khác loại, hoặc file lớn hơn 5 MB, **When** nộp, **Then** API trả `415` (sai loại) hoặc `413` (quá cỡ) **And** không có gì được ghi lên MinIO hay DB.
- [x] **AC-5** — **Given** sinh viên đã có CV hiệu lực phiên bản n trong đợt, **When** nộp CV mới trước hạn, **Then** trong cùng một giao dịch: dòng mới có `version = n + 1`, `active = true`, `status = PENDING_ANALYSIS`; dòng cũ có `active = false`; có audit **And** file cũ vẫn giữ trên MinIO **And** phát `cv.submitted` cho phiên bản mới.
- [x] **AC-6** — **Given** partial unique index `(student_id, campaign_id) WHERE active` trên `core.cvs`, **When** chèn thẳng bằng SQL một dòng `active = true` thứ hai cho cùng sinh viên và đợt, **Then** PostgreSQL từ chối **And** hai lần nộp đồng thời của cùng một sinh viên cho ra đúng một CV hiệu lực, lần còn lại nhận `409`.
- [x] **AC-7** — **Given** đợt không ở `INTAKE` (đã qua hạn nộp CV hoặc chưa mở), **When** sinh viên nộp hoặc cập nhật CV, **Then** API trả `409` mã `CAMPAIGN_PHASE_MISMATCH` **And** sinh viên ngoài đối tượng của đợt nhận `404`.
- [x] **AC-8** — **Given** CV của sinh viên X, **When** X gọi `GET /api/cvs/me` hoặc lấy URL tạm của file bằng `GET /api/files/{id}/url`, **Then** X thấy các phiên bản của mình và nhận URL hết hạn sau 5 phút **And** sinh viên Y nhận `404` với CV của X **And** `HR` nhận `404` (HR chỉ được xem CV sau khi sinh viên được đề cử vào JD của công ty mình, thuộc US-5.3) **And** `CENTER` xem được.
- [ ] **AC-9** — Cổng sinh viên có màn "Hồ sơ" theo `DESIGN.md`: bước đồng ý điều khoản, tải CV (chọn file trên điện thoại được), tiến độ tải, nhãn trạng thái "Chờ phân tích", lịch sử phiên bản; báo lỗi tiếng Việt cho sai loại, quá cỡ, quá hạn; đủ bốn trạng thái rỗng, đang tải, lỗi, có dữ liệu; dùng được ở chiều rộng 360 px.

## Tasks

- [x] **TASK-1.6.1** — Điều khoản và ghi nhận đồng ý (AC: 1, 2)
  - [x] Subtask 1.6.1.1 — Viết nội dung điều khoản phiên bản 1 từ kết quả Track B; đặt ở `packages/shared/consent/terms-v1.md` để web hiển thị và API ghi đúng phiên bản. *Đã làm ở `terms-v1.ts` (module TS), nội dung theo chính sách Anthropic đọc ngày 2026-10-14 ([CONTEXT D30](../../CONTEXT.md)).*
  - [x] Subtask 1.6.1.2 — `apps/api/src/modules/student/api/consent.controller.ts`: `GET /api/me/consents`, `POST /api/me/consents`; `application/consent.service.ts` ghi đồng ý và audit; export `ConsentService.hasConsent(studentId, campaignId)`.
- [x] **TASK-1.6.2** — Migration cho BR-01 và đồng ý (AC: 1, 6)
  - [x] Subtask 1.6.2.1 — Thêm cột `cvs.active boolean not null` và partial unique index `(student_id, campaign_id) WHERE active`.
  - [x] Subtask 1.6.2.2 — Bảng lưu đồng ý (tên và cột chờ chốt, xem *Dev notes*); ghi mục D mới vào `docs/CONTEXT.md`. *`core.consents`, D30; migration `0003_cv_consent`.*
- [x] **TASK-1.6.3** — Nộp và cập nhật CV (AC: 3, 4, 5, 6, 7)
  - [x] Subtask 1.6.3.1 — `apps/api/src/modules/student/api/cv.controller.ts`: `POST /api/cvs`, `GET /api/cvs/me`.
  - [x] Subtask 1.6.3.2 — `apps/api/src/modules/student/application/cv.service.ts`: kiểm tra đồng ý, `CampaignService.assertPhase(…, ['INTAKE'])`, kiểm tra file bằng `upload-validation.ts`, lưu qua `StorageService`, đổi phiên bản trong một giao dịch, phát `cv.submitted`.
  - [x] Subtask 1.6.3.3 — `apps/api/src/modules/student/infrastructure/cv.repository.ts`: bắt lỗi vi phạm unique index, đổi thành `409`.
- [x] **TASK-1.6.4** — Quyền xem CV và URL tạm (AC: 8)
  - [x] Subtask 1.6.4.1 — Thêm luật chủ sở hữu `cv:` vào `apps/api/src/common/storage/files.controller.ts` (tạo ở US-1.5): `STUDENT` chủ CV và `CENTER` được xem; `HR` bị từ chối cho đến US-5.3.
- [x] **TASK-1.6.5** — Đọc `DESIGN.md` trước khi code giao diện; ghi dòng `Design applied: …` vào *Implementation notes* (AC: 9)
- [x] **TASK-1.6.6** — Màn "Hồ sơ" ở cổng sinh viên (AC: 9)
  - [x] Subtask 1.6.6.1 — `apps/web/src/features/student/profile/`: bước đồng ý, tải CV, lịch sử phiên bản.
- [x] **TASK-1.6.7** — Test (AC: 1–8)
  - [x] Subtask 1.6.7.1 — Integration test với PostgreSQL và MinIO thật; dùng lại fixture file của US-1.5 (`apps/api/test/fixtures/files/`), `loginAs` và fixture hai sinh viên của US-1.3.

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

Integration test chạy bằng `pnpm --filter @srm/api exec jest --selectProjects integration test/integration/<file>`, cần Docker. Unit test: `pnpm --filter @srm/api test:unit` (hash của điều khoản v1 ở `modules/student/domain/__tests__/terms.spec.ts`), `pnpm --filter @srm/shared test` (`consent/__tests__/terms.spec.ts`, `schemas/__tests__/cv.spec.ts`).

Thêm vào bảng: AC-1 còn có "NFR-2: accepting again returns the first consent and writes no second audit entry", "NFR-2: a terms version other than the current one returns 409 TERMS_OUTDATED", "NFR-2: consent outside INTAKE returns 409 CAMPAIGN_PHASE_MISMATCH", "NFR-2: a DRAFT campaign and a campaign outside the target answer 404". AC-3 kiểm cả DOCX và kiểm rằng `studentId` gửi trong body bị bỏ qua. AC-8 còn có "GĐ2: student X and the center get a URL that downloads the CV". `files-url.int-spec.ts` và `jd-access.int-spec.ts` (US-1.5) sửa theo quyền xem file mới.

Lệnh chạy toàn bộ: `pnpm typecheck && pnpm lint && pnpm test`, `pnpm --filter @srm/shared test`, `pnpm build`, `pnpm depcruise && pnpm depcruise:fixture`, `pnpm --filter @srm/api db:generate && git status --porcelain apps/api/drizzle` (phải rỗng), `pnpm api:sync && git status --porcelain apps/web/src/shared/api` (phải rỗng).

**Kiểm tay AC-9.**

Chuẩn bị:
1. Chạy `docker compose -f deploy/docker-compose.yml up -d --build --wait`. Migration `0003` chạy ở service `migrate`.
2. Seed: `docker compose -f deploy/docker-compose.yml exec -e NODE_ENV=development api node dist/db/seed/dev-seed.js`.
3. Đăng nhập `center@srm.local` (mật khẩu seed `Srm-Dev-12345`), đặt đủ ba mốc cho đợt mẫu rồi mở đợt.

Các bước, ở chế độ thiết bị cảm ứng rộng 360 px (DESIGN.md §5):
1. Đăng nhập `sv001@srm.local`, mở "Hồ sơ" ở thanh dưới.
   - Bật throttling thì thấy Skeleton; dừng API thì thấy Alert có nút "Thử lại".
   - Thấy tên đợt, nhãn trạng thái, hạn nộp CV, và điều khoản phiên bản 1 đủ năm mục.
2. Bấm "Đồng ý điều khoản": toast báo đã ghi nhận; thẻ "Nộp CV" và khối "Các phiên bản đã nộp" (rỗng) hiện ra.
3. Chọn file `.txt` hoặc file lớn hơn 5 MB: lỗi hiện ngay dưới ô chọn file. Đổi đuôi một file `.txt` thành `.pdf` rồi tải: Alert "Chỉ nhận file PDF hoặc DOCX…".
4. Tải một PDF thật: thanh tiến độ và phần trăm hiện ra; xong thì phiên bản 1 có nhãn "Chờ phân tích" và "Đang dùng".
5. Tải tiếp một DOCX: tiêu đề thẻ thành "Cập nhật CV"; lịch sử có phiên bản 2 ("Đang dùng") trên phiên bản 1.
6. Bấm tên file của từng phiên bản: file mở ở tab mới qua `/cv-files/…` của nginx.
7. Không có thanh cuộn ngang ở mọi trạng thái; nút cao ≥ 44 px; tên file dài bị cắt bằng dấu ba chấm.
8. Đăng nhập `sv002@srm.local`: không thấy CV của `sv001`.
9. Kiểm "quá hạn": khi mở đợt ở bước chuẩn bị, đặt `intake_end` vài phút sau (mốc chỉ lùi về sau được, D27). Qua mốc thì tải lại "Hồ sơ": màn hiện "Đã hết hạn nộp CV", không còn thẻ tải CV, lịch sử vẫn xem được. Tải đúng lúc vừa qua mốc (trang chưa tải lại) thì Alert báo "Đã hết hạn nộp CV của đợt này…".

## Changelog entry

### Added
- Sinh viên đồng ý điều khoản xử lý dữ liệu cá nhân (có phiên bản) trước khi nộp CV; chưa đồng ý thì không nộp được.
- Nộp và cập nhật CV PDF/DOCX (kiểm tra MIME thật, tối đa 5 MB, lưu mã hóa trên MinIO); mỗi lần cập nhật tạo phiên bản mới, CV chờ phân tích.
- Mỗi sinh viên tối đa 1 CV hiệu lực mỗi đợt, đảm bảo bằng partial unique index (BR-01).
- Màn "Hồ sơ" ở cổng sinh viên, dùng được trên điện thoại.

**Commit**:

## Implementation notes

**2026-10-14, nhánh `us-1.6`.** Plan đã duyệt. Các quyết định chốt với người dùng ở *Story refresh* và [CONTEXT D30](../../CONTEXT.md).

Design applied: DESIGN.md
- §1: primitive shadcn trước; thêm `progress` bằng CLI 4.21.0, không thêm gói; `className` chỉ cho bố cục.
- §3: một `h1` mỗi trang; tiêu đề thẻ là `h2`, mục điều khoản là `h3`; phần trăm tải dùng `tabular-nums`.
- §4: `gap-6` giữa khối, `gap-2` trong nhóm; nội dung trong cột `max-w-3xl` của `StudentLayout`.
- §5: checklist 360 px: nút gửi `w-full` dưới `sm`, `Select` đợt `w-full`, tên đợt `break-words`, tên file `truncate`; không có bảng.
- §6: badge trạng thái CV (`secondary` khi chờ, `default` khi đã xác nhận, nhãn `outline` "Đang dùng"); `progress` (sửa: truyền `value` vào `Root`).
- §7: bốn trạng thái ở "Hồ sơ" và ở trang chủ cổng sinh viên (Skeleton, Alert có "Thử lại", Empty, dữ liệu); khối lịch sử có Empty riêng.
- §8: lỗi chọn file ở `FieldError` của ô; lỗi từ server ở `Alert` đầu thẻ; nút có `Spinner` khi đang gửi.
- §9: chuỗi tiếng Việt, câu lỗi nói cách xử lý; lỗi `CAMPAIGN_PHASE_MISMATCH` khi nộp CV có câu riêng "Đã hết hạn nộp CV…".
- §10: hạn nộp và giờ nộp qua `formatDateTime`.
- §11: `Progress` có `aria-label` và câu phần trăm (`aria-live`); trạng thái luôn có chữ; nút xem file có chữ "Xem file: …".
- §12: route `/sv/cv` (mục "Hồ sơ" đã có trong menu) và trang chủ `/sv` riêng cho sinh viên.

Áp cho `apps/web/src/features/student/{profile,home}/` và `apps/web/src/shared/{files,api/upload.ts}`.

**Điều khoản v1: nguồn (đọc ngày 2026-10-14)**
- [How long do you store my organization's data?](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data) (ngày trên trang: 2026-07-01):
  - Input và output của API được xóa tự động trong vòng 30 ngày.
  - Nội dung bị hệ thống an toàn gắn cờ vi phạm chính sách sử dụng được giữ tới 2 năm; điểm phân loại giữ tới 7 năm.
  - Dữ liệu có thể bị giữ lâu hơn khi luật yêu cầu.
- [Is my data used for model training?](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training) (2026-08-18): mặc định không dùng input, output của sản phẩm thương mại để huấn luyện, trừ khi khách hàng gửi phản hồi hoặc cho phép rõ ràng.
- [API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention):
  - Trang ghi "Retained data is never used for model training without your express permission".
  - Covered Models (Fable, Mythos) bắt buộc lưu 30 ngày; `claude-opus-5-5` (AD-10) không thuộc nhóm này.
  - Batch API giữ 29 ngày, vẫn trong 30 ngày.
- Câu "Hệ thống này không cho phép việc đó" chỉ đúng khi tổ chức không tham gia chương trình chia sẻ dữ liệu và không gửi phản hồi qua API. Đổi cấu hình này thì phải ra điều khoản v2.

**Module `student`**
- `ConsentService`:
  - Đồng ý tính theo đợt và phiên bản.
  - `terms_sha256` tính từ JSON chuẩn hóa của `CURRENT_TERMS` (`domain/terms.ts`).
  - Đồng ý lại thì trả bản ghi cũ. Hai lần đồng ý đồng thời: `onConflictDoNothing` rồi đọc lại.
- `CvService.submit` chép mẫu `JdService.attachFile`:
  1. Kiểm trước theo thứ tự: đợt thấy được → pha → đồng ý → MIME.
  2. Ghi MinIO.
  3. Mở giao dịch: `assertPhase` với `FOR SHARE`, khóa dòng `active` bằng `FOR UPDATE`, đặt `active = false`, chèn `version = max + 1`, ghi hai mục audit.

  Giao dịch lỗi thì xóa object mới. `CvRepository.insert` đổi lỗi trùng của `cvs_student_campaign_active_key` hoặc `cvs_student_campaign_version_key` thành `409 CV_SUBMISSION_CONFLICT`.
- Audit `CV_SUBMITTED` không ghi tên file, vì tên file thường chứa họ tên mà `audit_logs` không xóa được (sửa sau review).
- Resolver `cv` của `FileAccessRegistry` dùng `assertRecordAccess` với `studentId`. HR nhận 404 vì CV không có `companyId`.
- `StudentModule` thêm vào `AppModule.imports` (trước đây chỉ được nạp qua `IamModule`) và import `AuditModule`.

**Web**
- `postFormWithProgress` (`shared/api/upload.ts`) gửi bằng XHR:
  - Access token còn dưới 1 phút thì refresh trước khi gửi.
  - Gặp 401 thì refresh một lần rồi gửi lại.
- `ViewFileButton` và `checkDocumentFile` chuyển sang `shared/files/` để JD và CV dùng chung. `fetchJdFileUrl` thành `fetchFileUrl(id)`.
- Trang chủ `/sv` (`features/student/home/`) hiện việc cần làm: đồng ý điều khoản và nộp CV cho đợt đang nhận CV. Nút mở "Hồ sơ" kèm `?campaign=<id>` (AC-1 "khi mở cổng sinh viên", sửa sau review).

**Lệch so với spec**
- Điều khoản ở `terms-v1.ts`, không phải `terms-v1.md` (D30).
- AC-7 "chưa mở": đợt `DRAFT` trả `404`, không phải `409` (D27, D29, D30).
- Payload `cv.submitted` viết camelCase (`cvId`, `cvVersion`).
- Migration `0003` có một chỗ sửa tay: `file_name` được thêm dạng nullable, backfill `'cv'`, rồi mới `SET NOT NULL`. Nhờ vậy migration chạy được trên DB đã có dòng `cvs`.
- Hai test của US-1.5 đổi theo quyền mới:
  - Sinh viên xem file JD nhận `404` thay vì `403`.
  - Ca `cv:1` của `files-url.int-spec.ts` đổi sang một id không tồn tại.

**Kiểm đã chạy**
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (API 232 test, 39 suite), `pnpm --filter @srm/shared test` (84), `pnpm build`, `pnpm depcruise`, `pnpm depcruise:fixture`.
- `db:generate` báo "No schema changes"; `api:sync` không sinh thêm diff.
- `rg -n "anthropic|ai\.cv\.parse" apps/api/src/modules/student` không ra dòng nào.
- AC-6: test nộp đồng thời chặn cả hai request ở `lockActive` tới khi cả hai cùng tới, nên hai request thật sự chạy đua. Ra đúng `[202, 409]` cả khi chưa có CV lẫn khi đã có CV.
- Stack compose riêng (`srm-us16-check`, nginx ở cổng 28080) `up --wait` healthy; migration `0003` chạy ở service `migrate`. Script smoke qua nginx qua cả 18 bước:
  - Trung tâm đặt mốc và mở đợt seed; `sv001` thấy đợt.
  - Nộp trước khi đồng ý trả 403; đồng ý v1.
  - PDF trả 202 `PENDING_ANALYSIS`; file giả trả 415; file 5,5 MB trả 413 (từ API).
  - DOCX thành phiên bản 2; danh sách mới nhất trước, đúng một CV `active`.
  - URL tạm đi qua `/cv-files/` của nginx; file phiên bản 1 vẫn tải đúng từng byte, giữ tên tiếng Việt; request không ký trả 403.
  - `sv002` nhận 404 với file của `sv001` và không thấy CV của `sv001`; Trung tâm lấy được URL.
  - SPA phục vụ `/sv/cv`.

**Review (`/code-review`)**

Đã sửa 8 trên 10 phát hiện (gộp thành 7 mục):
1. Tên file CV nằm trong audit append-only: bỏ khỏi `after`; test kiểm không còn `fileName`.
2. Mở cổng sinh viên không thấy nhắc đồng ý điều khoản: thêm trang chủ `/sv`.
3. Thẻ tải CV giữ trạng thái cũ khi đổi đợt: thêm `key={selected.id}`, cả cho `TermsCard`.
4. Migration `NOT NULL` không có backfill: thêm `UPDATE` trước `SET NOT NULL`.
5. Token hết hạn làm upload 5 MB bị gửi hai lần: refresh trước khi gửi.
6. Regex id của trường multipart bị viết lặp: thêm `IdFieldSchema` ở `schemas/common.ts`.
7. Nút xem file CV chỉ có tên file: thêm chữ "Xem file: ".

Không sửa:
- **Đọc đợt nhiều lần trước giao dịch:** thứ tự lỗi 404 → 409 → 403 cần cố định, và lợi ích về hiệu năng nhỏ.
- **Cổng sinh viên import `features/center/campaigns`:** màn HR và màn duyệt JD đã dùng mẫu này; tách sang `features/campaigns` là một refactor riêng.
- **Tên test bắt đầu bằng `NFR-…`:** đúng theo bảng *Verification commands* của story.

Lessons: none new — các bẫy công cụ gặp ở story này (tên file latin1, `FOR UPDATE OF`, ESM, `testTimeout`) đã có ở §9, §11–§13. Review chỉ ra lỗi thiết kế (PII trong audit, migration thiếu backfill), không phải bẫy của công cụ.

**Chưa xong**

AC-9 cần kiểm tay trong trình duyệt ở 360 px theo *Verification commands*; phiên làm việc này không có trình duyệt. Story ở `review` tới khi kiểm tay xong.

## Files modified

- **`packages/shared`**:
  - mới: `consent/{index,terms,terms-v1}.ts`, `consent/__tests__/terms.spec.ts`, `schemas/{consent,cv}.ts`, `schemas/__tests__/cv.spec.ts`;
  - sửa: `index.ts`, `tsconfig.json`, `schemas/{index,errors,files,common}.ts`.
- **`apps/api/src`**:
  - mới: `modules/student/{api,domain,infrastructure}/**`, `modules/student/application/{consent.service,cv.service,current-student}.ts`, `db/schema/consents.ts`;
  - sửa: `modules/student/{student.module,index}.ts`, `db/schema/{cvs,index}.ts`, `common/errors/domain-error.ts`, `common/storage/files.controller.ts`, `app.module.ts`.
- **`apps/api/drizzle`**: `0003_cv_consent.sql`, `meta/0003_snapshot.json`, `meta/_journal.json`.
- **`apps/api/test`**:
  - mới: `integration/{consent,cv-upload,cv-active-constraint,cv-access}.int-spec.ts`, `helpers/cv.ts`;
  - sửa: `helpers/{jd,factories}.ts`, `integration/{core-schema,files-url,jd-access}.int-spec.ts`.
- **`apps/web/src`**:
  - mới: `features/student/{profile,home}/**`, `shared/files/{api.ts,check-document.ts,view-file-button.tsx}`, `shared/api/upload.ts`, `components/ui/progress.tsx`;
  - sửa: `app/router.tsx`, `features/jds/{api.ts,jd-details.tsx}`, `features/hr/jds/{file-picker,jd-file-card}.tsx`, `shared/api/{client,errors,token}.ts`, `shared/api/{openapi.json,schema.d.ts}`;
  - xóa: `features/jds/view-file-button.tsx` (chuyển sang `shared/files/`).
- **Tài liệu**: `DESIGN.md` §6, `docs/ARCHITECTURE.md`, `docs/CONTEXT.md` (D30), `docs/CHANGELOG.md`, `docs/sprints/` (W42, story, STATUS), `AGENTS.md`.

## Cross-references

- [PRD FR-6, NFR-2](../../PRD.md#functional-requirements)
- [Epic EPIC-1](../epics/EPIC-1.md)
- [CONTEXT D20, D30](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
- `DESIGN.md` (gốc repo, tạo ở US-1.3)
