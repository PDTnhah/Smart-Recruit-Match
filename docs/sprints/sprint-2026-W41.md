---
id: sprint-2026-W41
status: in-progress
start: 2026-10-05
end: 2026-10-11
goal: "Ship US-1.1: monorepo pnpm, Docker Compose chạy cả hạ tầng bằng một lệnh, CI và cổng commit koni-harness (v0.1.0)"
---

## Sprint scope

| US     | Title                                 | Epic   | Pri | Points | Status    | Story file                                                                                                     |
| ------ | ------------------------------------- | ------ | --- | ------ | --------- | -------------------------------------------------------------------------------------------------------------- |
| US-1.1 | Scaffold monorepo, Docker Compose, CI | EPIC-1 | P0  | 5      | 🚧 in-progress | [stories/US-1.1-scaffold-monorepo-docker-compose-ci.md](stories/US-1.1-scaffold-monorepo-docker-compose-ci.md) |

> **Convention**: AC + Tasks live inside each story file. This sprint file lists planned
> stories at a glance only. Design + decision docs cross-linked at the bottom.

## Sprint goal recap

Tuần đầu của lộ trình 13 tuần (T1 trong [sprints/README › Lộ trình](README.md#lộ-trình)). Chỉ có US-1.1 vì mọi story khác cần khung monorepo, Docker Compose, hạ tầng test và cổng commit mà story này dựng. Làn B chưa có việc: US-5.1 và US-2.1 bắt đầu từ W42–W43.

**Deliverable cut**: khung chạy được, chưa có nghiệp vụ. Không có Drizzle schema (US-1.2), không có `shadcn init` (US-1.3), không có `ai-worker`/`ai-api` (US-2.1).

**Why this sprint, why now**: CONTEXT D20 đặt US-1.1 ở T1 và yêu cầu cài cổng koni-harness, chạy thử `swarm.sh` trước khi mở hai làn song song ở W42.

## Risks & dependencies

- **Image `minio/minio` không còn trên Docker Hub** — *Impact*: compose không dựng được MinIO. *Mitigation*: dùng `cgr.dev/chainguard/minio` ghim theo digest; API chỉ đọc biến `MINIO_*` nên đổi sang S3 khác chỉ cần sửa `.env` (CONTEXT D23). *Owner*: @PDTnhah.
- **Phiên bản thư viện mới hơn mốc tài liệu** (TypeScript 7, NestJS 12, pnpm 12) — *Impact*: công cụ chưa tương thích (typescript-eslint cần TS < 6.1, nestjs-zod cần NestJS 11). *Mitigation*: ghim TS 6.0, NestJS 11, pnpm 10 (CONTEXT D22). *Owner*: @PDTnhah.

## Per-Epic Retrospective

| Epic   | Retro Status | Notes                 |
| ------ | ------------ | --------------------- |
| EPIC-1 | optional     | Epic còn chạy tới W44 |

## Retrospective

*Điền khi đóng sprint.*

## Cross-references

- [Story US-1.1](stories/US-1.1-scaffold-monorepo-docker-compose-ci.md) — AC + Tasks
- [EPIC-1](epics/EPIC-1.md) — epic cha
- [CONTEXT D20, D22, D23](../CONTEXT.md) — lộ trình, công cụ, image MinIO
- [README.md](README.md) — quy ước sprint
- [STATUS.md](STATUS.md) — bảng kanban tự sinh
