# Changelog

Lịch sử phát hành của Smart Recruit Match. Mỗi commit ship code tăng `VERSION` và thêm một mục ở đây trong cùng commit (RULE-1); mục mới nhất ở trên cùng. Commit chỉ sửa tài liệu ghi vào `[Unreleased]` và không tăng version.

## [Unreleased]

---

## [0.7.0] — 2026-10-20 — Hạ tầng job AI và hợp đồng message — v0.7.0

US-2.1. Một job AI đi được trọn vòng: Core Backend gửi job qua RabbitMQ, AI Service nhận, xử lý và trả kết quả qua `ai.results`, Core Backend kiểm kết quả rồi giao cho module sở hữu. Nhận trùng không ghi trùng, lỗi tạm thời tự thử lại, lỗi lâu dài vào dead-letter queue. Quyền PostgreSQL bảo đảm AI Service chỉ đọc dữ liệu đã che PII và chỉ ghi schema `ai`. Chưa gọi LLM: handler của CV và JD trả kết quả giả cho tới US-2.3, US-2.4.

### Added
- **Hợp đồng message** (`packages/shared/contracts`, [CONTEXT D33](CONTEXT.md)):
  - Zod strict cho `ai.cv.parse` (`job_id`, `cv_id`, `cv_version`, `file_key`), `ai.jd.analyze` (`job_id`, `jd_id`, `jd_version`) và `ai.results` (`job_id`, `type`, `status`, `job`, `result`, `error`), kiểm chéo `status`/`result`/`error`.
  - `pnpm contracts:gen`: xuất JSON Schema vào `packages/shared/contracts/json-schema/`, sinh model Pydantic vào `ai-service/app/contracts/` (datamodel-code-generator 0.83.0), cùng `queues.json` cho tên queue, số lần thử, header DLQ.
  - CI sinh lại cả hai phía và báo lỗi khi lệch, kể cả khi sửa tay file đã sinh.
- **Module `aigateway`** ở Core Backend:
  - `AiGatewayService.dispatch(type, input)`: sinh `job_id`, kiểm payload, publish có confirm, phát `ai.job.dispatched`.
  - Consumer `ai.results`: message đúng thành sự kiện `ai.result.<TYPE>` cho module sở hữu, rồi `ai.job.settled`; message sai schema hoặc không phải JSON vào `ai.results.dlq`; listener lỗi được requeue một lần rồi vào DLQ.
  - Quy ước listener (upsert theo khóa tự nhiên, bỏ qua kết quả cũ, `suppressErrors: false`) và listener mẫu trong `test/helpers/ai-results.ts`.
- **Worker FastStream** (`ai-service/app/consumers`):
  - Nhận job bằng một câu SQL trên `ai.jobs`; job đã xong thì bỏ qua (idempotent theo `job_id`).
  - Lỗi tạm thời thử lại sau 2 s rồi 10 s; lần thứ 3 lỗi thì gửi `FAILED` và chuyển message sang `<queue>.dlq` kèm header lý do, số lần thử, queue gốc. `PermanentError` thất bại ngay với `needs_human`.
  - Mỗi worker chạy tối đa 8 job cùng lúc; chạy nhiều bản sao được.
- **FastAPI** của AI Service: `GET /health` trả 200 khi kết nối được PostgreSQL và RabbitMQ, ngược lại 503.
- **Cơ sở dữ liệu:**
  - Migration `0005_ai_jobs`: schema `ai`, bảng `ai.jobs` (CHECK `type`, `status`, `attempts`, `finished_at`).
  - Migration `0006_ai_views_roles`: view `core.v_ai_cv_profile_masked`, `core.v_ai_jd_requirements` (không cột PII, chỉ CV đã xác nhận và JD đã duyệt, `security_barrier`); role `api_service` (đọc ghi `core`, `audit_logs` chỉ thêm, chỉ đọc `ai`) và `ai_service` (chỉ đọc hai view, đọc ghi `ai`).
- **Docker Compose:** service `ai-worker` (FastStream, `--scale` được) và `ai-api` (`127.0.0.1:8000`), build từ `ai-service/Dockerfile`.
- **Biến môi trường:** `API_DB_PASSWORD`, `AI_DB_PASSWORD` (bắt buộc), `AI_API_HOST_PORT`; compose tự ghép `RABBITMQ_URL`, `AI_DATABASE_URL`.
- **Test:** `ai-service-role.int-spec.ts` (quyền DB, cột và bộ lọc của view theo bảng chuyển trạng thái), `ai-job-roundtrip.int-spec.ts` (RabbitMQ thật, worker build từ Dockerfile: trọn vòng, nhận trùng kết quả, nhận trùng job, 3 lần lỗi vào DLQ, lỗi không hồi phục, message sai schema), pytest cho runner, broker test của FastStream và health.

### Changed
- **API đăng nhập PostgreSQL bằng role `api_service`** thay cho tài khoản chủ; bước `migrate` vẫn dùng tài khoản chủ và đặt mật khẩu cho hai role mỗi lần chạy. Integration test cũng chạy app bằng `api_service`.
- **API cần `RABBITMQ_URL`.** Kết nối không chặn lúc khởi động; consumer gắn vào khi broker sẵn sàng.
- **AI Service** có phụ thuộc ghim chính xác: FastStream 0.7.7, FastAPI 0.142.2, uvicorn 0.54.0, Pydantic 2.13.5, psycopg 3.3.6 + psycopg-pool 3.3.3; dev: httpx 0.28.1, datamodel-code-generator 0.83.0.
- **Integration test** dựng thêm RabbitMQ và một Docker network chung (`postgres`, `rabbitmq`).
- `packages/shared/states`: thêm `reachableFrom(machine, state)`.
- `.gitattributes`: file sinh tự động và `*.sh` luôn dùng LF.
- **Tài liệu:**
  - ARCHITECTURE: *Tech stack*, *Các module*, *Thư viện chính*, *Phân vùng schema*, *Các bảng chính*, *Hàng đợi*, *Docker Compose*, *CI*.
  - DEPLOY, SETUP: biến mới, mục *AI Service và hàng đợi*, venv trên Windows.
  - CONTEXT D33; LESSONS §9 (bổ sung), §16, §17, §18.
- **Sprint:** đóng `sprint-2026-W42`, mở `sprint-2026-W43`.

### Upgrade notes
- `deploy/.env` cũ cần thêm `API_DB_PASSWORD` và `AI_DB_PASSWORD` (≥ 12 ký tự chữ, số, `-_.~`); `RABBITMQ_DEFAULT_PASS` phải an toàn trong URL.
- Chạy API ngoài Docker cần `RABBITMQ_URL`; `db:migrate` nên có hai biến mật khẩu trên để role đăng nhập được.

**Commit**: 7fbb833 (chuỗi 8 commit 9f66dcd…7fbb833)

## [0.6.0] — 2026-10-19 — Thông báo trong app, SSE, email, nhắc hạn — v0.6.0

US-1.7. Người dùng nhận thông báo theo sự kiện nghiệp vụ: trong ứng dụng ngay lúc xảy ra (Server-Sent Events, nhiều instance qua Redis pub/sub) và qua email (outbox trong PostgreSQL, tự thử lại). Sinh viên được báo khi đợt mở và được nhắc trước hạn nộp CV; HR được mời nhận email kích hoạt. Module khác báo tin bằng `NotificationService.notify` hoặc phát sự kiện. Không có lời gọi LLM nào.

### Added
- **Thông báo trong ứng dụng** (mọi vai trò, chỉ thấy của mình):
  - `GET /api/notifications`: mới nhất trước, phân trang `?before=<id>&limit=`, kèm `unreadCount`.
  - `POST /api/notifications/{id}/read` (`204`, thông báo của người khác trả `404`), `POST /api/notifications/read-all`.
- **SSE** `GET /api/events/stream`:
  - Mở bằng `fetch` kèm `Authorization: Bearer`; chưa xác thực thì `401`.
  - Sự kiện `ready`, `ping` mỗi 25 giây, `notification`; stream tự đóng khi access token hết hạn để client kết nối lại bằng token mới.
  - Redis pub/sub kênh `notify:user:{userId}`, nên nhiều instance API vẫn đẩy đúng người.
- **Email outbox:**
  - nodemailer 10.0.15 + Handlebars 4.7.10, template tiếng Việt, giờ Việt Nam, link tuyệt đối từ `WEB_ORIGIN`.
  - Worker 10 giây một lần, `FOR UPDATE SKIP LOCKED` nên hai instance không gửi trùng.
  - Lỗi SMTP thì thử lại sau 1 phút, rồi 5 phút, sau đó `FAILED` và ghi log; giao dịch nghiệp vụ không bị ảnh hưởng. Email nhắc hạn đã quá hạn lúc thử lại thì bị hủy.
  - SMTP dùng pool một kết nối, timeout ngắn (10/10/30 giây), tối đa 500 email mỗi lượt.
  - Môi trường dev xem email ở Mailpit (`http://localhost:8025`).
- **Thông báo của EPIC-1:**
  - `campaign.opened` → "Đợt thực tập đã mở" (trong app + email) cho sinh viên thuộc đối tượng của đợt.
  - `hr.invited` → email kèm link kích hoạt. Link được ký lúc gửi từ lời mời hiện tại, nên DB không lưu token và chỉ lời mời mới nhất được gửi. Mời lại thì email cũ còn chờ bị hủy; lời mời đã nhận thì không gửi.
- **Nhắc hạn nộp CV:**
  - Tác vụ 5 phút một lần (advisory lock 1701) nhắc sinh viên chưa có CV hiệu lực khi còn `reminder_hours_before` giờ trước `intake_end`.
  - Không nhắc trùng (unique `(user_id, dedupe_key)`); gia hạn mốc thì nhắc lại một lần.
  - `DeadlineReminderRegistry` cho story sau đăng ký hạn chọn NV, làm test, SLA.
- **Tham số đợt** `reminder_hours_before` (1–168 giờ, mặc định 24), có trong form cấu hình đợt.
- **Giao diện:**
  - Chuông kèm số chưa đọc ở header của cả ba cổng, cập nhật theo SSE.
  - Danh sách mở bằng popover trên desktop, sheet từ đáy màn hình trên điện thoại; đủ bốn trạng thái; bấm vào thông báo thì đánh dấu đã đọc và mở trang liên quan; "Đánh dấu tất cả đã đọc".
  - Hook `useServerEvent` (`src/shared/notifications/`) để EPIC-2, US-3.4 nghe sự kiện SSE.
- **Dữ liệu và tài liệu:**
  - Migration `0004_notifications_email_outbox`: bảng `notifications` (kênh, trạng thái email, số lần thử, lần thử sau, `dedupe_key`), CHECK, unique `(user_id, dedupe_key)`, index outbox.
  - Biến môi trường `WEB_ORIGIN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`.
  - CONTEXT D31, D32 (sửa sau code review), LESSONS §14, §15.

### Changed
- **API:**
  - `CampaignService` export thêm `listSettingsInPhase` và hàm `isInTarget`; `CampaignSettings` có `name`.
  - `StudentService.listIdsInTarget`, `CvService.studentIdsWithActiveCv`.
  - `iam` export `UserDirectory`; `InvitationService.currentInvitationLink` ký link mới cho email mời.
  - `AccessTokenService.expiresAt`; helper `errorMessage` trong `common/errors`.
- **Web:** `expectOk` trong `src/shared/api/client.ts` cho endpoint trả `204`.
- **Compose:** service `api` nhận `WEB_ORIGIN` (mặc định `http://localhost:<NGINX_PORT>`) và `SMTP_*` (mặc định gửi vào `mailpit`). `deploy/.env` cũ chạy được mà không cần sửa.
- **Tài liệu:**
  - ARCHITECTURE: *Cập nhật thời gian thực*, *Các module*, *Tác vụ định kỳ*, *Thư viện chính*, *Các bảng chính*, *Redis*, *API architecture*.
  - PRD: bảng tham số GĐ0, cột *Kênh* của bảng *Thông báo*.
  - DESIGN.md §6 (`popover`, badge "Mới" và số chưa đọc).
  - SETUP: biến cho API chạy ngoài Docker, bổ sung cả `MINIO_*` còn thiếu.
  - LESSONS §9: gói khai `"type": "module"` vẫn có thể có bản CommonJS.
- **Sprint:** US-1.7 vào `sprint-2026-W42` (kéo sớm từ W44).

**Commit**: 665439d (chuỗi 13 commit 03d3118…665439d)

---

## [0.5.0] — 2026-10-14 — Đồng ý xử lý dữ liệu và nộp CV — v0.5.0

US-1.6. Sinh viên đọc và đồng ý điều khoản xử lý dữ liệu cá nhân (có phiên bản) cho từng đợt thực tập, rồi nộp và cập nhật CV PDF/DOCX trước hạn. Mỗi lần nộp là một phiên bản mới; mỗi sinh viên chỉ có một CV hiệu lực trong một đợt, bảo đảm bằng ràng buộc DB (BR-01). CV chờ phân tích ở US-2.4. Không có lời gọi LLM nào.

### Added
- **Điều khoản xử lý dữ liệu** `packages/shared/consent/` (`TERMS_V1`, `CURRENT_TERMS`):
  - CV được phân tích bằng Claude API của Anthropic. Theo chính sách hiện hành của Anthropic (đọc ngày 2026-10-14), dữ liệu bị xóa trong vòng 30 ngày và không dùng để huấn luyện.
  - CV được chia sẻ cho doanh nghiệp mà sinh viên được đề cử.
  - Thời hạn lưu: 12 tháng sau khi đóng đợt.
  - Unit test ghim SHA-256 của v1, nên sửa điều khoản thì phải ra phiên bản mới.
- **Đồng ý** (chỉ sinh viên): `GET /api/me/consents`, `POST /api/me/consents` (`campaignId`, `termsVersion`).
  - Ghi sinh viên, đợt, phiên bản điều khoản, SHA-256 của văn bản và thời điểm đồng ý, có audit.
  - Chỉ ghi được khi đợt ở `INTAKE`. Phiên bản cũ trả `409 TERMS_OUTDATED`. Đồng ý lại thì trả bản ghi cũ.
- **Nộp CV:** `POST /api/cvs` (multipart, `202 Accepted`).
  - Kiểm theo thứ tự: quá 5 MB (`413`), đợt sinh viên không thấy (`404`), sai pha hoặc quá `intake_end` (`409 CAMPAIGN_PHASE_MISMATCH`), chưa đồng ý (`403 CONSENT_REQUIRED`), nội dung không phải PDF/DOCX (`415`). Bị từ chối thì không ghi gì vào MinIO hay DB.
  - File lưu mã hóa SSE-S3 trong `cv-files`. Mỗi lần nộp tạo một dòng `cvs` mới ở `PENDING_ANALYSIS`, dòng cũ mất `active`, file cũ giữ nguyên.
  - Hai lần nộp đồng thời: một lần thắng, lần kia nhận `409 CV_SUBMISSION_CONFLICT`.
  - Sự kiện `cv.submitted` (`cvId`, `cvVersion`, `campaignId`, `studentId`).
- **Xem CV:**
  - `GET /api/cvs/me` trả mọi phiên bản của chính sinh viên.
  - `GET /api/files/cv:{id}/url` cho sinh viên chủ CV và Trung tâm. HR nhận `404` tới khi có đề cử (US-5.3).
- **Giao diện cổng sinh viên:**
  - Màn "Hồ sơ" (`/sv/cv`): chọn đợt, đọc và đồng ý điều khoản, tải CV có thanh tiến độ, nhãn "Chờ phân tích", lịch sử phiên bản, mở file; báo lỗi tiếng Việt cho sai loại, quá cỡ, quá hạn.
  - Trang chủ `/sv` nhắc việc cần làm: đồng ý điều khoản và nộp CV cho đợt đang nhận CV.
  - Primitive mới: `progress`.
- **Dữ liệu và tài liệu:**
  - Migration `0003_cv_consent`: bảng `consents`; cột `cvs.active`, `cvs.file_name`; partial unique index `cvs_student_campaign_active_key (student_id, campaign_id) WHERE active`; unique `(student_id, campaign_id, version)`.
  - CONTEXT D30.

### Changed
- `GET /api/files/{id}/url` nhận thêm vai trò `STUDENT`: sinh viên gọi URL file JD nhận `404` thay vì `403`.
- **Web:**
  - `ViewFileButton` và kiểm file PDF/DOCX chuyển sang `src/shared/files/`, dùng chung cho JD và CV.
  - Thêm `postFormWithProgress` (`src/shared/api/upload.ts`): upload bằng XHR có tiến độ, refresh token trước khi gửi.
- **API:** `StudentModule` được nạp ở `AppModule`, có controller riêng.
- **Test:**
  - Thêm helper `test/helpers/cv.ts`.
  - `objectKeys`/`headObject` trong `test/helpers/jd.ts` nhận bucket.
  - Factory `createCv` có `fileName`.
- **Tài liệu:**
  - ARCHITECTURE: *Các module* (`student`), *Các bảng chính*, *Lưu trữ file* (12 tháng), *API architecture*.
  - DESIGN.md §6: `progress`, badge trạng thái CV.
- **Sprint:** US-1.6 vào `sprint-2026-W42` (kéo sớm từ W44).

**Commit**: e76ed9f (chuỗi 7 commit b538e96…e76ed9f)

---

## [0.4.0] — 2026-10-13 — Doanh nghiệp, tài khoản HR, đăng và duyệt JD — v0.4.0

US-1.5. Trung tâm khai báo doanh nghiệp và mời HR. HR nhận lời mời, đăng JD bằng form hoặc file PDF/DOCX, rồi nộp. Trung tâm duyệt JD. File gốc lưu mã hóa trên MinIO, tải qua URL tạm 5 phút. Lớp lưu file và kiểm tra file tải lên dùng lại được cho CV (US-1.6). Không có lời gọi LLM nào.

### Added
- **Doanh nghiệp** (chỉ Trung tâm, có nhật ký thao tác): `POST`/`GET /api/companies`, `GET`/`PATCH /api/companies/{id}`. Doanh nghiệp do Trung tâm tạo coi như đã duyệt. PATCH người liên hệ gộp từng trường.
- **Mời HR:**
  - `POST /api/companies/{id}/hr-invitations` tạo tài khoản HR chưa có mật khẩu và trả đường dẫn mời `/accept-invitation#<token>` (JWT `aud = hr-invite`, hạn 7 ngày). Đường dẫn để Trung tâm gửi tay tới khi có email (US-1.7).
  - Mời lại một HR chưa kích hoạt thì cấp link mới, cập nhật họ tên, và link cũ hết hiệu lực (nonce trong `users.invitation_nonce`).
  - `GET /api/companies/{id}/hr-accounts`.
  - Sự kiện `hr.invited`.
- **Nhận lời mời:** `POST /api/auth/accept-invitation` đặt mật khẩu và đăng nhập luôn. Token đã dùng, đã bị thay, hết hạn hoặc sai chữ ký thì trả `422 INVITATION_INVALID`.
- **JD:**
  - HR tạo bằng `POST /api/jds`, có các trường FR-4: vị trí, chỉ tiêu, địa điểm, hình thức `ONSITE`/`HYBRID`/`REMOTE`, thời gian thực tập, phụ cấp, mô tả. `company_id` lấy từ token. Đợt phải ở `INTAKE` (`409 CAMPAIGN_PHASE_MISMATCH`); đợt HR không thấy thì `404`.
  - Sửa nháp bằng `PATCH /api/jds/{id}`: kiểm `row_version`; JD đã nộp thì `409 JD_NOT_EDITABLE`.
  - Nộp bằng `POST /api/jds/{id}/submit`: `DRAFT → PENDING_HR_CONFIRMATION` qua `transitionTo`; thiếu cả mô tả lẫn file thì `422`. Sự kiện `jd.submitted`.
  - `GET /api/jds` (HR chỉ thấy JD của công ty mình; Trung tâm lọc được theo đợt và trạng thái), `GET /api/jds/{id}`. JD ngoài phạm vi trả `404` (BR-11).
- **File JD:**
  - `PUT /api/jds/{id}/file` (multipart) nhận PDF hoặc DOCX tối đa 5 MB.
  - Loại file kiểm bằng magic bytes (`415 UNSUPPORTED_FILE_TYPE`). File quá cỡ bị chặn ở multer (`413 FILE_TOO_LARGE`), không ghi gì vào MinIO.
  - Object được mã hóa SSE-S3 trong bucket `jd-files`. Tên file tiếng Việt giữ nguyên.
- **Duyệt JD:** `POST /api/jds/{id}/approve` (Trung tâm): `PENDING_APPROVAL → APPROVED` qua `transitionTo`, có guard BR-02 (yêu cầu chuẩn hóa đã có). Hai lần duyệt đồng thời chỉ một lần thành công. Sự kiện `jd.approved`.
- **URL file:** `GET /api/files/{id}/url` (`id` = `jd:12`) trả URL ký sẵn hạn 5 phút, tải qua nginx (`/jd-files/`, `/cv-files/`). Quyền kiểm theo bản ghi chủ sở hữu, qua `FileAccessRegistry`.
- **Lớp lưu file dùng chung** `apps/api/src/common/storage/`: `StorageService` (bucket `jd-files`, `cv-files` tạo lúc khởi động, SSE-S3), `SingleFileUpload()`, `detectDocument()`, `FileAccessRegistry`.
- **Giao diện:**
  - Cổng Trung tâm: "Doanh nghiệp" (danh sách, tạo/sửa, mời HR, sao chép đường dẫn mời, tạo lại link mời) và "Duyệt JD" (lọc theo đợt, chi tiết, xem file gốc, duyệt có xác nhận).
  - Cổng HR: "JD của tôi" (danh sách kèm trạng thái và nhãn "Chờ phân tích", form nhập tay và tải file, nộp có xác nhận).
  - Trang nhận lời mời. Primitive mới: `select`.
- **Dữ liệu và tài liệu:**
  - Migration `0002_company_jd_invitations`: cột FR-4 và `file_name` của `job_descriptions` (CHECK `work_mode`, cặp `file_key`/`file_name`); `users.invitation_nonce`.
  - Seed dev có một JD của Alpha ở `PENDING_APPROVAL` để demo màn duyệt (mốc M1).
  - CONTEXT D28, D29; LESSONS §11 (`testTimeout` trong `projects` bị bỏ qua), §12 (`FOR UPDATE OF` với bảng có schema), §13 (multer đọc tên file theo latin1), bổ sung §9 (`file-type` chỉ có ESM).

### Changed
- `apps/api`: thêm `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` 3.1142.0, `file-type` 16.5.4.
- **Cấu hình:**
  - Thêm `MINIO_KMS_SECRET_KEY` (bắt buộc với service `minio`) và `MINIO_PUBLIC_ENDPOINT` (mặc định là địa chỉ web); bỏ `MINIO_BUCKET`. `deploy/.env` cũ cần thêm `MINIO_KMS_SECRET_KEY`.
  - nginx chuyển `/jd-files/`, `/cv-files/` tới MinIO.
- **Test:**
  - Integration test có MinIO trong testcontainers (cùng digest với compose).
  - Timeout 120 giây của integration test nay mới có hiệu lực (đặt qua `setupFilesAfterEnv`).
  - `core-schema.int-spec.ts` đếm migration theo `_journal.json`.
- **Code:**
  - `CampaignService` dùng `emitSafely()` (`common/events`) và `userActor()` (`audit`).
  - `AuthService.issue` mở cho service trong module.
  - Builder Zod dùng chung ở `packages/shared/schemas/common.ts`.
- **Tài liệu:**
  - ARCHITECTURE: *Các module*, *Thư viện chính*, *Các bảng chính*, *Lưu trữ file*, *API architecture*, *Docker Compose*.
  - DESIGN.md §6 (`select`, badge trạng thái JD); DEPLOY.md, SETUP.md.
  - Menu đổi tên thành "JD của tôi" (HR) và "Duyệt JD" (Trung tâm).
  - *Story refresh* cho US-1.6, US-1.7, US-2.3 (US-2.3 AC-4 không chuyển trạng thái nữa).
- **Sprint:** US-1.5 vào `sprint-2026-W42` (kéo sớm từ W43).

**Commit**: c0ceee4 (chuỗi 10 commit 7b5b364…c0ceee4)

---

## [0.3.0] — 2026-10-12 — Tạo và cấu hình đợt thực tập — v0.3.0

US-1.4. Trung tâm tạo và cấu hình đợt thực tập, rồi mở đợt. Đợt tự chuyển giai đoạn khi qua mốc. Các story sau kiểm tra pha bằng một hàm của module `campaign` và đọc tham số qua service của nó.

### Added
- Trung tâm tạo và cấu hình đợt thực tập: đối tượng (khóa, ngành), ba mốc thời gian (`intake_end`, `preference_end`, `testing_end`) và tham số N_NV, θ_cv, θ_test, α, β, k, R_max, T_test, SLA_HR, T_offer. Tham số bỏ trống nhận giá trị mặc định theo PRD GĐ0. API `POST`/`GET /api/campaigns`, `GET`/`PATCH /api/campaigns/{id}`, `POST /api/campaigns/{id}/open`. Tạo, sửa, mở đợt đều ghi nhật ký thao tác. Sửa đợt kiểm `row_version` (lệch thì `409`).
- Schema dùng chung `packages/shared/schemas/campaign.ts` cho form và API: α + β = 1 so theo số nguyên ×100, θ trong [0, 100], số nguyên dương, k ≥ 1, mốc tăng dần; lỗi trả về theo từng trường.
- Khi đợt đã rời nháp: tên, đối tượng và tham số bị khóa (`409 CAMPAIGN_CONFIG_LOCKED`); chỉ được lùi các mốc chưa tới, kèm lý do. Mở đợt khi thiếu mốc hoặc có mốc đã qua thì trả `422`.
- Phạm vi đọc: Trung tâm và Quản trị thấy mọi đợt; HR thấy đợt đã mở; sinh viên thấy đợt đã mở có khóa và ngành của mình. Đợt ngoài phạm vi trả `404`.
- Tác vụ định kỳ chuyển pha theo mốc mỗi phút (`@nestjs/schedule` + `pg_try_advisory_lock`), qua `transitionTo` với actor `SYSTEM`, chạy lại không tạo thêm thay đổi. Sự kiện `campaign.opened` và `campaign.phase_changed` (`@nestjs/event-emitter`) phát sau khi commit.
- `CampaignService.assertPhase`: thao tác sai pha, hoặc sau mốc kết thúc pha, bị từ chối `409 CAMPAIGN_PHASE_MISMATCH`. US-1.5, US-1.6 dùng hàm này.
- Hạ tầng dùng lại: `Clock`/`FakeClock`, `withAdvisoryLock` + `ADVISORY_LOCK_KEYS`, biến môi trường `SCHEDULER_ENABLED`, option `configure` của `createAuthTestApp`, helper `parseOrFail` cho lỗi `400` theo trường.
- Màn "Đợt thực tập" ở cổng Trung tâm: danh sách kèm trạng thái và mốc kế tiếp, form ba phần (đối tượng, mốc thời gian, tham số), chọn ngày bằng Calendar locale `vi`, hộp thoại mở đợt, tham số chỉ đọc khi đã khóa. Primitive mới: `table`, `badge`, `alert-dialog`, `popover`, `calendar`, `textarea`.
- Seed dev có một đợt nháp mẫu.
- CONTEXT D27; LESSONS §9 (gói NestJS 12 chỉ có ESM), §10 (Zod 4 bỏ qua refine của object khi có lỗi trường).

### Changed
- `apps/api`: thêm `@nestjs/schedule` 6.1.3, `@nestjs/event-emitter` 3.1.0. `apps/web`: thêm `react-day-picker` 10.0.1.
- ARCHITECTURE › *Tech stack*, › *Các module*, › *Thư viện chính*, › *Tác vụ định kỳ*, › *Các bảng chính*, › API; DESIGN.md §6; DEPLOY.md, SETUP.md, `deploy/.env.example`, `deploy/docker-compose.yml` (`SCHEDULER_ENABLED`).
- Sprint `sprint-2026-W41` đóng; `sprint-2026-W42` mở với US-1.4 (kéo sớm từ W43), US-1.1 và US-1.3 chuyển sang.

**Commit**: 928c04c

---

## [0.2.0] — 2026-10-08 — Đăng nhập, phân quyền, DESIGN.md, khung giao diện — v0.2.0

US-1.3. Bốn vai trò đăng nhập được và chỉ vào được cổng của mình. Mỗi API kiểm tra vai trò bằng một guard mặc định từ chối, và kiểm tra quyền trên từng bản ghi qua một helper dùng chung. Web có design system (`DESIGN.md` + shadcn/ui) và khung ba cổng `/sv`, `/hr`, `/admin`; chưa có màn nghiệp vụ.

### Added
- Đăng nhập bằng email và mật khẩu (`POST /api/auth/login`): access token JWT HS256 15 phút; refresh token ngẫu nhiên trong cookie `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/auth`, Redis lưu hash, xoay vòng mỗi lần `POST /api/auth/refresh`; `POST /api/auth/logout` thu hồi; `GET /api/me`. Mật khẩu băm bằng `scrypt` của Node. Email sai và mật khẩu sai trả cùng một `401` (CONTEXT D25).
- Phân quyền theo vai trò `CENTER`, `STUDENT`, `HR`, `ADMIN`: guard global `AccessGuard` (`@Public()`, `@Roles()`, `@CurrentUser()`), route thiếu khai báo bị từ chối; helper `assertRecordAccess`/`recordScopeWhere` trả `404` cho bản ghi ngoài phạm vi (BR-11). Test duyệt mọi route bằng `DiscoveryService`.
- Quản trị tài khoản: `POST`/`GET /api/admin/users` (chỉ `ADMIN`) tạo tài khoản Trung tâm, Quản trị, Sinh viên với mật khẩu ban đầu; HR bị từ chối `422`, email trùng `409`. Module `student` với `StudentService.createStudent`.
- Seed dữ liệu dev `pnpm --filter @srm/api db:seed` (một tài khoản mỗi vai trò, hai công ty, hai sinh viên; chạy lại không tạo trùng). Helper test `createAuthTestApp`/`loginAs` và fixture hai công ty cho test IDOR.
- Mọi lỗi API cùng một dạng `{ code, message, details? }` qua `ApiExceptionFilter`; request validate bằng DTO nestjs-zod sinh từ schema dùng chung; mã lỗi mới trong `packages/shared/schemas/errors.ts`.
- OpenAPI từ `@nestjs/swagger` + nestjs-zod (`/api/docs` ngoài production); `pnpm api:sync` xuất `openapi.json` và sinh kiểu client (openapi-typescript). CI kiểm hai file này khớp với API.
- `DESIGN.md`: token màu đã kiểm tương phản, chữ, khoảng cách, breakpoint và checklist 360 px, primitive shadcn, bốn trạng thái của mọi màn, form, chuỗi tiếng Việt, ngày giờ với date-fns `vi`.
- Web: Tailwind CSS 4, shadcn/ui nền Radix (`components.json`, 16 primitive); React Router; TanStack Query; trang đăng nhập (React Hook Form + schema dùng chung); khung cổng sinh viên có thanh điều hướng dưới trên điện thoại, cổng HR và Trung tâm có thanh bên; access token chỉ giữ trong bộ nhớ, client tự refresh một lần khi gặp `401` (CONTEXT D26).
- Biến môi trường `JWT_ACCESS_SECRET` (bắt buộc), `REFRESH_TOKEN_TTL_DAYS`, `REDIS_URL`, `SEED_PASSWORD`; integration test có thêm container Redis.
- CONTEXT D25, D26; LESSONS §8.

### Changed
- `AppModule` không đọc biến môi trường lúc import; `main.ts` và test dùng chung `configureApp`. Log request che `Authorization`, `Cookie`, `Set-Cookie`.
- `GET /api/health` được đánh dấu `@Public()`.
- ARCHITECTURE › *Frontend*, › *Tech stack*, › *Thư viện chính* (bỏ passport-jwt), › *Redis* (khóa `auth:refresh:{sha256}`), › *Security architecture*, › *Open architecture questions* (đã chốt Radix).
- Sprint `sprint-2026-W41` kéo thêm US-1.3.

**Commit**: 340e62e

---

## [0.1.1] — 2026-10-08 — Lược đồ DB lõi, `transitionTo`, nhật ký thao tác — v0.1.1

US-1.2. Có lược đồ `core` đầu tiên và cơ chế chuyển trạng thái dùng chung: mọi thay đổi trạng thái của đợt, JD, CV đi qua `transitionTo`, có khóa lạc quan và nhật ký chỉ ghi thêm trong cùng giao dịch. Chưa có endpoint nghiệp vụ.

### Added
- Lược đồ `core` bằng Drizzle (`drizzle-orm` 0.45.3, `drizzle-kit` 0.31.11): `campaigns`, `companies`, `users`, `students`, `job_descriptions`, `cvs`, `audit_logs`, kèm migration SQL trong `apps/api/drizzle/`. Cột `status` có CHECK lấy từ bảng chuyển dùng chung; CHECK vai trò, HR ↔ `company_id`, STUDENT ↔ `student_id`, email chữ thường.
- `packages/shared/states`: bảng chuyển trạng thái của đợt, JD, CV dùng chung cho web và API; `packages/shared/schemas`: `ROLES`, `ACTOR_KINDS`, `ApiErrorSchema`. `packages/shared` có unit test riêng (Jest).
- `transitionTo` (`StateTransitionService`): khóa dòng, kiểm `row_version` (lệch thì trả `409`), kiểm bảng chuyển và điều kiện (sai thì trả `422`), ghi nhật ký trong cùng giao dịch. Exception filter trả body `{ code, message, details }`.
- Nhật ký thao tác chỉ ghi thêm: trigger `ENABLE ALWAYS` chặn `UPDATE`/`DELETE`/`TRUNCATE` trên `audit_logs` (BR-10); cột `reason`, `actor_kind` (CONTEXT D24).
- Docker Compose có service `migrate` chạy một lần trước `api`; biến `DATABASE_URL`; `GET /api/health` kiểm thêm kết nối DB.
- Helper test dùng lại cho các story sau (`apps/api/test/helpers/`); CI kiểm migration khớp schema (`db:generate` không sinh file mới).
- CONTEXT D24; LESSONS §6 (migrator bỏ qua migration có mốc thời gian cũ hơn), §7 (kiểu Drizzle cho hàm dùng chung nhiều bảng).

### Changed
- ARCHITECTURE › *Các bảng chính*, › *Các module* (`audit` ghi trong giao dịch, không dùng interceptor), › *Quản lý trạng thái*, › *Docker Compose*.
- Sprint `sprint-2026-W41` kéo thêm US-1.2.

**Commit**: b1f8b17

---

## [0.1.0] — 2026-10-08 — Scaffold monorepo, Docker Compose, CI — v0.1.0

Lần ship code đầu tiên (US-1.1). Repo có khung chạy được: monorepo pnpm, Docker Compose dựng cả hạ tầng bằng một lệnh, CI GitHub Actions và cổng commit koni-harness. Chưa có nghiệp vụ. Gộp luôn các thay đổi tài liệu trước đó, vốn nằm ở `[Unreleased]`.

### Added
- Monorepo pnpm 10: `apps/api` (NestJS 11, TypeScript strict, nestjs-pino, `GET /api/health` bằng @nestjs/terminus), `apps/web` (React 19 + Vite 8), `packages/shared` (Zod; `schemas/`, `states/`, `contracts/`), khung `ai-service` (Python 3.12+, ruff, pytest).
- `deploy/docker-compose.yml`: PostgreSQL 16 + pgvector, Redis 7, RabbitMQ 4 (management), MinIO (image Chainguard), Mailpit, API và nginx phục vụ web. Cả 7 service có healthcheck; dữ liệu nằm trong named volume. Chạy bằng `docker compose -f deploy/docker-compose.yml up -d --build --wait`.
- CI GitHub Actions (`.github/workflows/ci.yml`): typecheck, ESLint, test (có integration test dùng testcontainers), build web, kiểm tra ranh giới module bằng dependency-cruiser, ruff và pytest cho AI Service.
- Luật ranh giới module (`.dependency-cruiser.cjs`): `domain/` không import NestJS hay Drizzle; module chỉ dùng module khác qua `modules/<m>/index.ts`. Fixture vi phạm cố ý chứng minh luật có hiệu lực (`pnpm depcruise:fixture`).
- Hạ tầng integration test: global setup testcontainers khởi động PostgreSQL (cùng image với compose); test mẫu `db-smoke.int-spec.ts`.
- Cổng commit koni-harness (`.koni-harness/`, hook git `pre-commit`/`pre-push`, hook `PreToolUse` của Claude Code qua `scripts/claude-commit-gate.sh`).
- `DEPLOY.md`, `deploy/.env.example`; `docs/SETUP.md` và `AGENTS.md` có lệnh chạy thật.
- Sprint `sprint-2026-W41`; CONTEXT D22 (công cụ, phiên bản), D23 (image MinIO); LESSONS §3–§5.
- Bộ tài liệu theo cấu trúc koni-docs: `BRIEF.md`, `PRD.md` (từ đặc tả nghiệp vụ), `ARCHITECTURE.md` (từ tài liệu kiến trúc), `CONTEXT.md`, `LESSONS.md`, `SETUP.md`, `docs/README.md`, `docs/sprints/`.
- `AGENTS.md` làm nguồn chỉ dẫn chính cho agent; `CLAUDE.md` import `AGENTS.md`.
- PRD bổ sung bảng Functional Requirements (FR-1 – FR-37), Non-Functional Requirements (NFR-1 – NFR-13) và 6 epic theo lộ trình triển khai.
- 37 file story trong `docs/sprints/stories/` (US-1.1 … US-6.6), ở trạng thái `backlog`, có tiêu chí nghiệm thu, task và Dev notes theo template koni-docs (CONTEXT D21).

### Changed
- Frontend dùng shadcn/ui + Tailwind CSS thay cho Ant Design (CONTEXT D14).
- ARCHITECTURE › Docker Compose: service `minio` dùng `cgr.dev/chainguard/minio` vì `minio/minio` đã bị xóa khỏi Docker Hub (CONTEXT D23).

**Commit**: ae8c373

---

## [0.0.0] — 2026-10-04 — Khởi tạo repo — v0.0.0

Commit đầu tiên của repo, chỉ có `README.md`. Mốc gốc của `VERSION`.

**Commit**: a804da5
