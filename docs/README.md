# Tài liệu Smart Recruit Match

Tài liệu theo cấu trúc koni-docs. Tên file tiếng Anh, nội dung tiếng Việt ([CONTEXT D16](CONTEXT.md)).

## Bản đồ tài liệu

| File | Nội dung | Cập nhật khi |
|---|---|---|
| [BRIEF.md](BRIEF.md) | Tóm tắt sản phẩm cho người đọc nhanh | Đổi tầm nhìn, phạm vi, tiêu chí thành công |
| [PRD.md](PRD.md) | Yêu cầu nghiệp vụ: quy trình GĐ0–GĐ10, chấm điểm, phân bổ, vòng đời trạng thái, BR, FR, NFR, epic | Đổi nghiệp vụ; thêm hoặc đổi trạng thái story |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Kiến trúc: stack, thành phần, dữ liệu, queue, API, bảo mật, triển khai, AD-N | Có quyết định kiến trúc mới |
| [CONTEXT.md](CONTEXT.md) | Nhật ký quyết định D-N, chỉ ghi thêm | Mỗi khi ra quyết định |
| [LESSONS.md](LESSONS.md) | Bẫy và bài học | Gặp bẫy hoặc tìm ra mẫu dùng lại được |
| [CHANGELOG.md](CHANGELOG.md) + [VERSION](../VERSION) | Lịch sử phát hành | Mỗi commit ship code |
| [SETUP.md](SETUP.md) | Cài môi trường phát triển | Thêm công cụ hoặc biến môi trường |
| [sprints/](sprints/README.md) | Epic, story, sprint; `STATUS.md` tự sinh | Theo vòng đời story |

Sẽ thêm khi cần: `DESIGN.md` ở gốc repo (design system, trước màn hình đầu tiên), `docs/design/` (spec giao diện theo story), `docs/tests/` (test case theo epic, báo cáo chạy test), `DEPLOY.md` và `.env.example` ở gốc repo (khi có biến môi trường đầu tiên).

## Quy ước

- Tham chiếu bằng mã ổn định (GĐx, BR-xx, FR-x, NFR-x, AD-x, D-x, US-x.y) hoặc tên mục in nghiêng, không bằng số mục.
- Tiêu đề H2 theo template, khóa frontmatter, enum và mã ID giữ tiếng Anh để công cụ koni-docs đọc được.
- `CONTEXT.md` chỉ ghi thêm; sửa quyết định bằng mục `revision of D<M>`.
- `sprints/STATUS.md` do công cụ sinh, không sửa tay.

## Checklist trước commit

```
[ ] Commit có code: VERSION tăng theo semver và CHANGELOG có mục mới trong cùng commit (RULE-1)
[ ] CHANGELOG ghi SHA thật, không để "pending" (RULE-2)
[ ] Story: các task đã xong được đánh [x]; status đúng; version_shipped là semver không có "v"
[ ] PRD cập nhật nếu phạm vi đổi; BRIEF cập nhật nếu tầm nhìn/phạm vi đổi
[ ] CONTEXT.md có mục mới nếu vừa ra quyết định
[ ] LESSONS.md có mục mới, hoặc story ghi "Lessons: none new — <lý do>"
[ ] Biến môi trường mới: SETUP.md + DEPLOY.md + .env.example trong cùng commit (RULE-11)
[ ] koni-docs sync → status → validate không lỗi
[ ] .active-context.md cập nhật (khối koni-docs:auto-update)
[ ] Commit message tiếng Anh, có prefix feat:/fix:/chore:/docs:/style:/refactor:/test: (RULE-14)
```

## Lệnh koni-docs

Chưa có `package.json` nên chạy qua `npx` (sau khi scaffold sẽ thêm `@koniverse/koni-docs` làm devDependency):

```bash
npx -y -p @koniverse/koni-docs koni-docs validate --docs-path docs/   # kiểm tra tham chiếu ID
npx -y -p @koniverse/koni-docs koni-docs sync --docs-path docs/       # lan trạng thái story lên epic, PRD, sprint
npx -y -p @koniverse/koni-docs koni-docs status --docs-path docs/     # sinh lại sprints/STATUS.md
npx -y -p @koniverse/koni-docs koni-docs preview docs --watch         # xem tài liệu trên trình duyệt
```
