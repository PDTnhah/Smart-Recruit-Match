# CLAUDE.md — Smart Recruit Match

Toàn bộ chỉ dẫn nằm ở [AGENTS.md](AGENTS.md), được import ngay dưới đây. Hai file mâu thuẫn thì theo AGENTS.md.

@AGENTS.md

## Koni-Docs Integration

```yaml
koni-docs:
  plugins: []
  docs_path: docs/
  active_sprint: sprint-2026-W41
  version_file: VERSION
```

## Active Context

> Nằm ở `.active-context.md` (gitignore, mỗi người một bản), sao từ [`.active-context.example.md`](.active-context.example.md). Đọc file này khi bắt đầu phiên. Cập nhật khối `koni-docs:auto-update` trong đó khi bắt đầu/đóng story, mở sprint, thêm mục CONTEXT/LESSONS, và trước commit (mốc T1–T7 của skill koni-docs).
