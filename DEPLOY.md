# DEPLOY — Chạy Smart Recruit Match bằng Docker Compose

Đồ án chỉ triển khai bằng Docker Compose trên một máy để demo, không có môi trường cloud ([US-1.1](docs/sprints/stories/US-1.1-scaffold-monorepo-docker-compose-ci.md) › *What we explicitly did NOT do*). Cài đặt máy phát triển xem [docs/SETUP.md](docs/SETUP.md).

## Yêu cầu

- Docker Engine và Docker Compose v2 (`docker compose version`).
- Khoảng 2 GB RAM trống cho hạ tầng. Từ US-2.1, AI Service chạy `bge-m3` nên cần thêm 2–4 GB.

## Chạy

```bash
# Tại gốc repo, làm một lần:
cp deploy/.env.example deploy/.env      # rồi đổi mọi mật khẩu

# Dựng, áp migration DB và chờ đủ 7 service healthy:
docker compose -f deploy/docker-compose.yml up -d --build --wait
docker compose -f deploy/docker-compose.yml ps

# Kiểm tra:
curl -fsS http://localhost:8080/api/health     # {"status":"ok",...}
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

Cổng hạ tầng chỉ mở trên `127.0.0.1`. Nếu cổng đã bị chiếm, đổi biến `*_HOST_PORT` trong `deploy/.env`.

## Migration cơ sở dữ liệu

Service `migrate` áp các file SQL trong `apps/api/drizzle/` (sinh bằng drizzle-kit, cùng migration tay như trigger của `audit_logs`) bằng migrator của Drizzle, rồi thoát. Migration đã áp được ghi trong bảng `drizzle.__drizzle_migrations`, nên `up` lần sau chỉ áp phần mới. `--wait` chờ `migrate` thoát với mã 0, vì `api` phụ thuộc vào nó bằng `service_completed_successfully`.

```bash
docker compose -f deploy/docker-compose.yml logs migrate     # "migrate: applied migrations from /app/drizzle"
```

- Migration lỗi thì `migrate` thoát khác 0, `api` không khởi động và `up --wait` báo `service "migrate" didn't complete successfully`. Đọc log ở lệnh trên.
- Code có migration mới thì phải build lại image (`up -d --build`), vì migration nằm trong image.
- Migrator chỉ áp migration có mốc thời gian mới hơn migration cuối đã áp. Không sửa hay đổi thứ tự file migration đã chạy ([LESSONS §6](docs/LESSONS.md)).

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
| `DATABASE_URL` | – (compose tự ghép) | `postgres://POSTGRES_USER:POSTGRES_PASSWORD@postgres:5432/POSTGRES_DB` | Service `migrate` và `api` đọc. Vì được ghép thành URL, `POSTGRES_PASSWORD` chỉ nên gồm chữ, số và `-_.~`. Chạy API ngoài Docker thì tự đặt, host `localhost` và cổng `POSTGRES_HOST_PORT` |
| `RABBITMQ_DEFAULT_USER` | Required | Tự đặt | User tạo lúc khởi tạo volume `rabbitmqdata` |
| `RABBITMQ_DEFAULT_PASS` | Required | Tự đặt, mật khẩu mạnh | |
| `MINIO_ENDPOINT` | Required | `http://minio:9000` với service đi kèm; hoặc URL của MinIO/S3 ngoài | API đọc từ US-1.6. Ngoài Docker dùng `http://localhost:9000` |
| `MINIO_ACCESS_KEY` | Required | Tự đặt với service đi kèm; hoặc access key của MinIO/S3 ngoài | Đồng thời là `MINIO_ROOT_USER` của service `minio` |
| `MINIO_SECRET_KEY` | Required | Tự đặt (≥ 8 ký tự); hoặc secret key của MinIO/S3 ngoài | Đồng thời là `MINIO_ROOT_PASSWORD` |
| `MINIO_BUCKET` | Required | Tự đặt | Bucket chứa CV/JD gốc (US-1.6 tạo nếu chưa có) |
| `NGINX_PORT` | Optional (8080) | Tự đặt | Cổng web trên máy |
| `POSTGRES_HOST_PORT` | Optional (5432) | Tự đặt | Cổng PostgreSQL trên 127.0.0.1 |
| `REDIS_HOST_PORT` | Optional (6379) | Tự đặt | |
| `RABBITMQ_HOST_PORT` | Optional (5672) | Tự đặt | AMQP |
| `RABBITMQ_UI_HOST_PORT` | Optional (15672) | Tự đặt | Giao diện quản lý |
| `MINIO_HOST_PORT` | Optional (9000) | Tự đặt | API S3 |
| `MINIO_CONSOLE_HOST_PORT` | Optional (9001) | Tự đặt | Console |
| `MAILPIT_SMTP_HOST_PORT` | Optional (1025) | Tự đặt | |
| `MAILPIT_UI_HOST_PORT` | Optional (8025) | Tự đặt | |
| `LOG_LEVEL` | Optional (`info`) | `fatal`/`error`/`warn`/`info`/`debug`/`trace`/`silent` | Mức log pino của API |
| `PORT`, `NODE_ENV` | – | Đặt sẵn trong `deploy/docker-compose.yml` (`3000`, `production`) | API đọc và kiểm bằng Zod (`apps/api/src/common/config/env.ts`); không cần khai báo trong `.env` |

## Đổi sang MinIO hoặc S3 bên ngoài

API chỉ biết bốn biến `MINIO_*`. Muốn dùng một MinIO/S3 có sẵn:

1. Đặt `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` theo dịch vụ đó trong `deploy/.env`.
2. Có thể bỏ service `minio` khỏi lần chạy: `docker compose -f deploy/docker-compose.yml up -d --build --wait --scale minio=0`.

Image `minio/minio` không còn trên Docker Hub ([LESSONS §4](docs/LESSONS.md)). Muốn đổi image thì cập nhật digest trong `deploy/docker-compose.yml`, và từ US-1.6 cả trong testcontainers, trong cùng một commit.
