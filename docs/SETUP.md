# SETUP — Cài môi trường phát triển

> Chưa có code. Phần này chỉ gồm công cụ cần cài và các bước cho agent AI; lệnh chạy ứng dụng sẽ thêm khi scaffold xong (EPIC-1).

## Công cụ cần có

| Công cụ | Phiên bản | Ghi chú |
|---|---|---|
| Node.js | 22 LTS trở lên | Frontend, Core Backend |
| pnpm | theo `packageManager` trong `package.json` | Bật bằng `corepack enable` (đi kèm Node.js) |
| Python | 3.12 trở lên | AI Service (ARCHITECTURE › Tech stack) |
| Docker + Docker Compose | bản mới | PostgreSQL/pgvector, Redis, RabbitMQ, MinIO, Mailpit |
| Git | bản mới | |

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

## Biến môi trường

Chưa có. Khi thêm biến đầu tiên: cập nhật mục này, `DEPLOY.md` và `.env.example` trong cùng commit (RULE-11).
