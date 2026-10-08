# LESSONS — Bài học và bẫy đã gặp

> Mỗi mục phải giúp người sau tiết kiệm thời gian. Đánh số tăng dần, không dùng lại số. Mục sai thời (thư viện đã nâng cấp, hành vi đã đổi) thì xóa đi và thêm mục mới.
> Tìm số tiếp theo: `grep -n "^## [0-9]" docs/LESSONS.md | tail -1`. Trích dẫn trong commit: "Per LESSONS §N".

---

## 1. Claude Code không nạp skill trong `.agents/skills`

**What happened (pre-0.1.0)**: Bốn skill koni-docs, koni-harness, koni-qc, shadcn được đặt ở `.agents/skills/`, nhưng không xuất hiện trong danh sách skill của Claude Code. Agent làm việc như không có quy trình koni.

**Why**: Claude Code chỉ nạp skill dự án từ `.claude/skills/`. Thư mục `.agents/skills/` là quy ước của các công cụ khác.

**How to avoid**:
- Sau khi clone, tạo liên kết `.claude/skills` → `.agents/skills` theo [SETUP.md](SETUP.md).
- Thêm hoặc sửa skill thì sửa ở `.agents/skills/` (bản gốc), không sửa qua đường dẫn liên kết.
- Kiểm tra: mở Claude Code, gõ `/` và thấy `koni-docs` trong danh sách.

See [CONTEXT.md D18](CONTEXT.md).

## 2. `koni-docs sync` định dạng lại PRD, epic và đổi ngày frontmatter

**What happened (pre-0.1.0)**: Khi tạo 37 file story (CONTEXT D21), chạy `koni-docs sync` (koni-docs 0.12.0) lúc mọi story còn `backlog`. Trạng thái không có gì để lan, nhưng lệnh vẫn ghi lại PRD và cả 6 epic: căn lại mọi bảng Markdown (PRD đổi khoảng 600 dòng), bỏ dấu nháy trong frontmatter, xóa dòng trống sau frontmatter, và đổi `created`/`updated: 2026-10-07` thành `2026-10-07T00:00:00.000Z`. Định dạng này trái frontmatter-spec, vốn yêu cầu `YYYY-MM-DD`. Lệnh còn in 21 cảnh báo "row with ID=NFR-x not found", vì nó tra mọi ID `NFR-x` trong `prd_ref` vào bảng FR.

**Why**: `sync` phân tích rồi ghi lại toàn bộ file bằng bộ định dạng riêng, kể cả khi không có ô nào cần đổi. Khi đọc frontmatter, nó hiểu ngày là kiểu Date. Bộ lọc ID khớp chuỗi con `FR-`, nên `NFR-x` cũng bị tra.

**How to avoid**:
- Chạy `sync` khi trạng thái story thật sự đổi. Sau đó xem `git diff --stat docs/PRD.md docs/sprints/epics/` trước khi commit.
- Nếu diff chỉ là định dạng lại, hoàn tác bằng `git checkout -- docs/PRD.md docs/sprints/epics/` rồi tự sửa tay các ô trạng thái cần đổi.
- Nếu giữ diff của `sync`, sửa `created`/`updated` về dạng `YYYY-MM-DD`.
- Cảnh báo `NFR-x not found` là nhiễu. NFR trong `prd_ref` vẫn hợp lệ theo frontmatter-spec.
- `status` và `validate` không gặp vấn đề này: `status` chỉ ghi `STATUS.md`, `validate` chỉ đọc.

See [CONTEXT.md D21](CONTEXT.md).

## 3. Snippet hook Claude Code trong koni-harness `adapters.md` không bao giờ chặn commit

**What happened (0.1.0)**: Khi cài cổng koni-harness (US-1.1), `references/adapters.md` hướng dẫn thêm `PreToolUse` với `"matcher": "Bash(git commit*)"` và lệnh `gate-runner.sh … --phase work-commit`. Snippet này có hai lỗi. Thứ nhất, hook không bao giờ chạy. Thứ hai, nếu có chạy thì cổng hỏng cũng không chặn được commit. Khi đổi sang `if: "Bash(git commit*)"`, hook lại chạy cả với lệnh không phải commit mà Claude Code không phân tích được, như lệnh có biến hay chuyển hướng output. Lúc index đang ở trạng thái lỗi (stage `VERSION` mà thiếu CHANGELOG), những lệnh đó cũng bị chặn, kể cả lệnh `git restore` để gỡ lỗi.

**Why**:
- `matcher` chỉ khớp **tên tool** (`Bash`). Chuỗi có dấu ngoặc bị hiểu là regex và không khớp tool nào, Claude Code cũng không báo lỗi.
- Với `PreToolUse`, chỉ **exit 2** mới chặn được lệnh. Exit 1 (mã lỗi của `gate-runner.sh`) chỉ là lỗi không chặn.
- Bộ lọc `if` theo cú pháp quyền chỉ là best-effort: lệnh nào không phân tích được thì hook vẫn chạy.

**How to avoid**:
- Dùng `matcher: "Bash"` và `if: "Bash(git commit*)"`, rồi gọi `scripts/claude-commit-gate.sh`. Script này đọc `tool_input.command` từ stdin, chỉ chạy cổng khi lệnh thật sự có `git … commit`, và trả exit 2 khi cổng hỏng.
- Lớp chặn chính vẫn là hook git `pre-commit`. Hook Claude chỉ để agent thấy lỗi sớm.
- Thử bằng `git commit --dry-run` khi đang stage một thay đổi phải bị chặn. Lệnh này không bao giờ tạo commit.

See [CONTEXT.md D22](CONTEXT.md).

## 4. Image `minio/minio` không còn trên Docker Hub

**What happened (0.1.0)**: ARCHITECTURE ghi image `minio/minio`. Khi dựng compose ở US-1.1, `docker manifest inspect minio/minio` trả `denied`, còn `quay.io/minio/minio` trả `no such manifest`. MinIO đã ngừng phát hành image community từ cuối 2025 và xóa repo trên Docker Hub khoảng 11/09/2026.

**Why**: Image từ bên thứ ba có thể biến mất. Tài liệu kiến trúc viết trước đó vẫn ghi tên cũ.

**How to avoid**:
- Trước khi ghi một image vào compose hoặc testcontainers, kiểm bằng `docker manifest inspect <image>`.
- Ghim image theo tag cụ thể. Image chỉ có `latest` (như `cgr.dev/chainguard/minio`) thì ghim theo digest (`image@sha256:…`).
- Code chỉ phụ thuộc biến `MINIO_*` (endpoint, access key, secret key, bucket), không phụ thuộc server cụ thể.

See [CONTEXT.md D23](CONTEXT.md).

## 5. `exclude: node_modules` khiến dependency-cruiser bỏ qua `domain/ → @nestjs/*`

**What happened (0.1.0)**: Lần chạy đầu của fixture vi phạm US-1.1 chỉ báo `domain/ → drizzle-orm`, không báo `domain/ → @nestjs/common`, dù cả hai cùng nằm trong một file. Fixture vẫn "đỏ", nên nếu chỉ kiểm mã thoát thì đã tưởng luật chạy đúng.

**Why**: `options.exclude` xóa luôn cả module bị loại **lẫn các cạnh trỏ tới nó**. `@nestjs/common` resolve được vào `node_modules/...` nên bị loại. `drizzle-orm` chưa cài, không resolve được, nên còn nguyên tên và vẫn bị bắt. Trên code thật (sau US-1.2, khi `drizzle-orm` đã cài) thì cả hai import sẽ lọt.

**How to avoid**:
- Chỉ dùng `doNotFollow: node_modules`. Không đưa `node_modules` vào `exclude`.
- Fixture vi phạm phải kiểm **từng vi phạm mong đợi** (luật + file nguồn + đích), không chỉ kiểm mã thoát khác 0. Xem `scripts/check-depcruise-fixture.sh`.

See [CONTEXT.md D22](CONTEXT.md).
