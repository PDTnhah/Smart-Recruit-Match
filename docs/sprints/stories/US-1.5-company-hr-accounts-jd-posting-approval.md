---
id: US-1.5
title: "Doanh nghiệp, tài khoản HR, đăng và duyệt JD"
epic: EPIC-1
status: backlog
priority: P0
points: 8
sprint:
version_shipped:
prd_ref: [FR-3, FR-4, FR-5]
depends_on: [US-1.2, US-1.3]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Cán bộ Trung tâm khai báo doanh nghiệp tham gia và mời HR. HR nhận lời mời, đặt mật khẩu, rồi đăng JD bằng form hoặc bằng file PDF/DOCX, kèm vị trí, chỉ tiêu, địa điểm, hình thức, thời gian và phụ cấp. Cán bộ Trung tâm duyệt JD. Sau story này, JD có trong hệ thống với file gốc lưu mã hóa trên MinIO và trạng thái chờ phân tích. EPIC-2 (US-2.3) chỉ cần nhận sự kiện JD đã nộp để chạy JD Analyzer. Lớp lưu file và kiểm tra file tải lên ở đây được US-1.6 dùng lại cho CV.

## Background

FR-3 (UC-02) yêu cầu quản lý doanh nghiệp tham gia đợt, mời và cấp tài khoản HR. FR-4 (UC-20, GĐ1 bước 1) yêu cầu HR đăng JD theo form hoặc file PDF/DOCX, kèm vị trí, chỉ tiêu, địa điểm, hình thức (onsite/hybrid/remote), thời gian thực tập, phụ cấp. FR-5 (UC-03, GĐ1 bước 4) yêu cầu Cán bộ Trung tâm duyệt JD theo hai tiêu chí: nội dung hợp lệ, chỉ tiêu hợp lý. BR-02: JD chỉ được chấm phù hợp và mở test khi HR đã xác nhận yêu cầu chuẩn hóa *và* Trung tâm đã duyệt.

Vòng đời JD theo PRD: *Nháp → Chờ HR xác nhận yêu cầu → Chờ Trung tâm duyệt → Đã duyệt → Đang tuyển → Đủ chỉ tiêu | Đóng*. Bảng chuyển có từ US-1.2. Phân tích JD bằng AI (GĐ1 bước 2) và màn HR xác nhận yêu cầu chuẩn hóa (bước 3) thuộc US-2.3. Sinh ngân hàng câu hỏi (bước 5) thuộc US-4.1. EPIC-1 không gọi LLM: story này chỉ lưu dữ liệu gốc và giữ JD ở trạng thái chờ phân tích (EPIC-1 › *Business context*).

ARCH › *Các module*: module `company` lo doanh nghiệp, JD, yêu cầu chuẩn hóa, phiên bản JD. ARCH › *Security architecture* › *Tải file*: kiểm tra MIME thật, không tin phần mở rộng, tối đa 5 MB. ARCH › *Lưu trữ file*: bucket `jd-files` bật mã hóa phía server, tải qua URL tạm có hạn 5 phút. Thư viện theo ARCH › *Thư viện chính*: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, multer, file-type.

**Lessons applied**: none — LESSONS.md chỉ có §1 (nạp skill), không liên quan doanh nghiệp, JD hay lưu file; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** người gọi là `CENTER`, **When** tạo doanh nghiệp bằng `POST /api/companies` (tên, lĩnh vực, địa chỉ, người liên hệ) hoặc sửa bằng `PATCH /api/companies/{id}`, **Then** thay đổi được lưu và có audit **And** người gọi có vai trò khác nhận `403`.
- [ ] **AC-2** — **Given** một doanh nghiệp đã có, **When** `CENTER` gọi `POST /api/companies/{id}/hr-invitations` với email và họ tên, **Then** hệ thống tạo tài khoản `HR` gắn `company_id`, chưa có mật khẩu, kèm một token mời có hạn **And** phát sự kiện `hr.invited` (US-1.7 gửi email từ sự kiện này) **And** response trả về đường dẫn mời để Trung tâm gửi tay khi chưa có email **And** email đã có tài khoản thì trả `409`.
- [ ] **AC-3** — **Given** một token mời hợp lệ, **When** HR gửi token và mật khẩu mới tới `POST /api/auth/accept-invitation`, **Then** mật khẩu được đặt và HR đăng nhập được **And** token đã dùng, hết hạn hoặc sai chữ ký bị từ chối `422` mã `INVITATION_INVALID`.
- [ ] **AC-4** — **Given** HR đã đăng nhập và đợt ở `INTAKE`, **When** HR gửi `POST /api/jds` dạng JSON (đợt, vị trí, chỉ tiêu là số nguyên dương, địa điểm, hình thức `ONSITE`/`HYBRID`/`REMOTE`, thời gian thực tập, phụ cấp nếu có, nội dung mô tả), **Then** JD được tạo ở `DRAFT`, `version = 1` **And** `company_id` lấy từ token của HR, không lấy từ body **And** đợt không ở `INTAKE` thì trả `409` mã `CAMPAIGN_PHASE_MISMATCH` (qua `CampaignService.assertPhase` của US-1.4).
- [ ] **AC-5** — **Given** HR nộp JD kèm file (multipart), **When** file là PDF hoặc DOCX thật và không quá 5 MB, **Then** file được lưu vào bucket `jd-files` có mã hóa phía server và `file_key` được ghi vào JD **And** file có phần mở rộng `.pdf` nhưng nội dung không phải PDF bị từ chối `415` **And** file lớn hơn 5 MB bị từ chối `413` trước khi ghi vào MinIO **And** không có lời gọi LLM nào.
- [ ] **AC-6** — **Given** JD ở `DRAFT`, **When** HR sửa bằng `PATCH /api/jds/{id}` (kèm `row_version`) rồi nộp bằng `POST /api/jds/{id}/submit`, **Then** JD chuyển `DRAFT → PENDING_HR_CONFIRMATION` qua `transitionTo` (có audit) **And** phát sự kiện `jd.submitted` **And** nộp JD chưa có nội dung mô tả lẫn file thì trả `422` mã `TRANSITION_CONDITION_FAILED` **And** sửa JD đã rời `DRAFT` qua endpoint này thì trả `409` **And** `row_version` lệch thì trả `409`.
- [ ] **AC-7** — **Given** JD ở `PENDING_APPROVAL` (trong test, JD được tạo sẵn ở trạng thái này bằng helper của US-1.2, vì bước HR xác nhận yêu cầu thuộc US-2.3), **When** `CENTER` gọi `POST /api/jds/{id}/approve` kèm `row_version`, **Then** JD chuyển `PENDING_APPROVAL → APPROVED` qua `transitionTo` (có audit) **And** phát sự kiện `jd.approved` **And** duyệt JD ở trạng thái khác trả `422` mã `INVALID_TRANSITION` **And** `HR` hoặc `STUDENT` gọi thì nhận `403` **And** hai lần duyệt đồng thời chỉ một lần thành công, lần kia nhận `409`.
- [ ] **AC-8** — **Given** HR của công ty A và một JD của công ty B, **When** HR của A đọc, sửa, nộp JD đó hoặc lấy URL file của nó, **Then** API trả `404` **And** `GET /api/jds` của HR chỉ trả JD của công ty mình **And** `STUDENT` gọi các endpoint JD của HR và Trung tâm thì nhận `403`.
- [ ] **AC-9** — **Given** JD có file, **When** HR của công ty đó hoặc `CENTER` gọi `GET /api/files/{id}/url`, **Then** API trả URL ký sẵn của MinIO, hết hạn sau 5 phút **And** dùng URL sau 5 phút thì MinIO từ chối.
- [ ] **AC-10** — Giao diện tiếng Việt theo `DESIGN.md`, đủ bốn trạng thái rỗng, đang tải, lỗi, có dữ liệu:
  - Cổng Trung tâm có màn "Doanh nghiệp" (danh sách, tạo/sửa, mời HR, sao chép đường dẫn mời) và màn "Duyệt JD" (danh sách JD chờ duyệt theo đợt, chi tiết JD, xem file gốc, nút duyệt có xác nhận).
  - Cổng HR có màn "JD của tôi" (danh sách kèm trạng thái, form nhập tay hoặc tải file, nút nộp). JD đã nộp mà chưa có yêu cầu chuẩn hóa thì hiện nhãn "Chờ phân tích".
  - Có trang nhận lời mời để đặt mật khẩu.

## Tasks

- [ ] **TASK-1.5.1** — Lớp lưu file dùng chung (AC: 5, 9)
  - [ ] Subtask 1.5.1.1 — `apps/api/src/common/storage/storage.service.ts`: client S3 trỏ tới MinIO; tạo bucket `jd-files`, `cv-files` nếu chưa có, bật mã hóa mặc định; `putObject` có mã hóa phía server; `presignGet(key, 300)`.
  - [ ] Subtask 1.5.1.2 — `apps/api/src/common/storage/upload-validation.ts`: kiểm tra MIME bằng `file-type` (PDF, DOCX) và giới hạn 5 MB; cấu hình multer với `limits.fileSize`.
  - [ ] Subtask 1.5.1.3 — `apps/api/src/common/storage/files.controller.ts`: `GET /api/files/{id}/url`, kiểm quyền theo chủ sở hữu file.
- [ ] **TASK-1.5.2** — Doanh nghiệp và lời mời HR (AC: 1, 2, 3)
  - [ ] Subtask 1.5.2.1 — `apps/api/src/modules/company/api/company.controller.ts`, `application/company.service.ts`, `infrastructure/company.repository.ts`.
  - [ ] Subtask 1.5.2.2 — `apps/api/src/modules/iam/application/invitation.service.ts`: tạo user `HR`, ký token mời, nhận lời mời; `company` gọi qua service đã export của `iam`.
  - [ ] Subtask 1.5.2.3 — Phát `hr.invited` qua `@nestjs/event-emitter`.
- [ ] **TASK-1.5.3** — Đăng và nộp JD (AC: 4, 5, 6, 8)
  - [ ] Subtask 1.5.3.1 — `packages/shared/schemas/job-description.ts`: Zod schema form JD dùng chung cho web và API.
  - [ ] Subtask 1.5.3.2 — `apps/api/src/modules/company/api/jd.controller.ts`: `POST /api/jds`, `GET /api/jds`, `GET /api/jds/{id}`, `PATCH /api/jds/{id}`, `POST /api/jds/{id}/submit`.
  - [ ] Subtask 1.5.3.3 — `apps/api/src/modules/company/application/jd.service.ts`: phạm vi theo công ty, `assertPhase`, `transitionTo` + guard, phát `jd.submitted`.
  - [ ] Subtask 1.5.3.4 — Migration thêm cột cho các trường FR-4 còn thiếu ở ARCH (sau khi được trả lời, xem *Dev notes*).
- [ ] **TASK-1.5.4** — Duyệt JD (AC: 7, 8)
  - [ ] Subtask 1.5.4.1 — `POST /api/jds/{id}/approve` trong `jd.controller.ts`; guard của BR-02 (yêu cầu chuẩn hóa đã được HR xác nhận); phát `jd.approved`.
- [ ] **TASK-1.5.5** — Đọc `DESIGN.md` trước khi code giao diện; ghi dòng `Design applied: …` vào *Implementation notes* (AC: 10)
- [ ] **TASK-1.5.6** — Màn hình (AC: 10)
  - [ ] Subtask 1.5.6.1 — `apps/web/src/features/center/companies/`, `apps/web/src/features/center/jd-approval/`.
  - [ ] Subtask 1.5.6.2 — `apps/web/src/features/hr/jds/`; `apps/web/src/features/auth/accept-invitation-page.tsx`.
- [ ] **TASK-1.5.7** — Test (AC: 1–9)
  - [ ] Subtask 1.5.7.1 — Integration test với PostgreSQL và MinIO thật qua testcontainers; fixture file `apps/api/test/fixtures/files/` (PDF thật, DOCX thật, file giả đuôi `.pdf`, file 6 MB).
  - [ ] Subtask 1.5.7.2 — Test IDOR dùng `loginAs` và fixture hai công ty của US-1.3.

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

| AC | Command |
|---|---|
| AC-1 | `apps/api/test/integration/company.int-spec.ts` › "FR-3: center creates and updates company with audit; other roles get 403" |
| AC-2 | `company.int-spec.ts` › "FR-3: center invites HR, emits hr.invited and returns invite link"; "FR-3: inviting an existing email returns 409" |
| AC-3 | `apps/api/test/integration/invitation.int-spec.ts` › "FR-3: HR accepts invitation and can log in"; "FR-3: reused or expired invitation returns 422 INVITATION_INVALID" |
| AC-4 | `apps/api/test/integration/jd.int-spec.ts` › "GĐ1: HR creates JD in DRAFT with company from token"; "GĐ1: creating JD outside INTAKE returns 409 CAMPAIGN_PHASE_MISMATCH" |
| AC-5 | `apps/api/test/integration/jd-upload.int-spec.ts` › "GĐ1: real PDF and DOCX are stored encrypted in jd-files"; "GĐ1: fake .pdf returns 415"; "GĐ1: 6 MB file returns 413 and nothing is written to MinIO" |
| AC-6 | `jd.int-spec.ts` › "GĐ1: submit moves DRAFT to PENDING_HR_CONFIRMATION with audit and emits jd.submitted"; "GĐ1: submit without content returns 422"; "GĐ1: edit after submit returns 409" |
| AC-7 | `apps/api/test/integration/jd-approval.int-spec.ts` › "BR-02: center approves PENDING_APPROVAL JD with audit and emits jd.approved"; "BR-02: approving JD in other state returns 422"; "BR-02: concurrent approvals yield one 409" |
| AC-8 | `apps/api/test/integration/jd-access.int-spec.ts` › "BR-11: HR of company A gets 404 on company B JD and its file"; "BR-11: HR list contains only own company JDs" |
| AC-9 | `apps/api/test/integration/files-url.int-spec.ts` › "GĐ1: presigned JD file URL expires after 5 minutes" (đồng hồ ký URL được điều khiển trong test) |
| AC-10 | Kiểm tay các màn ở AC-10 theo `DESIGN.md`; `/code-review` và skill shadcn ở bước Review |
| LLM | `rg -n "anthropic\|ai\.jd\.analyze" apps/api/src/modules/company` không ra dòng nào |

Lệnh chạy: các file test trên chạy bằng script `pnpm test` / `pnpm --filter <package> test` do US-1.1 tạo; ghi lệnh đầy đủ vào bảng này khi US-1.1 xong (AGENTS › *Lệnh*).

## Changelog entry

### Added
- Trung tâm quản lý doanh nghiệp và mời HR; HR nhận lời mời và đặt mật khẩu.
- HR đăng JD bằng form hoặc file PDF/DOCX (kiểm tra MIME thật, tối đa 5 MB, lưu mã hóa trên MinIO), sửa bản nháp và nộp; JD chờ phân tích.
- Trung tâm duyệt JD; mọi thao tác nộp và duyệt có nhật ký và chống ghi đè đồng thời.
- Tải file qua URL tạm có hạn 5 phút; HR chỉ thấy JD của công ty mình.
- Màn "Doanh nghiệp", "Duyệt JD" ở cổng Trung tâm và "JD của tôi" ở cổng HR.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-3, FR-4, FR-5](../../PRD.md#functional-requirements)
- [Epic EPIC-1](../epics/EPIC-1.md)
- [CONTEXT D8, D20](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
- `DESIGN.md` (gốc repo, tạo ở US-1.3)
