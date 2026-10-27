# LESSONS — Bài học và bẫy đã gặp

> Mỗi mục phải giúp người sau tiết kiệm thời gian. Đánh số tăng dần, không dùng lại số. Mục sai thời (thư viện đã nâng cấp, hành vi đã đổi) thì xóa đi và thêm mục mới.
> Tìm số tiếp theo: `grep -n "^## [0-9]" docs/LESSONS.md | tail -1`. Trích dẫn trong commit: "Per LESSONS §N".
> Đọc mục lục dưới đây, rồi chỉ đọc các mục khớp với việc đang làm: `grep -n "^## 15\." docs/LESSONS.md` cho số dòng, sau đó đọc từ dòng đó ([CONTEXT D38](CONTEXT.md)). Thêm mục mới thì thêm một dòng vào mục lục.

**Mục lục** (chủ đề → mục)

- Claude Code, skill, hook, koni-docs: §1 skill phải nằm ở `.claude/skills` · §2 `docs:sync` định dạng lại PRD, đổi ngày · §3 snippet hook của koni-harness không chặn commit
- Docker, compose, image: §4 `minio/minio` không còn trên Docker Hub · §14 compose truyền biến chưa đặt thành `""` · §15 hết RAM khi chạy test (compose, số worker Jest, commit memory của Windows) · §18 testcontainers build image không cache, Jest treo
- Jest, ESM: §9 gói chỉ có ESM (`@nestjs/schedule`, `file-type`, `promise-breaker`…) · §11 `testTimeout` trong `projects` bị bỏ qua · §21 `--selectProjects` nuốt đường dẫn test
- Integration test: §22 các file dùng chung DB, thông báo gửi mọi tài khoản CENTER lọt vào test khác
- Drizzle, migration: §6 migration có mốc thời gian cũ bị bỏ qua · §7 hàm dùng chung nhiều bảng: khai kiểu cụ thể · §12 `FOR UPDATE OF` sinh tên có schema
- pgvector: §24 index HNSW lọc sau khi quét, hàng cũ chiếm chỗ ứng viên
- Ranh giới module: §5 `exclude: node_modules` làm dependency-cruiser bỏ sót
- Thư viện API, web: §8 CLI shadcn 4.21 · §10 Zod 4 bỏ qua `refine` khi trường khác lỗi · §13 multer đọc tên file theo latin1 · §25 form gửi `row_version` của query mới nhất, bỏ qua khóa lạc quan
- RabbitMQ, job AI: §16 `RabbitMQModule` giữ connection static · §17 mặc định sai của thư viện message
- ai-service (Python): §19 chặn mạng trong pytest trên Windows · §20 PyMuPDF cắt chữ ngoài trang, màu nền theo thứ tự vẽ · §23 `HF_HUB_OFFLINE` đọc lúc import, bge-m3 tải 4,5 GB

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
- Kiểm tra chéo trường trong form dùng `superRefine(fn, { when })`, với `when` chỉ xét lỗi của các trường mà nó đọc. Xem `whenValid` trong `packages/shared/schemas/campaign.ts`.
- Test schema có ca gửi lỗi chéo cùng lỗi của trường khác, để chắc lỗi chéo vẫn hiện.
- Không trông đợi lỗi chéo khi một trường nó đọc đang sai kiểu.
- (0.9.0) Ngược lại, `when` **có** chạy khi chính object sai kiểu (thiếu hẳn, `undefined`): lỗi đó có `path` rỗng nên không khớp tên trường nào, và hàm kiểm tra nhận `undefined`. `JdRequirementsSchema` lồng trong `JdAnalyzeOutput` đã ném `TypeError` khi `requirements` vắng mặt (US-2.3). `when` phải trả `false` khi có lỗi `path.length === 0`, và hàm kiểm tra không giả định kiểu của dữ liệu. Xem `whenSkillListsParsed` trong `packages/shared/contracts/jd.ts`; test bằng `safeParse(undefined)`.

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
