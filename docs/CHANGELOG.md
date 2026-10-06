# Changelog

Lịch sử phát hành của Smart Recruit Match. Mỗi commit ship code tăng `VERSION` và thêm một mục ở đây trong cùng commit (RULE-1); mục mới nhất ở trên cùng. Commit chỉ sửa tài liệu ghi vào `[Unreleased]` và không tăng version.

## [Unreleased]

### Added
- Bộ tài liệu theo cấu trúc koni-docs: `BRIEF.md`, `PRD.md` (từ đặc tả nghiệp vụ), `ARCHITECTURE.md` (từ tài liệu kiến trúc), `CONTEXT.md`, `LESSONS.md`, `SETUP.md`, `docs/README.md`, `docs/sprints/`.
- `AGENTS.md` làm nguồn chỉ dẫn chính cho agent; `CLAUDE.md` import `AGENTS.md`.
- PRD bổ sung bảng Functional Requirements (FR-1 – FR-37), Non-Functional Requirements (NFR-1 – NFR-13) và 6 epic theo lộ trình triển khai.

### Changed
- Frontend dùng shadcn/ui + Tailwind CSS thay cho Ant Design (CONTEXT D14).

---

## [0.0.0] — 2026-10-04 — Khởi tạo repo — v0.0.0

Commit đầu tiên của repo, chỉ có `README.md`. Mốc gốc của `VERSION`.

**Commit**: a804da5
