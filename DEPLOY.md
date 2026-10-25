# DEPLOY — Chạy Smart Recruit Match bằng Docker Compose

Đồ án chỉ triển khai bằng Docker Compose trên một máy để demo, không có môi trường cloud ([US-1.1](docs/sprints/stories/US-1.1-scaffold-monorepo-docker-compose-ci.md) › *What we explicitly did NOT do*). Cài đặt máy phát triển xem [docs/SETUP.md](docs/SETUP.md).

## Yêu cầu

- Docker Engine và Docker Compose v2 (`docker compose version`).
- Khoảng 2 GB RAM trống cho hạ tầng. Từ US-2.1, AI Service chạy `bge-m3` nên cần thêm 2–4 GB.

## Chạy

```bash
# Tại gốc repo, làm một lần:
cp deploy/.env.example deploy/.env      # rồi đổi mọi mật khẩu

# Dựng, áp migration DB và chờ mọi service chạy (có healthcheck thì chờ healthy):
docker compose -f deploy/docker-compose.yml up -d --build --wait
docker compose -f deploy/docker-compose.yml ps

# Kiểm tra:
curl -fsS http://localhost:8080/api/health     # {"status":"ok",...}
curl -fsS http://localhost:8000/health         # AI Service: {"status":"ok","postgres":"ok","rabbitmq":"ok"}
# Web (SPA): mở http://localhost:8080/ trong trình duyệt
```

Compose tự đọc `deploy/.env`, vì thư mục project là thư mục chứa file compose. Thiếu biến bắt buộc thì compose dừng ngay và báo tên biến.

| Service | Image | Cổng trên máy (mặc định) | Ghi chú |
|---|---|---|---|
| `nginx` | build từ `deploy/nginx.Dockerfile` | `NGINX_PORT` (8080) | Phục vụ web, proxy `/api`. SSE `/api/events/stream` không buffer |
| `migrate` | build từ `apps/api/Dockerfile` (cùng image `api`) | – | Chạy một lần mỗi lần `up`: áp migration SQL rồi thoát với mã 0 ([CONTEXT D24](docs/CONTEXT.md)) |
| `api` | build từ `apps/api/Dockerfile` | – (qua nginx) | NestJS. Chờ `migrate` thoát thành công và `postgres`, `redis` healthy rồi mới chạy |
| `postgres` | `pgvector/pgvector:pg16` | 127.0.0.1:5432 | Cùng image với testcontainers |
| `redis` | `redis:7.4-alpine` | 127.0.0.1:6379 | Bật AOF |
| `rabbitmq` | `rabbitmq:4.3-management-alpine` | 127.0.0.1:5672, UI 15672 | `hostname` cố định để giữ dữ liệu |
| `minio` | `cgr.dev/chainguard/minio@sha256:…` | 127.0.0.1:9000, console 9001 | [CONTEXT D23](docs/CONTEXT.md) |
| `mailpit` | `axllent/mailpit:v1.31` | 127.0.0.1:1025 (SMTP), UI 8025 | Bắt email khi phát triển |
| `ai-worker` | build từ `ai-service/Dockerfile` | – | Worker FastStream nhận job AI (`ai.cv.parse`, `ai.jd.analyze`). Chạy nhiều bản sao được: `up -d --scale ai-worker=2` ([CONTEXT D33](docs/CONTEXT.md)) |
| `ai-api` | build từ `ai-service/Dockerfile` (cùng image `ai-worker`) | 127.0.0.1:8000 | FastAPI của AI Service. `GET /health` trả 200 khi kết nối được PostgreSQL (role `ai_service`) và RabbitMQ, ngược lại 503 |

Cổng hạ tầng chỉ mở trên `127.0.0.1`. Nếu cổng đã bị chiếm, đổi biến `*_HOST_PORT` trong `deploy/.env`.

## Migration cơ sở dữ liệu

Service `migrate` áp các file SQL trong `apps/api/drizzle/` (sinh bằng drizzle-kit, cùng migration tay như trigger của `audit_logs`) bằng migrator của Drizzle, rồi thoát. Migration đã áp được ghi trong bảng `drizzle.__drizzle_migrations`, nên `up` lần sau chỉ áp phần mới. `--wait` chờ `migrate` thoát với mã 0, vì `api` phụ thuộc vào nó bằng `service_completed_successfully`.

```bash
docker compose -f deploy/docker-compose.yml logs migrate     # "migrate: applied migrations from /app/drizzle"
```

- Migration lỗi thì `migrate` thoát khác 0, `api` không khởi động và `up --wait` báo `service "migrate" didn't complete successfully`. Đọc log ở lệnh trên.
- Code có migration mới thì phải build lại image (`up -d --build`), vì migration nằm trong image.
- Migrator chỉ áp migration có mốc thời gian mới hơn migration cuối đã áp. Không sửa hay đổi thứ tự file migration đã chạy ([LESSONS §6](docs/LESSONS.md)).
- Từ 0.7.0, migration `0006` tạo hai role `api_service`, `ai_service` (cần `POSTGRES_USER` có quyền `CREATEROLE`; superuser của image có sẵn). Sau migration, `migrate` bật đăng nhập cho hai role bằng `API_DB_PASSWORD`, `AI_DB_PASSWORD` ([CONTEXT D33](docs/CONTEXT.md)).

## AI Service và hàng đợi

Từ 0.7.0, `api` gửi job AI qua RabbitMQ và `ai-worker` xử lý, rồi trả kết quả qua `ai.results` ([CONTEXT D33](docs/CONTEXT.md)). Từ 0.9.0, job `JD_ANALYZE` chạy JD Analyzer thật qua LLM ([CONTEXT D35](docs/CONTEXT.md)). Từ 0.10.0, job `CV_PARSE` chạy CV Parser thật: `api` mã hóa thông tin cá nhân trích từ CV bằng `PII_ENCRYPTION_KEY` trước khi lưu ([CONTEXT D37](docs/CONTEXT.md)).

**Bật LLM.** Mặc định `LLM_PROVIDER=fixture`: stack chạy được khi chưa có key, nhưng LLM chỉ trả lời các request đã ghi sẵn cho test. Vì vậy mọi JD và CV thật đều phân tích lỗi: HR nhập yêu cầu bằng tay, CV hiện "Lỗi phân tích" và nằm ở trang "CV cần xử lý" của Trung tâm. Muốn phân tích thật, đặt trong `deploy/.env`:

```bash
LLM_PROVIDER=gemini
GEMINI_API_KEY=...        # free tier chỉ dùng với dữ liệu giả (CONTEXT D34)
```

rồi chạy `docker compose -f deploy/docker-compose.yml up -d ai-worker`. Thiếu key của nhà cung cấp đã chọn thì `ai-worker` dừng ngay lúc khởi động và in tên biến thiếu. Từng lượt gọi LLM được ghi ở bảng `ai.llm_calls`; request và response đầy đủ nằm ở bucket `llm-logs`. AI Service tạo bucket này, bật SSE-S3, ở lần ghi đầu.

**Điều khoản v2.** Từ 0.10.0, điều khoản hiện hành là `TERMS_V2` (ghi tên Google và Anthropic). Sinh viên đã đồng ý v1 phải đồng ý lại trước khi nộp CV. Chỉ gửi CV thật cho Gemini với gói trả phí ([CONTEXT D34, D37](docs/CONTEXT.md)).

**Gửi lại CV chưa phân tích.** CV nộp trước 0.10.0 (hoặc nộp khi RabbitMQ lỗi) nằm ở "Đang phân tích" mà không có job. Lệnh dưới gửi job cho mọi CV đang dùng còn chờ phân tích; `--retry-failed` gửi lại cả CV "Lỗi phân tích"; `--campaign N` giới hạn trong một đợt. Lệnh chạy từ máy host với cùng biến môi trường như API ngoài Docker ([SETUP](docs/SETUP.md)), cổng theo `POSTGRES_HOST_PORT`, `RABBITMQ_HOST_PORT`:

```bash
pnpm --filter @srm/api cv:redispatch -- --retry-failed --campaign 1
```

```bash
docker compose -f deploy/docker-compose.yml up -d --scale ai-worker=2     # thêm bản sao worker
docker compose -f deploy/docker-compose.yml logs -f ai-worker
```

- Queue `ai.cv.parse`, `ai.jd.analyze`, `ai.results` và các `*.dlq` được khai báo khi `api` hoặc `ai-worker` kết nối. Xem ở giao diện RabbitMQ `http://localhost:<RABBITMQ_UI_HOST_PORT>` (tài khoản `RABBITMQ_DEFAULT_USER`).
- Job lỗi tạm thời được thử lại sau 2 s rồi 10 s; lần thứ 3 lỗi thì vào `<queue>.dlq`. Message trong DLQ có header `x-srm-dlq-reason`, `x-srm-attempts`, `x-srm-source-queue`. Chưa có màn quản trị DLQ trong web; xử lý bằng giao diện RabbitMQ (*Get messages*, *Move messages*).
- Trạng thái từng job nằm ở bảng `ai.jobs` (`status`, `attempts`, `last_error`).

## Dừng, dữ liệu và làm sạch

```bash
docker compose -f deploy/docker-compose.yml down        # dừng, GIỮ dữ liệu
docker compose -f deploy/docker-compose.yml down -v     # dừng và XÓA mọi volume (mất dữ liệu)
```

Dữ liệu nằm trong các named volume `smart-recruit-match_pgdata`, `_redisdata`, `_rabbitmqdata`, `_miniodata`. Chạy `down` rồi `up` lại (không có `-v`) thì dữ liệu vẫn còn.

Tài khoản PostgreSQL, RabbitMQ và MinIO chỉ được tạo ở lần đầu khởi động volume. Nếu đổi mật khẩu trong `.env` sau đó, phải đổi trong chính service đó, hoặc xóa volume để tạo lại.

## Biến môi trường

Nguồn: `deploy/.env` (sao từ [`deploy/.env.example`](deploy/.env.example)). Không commit file `.env` thật.

| Env var | Required | Source | Notes |
|---|---|---|---|
| `POSTGRES_USER` | Required | Tự đặt | Superuser tạo lúc khởi tạo volume `pgdata` |
| `POSTGRES_PASSWORD` | Required | Tự đặt, mật khẩu mạnh | Đổi sau khi khởi tạo thì phải `ALTER USER` |
| `POSTGRES_DB` | Required | Tự đặt | Database mặc định |
| `DATABASE_URL` | – (compose tự ghép) | `migrate`: `postgres://POSTGRES_USER:POSTGRES_PASSWORD@postgres:5432/POSTGRES_DB`; `api`: `postgres://api_service:API_DB_PASSWORD@postgres:5432/POSTGRES_DB` | Vì được ghép thành URL, các mật khẩu chỉ nên gồm chữ, số và `-_.~`. Chạy API ngoài Docker thì tự đặt, host `localhost` và cổng `POSTGRES_HOST_PORT` |
| `API_DB_PASSWORD` | Required | Tự đặt, ≥ 12 ký tự chữ, số, `-_.~` | Mật khẩu role `api_service` mà `api` dùng: đọc ghi `core`, chỉ đọc `ai`. `migrate` đặt lại mật khẩu mỗi lần chạy, nên đổi trong `.env` rồi `up` là đủ ([CONTEXT D33](docs/CONTEXT.md)) |
| `AI_DB_PASSWORD` | Required | Tự đặt, ≥ 12 ký tự chữ, số, `-_.~` | Mật khẩu role `ai_service` mà `ai-worker`, `ai-api` dùng: chỉ đọc view `core.v_ai_*`, đọc ghi `ai` |
| `RABBITMQ_DEFAULT_USER` | Required | Tự đặt | User tạo lúc khởi tạo volume `rabbitmqdata` |
| `RABBITMQ_DEFAULT_PASS` | Required | Tự đặt, mật khẩu mạnh, chỉ gồm chữ, số và `-_.~` | Được ghép vào `RABBITMQ_URL` |
| `RABBITMQ_URL` | – (compose tự ghép) | `amqp://RABBITMQ_DEFAULT_USER:RABBITMQ_DEFAULT_PASS@rabbitmq:5672` | `api`, `ai-worker`, `ai-api` đọc: gửi job AI và nhận `ai.results` ([CONTEXT D33](docs/CONTEXT.md)). Chạy API ngoài Docker thì tự đặt, host `localhost` và cổng `RABBITMQ_HOST_PORT` |
| `MINIO_ENDPOINT` | Required | `http://minio:9000` với service đi kèm; hoặc URL của MinIO/S3 ngoài | Địa chỉ API và `ai-worker` gọi MinIO. Ngoài Docker dùng `http://localhost:9000`. API tạo bucket `jd-files`, `cv-files` ở lần tải file đầu tiên và mã hóa mọi object bằng SSE-S3 (CONTEXT D28); `ai-worker` đọc file JD gốc và ghi log LLM vào `llm-logs` bằng cùng tài khoản |
| `MINIO_ACCESS_KEY` | Required | Tự đặt với service đi kèm; hoặc access key của MinIO/S3 ngoài | Đồng thời là `MINIO_ROOT_USER` của service `minio` |
| `MINIO_SECRET_KEY` | Required | Tự đặt (≥ 8 ký tự); hoặc secret key của MinIO/S3 ngoài | Đồng thời là `MINIO_ROOT_PASSWORD` |
| `MINIO_PUBLIC_ENDPOINT` | Optional (`http://localhost:<NGINX_PORT>`) | Địa chỉ người dùng mở web, ví dụ `https://srm.example.edu.vn` | URL tải file (hạn 5 phút) được ký với host này; nginx chuyển `/jd-files/`, `/cv-files/` sang MinIO nên cổng MinIO không cần mở ra ngoài. Sai host thì MinIO từ chối chữ ký (CONTEXT D29) |
| `MINIO_KMS_SECRET_KEY` | Required (service `minio` đi kèm) | `srm-key:` + `openssl rand -base64 32` | Khóa mã hóa phía server của MinIO; thiếu thì compose không chạy. Mất hoặc đổi khóa thì không đọc được file đã lưu, nên sao lưu cùng volume `miniodata` (CONTEXT D28) |
| `NGINX_PORT` | Optional (8080) | Tự đặt | Cổng web trên máy |
| `POSTGRES_HOST_PORT` | Optional (5432) | Tự đặt | Cổng PostgreSQL trên 127.0.0.1 |
| `REDIS_HOST_PORT` | Optional (6379) | Tự đặt | |
| `RABBITMQ_HOST_PORT` | Optional (5672) | Tự đặt | AMQP |
| `RABBITMQ_UI_HOST_PORT` | Optional (15672) | Tự đặt | Giao diện quản lý |
| `MINIO_HOST_PORT` | Optional (9000) | Tự đặt | API S3 |
| `MINIO_CONSOLE_HOST_PORT` | Optional (9001) | Tự đặt | Console |
| `MAILPIT_SMTP_HOST_PORT` | Optional (1025) | Tự đặt | |
| `MAILPIT_UI_HOST_PORT` | Optional (8025) | Tự đặt | |
| `AI_API_HOST_PORT` | Optional (8000) | Tự đặt | Cổng của `ai-api` (`/health`) trên 127.0.0.1 |
| `AI_DATABASE_URL` | – (compose tự ghép) | `postgres://ai_service:AI_DB_PASSWORD@postgres:5432/POSTGRES_DB` | `ai-worker`, `ai-api` đọc. Role `ai_service` chỉ đọc view `core.v_ai_*` và đọc ghi schema `ai` |
| `LLM_PROVIDER` | Optional (`fixture` trong compose) | `gemini`, `anthropic` hoặc `fixture` | Nhà cung cấp LLM của `ai-worker` ([CONTEXT D34](docs/CONTEXT.md), [D35](docs/CONTEXT.md)). `fixture` chỉ trả lời request đã ghi sẵn, nên phân tích JD thật luôn lỗi và HR nhập tay |
| `GEMINI_API_KEY` | Required khi `LLM_PROVIDER=gemini` | Google AI Studio | Free tier chỉ dùng với dữ liệu giả; dữ liệu thật dùng paid tier (CONTEXT D34) |
| `ANTHROPIC_API_KEY` | Required khi `LLM_PROVIDER=anthropic` | Claude Console | |
| `LLM_MODEL` | Optional (trống = mặc định của nhà cung cấp) | Tên model | Mặc định `gemini-3.8-flash` hoặc `claude-opus-5-5` |
| `CV_MASK_CONTACTS` | Optional (`true`) | `true`/`false` | `ai-worker` che email, SĐT của CV có chữ trước khi gửi LLM (NFR-3, [CONTEXT D37](docs/CONTEXT.md)). Giữ `true` |
| `JWT_ACCESS_SECRET` | Required | Chuỗi ngẫu nhiên ≥ 32 ký tự (`openssl rand -base64 48`) | Khóa ký access token HS256 (CONTEXT D25). Đổi khóa thì mọi người phải đăng nhập lại trong vòng 15 phút |
| `PII_ENCRYPTION_KEY` | Required | Chuỗi ngẫu nhiên ≥ 32 ký tự (`openssl rand -base64 48`), không bắt đầu bằng `change-me` | Khóa pgcrypto mã hóa cột `cvs.pii` (thông tin cá nhân trích từ CV, [CONTEXT D37](docs/CONTEXT.md)). Chỉ `api` có khóa. Lưu bản sao: mất hoặc đổi khóa thì không đọc được dữ liệu đã lưu |
| `REFRESH_TOKEN_TTL_DAYS` | Optional (7) | Tự đặt, 1–90 | Thời hạn refresh token (cookie httpOnly, Redis lưu hash) |
| `REDIS_URL` | – (compose đặt `redis://redis:6379`) | | Chạy API ngoài Docker thì tự đặt, host `localhost` và cổng `REDIS_HOST_PORT` |
| `SCHEDULER_ENABLED` | Optional (`true`) | `true`/`false` | Bật tác vụ định kỳ của API, như chuyển pha đợt khi qua mốc (CONTEXT D27). Chạy nhiều instance vẫn để `true`: advisory lock của PostgreSQL chỉ cho một instance chạy mỗi tác vụ |
| `WEB_ORIGIN` | Optional (`http://localhost:<NGINX_PORT>`) | Địa chỉ người dùng mở web, không có `/` ở cuối, ví dụ `https://srm.example.edu.vn` | Link trong email (lời mời HR, thông báo) ghép từ địa chỉ này. API bắt buộc có biến này; compose đặt mặc định (CONTEXT D31) |
| `SMTP_HOST` | Optional (`mailpit`) | Máy chủ SMTP gửi email | Mặc định là service `mailpit` đi kèm: mọi email bị giữ lại, xem ở `http://localhost:<MAILPIT_UI_HOST_PORT>`. Email gửi lỗi được thử lại sau 1 phút, rồi 5 phút, sau đó đánh dấu thất bại và ghi log (CONTEXT D31) |
| `SMTP_PORT` | Optional (1025) | Cổng SMTP | Cổng 465 dùng TLS ngay khi kết nối |
| `SMTP_USER`, `SMTP_PASSWORD` | Optional (trống) | Tài khoản SMTP | Để trống khi máy chủ không cần đăng nhập (Mailpit) |
| `MAIL_FROM` | Optional (`Smart Recruit Match <no-reply@srm.local>`) | Địa chỉ người gửi | Dùng tên miền mà máy chủ SMTP được phép gửi thay |
| `SEED_PASSWORD` | Optional (`Srm-Dev-12345`) | Tự đặt | Chỉ cho `pnpm --filter @srm/api db:seed` (dữ liệu dev/test), không dùng trong compose |
| `LOG_LEVEL` | Optional (`info`) | `fatal`/`error`/`warn`/`info`/`debug`/`trace`/`silent` | Mức log pino của API; `ai-worker`, `ai-api` cũng đọc (`trace` → DEBUG, `fatal`, `silent` → CRITICAL) |
| `PORT`, `NODE_ENV` | – | Đặt sẵn trong `deploy/docker-compose.yml` (`3000`, `production`) | API đọc và kiểm bằng Zod (`apps/api/src/common/config/env.ts`); không cần khai báo trong `.env` |

## Đổi sang MinIO hoặc S3 bên ngoài

API chỉ biết các biến `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_PUBLIC_ENDPOINT`. Muốn dùng một MinIO/S3 có sẵn:

1. Đặt bốn biến này theo dịch vụ đó trong `deploy/.env`. Dịch vụ phải hỗ trợ SSE-S3 (MinIO cần KMS); tài khoản phải tạo được bucket `jd-files`, `cv-files`, hoặc tạo sẵn hai bucket đó. `MINIO_PUBLIC_ENDPOINT` là địa chỉ công khai của chính dịch vụ đó, vì nginx chỉ chuyển `/jd-files/`, `/cv-files/` tới service `minio` đi kèm.
2. Có thể bỏ service `minio` khỏi lần chạy: `docker compose -f deploy/docker-compose.yml up -d --build --wait --scale minio=0`. Compose vẫn đòi `MINIO_KMS_SECRET_KEY` có giá trị; khi đó giá trị không được dùng.

Image `minio/minio` không còn trên Docker Hub ([LESSONS §4](docs/LESSONS.md)). Muốn đổi image thì cập nhật digest trong `deploy/docker-compose.yml` và `apps/api/test/setup/images.ts` (testcontainers) trong cùng một commit.

Từ 0.7.0, `deploy/.env` cũ cần thêm `API_DB_PASSWORD` và `AI_DB_PASSWORD`, nếu không `up` sẽ báo thiếu biến. API không còn đăng nhập DB bằng `POSTGRES_USER` mà bằng role `api_service`.

Từ 0.6.0, `deploy/.env` cũ chạy được mà không cần sửa: `WEB_ORIGIN` và `SMTP_*` có mặc định trong compose. Trên máy chủ thật, đặt `WEB_ORIGIN` và `SMTP_*` theo địa chỉ web và máy chủ email của trường.

Từ 0.4.0, `deploy/.env` cũ cần thêm `MINIO_KMS_SECRET_KEY` (và có thể bỏ `MINIO_BUCKET`), nếu không `up` sẽ báo thiếu biến.
