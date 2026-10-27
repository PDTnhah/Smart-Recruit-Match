# Báo cáo tiến độ đồ án tốt nghiệp — Smart Recruit Match

| | |
|---|---|
| Sinh viên thực hiện | … |
| Giảng viên hướng dẫn | … |
| Ngày báo cáo | 22/10/2026 (tuần 3 trong lộ trình 13 tuần) |
| Phiên bản hệ thống | 0.9.0 |
| Phạm vi | US-1.1 đến US-2.3 |
| Mã nguồn | <https://github.com/PDTnhah/Smart-Recruit-Match>, nhánh `dev` |
| Báo cáo trước | [09/10/2026](2026-10-09-progress-report.md), bản 0.2.0 |

## Tóm tắt

- **Đã xong 10/37 story, tương đương 67/217 điểm (khoảng 31%).**
    - Theo lộ trình, đến hết tuần 3 cần xong 7 story với 44 điểm. 6 story đã xong; riêng US-5.1 (thuật toán phân bổ) chưa bắt đầu.
    - 4 story của tuần 4 và tuần 5 đã làm sớm: US-1.6, US-1.7, US-2.2, US-2.3.
- **Luồng đã chạy trên hệ thống thật:**
    - Trung tâm tạo và mở đợt, khai báo doanh nghiệp, mời HR.
    - HR đăng JD. AI đọc JD và đề xuất yêu cầu chuẩn hóa; HR sửa rồi xác nhận; Trung tâm duyệt.
    - Sinh viên đồng ý điều khoản và nộp CV.
    - Thông báo hiện ngay trong ứng dụng và gửi qua email.
- **Đường ống AI đã đủ các phần:** hàng đợi, worker, lớp gọi LLM hỗ trợ hai nhà cung cấp, prompt có phiên bản, nhật ký từng lượt gọi. Agent đầu tiên chạy thật là JD Analyzer. CV vẫn dừng ở trạng thái "Chờ phân tích" cho tới US-2.4.
- **Cả hệ thống dựng bằng một lệnh Docker Compose**, gồm 10 service ([mục 2](#2-chạy-hệ-thống-ở-local-bằng-docker)).
- **Chưa có:** phân tích CV, embedding, chấm phù hợp, nguyện vọng, thi, phân bổ, HR duyệt đề cử.
- **Kiểm thử:** 468 unit test qua lúc viết báo cáo. US-1.2 đã đóng. 9 story còn lại đã merge vào `dev` và đang ở bước review: chờ CI xanh và kiểm tay giao diện trong trình duyệt ([mục 1.8](#18-trạng-thái-và-việc-còn-lại)).

---

## 1. Chức năng đã thực hiện

### 1.1. Các phiên bản

| Phiên bản | Ngày | Story | Điểm | Nội dung |
|---|---|---|---|---|
| 0.9.0 | 22/10 | US-2.3 | 13 | JD Analyzer. HR xem, sửa, xác nhận yêu cầu chuẩn hóa. Sửa JD đã duyệt thì tạo phiên bản yêu cầu mới |
| 0.8.0 | 20/10 | US-2.2 | 5 | `LLMClient` hỗ trợ hai nhà cung cấp, prompt có phiên bản, nhật ký từng lượt gọi LLM |
| 0.7.0 | 20/10 | US-2.1 | 8 | Hàng đợi job AI, hợp đồng message TS ↔ Python, worker AI, role DB riêng cho từng service |
| 0.6.0 | 19/10 | US-1.7 | 5 | Thông báo trong app (SSE), email, nhắc hạn nộp CV |
| 0.5.0 | 14/10 | US-1.6 | 5 | Đồng ý xử lý dữ liệu, nộp CV có phiên bản |
| 0.4.0 | 13/10 | US-1.5 | 8 | Doanh nghiệp, mời HR, đăng và duyệt JD, lưu file có mã hóa |
| 0.3.0 | 12/10 | US-1.4 | 5 | Tạo, cấu hình, mở đợt; đợt tự chuyển pha khi qua mốc |
| 0.2.0 | 08/10 | US-1.3 | 8 | Đăng nhập, phân quyền 4 vai trò, design system, khung giao diện 3 cổng |
| 0.1.1 | 08/10 | US-1.2 | 5 | Lược đồ DB lõi, `transitionTo`, nhật ký thao tác chỉ ghi thêm |
| 0.1.0 | 08/10 | US-1.1 | 5 | Khung monorepo, Docker Compose, CI |

Chi tiết từng phiên bản nằm ở [docs/CHANGELOG.md](../docs/CHANGELOG.md).

### 1.2. Mỗi vai trò làm được gì

| Vai trò | Đã làm được | Màn hình |
|---|---|---|
| Cán bộ Trung tâm | Tạo, cấu hình và mở đợt. Khai báo doanh nghiệp, mời HR (gửi link mời qua email hoặc sao chép link). Xem JD gốc cạnh yêu cầu chuẩn hóa, thấy cảnh báo khi file có chữ ẩn, rồi duyệt JD. Sửa yêu cầu của JD đã duyệt; mỗi lần sửa tạo một phiên bản mới | `/admin`: "Đợt thực tập", "Doanh nghiệp", "Duyệt JD" |
| HR doanh nghiệp | Nhận lời mời và đặt mật khẩu. Tạo JD bằng form và/hoặc file PDF, DOCX, rồi nộp. Xem đề xuất của AI cạnh JD gốc, sửa trực tiếp rồi xác nhận. Khi AI lỗi thì nhập tay | `/hr`: "JD của tôi" |
| Sinh viên | Xem việc cần làm ở trang chủ. Đồng ý điều khoản xử lý dữ liệu cho từng đợt. Nộp và cập nhật CV, xem lịch sử phiên bản, mở lại file | `/sv`: "Trang chủ", "Hồ sơ" |
| Quản trị hệ thống | Tạo tài khoản Trung tâm, Quản trị, Sinh viên. Hiện chỉ làm được qua API; chưa có màn hình | – |
| Mọi vai trò | Đăng nhập, đăng xuất. Chuông thông báo kèm số chưa đọc, cập nhật theo thời gian thực | Header của cả ba cổng |
| Hệ thống (tự chạy) | Chuyển pha đợt khi qua mốc (mỗi phút). Nhắc hạn nộp CV (mỗi 5 phút). Gửi email từ outbox (mỗi 10 giây). Phân tích JD ngay khi HR nộp | – |

Các mục menu còn lại ("Nguyện vọng", "Bài test", "Kết quả", "Ứng viên được đề cử", "Phân bổ"…) đã có trên menu nhưng mới mở trang "Sắp có". Chúng thuộc các story sau.

### 1.3. Chi tiết theo story

**US-1.1: Khung dự án (0.1.0).** Phần này đã trình bày ở báo cáo 09/10.

- Monorepo pnpm gồm 4 phần: `apps/api`, `apps/web`, `packages/shared`, `ai-service`.
- Docker Compose dựng toàn bộ hạ tầng; mọi service có health check.
- CI trên GitHub Actions. Luật ranh giới module được kiểm tự động bằng dependency-cruiser.

**US-1.2: CSDL lõi và chuyển trạng thái (0.1.1).**

- Vòng đời của đợt, JD và CV được viết thành bảng chuyển trạng thái trong `packages/shared/states`, dùng chung cho web và API.
- `transitionTo` là đường duy nhất để đổi trạng thái. Trong cùng một giao dịch, hàm này:
    - khóa dòng;
    - kiểm `row_version`, lệch thì trả `409`;
    - kiểm bước chuyển có hợp lệ không, sai thì trả `422`;
    - ghi nhật ký.
- Nhật ký thao tác chỉ ghi thêm: trigger PostgreSQL chặn `UPDATE`, `DELETE`, `TRUNCATE`.

**US-1.3: Đăng nhập, phân quyền, giao diện (0.2.0).**

- **Token:** access token JWT hiệu lực 15 phút. Refresh token nằm trong cookie `HttpOnly`, xoay vòng mỗi lần dùng; Redis chỉ lưu giá trị băm.
- **Phân quyền:** một guard mặc định từ chối, theo 4 vai trò. Bản ghi ngoài phạm vi trả `404` (BR-11). Một test duyệt mọi route để bảo đảm không route nào thiếu khai báo quyền.
- **Giao diện:** `DESIGN.md` quy định màu, chữ, khoảng cách, chuẩn 360 px và bốn trạng thái bắt buộc của mọi màn. Web có khung 3 cổng.

**US-1.4: Đợt thực tập (0.3.0).**

- **Tạo đợt.** Trung tâm khai báo:
    - đối tượng (khóa, ngành);
    - ba mốc: hạn nộp CV `intake_end`, hạn chọn nguyện vọng `preference_end`, hạn làm test `testing_end`;
    - các tham số N_NV, θ_cv, θ_test, α, β, k, R_max, T_test, SLA_HR, T_offer. Tham số bỏ trống nhận giá trị mặc định theo PRD GĐ0.
- **Kiểm tra dữ liệu.** Form và API dùng chung một schema Zod:
    - α + β = 1, so trên số nguyên ×100 để tránh sai số dấu phẩy động;
    - θ nằm trong [0, 100], k ≥ 1;
    - các mốc phải tăng dần.
- **Khóa cấu hình.** Mở đợt rồi thì tên, đối tượng và tham số bị khóa. Chỉ được lùi những mốc chưa tới, và phải ghi lý do.
- **Tự chuyển pha.** Một tác vụ chạy mỗi phút, chuyển pha khi qua mốc. Tác vụ đi qua `transitionTo` với actor hệ thống. Advisory lock của PostgreSQL bảo đảm khi chạy nhiều instance API thì chỉ một instance chạy tác vụ.
- **Chặn thao tác sai pha.** `CampaignService.assertPhase` trả `409` khi thao tác không đúng pha. Ví dụ: nộp CV sau `intake_end`. Module JD và CV đều dùng hàm này.
- **Phạm vi đọc.** Sinh viên chỉ thấy đợt đã mở và có khóa, ngành của mình.

**US-1.5: Doanh nghiệp, HR, JD (0.4.0).**

- **Doanh nghiệp và lời mời.** Trung tâm khai báo doanh nghiệp rồi mời HR.
    - Link mời có hạn 7 ngày. Mời lại thì link cũ hết hiệu lực.
    - HR đặt mật khẩu qua link và được đăng nhập luôn.
- **Đăng JD.** HR tạo JD gồm vị trí, chỉ tiêu, địa điểm, hình thức làm việc, thời gian, phụ cấp và mô tả.
    - Có thể kèm file PDF hoặc DOCX, tối đa 5 MB.
    - Loại file được xác định bằng nội dung file (magic bytes), không dựa vào đuôi file.
- **Duyệt JD.** Trung tâm duyệt. Hai người bấm duyệt cùng lúc thì chỉ một lần thành công.
- **Lưu file.** File nằm trên MinIO, mã hóa phía server (SSE-S3).
    - Người dùng tải file qua URL ký sẵn, hết hạn sau 5 phút.
    - URL đi qua nginx, nên không phải mở cổng MinIO ra ngoài.
- **Phạm vi.** HR chỉ thấy JD của công ty mình. JD của công ty khác trả `404`.

**US-1.6: Đồng ý điều khoản, nộp CV (0.5.0).**

- **Điều khoản xử lý dữ liệu có phiên bản.** Băm SHA-256 của văn bản được ghim trong unit test. Muốn sửa nội dung thì phải ra phiên bản mới.
- **Đồng ý theo từng đợt.** Hệ thống ghi phiên bản điều khoản, băm văn bản và thời điểm đồng ý.
- **Nộp CV.** Chỉ nộp được khi đợt đang nhận CV và sinh viên đã đồng ý điều khoản.
    - Mỗi lần nộp là một phiên bản mới. File cũ vẫn được giữ.
    - Mỗi sinh viên chỉ có một CV hiệu lực trong một đợt (BR-01). Quy tắc này được bảo đảm bằng partial unique index trong DB; hai lần nộp đồng thời thì một lần nhận `409`.
- **Màn "Hồ sơ".** Gồm bước đồng ý, tải lên có thanh tiến độ, lịch sử phiên bản và nút mở file.
- **HR chưa xem được CV** cho tới khi sinh viên được đề cử vào JD của họ (US-5.3).

**US-1.7: Thông báo (0.6.0).**

- **Trong ứng dụng.** Chuông kèm số chưa đọc ở cả ba cổng. Trên máy tính danh sách mở dạng popover, trên điện thoại mở dạng sheet từ đáy màn hình.
- **Thời gian thực.** Thông báo được đẩy xuống trình duyệt bằng SSE. Khi chạy nhiều instance API, Redis pub/sub bảo đảm thông báo đến đúng người.
- **Email.** Email đi qua outbox trong PostgreSQL. Worker chạy 10 giây một lần.
    - Gửi lỗi thì thử lại sau 1 phút, rồi sau 5 phút.
    - SMTP lỗi không làm hỏng giao dịch nghiệp vụ.
- **Các thông báo đã có:**
    - mở đợt, gửi cho sinh viên thuộc đối tượng;
    - email mời HR;
    - nhắc hạn nộp CV, gửi trước `reminder_hours_before` giờ (mặc định 24), không nhắc trùng.
- **Môi trường dev:** email được giữ lại trong Mailpit để xem, không gửi ra ngoài.

**US-2.1: Hạ tầng job AI (0.7.0).**

- **Gửi job.** Backend gửi job qua RabbitMQ (`ai.jd.analyze`, `ai.cv.parse`). Message chỉ chứa ID. AI Service trả kết quả qua `ai.results`.
- **Hợp đồng message.** Viết một lần bằng Zod, rồi sinh ra JSON Schema và model Pydantic (`pnpm contracts:gen`). Hai phía lệch nhau thì CI báo lỗi.
- **Xử lý lỗi.** Worker không xử lý trùng một job, nhờ bảng `ai.jobs` theo `job_id`.
    - Lỗi tạm thời được thử lại sau 2 giây, rồi sau 10 giây.
    - Lỗi lần thứ 3 thì message chuyển vào hàng đợi lỗi (DLQ).
- **Phân quyền DB.**
    - Role `api_service` đọc ghi schema `core`.
    - Role `ai_service` chỉ đọc các view đã che thông tin cá nhân và chỉ ghi schema `ai`.
    - Vì vậy, kể cả khi code của AI Service có lỗi, nó cũng không đọc được tên hay ngày sinh của sinh viên.
- **Docker Compose** có thêm hai service `ai-worker` và `ai-api`. `ai-worker` chạy nhiều bản sao được.

**US-2.2: LLMClient (0.8.0).**

- **Một lớp cho mọi agent.** `LLMClient` hỗ trợ hai nhà cung cấp, chọn bằng biến `LLM_PROVIDER`, không phải sửa agent:
    - Gemini `gemini-3.8-flash`, mặc định;
    - Claude `claude-opus-5-5`.
- **Kiểm đầu ra.**
    - JSON lấy bằng structured output theo model Pydantic.
    - Model từ chối trả lời (refusal) được kiểm trước khi đọc nội dung.
    - Sai schema thì thử lại tối đa 2 lần, sau đó chuyển cho người xử lý.
- **Nhật ký.**
    - Mỗi lần thử ghi một dòng vào bảng `ai.llm_calls`: model, phiên bản prompt, số token, chi phí USD, độ trễ. Bảng chỉ ghi thêm.
    - Request và phản hồi đầy đủ lưu trong bucket `llm-logs`.
- **Prompt có phiên bản.** `manifest.json` ghim băm của từng prompt, nên prompt đã phát hành không bị sửa lén.
- **Chế độ `fixture`.** Test dùng phản hồi đã ghi sẵn, không gọi API thật.

**US-2.3: JD Analyzer (0.9.0).**

- **Trích văn bản và loại chữ ẩn.**
    - PDF: chữ trùng màu nền, cỡ dưới 2pt, nằm ngoài trang, trong suốt, hoặc bị hình vẽ đè lên che mất.
    - DOCX: chữ có thuộc tính ẩn, cỡ dưới 2pt, hoặc trùng màu với nền ô, highlight, màu trang.
    - Mọi loại file: ký tự định dạng vô hình bị bỏ.
- **Đề xuất yêu cầu chuẩn hóa.** Agent `jd_analyzer` đề xuất:
    - kỹ năng bắt buộc và bổ trợ, mỗi kỹ năng có mức độ (Cơ bản / Khá / Thành thạo) và trọng số;
    - điều kiện cứng: ngành, năm học tối thiểu, GPA tối thiểu, ngoại ngữ;
    - nhóm vị trí.
- **AI chỉ đề xuất, không chuyển trạng thái JD.** HR xem đề xuất cạnh JD gốc, sửa rồi xác nhận. Lúc đó JD mới chuyển sang "Chờ Trung tâm duyệt".
- **AI lỗi hoặc chậm thì HR nhập tay.** Phần HR nhập được ưu tiên; kết quả AI đến sau bị bỏ qua.
- **Phiên bản yêu cầu (BR-18).** Sửa yêu cầu của JD đã duyệt thì tạo phiên bản mới và báo Trung tâm. Nhờ vậy luôn truy được kết quả nào chấm theo yêu cầu nào.
- **Cờ chữ ẩn.** File có chữ ẩn bị gắn cờ, và Trung tâm thấy cảnh báo.
- **Truy vết.** Kết quả lưu kèm model và phiên bản prompt.

### 1.4. Luồng phân tích JD bằng AI

```mermaid
sequenceDiagram
    actor HR
    participant API as Core Backend
    participant MQ as RabbitMQ
    participant W as ai-worker
    participant LLM as Gemini hoặc Claude
    HR->>API: Nộp JD
    API->>API: DRAFT → PENDING_HR_CONFIRMATION và analysis_status = PENDING, trong một giao dịch
    API->>MQ: ai.jd.analyze (job_id, jd_id, jd_version)
    MQ->>W: Giao job
    W->>W: Đọc view core.v_ai_jd_source và file JD trong MinIO, loại chữ ẩn
    W->>LLM: Prompt jd_analyzer/v1, structured output
    LLM-->>W: JSON theo schema JdRequirements
    W->>W: Ghi ai.llm_calls và llm-logs
    W->>MQ: ai.results
    MQ->>API: Kết quả
    API->>API: Lưu yêu cầu, model, prompt_version, ghi nhật ký
    API-->>HR: Thông báo trong app và sự kiện SSE
    HR->>API: Sửa, xác nhận
    API->>API: transitionTo(PENDING_APPROVAL)
```

Backend chỉ áp dụng kết quả khi JD vẫn đang chờ HR, đúng phiên bản, và HR chưa nhập gì. Nếu không, kết quả bị bỏ qua. Vì vậy nhận trùng message, kết quả cũ hay kết quả đến muộn đều không ghi đè dữ liệu của HR.

### 1.5. Dữ liệu

| Loại | Đã có |
|---|---|
| Bảng schema `core` | `campaigns`, `companies`, `users`, `students`, `job_descriptions`, `cvs`, `consents`, `notifications`, `audit_logs` |
| Bảng schema `ai` | `ai.jobs` (trạng thái job), `ai.llm_calls` (từng lượt gọi LLM, chỉ ghi thêm) |
| View cho AI Service | `core.v_ai_cv_profile_masked`, `core.v_ai_jd_requirements`, `core.v_ai_jd_source`. Các view này không có cột thông tin cá nhân |
| Migration | 11 file, từ `0000_core_schema` đến `0010_ai_jd_source_view`, trong [apps/api/drizzle/](../apps/api/drizzle/) |
| Bucket MinIO | `jd-files`, `cv-files` (do API tạo), `llm-logs` (do AI Service tạo); tất cả mã hóa SSE-S3 |
| Hàng đợi RabbitMQ | `ai.jd.analyze`, `ai.cv.parse`, `ai.results`, mỗi hàng đợi có một `*.dlq` |

### 1.6. API

38 endpoint, tất cả dưới `/api`:

| Nhóm | Endpoint |
|---|---|
| Hệ thống | `GET /health` |
| Đăng nhập | `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/accept-invitation`; `GET /me` |
| Quản trị | `POST`, `GET /admin/users` |
| Đợt | `POST`, `GET /campaigns`; `GET`, `PATCH /campaigns/{id}`; `POST /campaigns/{id}/open` |
| Doanh nghiệp | `POST`, `GET /companies`; `GET`, `PATCH /companies/{id}`; `POST /companies/{id}/hr-invitations`; `GET /companies/{id}/hr-accounts` |
| JD | `POST`, `GET /jds`; `GET`, `PATCH /jds/{id}`; `PUT /jds/{id}/file`; `POST /jds/{id}/submit`; `POST /jds/{id}/approve` |
| Yêu cầu JD | `GET`, `PUT /jds/{id}/requirements`; `PUT /jds/{id}/requirements/confirm` |
| Sinh viên | `GET`, `POST /me/consents`; `POST /cvs`; `GET /cvs/me` |
| File | `GET /files/{id}/url` (URL tạm 5 phút) |
| Thông báo | `GET /notifications`; `POST /notifications/{id}/read`; `POST /notifications/read-all`; `GET /events/stream` (SSE) |

Tài liệu Swagger tự sinh từ code, xem ở `/api/docs` khi chạy chế độ dev ([mục 2.9](#29-chạy-ở-chế-độ-phát-triển)).

### 1.7. Kiểm thử

| Loại | Số ca | Chạy bằng | Nội dung chính |
|---|---|---|---|
| Unit `packages/shared` | 141 | `pnpm --filter @srm/shared test` | Bảng chuyển trạng thái, schema Zod (đợt, JD, yêu cầu chuẩn hóa), hợp đồng message, băm điều khoản |
| Unit `apps/api` | 153 | `pnpm --filter @srm/api test:unit` | Hàm thuần ở `domain/` (pha đợt, phiên bản yêu cầu, quyết định áp kết quả AI), xử lý lỗi, cấu hình |
| Integration `apps/api` | khoảng 200, trong 30 file | `pnpm test`, cần Docker | Chạy trên PostgreSQL, Redis, RabbitMQ, MinIO thật (testcontainers). Gồm: phân quyền mọi route, chống truy cập chéo giữa hai công ty, `transitionTo`, BR-01, outbox email, SSE, job AI đi trọn vòng, quyền của role DB |
| `ai-service` (pytest) | 174 | `ai-service/.venv/Scripts/pytest ai-service` | Worker (idempotent, thử lại, DLQ), `LLMClient` và hai adapter, phát hiện chữ ẩn, agent JD, manifest prompt, chặn gọi mạng |

- Cả 468 unit test (141 + 153 + 174) qua lúc viết báo cáo.
- Integration test cần Docker; báo cáo này không chạy lại mà để CI chạy trên mỗi push.
- Web chưa có test component. Giao diện được kiểm tay theo `DESIGN.md`; schema mà form dùng thì đã có unit test ở `packages/shared` ([CONTEXT D35](../docs/CONTEXT.md)).

### 1.8. Trạng thái và việc còn lại

10 story đã merge vào nhánh `dev` qua PR #3 đến #12. Nhánh `main` chưa nhận các merge này.

| Story | Trạng thái | Còn chờ |
|---|---|---|
| US-1.2 | Đã xong | – |
| US-1.1 | Review | CI xanh |
| US-1.3 | Review | Kiểm tay: tự refresh token, chuyển đúng cổng theo vai trò, form đăng nhập, hiển thị 360 px |
| US-1.4 | Review | Kiểm tay màn "Đợt thực tập" |
| US-1.5 | Review | Kiểm tay màn "Doanh nghiệp", "JD của tôi", "Duyệt JD" |
| US-1.6 | Review | Kiểm tay màn "Hồ sơ" ở 360 px |
| US-1.7 | Review | Kiểm tay chuông ở ba cổng, email trong Mailpit |
| US-2.1 | Review | CI xanh |
| US-2.2 | Review | CI xanh; chạy `evals/smoke_llm.py` với key thật |
| US-2.3 | Review | CI xanh; kiểm tay màn HR và Trung tâm; chạy một JD giả qua Gemini với key thật |

**Giới hạn hiện tại**

- **Mặc định chưa gọi LLM thật.** Compose để `LLM_PROVIDER=fixture`, nên hệ thống chạy được khi chưa có API key. Đổi lại, JD thật nào cũng phân tích lỗi, và HR phải nhập yêu cầu bằng tay. Cách bật LLM thật ở [mục 2.7](#27-bật-phân-tích-jd-bằng-llm-thật).
- **CV chưa được phân tích.** Handler của `ai.cv.parse` vẫn trả kết quả giả; CV Parser thuộc US-2.4.
- **Điều khoản đồng ý v1 ghi tên Anthropic.** Trước khi gửi CV thật cho Gemini phải có điều khoản v2 ghi tên Google, và sinh viên phải đồng ý lại. Free tier của Gemini chỉ dùng với dữ liệu giả ([CONTEXT D34](../docs/CONTEXT.md)).
- **Chưa có màn quản trị** cho tài khoản và cho hàng đợi lỗi (DLQ). Hiện phải dùng API và giao diện của RabbitMQ.

**Bước tiếp theo**

- Hoàn thành mốc M1: US-5.1 (Allocation Engine và property-based test) và US-6.4 (mô phỏng so với các phương án đối chứng).
- Làn AI: US-2.4 (CV Parser, dùng lại `parsing/`) và US-3.1 (lọc điều kiện cứng và công thức S_cv, đọc `hard_conditions` của JD).

### 1.9. Thay đổi thiết kế từ báo cáo 09/10

| Điểm | Báo cáo 09/10 | Hiện tại | Nguồn |
|---|---|---|---|
| Nhà cung cấp LLM (Q8) | Chỉ Claude API | Gemini mặc định, Claude thay thế, qua cùng một `LLMClient`. Q8 chốt một phần: dùng API thương mại; phương án tự host còn mở | CONTEXT D34 |
| `temperature` | Để thấp | Không gửi. Tính nhất quán dựa vào cố định model, phiên bản prompt, structured output và cache kết quả | CONTEXT D34 |
| Kết quả phân tích JD | Chuyển JD sang bước tiếp theo | Chỉ lưu đề xuất. JD chỉ chuyển trạng thái khi HR xác nhận | CONTEXT D28, D35 |
| Sửa yêu cầu sau khi duyệt | Chưa định nghĩa rõ | Mọi lần sửa đều tạo phiên bản mới, có hiệu lực ngay, không phải duyệt lại | CONTEXT D35 |

---

## 2. Chạy hệ thống ở local bằng Docker

### 2.1. Docker gồm những gì

```mermaid
flowchart LR
    B[Trình duyệt] -->|":8080"| N[nginx<br/>web SPA]
    N -->|"/api"| A[api<br/>NestJS]
    N -->|"/jd-files, /cv-files"| M[(minio)]
    A --> P[(postgres<br/>+ pgvector)]
    A --> R[(redis)]
    A <-->|"job, kết quả"| Q{{rabbitmq}}
    A --> M
    A -->|SMTP| MP[mailpit]
    Q <--> W[ai-worker<br/>FastStream]
    W --> P
    W --> M
    W -.->|HTTPS| L[Gemini / Claude API]
    AI[ai-api<br/>FastAPI] --> P
    AI --> Q
    MG[migrate<br/>chạy một lần] --> P
```

File [deploy/docker-compose.yml](../deploy/docker-compose.yml) khai báo 10 service. Ba image tự build từ mã nguồn, còn lại là image có sẵn.

| Service | Image | Vai trò | Cổng trên máy |
|---|---|---|---|
| `nginx` | Build từ `deploy/nginx.Dockerfile`: build web bằng `node:22-alpine`, chạy trên `nginx:1.30-alpine` | Cửa vào duy nhất. Phục vụ web; chuyển `/api` tới `api` và `/jd-files/`, `/cv-files/` tới `minio`. Kênh SSE không bị buffer | `8080` |
| `api` | Build từ `apps/api/Dockerfile` (`node:22-alpine`) | Core Backend NestJS. Kết nối DB bằng role `api_service` | Không mở; đi qua nginx |
| `migrate` | Cùng image với `api` | Chạy một lần mỗi lần `up`: áp migration, đặt mật khẩu cho hai role DB, rồi thoát | – |
| `ai-worker` | Build từ `ai-service/Dockerfile` (`python:3.12-slim`) | Nhận job AI, gọi LLM. Kết nối DB bằng role `ai_service`. Chạy nhiều bản sao được | – |
| `ai-api` | Cùng image với `ai-worker` | FastAPI của AI Service; hiện chỉ có `/health` | `127.0.0.1:8000` |
| `postgres` | `pgvector/pgvector:pg16` | CSDL, gồm schema `core` và `ai`. Cùng image với testcontainers | `127.0.0.1:5432` |
| `redis` | `redis:7.4-alpine`, bật AOF | Refresh token, pub/sub cho SSE | `127.0.0.1:6379` |
| `rabbitmq` | `rabbitmq:4.3-management-alpine` | Hàng đợi job AI | `127.0.0.1:5672`; giao diện quản lý `15672` |
| `minio` | `cgr.dev/chainguard/minio`, ghim theo digest | File CV, JD (mã hóa SSE-S3) và log LLM | `127.0.0.1:9000`; console `9001` |
| `mailpit` | `axllent/mailpit:v1.31` | SMTP giả: giữ lại mọi email để xem | `127.0.0.1:1025`; giao diện `8025` |

- **Thứ tự khởi động.** Compose dựa vào health check và điều kiện phụ thuộc:
    1. `postgres` healthy;
    2. `migrate` chạy xong và thoát với mã 0;
    3. `api` khởi động, khi `redis`, `rabbitmq` đã healthy;
    4. `nginx` khởi động, khi `api` đã healthy.

    `ai-worker` và `ai-api` khởi động sau bước 2, khi `rabbitmq` đã healthy.
- **Cổng.** Chỉ `nginx` mở ra mạng ngoài. Các cổng hạ tầng chỉ nghe trên `127.0.0.1`, dùng cho công cụ và cho chế độ dev.
- **Dữ liệu.** Dữ liệu nằm trong 4 named volume: `pgdata`, `redisdata`, `rabbitmqdata`, `miniodata`. `down` rồi `up` lại vẫn còn dữ liệu.
- **Ba role DB.** Mỗi service đăng nhập PostgreSQL bằng một role riêng:
    - `migrate` dùng tài khoản chủ;
    - `api` dùng `api_service`;
    - `ai-worker` và `ai-api` dùng `ai_service`.

    Quyền của từng role được cấp trong migration `0006`.

### 2.2. Chuẩn bị

- Docker Desktop (Windows, macOS) hoặc Docker Engine kèm Compose v2, và Docker phải đang chạy. Kiểm bằng `docker compose version`.
- Khoảng 2 GB RAM trống. Khi có embedding `bge-m3` (US-2.5), AI Service cần thêm 2–4 GB.
- Các cổng 8080, 5432, 6379, 5672, 15672, 9000, 9001, 1025, 8025, 8000 phải còn trống. Cổng nào bị chiếm thì đổi biến `*_HOST_PORT` tương ứng trong `deploy/.env`.
- Chạy bằng Docker không cần cài Node.js hay Python trên máy. Hai thứ này chỉ cần khi phát triển ([mục 2.9](#29-chạy-ở-chế-độ-phát-triển)).

Các lệnh dưới đây chạy tại gốc repo, trong Git Bash. Trên PowerShell, dùng `curl.exe` thay cho `curl`.

### 2.3. Dựng hệ thống

**Bước 1. Tạo file môi trường** (làm một lần):

```bash
cp deploy/.env.example deploy/.env
```

**Bước 2. Điền hai khóa bắt buộc** vào `deploy/.env`. Còn trống thì compose không chạy.

```bash
openssl rand -base64 32    # dán vào sau "MINIO_KMS_SECRET_KEY=srm-key:"
openssl rand -base64 48    # dán vào sau "JWT_ACCESS_SECRET="
```

- `MINIO_KMS_SECRET_KEY` có dạng `srm-key:<chuỗi base64>`. Đây là khóa mã hóa file trên MinIO; mất hoặc đổi khóa thì không đọc lại được file đã lưu.
- `JWT_ACCESS_SECRET` phải dài từ 32 ký tự và không được bắt đầu bằng `change-me`.
- Các mật khẩu mặc định khác (`change-me-postgres`…) chạy được trên máy cá nhân. Đổi hết trước khi cho người khác dùng chung máy. Mật khẩu chỉ nên gồm chữ, số và `-_.~`, vì chúng được ghép vào URL kết nối.

**Bước 3. Build và chạy:**

```bash
docker compose -f deploy/docker-compose.yml up -d --build --wait
```

- `--build` build ba image từ mã nguồn. Lần đầu mất vài phút.
- `--wait` chờ mọi service healthy và chờ `migrate` thoát với mã 0.

**Bước 4. Kiểm tra:**

```bash
docker compose -f deploy/docker-compose.yml ps
curl -fsS http://localhost:8080/api/health     # {"status":"ok",...}
curl -fsS http://localhost:8000/health         # {"status":"ok","postgres":"ok","rabbitmq":"ok"}
```

### 2.4. Tạo dữ liệu demo

DB mới dựng thì còn trống. Lệnh seed chạy ngay trong container `api`:

```bash
docker compose -f deploy/docker-compose.yml exec -e NODE_ENV=development api node dist/db/seed/dev-seed.js
```

- Seed từ chối chạy khi `NODE_ENV=production`, nên lệnh trên phải ghi đè biến này bằng `-e`.
- Chạy lại nhiều lần không tạo dữ liệu trùng.

Seed tạo các dữ liệu sau:

| Dữ liệu | Chi tiết |
|---|---|
| Tài khoản | Mật khẩu chung `Srm-Dev-12345`. `admin@srm.local` (Quản trị), `center@srm.local` (Trung tâm), `hr.alpha@srm.local` và `hr.beta@srm.local` (HR của hai công ty), `sv001@srm.local` và `sv002@srm.local` (sinh viên K66 ngành CNTT, KHMT) |
| Doanh nghiệp | Công ty Demo Alpha, Công ty Demo Beta |
| Đợt | "Đợt thực tập mẫu HK1 2026–2027" ở trạng thái nháp, chưa có mốc thời gian |
| JD | "Thực tập sinh Backend (JD mẫu)" của Alpha, đang chờ Trung tâm duyệt, có sẵn yêu cầu chuẩn hóa |

### 2.5. Địa chỉ truy cập

| Địa chỉ | Dùng để | Đăng nhập |
|---|---|---|
| <http://localhost:8080> | Web: ba cổng `/sv`, `/hr`, `/admin` | Tài khoản seed |
| <http://localhost:8025> | Mailpit: xem email hệ thống gửi | – |
| <http://localhost:15672> | RabbitMQ: xem hàng đợi, DLQ | `RABBITMQ_DEFAULT_USER` / `RABBITMQ_DEFAULT_PASS` |
| <http://localhost:9001> | MinIO console: xem bucket, file | `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` |
| <http://localhost:8000/health> | Health của AI Service | – |
| `localhost:5432` | PostgreSQL, mở bằng DBeaver, psql… | `POSTGRES_USER` / `POSTGRES_PASSWORD` |

Swagger bị tắt khi chạy bằng compose, vì `api` chạy ở chế độ production. Muốn dùng Swagger thì chạy API ở chế độ dev ([mục 2.9](#29-chạy-ở-chế-độ-phát-triển)).

### 2.6. Kịch bản demo (khoảng 10 phút)

1. **Mở đợt.** Đăng nhập `center@srm.local`, vào "Đợt thực tập" và mở đợt mẫu.
    - Đặt ba mốc thời gian trong tương lai, rồi bấm "Mở đợt".
    - Sinh viên K66 nhận thông báo "Đợt thực tập đã mở", trong app và qua email. Email xem ở Mailpit.
2. **Duyệt JD mẫu.** Vào "Duyệt JD", mở JD mẫu của Alpha và duyệt.
3. **Mời HR.** Vào "Doanh nghiệp" → Công ty Demo Alpha, rồi mời một HR mới.
    - Email mời hiện trong Mailpit.
    - Mở link trong cửa sổ ẩn danh và đặt mật khẩu; HR được đăng nhập luôn.
4. **Đăng JD.** Đăng nhập `hr.alpha@srm.local`, vào "JD của tôi" và tạo JD. Nhập mô tả, có thể kèm file PDF, rồi nộp.
    - **Ở chế độ `fixture` (mặc định):** JD hiện "Chờ HR nhập yêu cầu". HR nhập kỹ năng, điều kiện cứng, nhóm vị trí rồi xác nhận.
    - **Khi đã bật Gemini ([mục 2.7](#27-bật-phân-tích-jd-bằng-llm-thật)):** JD hiện "Đang phân tích". Sau vài giây đề xuất hiện ra mà không cần tải lại trang. HR sửa rồi xác nhận.
    - Sau khi xác nhận, JD chuyển sang "Chờ Trung tâm duyệt".
5. **Duyệt JD vừa đăng.** Trung tâm vào lại "Duyệt JD": thấy JD gốc cạnh yêu cầu chuẩn hóa. Bấm duyệt.
6. **Nộp CV.** Đăng nhập `sv001@srm.local` (nên dùng chế độ thiết bị 360 px của trình duyệt), vào "Hồ sơ".
    - Đồng ý điều khoản, rồi tải CV lên. CV hiện "Chờ phân tích".
    - Tải thêm một bản nữa: lịch sử có hai phiên bản, nhưng chỉ bản mới là hiệu lực.
7. **Xem phía sau.**
    - RabbitMQ: hàng đợi `ai.jd.analyze`, `ai.results`.
    - PostgreSQL: bảng `core.audit_logs` (nhật ký mọi thao tác), `ai.jobs`, `ai.llm_calls`.

### 2.7. Bật phân tích JD bằng LLM thật

Thêm vào `deploy/.env`:

```bash
LLM_PROVIDER=gemini
GEMINI_API_KEY=...          # lấy ở Google AI Studio; free tier chỉ dùng với dữ liệu giả
```

Sau đó khởi động lại riêng worker:

```bash
docker compose -f deploy/docker-compose.yml up -d ai-worker
docker compose -f deploy/docker-compose.yml logs -f ai-worker
```

- Dùng Claude thì đặt `LLM_PROVIDER=anthropic` và `ANTHROPIC_API_KEY`.
- Thiếu key của nhà cung cấp đã chọn thì `ai-worker` dừng ngay lúc khởi động và in tên biến còn thiếu.

### 2.8. Vận hành và lỗi thường gặp

```bash
docker compose -f deploy/docker-compose.yml logs -f api            # xem log một service
docker compose -f deploy/docker-compose.yml up -d --scale ai-worker=2   # chạy thêm worker
docker compose -f deploy/docker-compose.yml down                   # dừng, GIỮ dữ liệu
docker compose -f deploy/docker-compose.yml down -v                # dừng và XÓA mọi volume
```

Kéo code mới về thì chạy lại `up -d --build --wait`. Migration nằm trong image, nên phải build lại thì migration mới được áp.

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `failed to connect to the docker API at npipe:...` | Docker Desktop chưa chạy | Mở Docker Desktop, chờ engine sẵn sàng |
| `set X in deploy/.env` | Thiếu biến bắt buộc | Điền biến đó. `deploy/.env` tạo trước 0.7.0 còn thiếu `API_DB_PASSWORD`, `AI_DB_PASSWORD` |
| `port is already allocated` | Cổng đã bị chương trình khác chiếm | Đổi `*_HOST_PORT` hoặc `NGINX_PORT` trong `deploy/.env` |
| `service "migrate" didn't complete successfully` | Migration lỗi | Xem `logs migrate` |
| API không khởi động, log báo lỗi `JWT_ACCESS_SECRET` | Khóa ngắn hơn 32 ký tự hoặc bắt đầu bằng `change-me` | Sinh khóa mới theo bước 2 |
| Không đăng nhập được PostgreSQL, RabbitMQ hay MinIO sau khi đổi mật khẩu trong `.env` | Tài khoản chỉ được tạo ở lần đầu khởi tạo volume | Đổi mật khẩu trong chính service đó, hoặc `down -v` để tạo lại (mất dữ liệu) |
| JD nào cũng "Chờ HR nhập yêu cầu" | Đang ở chế độ `fixture` | Bật LLM theo mục 2.7 |

Bảng biến môi trường đầy đủ nằm ở [DEPLOY.md](../DEPLOY.md).

### 2.9. Chạy ở chế độ phát triển

Khi sửa code, chạy hạ tầng bằng Docker, còn API và web chạy thẳng trên máy để tự nạp lại khi sửa. Chế độ này có Swagger. Cần Node 22 (`nvm use`) và `pnpm install`.

```bash
docker compose -f deploy/docker-compose.yml up -d --wait postgres redis rabbitmq minio mailpit
export DATABASE_URL=postgres://srm:change-me-postgres@localhost:5432/srm
export REDIS_URL=redis://localhost:6379
export RABBITMQ_URL=amqp://srm:change-me-rabbitmq@localhost:5672
export JWT_ACCESS_SECRET=dev-only-jwt-access-secret-0123456789
export MINIO_ENDPOINT=http://localhost:9000 MINIO_ACCESS_KEY=srm-minio MINIO_SECRET_KEY=change-me-minio
export WEB_ORIGIN=http://localhost:5173
API_DB_PASSWORD=change-me-api-service AI_DB_PASSWORD=change-me-ai-service pnpm --filter @srm/api db:migrate
pnpm --filter @srm/api db:seed
pnpm --filter @srm/api dev     # API ở :3000, Swagger ở http://localhost:3000/api/docs
pnpm --filter @srm/web dev     # web ở http://localhost:5173
```

Giá trị trong các lệnh trên lấy từ `deploy/.env.example`. Đã đổi mật khẩu hay cổng trong `deploy/.env` thì sửa theo. Chi tiết ở [docs/SETUP.md](../docs/SETUP.md).

---

## 3. Tổ chức mã nguồn

### 3.1. Tổng quan

Mã nguồn là một monorepo pnpm, gồm ba phần chạy được và một gói dùng chung:

```
Smart-Recruit-Match/
├── apps/
│   ├── api/                  # Core Backend: NestJS, TypeScript strict, Drizzle ORM
│   └── web/                  # Web App: React 19, Vite, Tailwind CSS, shadcn/ui
├── packages/
│   └── shared/               # Dùng chung web và API: Zod schema, bảng chuyển trạng thái, hợp đồng message
├── ai-service/               # AI Service: Python 3.12, FastStream (worker), FastAPI
├── deploy/                   # docker-compose.yml, nginx.conf, nginx.Dockerfile, .env.example
├── scripts/                  # Sinh hợp đồng TS → Python, kiểm luật ranh giới, cổng commit
├── docs/                     # PRD, ARCHITECTURE, CONTEXT, LESSONS, SETUP; sprints/ (epic, story, sprint)
├── reports/                  # Báo cáo tiến độ, báo cáo thiết kế
├── .github/workflows/ci.yml  # CI
├── .dependency-cruiser.cjs   # Luật ranh giới module của API
├── AGENTS.md, CLAUDE.md      # Chỉ dẫn cho agent AI hỗ trợ code
├── DESIGN.md                 # Quy chuẩn giao diện
└── DEPLOY.md                 # Hướng dẫn Docker Compose
```

| Phần | Phụ thuộc vào | Giao tiếp với phần khác |
|---|---|---|
| `apps/web` | `packages/shared` | Gọi REST `/api`, nhận SSE. Kiểu dữ liệu của client sinh từ OpenAPI |
| `apps/api` | `packages/shared` | Ghi PostgreSQL `core`; gửi job và nhận kết quả qua RabbitMQ |
| `ai-service` | Model Pydantic sinh từ `packages/shared/contracts` | Đọc view `core.v_ai_*`, ghi schema `ai`; nhận job và trả kết quả qua RabbitMQ |

### 3.2. `apps/api`: Core Backend

```
apps/api/
├── src/
│   ├── main.ts, app.module.ts, app.setup.ts   # khởi động, nạp module, cấu hình chung
│   ├── modules/              # 7 module nghiệp vụ, mỗi module 4 tầng:
│   │   └── <module>/
│   │       ├── api/              # controller, DTO: tầng HTTP
│   │       ├── application/      # service: use case, giao dịch, listener sự kiện, tác vụ định kỳ
│   │       ├── domain/           # hàm thuần: quy tắc nghiệp vụ, sự kiện; không import NestJS hay Drizzle
│   │       ├── infrastructure/   # repository (Drizzle), Redis, SMTP, AMQP
│   │       └── index.ts          # phần module cho phép module khác dùng
│   ├── common/               # dùng chung giữa các module
│   │   ├── auth/                 # guard phân quyền, JWT, kiểm phạm vi bản ghi
│   │   ├── state/                # transitionTo
│   │   ├── storage/              # MinIO, kiểm file tải lên, URL tạm
│   │   ├── errors/, validation/  # định dạng lỗi chung, pipe Zod
│   │   └── clock/, events/, scheduling/, config/
│   ├── db/                   # schema Drizzle (schema/), migrator, seed dev
│   └── health/, redis/, openapi/
├── drizzle/                  # 11 migration SQL, sinh bằng drizzle-kit (một số viết tay)
└── test/
    ├── integration/          # 30 file integration test (testcontainers)
    ├── helpers/, fixtures/   # dựng app test, đăng nhập theo vai trò, dữ liệu mẫu
    └── setup/                # khởi động container PostgreSQL, Redis, RabbitMQ, MinIO
```

| Module | Trách nhiệm | Bảng sở hữu |
|---|---|---|
| `iam` | Đăng nhập, refresh token, lời mời HR, quản trị tài khoản, `UserDirectory` | `users` |
| `campaign` | Đợt thực tập, tham số, mốc, tự chuyển pha, `assertPhase` | `campaigns` |
| `company` | Doanh nghiệp, JD, nộp và duyệt JD, nhận kết quả phân tích JD, yêu cầu chuẩn hóa và phiên bản | `companies`, `job_descriptions` |
| `student` | Sinh viên, đồng ý điều khoản, nộp CV | `students`, `consents`, `cvs` |
| `notification` | Thông báo trong app, SSE, email outbox, nhắc hạn | `notifications` |
| `aigateway` | Gửi job AI, nhận `ai.results`, phát sự kiện `ai.result.<TYPE>` cho module sở hữu | – |
| `audit` | Ghi nhật ký thao tác trong cùng giao dịch với thay đổi | `audit_logs` |

- **Ranh giới module.** Module không truy vấn bảng của module khác. Muốn dùng dữ liệu của module khác thì gọi service đã export qua `index.ts`, hoặc nghe sự kiện.
    - Ví dụ: `company` không đọc bảng `campaigns`; nó gọi `CampaignService.assertPhase`.
    - `notification` không biết JD là gì; nó nghe sự kiện do `company` phát.
- **Tầng `domain/`.** Đây là nơi đặt các quyết định nghiệp vụ dưới dạng hàm thuần, nên unit test được mà không cần DB. Ví dụ:
    - `decideAnalysisResult`: áp dụng hay bỏ qua kết quả AI;
    - `decideRequirementsEdit`: sửa tại chỗ, tạo phiên bản mới hay từ chối.

Ví dụ đường đi của một thao tác, khi HR xác nhận yêu cầu chuẩn hóa:

1. Web: [requirements-form.tsx](../apps/web/src/features/jds/requirements/requirements-form.tsx) kiểm form bằng schema dùng chung, rồi gọi `PUT /api/jds/{id}/requirements/confirm`.
2. Controller: [jd-requirements.controller.ts](../apps/api/src/modules/company/api/jd-requirements.controller.ts) kiểm quyền (chỉ HR) và validate body bằng cùng schema Zod.
3. Service: [jd-requirements.service.ts](../apps/api/src/modules/company/application/jd-requirements.service.ts) làm mọi việc trong một giao dịch:
    1. Khóa dòng JD, rồi kiểm lần lượt: JD thuộc công ty của HR (không thì `404`), `row_version` (lệch thì `409`), JD còn đang chờ xác nhận, và đợt đang đúng pha.
    2. Ghi yêu cầu và nhật ký thao tác.
    3. Gọi `transitionTo('PENDING_APPROVAL')`. Hàm này kiểm bước chuyển và ghi thêm một dòng nhật ký.

    Bước nào lỗi thì cả giao dịch hủy, không ghi gì.

### 3.3. `apps/web`: Web App

```
apps/web/src/
├── app/                      # router, guard theo vai trò, layout của 3 cổng, menu (navigation.ts), phiên đăng nhập
├── features/                 # màn hình, chia theo cổng
│   ├── auth/                     # đăng nhập, nhận lời mời
│   ├── center/                   # campaigns/, companies/, jd-approval/
│   ├── hr/jds/                   # danh sách, form, nộp JD của HR
│   ├── jds/                      # phần JD dùng chung cho HR và Trung tâm; requirements/ là khối yêu cầu chuẩn hóa
│   └── student/                  # home/, profile/ (đồng ý điều khoản, CV)
├── shared/                   # api/ (client, kiểu sinh từ openapi.json, upload có tiến độ),
│                             # files/, forms/, notifications/ (SSE, chuông, useServerEvent)
├── components/ui/            # 24 primitive shadcn/ui
└── hooks/, lib/
```

- Mỗi màn hình mới thêm route vào [router.tsx](../apps/web/src/app/router.tsx). Menu của mọi vai trò khai báo ở [navigation.ts](../apps/web/src/app/navigation.ts).
- Kiểu request và response không viết tay. Đổi API thì chạy `pnpm api:sync` để sinh lại `openapi.json` và `schema.d.ts`; CI báo lỗi khi hai file này lệch với API.
- Form dùng React Hook Form với cùng schema Zod mà API dùng. Server và client vì vậy kiểm theo một quy tắc duy nhất.

### 3.4. `packages/shared`: phần dùng chung

| Thư mục | Nội dung |
|---|---|
| `states/` | Bảng chuyển trạng thái của đợt, JD, CV ([machine.ts](../packages/shared/states/machine.ts)). Web dùng để hiển thị; API dùng trong `transitionTo`; DB dùng để sinh ràng buộc CHECK |
| `schemas/` | Schema Zod của request, response: đăng nhập, đợt, doanh nghiệp, JD, CV, đồng ý, thông báo, mã lỗi, vai trò, cổng |
| `contracts/` | Hợp đồng message AI ([jobs.ts](../packages/shared/contracts/jobs.ts), [jd.ts](../packages/shared/contracts/jd.ts)), tên hàng đợi; `json-schema/` là file sinh ra |
| `consent/` | Văn bản điều khoản xử lý dữ liệu, có phiên bản |

### 3.5. `ai-service`: AI Service

```
ai-service/
├── app/
│   ├── worker.py             # điểm vào worker: dựng LLMClient, registry prompt, MinIO, handler
│   ├── main.py               # FastAPI: /health
│   ├── consumers/            # nhận job: chống xử lý trùng (ai.jobs), thử lại, DLQ, gửi ai.results
│   ├── handlers/             # ánh xạ loại job → handler (build_handlers); CV còn handler giả (fake.py)
│   ├── agents/jd_analyzer/   # source.py đọc JD từ view và MinIO; agent.py gọi LLM
│   ├── llm/                  # LLMClient, StructuredLLMClient, ghi ai.llm_calls và llm-logs
│   │   └── providers/            # adapter Gemini, Anthropic, fixture: nơi duy nhất import SDK LLM
│   ├── prompts/              # jd_analyzer/v1.md, manifest.json (băm), active.json (bản đang dùng)
│   ├── parsing/              # trích văn bản PDF, DOCX; phát hiện chữ ẩn
│   ├── contracts/            # model Pydantic SINH TỰ ĐỘNG từ Zod, không sửa tay
│   └── config.py, queues.py, storage.py
├── evals/                    # chạy tay với API thật (smoke_llm.py)
└── tests/                    # pytest: xóa key, chặn mạng, dùng fixture LLM
```

Thêm một agent mới thì làm theo mẫu `agents/jd_analyzer/`:

1. Đọc dữ liệu qua view `core.v_ai_*`.
2. Gọi `LLMClient.generate` với prompt có phiên bản và effort ghi rõ.
3. Đăng ký handler trong `build_handlers`.

### 3.6. Quy tắc được kiểm tự động

Các quy tắc sau giữ cho cấu trúc không bị phá dần theo thời gian. Phần lớn chạy trên CI ở mỗi push.

| Quy tắc | Kiểm bằng |
|---|---|
| `domain/` không import NestJS hay Drizzle; module chỉ dùng module khác qua `index.ts` | `pnpm depcruise` (dependency-cruiser). `pnpm depcruise:fixture` chứng minh luật còn bắt được vi phạm |
| Migration khớp schema Drizzle | CI chạy `db:generate` và báo lỗi nếu sinh ra file mới |
| Kiểu client của web khớp API | CI chạy `api:sync` rồi so `openapi.json`, `schema.d.ts` |
| Hợp đồng message TS và Python khớp nhau | CI chạy `contracts:gen` rồi so kết quả |
| Mọi route đều khai báo quyền | [route-guards.int-spec.ts](../apps/api/test/integration/route-guards.int-spec.ts) |
| Chỉ `app/llm/` được import SDK của Gemini và Claude | [test_no_direct_sdk_import.py](../ai-service/tests/llm/test_no_direct_sdk_import.py) |
| Prompt đã phát hành không bị sửa | Băm trong `manifest.json`, kiểm bằng [test_prompt_manifest.py](../ai-service/tests/prompts/test_prompt_manifest.py) |
| Commit ship code phải tăng `VERSION` và có mục CHANGELOG | Cổng commit koni-harness (`.koni-harness/`) |

---

## Phụ lục. Mã nguồn tiêu biểu từ sau báo cáo 09/10

| File | Minh họa cho |
|---|---|
| [apps/api/src/modules/campaign/application/campaign-phase.scheduler.ts](../apps/api/src/modules/campaign/application/campaign-phase.scheduler.ts) | Tự chuyển pha đợt theo mốc, có advisory lock |
| [apps/api/src/common/storage/](../apps/api/src/common/storage/) | Lưu file mã hóa, kiểm loại file, URL tạm, quyền theo bản ghi |
| [apps/api/drizzle/0003_cv_consent.sql](../apps/api/drizzle/0003_cv_consent.sql) | Partial unique index cho BR-01 |
| [apps/api/src/modules/notification/application/email-outbox.worker.ts](../apps/api/src/modules/notification/application/email-outbox.worker.ts) | Email outbox, `FOR UPDATE SKIP LOCKED` |
| [apps/api/src/modules/aigateway/](../apps/api/src/modules/aigateway/) | Gửi job AI, nhận kết quả |
| [apps/api/drizzle/0006_ai_views_roles.sql](../apps/api/drizzle/0006_ai_views_roles.sql) | View che thông tin cá nhân, hai role DB |
| [apps/api/src/modules/company/domain/requirements-versioning.ts](../apps/api/src/modules/company/domain/requirements-versioning.ts) | Hàm thuần quyết định phiên bản yêu cầu (BR-18) |
| [scripts/gen-contracts.mjs](../scripts/gen-contracts.mjs) | Sinh JSON Schema và Pydantic từ Zod |
| [ai-service/app/consumers/](../ai-service/app/consumers/) | Worker chống xử lý trùng, thử lại, DLQ |
| [ai-service/app/llm/structured.py](../ai-service/app/llm/structured.py) | Refusal, thử lại khi sai schema, ghi nhật ký |
| [ai-service/app/parsing/pdf.py](../ai-service/app/parsing/pdf.py) | Phát hiện chữ ẩn trong PDF |
| [ai-service/app/prompts/jd_analyzer/v1.md](../ai-service/app/prompts/jd_analyzer/v1.md) | Prompt có phiên bản; dữ liệu JD đặt trong thẻ riêng |
| [apps/web/src/features/jds/requirements/](../apps/web/src/features/jds/requirements/) | Màn xem, sửa, xác nhận yêu cầu chuẩn hóa |
| [apps/web/src/shared/notifications/](../apps/web/src/shared/notifications/) | SSE và chuông thông báo |
| [apps/api/test/integration/jd-requirements.int-spec.ts](../apps/api/test/integration/jd-requirements.int-spec.ts) | Integration test của luồng xác nhận yêu cầu, chống truy cập chéo |
