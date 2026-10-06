# CONTEXT — Nhật ký quyết định

> File chỉ ghi thêm (RULE-7): không sửa hay xóa mục cũ. Muốn đổi một quyết định, thêm mục mới `D<N>. <Tiêu đề> (revision of D<M>)`.
> Tóm tắt các quyết định kiến trúc ở [ARCHITECTURE.md › Architecture decisions](ARCHITECTURE.md#architecture-decisions).
> Tìm số tiếp theo: `grep -n "^### D[0-9]" docs/CONTEXT.md | tail -1`.

---

## Phase 0 — Thiết kế ban đầu (2026-10-04)

### D1. Tách phần tất định khỏi phần xác suất

**Context**: Hệ thống vừa có nghiệp vụ ảnh hưởng trực tiếp quyền lợi sinh viên (điểm, phân bổ, trạng thái) vừa dùng LLM, vốn cho kết quả không hoàn toàn lặp lại được.

**Decision**: Nghiệp vụ (trạng thái, điểm tổng, phân bổ, phân quyền) nằm ở Core Backend và luôn cho cùng kết quả với cùng đầu vào. LLM chỉ nằm ở AI Service, làm các việc cần hiểu hoặc sinh ngôn ngữ.

**Rationale**: Vì kết quả tuyển chọn phải tái hiện được khi có khiếu nại và phải giải thích được trước hội đồng; tách ranh giới thì phần xác suất không lan vào phần cần tất định.

**Alternatives considered**:
- Backend gọi thẳng LLM, không có AI Service (phương án C) — loại vì trộn phần xác suất vào nghiệp vụ.

**Impact**: AD-1. AI Service không chuyển trạng thái nghiệp vụ và không ghi bảng nghiệp vụ.

**Date**: 2026-10-04
**Version**: pre-0.1.0

### D2. LLM không ra quyết định và không tính điểm tổng

**Context**: Cần chấm độ phù hợp CV–JD và bài tự luận bằng LLM mà vẫn ổn định, giải thích được, đổi trọng số được.

**Decision**: LLM đánh giá từng tiêu chí theo rubric, trả JSON theo schema kèm bằng chứng trích từ CV; code tính S_cv, S_test, S_final theo công thức; HR và Trung tâm ra quyết định cuối (BR-13).

**Rationale**: Vì một con số tổng do LLM đưa ra không ổn định và không giải thích được; tách đánh giá tiêu chí khỏi công thức thì đổi trọng số không phải gọi lại LLM, và kiểm tra trích dẫn bằng code chặn được "ảo giác".

**Impact**: AD-2. Mọi đầu ra LLM phải qua kiểm tra schema; verdict `MET`/`PARTIAL` không có trích dẫn khớp bị hạ về `NOT_MET`.

**Date**: 2026-10-04
**Version**: pre-0.1.0

### D3. Modular monolith NestJS + AI Service Python (phương án A)

**Context**: Cần chọn ngôn ngữ và cách chia thành phần vừa đủ cho đồ án.

**Decision**: Frontend React và Core Backend NestJS cùng TypeScript trong monorepo pnpm; AI Service viết bằng Python. Core Backend là một modular monolith, mỗi module nghiệp vụ tách ranh giới rõ.

**Rationale**: Vì frontend và backend dùng chung được kiểu dữ liệu và schema kiểm tra, còn phần AI cần hệ sinh thái Python (đọc PDF kèm định dạng để phát hiện chữ ẩn, embedding, script đánh giá); chia nhỏ thành nhiều microservice là quá mức cho quy mô đồ án.

**Alternatives considered**:
- Toàn bộ TypeScript (phương án B) — loại vì phát hiện chữ ẩn trong PDF và chạy embedding kém tiện hơn.
- Microservice theo module — loại vì chi phí vận hành không tương xứng.

**Impact**: AD-3. Hai ngôn ngữ; cần hợp đồng message chung (D6).

**Date**: 2026-10-04
**Version**: pre-0.1.0

### D4. PostgreSQL + pgvector là nguồn sự thật duy nhất

**Context**: Dữ liệu nghiệp vụ có quan hệ chặt và cần giao dịch; kết quả LLM có cấu trúc linh hoạt; cần tìm kiếm vector.

**Decision**: Dùng PostgreSQL với pgvector và JSONB. Schema `core` do Core Backend ghi; schema `ai` do AI Service ghi. AI Service đọc `core` qua view chỉ đọc đã che PII bằng tài khoản DB riêng.

**Rationale**: Vì một hệ quản trị đáp ứng cả quan hệ, giao dịch, JSONB và vector ở quy mô vài chục nghìn vector; che PII ở tầng view bảo đảm BR-03 ngay tại CSDL thay vì dựa vào code.

**Alternatives considered**:
- MongoDB — loại vì phân bổ và chuyển trạng thái cần giao dịch quan hệ.
- CSDL vector riêng (Qdrant, Milvus) — loại vì thêm thành phần vận hành không cần thiết.

**Impact**: AD-4.

**Date**: 2026-10-04
**Version**: pre-0.1.0

### D5. Tác vụ AI chạy bất đồng bộ qua RabbitMQ

**Context**: Lượt gọi LLM chậm và có thể lỗi; một số việc chạy hàng loạt.

**Decision**: Core Backend phát job sang RabbitMQ; AI Service xử lý và trả kết quả qua queue. Payload chỉ chứa ID; mỗi job có `job_id` duy nhất, xử lý idempotent; lỗi sau 3 lần thử vào dead-letter queue.

**Rationale**: Vì giao diện không bị treo khi LLM chậm, lỗi được thử lại, và RabbitMQ dùng được từ cả Node.js lẫn Python.

**Impact**: AD-5.

**Date**: 2026-10-04
**Version**: pre-0.1.0

### D6. Hợp đồng dữ liệu định nghĩa một lần bằng Zod

**Context**: Frontend, backend và AI Service phải thống nhất kiểu dữ liệu, request và message.

**Decision**: Zod schema đặt trong `packages/shared`; frontend và backend dùng trực tiếp; schema message xuất ra JSON Schema rồi sinh model Pydantic cho AI Service; CI báo lỗi khi hai phía lệch nhau.

**Rationale**: Vì viết tay hai phía chắc chắn sẽ lệch theo thời gian.

**Impact**: AD-6.

**Date**: 2026-10-04
**Version**: pre-0.1.0

### D7. Phân bổ bằng Deferred Acceptance, không dùng LLM

**Context**: Cần phân bổ sinh viên vào JD theo điểm từ cao xuống thấp, có giới hạn chỉ tiêu, tôn trọng nguyện vọng và chống dồn hồ sơ (P1).

**Decision**: Dùng thuật toán Deferred Acceptance phía sinh viên đề xuất, viết thành hàm TypeScript thuần trong `allocation/domain/`; kiểm tra ổn định sau mỗi lần chạy; lưu snapshot đầu vào và cấu hình.

**Rationale**: Vì thuật toán cho kết quả ổn định, ưu tiên người điểm cao, khiến sinh viên không được lợi khi khai sai nguyện vọng, và tất định nên kiểm chứng được — điều LLM không bảo đảm được.

**Alternatives considered**:
- Tham lam theo cặp, ILP/min-cost flow — giữ làm phương án đối chứng trong thực nghiệm, không dùng làm thuật toán chính vì không bảo đảm ổn định và không tôn trọng thứ tự nguyện vọng.

**Impact**: AD-7.

**Date**: 2026-10-04
**Version**: pre-0.1.0

### D8. Quản lý trạng thái bằng bảng chuyển trạng thái tự viết

**Context**: Nhiều đối tượng có vòng đời (đợt, JD, hồ sơ ứng tuyển, đề cử) và có thể bị sửa đồng thời.

**Decision**: Mỗi vòng đời có kiểu trạng thái và bảng chuyển trạng thái hợp lệ trong `packages/shared`; mọi thay đổi đi qua `transitionTo(newState, actor, reason)` trong một giao dịch có ghi nhật ký; chống ghi đè đồng thời bằng cột `row_version`.

**Rationale**: Vì bảng chuyển trạng thái tự viết đủ dùng, dễ test và dùng chung được cho frontend; thư viện state machine như XState là thừa.

**Impact**: AD-8.

**Date**: 2026-10-04
**Version**: pre-0.1.0

### D9. Drizzle ORM thay cho Prisma

**Context**: Thiết kế dựa vào partial unique index (BR-08), `SELECT … FOR UPDATE`, JSONB và giao dịch.

**Decision**: Dùng Drizzle ORM + drizzle-kit; file migration SQL được commit.

**Rationale**: Vì Drizzle gần SQL và hỗ trợ trực tiếp các tính năng PostgreSQL trên, còn Prisma thường phải viết SQL tay cho chúng.

**Impact**: AD-9.

**Date**: 2026-10-04
**Version**: pre-0.1.0

### D10. Một model Claude Opus 5.5 cho mọi agent

**Context**: Cần chọn model LLM cho các agent có độ khó khác nhau.

**Decision**: Dùng `claude-opus-5-5` cho tất cả agent, chỉnh độ sâu suy luận bằng `output_config.effort` theo từng tác vụ; mọi lượt gọi đi qua lớp `LLMClient`.

**Rationale**: Vì một model nghĩa là một bộ prompt, một bộ đánh giá và cache dùng chung được; lớp `LLMClient` cho phép đổi model hoặc nhà cung cấp sau khi đo chất lượng.

**Impact**: AD-10. Phụ thuộc điểm chưa chốt Q8 (PRD).

**Date**: 2026-10-04
**Version**: pre-0.1.0

### D11. Embedding `bge-m3` tự host

**Context**: Cần embedding tiếng Việt cho lọc sơ bộ, chuẩn hóa kỹ năng, phát hiện trùng câu hỏi và bài tự luận giống nhau.

**Decision**: Chạy `BAAI/bge-m3` trong AI Service.

**Rationale**: Vì Claude không có API embedding, bge-m3 hỗ trợ tiếng Việt, chạy được trên CPU ở quy mô đồ án và dữ liệu không rời máy chủ.

**Impact**: AD-11.

**Date**: 2026-10-04
**Version**: pre-0.1.0

### D12. Message Batches, prompt caching và prompt có phiên bản

**Context**: Chi phí LLM tăng theo số sinh viên × số JD.

**Decision**: Tác vụ hàng loạt (chấm phù hợp, chấm tự luận) chạy qua Message Batches; phần cố định của prompt đặt đầu để dùng prompt caching; prompt là file có phiên bản trong git và mọi kết quả lưu kèm `prompt_version` và `model`.

**Rationale**: Vì Batches giảm 50% giá, cache đọc chỉ bằng khoảng 5% giá token vào, và phiên bản prompt cố định trong một đợt giúp kết quả tái hiện được.

**Impact**: AD-12.

**Date**: 2026-10-04
**Version**: pre-0.1.0

### D13. Server-Sent Events cho cập nhật thời gian thực

**Context**: Cần đẩy thông báo, tiến độ job AI và mức cạnh tranh xuống trình duyệt.

**Decision**: Dùng SSE (`GET /api/events/stream`), Redis pub/sub khi chạy nhiều instance.

**Rationale**: Vì luồng dữ liệu chỉ đi một chiều từ server, SSE đơn giản hơn WebSocket.

**Impact**: AD-13.

**Date**: 2026-10-04
**Version**: pre-0.1.0

---

## Phase 1 — Áp dụng quy trình koni (2026-10-05)

### D14. Dùng shadcn/ui + Tailwind CSS thay cho Ant Design

**Context**: Bản nháp kiến trúc chọn Ant Design, trong khi bộ quy trình koni dùng chuẩn shadcn làm tiêu chí review UI (koni-harness, koni-qc) và repo đã có skill shadcn.

**Decision**: Frontend dùng shadcn/ui + Tailwind CSS; bảng dữ liệu dùng TanStack Table; biểu đồ dùng shadcn Chart (Recharts). Design system ghi ở `DESIGN.md`, tạo trong EPIC-1 trước màn hình đầu tiên.

**Rationale**: Vì nhóm chọn theo quy trình koni, nên thư viện UI phải khớp với chuẩn review UI của quy trình đó; shadcn đưa component vào repo dưới dạng mã nguồn nên tùy biến được.

**Alternatives considered**:
- Ant Design — loại vì lệch chuẩn review UI của quy trình koni.

**Impact**: AD-14. Mất locale tiếng Việt có sẵn của Ant Design: chuỗi giao diện tự viết tiếng Việt, component ngày giờ dùng locale `vi` của date-fns. Heatmap NV/chỉ tiêu (FR-33) cần chốt cách làm.

**Date**: 2026-10-05
**Version**: pre-0.1.0

### D15. Áp dụng koni-docs cho tài liệu dự án

**Context**: Dự án cần quy trình tài liệu và kế hoạch có cấu trúc để làm việc với agent AI và để truy vết khi viết báo cáo đồ án.

**Decision**: Tài liệu theo cấu trúc koni-docs: `BRIEF.md`, `PRD.md`, `ARCHITECTURE.md`, `CONTEXT.md`, `LESSONS.md`, `CHANGELOG.md`, `sprints/`. Đặc tả nghiệp vụ cũ (`dac-ta-nghiep-vu.md`) chuyển thành `PRD.md` (phần tổng quan tách thêm ra `BRIEF.md`); kiến trúc cũ (`kien-truc-he-thong.md`) chuyển thành `ARCHITECTURE.md`. Nội dung giữ nguyên văn; tham chiếu theo số mục được đổi sang tên mục hoặc mã ổn định (GĐx, BR-xx, FR-x, AD-x).

**Rationale**: Vì koni-docs cho sẵn template, quy tắc nhất quán giữa story, epic, PRD và công cụ kiểm tra (`koni-docs validate`, `sync`, `status`).

**Impact**: Cổng commit của koni-harness (`install-gate.sh`) chưa cài, vì cổng pre-push chạy `npm test` mà repo chưa có `package.json`; cài trong story scaffold của EPIC-1.

**Date**: 2026-10-05
**Version**: pre-0.1.0

### D16. Tên file tiếng Anh, nội dung tài liệu tiếng Việt (ngoại lệ của RULE-13)

**Context**: RULE-13 của koni-docs yêu cầu mọi sản phẩm (code, comment, UI, commit, tài liệu) bằng tiếng Anh. Nhóm và người đọc tài liệu (giảng viên, Trung tâm) dùng tiếng Việt; sản phẩm phục vụ người dùng Việt Nam.

**Decision**:
- Tên file, tên thư mục: tiếng Anh.
- Nội dung tài liệu trong `docs/`: tiếng Việt.
- Phần công cụ koni đọc được giữ tiếng Anh: tiêu đề H2 theo template (`## Functional Requirements`, `## Epics & User Stories`, `## Acceptance criteria`…), khóa frontmatter, giá trị enum (`backlog`, `in-progress`…), mã định danh (FR-x, US-x.y, EPIC-x, AD-x, D-x).
- Code, comment, commit message: tiếng Anh theo RULE-13.
- Chuỗi giao diện: tiếng Việt, vì đây là yêu cầu sản phẩm (NFR-13).

**Rationale**: Vì tài liệu phải dễ đọc với người đọc chính, trong khi `koni-docs sync`/`validate` tìm mục theo nhãn tiếng Anh và code nên giữ tiếng Anh theo thông lệ.

**Impact**: Tiêu đề H3 trở xuống trong tài liệu viết tiếng Việt.

**Date**: 2026-10-05
**Version**: pre-0.1.0

### D17. AGENTS.md là nguồn chỉ dẫn chính; Active Context tách file

**Context**: Repo có thể được làm bằng nhiều agent (Claude Code và các công cụ đọc `AGENTS.md`); khối Active Context đổi nhiều lần mỗi tuần.

**Decision**: `AGENTS.md` chứa toàn bộ chỉ dẫn cho agent; `CLAUDE.md` chỉ import `AGENTS.md` (`@AGENTS.md`) và giữ khối `Koni-Docs Integration`. Active Context theo Pattern B: `.active-context.md` (gitignore, mỗi người một bản) sao từ `.active-context.example.md` (commit).

**Rationale**: Vì một nguồn chỉ dẫn duy nhất không bị lệch giữa các agent, và tách phần hay đổi ra file riêng tránh xung đột merge khi nhiều người làm song song.

**Impact**: Người mới clone repo phải sao `.active-context.example.md` thành `.active-context.md` (SETUP.md).

**Date**: 2026-10-05
**Version**: pre-0.1.0

### D18. Skill đặt ở `.agents/skills`, nối sang `.claude/skills`

**Context**: Các skill koni-docs, koni-harness, koni-qc, shadcn nằm ở `.agents/skills/`, nhưng Claude Code chỉ nạp skill dự án từ `.claude/skills/`.

**Decision**: Giữ `.agents/skills/` là bản gốc (được commit); `.claude/skills` là liên kết tới nó (junction trên Windows, symlink trên macOS/Linux), được gitignore, mỗi người tự tạo theo SETUP.md.

**Rationale**: Vì một bản gốc dùng được cho mọi agent, còn liên kết thư mục trên Windows không commit qua git một cách tin cậy.

**Impact**: LESSONS §1.

**Date**: 2026-10-05
**Version**: pre-0.1.0

### D19. Mốc VERSION 0.0.0

**Context**: Repo chưa có code; koni-docs yêu cầu file `VERSION` và CHANGELOG khớp nhau.

**Decision**: `VERSION` bắt đầu ở `0.0.0`, gắn với commit khởi tạo repo. Các commit chỉ sửa tài liệu không tăng version. Lần ship code đầu tiên (scaffold của EPIC-1) tăng lên `0.1.0`.

**Rationale**: Vì version phải phản ánh phần mềm đã ship, mà hiện chưa có gì để ship.

**Date**: 2026-10-05
**Version**: 0.0.0

---

## Phase 2 — Lập kế hoạch thực hiện (2026-10-07)

### D20. Lộ trình 13 tuần, đủ phạm vi, làm song song bằng agent

**Context**: Repo đã có PRD và ARCHITECTURE nhưng chưa có story hay lịch. Người dùng làm một mình, muốn xong trong tháng 12/2026 và không cắt nội dung. Theo PRD, 6 epic cần khoảng 13,5 tuần nếu làm một luồng.

**Decision**:
- Tách 6 epic thành 37 story (`docs/sprints/epics/EPIC-1.md` … `EPIC-6.md`), phủ đủ FR-1 – FR-37 kể cả P1/P2. Tổng khoảng 212 điểm.
- Lịch 13 tuần, từ W41 (05/10/2026) đến W53 (31/12/2026), chia 6 giai đoạn có mốc M1–M6; bản 1.0.0 ra ngày 31/12/2026. Chi tiết ở [sprints/README › Lộ trình](sprints/README.md#lộ-trình).
- Chạy song song hai làn bằng agent theo koni-harness swarm (Tier A): làn A gồm backend + web (TypeScript), làn B gồm AI Service (Python), hàm thuần, mô phỏng, đánh giá. Mỗi story một worktree; tối đa 3 story `in-progress` cùng lúc.
- Đổi thứ tự so với thứ tự epic: US-5.1 (Allocation Engine) làm ở T2, US-6.4 (mô phỏng) ở T4, US-6.2 (chi phí LLM) ở T6, US-6.3 (đánh giá AI) ở T9–T10, US-1.7 (thông báo) ở T4.
- Migration Drizzle: mỗi đợt chỉ một story được sinh migration; story thêm vào `packages/shared` được merge trước.
- Trễ từ 1 tuần trở lên thì báo người dùng để chọn giãn lịch hoặc đổi thứ tự. Không tự cắt story.

**Rationale**: Vì hạn tháng 12 và không cắt phạm vi nghĩa là phải làm khoảng 18 điểm/tuần. Mức này cao hơn ước tính của PRD khoảng 40%, nên chỉ đạt được khi các story không phụ thuộc nhau chạy song song. Những story không nằm trên đường găng được đưa lên sớm để lấp khe trống. Allocation Engine và mô phỏng là lõi của chương thực nghiệm, làm sớm thì có số liệu sớm, và chúng không phụ thuộc DB hay AI.

**Alternatives considered**:
- Làm tuần tự theo thứ tự epic, 16 tuần, có danh sách cắt giảm — loại vì người dùng yêu cầu xong trong tháng 12 và không cắt nội dung.
- Bỏ các FR P1/P2 (FR-19, FR-21, FR-24, FR-25, FR-34) để kịp hạn — loại vì cùng lý do.

**Impact**: Mỗi file epic có mục *Schedule and dependencies* (điểm, tuần, làn, phụ thuộc). PRD › Epics & User Stories có bảng story cho từng epic. Cần cài cổng và thử `swarm.sh` của koni-harness ở US-1.1. Các mục spec ghi là tùy chọn hoặc mở rộng (sandbox lập trình, chatbot, học trọng số, SSO OIDC, ClamAV, Prometheus/Grafana) nằm ngoài phạm vi.

**Date**: 2026-10-07
**Version**: 0.0.0
