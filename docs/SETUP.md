# SETUP — Cài môi trường phát triển

> Từ v0.1.0 (US-1.1) repo đã có khung monorepo. Chạy cả hệ thống bằng Docker Compose xem [DEPLOY.md](../DEPLOY.md).

## Công cụ cần có

| Công cụ | Phiên bản | Ghi chú |
|---|---|---|
| Node.js | 22.12 trở lên (`.nvmrc` = 22) | Frontend, Core Backend. Dùng nvm: `nvm use` tại gốc repo |
| pnpm | theo `packageManager` trong `package.json` (10.34.6) | Bật bằng `corepack enable` (đi kèm Node.js) |
| Python | 3.12 trở lên | AI Service. CI chạy 3.12 |
| Docker + Docker Compose v2 | bản mới | Compose stack và integration test (testcontainers) |
| Git | bản mới | |

Lý do chọn phiên bản (pnpm 10, TypeScript 6.0, NestJS 11): [CONTEXT D22](CONTEXT.md).

## Sau khi clone

### 1. Nối skill cho Claude Code

Skill gốc nằm ở `.agents/skills/`; Claude Code chỉ đọc `.claude/skills/` ([LESSONS §1](LESSONS.md)). Tạo liên kết một lần:

```powershell
# Windows (PowerShell, tại gốc repo)
New-Item -ItemType Directory -Force .claude | Out-Null
New-Item -ItemType Junction -Path .claude\skills -Target .agents\skills
```

```bash
# macOS / Linux
mkdir -p .claude && ln -s ../.agents/skills .claude/skills
```

Kiểm tra: mở Claude Code trong repo, gõ `/` và thấy `koni-docs`, `koni-harness`, `koni-qc` trong danh sách.

### 2. Tạo Active Context cho riêng mình

```bash
cp .active-context.example.md .active-context.md
```

Điền khối *Local developer* (GitHub login, tên và email git, nhánh). File này đã được gitignore.

### 3. Node.js, pnpm và phụ thuộc

```bash
nvm use                 # đọc .nvmrc (Node 22). Mỗi terminal mới đều cần chạy lại
corepack enable         # một lần cho mỗi bản Node; tạo lệnh pnpm đúng phiên bản
pnpm install            # cài cho cả monorepo
```

Hook `pre-push` gọi `pnpm test`. Vì vậy hãy push từ terminal đã `nvm use`, hoặc đặt `nvm alias default 22`.

### 4. Python cho AI Service

```bash
cd ai-service
python3.12 -m venv .venv          # hoặc bất kỳ Python ≥ 3.12
.venv/bin/pip install -e ".[dev]"
```

Trên Windows, venv đặt file chạy ở `.venv/Scripts/` thay cho `.venv/bin/` (VD `.venv/Scripts/pip install -e ".[dev]"`). Máy chưa có Python 3.12 thì có thể lấy từ conda rồi tạo venv chuẩn: `conda create -n srm-py312 python=3.12`, sau đó `<thư mục env>/python -m venv .venv`.

`pnpm contracts:gen` cần venv này: nó gọi `datamodel-code-generator` để sinh model Pydantic. Script tìm Python theo thứ tự `$AI_SERVICE_PYTHON`, `ai-service/.venv`, rồi `python3`/`python` trên PATH.

### 5. Cổng commit koni-harness

`.koni-harness/` đã được commit, nhưng hook git nằm trong `.git/hooks` nên mỗi bản clone phải tự cài:

```bash
sh .agents/skills/koni-harness/scripts/install-gate.sh
```

Lệnh chạy lại nhiều lần vẫn an toàn và không ghi đè `.koni-harness/gates.conf`. Sau khi cài:

- `pre-commit` chặn commit tăng `VERSION` mà CHANGELOG thiếu mục tương ứng, hoặc commit có khóa bí mật.
- `pre-push` chạy `pnpm test`; cần Docker vì có integration test.
- Trong Claude Code, `.claude/settings.json` chạy cùng cổng này trước mỗi `git commit` ([LESSONS §3](LESSONS.md)).

### 6. File môi trường cho Docker Compose

```bash
cp deploy/.env.example deploy/.env      # rồi đổi mật khẩu; cổng bị chiếm thì đổi *_HOST_PORT
```

## Lệnh

Chạy tại gốc repo:

| Lệnh | Việc |
|---|---|
| `pnpm build` | Build mọi package (shared → api, web) |
| `pnpm typecheck` | Build `@srm/shared` rồi typecheck mọi package |
| `pnpm lint` | Build `@srm/shared` rồi chạy ESLint cho api, web, shared |
| `pnpm test` | Jest của api: project `unit` và `integration` (testcontainers, cần Docker) |
| `pnpm --filter @srm/api test:unit` | Chỉ unit test, không cần Docker |
| `pnpm --filter @srm/api test:int` | Chỉ integration test |
| `pnpm depcruise` | Kiểm tra ranh giới module của `apps/api/src` |
| `pnpm depcruise:fixture` | Chứng minh luật ranh giới còn bắt được vi phạm (fixture cố ý) |
| `pnpm --filter @srm/api dev` | Chạy API ở `localhost:3000` (tsc watch + node watch) |
| `pnpm --filter @srm/api db:generate` | Sinh migration SQL từ `apps/api/src/db/schema` vào `apps/api/drizzle/` (build `@srm/shared` trước) |
| `pnpm --filter @srm/api db:migrate` | Áp migration lên DB ở `DATABASE_URL` |
| `pnpm --filter @srm/api db:seed` | Tạo tài khoản demo cho bốn vai trò (chỉ dev/test; chạy lại không tạo trùng) |
| `pnpm api:sync` | Xuất OpenAPI từ API rồi sinh kiểu client cho web (`apps/web/src/shared/api/`) |
| `pnpm contracts:gen` | Sinh JSON Schema (`packages/shared/contracts/json-schema/`) và model Pydantic (`ai-service/app/contracts/`) từ hợp đồng Zod; chạy sau khi sửa `packages/shared/contracts` rồi commit cả hai thư mục ([CONTEXT D33](CONTEXT.md)) |
| `pnpm --filter @srm/web dev` | Chạy web ở `localhost:5173`, proxy `/api` sang `localhost:3000` |
| `pnpm docs:validate` / `docs:sync` / `docs:status` | Lệnh koni-docs ([docs/README.md](README.md)) |
| `ai-service/.venv/bin/ruff check ai-service` | Lint AI Service (Windows: `.venv/Scripts/`) |
| `ai-service/.venv/bin/pytest ai-service` | Test AI Service (không gọi API thật) |
| `docker compose -f deploy/docker-compose.yml up -d --build --wait` | Dựng cả hệ thống ([DEPLOY.md](../DEPLOY.md)) |

## Biến môi trường

Compose đọc `deploy/.env` (sao từ [`deploy/.env.example`](../deploy/.env.example)). Bảng đầy đủ nằm ở [DEPLOY.md › Biến môi trường](../DEPLOY.md#biến-môi-trường). Thêm biến mới thì sửa cả ba nơi trong cùng commit (RULE-11).

```bash
# PostgreSQL (added in v0.1.0)
# Superuser và database tạo ở lần đầu khởi động volume pgdata.
POSTGRES_USER=srm
POSTGRES_PASSWORD=change-me-postgres
POSTGRES_DB=srm

# RabbitMQ (added in v0.1.0)
# User mặc định; giao diện quản lý ở http://localhost:15672.
# Compose tự ghép RABBITMQ_URL cho api, ai-worker, ai-api từ hai biến này (v0.7.0), nên mật khẩu phải an toàn trong URL.
# Chỉ tự đặt khi chạy API ngoài Docker (cổng theo RABBITMQ_HOST_PORT):
# RABBITMQ_URL=amqp://srm:change-me-rabbitmq@localhost:5672
RABBITMQ_DEFAULT_USER=srm
RABBITMQ_DEFAULT_PASS=change-me-rabbitmq

# Object storage — MinIO hoặc S3 tương thích (added in v0.1.0, CONTEXT D23)
# Service minio đi kèm dùng ACCESS_KEY/SECRET_KEY làm tài khoản root.
# Chạy API ngoài Docker thì đặt MINIO_ENDPOINT=http://localhost:9000.
# API tạo bucket jd-files, cv-files ở lần tải file đầu tiên, mã hóa mọi object bằng SSE-S3 (v0.4.0, CONTEXT D28).
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=srm-minio
MINIO_SECRET_KEY=change-me-minio
# Địa chỉ trình duyệt mở web, dùng để ký URL tải file (hạn 5 phút); nginx chuyển /jd-files/, /cv-files/ sang MinIO.
# Mặc định http://localhost:<NGINX_PORT>. Chạy API ngoài Docker (web ở :5173) thì đặt http://localhost:9000.
MINIO_PUBLIC_ENDPOINT=http://localhost:8080
# Khóa mã hóa của service minio (bắt buộc, v0.4.0): `srm-key:` + `openssl rand -base64 32`.
# Mất hoặc đổi khóa thì không đọc được file đã lưu.
MINIO_KMS_SECRET_KEY=

# Web entry point (added in v0.1.0)
# Cổng nginx trên máy.
NGINX_PORT=8080

# Host ports for infrastructure services (added in v0.1.0)
# Chỉ mở trên 127.0.0.1; đổi khi cổng đã bị chiếm (VD máy đã có PostgreSQL ở 5432).
POSTGRES_HOST_PORT=5432
REDIS_HOST_PORT=6379
RABBITMQ_HOST_PORT=5672
RABBITMQ_UI_HOST_PORT=15672
MINIO_HOST_PORT=9000
MINIO_CONSOLE_HOST_PORT=9001
MAILPIT_SMTP_HOST_PORT=1025
MAILPIT_UI_HOST_PORT=8025
# FastAPI của AI Service, GET /health (added in v0.7.0).
AI_API_HOST_PORT=8000

# Core Backend database (added in v0.1.1, CONTEXT D24)
# Compose tự ghép DATABASE_URL cho migrate và api từ POSTGRES_*, nên mật khẩu phải an toàn trong URL.
# Chỉ tự đặt khi chạy API hoặc db:migrate ngoài Docker (cổng theo POSTGRES_HOST_PORT):
# DATABASE_URL=postgres://srm:change-me-postgres@localhost:5432/srm

# Database roles of the services (added in v0.7.0, CONTEXT D33)
# Migration 0006 tạo role api_service (API) và ai_service (AI Service); migrate đặt mật khẩu đăng nhập
# từ hai biến này mỗi lần chạy. Bắt buộc; ≥ 12 ký tự an toàn trong URL (chữ, số, - _ . ~).
# API ngoài Docker có thể dùng tài khoản chủ ở trên hoặc api_service:
# DATABASE_URL=postgres://api_service:change-me-api-service@localhost:5432/srm
API_DB_PASSWORD=change-me-api-service
AI_DB_PASSWORD=change-me-ai-service

# Authentication (added in v0.2.0, CONTEXT D25)
# Khóa ký access token, ≥ 32 ký tự ngẫu nhiên (openssl rand -base64 48). Bắt buộc; để trống thì compose không chạy.
JWT_ACCESS_SECRET=
# Thời hạn refresh token, tính bằng ngày.
REFRESH_TOKEN_TTL_DAYS=7
# Compose tự đặt REDIS_URL cho api. Chỉ tự đặt khi chạy API ngoài Docker (cổng theo REDIS_HOST_PORT):
# REDIS_URL=redis://localhost:6379
# Mật khẩu của các tài khoản do db:seed tạo (chỉ dữ liệu dev/test):
# SEED_PASSWORD=Srm-Dev-12345

# Scheduled jobs (added in v0.3.0, CONTEXT D27)
# Tác vụ định kỳ của API (chuyển pha đợt khi qua mốc). Integration test tự đặt false.
SCHEDULER_ENABLED=true

# Email and links (added in v0.6.0, CONTEXT D31)
# Địa chỉ mở web, không có / ở cuối; link trong email ghép từ đây. Chạy web ngoài Docker thì đặt http://localhost:5173.
WEB_ORIGIN=http://localhost:8080
# Máy chủ SMTP; mặc định là service mailpit (giữ mọi email, xem ở http://localhost:8025).
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=Smart Recruit Match <no-reply@srm.local>

# Core Backend (added in v0.1.0)
# Mức log pino: fatal | error | warn | info | debug | trace | silent
LOG_LEVEL=info
```

API chạy ngoài Docker (`pnpm --filter @srm/api dev`) đọc `PORT` (mặc định 3000), `LOG_LEVEL`, `REFRESH_TOKEN_TTL_DAYS`, `SCHEDULER_ENABLED` (mặc định `true`), `SMTP_HOST`/`SMTP_PORT` (mặc định `localhost:1025`, tức Mailpit của compose) và các biến bắt buộc `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`, `JWT_ACCESS_SECRET`, `MINIO_*`, `WEB_ORIGIN` từ môi trường của shell. Dựng `postgres`, `redis`, `rabbitmq`, `minio` và `mailpit` bằng compose, áp migration và seed trước lần chạy đầu. API khởi động được khi RabbitMQ chưa chạy, nhưng chỉ gửi job và nhận `ai.results` khi đã kết nối:

```bash
docker compose -f deploy/docker-compose.yml up -d --wait postgres redis rabbitmq minio mailpit
export DATABASE_URL=postgres://srm:change-me-postgres@localhost:5432/srm   # cổng theo POSTGRES_HOST_PORT
export REDIS_URL=redis://localhost:6379                                     # cổng theo REDIS_HOST_PORT
export RABBITMQ_URL=amqp://srm:change-me-rabbitmq@localhost:5672            # cổng theo RABBITMQ_HOST_PORT
export JWT_ACCESS_SECRET=dev-only-jwt-access-secret-0123456789
export MINIO_ENDPOINT=http://localhost:9000 MINIO_ACCESS_KEY=srm-minio MINIO_SECRET_KEY=change-me-minio
export WEB_ORIGIN=http://localhost:5173                                     # link trong email trỏ về web dev
API_DB_PASSWORD=change-me-api-service AI_DB_PASSWORD=change-me-ai-service pnpm --filter @srm/api db:migrate
pnpm --filter @srm/api db:seed       # tài khoản demo, chạy lại không tạo trùng
pnpm --filter @srm/api dev
pnpm --filter @srm/web dev           # http://localhost:5173
```

### Tài khoản demo

`db:seed` (`apps/api/src/db/seed/dev-seed.ts`) tạo các tài khoản dưới đây, mật khẩu chung lấy từ `SEED_PASSWORD`, mặc định `Srm-Dev-12345`. Script từ chối chạy khi `NODE_ENV=production`, nên với hệ thống dựng bằng compose thì chạy từ máy host với `DATABASE_URL` trỏ vào cổng `POSTGRES_HOST_PORT`.

| Vai trò | Email | Cổng |
|---|---|---|
| `ADMIN` | `admin@srm.local` | `/admin` |
| `CENTER` | `center@srm.local` | `/admin` |
| `HR` | `hr.alpha@srm.local`, `hr.beta@srm.local` (hai công ty demo) | `/hr` |
| `STUDENT` | `sv001@srm.local`, `sv002@srm.local` | `/sv` |

Refresh token nằm trong cookie `Secure`. Trình duyệt chỉ lưu cookie này qua HTTPS hoặc `localhost`; mở web bằng IP LAN qua HTTP (ví dụ thử trên điện thoại thật) thì đăng nhập được nhưng tải lại trang sẽ mất phiên. Kiểm giao diện điện thoại bằng chế độ thiết bị của trình duyệt trên máy ([DESIGN.md](../DESIGN.md) §5).

Đổi endpoint API thì chạy `pnpm api:sync` để xuất lại `apps/web/src/shared/api/openapi.json` và sinh lại kiểu `schema.d.ts`. CI báo lỗi nếu hai file này lệch với code.

Sửa schema trong `apps/api/src/db/schema/` thì chạy `pnpm --filter @srm/api db:generate` và commit file SQL sinh ra. CI kiểm migration có khớp schema không. Có hai làn chạy song song thì rebase lên nhánh đã có migration mới nhất rồi mới sinh ([LESSONS §6](LESSONS.md)).
