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
- Hook `PreToolUse` chạy ở thư mục hiện tại của phiên, không phải gốc repo, trong khi các check đọc đường dẫn tương đối như `.koni-harness/secret-allow`. `scripts/claude-commit-gate.sh` phải `cd` về gốc repo trước khi chạy cổng (sửa ở 0.2.0, khi allowlist bị bỏ qua lúc phiên đang ở `apps/api`).

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

## 6. Migrator của drizzle bỏ qua migration có mốc thời gian cũ hơn mà không báo lỗi

**What happened (0.1.1)**: Khi chuẩn bị US-1.2, đọc mã `migrate()` của `drizzle-orm` 0.45.3 (`pg-core/dialect`) để chọn cách áp migration. Hàm này đọc `created_at` của migration cuối cùng trong `drizzle.__drizzle_migrations`, rồi chỉ chạy những migration có `when` (mốc mili giây trong `drizzle/meta/_journal.json`) lớn hơn mốc đó. Nó không so theo tên file hay hash.

**Why**: Hai làn chạy song song có thể cùng sinh migration. Nhánh A sinh `0002` lúc 10:00, nhánh B sinh `0002` lúc 09:00. Nếu A merge và deploy trước, migration của B có `when` cũ hơn nên bị bỏ qua mãi mãi: DB thiếu bảng, không có lỗi nào. Máy dev cũng gặp nếu từng áp migration của một nhánh khác.

**How to avoid**:
- Giữ luật ở [sprints/README › Chạy song song](sprints/README.md#chạy-song-song): mỗi đợt chỉ một story sinh migration; story còn lại rebase lên nhánh đã merge rồi mới chạy `db:generate`.
- Không sửa, xóa hay đổi thứ tự file migration đã chạy ở bất kỳ đâu. Cần đổi thì sinh migration mới.
- Unit test `apps/api/src/db/migrations-journal.spec.ts` kiểm `idx` và `when` tăng chặt. Merge sai thứ tự sẽ làm test đỏ.
- Máy dev bị lệch thì xóa volume (`docker compose … down -v`) rồi `up` lại.
- Kiểm "đã sinh migration chưa" bằng `git status --porcelain apps/api/drizzle` (bước CI). `git diff --exit-code` không thấy file mới chưa được track.

See [CONTEXT.md D24](CONTEXT.md).

## 7. Hàm dùng chung cho nhiều bảng Drizzle: khai kiểu cụ thể, đừng dùng generic `T extends PgTable`

**What happened (0.1.1)**: `transitionTo` nhận bảng theo cấu trúc (có `id`, `status`, `rowVersion`). Bản đầu khai `<T extends LifecycleTable>(table: T)`: `tsc` báo lỗi ở `.from(table)` (`TableLikeHasEmptySelection<T> extends true ? DrizzleTypeError…`) và ở `.set({ status })`. Ép `as PgTable` thì qua `tsc`, nhưng ESLint (`no-unnecessary-type-assertion` trong `recommendedTypeChecked`) lại báo phép ép là thừa. Helper test dùng `TABLES[kind]` với `K` generic cũng gặp đúng lỗi đó.

**Why**: Kiểu điều kiện của Drizzle không rút gọn được khi bảng là tham số generic hoặc phép tra chỉ mục generic. Với một kiểu cụ thể (`LifecycleTable`), TypeScript rút gọn được, nên không cần ép.

**How to avoid**:
- Khai tham số là kiểu cụ thể: `table: LifecycleTable`, hoặc `const table: LifecycleTable = TABLES[kind]`. Không dùng `T extends …` cho bảng.
- Ràng buộc cột bằng `PgColumn<ColumnBaseConfig<'number' | 'string' | 'date', string>>`. Bảng thiếu cột hoặc cột sai kiểu bị `tsc` chặn ngay ở chỗ gọi.
- Kết quả `select` trên cột khai theo cấu trúc có kiểu `unknown`. Ép một lần sang kiểu dòng cụ thể; đây là chỗ ép duy nhất cần giữ.
- Chạy `pnpm lint` trước khi coi một mẫu kiểu là xong: `tsc` qua chưa đủ.

See [US-1.2](sprints/stories/US-1.2-core-db-schema-transition-audit-log.md) › Implementation notes.

## 8. CLI shadcn 4.21 không nhận preset `radix-nova` và thêm gói bằng dải `^` bản mới nhất

**What happened (0.2.0)**: Khi `shadcn init` ở US-1.3, lệnh `pnpm dlx shadcn@4.21.0 init --preset radix-nova` theo skill `shadcn` (`cli.md`) báo `Invalid preset: radix-nova. Available presets: nova, vega, …`. Chạy được với `--base radix --preset nova`; `components.json` vẫn ghi `"style": "radix-nova"`. Cả `init` lẫn `add` tự cài gói vào `apps/web/package.json` bằng dải `^` và bản mới nhất, trái quy ước ghim bản chính xác (CONTEXT D22). Ba gói còn mới hơn 2 tuần: `lucide-react` ra cùng ngày, `radix-ui` 3 ngày, `shadcn` 1 ngày. `init` cũng thêm chính gói `shadcn` (để import `shadcn/tailwind.css`), và `add sonner` thêm `next-themes`.

**Why**: CLI 4.21 tách nền (`--base radix|base`) khỏi tên preset, còn tài liệu của skill vẫn ghi cú pháp cũ. CLI luôn cài bản mới nhất của gói, không đọc quy ước ghim của repo.

**How to avoid**:
- Chạy `pnpm dlx shadcn@<bản đã ghim> init --help` trước khi init để xem cờ thật. Với repo này: `--base radix --preset nova --no-monorepo`.
- Sau mỗi `init`/`add`, xem `git diff apps/web/package.json`, đổi mọi `^x.y.z` thành bản chính xác đã phát hành ít nhất 2 tuần (`npm view <gói> time --json`), rồi `pnpm install`. `pnpm add --save-exact` không ghi đè dải đã có; sửa tay trong `package.json`.
- Primitive sinh ra là mã của repo: đọc lại từng file. Ở US-1.3 đã sửa `sonner.tsx` (bỏ `next-themes`), `use-mobile.ts` (setState trong effect bị react-hooks v7 chặn), chuỗi trợ năng tiếng Anh trong `sheet.tsx`/`sidebar.tsx`. Mọi chỗ sửa ghi ở [DESIGN.md](../DESIGN.md) §6.

See [CONTEXT.md D26](CONTEXT.md).
