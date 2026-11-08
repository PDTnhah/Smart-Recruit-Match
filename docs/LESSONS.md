# LESSONS — Bài học và bẫy đã gặp

> Mỗi mục phải giúp người sau tiết kiệm thời gian. Đánh số tăng dần, không dùng lại số. Mục sai thời (thư viện đã nâng cấp, hành vi đã đổi) thì xóa đi và thêm mục mới.
> Tìm số tiếp theo: `grep -n "^## [0-9]" docs/LESSONS.md | tail -1`. Trích dẫn trong commit: "Per LESSONS §N".
> Đọc mục lục dưới đây, rồi chỉ đọc các mục khớp với việc đang làm: `grep -n "^## 15\." docs/LESSONS.md` cho số dòng, sau đó đọc từ dòng đó ([CONTEXT D38](CONTEXT.md)). Thêm mục mới thì thêm một dòng vào mục lục.

**Mục lục** (chủ đề → mục)

- Claude Code, skill, hook, koni-docs: §1 skill phải nằm ở `.claude/skills` · §2 `docs:sync` định dạng lại PRD, đổi ngày · §3 snippet hook của koni-harness không chặn commit
- Docker, compose, image: §4 `minio/minio` không còn trên Docker Hub · §14 compose truyền biến chưa đặt thành `""` · §15 hết RAM khi chạy test (compose, số worker Jest, commit memory của Windows) · §18 testcontainers build image không cache, Jest treo · §27 nginx trả `.mjs` là `octet-stream`, worker pdf.js không nạp
- Jest, ESM: §9 gói chỉ có ESM (`@nestjs/schedule`, `file-type`, `promise-breaker`…) · §11 `testTimeout` trong `projects` bị bỏ qua · §21 `--selectProjects` nuốt đường dẫn test
- Integration test: §22 các file dùng chung DB, thông báo gửi mọi tài khoản CENTER và tác vụ quét mọi đợt lọt vào test khác · §30 bảng mới trong `core` làm đỏ `core-schema` và `ai-service-role` · §40 `PEXPIREAT` theo giờ của `FakeClock` làm key Redis hết hạn ngay
- Drizzle, migration: §6 migration có mốc thời gian cũ bị bỏ qua · §7 hàm dùng chung nhiều bảng: khai kiểu cụ thể · §12 `FOR UPDATE OF` sinh tên có schema
- Giao dịch, khóa: §38 đọc bản ghi của module khác ngoài giao dịch rồi chuyển trạng thái không đảo ngược
- Bảo mật: §39 đầu ra của PRNG có seed tới client làm lộ cả chuỗi (vị trí gốc của phương án)
- pgvector: §24 index HNSW lọc sau khi quét, hàng cũ chiếm chỗ ứng viên
- Ranh giới module: §5 `exclude: node_modules` làm dependency-cruiser bỏ sót
- Thư viện API, web: §8 CLI shadcn 4.21 · §10 Zod 4 bỏ qua `refine` khi trường khác lỗi · §13 multer đọc tên file theo latin1 · §25 form gửi `row_version` của query mới nhất, bỏ qua khóa lạc quan · §26 lỗi tổng của form không mất khi sửa ô khác của tổng · §28 react-pdf 11 mặc định Suspense, PDF lỗi làm sập route · §29 Esc trong combobox tự viết đóng cả dialog Radix · §35 Handlebars bỏ dòng chỉ chứa `{{#each}}`, email văn bản dính dòng · §41 hàng chờ tự lưu bỏ qua debounce, lượt gộp vượt body 100 KB của Express
- RabbitMQ, job AI: §16 `RabbitMQModule` giữ connection static · §17 mặc định sai của thư viện message · §32 kiểm chéo trên schema hợp đồng message làm cả kết quả AI vào DLQ · §33 kết quả AI về trước khi API ghi `job_id`, message của một job xử lý song song
- Sự kiện, tác vụ định kỳ: §34 việc phải chạy một lần ở mốc pha mà chỉ nằm trong listener `campaign.phase_changed` thì mất khi lỗi hoặc API dừng · §36 `emitAsync` không chờ listener `async: true`, test sự kiện trùng xanh mà không kiểm gì
- ai-service (Python): §19 chặn mạng trong pytest trên Windows · §20 PyMuPDF cắt chữ ngoài trang, màu nền theo thứ tự vẽ · §23 `HF_HUB_OFFLINE` đọc lúc import, bge-m3 tải 4,5 GB · §31 fixture LLM mất khóa khi nâng prompt hoặc sửa dữ liệu test nằm trong prompt · §37 nhóm gửi LLM lỗi tất định được gửi lại y nguyên, câu chờ giữ chỗ của ô

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
- (0.3.0) `validate` và `sync` chỉ tìm file sprint trong `docs/sprints/`, không tìm trong `archive/`. Chuyển sprint đã đóng vào `archive/` thì story còn trỏ `sprint:` tới nó sẽ báo `not_found`. Giữ sprint đã đóng ở `docs/sprints/` với `status: closed`.

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
- `add` một primitive phụ thuộc file đã sửa (như `button.tsx`) thì CLI hỏi ghi đè và dừng ở đó khi không có ai trả lời, nên các file sau không được tạo. Chạy `yes n | head -20 | pnpm dlx shadcn@4.21.0 add … --cwd apps/web` để trả lời "không" cho mọi câu hỏi ghi đè (0.3.0, US-1.4).
- Primitive sinh ra là mã của repo: đọc lại từng file. Ở US-1.3 đã sửa `sonner.tsx` (bỏ `next-themes`), `use-mobile.ts` (setState trong effect bị react-hooks v7 chặn), chuỗi trợ năng tiếng Anh trong `sheet.tsx`/`sidebar.tsx`. Mọi chỗ sửa ghi ở [DESIGN.md](../DESIGN.md) §6.

See [CONTEXT.md D26](CONTEXT.md).

## 9. `@nestjs/schedule` 12 và `@nestjs/event-emitter` 12 chỉ có ESM: Jest của API không nạp được

**What happened (0.3.0)**: US-1.4 cài `@nestjs/schedule` 12.0.2 và `@nestjs/event-emitter` 12.0.1, bản mới nhất, nhận peer `@nestjs/common ^11 || ^12`. `tsc` và ESLint qua. Integration test thì đỏ cả 7 file dựng `AppModule`: `Must use import to load ES Module: …/@nestjs/event-emitter/dist/index.js`.

**Why**: Từ bản 12, hai gói này có `"type": "module"`. API build ra CommonJS (`module: nodenext`, `package.json` không có `"type"`). Node 22.12+ chạy được `require()` một module ESM, nhưng runtime của Jest 30 chỉ hỗ trợ việc đó từ Node 24.9. Peer `^11` không có nghĩa là gói chạy được với một app CommonJS.

**How to avoid**:
- Với NestJS 11, dùng dòng gói cùng thời: `@nestjs/schedule` 6.x, `@nestjs/event-emitter` 3.x. Repo ghim 6.1.3 và 3.1.0.
- Trước khi thêm một gói `@nestjs/*`, kiểm `npm view <gói>@<bản> type`: có `"module"` mà không có bản CommonJS (xem mục 0.6.0 dưới đây) thì không dùng được với API này.
- Sau khi thêm gói, chạy `pnpm --filter @srm/api test` (cả integration), không chỉ `typecheck` và `lint`.
- (0.6.0) `"type": "module"` chưa chắc là chỉ có ESM. `nodemailer` 10 khai `"type": "module"` nhưng `exports` có điều kiện `require` trỏ vào `dist/cjs`, và `dist/cjs/package.json` ghi `"type": "commonjs"`, nên Jest nạp được (US-1.7). Gặp `"module"` thì xem tiếp `npm view <gói>@<bản> exports`. Có `require` thì tải tarball (`npm pack`) và kiểm `package.json` của thư mục CJS. Chỉ khi không có `require` thì mới loại gói.
- (0.4.0) Bẫy này không riêng NestJS. `file-type`, thư viện ARCH chọn để kiểm MIME thật, chỉ có ESM từ bản 17 (bản mới nhất 22.x). Repo ghim 16.5.4, bản CommonJS cuối cùng (`fromBuffer`, nhận DOCX qua mục `word/` trong zip). Không dùng `import()` động để né: Jest cần `--experimental-vm-modules`.
- (0.7.0) Gói chỉ có ESM có thể nằm sâu trong cây phụ thuộc. `@golevelup/nestjs-rabbitmq` 9.1.0 là CommonJS, nhưng `amqp-connection-manager` 5.0.1 bên dưới `require` gói `promise-breaker` 7, gói này chỉ có ESM. `tsc` và `node dist/main.js` chạy được; unit test đỏ với `Must use import to load ES Module: …/promise-breaker/dist/index.js` (US-2.1). Vì gói không phải phụ thuộc trực tiếp, `apps/api/jest.config.cjs` biên dịch riêng nó sang CommonJS: thêm `transform` cho `promise-breaker/*.js` bằng ts-jest (`allowJs`) và loại nó khỏi `transformIgnorePatterns`. Cách này không đổi phụ thuộc production. Kiểm cả cây: `node -e "require('<gói>')"` qua, rồi chạy Jest.

See [US-1.4](sprints/stories/US-1.4-campaign-setup-and-config.md) › Implementation notes.

## 10. Zod 4 bỏ qua `refine`/`superRefine` của object khi trường khác đã lỗi

**What happened (0.3.0)**: Schema tham số đợt kiểm α + β = 1 bằng `superRefine` trên object. Gửi α = 0,5, β = 0,6 cùng k = 0,5 thì API chỉ báo lỗi `config.k`, không báo `config.beta`. Người dùng sửa k xong mới thấy lỗi α + β.

**Why**: Zod 4 chỉ chạy kiểm tra của object khi chưa có lỗi nào trước đó. Truyền `{ when }` thì kiểm tra chạy theo điều kiện riêng. Nhưng nếu một trường gặp lỗi chặn (ví dụ `.int()` với 1,5, mã `invalid_type`), Zod bỏ qua cả `when` và không chạy kiểm tra.

**How to avoid**:
- Kiểm tra chéo trường trong form dùng `superRefine(fn, { when })`, với `when` chỉ xét lỗi của các trường mà nó đọc. Xem `whenValid` trong `packages/shared/schemas/common.ts`.
- Test schema có ca gửi lỗi chéo cùng lỗi của trường khác, để chắc lỗi chéo vẫn hiện.
- Không trông đợi lỗi chéo khi một trường nó đọc đang sai kiểu.
- (0.9.0) Ngược lại, `when` **có** chạy khi chính object sai kiểu (thiếu hẳn, `undefined`): lỗi đó có `path` rỗng nên không khớp tên trường nào, và hàm kiểm tra nhận `undefined`. `JdRequirementsSchema` lồng trong `JdAnalyzeOutput` đã ném `TypeError` khi `requirements` vắng mặt (US-2.3). `when` phải trả `false` khi có lỗi `path.length === 0`, và hàm kiểm tra không giả định kiểu của dữ liệu. Xem `whenSkillListsParsed` trong `packages/shared/contracts/jd.ts`; test bằng `safeParse(undefined)`.
- (0.14.0) Một lỗi có `abort: true` ở **bất kỳ** trường nào cũng làm Zod 4.6 bỏ qua `superRefine(fn, { when })`, kể cả khi `when` không đọc trường đó. US-2.7: tên kỹ năng rỗng (`skillName()` có `abort`) làm mất lỗi "họ không hợp nhóm". Trường nằm trong object có kiểm tra chéo thì không dùng `abort`; `skillName()` đã bỏ.
- (0.20.0) Lỗi chặn nằm sâu trong mảng lồng cũng vậy: ô ma trận đề có số câu 1,5 làm mất lỗi tổng số câu và tỷ trọng (US-4.1). Form báo lỗi hai lượt; test `BR-05 an invalid cell count hides the cross-field errors` ghim hành vi này.

See [US-1.4](sprints/stories/US-1.4-campaign-setup-and-config.md) › Implementation notes.

## 11. Jest bỏ qua `testTimeout` đặt trong một mục `projects`

**What happened (0.4.0)**: Khi chạy `pnpm test` cho US-1.5, một vài integration test đỏ, mỗi lần một nhóm khác nhau, với lỗi `Exceeded timeout of 5000 ms for a hook` ở `beforeAll`. Chạy riêng từng file thì xanh. `apps/api/jest.config.cjs` vẫn khai `testTimeout: 120_000` cho project `integration` từ US-1.1.

**Why**: `testTimeout` là tùy chọn global. jest-circus chỉ đọc `globalConfig.testTimeout`; giá trị trong một project bị bỏ qua mà không báo gì, nên integration test luôn chạy với mặc định 5 giây. `beforeAll` dựng cả app Nest, băm mật khẩu bằng scrypt và đăng nhập vài tài khoản. Khi nhiều worker chạy cùng lúc (thêm MinIO, thêm 7 file test) và máy đang chạy compose, hook vượt 5 giây.

**How to avoid**:
- Đặt timeout của một project bằng `setupFilesAfterEnv` gọi `jest.setTimeout(...)` (xem `apps/api/test/setup/timeout.ts`), hoặc đặt `testTimeout` ở cấp gốc nếu mọi project dùng chung.
- Test chỉ đỏ khi chạy cả bộ thì đọc thông báo lỗi trước: timeout của hook là dấu hiệu cấu hình timeout, không phải lỗi logic.

See [US-1.5](sprints/stories/US-1.5-company-hr-accounts-jd-posting-approval.md) › Implementation notes.

## 12. Drizzle `.for('update', { of })` sinh tên có schema, PostgreSQL từ chối

**What happened (0.4.0)**: `JdRepository.findById` đọc JD kèm tên công ty (join `companies`) và khóa dòng JD bằng `.for('update', { of: jobDescriptions })`. Mọi endpoint sửa JD trả `500`. Drizzle 0.45 sinh `FOR UPDATE OF "core"."job_descriptions"`, còn PostgreSQL chỉ nhận tên bảng không có schema (hoặc alias) trong mệnh đề `OF`.

**Why**: Mọi bảng nghiệp vụ nằm trong `pgSchema('core')`. Drizzle in tham chiếu bảng kèm schema ở mọi chỗ, kể cả `OF`.

**How to avoid**:
- Cần khóa một bảng trong câu có join thì khóa bằng một câu riêng không join (`select id … for update`), rồi mới đọc bằng câu join trong cùng giao dịch. Xem `JdRepository.findById`.
- Không dùng `.for(..., { of })` với bảng của schema `core`. Câu không join thì `.for('update')` vẫn đúng.
- Lỗi SQL thành `500 INTERNAL_ERROR` và test không in log (`LOG_LEVEL=silent`). Tái hiện bằng một script nhỏ, hoặc xem `toSQL()` của câu truy vấn.

See [US-1.5](sprints/stories/US-1.5-company-hr-accounts-jd-posting-approval.md) › Implementation notes.

## 13. multer đọc tên file theo latin1: tên tiếng Việt bị lỗi font

**What happened (0.4.0)**: Khi làm tải file JD, đọc mã multer 2.4 (`lib/make-middleware.js`) thì thấy `defParamCharset` mặc định là `latin1`. Trình duyệt gửi tên file UTF-8 trong `Content-Disposition` của phần multipart, nên `file.originalname` của "Mô tả công việc.pdf" thành chuỗi lỗi font, và bị lưu vào `file_name`.

**Why**: Busboy chỉ dùng UTF-8 khi phần header có `filename*=` ghi rõ charset. Trình duyệt gửi `filename="..."` dạng byte UTF-8 thô, multer giải mã theo charset mặc định.

**How to avoid**:
- Dùng decorator `SingleFileUpload()` ở `apps/api/src/common/storage/upload-validation.ts`: nó đặt `defParamCharset: 'utf8'` cùng giới hạn 5 MB. US-1.6 (CV) dùng lại, không tự gọi `FileInterceptor`.
- Tên file của client chỉ để hiển thị: lọc bằng `displayFileName()` (bỏ đường dẫn, ký tự điều khiển, cắt 255 ký tự). Key trên MinIO là UUID, không lấy từ tên file.
- Integration test tải file có tên tiếng Việt và kiểm `filename*` trong header tải về (`files-url.int-spec.ts`).

See [US-1.5](sprints/stories/US-1.5-company-hr-accounts-jd-posting-approval.md) › Implementation notes.

## 14. Compose truyền biến tùy chọn chưa đặt thành chuỗi rỗng, Zod `.min(1).optional()` từ chối

**What happened (0.6.0)**: US-1.7 thêm `SMTP_USER`, `SMTP_PASSWORD` (tùy chọn) vào env của API, schema là `z.string().min(1).optional()`. Khi nối vào `deploy/docker-compose.yml` bằng `SMTP_USER: ${SMTP_USER:-}`, biến chưa đặt sẽ đến API dưới dạng `""` chứ không phải không có. `.optional()` chỉ bỏ qua `undefined`, nên `""` vẫn bị `.min(1)` từ chối và API không khởi động được. Unit test của env không bắt được lỗi này, vì nó chỉ thử với biến không có mặt.

**Why**: Trong compose, `KEY: ${VAR:-}` luôn khai báo biến cho container, với giá trị rỗng khi `VAR` chưa đặt. Không có cú pháp nào để chỉ khai báo khi có giá trị.

**How to avoid**:
- Biến tùy chọn mà compose truyền qua `${VAR:-}` thì cho chuỗi rỗng nghĩa là chưa đặt: dùng helper `optionalText()` trong `apps/api/src/common/config/env.ts`.
- Biến có mặc định thì đặt mặc định ngay trong compose (`${SMTP_HOST:-mailpit}`), không để rỗng.
- Thêm biến mới vào compose thì thêm vào `env.spec.ts` một ca giá trị `""`.

See [CONTEXT.md D31](CONTEXT.md).

## 15. Chạy `pnpm test` khi compose stack đang bật: máy dev hết RAM, suite đỏ ngẫu nhiên

**What happened (0.6.0)**: Ở US-1.7, compose stack (7 service) được bật để kiểm đầu-cuối. Trong lúc đó chạy `pnpm test` ở gốc repo ba lần, lần nào cũng đỏ vài suite nhưng mỗi lần một nhóm khác: `password.spec.ts`, `record-access`, `jd-access`, `cv-active-constraint`, `notification-listeners`. Chạy riêng từng file thì xanh. Lần thứ ba, output kết thúc bằng `Fatal process out of memory: Zone` của V8. Dừng compose (`docker compose … stop`) rồi chạy lại thì xanh hai lần liền.

**Why**: `pnpm test` chạy song song test của shared, Jest unit và Jest integration. Integration lại bật thêm PostgreSQL, Redis, MinIO bằng testcontainers, và mỗi file test dựng một hoặc hai app Nest. Cộng thêm compose stack (PostgreSQL, RabbitMQ, MinIO, Redis, Mailpit, API, nginx) thì vượt RAM của máy dev. Scrypt (N = 2^15) trong unit test cũng chậm lại khi máy thiếu tài nguyên, nên vượt timeout mặc định 5 giây.

**How to avoid**:
- Dừng compose trước khi chạy cả bộ test: `docker compose -f deploy/docker-compose.yml stop`. Volume và dữ liệu vẫn giữ nguyên.
- Suite đỏ ngẫu nhiên, mỗi lần một nhóm khác nhau, thì xem cuối output: `out of memory` hay `Exceeded timeout` là lỗi môi trường (xem thêm §11), không phải lỗi logic.
- Kiểm đầu-cuối trên compose và chạy bộ test là hai bước riêng, không chạy cùng lúc.
- (0.10.0) Lỗi lặp lại ở US-2.4 khi compose đã tắt: `FATAL ERROR: Zone Allocation failed - process out of memory` trên nhiều tiến trình Node mới chạy được 0,5–1,5 giây, heap mới 8–31 MB. Heap nhỏ như vậy nghĩa là Windows hết *commit memory* (RAM + pagefile: 20,5 GB trên máy 15,5 GB RAM, Chrome, VS Code và các phiên agent đã giữ khoảng 18 GB), không phải V8 hết heap; `--max-old-space-size` không giúp gì. Hai nguyên nhân: Jest mặc định mở số worker bằng số luồng CPU trừ một (13 worker, mỗi worker integration dựng app Nest) và lệnh `--selectProjects` chạy cả bộ thay vì vài file (§21). Đã sửa: `apps/api/jest.config.cjs` đặt `maxWorkers: 4` và `workerIdleMemoryLimit`, còn shared đặt `maxWorkers: '50%'`. Trên Windows nên giới hạn VM của WSL bằng `%USERPROFILE%\.wslconfig` (`memory=6GB`, `autoMemoryReclaim=dropCache`). Docker Desktop không trả lời `docker version` là dấu hiệu VM đang thiếu RAM.
- Test treo hoặc máy chậm bất thường: tìm tiến trình `jest-worker` còn sót (§18) trước khi chạy lại. Một lần chạy treo có thể giữ khoảng 2 GB trong nhiều giờ.

See [US-1.7](sprints/stories/US-1.7-notifications-sse-email-reminders.md) › Implementation notes, [US-2.4](sprints/stories/US-2.4-cv-parser-hidden-text-pii-split.md).

## 16. `RabbitMQModule` của golevelup giữ connection trong biến static: hai app Nest trong một process giẫm lên nhau

**What happened (0.7.0)**: Khi thêm module `aigateway` (US-2.1), đọc mã của `@golevelup/nestjs-rabbitmq` 9.1.0 trước khi dùng `RabbitMQModule.forRootAsync`. Module này lưu connection vào `RabbitMQModule.connectionManager` (static, một `Map` theo `config.name`, mặc định `default`) và cờ static `bootstrapped`. Vài integration test dựng hai app Nest trong cùng một file (`events-stream`, `campaign-scheduler`). App thứ hai ghi đè connection của app thứ nhất trong `Map`, bỏ qua bước đăng ký handler, và khi app thứ nhất đóng thì connection của app thứ hai bị đóng theo. Connection của app thứ nhất không bao giờ được đóng, nên Jest không thoát.

**Why**: Thư viện được thiết kế cho một app mỗi process. Trạng thái nằm ở biến static của class, không nằm trong container DI của từng app.

**How to avoid**:
- Không dùng `RabbitMQModule`. Mỗi app tạo `AmqpConnection` của golevelup trong một provider (`modules/aigateway/infrastructure/amqp.ts`), đóng nó trong `onApplicationShutdown`, và đăng ký consumer bằng `connection.createSubscriber` trong `onApplicationBootstrap`.
- `createSubscriber` chỉ resolve khi broker kết nối được. Không `await` nó trong `onApplicationBootstrap`, nếu không app chờ RabbitMQ mới khởi động xong.
- Trước khi dùng một module NestJS bọc kết nối ngoài (broker, cache), tìm `static` trong mã của nó.

See [CONTEXT D33](CONTEXT.md).

## 17. Mặc định của các thư viện message đều sai cho job AI: requeue mãi, bỏ message, chạy song song không giới hạn, không chờ listener

**What happened (0.7.0)**: Khi dựng đường ống job AI (US-2.1), đọc mã của từng thư viện thì thấy bốn mặc định, mỗi cái gây một lỗi khác nhau nếu để nguyên:

1. golevelup: handler `@RabbitSubscribe`/`createSubscriber` ném lỗi thì message bị requeue (`defaultSubscribeErrorBehavior: REQUEUE`). Một message sai schema quay vòng mãi (poison message).
2. FastStream 0.7: handler ném lỗi thì message bị reject không requeue, tức là mất job.
3. FastStream qua aio-pika: không đặt `prefetch_count` thì mọi message được giao sẽ chạy song song. Một worker có thể nhận cả trăm job LLM cùng lúc.
4. `@nestjs/event-emitter`: listener khai `@OnEvent(name, { async: true })` thì `emitAsync` trả về trước khi listener chạy xong, nên lỗi của listener không về tới consumer. Mặc định `suppressErrors: true` còn nuốt lỗi.

**Why**: Mỗi thư viện chọn mặc định cho trường hợp phổ biến của nó (RPC, demo, sự kiện fire-and-forget), không cho job cần xử lý đúng một lần về mặt nghiệp vụ.

**How to avoid**:
- Hai phía tự quyết định ack/nack cho từng message và bắt mọi lỗi trong handler: FastStream dùng `AckPolicy.MANUAL`; consumer `ai.results` trả `Nack` hoặc không gì cả, và message hỏng được chuyển sang DLQ rồi ack.
- Worker đặt `RabbitBroker(default_channel=Channel(prefetch_count=…))`.
- Listener của `ai.result.<TYPE>` dùng `@OnEvent(name, { suppressErrors: false })`, không `async: true` (quy ước trong `aigateway/domain/events.ts`).
- Hai phía khai báo queue giống hệt nhau: FastStream luôn gửi `x-queue-type`, nên API cũng gửi tham số này. RabbitMQ từ chối khai báo lại một queue với tham số khác (`PRECONDITION_FAILED`).

See [CONTEXT D33](CONTEXT.md).

## 18. testcontainers build image bằng builder cũ và xóa image sau mỗi lần chạy: `pip install` mỗi lần hơn 10 phút, `beforeAll` quá hạn, Jest treo

**What happened (0.7.0)**: Test trọn vòng của US-2.1 build `ai-service/Dockerfile` bằng `GenericContainer.fromDockerfile(…).build()`. Lần đầu cả file chạy 406 giây. Lần thứ hai, bước `pip install` trong lúc build kéo dài hơn 10 phút, `beforeAll` (600 giây) quá hạn và Jest không thoát: app Nest tạo song song với worker vẫn giữ kết nối AMQP tới RabbitMQ đã bị dừng.

**Why**:
- testcontainers 12 build qua Docker API bằng builder cũ, nên không dùng lại cache của BuildKit (`docker build`, `docker compose build`).
- Mặc định `deleteOnExit: true`: image bị xóa khi chạy xong, kéo theo cache layer, nên lần sau build lại từ đầu.
- `Promise.all([startWorker(), createApp()])`: khi `beforeAll` quá hạn, promise còn lại vẫn chạy tiếp và `afterAll` không có gì để đóng.

**How to avoid**:
- `build('<tên image>', { deleteOnExit: false })`: image được giữ lại, lần sau chỉ build lại lớp `app/` (vài giây).
- Dockerfile cài phụ thuộc ở một layer riêng, chỉ phụ thuộc `pyproject.toml`.
- Dựng tài nguyên lần lượt trong `beforeAll` (app trước, container build lâu sau) và gán biến ngay, để `afterAll` đóng được phần đã chạy.
- Test bị treo sau khi `beforeAll` lỗi thì tìm tiến trình `node` còn chạy và dừng nó; container đã dừng nhưng kết nối của app vẫn thử lại.

See [US-2.1](sprints/stories/US-2.1-ai-job-pipeline-message-contracts.md) › Implementation notes.

## 19. Chặn mạng trong pytest bằng `socket.connect` không chặn được client async trên Windows

**What happened (0.8.0)**: US-2.2 cần chứng minh test của AI Service không gọi API LLM thật (AC-11). Bản đầu của `tests/conftest.py` chỉ thay `socket.socket.connect`. Kết nối đồng bộ bị chặn, nhưng khi thử gọi `genai.Client(...).aio.models.generate_content` với key giả, request vẫn tới Google và nhận về `400 API key not valid`. Toàn bộ test vẫn xanh, nên lỗ hổng chỉ lộ ra khi cố tình thử gọi API thật.

**Why**:
- Trên Windows, asyncio mặc định dùng Proactor event loop. `loop.sock_connect` của nó kết nối bằng `ConnectEx` (overlapped I/O), không đi qua `socket.socket.connect`.
- httpx (google-genai), httpx2 (anthropic) và aiohttp đều kết nối qua `loop.create_connection`, nên vượt qua được hàng rào chỉ đặt ở tầng socket.

**How to avoid**:
- Chặn ở ba tầng: `socket.getaddrinfo` (từ chối tên miền không phải loopback), `asyncio.base_events.BaseEventLoop.create_connection` (từ chối host không phải loopback), và `socket.socket.connect` / `connect_ex` cho client đồng bộ. Để ngỏ loopback, vì Proactor tạo self-pipe bằng một cặp socket localhost.
- Giữ một test gọi thật từng SDK (`tests/test_no_network.py`) và kiểm rằng lỗi trả về đến từ hàng rào. Chỉ test client tự viết thì không thấy được lỗ hổng.

See [US-2.2](sprints/stories/US-2.2-llm-client-versioned-prompts.md) › Implementation notes.

## 20. PyMuPDF: chữ ngoài trang bị cắt mất, màu nền phải lấy theo thứ tự vẽ

**What happened (0.9.0)**: Khi dựng `ai-service/app/parsing/pdf.py` (US-2.3), có hai bẫy:

1. Đã bỏ cờ `TEXT_MEDIABOX_CLIP` khỏi `get_text("dict")`, nhưng chữ đặt ngoài trang vẫn không xuất hiện. Không thấy chữ thì không gắn được cờ chữ ẩn.
2. Bản đầu lấy màu nền bằng "hình tô cuối cùng chứa tâm của chữ" trong `get_drawings()`, không xét chữ vẽ trước hay sau hình. Code review chỉ ra hai lỗ:
   - chữ đen bị một hình chữ nhật trắng vẽ đè lên vẫn lọt vào prompt;
   - chữ trắng trên banner là ảnh bị loại nhầm, vì ảnh không có trong `get_drawings()` nên nền bị coi là trang trắng.

**Why**:
- `get_text` mặc định cắt theo `page.rect`, độc lập với cờ `TEXT_MEDIABOX_CLIP`.
- `get_drawings()` chỉ có hình vector. Ảnh và gradient nằm ở `get_bboxlog()`.
- Chỉ `get_bboxlog()` cho thứ tự vẽ của cả chữ, hình và ảnh. Vị trí của một mục trong log trùng `seqno` của `get_drawings()`.

**How to avoid**:
- Đọc chữ bằng `page.get_text("dict", flags=…, clip=pymupdf.INFINITE_RECT())`, rồi tự quyết định chữ nào nằm ngoài trang.
- Nền của một span là hình tô gần nhất vẽ **trước** nó và chứa tâm của nó. Hình tô gần như đục vẽ **sau** nó thì nó bị che. Dưới ảnh hay gradient thì không biết màu nền, nên không so màu.
- Lấy thông tin một hình tô (màu, độ đục) bằng `seqno` của `get_drawings()` theo vị trí trong `get_bboxlog()`.
- Dựng PDF thử bằng PyMuPDF ngay trong test (`insert_text`, `draw_rect`, `insert_image`). Font `helv` có sẵn không có dấu tiếng Việt; ca tiếng Việt để cho DOCX.

See [US-2.3](sprints/stories/US-2.3-jd-analyzer-hr-requirement-confirmation.md) › Implementation notes.

## 21. `jest --selectProjects integration <đường dẫn>` chạy cả bộ test: `--selectProjects` nhận nhiều giá trị

**What happened (0.10.0)**: Khi làm US-2.4, lệnh `pnpm exec jest --selectProjects integration test/integration/cv-parse-result …` được dùng để chạy riêng vài file integration. Jest lại chạy mọi file `*.int-spec.ts`, máy hết RAM ("Zone Allocation failed - process out of memory"), và nhiều suite không liên quan đỏ với "Jest worker ran out of memory".

**Why**: `--selectProjects` là tùy chọn kiểu mảng. Mọi giá trị đứng sau nó (kể cả đường dẫn test) bị coi là tên project. Không project nào khớp các đường dẫn, nên Jest chỉ chọn `integration` và chạy cả project, không lọc file.

**How to avoid**:
- Lọc file bằng tùy chọn có tên, rồi mới chọn project: `pnpm exec jest --testPathPatterns 'test/integration/(cv-parse-result|ai-job-roundtrip)' --selectProjects integration --runInBand`.
- Dòng đầu ra phải là "Running one project: integration", và danh sách suite chỉ gồm các file đã chọn.
- Máy dev ít RAM thì thêm `--runInBand` và tắt compose trước (§15).

See [US-2.4](sprints/stories/US-2.4-cv-parser-hidden-text-pii-split.md) › Implementation notes.

## 22. Các file integration dùng chung một database: thông báo gửi cho mọi tài khoản CENTER lọt vào test của file khác

**What happened (0.10.0)**: `pnpm test` thỉnh thoảng đỏ ở `email-outbox.int-spec.ts`, test "two workers never send the same email twice": `emailStatus` của 12 người nhận không phải toàn `SENT`. Assertion ngay trước đó (mỗi người nhận đúng một email) vẫn xanh. Chạy riêng file thì xanh.

**Why**: Mọi file integration dùng chung một PostgreSQL, và Jest chạy tối đa 4 file một lúc. Từ US-2.3 và US-2.4, `JD_REQUIREMENTS_VERSIONED` và `CV_NEEDS_ATTENTION` được gửi qua kênh `IN_APP` cho mọi tài khoản CENTER đang hoạt động. Khi `jd-requirements.int-spec.ts` hoặc `cv-parse-result.int-spec.ts` chạy cùng lúc, user CENTER mà file khác vừa tạo nhận thêm dòng có `emailStatus = null`. Test đếm mọi dòng của user đó vì thế bị lệch.

**How to avoid**:
- Test đọc thông báo của user CENTER thì chỉ lấy loại mà test tự tạo: `notificationsOfType(db, type, ...userIds)` trong `apps/api/test/helpers/notifications.ts`.
- Tổng quát: đừng giả định dữ liệu của user test chỉ do file mình tạo ra. Thao tác gửi cho "mọi tài khoản có vai trò X" chạm cả vào user của file khác. Assertion phải giới hạn theo ID, loại hoặc `dedupeKey` của chính test.
- Khi thêm thông báo gửi cho cả một vai trò, grep các test tạo user vai trò đó (`createLoginUser('CENTER')`) và đọc bảng `notifications`.
- Lỗi chỉ hiện khi các file chạy cùng lúc, nên chạy riêng một file mà xanh chưa chứng minh đã sửa xong.
- Tác vụ quét cũng vậy (0.19.0): `runOnce()` của `PreferenceAutoAssignScheduler` chạy Q6 cho mọi đợt `TESTING` trong DB. Gọi nó từ `competition.int-spec.ts` đã gán NV cho SV của `preferences.int-spec.ts`, làm test Q6 của file đó đỏ. Chỉ file kiểm chính tác vụ quét mới gọi `runOnce()`; file khác gọi các bước của tác vụ cho đợt của mình (`AutoAssignPreferencesService.run(id)`, rồi `LowPreferenceAlertService.afterAutoAssign`).

See [US-1.7](sprints/stories/US-1.7-notifications-sse-email-reminders.md) (các test bị ảnh hưởng), [US-2.3](sprints/stories/US-2.3-jd-analyzer-hr-requirement-confirmation.md), [US-2.4](sprints/stories/US-2.4-cv-parser-hidden-text-pii-split.md) (nơi thêm thông báo gửi cả vai trò).

## 23. huggingface_hub đọc `HF_HUB_OFFLINE` lúc import; transformers tải bge-m3 hai lần

**What happened (0.11.0)**: Test `@slow` của US-2.5 nạp `BAAI/bge-m3` từ bộ đệm trên máy. Fixture đặt `monkeypatch.setenv("HF_HUB_OFFLINE", "1")`, nhưng test vẫn gọi tới huggingface.co, và hàng rào mạng của `conftest.py` chặn lại (LESSONS §19). Lần tải trước đó cũng chiếm khoảng 4,5 GB, gần gấp đôi con số 2,3 GB đã ghi trong tài liệu.

**Why**:
- `huggingface_hub.constants.HF_HUB_OFFLINE` được tính một lần khi module được import. Lúc fixture chạy, module đã được import, nên đặt biến môi trường sau đó không có tác dụng.
- transformers 5 tải trọng số của bge-m3 ở cả hai dạng, `pytorch_model.bin` và `model.safetensors`.

**How to avoid**:
- Trong test, sửa thẳng hằng: `monkeypatch.setattr(huggingface_hub.constants, "HF_HUB_OFFLINE", True)`, kèm `setenv` cho tiến trình con. Ví dụ: fixture `offline_model` trong `ai-service/tests/embedding/test_model.py`.
- Ngoài test, đặt `HF_HUB_OFFLINE=1` (và `HF_HOME`) trước khi khởi động Python.
- Dung lượng ổ đĩa và volume `hf-models` tính theo 4,5 GB. RAM tính theo trọng số nạp vào bộ nhớ, khoảng 2,3 GB, tức 2,5–3 GB cho mỗi bản sao worker.
- Console Windows dùng cp1252: test in tiếng Việt thì ghi byte UTF-8 vào `sys.stdout.buffer` thay vì `print`.

See [US-2.5](sprints/stories/US-2.5-embeddings-skill-catalog.md), [CONTEXT D39](CONTEXT.md).

## 24. Index HNSW lọc sau khi quét: hàng cũ cùng loại chiếm chỗ ứng viên, truy vấn trả thiếu

**What happened (0.11.0)**: Khi review US-2.5, truy vấn tìm kỹ năng gần nhất có bộ lọc `version` (join `core.v_ai_skills`) và `model`, quét index HNSW một phần của `owner_type = 'skill'`. Mỗi lần gộp kỹ năng, `row_version` của kỹ năng đích tăng, và một vector mới được thêm cho cùng tên, nhưng vector cũ vẫn nằm trong index. Đổi `EMBEDDING_PROVIDER` cũng để lại vector của model cũ.

**Why**: pgvector quét HNSW trước, lấy `hnsw.ef_search` ứng viên gần nhất (mặc định 40), rồi mới áp `WHERE` và join. Ứng viên bị lọc bỏ không được thay bằng hàng khác, trừ khi bật `hnsw.iterative_scan`. Nhiều vector cũ gần với truy vấn có thể chiếm hết 40 chỗ, nên truy vấn trả ít dòng hơn `LIMIT` hoặc không dòng nào. Lỗi không lộ ra trong test vì danh mục test nhỏ.

**How to avoid**:
- Mỗi giá trị lọc tách biệt bằng hằng thì dùng index một phần riêng, và ghi giá trị đó dạng hằng trong SQL. `ai.embeddings` có một index cho mỗi `owner_type` (CONTEXT D39).
- Lọc theo phiên bản hoặc model thì xóa hàng không còn dùng được ngay khi ghi bản mới, như `PRUNE_SKILL_EMBEDDINGS_SQL` trong `ai-service/app/embedding/store.py`.
- US-3.2 (embedding JD và CV theo phiên bản), US-4.1, US-4.7 sẽ gặp cùng bẫy. Nếu không xóa được hàng cũ, đặt `SET LOCAL hnsw.iterative_scan = relaxed_order` cho truy vấn đó.

See [US-2.5](sprints/stories/US-2.5-embeddings-skill-catalog.md), [CONTEXT D39](CONTEXT.md).

## 25. Form có `row_version`: gửi bản lúc form được nạp, không gửi bản của query mới nhất

**What happened (0.12.0)**: Khi review US-2.6, form hồ sơ năng lực gửi `rowVersion: view.rowVersion`, với `view` là dữ liệu mới nhất của `useCvProfile`. Query này tự tải lại mỗi khi có sự kiện SSE `cv.analysis`, vì handler invalidate cả tiền tố `['cvs', 'me']`. Form thì giữ giá trị cũ, do `defaultValues` chỉ đọc một lần. Ví dụ: SV lưu ở tab B, tab A tải lại `view` vì một sự kiện khác. Sau đó tab A lưu và gửi `row_version` mới, kèm hồ sơ cũ. Server nhận, ghi đè bản của tab B, và không trả 409.

**Why**: Khóa lạc quan chỉ đúng khi `row_version` gửi lên đi cùng giá trị mà form đã đọc. TanStack Query thay `data` ngầm khi refetch (invalidate theo tiền tố, focus cửa sổ). React Hook Form không tự `reset` khi prop đổi.

**How to avoid**:
- Giữ `rowVersion` của lần nạp form trong state hoặc trong giá trị form. Cập nhật nó sau khi lưu thành công và khi người dùng bấm tải lại, như `ProfileForm` (`features/student/profile/profile-form.tsx`).
- Cách khác: đặt `key={data.rowVersion}` cho form, như các form đợt (`campaign-pages.tsx`). Form dựng lại khi dữ liệu đổi, nhưng mất phần đang sửa. Không dùng cách này khi query hay tự tải lại (SSE).
- Review form có `row_version` thì tìm `rowVersion: <dữ liệu query>.rowVersion` trong hàm gửi.

See [US-2.6](sprints/stories/US-2.6-student-profile-confirmation.md), [CONTEXT D40](CONTEXT.md).

## 26. Lỗi "tổng phải bằng 1" của form không mất khi sửa một ô khác của tổng

**What happened (0.13.0)**: Khi review US-3.1, `/code-review` phát hiện lỗi này ở form đợt. Schema dùng chung gắn lỗi tổng vào ô cuối của tổng: `beta` cho α + β, `scv_weight_language` cho 5 trọng số S_cv. Ví dụ: đặt trọng số ngoại ngữ 0,2, form báo "Tổng 5 trọng số S_cv phải bằng 1". Hạ kỹ năng bắt buộc từ 0,4 xuống 0,3 cho tổng về 1, nhưng lỗi vẫn hiện dưới ô ngoại ngữ cho tới khi người dùng chạm vào ô đó hoặc bấm lưu. Lỗi α + β có từ US-1.4.

**Why**: Với `resolver`, React Hook Form chạy schema cho cả form nhưng chỉ cập nhật lỗi của ô vừa đổi. Lỗi của ô khác giữ nguyên, kể cả khi lần chạy mới không còn lỗi đó.

**How to avoid**:
- Ô thuộc một tổng (hoặc một ràng buộc chéo khác) khai `rules={{ deps: ['<ô mang lỗi>'] }}` trên `Controller`. Mỗi lần đổi, RHF kiểm lại cả ô mang lỗi. Mẫu: `SUM_ERROR_FIELD` trong `features/center/campaigns/parameter-fields.tsx`.
- `deps` chỉ chạy khi ô vừa đổi được kiểm, tức theo `mode` của form (`onTouched`: sau lần blur đầu).
- Thêm ràng buộc chéo mới vào schema form thì kiểm cả hai chiều: lỗi hiện khi sai, và mất khi sửa ở ô *khác*.

See [US-3.1](sprints/stories/US-3.1-hard-filters-and-scv-formula.md), §10.

## 27. nginx trả file `.mjs` là `application/octet-stream`, trình duyệt không nạp worker của pdf.js

**What happened (0.13.0)**: Trên bản compose (`:8080`), màn Hồ sơ của SV (US-2.6) báo "Setting up fake worker failed: Failed to fetch dynamically imported module: …/assets/pdf.worker.min-….mjs". `curl -I` cho thấy file trả `200` nhưng `Content-Type: application/octet-stream`. Vite dev (`:5173`) không bị.

**Why**: `/etc/nginx/mime.types` của `nginx:1.30-alpine` chỉ khai `application/javascript js;`, không có `mjs`, nên đuôi này rơi vào `default_type application/octet-stream`. Trình duyệt chỉ nạp module script (kể cả `import()` động và module worker) khi MIME là JavaScript. pdf.js đóng gói worker dạng `.mjs`, và Vite giữ nguyên đuôi khi import bằng `?url`.

**How to avoid**:
- `deploy/nginx.conf` khai `types { application/javascript mjs; }` ở cấp `server`, sau `include /etc/nginx/mime.types;`. Khối `types` ở một cấp **thay** cả bảng kế thừa từ `http`; thiếu `include` thì mọi file khác (CSS, font, ảnh) thành `octet-stream`.
- Thêm thư viện tải file tĩnh qua `?url` hoặc `new URL(…, import.meta.url)` thì kiểm trên compose: `curl -sI http://localhost:8080/assets/<tên file> | grep -i content-type`.
- File trong `/assets/` có cache `immutable` một năm. Tên file không đổi thì trình duyệt giữ cả response lỗi, nên sau khi sửa header phải xóa dữ liệu trang hoặc bật *Disable cache* rồi mới kiểm.

See [US-2.6](sprints/stories/US-2.6-student-profile-confirmation.md), §28.

## 28. react-pdf 11 mặc định dùng Suspense: PDF lỗi làm sập cả route

**What happened (0.13.0)**: Cùng lần với §27. Worker không nạp được, nhưng `CvViewer` không hiện thẻ "Không hiển thị được file CV" như thiết kế; cả màn chuyển sang "Unexpected Application Error!" của React Router. Code truyền `loading` và `onLoadError` theo cách dùng của các bản react-pdf trước 11.

**Why**: Từ bản 11, `Document`, `Page`, `Thumbnail`, `Outline` có prop `suspense` mặc định `true`: khi tải thì suspend, khi lỗi thì ném lên error boundary gần nhất. Không có boundary riêng thì đó là `errorElement` của route. `onLoadError` vẫn được gọi, nhưng lỗi bị ném ngay trong cùng lượt commit, nên `setFailed(true)` không kịp có tác dụng. `loading` và `error` chỉ được dùng khi `suspense={false}`.

**How to avoid**:
- Dùng `loading` / `error` / `onLoadError` thì đặt `suspense={false}` trên `Document`; `Page` con kế thừa. Mẫu: `features/student/profile/cv-viewer.tsx`.
- Muốn giữ Suspense thì bọc viewer trong `Suspense` và một error boundary riêng, theo README của react-pdf.
- Thư viện giao diện mới thêm hoặc vừa lên major: đọc phần giá trị mặc định trong README, và thử cả đường lỗi (URL hỏng, worker hỏng), không chỉ đường đúng.

See [US-2.6](sprints/stories/US-2.6-student-profile-confirmation.md), §27.

## 29. Phím Esc trong combobox tự viết đóng cả dialog Radix chứa nó

**What happened (0.14.0)**: Ô "Kéo theo" của US-2.7 là combobox tự viết (`role="combobox"`, danh sách gợi ý ngay dưới ô) nằm trong `AlertDialog` duyệt kỹ năng và `Sheet` sửa taxonomy. Bấm Esc để đóng danh sách gợi ý thì cả dialog đóng; mở lại thì form nạp lại từ đầu, mất mọi thứ đã nhập. Handler `onKeyDown` của ô có `preventDefault()` cho Esc nhưng không có tác dụng. `/code-review` bắt được; không test nào bắt.

**Why**: `useEscapeKeydown` của Radix (dùng trong Dialog, AlertDialog, Sheet, Popover) nghe `keydown` trên `document` ở pha capture. Pha capture chạy trước khi sự kiện tới ô nhập, nên dialog đã đóng trước khi handler của ô chạy.

**How to avoid**:
- Dialog hoặc sheet chứa combobox tự viết: truyền `onEscapeKeyDown={keepOpenOnListboxEscape}` (`apps/web/src/hooks/use-listbox-active.ts`). Hàm này `preventDefault()` khi Esc đến từ một `role="combobox"` đang `aria-expanded="true"`; handler của ô vẫn chạy và đóng danh sách.
- Phím mũi tên trong danh sách gợi ý dùng `useListboxActive` cùng file: mục đang chọn bỏ đi khi danh sách đổi, nên Enter không chọn nhầm kỹ năng của kết quả tìm cũ.
- Ô nhập nằm trong dialog: kiểm tay cả Esc, Enter và phím mũi tên, không chỉ chuột.

See [US-2.7](sprints/stories/US-2.7-skill-zones-families-implications.md).

## 30. Bảng mới trong schema `core` làm đỏ hai integration test cũ

**What happened (0.14.0)**: US-2.7 thêm bảng `core.skill_implications`. `pnpm test` đầy đủ đỏ ở hai file không liên quan tới story: `core-schema.int-spec.ts` (danh sách bảng `core` viết cứng) và `ai-service-role.int-spec.ts`, với lỗi `42703 column "id" does not exist` thay vì `42501 permission denied`.

**Why**: `ai-service-role` thử `UPDATE core.<bảng> SET id = …` trên mọi bảng `core` để chắc role `ai_service` không ghi được. Bảng mới không có cột `id` (khóa chính là cặp), và PostgreSQL báo cột không tồn tại trước khi xét quyền.

**How to avoid**:
- Thêm bảng `core`: thêm tên bảng vào `CORE_TABLES` trong `core-schema.int-spec.ts`.
- `ai-service-role` nay lấy cột đầu tiên của từng bảng từ `information_schema.columns`, nên bảng không có `id` vẫn qua. Test quét mọi bảng thì đừng giả định tên cột.
- Story sinh migration: chạy hai file này cùng integration test của story, đừng chờ tới `pnpm test` đầy đủ.

See [US-2.7](sprints/stories/US-2.7-skill-zones-families-implications.md).

## 31. Fixture LLM mất khóa khi nâng phiên bản prompt hoặc sửa dữ liệu test nằm trong prompt

**What happened (0.15.0)**: US-3.5 thêm prompt `cv_parser/v2`. Mọi test của CV Parser báo `FixtureMissingError`, vì 8 fixture cũ khóa theo request của v1. Sau đó, thêm kỹ năng Teamwork vào `CATALOGUE` dùng chung trong `tests/embedding_support.py` làm 3 test của `skill_normalizer` cũng báo `FixtureMissingError`, dù agent này không đổi.

**Why**: `fixture_key` là sha256 của cả request: `agent`, `prompt_version`, `system`, `user`, `output_schema`, `effort` (`app/llm/providers/fixture_provider.py`, `KEY_FIELDS`). Prompt của `skill_normalizer` có cả danh mục kỹ năng, nên đổi danh mục test là đổi `user` của mọi request.

**How to avoid**:
- Nâng `<agent>/v<N+1>`: viết script tạm (không commit) đổi `prompt_version` và `system` trong `request` của từng fixture cũ, tính lại `fixture_key`, ghi file mới, xóa file cũ, giữ nguyên `responses`. Script nên kiểm file cũ đúng khóa và đúng system của v<N> trước khi ghi. Fixture trong repo dùng CRLF; ghi lại đúng kiểu xuống dòng của file cũ.
- Fixture giữ `responses` cũ không chứng minh được prompt mới. Hành vi mới cần ít nhất một fixture mới, và nên chạy `ai-service/evals` với key thật trước khi phát hành.
- Cần dữ liệu test khác cho một test: truyền vào harness (`CatalogueHarness(catalogue)`, `Harness(catalogue=...)`), đừng sửa `CATALOGUE` dùng chung.

See [US-3.5](sprints/stories/US-3.5-skill-evidence-code-matching.md).

## 32. Kiểm chéo trên schema hợp đồng message làm cả kết quả AI vào DLQ

**What happened (0.16.0)**: US-3.6 cần kiểm "một ngôn ngữ không nằm ở cả `required_languages` lẫn `preferred_languages`". Plan đặt `superRefine` này trong `JdRequirementsSchema`, nơi form HR và API cùng dùng. Lúc nối bước bỏ mục trùng vào `jd-analysis.service.ts` mới thấy consumer `ai.results` cũng parse envelope bằng chính schema đó.

**Why**: kết quả AI không qua được schema của envelope thì consumer coi là message hỏng: vào DLQ với `INVALID_MESSAGE`, không ghi `FAILED`, JD kẹt ở trạng thái đang phân tích. Backend định bỏ mục trùng trước khi kiểm, nhưng không kịp chạy vì parse envelope thất bại trước.

**How to avoid**:
- Schema trong `packages/shared/contracts` mà message dùng chỉ kiểm hình dạng và giới hạn. Luật nghiệp vụ mà đề xuất của AI có thể vi phạm đặt ở schema request của người dùng (`HrJdRequirementsSchema = JdRequirementsSchema.superRefine(...)`) hoặc ở service sau khi parse.
- Đề xuất AI vi phạm luật thì backend làm sạch (`withoutOverlappingPreferred`) và ghi log, rồi kiểm bằng schema của người dùng; prompt cũng dặn tránh.
- Có integration test gửi kết quả AI vi phạm luật qua đúng consumer, và test PUT của người dùng nhận 400 cho cùng dữ liệu.

See [US-3.6](sprints/stories/US-3.6-language-cefr-major-match.md), [CONTEXT D45](CONTEXT.md).

## 33. Kết quả AI về trước khi API ghi xong `job_id`, và các message của một job được xử lý song song

**What happened (0.17.0)**: US-3.2 có hai lỗi cùng gốc:
- Lần chạy cả bộ test đầu tiên, E2E matching đỏ: run đã `SUCCEEDED` mà `pairs_scored` vẫn là 0. Message cuối của job `MATCH` đóng run trước khi chunk kết quả trước nó ghi xong.
- `/code-review` thấy `match_runs.job_id` chỉ được ghi sau khi `AiGatewayService.dispatch` trả về. Worker trả lời ngay, ví dụ khi mọi cặp đã rời view, thì handler tìm run theo `job_id` không thấy. Run kẹt `RUNNING` và chặn lượt chấm sau bằng 409.

**Why**: consumer `ai.results` đặt `prefetchCount: 10`, nên các message của cùng một job chạy song song, không theo thứ tự. Message bị requeue cũng về sau message gửi sau nó. Còn `dispatch` publish xong mới trả `job_id`, mà từ lúc broker nhận job thì câu trả lời có thể về bất cứ lúc nào.

**How to avoid**:
- Kết quả cần tìm lại dòng của backend: tạo `job_id` trước, ghi vào dòng trong giao dịch nghiệp vụ, commit, rồi gọi `dispatch(type, input, jobId)`. Đánh dấu "đã gửi" bằng cột riêng (`dispatched_at`), không bằng `job_id` có hay không.
- Job trả nhiều message: mỗi message ghi idempotent theo dòng. Không suy ra "đã đủ kết quả" từ message cuối; chỗ cần biết thì so số đếm (`pairs_scored + pairs_failed` với `pairs_sent`).
- Test E2E chờ theo số đếm, không chờ theo trạng thái. Test cho lỗi thứ hai: một listener của `AI_JOB_DISPATCHED` gửi kết quả ngay khi job được publish.

See [US-3.2](sprints/stories/US-3.2-batch-matching-agent.md), [CONTEXT D46](CONTEXT.md).

---

## 34. Việc phải chạy một lần ở mốc pha mà chỉ nằm trong listener `campaign.phase_changed`

**What happened (0.18.0)**: Q6 của US-3.3 (tự gán NV khi hết hạn chọn) ban đầu chỉ chạy trong listener `@OnEvent(CAMPAIGN_PHASE_CHANGED, { async: true })`. `/code-review` chỉ ra ba cách nó bị bỏ sót mà không ai biết:
- API khởi động lại giữa lần chạy;
- truy vấn lỗi một lần (listener chỉ ghi log);
- đợt bị chuyển sang `TESTING` khi lượt chấm còn `RUNNING`, nên SV được gán từ shortlist chưa đủ.

Pha đợt không quay lại, nên không có lần chạy thứ hai.

**Why**: sự kiện của `@nestjs/event-emitter` chỉ sống trong tiến trình, không bền như message RabbitMQ. Listener `async: true` cố ý nuốt lỗi để không ảnh hưởng việc chuyển pha.

**How to avoid**:
- Viết việc đó idempotent: kiểm lại trong khóa, có unique index chặn trùng ở DB.
- Thêm tác vụ quét định kỳ (`@Cron` + `withAdvisoryLock`, có `runOnce()` cho test) chạy lại việc đó cho mọi đợt đang ở pha đích. Sự kiện chỉ để việc chạy sớm.
- Việc đọc dữ liệu còn đang được tính (lượt chấm `RUNNING`) thì bỏ qua phần chưa đủ và để lần quét sau. Không chặn cả đợt.
- Tác vụ quét đọc ít cột nhất có thể, vì nó chạy suốt pha.
- Listener chạy lượt chấm khi hết `INTAKE` (US-3.2) có cùng dạng, nhưng Trung tâm chạy lại được bằng endpoint. Listener mới của EPIC-4, EPIC-5 phải chọn một trong hai cách: tác vụ quét, hoặc nút chạy lại.
- (0.20.0) Nút chạy lại phải bấm được đúng lúc việc bị kẹt. US-4.1 tắt "Sinh câu còn thiếu" khi run `RUNNING`, còn run mất kết quả chỉ được đóng `STALE` trong chính endpoint của nút, nên run đó kẹt mãi (`/code-review`). Việc dọn trạng thái kẹt cũng chạy ở lần đọc mà màn hình gọi.

See [US-3.3](sprints/stories/US-3.3-shortlist-and-preferences.md), [CONTEXT D47](CONTEXT.md).

## 35. Handlebars bỏ dòng chỉ chứa `{{#each}}`: các dòng của email văn bản dính vào nhau

**What happened (0.19.0)**: email văn bản `JD_LOW_PREFERENCES` của US-3.4 ra `…chỉ tiêu:\n- JD 1 …chỉ tiêu- JD 2 …`, mọi JD trên một dòng. Template có `{{#each jds}}` đứng riêng một dòng, rồi `- {{title}} …{{/each}}`. Integration test chỉ kiểm một dòng bằng `toContain`, nên vẫn xanh; `/code-review` mới bắt được.

**Why**: Handlebars coi thẻ khối đứng một mình trên dòng là *standalone* và bỏ cả dòng đó, kể cả ký tự xuống dòng. Ký tự xuống dòng duy nhất nằm trước `{{#each}}`, ngoài khối, nên không lặp lại theo phần tử. Bản HTML không bị vì `<li>` tự xuống dòng.

**How to avoid**:
- Trong template văn bản, đặt mỗi phần tử trên một dòng nằm giữa hai dòng thẻ: `{{#each xs}}` / `- {{name}}` / `{{/each}}`. Ký tự xuống dòng sau phần tử nằm trong khối nên lặp lại.
- Test email có danh sách: dựng ít nhất hai phần tử và kiểm cả đoạn có `\n` giữa chúng, không chỉ `toContain` một dòng.

See [US-3.4](sprints/stories/US-3.4-competition-level-and-suggestions.md).

## 36. `emitAsync` không chờ listener `async: true`: test sự kiện trùng xanh mà không kiểm gì

**What happened (0.20.0)**: Test AC-4 của US-4.1 phát `jd.approved` hai lần bằng `EventEmitter2.emitAsync`, rồi kiểm ngân hàng chỉ có một job. Test vẫn xanh. Khi thêm test cho trường hợp màn hình tạo ngân hàng trước listener, test mới đỏ với 0 job: lúc kiểm, listener chưa chạy. Test cũ xanh chỉ vì "không quá một job" vẫn đúng khi listener chưa gửi job nào.

**Why**: `@OnEvent(name, { async: true })` đăng ký listener ở chế độ async của EventEmitter2: thân listener chạy ở lượt sau của event loop, còn hàm bọc trả về ngay. `emitAsync` chỉ chờ giá trị mà các hàm bọc trả về, nên xong trước khi listener làm gì.

**How to avoid**:
- Test listener `async: true` bằng cách gọi thẳng phương thức của nó (`t.app.get(QuestionBankService).onJdApproved(event)`), hoặc chờ kết quả trong DB bằng `waitFor`.
- Test "lần sau không sinh thêm" phải chứng minh lần đầu đã sinh đúng một kết quả, rồi mới kiểm lần sau.

See [US-4.1](sprints/stories/US-4.1-exam-blueprint-test-generator.md).

## 37. Nhóm câu gửi LLM lỗi tất định được gửi lại y nguyên mỗi vòng: không bao giờ có kết quả, và câu chờ giữ chỗ của ô

**What happened (0.21.0)**: Review US-4.2 thấy Validator gặp `LLM_INVALID_OUTPUT` thì để cả nhóm chờ vòng sau. `batches()` tất định, nên vòng sau và job sau lại gửi đúng nhóm 15 câu đó. Với `effort: high`, phần suy nghĩ cũng tính vào `max_output_tokens` (16K), nên nhóm đã bị cắt thì sẽ bị cắt mãi, mỗi lần tốn 3 lượt thử. Câu chờ vẫn được tính vào mức 4× của ô, nên ô không xin câu mới: ô thiếu mãi và ngân hàng không khóa được. Nhóm bị từ chối thì được gửi lại từng câu mà không kiểm ngân sách giữa các lượt.

**Why**: Thử lại chỉ có ích với lỗi ngẫu nhiên. Lỗi do chính đầu vào (đầu ra quá dài, một câu làm hỏng JSON) cho cùng kết quả khi gửi lại y nguyên. Còn phần tử "đang chờ" được coi như sắp đạt, nên không ai sinh phần tử thay.

**How to avoid**:
- Lượt gọi LLM cho một nhóm mà đầu ra sai thì gửi lại phần nhỏ hơn (chia đôi, tới từng phần tử), không gửi lại y nguyên.
- Giới hạn số lần gửi một phần tử trong một job (`MAX_CHECKS_PER_DRAFT`). Quá giới hạn thì phần tử đó không còn được tính là "đang chờ", để vòng sau sinh phần tử khác thay.
- Kiểm ngân sách trước mọi lượt gọi phát sinh (gửi lại từng câu, chia đôi), không chỉ trước mỗi nhóm.
- Đọc lại kết quả LLM đã lưu bằng các trường cần dùng, không parse lại bằng schema đầu ra hiện tại: prompt `vN+1` đổi schema thì các dòng cũ vẫn đọc được.

See [US-4.2](sprints/stories/US-4.2-validator-and-question-bank-lock.md), [CONTEXT D50](CONTEXT.md).

## 38. Đọc bản ghi của module khác ngoài giao dịch rồi chuyển trạng thái không đảo ngược

**What happened (0.21.0)**: `lock()` của ngân hàng câu hỏi đọc phiên bản JD qua `JdService` trước giao dịch, rồi mới lấy advisory lock và khóa dòng ngân hàng. Lưu yêu cầu JD không lấy khóa nào của `assessment`. HR lưu yêu cầu mới giữa hai bước thì ngân hàng vẫn bị khóa theo yêu cầu cũ. Sau khi khóa, `jdOutdated` luôn `false`, nên không sửa lại được.

**Why**: Advisory lock và khóa dòng chỉ xếp hàng những bên cùng lấy chúng. Bản ghi của module khác đổi theo đường của module đó; đọc nó ngoài giao dịch là đọc một ảnh có thể đã cũ khi giao dịch commit.

**How to avoid**:
- Điều kiện quyết định một chuyển trạng thái không đảo ngược phải được đọc trong cùng giao dịch, có khóa: service của module kia nhận `{ tx }` và đọc `FOR SHARE` (`JdService.getForQuestionBank(jdId, { tx })`, như `CampaignService.assertPhase(..., { tx })`). Lần lưu bên kia hoặc commit trước và được thấy, hoặc phải chờ.
- Vẫn có thể đọc trước giao dịch để trả 404/409 sớm, nhưng không dùng kết quả đó để quyết định.
- Test: giao dịch thứ hai UPDATE dòng đó mà chưa commit; gọi API; chờ tới khi `pg_locks` có khóa `not granted`, rồi commit. API phải thấy bản mới. Test này đỏ với bản đọc ngoài giao dịch (`question-bank-lock.int-spec.ts`).

See [US-4.2](sprints/stories/US-4.2-validator-and-question-bank-lock.md).

## 39. Đầu ra của PRNG có seed đi tới client: lộ cả chuỗi, kể cả phần chỉ server được biết

**What happened (0.22.0)**: `drawExam` dùng một chuỗi mulberry32 có seed để chọn câu, xáo câu, xáo phương án, và cả để sinh mã mờ của phương án. Mã nằm trên đề gửi cho SV. mulberry32 có trạng thái 32 bit, mỗi lần gọi cộng một hằng số. Từ một mã có thể dò hết 2^32 trạng thái trong vài phút, rồi suy ngược cả chuỗi: thứ tự xáo và vị trí gốc của mọi phương án. Test Generator lưu phương án theo thứ tự LLM viết, nên vị trí gốc gợi ý được đáp án. Test AC-3 vẫn xanh, vì nó chỉ quét các khóa JSON bị cấm.

**Why**: PRNG nhanh (mulberry32, xorshift, `Math.random`) không có tính mật mã. Một đầu ra là đủ để tái lập cả chuỗi. Seed 31 bit cũng dò hết được khi mã nguồn công khai.

**How to avoid**:
- Giá trị nào ra khỏi server (mã, token, ID mờ) thì lấy từ `crypto.randomInt` / `randomBytes`, không lấy từ chuỗi có seed. Chuỗi có seed chỉ dùng cho những gì cần tái lập và không bao giờ lộ ra ([CONTEXT D52](CONTEXT.md)).
- Hàm thuần nhận nguồn ngẫu nhiên đó qua tham số (`drawExam({ codes })`), để test truyền nguồn tất định.
- Review phần "không lộ X": ngoài việc tìm khóa bị cấm, hỏi thêm X có suy ra được từ dữ liệu đã gửi không.

See [US-4.3](sprints/stories/US-4.3-exam-room.md).

## 40. `PEXPIREAT` theo giờ của `FakeClock`: key Redis hết hạn ngay khi ghi

**What happened (0.22.0)**: `ExamAnswerStore` đặt hạn cho hash phiên bằng `PEXPIREAT deadline_at + 1 ngày`, giờ tính theo `Clock`. Test tích hợp đặt `FakeClock` vào năm 2001, nên mốc đó đã qua với Redis thật. Key bị xóa ngay lúc ghi, và mọi lần lưu sau đó báo `MISSING`.

**Why**: Redis đếm giờ thật của máy chủ Redis. Mốc tuyệt đối tính bằng giờ giả luôn sai lệch đúng bằng độ lệch của `FakeClock`.

**How to avoid**:
- Đặt hạn tương đối: `PEXPIRE (mốc − clock.now())`, tính bằng `Clock`. Độ dài khoảng hạn thì giờ giả và giờ thật như nhau.
- Lệnh nhận mốc tuyệt đối (`PEXPIREAT`, `EXPIREAT`, `SET … PXAT`) chỉ dùng với giờ thật, và không dùng ở code có test tua giờ.

See [US-4.3](sprints/stories/US-4.3-exam-room.md); FakeClock dùng mốc năm riêng theo §22.

## 41. Hàng chờ tự lưu: gửi tiếp ngay khi còn thay đổi thì bỏ qua debounce; gộp nhiều câu thì vượt giới hạn body 100 KB

**What happened (0.22.0)**: Bản đầu của `useExamAutosave` có hai lỗi, cả hai chỉ lộ ra khi review:

- Vòng gửi chạy tiếp ngay khi còn thay đổi chờ. SV gõ không nghỉ thì mỗi phản hồi lại có phím mới, nên client gửi một request mỗi vòng mạng, khoảng 300 lần một phút. API trả `429` sau 120 lần, và lần nộp trong phút đó thất bại.
- Mỗi lượt gửi tối đa 50 câu, nhưng Express mặc định chỉ nhận body JSON tới 100 KB. SV mất mạng rồi viết nhiều câu tự luận 5000 ký tự thì lượt gửi gộp khi có mạng lại bị `413` mãi, và bài không nộp được.

**Why**: Debounce chỉ chặn ở chỗ gọi, không chặn được vòng lặp bên trong. Giới hạn số phần tử của schema không phải giới hạn số byte của body. `NestFactory.create` dùng body-parser với `limit: '100kb'` khi không cấu hình.

**How to avoid**:
- Lượt tự động gửi xong thì hẹn debounce mới cho phần còn chờ. Chỉ lần flush trước khi nộp mới gửi tới khi hết hàng chờ.
- Cắt lô theo cả số phần tử lẫn số byte ước tính (UTF-16 → tối đa 3 byte UTF-8), dưới giới hạn body của server.
- Trong comment, ghi tần suất gửi tối đa và đối chiếu với rate limit của route.

See [US-4.3](sprints/stories/US-4.3-exam-room.md).
