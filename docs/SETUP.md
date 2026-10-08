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
| `pnpm --filter @srm/web dev` | Chạy web ở `localhost:5173`, proxy `/api` sang `localhost:3000` |
| `pnpm docs:validate` / `docs:sync` / `docs:status` | Lệnh koni-docs ([docs/README.md](README.md)) |
| `ai-service/.venv/bin/ruff check ai-service` | Lint AI Service |
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
RABBITMQ_DEFAULT_USER=srm
RABBITMQ_DEFAULT_PASS=change-me-rabbitmq

# Object storage — MinIO hoặc S3 tương thích (added in v0.1.0, CONTEXT D23)
# Service minio đi kèm dùng ACCESS_KEY/SECRET_KEY làm tài khoản root. API đọc các biến này từ US-1.6.
# Chạy API ngoài Docker thì đặt MINIO_ENDPOINT=http://localhost:9000.
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=srm-minio
MINIO_SECRET_KEY=change-me-minio
MINIO_BUCKET=srm-files

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

# Core Backend (added in v0.1.0)
# Mức log pino: fatal | error | warn | info | debug | trace | silent
LOG_LEVEL=info
```

API chạy ngoài Docker (`pnpm --filter @srm/api dev`) đọc `PORT` (mặc định 3000) và `LOG_LEVEL` từ môi trường của shell. Biến kết nối DB thêm ở US-1.2.
