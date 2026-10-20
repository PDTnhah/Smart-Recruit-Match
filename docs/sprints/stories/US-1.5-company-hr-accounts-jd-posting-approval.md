---
id: US-1.5
title: "Doanh nghiệp, tài khoản HR, đăng và duyệt JD"
epic: EPIC-1
status: review
priority: P0
points: 8
sprint: sprint-2026-W43
version_shipped: 0.4.0
prd_ref: [FR-3, FR-4, FR-5]
arch_ref: [AD-6, AD-8]
depends_on: [US-1.2, US-1.3, US-1.4]
assignee: PDTnhah
commit: c0ceee41f7478279e6d72c137e8d40b0f9aeeaa3
created: 2026-10-07
updated: 2026-10-13
---

## Story refresh — 2026-10-13

Đọc lại story ngày 2026-10-13 trên nhánh `us-1.5`, tách từ `dev` sau khi US-1.4 merge. Các quyết định dưới đây được chốt vào story, số AC giữ nguyên ([CONTEXT D28](../../CONTEXT.md)).

**Sprint và version:** story vào `sprint-2026-W42`, version 0.4.0.

**Người dùng chốt bảy điểm mở ở *Dev notes*:**

- **Mốc M1:** dùng dữ liệu seed, không thêm cạnh tắt.
  - `dev-seed` thêm một JD ở `PENDING_APPROVAL`, có `requirements` mẫu, để demo màn "Duyệt JD".
  - Test duyệt tạo JD sẵn ở trạng thái này.
- **Lúc JD rời `DRAFT`:** khi HR nộp, JD chuyển ngay `DRAFT → PENDING_HR_CONFIRMATION`. US-2.3 AC-4 phải sửa: chỉ lưu `requirements`, không chuyển trạng thái.
- **Từ chối JD:** Trung tâm chỉ duyệt, không có cạnh trả về.
- **Cột FR-4:** `job_descriptions` thêm `location`, `work_mode` (CHECK `ONSITE`/`HYBRID`/`REMOTE`), `internship_period`, `allowance` và `file_name` (tên file gốc để hiển thị).
- **Doanh nghiệp:** doanh nghiệp do Trung tâm tạo coi như đã duyệt. Doanh nghiệp tham gia một đợt khi có JD trong đợt đó.
- **Token mời:**
  - JWT với `aud = hr-invite`, hạn 7 ngày, không có bảng mới.
  - Chỉ dùng được một lần, vì sau khi đặt mật khẩu thì `password_hash` không còn rỗng.
  - Mời lại một email đã là HR **chưa kích hoạt của cùng công ty** thì cấp link mới thay vì trả `409`. Nhờ vậy link hết hạn vẫn thay được.
- **File:**
  - `{id}` của `GET /api/files/{id}/url` có dạng `<owner>:<id>` (`jd:12`).
  - File JD gửi qua endpoint riêng `PUT /api/jds/{id}/file` (multipart, kèm `rowVersion`), sau khi tạo JD bằng `POST /api/jds` dạng JSON.

**Quyết định kỹ thuật:**

- **Bucket:**
  - Tên cố định theo ARCH: `jd-files`, `cv-files`. Bỏ biến `MINIO_BUCKET`, vì API chưa từng đọc nó.
  - Service `minio` cần `MINIO_KMS_SECRET_KEY`, nếu không thì mã hóa phía server không chạy. Đã thử trên image Chainguard ngày 2026-10-13: object ghi vào có `Encryption: SSE-S3`.
  - `MINIO_PUBLIC_ENDPOINT` (không bắt buộc) là host trình duyệt dùng. URL ký sẵn được ký với host này.
- **Thư viện:**
  - `@aws-sdk/client-s3` và `@aws-sdk/s3-request-presigner` ghim 3.1142.0.
  - `file-type` ghim 16.5.4, vì từ bản 17 gói chỉ có ESM, Jest của API không nạp được (LESSONS §9).
  - multer dùng qua `FileInterceptor` của `@nestjs/platform-express`.
- **Kiểm quyền file:** `FileAccessRegistry` ở `common/storage`. Mỗi module đăng ký resolver cho loại file của mình, cùng mẫu cổng `StudentAudienceLookup` ở D27.
- **Pha của đợt:** mọi thao tác ghi JD của HR (tạo, sửa, tải file, nộp) gọi `assertPhase(…, ['INTAKE'])`. Thao tác duyệt không kiểm pha.
- **Guard duyệt (BR-02):** `requirements` phải có, mã lý do `REQUIREMENTS_NOT_CONFIRMED`.
- **Lời mời:**
  - Đường dẫn mời là `/accept-invitation#<token>`, nên token không đi vào log của server.
  - Nhận lời mời xong thì HR đăng nhập luôn.
- **Mã lỗi mới:** `INVITATION_INVALID` (422), `UNSUPPORTED_FILE_TYPE` (415), `FILE_TOO_LARGE` (413), `JD_NOT_EDITABLE` (409).
- **File 6 MB trong test:** sinh lúc chạy test, không commit vào `test/fixtures/files/`.

## Goal

Cán bộ Trung tâm khai báo doanh nghiệp tham gia và mời HR. HR nhận lời mời, đặt mật khẩu, rồi đăng JD bằng form hoặc bằng file PDF/DOCX, kèm vị trí, chỉ tiêu, địa điểm, hình thức, thời gian và phụ cấp. Cán bộ Trung tâm duyệt JD. Sau story này, JD có trong hệ thống với file gốc lưu mã hóa trên MinIO và trạng thái chờ phân tích. EPIC-2 (US-2.3) chỉ cần nhận sự kiện JD đã nộp để chạy JD Analyzer. Lớp lưu file và kiểm tra file tải lên ở đây được US-1.6 dùng lại cho CV.

## Background

FR-3 (UC-02) yêu cầu quản lý doanh nghiệp tham gia đợt, mời và cấp tài khoản HR. FR-4 (UC-20, GĐ1 bước 1) yêu cầu HR đăng JD theo form hoặc file PDF/DOCX, kèm vị trí, chỉ tiêu, địa điểm, hình thức (onsite/hybrid/remote), thời gian thực tập, phụ cấp. FR-5 (UC-03, GĐ1 bước 4) yêu cầu Cán bộ Trung tâm duyệt JD theo hai tiêu chí: nội dung hợp lệ, chỉ tiêu hợp lý. BR-02: JD chỉ được chấm phù hợp và mở test khi HR đã xác nhận yêu cầu chuẩn hóa *và* Trung tâm đã duyệt.

Vòng đời JD theo PRD: *Nháp → Chờ HR xác nhận yêu cầu → Chờ Trung tâm duyệt → Đã duyệt → Đang tuyển → Đủ chỉ tiêu | Đóng*. Bảng chuyển có từ US-1.2. Phân tích JD bằng AI (GĐ1 bước 2) và màn HR xác nhận yêu cầu chuẩn hóa (bước 3) thuộc US-2.3. Sinh ngân hàng câu hỏi (bước 5) thuộc US-4.1. EPIC-1 không gọi LLM: story này chỉ lưu dữ liệu gốc và giữ JD ở trạng thái chờ phân tích (EPIC-1 › *Business context*).

ARCH › *Các module*: module `company` lo doanh nghiệp, JD, yêu cầu chuẩn hóa, phiên bản JD. ARCH › *Security architecture* › *Tải file*: kiểm tra MIME thật, không tin phần mở rộng, tối đa 5 MB. ARCH › *Lưu trữ file*: bucket `jd-files` bật mã hóa phía server, tải qua URL tạm có hạn 5 phút. Thư viện theo ARCH › *Thư viện chính*: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, multer, file-type.

**Lessons applied**:
- §2: xem `git diff --stat` sau `koni-docs sync`.
- §4: MinIO trong testcontainers dùng cùng image Chainguard ghim digest như compose.
- §6: story duy nhất sinh migration trong đợt; sinh sau khi rebase lên US-1.4.
- §7: hàm Drizzle dùng chung khai kiểu cụ thể.
- §8: `shadcn add` thì ghim lại bản gói và đọc lại file sinh ra.
- §9: kiểm `npm view <gói> type` trước khi thêm gói; vì vậy `file-type` ghim bản 16 (CommonJS).
- §10: kiểm tra chéo trường dùng `superRefine(fn, { when })`.

## Acceptance criteria

- [x] **AC-1** — **Given** người gọi là `CENTER`, **When** tạo doanh nghiệp bằng `POST /api/companies` (tên, lĩnh vực, địa chỉ, người liên hệ) hoặc sửa bằng `PATCH /api/companies/{id}`, **Then** thay đổi được lưu và có audit **And** người gọi có vai trò khác nhận `403`.
- [x] **AC-2** — **Given** một doanh nghiệp đã có, **When** `CENTER` gọi `POST /api/companies/{id}/hr-invitations` với email và họ tên, **Then** hệ thống tạo tài khoản `HR` gắn `company_id`, chưa có mật khẩu, kèm một token mời có hạn **And** phát sự kiện `hr.invited` (US-1.7 gửi email từ sự kiện này) **And** response trả về đường dẫn mời để Trung tâm gửi tay khi chưa có email **And** email đã có tài khoản thì trả `409`.
- [x] **AC-3** — **Given** một token mời hợp lệ, **When** HR gửi token và mật khẩu mới tới `POST /api/auth/accept-invitation`, **Then** mật khẩu được đặt và HR đăng nhập được **And** token đã dùng, hết hạn hoặc sai chữ ký bị từ chối `422` mã `INVITATION_INVALID`.
- [x] **AC-4** — **Given** HR đã đăng nhập và đợt ở `INTAKE`, **When** HR gửi `POST /api/jds` dạng JSON (đợt, vị trí, chỉ tiêu là số nguyên dương, địa điểm, hình thức `ONSITE`/`HYBRID`/`REMOTE`, thời gian thực tập, phụ cấp nếu có, nội dung mô tả), **Then** JD được tạo ở `DRAFT`, `version = 1` **And** `company_id` lấy từ token của HR, không lấy từ body **And** đợt không ở `INTAKE` thì trả `409` mã `CAMPAIGN_PHASE_MISMATCH` (qua `CampaignService.assertPhase` của US-1.4).
- [x] **AC-5** — **Given** HR nộp JD kèm file (multipart), **When** file là PDF hoặc DOCX thật và không quá 5 MB, **Then** file được lưu vào bucket `jd-files` có mã hóa phía server và `file_key` được ghi vào JD **And** file có phần mở rộng `.pdf` nhưng nội dung không phải PDF bị từ chối `415` **And** file lớn hơn 5 MB bị từ chối `413` trước khi ghi vào MinIO **And** không có lời gọi LLM nào.
- [x] **AC-6** — **Given** JD ở `DRAFT`, **When** HR sửa bằng `PATCH /api/jds/{id}` (kèm `row_version`) rồi nộp bằng `POST /api/jds/{id}/submit`, **Then** JD chuyển `DRAFT → PENDING_HR_CONFIRMATION` qua `transitionTo` (có audit) **And** phát sự kiện `jd.submitted` **And** nộp JD chưa có nội dung mô tả lẫn file thì trả `422` mã `TRANSITION_CONDITION_FAILED` **And** sửa JD đã rời `DRAFT` qua endpoint này thì trả `409` **And** `row_version` lệch thì trả `409`.
- [x] **AC-7** — **Given** JD ở `PENDING_APPROVAL` (trong test, JD được tạo sẵn ở trạng thái này bằng helper của US-1.2, vì bước HR xác nhận yêu cầu thuộc US-2.3), **When** `CENTER` gọi `POST /api/jds/{id}/approve` kèm `row_version`, **Then** JD chuyển `PENDING_APPROVAL → APPROVED` qua `transitionTo` (có audit) **And** phát sự kiện `jd.approved` **And** duyệt JD ở trạng thái khác trả `422` mã `INVALID_TRANSITION` **And** `HR` hoặc `STUDENT` gọi thì nhận `403` **And** hai lần duyệt đồng thời chỉ một lần thành công, lần kia nhận `409`.
- [x] **AC-8** — **Given** HR của công ty A và một JD của công ty B, **When** HR của A đọc, sửa, nộp JD đó hoặc lấy URL file của nó, **Then** API trả `404` **And** `GET /api/jds` của HR chỉ trả JD của công ty mình **And** `STUDENT` gọi các endpoint JD của HR và Trung tâm thì nhận `403`.
- [x] **AC-9** — **Given** JD có file, **When** HR của công ty đó hoặc `CENTER` gọi `GET /api/files/{id}/url`, **Then** API trả URL ký sẵn của MinIO, hết hạn sau 5 phút **And** dùng URL sau 5 phút thì MinIO từ chối.
- [ ] **AC-10** — Giao diện tiếng Việt theo `DESIGN.md`, đủ bốn trạng thái rỗng, đang tải, lỗi, có dữ liệu:
  - Cổng Trung tâm có màn "Doanh nghiệp" (danh sách, tạo/sửa, mời HR, sao chép đường dẫn mời) và màn "Duyệt JD" (danh sách JD chờ duyệt theo đợt, chi tiết JD, xem file gốc, nút duyệt có xác nhận).
  - Cổng HR có màn "JD của tôi" (danh sách kèm trạng thái, form nhập tay hoặc tải file, nút nộp). JD đã nộp mà chưa có yêu cầu chuẩn hóa thì hiện nhãn "Chờ phân tích".
  - Có trang nhận lời mời để đặt mật khẩu.

## Tasks

- [x] **TASK-1.5.1** — Lớp lưu file dùng chung (AC: 5, 9)
  - [x] Subtask 1.5.1.1 — `apps/api/src/common/storage/storage.service.ts`: client S3 trỏ tới MinIO; tạo bucket `jd-files`, `cv-files` nếu chưa có, bật mã hóa mặc định; `putObject` có mã hóa phía server; `presignGet(key, 300)`.
  - [x] Subtask 1.5.1.2 — `apps/api/src/common/storage/upload-validation.ts`: kiểm tra MIME bằng `file-type` (PDF, DOCX) và giới hạn 5 MB; cấu hình multer với `limits.fileSize`.
  - [x] Subtask 1.5.1.3 — `apps/api/src/common/storage/files.controller.ts`: `GET /api/files/{id}/url`, kiểm quyền theo chủ sở hữu file.
- [x] **TASK-1.5.2** — Doanh nghiệp và lời mời HR (AC: 1, 2, 3)
  - [x] Subtask 1.5.2.1 — `apps/api/src/modules/company/api/company.controller.ts`, `application/company.service.ts`, `infrastructure/company.repository.ts`.
  - [x] Subtask 1.5.2.2 — `apps/api/src/modules/iam/application/invitation.service.ts`: tạo user `HR`, ký token mời, nhận lời mời; `company` gọi qua service đã export của `iam`.
  - [x] Subtask 1.5.2.3 — Phát `hr.invited` qua `@nestjs/event-emitter`.
- [x] **TASK-1.5.3** — Đăng và nộp JD (AC: 4, 5, 6, 8)
  - [x] Subtask 1.5.3.1 — `packages/shared/schemas/job-description.ts`: Zod schema form JD dùng chung cho web và API.
  - [x] Subtask 1.5.3.2 — `apps/api/src/modules/company/api/jd.controller.ts`: `POST /api/jds`, `GET /api/jds`, `GET /api/jds/{id}`, `PATCH /api/jds/{id}`, `POST /api/jds/{id}/submit`.
  - [x] Subtask 1.5.3.3 — `apps/api/src/modules/company/application/jd.service.ts`: phạm vi theo công ty, `assertPhase`, `transitionTo` + guard, phát `jd.submitted`.
  - [x] Subtask 1.5.3.4 — Migration thêm cột cho các trường FR-4 còn thiếu ở ARCH (sau khi được trả lời, xem *Dev notes*).
- [x] **TASK-1.5.4** — Duyệt JD (AC: 7, 8)
  - [x] Subtask 1.5.4.1 — `POST /api/jds/{id}/approve` trong `jd.controller.ts`; guard của BR-02 (yêu cầu chuẩn hóa đã được HR xác nhận); phát `jd.approved`.
- [x] **TASK-1.5.5** — Đọc `DESIGN.md` trước khi code giao diện; ghi dòng `Design applied: …` vào *Implementation notes* (AC: 10)
- [x] **TASK-1.5.6** — Màn hình (AC: 10)
  - [x] Subtask 1.5.6.1 — `apps/web/src/features/center/companies/`, `apps/web/src/features/center/jd-approval/`.
  - [x] Subtask 1.5.6.2 — `apps/web/src/features/hr/jds/`; `apps/web/src/features/auth/accept-invitation-page.tsx`.
- [x] **TASK-1.5.7** — Test (AC: 1–9)
  - [x] Subtask 1.5.7.1 — Integration test với PostgreSQL và MinIO thật qua testcontainers; fixture file `apps/api/test/fixtures/files/` (PDF thật, DOCX thật, file giả đuôi `.pdf`, file 6 MB).
  - [x] Subtask 1.5.7.2 — Test IDOR dùng `loginAs` và fixture hai công ty của US-1.3.

## Dev notes

### Architecture constraints

- AD-8 (đã hiện thực ở US-1.2): nộp và duyệt JD đi qua `transitionTo`, có audit, chống ghi đè bằng `row_version`. ARCH › *Các bảng chính* đã có `job_descriptions.row_version`.
- AGENTS › Nguyên tắc 1 và 2: story này không gọi LLM. Duyệt JD là quyết định của người.
- AGENTS › Nguyên tắc 6: nội dung JD và file JD là dữ liệu. Story này chỉ lưu, không đưa vào prompt.
- AGENTS › Nguyên tắc 7: HR chỉ thấy JD của công ty mình. `company_id` luôn lấy từ token, kiểm tra cấp bản ghi trong service bằng helper của US-1.3.
- AGENTS › Nguyên tắc 13: `company` gọi `CampaignService.assertPhase` (US-1.4) và `InvitationService` của `iam` qua service đã export. Story phát sự kiện `jd.submitted`, `jd.approved`, `hr.invited` thay vì gọi thẳng module `aigateway`, `assessment`, `notification`.
- ARCH › *Lưu trữ file*: MinIO, bucket `jd-files` mã hóa phía server, URL tạm 5 phút. Không lưu file trong DB. MinIO cần cấu hình KMS thì mã hóa phía server mới chạy (VD biến `MINIO_KMS_SECRET_KEY`). Biến mới phải ghi ở `docs/SETUP.md`, `DEPLOY.md`, `.env.example` trong cùng commit (RULE-11).
- **Những chỗ spec thiếu hoặc mâu thuẫn, cần hỏi trước khi chốt:**
  - **Thứ tự duyệt so với mốc M1.** Vòng đời JD buộc HR xác nhận yêu cầu chuẩn hóa (US-2.3, tuần T5) trước khi Trung tâm duyệt, trong khi mốc M1 (cuối T4) ghi "HR đăng JD được duyệt". Chỉ với EPIC-1 thì không đi được tới `PENDING_APPROVAL` bằng giao diện. Story này không tự thêm cạnh tắt: test duyệt dùng JD tạo sẵn ở `PENDING_APPROVAL`. Cần chốt: chấp nhận M1 bằng dữ liệu seed, hay thêm một cạnh tạm.
  - **Lúc JD rời `DRAFT`.** PRD không có trạng thái "chờ phân tích". Story này chuyển `DRAFT → PENDING_HR_CONFIRMATION` ngay khi HR nộp; JD chưa có `requirements` thì hiện nhãn "Chờ phân tích". Bản nháp hiện tại của US-2.3 (AC-4) lại chuyển *Nháp → Chờ HR xác nhận yêu cầu* khi nhận kết quả phân tích. Hai story phải thống nhất một cách trước khi làm US-2.3.
  - **Trung tâm từ chối hoặc trả JD về.** Vòng đời JD ở PRD không có cạnh này, nên story chỉ làm "duyệt".
  - **Các trường của FR-4 không có cột ở ARCH.** `job_descriptions` thiếu địa điểm, hình thức, thời gian thực tập, phụ cấp. Đề xuất thêm `location text`, `work_mode` (`ONSITE`/`HYBRID`/`REMOTE`), `internship_period text`, `allowance text`.
  - **"Duyệt doanh nghiệp"** (PRD › *Personas*, ARCH › *Màn hình theo cổng*) không có trạng thái hay cột nào ở `companies`, cũng không có luồng doanh nghiệp tự đăng ký. Đề xuất: doanh nghiệp do Trung tâm tạo coi như đã duyệt.
  - **"Doanh nghiệp tham gia đợt"** (FR-3) không có bảng nối doanh nghiệp với đợt. Đề xuất: doanh nghiệp tham gia một đợt khi có JD trong đợt đó.
  - **Token mời.** Đề xuất ký bằng `@nestjs/jwt` với `purpose = hr-invite`, hạn 7 ngày. Token chỉ dùng được một lần vì sau khi đặt mật khẩu thì `password_hash` không còn rỗng. Cách này không cần bảng mới.
  - **`{id}` của `GET /api/files/{id}/url`.** ARCH không có bảng `files`. Đề xuất `{id}` có dạng `<owner_type>:<owner_id>` (VD `jd:12`, `cv:457`).
- Tên endpoint `PATCH /api/jds/{id}`, `POST /api/jds/{id}/submit`, `POST /api/jds/{id}/approve`, `POST /api/companies…`, `POST /api/auth/accept-invitation` là đề xuất theo quy ước REST của ARCH › *API architecture*. ARCH chỉ ghi sẵn `POST /api/jds` và `GET /api/files/{id}/url`.
- Story này không thêm mục AD mới.

### Cross-story dependencies

- Builds on [US-1.2](US-1.2-core-db-schema-transition-audit-log.md): bảng `companies`, `job_descriptions`, `users`; vòng đời JD trong `packages/shared/states/job-description.ts`; `transitionTo`; helper tạo bản ghi ở trạng thái bất kỳ.
- Builds on [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md): `@Roles()`, `record-access.ts`, `loginAs`, fixture hai công ty, layout `/hr` và `/admin`, `DESIGN.md`.
- Sibling [US-1.4](US-1.4-campaign-setup-and-config.md): cùng tuần T3; dùng `CampaignService.assertPhase`. US-1.4 merge trước. Story này là story duy nhất sinh migration trong đợt T3 ([sprints/README › Chạy song song](../README.md)).
- Required by [US-1.6](US-1.6-data-consent-and-cv-upload.md): dùng `StorageService`, `upload-validation.ts`, `files.controller.ts` cho CV.
- Required by [US-1.7](US-1.7-notifications-sse-email-reminders.md): nghe `hr.invited` để gửi email mời. PRD › *Thông báo* không có sự kiện "JD được duyệt", nên `jd.approved` chưa có người nhận thông báo.
- Required by [US-2.3](US-2.3-jd-analyzer-hr-requirement-confirmation.md): nghe `jd.submitted` để gửi `ai.jd.analyze`; đọc `raw_text`, `file_key`; làm cạnh `PENDING_HR_CONFIRMATION → PENDING_APPROVAL`; quản lý `requirements` và `version` (BR-18).
- Required by [US-4.1](US-4.1-exam-blueprint-test-generator.md): nghe `jd.approved` để sinh ngân hàng câu hỏi.

### Performance budget

- File tải lên ≤ 5 MB, chặn ở multer trước khi đọc hết vào bộ nhớ hay ghi MinIO (EPIC-1 › *Performance budgets & invariants*). Kiểm chứng ở AC-5.
- URL tải file hết hạn sau 5 phút. Kiểm chứng ở AC-9.

### What we explicitly did NOT do

- Không phân tích JD bằng AI, không có màn xác nhận yêu cầu chuẩn hóa. Thuộc US-2.3.
- Không sinh ngân hàng câu hỏi. Thuộc US-4.1.
- Không có luồng Trung tâm từ chối hoặc trả JD về. Trigger: trả lời câu hỏi về cạnh này ở vòng đời JD.
- Không có luồng doanh nghiệp tự đăng ký. Spec ghi tài khoản HR do Trung tâm mời.
- Không quét virus bằng ClamAV. Ngoài phạm vi theo CONTEXT D20.
- Không ghi đè tham số đợt ở cấp JD. Xem US-1.4.

### References

- [Source: PRD › Functional Requirements (FR-3, FR-4, FR-5)](../../PRD.md#functional-requirements)
- [Source: PRD › GĐ1 – Doanh nghiệp đăng JD; Vòng đời trạng thái › JD; Quy tắc nghiệp vụ (BR-02, BR-11)](../../PRD.md)
- [Source: ARCHITECTURE › Component architecture › Các module, Thư viện chính](../../ARCHITECTURE.md#component-architecture)
- [Source: ARCHITECTURE › Data architecture › Các bảng chính, Lưu trữ file và thời hạn dữ liệu](../../ARCHITECTURE.md#data-architecture)
- [Source: ARCHITECTURE › API architecture](../../ARCHITECTURE.md#api-architecture)
- [Source: ARCHITECTURE › Security architecture](../../ARCHITECTURE.md#security-architecture)
- [Source: CONTEXT D8, D20](../../CONTEXT.md)
- [Source: EPIC-1 › Cross-cutting invariants; RBAC additions](../epics/EPIC-1.md)

## Verification commands

Integration test chạy bằng `pnpm --filter @srm/api exec jest --selectProjects integration test/integration/<file>`, cần Docker. Unit test: `pnpm --filter @srm/api test:unit`, `pnpm --filter @srm/shared test`.

| AC | Command |
|---|---|
| AC-1 | `company.int-spec.ts` › "FR-3: center creates and updates company with audit; other roles get 403"; "FR-3: invalid company input returns 400; unknown company returns 404"; "FR-3: a contact patch changes only the fields it sends" |
| AC-2 | `company.int-spec.ts` › "FR-3: center invites HR, emits hr.invited and returns invite link"; "FR-3: inviting an existing email returns 409"; "FR-3: re-inviting a pending HR of the same company issues a new link (CONTEXT D28)"; "FR-3: re-inviting with a corrected name updates the account and records the change"; "FR-3: inviting into an unknown company returns 404; only the center may invite" |
| AC-3 | `invitation.int-spec.ts` › "FR-3: HR accepts invitation and can log in"; "FR-3: reused or expired invitation returns 422 INVITATION_INVALID"; "FR-3: re-inviting revokes the earlier link; only the newest one works (CONTEXT D29)"; "FR-3: a forged, malformed or access token is not an invitation"; "FR-3: two concurrent accepts of one token: only one succeeds" |
| AC-4 | `jd.int-spec.ts` › "GĐ1: HR creates JD in DRAFT with company from token"; "GĐ1: creating JD outside INTAKE returns 409 CAMPAIGN_PHASE_MISMATCH"; "GĐ1: a draft or missing campaign answers 404 alike, so HR learns nothing about it (CONTEXT D27)"; `pnpm --filter @srm/shared test` › `job-description.spec.ts` |
| AC-5 | `jd-upload.int-spec.ts` › "GĐ1: real PDF and DOCX are stored encrypted in jd-files"; "GĐ1: fake .pdf returns 415"; "GĐ1: 6 MB file returns 413 and nothing is written to MinIO"; "GĐ1: a file alone lets the JD be submitted; a new file replaces the old object"; unit `upload-validation.spec.ts`; LLM: `rg -n "anthropic\|ai\.jd\.analyze" apps/api/src/modules/company` không ra dòng nào |
| AC-6 | `jd.int-spec.ts` › "GĐ1: submit moves DRAFT to PENDING_HR_CONFIRMATION with audit and emits jd.submitted"; "GĐ1: submit without content returns 422"; "GĐ1: edit after submit returns 409"; "GĐ1: stale row_version on edit returns 409"; "GĐ1: stale row_version on submit returns 409"; unit `jd-checks.spec.ts` |
| AC-7 | `jd-approval.int-spec.ts` › "BR-02: center approves PENDING_APPROVAL JD with audit and emits jd.approved"; "BR-02: approving JD in other state returns 422"; "BR-02: approving JD without confirmed requirements returns 422"; "BR-02: HR or STUDENT approving gets 403"; "BR-02: concurrent approvals yield one 409" |
| AC-8 | `jd-access.int-spec.ts` › "BR-11: HR of company A gets 404 on company B JD and its file"; "BR-11: HR list contains only own company JDs"; "BR-11: STUDENT calling HR and center JD endpoints gets 403"; `route-guards.int-spec.ts` (mọi route mới có `@Roles`) |
| AC-9 | `files-url.int-spec.ts` › "GĐ1: HR of the company and the center get a URL that downloads the original file"; "GĐ1: presigned JD file URL expires after 5 minutes" (mốc ký lấy từ `FakeClock`); unit `content-disposition.spec.ts` |
| AC-10 | Kiểm tay (bên dưới); `pnpm --filter @srm/web typecheck && pnpm --filter @srm/web lint && pnpm build` |

Lệnh chạy toàn bộ: `pnpm typecheck && pnpm lint && pnpm test`, `pnpm depcruise && pnpm depcruise:fixture`, `pnpm --filter @srm/api db:generate && git status --porcelain apps/api/drizzle` (phải rỗng), `pnpm api:sync` (không đổi file).

**Kiểm tay AC-10.**

Chuẩn bị:
1. Thêm `MINIO_KMS_SECRET_KEY=srm-key:<openssl rand -base64 32>` vào `deploy/.env` (biến bắt buộc từ 0.4.0). Có thể xóa `MINIO_BUCKET`.
2. Chạy `docker compose -f deploy/docker-compose.yml up -d --build --wait`.
3. Seed: `docker compose -f deploy/docker-compose.yml exec -e NODE_ENV=development api node dist/db/seed/dev-seed.js`.
4. Mở `http://localhost:8080`. Mật khẩu seed là `Srm-Dev-12345`.

Các bước:
1. Đăng nhập `center@srm.local`, vào "Doanh nghiệp":
   - Bảng có Alpha và Beta.
   - Bật throttling của trình duyệt thì thấy Skeleton; dừng API thì thấy Alert có nút "Thử lại".
   - Bấm "Thêm doanh nghiệp", tạo một doanh nghiệp. Vào trang của nó, mời một HR: Alert hiện đường dẫn mời và nút "Sao chép"; bảng HR có dòng "Chưa kích hoạt".
2. Mở đường dẫn mời trong cửa sổ ẩn danh:
   - Trang "Nhận lời mời" hiện ra. Nhập hai mật khẩu khác nhau thì báo "Mật khẩu nhập lại không khớp".
   - Đặt mật khẩu xong thì vào thẳng cổng HR.
   - Mở lại đường dẫn cũ thì báo "Liên kết mời không hợp lệ…".
3. Trung tâm mở đợt mẫu (đặt đủ ba mốc).
4. HR, màn "JD của tôi":
   - Chưa có JD thì thấy Empty.
   - "Đăng JD": chọn đợt, điền các trường, chọn file PDF, rồi lưu nháp.
   - Ở trang JD: sửa một ô (chưa lưu), tải file mới. Ô vừa sửa phải còn nguyên.
   - Bấm "Nộp JD" khi còn thay đổi chưa lưu thì hộp thoại cảnh báo và chặn nộp. Lưu rồi nộp thì nhãn thành "Chờ phân tích".
   - Chọn file lớn hơn 5 MB hoặc file `.txt` thì báo lỗi ngay ở ô chọn file.
5. Trung tâm, màn "Duyệt JD":
   - JD mẫu của Alpha ở trạng thái chờ duyệt; lọc theo đợt được.
   - Trang chi tiết: bấm "Xem file gốc" mở được file của JD vừa nộp (qua `/jd-files/…` của nginx).
   - Bấm "Duyệt JD", xác nhận: nhãn thành "Đã duyệt".
6. Tài khoản `admin@srm.local`: menu không có "Doanh nghiệp" và "Duyệt JD".

## Changelog entry

### Added
- Trung tâm quản lý doanh nghiệp và mời HR. HR nhận lời mời và đặt mật khẩu. Mời lại thì link cũ hết hiệu lực.
- HR đăng JD bằng form hoặc file PDF/DOCX (kiểm tra MIME thật, tối đa 5 MB, lưu mã hóa trên MinIO), sửa bản nháp rồi nộp. JD đã nộp ở trạng thái chờ phân tích.
- Trung tâm duyệt JD. Mọi thao tác nộp và duyệt có nhật ký và chống ghi đè đồng thời.
- Tải file qua URL tạm có hạn 5 phút, qua nginx. HR chỉ thấy JD của công ty mình.
- Màn "Doanh nghiệp", "Duyệt JD" ở cổng Trung tâm; "JD của tôi" ở cổng HR; trang nhận lời mời.

**Commit**: c0ceee4 (chuỗi 10 commit 7b5b364…c0ceee4)

## Implementation notes

**2026-10-13, nhánh `us-1.5`.** Plan đã duyệt. Các quyết định chốt với người dùng ở *Story refresh* và [CONTEXT D28](../../CONTEXT.md); các quyết định sửa sau review ở [D29](../../CONTEXT.md).

Design applied: DESIGN.md
- §1: primitive shadcn trước, `className` chỉ cho bố cục.
- §3: `h1` mỗi trang, `tabular-nums` cho chỉ tiêu.
- §4: `gap-6` giữa khối, trang `max-w-3xl`, bảng hết chiều rộng.
- §5: `select` 44 px khi cảm ứng, nút gửi `w-full` dưới `sm`.
- §6: thêm `select`; badge trạng thái JD.
- §7: bốn trạng thái ở danh sách doanh nghiệp, danh sách và chi tiết JD (HR và Trung tâm), khối tài khoản HR.
- §8: React Hook Form + `zodResolver` với schema dùng chung, lỗi server gắn về từng ô, lỗi cả form bằng `Alert`.
- §9: chuỗi tiếng Việt, tên trạng thái theo PRD, "Chờ phân tích".
- §10: ngày giờ qua `lib/format.ts`.
- §11: nhãn cho `select` lọc, trạng thái có chữ.
- §12: route trong `/admin` (chỉ CENTER), `/hr`; trang `/accept-invitation` ngoài ba cổng.

Áp cho `apps/web/src/features/{center/companies,center/jd-approval,hr/jds,jds}/` và `features/auth/accept-invitation-page.tsx`.

Lessons:
- §11 mới: `testTimeout` trong `projects` bị Jest bỏ qua.
- §12 mới: drizzle `FOR UPDATE OF` với bảng của schema `core`.
- §13 mới: multer đọc tên file theo latin1.
- Bổ sung §9: `file-type` ≥ 17 chỉ có ESM.

**Lưu file (`common/storage`)**
- `StorageService`: hai `S3Client`, một gọi MinIO, một chỉ để ký URL với `MINIO_PUBLIC_ENDPOINT`.
- Bucket `jd-files`, `cv-files` được tạo và đặt SSE-S3 lúc khởi động (không chặn app), thử lại ở lần ghi.
- `SingleFileUpload()`: multer trong bộ nhớ, 5 MB, tên file UTF-8, lỗi kích thước đổi thành `413 FILE_TOO_LARGE`.
- `detectDocument()` kiểm magic bytes bằng `file-type` 16. `contentDisposition()` mã hóa tên theo RFC 5987.
- `FileAccessRegistry`: module `company` đăng ký resolver `jd` trong `onModuleInit`, nên `common` không import module nghiệp vụ.
- Đã thử SSE-S3 trên image Chainguard (cần `MINIO_KMS_SECRET_KEY`). Trong testcontainers, MinIO chạy `server /tmp/data`, vì image chạy bằng user không phải root nên không tạo được `/data`.

**Lời mời (`iam`)**
- `InvitationTokenService` đặt ở `common/auth`, dùng chung `JwtService` với access token, có `aud = hr-invite`, `nonce` và mốc lấy từ `Clock`.
- `InvitationService.accept` đặt mật khẩu bằng một câu `UPDATE … WHERE password_hash IS NULL AND invitation_nonce = $nonce`, đồng thời xóa nonce. Câu này vừa làm token chỉ dùng được một lần, vừa xử lý hai request chạy đua.
- `AuthService.issue` mở cho service cùng module, để nhận lời mời xong thì đăng nhập luôn.

**Module `company`**
- `CompanyService` gọi `InvitationService` (export của `iam`).
- `JdService`:
  - HR chỉ thao tác trên bản ghi trong phạm vi qua `assertRecordAccess` và `recordScopeWhere`.
  - Thứ tự kiểm khi sửa: phạm vi, `row_version`, `DRAFT`, rồi `assertPhase` trong giao dịch.
  - Nộp và duyệt đi qua `transitionTo` với guard thuần trong `domain/jd-checks.ts`.
  - Tải file: kiểm trước, ghi MinIO, rồi ghi DB. Giao dịch lỗi thì xóa object mới; thay file thì xóa object cũ sau khi commit.
- `JdRepository` khóa dòng JD bằng một câu riêng (LESSONS §12).
- `emitSafely()` ở `common/events` và `userActor()` ở `audit` được tách ra để dùng chung với `CampaignService`.

**Lệch so với spec**
- Đợt còn nháp trả `404` khi HR tạo JD, theo phạm vi đọc ở D27 (D29).
- File 6 MB trong test được sinh lúc chạy, không commit.
- `core-schema.int-spec.ts` đếm migration theo `_journal.json` thay vì số cứng.

**Kiểm đã chạy**
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (shared 65, API 207), `pnpm build`, `pnpm depcruise`, `pnpm depcruise:fixture`.
- `rg` LLM trong `modules/company` không ra dòng nào.
- Stack compose riêng (`srm-us15-check`, cổng khác) `up --wait` healthy. Script smoke qua nginx qua cả 17 bước:
  - mời, nhận lời mời, dùng lại link trả 422;
  - mở đợt; tạo JD có `company_id` lấy từ token;
  - tải PDF có tên tiếng Việt; file giả 415; file 5,5 MB 413;
  - URL tạm qua `localhost:<NGINX_PORT>` tải đúng từng byte;
  - nộp; duyệt JD seed; HR công ty khác nhận 404; SPA phục vụ `/accept-invitation`.
- `mc stat` xác nhận object `SSE-S3`. Request tới bucket qua nginx mà không có chữ ký trả 403.

**Review (`/code-review`)**

Đã sửa cả 10 phát hiện:
1. Mời lại không thu hồi link cũ: thêm nonce (D29).
2. URL ký với `localhost:9000` nên máy khác không mở được: nginx proxy bucket (D29).
3. Tải file làm mất phần đang sửa trong form: form giữ theo id; hộp thoại nộp chặn khi còn thay đổi chưa lưu.
4. Đợt nháp lộ trạng thái qua 409: trả 404.
5. PATCH người liên hệ xóa các trường không gửi: gộp từng trường.
6. Mời lại bỏ qua họ tên mới: cập nhật họ tên, có audit.
7. `rowVersion` rỗng trong multipart thành 0: `RowVersionFieldSchema`.
8. `filename*` chưa mã hóa `'()*`.
9. Bucket chỉ tạo ở lần ghi đầu: thêm bước tạo lúc khởi động.
10. Builder Zod bị chép ở ba file: gom vào `schemas/common.ts`.

**Chưa xong**

AC-10 cần kiểm tay trong trình duyệt theo *Verification commands*; phiên làm việc này không có trình duyệt. Story ở `review` tới khi kiểm tay xong.

## Files modified

- **`packages/shared`**:
  - mới: `schemas/{company,job-description,files,common}.ts`, `schemas/__tests__/{company,job-description}.spec.ts`;
  - sửa: `schemas/{auth,campaign,errors,index}.ts`.
- **`apps/api/src`**:
  - mới: `modules/company/**`, `common/storage/**`, `common/events/**`, `common/auth/invitation-token.service.ts`, `modules/iam/application/invitation.service.ts`, `modules/iam/domain/{events,audit-actions}.ts`;
  - sửa: `modules/iam/{api/auth.controller.ts,api/dto.ts,application/auth.service.ts,iam.module.ts,index.ts}`, `modules/audit/{domain/actor.ts,index.ts}`, `modules/campaign/application/campaign.service.ts`, `common/auth/{auth.module.ts,index.ts}`, `common/errors/domain-error.ts`, `common/config/{env.ts,env.spec.ts}`, `db/schema/{job-descriptions,users}.ts`, `db/seed/dev-seed.ts`, `openapi/export.ts`, `app.module.ts`.
- **`apps/api/drizzle`**: `0002_company_jd_invitations.sql`, `meta/0002_snapshot.json`, `meta/_journal.json`.
- **`apps/api/test`**:
  - mới: `integration/{company,invitation,jd,jd-upload,jd-approval,jd-access,files-url}.int-spec.ts`, `helpers/jd.ts`, `fixtures/files/**`, `setup/timeout.ts`;
  - sửa: `setup/{global-setup,global-teardown,images}.ts`, `integration/{core-schema,admin-users}.int-spec.ts`, `jest.config.cjs`.
- **`apps/web/src`**:
  - mới: `features/{jds,center/companies,center/jd-approval,hr/jds}/**`, `features/auth/accept-invitation-page.tsx`, `components/ui/select.tsx`;
  - sửa: `app/{router.tsx,navigation.ts}`, `shared/api/{errors.ts,openapi.json,schema.d.ts}`.
- **Gói**: `apps/api/package.json` (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` 3.1142.0, `file-type` 16.5.4), `pnpm-lock.yaml`; version 0.4.0 ở `VERSION` và các `package.json`.
- **Cấu hình**: `deploy/{docker-compose.yml,nginx.conf,.env.example}`.
- **Tài liệu**:
  - `DESIGN.md` §6, `DEPLOY.md`, `docs/SETUP.md`, `docs/ARCHITECTURE.md`;
  - `docs/CONTEXT.md` (D28, D29), `docs/LESSONS.md` (§11–§13, bổ sung §9), `docs/CHANGELOG.md`, `docs/PRD.md`;
  - `docs/sprints/` (W42, EPIC-1, STATUS; *Story refresh* ở US-1.6, US-1.7, US-2.3), `AGENTS.md`.

## Cross-references

- [PRD FR-3, FR-4, FR-5](../../PRD.md#functional-requirements)
- [Epic EPIC-1](../epics/EPIC-1.md)
- [CONTEXT D8, D20, D27, D28, D29](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
- `DESIGN.md` (gốc repo, tạo ở US-1.3)
