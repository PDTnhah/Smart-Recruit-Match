# CONTEXT — Nhật ký quyết định

> File chỉ ghi thêm (RULE-7): không sửa hay xóa mục cũ. Muốn đổi một quyết định, thêm mục mới `D<N>. <Tiêu đề> (revision of D<M>)`.
> Tóm tắt các quyết định kiến trúc ở [ARCHITECTURE.md › Architecture decisions](ARCHITECTURE.md#architecture-decisions).
> Tìm số tiếp theo: `grep -n "^### D[0-9]" docs/CONTEXT.md | tail -1`.
> Không đọc cả file. Đọc mục lục dưới đây, rồi lấy số dòng bằng `grep -n "^### D37\." docs/CONTEXT.md` và chỉ đọc mục đó (D38). Thêm mục mới thì thêm một dòng vào mục lục; quyết định bị sửa thì ghi "→ sửa bởi D<N>" ở dòng của nó.

**Mục lục**

- D1 · Tách phần tất định khỏi phần xác suất
- D2 · LLM không ra quyết định và không tính điểm tổng
- D3 · Modular monolith NestJS + AI Service Python
- D4 · PostgreSQL + pgvector là nguồn sự thật duy nhất
- D5 · Tác vụ AI chạy bất đồng bộ qua RabbitMQ
- D6 · Hợp đồng dữ liệu định nghĩa một lần bằng Zod
- D7 · Phân bổ bằng Deferred Acceptance, không dùng LLM
- D8 · Bảng chuyển trạng thái tự viết
- D9 · Drizzle ORM thay Prisma
- D10 · Một model Claude Opus 5.5 cho mọi agent → sửa bởi D34
- D11 · Embedding `bge-m3` tự host
- D12 · Message Batches, prompt caching, prompt có phiên bản
- D13 · Server-Sent Events cho cập nhật thời gian thực
- D14 · shadcn/ui + Tailwind CSS thay Ant Design
- D15 · Áp dụng koni-docs
- D16 · Tên file tiếng Anh, nội dung tài liệu tiếng Việt
- D17 · AGENTS.md là nguồn chỉ dẫn chính; Active Context tách file
- D18 · Skill ở `.agents/skills`, nối sang `.claude/skills`
- D19 · Mốc VERSION 0.0.0
- D20 · Lộ trình 13 tuần, làm song song bằng agent
- D21 · Tạo sẵn file story cho cả 37 story
- D22 · Công cụ và phiên bản của khung monorepo (US-1.1)
- D23 · MinIO dùng image Chainguard; ứng dụng chỉ biết `MINIO_*`
- D24 · Lược đồ `core`, cột `audit_logs`, cách áp migration (US-1.2)
- D25 · Xác thực, phân quyền, refresh token (US-1.3)
- D26 · Nền shadcn/ui, API client, thư viện web (US-1.3)
- D27 · Đợt thực tập: đối tượng, phạm vi đọc, khóa tham số, gia hạn mốc, kiểm tra pha (US-1.4)
- D28 · Doanh nghiệp, lời mời HR, JD, lưu file (US-1.5) → sửa bởi D29
- D29 · Thu hồi link mời cũ, tải file qua nginx, bucket lúc khởi động
- D30 · Đồng ý xử lý dữ liệu, phiên bản CV, nộp CV (US-1.6)
- D31 · Thông báo, SSE, email outbox, nhắc hạn (US-1.7) → sửa bởi D32
- D32 · Link mời HR ký lúc gửi, stream đóng theo hạn token, email quá hạn bị hủy
- D33 · Đường ống job AI, hợp đồng message, role DB (US-2.1)
- D34 · Nhà cung cấp LLM: Gemini mặc định, Claude thay thế qua `LLMClient` (US-2.2)
- D35 · Phân tích JD, xác nhận yêu cầu chuẩn hóa, phiên bản yêu cầu (US-2.3)
- D36 · Ma trận S_cv đọc hai chiều: JD gợi ý cho sinh viên, CV phù hợp theo JD cho Trung tâm
- D37 · Phân tích CV: lỗi phân tích, `pii` mã hóa, che PII bằng code, PDF scan, `TERMS_V2` (US-2.4)
- D38 · Giới hạn chi phí context của agent: ba phiên mỗi story, mục lục, AGENTS.md không giữ trạng thái
- D39 · Danh mục kỹ năng và embedding: module `skills`, `EMBEDDING_PROVIDER`, hợp đồng kỹ năng, HNSW một phần (US-2.5)

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

### D21. Tạo sẵn file story cho cả 37 story

**Context**: D20 tách 37 story trong các file epic, và quy ước lúc đó là file story chỉ được tạo khi bắt đầu làm. Vì vậy `docs/sprints/stories/` còn trống và `STATUS.md` báo 0 story. Người dùng yêu cầu tạo story cho mọi epic từ ARCHITECTURE và các file epic.

**Decision**:
- Tạo sẵn 37 file `docs/sprints/stories/US-X.Y-<slug>.md` theo template story của koni-docs, tất cả ở `status: backlog`. Frontmatter (điểm, priority, `prd_ref`, `arch_ref`, `depends_on`, `external_deps`) lấy từ mục *Schedule and dependencies* và *FR/AD Coverage* của từng epic.
- Mỗi file có Goal, Background, tiêu chí nghiệm thu, task, Dev notes, bảng kiểm chứng và bản nháp Changelog entry. *Implementation notes* và *Files modified* để trống đến khi làm.
- Chưa có `package.json` nên bảng *Verification commands* chỉ ghi file test và tên case. Lệnh chạy được điền sau khi US-1.1 tạo script.
- Khi bắt đầu một story: đọc lại file của nó, so với spec hiện tại. Nếu spec đã đổi thì thêm khối *Story refresh* (giữ nguyên số AC), rồi mới đặt `status: in-progress`.

**Rationale**: Có file story sớm thì thấy được toàn bộ phạm vi và tiêu chí nghiệm thu, các agent chạy song song có hợp đồng rõ ràng, và `koni-docs status` có dữ liệu để theo dõi lộ trình D20.

**Alternatives considered**:
- Giữ quy ước cũ, tạo từng file khi bắt đầu làm — loại vì người dùng muốn có story cho mọi epic ngay.

**Impact**: Sửa câu "file story tạo khi bắt đầu làm" ở `docs/sprints/README.md`, PRD › Epics & User Stories và AGENTS.md › Trạng thái. `STATUS.md` sinh lại với 37 story.

**Date**: 2026-10-07
**Version**: 0.0.0

---

## Phase 3 — Thực hiện EPIC-1 (2026-10-08)

### D22. Công cụ và phiên bản cho khung monorepo (US-1.1)

**Context**: US-1.1 dựng monorepo, nhưng ARCHITECTURE chưa chốt công cụ lint, cách quản lý gói Python, driver PostgreSQL, tên package và vị trí file môi trường. AGENTS cấm thêm thư viện ngoài danh sách khi chưa hỏi. Lúc làm (10/2026) đã có TypeScript 7, NestJS 12 và pnpm 12, đều ra sau khi tài liệu được viết.

**Decision** (người dùng chốt các mục công cụ):
- Lint: ESLint 10 (flat config) + typescript-eslint, dùng bộ `recommendedTypeChecked`; web thêm `eslint-plugin-react-hooks` và `eslint-plugin-react-refresh`. Không dùng Prettier. Python dùng ruff (ghim bản), test bằng pytest.
- Python: `pyproject.toml` + `pip install -e ".[dev]"`, không có lockfile. CI chạy Python 3.12.
- Driver PostgreSQL: `pg` (node-postgres). US-1.2 dùng qua `drizzle-orm/node-postgres`.
- Tên package: `@srm/api`, `@srm/web`, `@srm/shared`.
- File môi trường: `deploy/.env.example`; compose đọc `deploy/.env`. `DEPLOY.md` đặt ở gốc repo.
- Ghim phiên bản:
  - pnpm 10.34.6. pnpm 12 mới ra (26/08/2026) và chưa được kiểm chứng.
  - TypeScript 6.0.3, vì typescript-eslint 8.71 yêu cầu `typescript <6.1` và ts-jest yêu cầu `<7`.
  - NestJS 11.2.7, vì nestjs-zod 5.5 chỉ hỗ trợ `@nestjs/common` 10–11.
  - Node ≥ 22.12 (`.nvmrc` = 22).
- Không dùng `@nestjs/cli`, vì gói này kéo theo TypeScript 5.9 riêng và sẽ build lệch phiên bản. Build bằng `tsc -p tsconfig.build.json`; chạy dev bằng `apps/api/scripts/dev.mjs` (`tsc --watch` + `node --watch`).
- `@srm/shared` build ra CommonJS (`dist/`), api dùng bản build. Web và Jest trỏ thẳng vào source qua alias của Vite, `paths` trong tsconfig và `moduleNameMapper`, nên không phải build lại khi sửa.
- Quy ước module: file export công khai của một module NestJS là `modules/<m>/index.ts`. dependency-cruiser cấm module khác import thẳng vào bên trong.
- Hook Claude Code của koni-harness: `matcher: "Bash"` + `if: "Bash(git commit*)"` và gọi `scripts/claude-commit-gate.sh` (LESSONS §3), không dùng snippet trong `adapters.md`.

**Rationale**: Vì ESLint và ruff là mặc định của NestJS/Vite và đã có trong `.gitignore`, ít cấu hình nhất. Các phiên bản được chọn là bộ mới nhất mà mọi công cụ cùng hỗ trợ; lên bản mới hơn thì typescript-eslint, ts-jest hoặc nestjs-zod sẽ hỏng ngay.

**Alternatives considered**:
- Biome thay ESLint — loại vì thiếu một số luật react-hooks và lệch mặc định của NestJS/Vite.
- uv thay pip — loại để không thêm công cụ; có thể xem lại khi AI Service cần ghim các gói nặng (torch, sentence-transformers).
- TypeScript 7 / NestJS 12 — loại tạm thời vì toolchain chưa tương thích. Xem lại khi typescript-eslint và nestjs-zod hỗ trợ.

**Impact**: ARCHITECTURE › *Thư viện chính*, › *CI*, › *Kiểu kiến trúc*; `AGENTS.md` › *Lệnh*; `docs/SETUP.md`; `DEPLOY.md`.

**Date**: 2026-10-08
**Version**: 0.1.0

### D23. Image MinIO chuyển sang Chainguard; ứng dụng chỉ biết biến `MINIO_*`

**Context**: ARCHITECTURE › Docker Compose ghi image `minio/minio`. Đến 10/2026 image này không còn pull được: MinIO ngừng phát hành image community từ cuối 2025, đưa repo vào chế độ bảo trì, rồi xóa repo trên Docker Hub khoảng 11/09/2026. `quay.io/minio/minio` cũng không còn pull được (đã kiểm bằng `docker manifest inspect`).

**Decision**:
- Service `minio` dùng `cgr.dev/chainguard/minio`. Đây vẫn là mã MinIO, do Chainguard build lại từ source, miễn phí ở tag `latest`, nên ghim theo digest. Image có sẵn `mc`, nên healthcheck dùng `mc ready local`.
- Ứng dụng chỉ đọc `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, không phụ thuộc server cụ thể. Compose map access/secret key thành tài khoản root của service `minio`. Muốn dùng MinIO hay S3 bên ngoài thì chỉ cần đổi `deploy/.env`.
- Integration test cần MinIO (US-1.6) dùng cùng image và digest.

**Rationale**: Vì đây là thay đổi nhỏ nhất mà vẫn giữ nguyên API và hành vi MinIO, có nguồn được vá bảo mật thường xuyên. Tách cấu hình qua biến `MINIO_*` thì lần sau đổi nhà cung cấp không phải sửa code.

**Alternatives considered**:
- `pgsty/silo` (fork MinIO) — loại vì là dự án nhỏ, không có cam kết bảo trì.
- RustFS, SeaweedFS, Garage — loại vì phải đổi biến, cấu hình hoặc chấp nhận dự án còn non; giữ làm phương án dự phòng.
- Không chạy object storage trong compose — loại vì phá yêu cầu "một lệnh chạy cả hệ thống" (EPIC-1) và testcontainers vẫn cần một image.

**Impact**: ARCHITECTURE › Docker Compose; `deploy/docker-compose.yml`, `deploy/.env.example`, `DEPLOY.md`; story US-1.1 (*Story refresh*), US-1.6; LESSONS §4.

**Date**: 2026-10-08
**Version**: 0.1.0

### D24. Lược đồ `core` đầu tiên, cột của `audit_logs` và cách áp migration (US-1.2)

**Context**: US-1.2 tạo lược đồ `core` và `transitionTo`, nhưng ARCH › *Các bảng chính* còn thiếu vài chỗ. `audit_logs` không có cột lý do, trong khi `transitionTo(…, reason)` và BR-10 đều cần lý do. `actor_id` chỉ trỏ tới người dùng, trong khi US-1.4 cần actor hệ thống cho scheduler. Spec cũng chưa nói migration được áp lên DB như thế nào khi chạy Docker Compose.

**Decision** (người dùng chốt ba mục đầu):
- `audit_logs` thêm `reason text` và `actor_kind` (`USER` | `SYSTEM`, có CHECK). `actor_id` để NULL khi `SYSTEM` và bắt buộc có khi `USER`: CHECK `(actor_kind = 'USER') = (actor_id IS NOT NULL)`. Không có FK tới `users`, để audit còn nguyên khi dữ liệu người dùng bị xóa theo thời hạn.
- Bảng chuyển trạng thái chỉ gồm mũi tên của PRD › *Vòng đời trạng thái* (đợt, JD) và chuỗi CV `PENDING_ANALYSIS → PENDING_CONFIRMATION → CONFIRMED`. Story nào cần cạnh khác thì hỏi trước khi thêm.
- Docker Compose có service `migrate` chạy một lần: dùng cùng image với `api`, chạy `node dist/db/migrate.js` (migrator của `drizzle-orm`). `api` chờ bằng `depends_on: condition: service_completed_successfully`, nên `up --wait` cũng chờ migrate thoát với mã 0.
- Theo đề xuất ở *Dev notes* của US-1.2: khóa chính `bigint generated always as identity`; `row_version integer not null default 0` cho `campaigns`, `job_descriptions`, `cvs`; `students.gpa numeric(4,2)`; cột `status` lưu dạng `text` kèm CHECK, danh sách giá trị sinh từ `packages/shared/states`; không có `users.sso_subject`.
- `users` có thêm `full_name`, `is_active`, `password_hash` cho phép NULL. CHECK theo cả hai chiều: `(role = 'HR') = (company_id IS NOT NULL)`, `(role = 'STUDENT') = (student_id IS NOT NULL)`.
- Trigger chặn `UPDATE`/`DELETE`/`TRUNCATE` trên `audit_logs` được đặt `ENABLE ALWAYS`, nên vẫn chạy khi superuser đặt `session_replication_role = replica`.
- Ghim `drizzle-orm` 0.45.3 và `drizzle-kit` 0.31.11, là bản stable mới nhất; dòng 1.0 còn RC.

**Rationale**: Vì lý do và loại actor là dữ liệu cần lọc khi viết báo cáo truy vết (NFR-5), để riêng cột thì truy vấn được, còn nhét vào JSON thì khó. Một service migrate riêng không bị đua khi chạy nhiều instance API, và lỗi migration hiện rõ trong `docker compose up` thay vì làm API khởi động lỗi. CHECK cho `status` và vai trò đặt quy tắc ở tầng DB theo Nguyên tắc 11. Thêm sẵn các cột `users` mà US-1.3 cần để US-1.3 không phải sinh migration trong cùng đợt.

**Alternatives considered**:
- Lưu lý do và actor hệ thống trong `after` (JSONB) — loại vì khó truy vấn và không ràng buộc được bằng CHECK.
- API tự chạy migrate khi khởi động — loại vì nhiều instance có thể chạy migrate cùng lúc.
- Chỉ có lệnh migrate chạy tay — loại vì phá yêu cầu "một lệnh chạy cả hệ thống" (EPIC-1).
- PostgreSQL `ENUM` cho `status` — loại vì thêm giá trị vào enum khó hơn sửa một CHECK.

**Impact**: ARCHITECTURE › *Các bảng chính*, › *Các module* (`audit`), › *Docker Compose*; `deploy/docker-compose.yml`; `DEPLOY.md`, `docs/SETUP.md`, `deploy/.env.example` (`DATABASE_URL`); story US-1.2 (*Story refresh*); US-1.3, US-1.4 dùng các cột `users`, actor `SYSTEM`.

**Date**: 2026-10-08
**Version**: 0.1.1

### D25. Xác thực, phân quyền và refresh token (US-1.3)

**Context**: US-1.3 dựng đăng nhập và phân quyền cho bốn vai trò. ARCH › *Security architecture* chỉ nêu access token 15 phút, refresh token trong cookie httpOnly và RBAC bốn vai trò. Spec chưa nói: thời hạn và nơi lưu refresh token, cách băm mật khẩu, mã lỗi khi sai vai trò hay khi bản ghi ngoài phạm vi, cổng của `ADMIN`, và tài khoản do ADMIN tạo lấy mật khẩu từ đâu. ARCH › *Thư viện chính* ghi `@nestjs/jwt + passport-jwt` nhưng không có `cookie-parser`, bcrypt hay argon2.

**Decision** (người dùng chốt ngày 2026-10-08):
- Access token: JWT HS256 ký bằng `JWT_ACCESS_SECRET`, hết hạn sau 15 phút, chứa `sub`, `role` và `company_id` hoặc `student_id`. Guard chỉ đọc token, không truy vấn DB.
- Refresh token: chuỗi ngẫu nhiên 32 byte trong cookie `srm_refresh` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/auth`). Redis lưu SHA-256 của chuỗi ở khóa `auth:refresh:{sha256}`, giá trị là `userId`, TTL 7 ngày (`REFRESH_TOKEN_TTL_DAYS`). Mỗi lần refresh xóa khóa bằng `GETDEL` rồi phát token mới, nên token đã dùng, đã thu hồi hay đã hết hạn đều trả `401`. Đăng xuất xóa khóa.
- Không dùng passport. Một guard global `AccessGuard` kiểm theo thứ tự: `@Public()` → access token (`401`) → `@Roles()` (`403`). Route thiếu cả hai decorator bị từ chối (`403`) và test duyệt route bằng `DiscoveryService` báo đỏ.
- Sai vai trò trả `403`. Bản ghi ngoài phạm vi trả `404`, như khi bản ghi không tồn tại. Kiểm tra cấp bản ghi nằm trong service, qua helper `common/auth/record-access.ts`.
- Băm mật khẩu bằng `scrypt` của `node:crypto` (N = 2^15, r = 8, p = 1). Email không tồn tại vẫn chạy một lần băm để thời gian phản hồi không lộ email nào đã có tài khoản.
- Đọc cookie bằng cách tự tách header `Cookie`, không thêm `cookie-parser`.
- `ADMIN` dùng chung cổng `/admin/*` với `CENTER`, menu khác nhau.
- ADMIN tạo từng tài khoản `CENTER`, `ADMIN`, `STUDENT` và nhập mật khẩu ban đầu (8–128 ký tự). Tài khoản `HR` chỉ vào qua lời mời (US-1.5). Bản demo dùng seed.
- Mọi lỗi HTTP trả cùng dạng `ApiError` (`{ code, message, details? }`) qua một filter duy nhất `ApiExceptionFilter`: lỗi miền giữ mã của nó, `HttpException` của Nest thành `HTTP_<status>`, lỗi khác ghi log và trả `500 INTERNAL_ERROR`. Mã mới: `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `FORBIDDEN`, `VALIDATION_FAILED`, `EMAIL_TAKEN`, `STUDENT_CODE_TAKEN`, `ROLE_NOT_ALLOWED`, `INTERNAL_ERROR`.
- `JWT_ACCESS_SECRET` bắt buộc, ít nhất 32 ký tự; API từ chối giá trị bắt đầu bằng `change-me`, để không ai chạy hệ thống bằng khóa mẫu công khai.

**Rationale**: Vì access token ngắn hạn và guard không truy vấn DB thì mỗi request rẻ, còn refresh token trong Redis cho phép thu hồi và từ chối token đã dùng mà không cần bảng mới (story không sinh migration trong đợt chạy song song). Lưu hash thay vì chuỗi gốc thì lộ dữ liệu Redis cũng không dùng được token. Guard tự viết trên `@nestjs/jwt` ngắn hơn một strategy passport và kiểm soát được mã lỗi. Một guard thay cho hai giúp thứ tự kiểm tra không phụ thuộc thứ tự đăng ký provider. Trả `404` cho bản ghi ngoài phạm vi để không lộ bản ghi nào tồn tại (BR-11). `scrypt` có sẵn trong Node nên không thêm thư viện.

**Alternatives considered**:
- Refresh token là JWT có `jti` — loại vì cần thêm một khóa ký mà không lợi gì hơn chuỗi ngẫu nhiên.
- Bảng `refresh_tokens` trong PostgreSQL — loại vì phải sinh migration, trong khi Redis đã có trong compose.
- passport + passport-jwt — loại vì thêm hai gói mà không dùng tính năng nào của passport.
- bcrypt hoặc argon2 — loại vì cần thêm gói native; `scrypt` đủ mạnh và có sẵn.
- Trả `403` cho bản ghi ngoài phạm vi — loại vì cho kẻ dò biết bản ghi có tồn tại.
- Thu hồi cả chuỗi refresh token khi thấy một token cũ bị dùng lại — hoãn: cần lưu thêm token đã dùng và nhóm token theo phiên. Hiện token dùng lại chỉ bị từ chối; kẻ lấy được token và refresh trước người dùng vẫn giữ được phiên tới khi hết hạn. Xem lại khi review bảo mật (skill koni-qc) yêu cầu hoặc trước khi mở demo ra ngoài.

**Impact**: ARCHITECTURE › *Security architecture*, › *Redis* (khóa `auth:refresh:{sha256}`), › *Thư viện chính* (bỏ `passport-jwt`); `deploy/docker-compose.yml`, `deploy/.env.example`, `DEPLOY.md`, `docs/SETUP.md` (`REDIS_URL`, `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_TTL_DAYS`, `SEED_PASSWORD`); story US-1.3 (*Story refresh*); US-1.4…US-1.7, US-5.3, US-5.4 dùng `@Roles()`, `record-access.ts` và `loginAs`.

**Date**: 2026-10-08
**Version**: 0.2.0

### D26. Nền shadcn/ui, API client và thư viện web (US-1.3)

**Context**: AD-14 chọn shadcn/ui + Tailwind CSS nhưng để mở câu hỏi nền Radix hay Base UI (ARCH › *Open architecture questions*). ARCH › *Frontend* ghi API client sinh từ OpenAPI bằng "orval hoặc openapi-typescript". `apps/web` lúc này mới có React và Vite.

**Decision** (người dùng chốt ngày 2026-10-08):
- shadcn/ui dùng nền **Radix**, preset `radix-nova`, chạy bằng CLI `shadcn` 4.21.0. Component sinh vào `apps/web/src/components/ui/`.
- API client: **openapi-typescript** sinh kiểu từ `openapi.json` (do API xuất bằng `@nestjs/swagger` + nestjs-zod), **openapi-fetch** gọi API. Middleware của openapi-fetch gắn access token và tự refresh một lần khi gặp `401`. Hook TanStack Query viết tay, mỏng.
- Ghim phiên bản web: `react-router` 8.4.0, `@tanstack/react-query` 5.103.2, `react-hook-form` 7.88.0, `@hookform/resolvers` 5.9.1, `date-fns` 4.4.0, `tailwindcss` và `@tailwindcss/vite` 4.3.3, `openapi-typescript` 7.13.0, `openapi-fetch` 0.17.0. Chỉ chọn bản đã phát hành ít nhất 2 tuần.
- Access token chỉ giữ trong bộ nhớ, không ghi `localStorage`. Khi tải trang, web gọi refresh một lần để lấy lại token từ cookie.

**Rationale**: Vì Radix là nền lâu năm của shadcn, nhiều ví dụ và tài liệu nhất, agent ít viết sai API hơn; skill koni-qc cũng đối chiếu a11y theo Radix. openapi-typescript chỉ sinh một file kiểu, không sinh code runtime, nên diff nhỏ; openapi-fetch khoảng 6 KB và có middleware đúng chỗ cần cho refresh một lần. Giữ token trong bộ nhớ thì script độc hại (XSS) không đọc được token từ storage.

**Alternatives considered**:
- Base UI — loại vì mới hơn, ít ví dụ, dễ lẫn cú pháp với Radix khi agent viết code.
- orval — loại vì sinh nhiều code và cấu hình hơn; hook sinh sẵn chưa cần ở giai đoạn này.
- Lưu access token trong `localStorage` — loại vì lộ token khi bị XSS.

**Impact**: ARCHITECTURE › *Frontend*, › *Open architecture questions* (đã chốt nền shadcn), › *Thư viện chính* (thêm `openapi-fetch`); `apps/web/components.json`; `DESIGN.md`; story US-1.3 (*Story refresh*); mọi story có giao diện.

**Date**: 2026-10-08
**Version**: 0.2.0

### D27. Đợt thực tập: đối tượng, phạm vi đọc, khóa tham số, gia hạn mốc và kiểm tra pha (US-1.4)

**Context**: US-1.4 tạo module `campaign`. *Dev notes* của story có các đề xuất cần hỏi trước khi chốt: đối tượng của đợt (khóa, ngành) không có cột ở ARCH › *Các bảng chính*; "đợt mình tham gia" (EPIC-1 › *RBAC additions*) chưa được định nghĩa; PRD chỉ nói không tự đổi trọng số trong một đợt đang chạy; một mốc `intake_end` gộp cả JD và CV. AC-4 cho "lùi mốc của giai đoạn chưa bắt đầu" nhưng không nói mốc của pha đang chạy có được gia hạn hay không. Goal nói story sau "không phải tự xử lý mốc thời gian", còn tác vụ định kỳ chạy mỗi phút, nên giữa lúc qua mốc và lúc đợt chuyển pha có một khoảng trễ. US-1.6 cho module `student` gọi `CampaignService.assertPhase`, trong khi để lọc đợt cho sinh viên thì `campaign` lại cần khóa và ngành của sinh viên. Calendar của shadcn cần `react-day-picker`, gói này chưa có trong ARCH › *Tech stack*.

**Decision** (người dùng chốt bốn mục đầu ngày 2026-10-12):
- Đối tượng lưu ở `campaigns.config.target` (`cohorts`, `majors`, mỗi danh sách có ít nhất một giá trị). API trả nó ở trường `target` cấp cao. Không thêm cột, nên story không sinh migration.
- Phạm vi đọc: CENTER và ADMIN thấy mọi đợt; HR thấy mọi đợt đã rời `DRAFT` (chưa có bảng nối doanh nghiệp với đợt); STUDENT thấy đợt đã rời `DRAFT` có `target` chứa cả khóa lẫn ngành của mình. Đợt ngoài phạm vi trả `404`. Chỉ CENTER được tạo, sửa và mở đợt.
- Khi đợt rời `DRAFT`: sửa tên, đối tượng hay tham số đều trả `409 CAMPAIGN_CONFIG_LOCKED`. Được lùi mọi mốc chưa tới, kể cả mốc kết thúc của pha đang chạy. Mốc chỉ được lùi về sau, phải giữ thứ tự tăng dần, bắt buộc kèm lý do và ghi audit. Mốc đã qua thì không sửa được.
- Một mốc `intake_end` cho cả JD và CV. `n_nv` = 3 (Q1) và `k` = 1,5 (Q3) là tham số mặc định; Q1 và Q3 vẫn để mở trong PRD.
- Chọn ngày giờ bằng Calendar của shadcn với `react-day-picker` và locale `vi` của date-fns.
- `CampaignService.assertPhase(campaignId, allowed)` từ chối (`409 CAMPAIGN_PHASE_MISMATCH`) khi trạng thái không nằm trong `allowed`, **hoặc** khi mốc kết thúc của pha hiện tại đã qua mà tác vụ định kỳ chưa chuyển. Hàm nhận thêm giao dịch của bên gọi, khi đó đọc đợt với `FOR SHARE` để đợt không đổi pha trước khi bên gọi commit.
- Module `campaign` không import `student`. Nó khai cổng `StudentAudienceLookup` (`studentId → { cohort, major }`), và `StudentModule` đăng ký `StudentService.findAudience` lúc khởi động. Chưa có ai đăng ký thì STUDENT không thấy đợt nào.
- Tác vụ định kỳ chạy mỗi phút, giữ `pg_try_advisory_lock` trên một kết nối riêng qua helper `withAdvisoryLock` (khóa đăng ký ở `ADVISORY_LOCK_KEYS`). Mỗi lần chuyển pha đi qua `transitionTo` với actor `SYSTEM` và `row_version` đã đọc. Đợt trễ nhiều mốc được chuyển lần lượt từng pha. Biến `SCHEDULER_ENABLED` (mặc định `true`) cho phép tắt cron; integration test tắt cron và gọi thẳng `runOnce()`.
- Sự kiện `campaign.opened` và `campaign.phase_changed` (`campaignId`, `from`, `to`) được phát qua `@nestjs/event-emitter` sau khi giao dịch commit, cho cả chuyển thủ công lẫn tự động. Giờ hiện tại lấy qua `Clock` inject được (`apps/api/src/common/clock/`); test dùng `FakeClock`.

**Rationale**: Vì đối tượng chỉ được đọc cùng tham số và bị khóa cùng tham số, để trong `config` thì không cần migration trong đợt mà US-1.5 sinh migration. Cho gia hạn cả mốc của pha đang chạy vì gia hạn nộp CV là nhu cầu hay gặp nhất, còn chỉ cho lùi về sau thì không ai bị thiệt so với lịch đã công bố. `assertPhase` tính cả mốc để nộp bài không lọt vào khoảng trễ của tác vụ định kỳ, và để story sau không lặp lại việc so giờ. Cổng đăng ký giữ phụ thuộc một chiều `student → campaign`; nếu import ngược thì NestJS cần `forwardRef` và dependency-cruiser báo vòng.

**Alternatives considered**:
- Thêm cột `target`, `cohorts`, `majors` cho `campaigns` — loại vì cần migration trong đợt mà US-1.5 đã giữ quyền sinh migration.
- Chỉ cho lùi mốc của pha chưa bắt đầu (đọc đúng chữ AC-4) — người dùng chọn cho lùi mọi mốc chưa tới.
- `assertPhase` chỉ so trạng thái — loại vì thao tác vẫn lọt trong tối đa một phút sau mốc.
- `campaign` import `student` hoặc dùng `forwardRef` — loại vì tạo vòng phụ thuộc khi US-1.6 thêm chiều ngược lại.
- Ô `datetime-local` của trình duyệt — loại vì không theo locale `vi` của date-fns như AC-9 yêu cầu.

**Impact**: ARCHITECTURE › *Tech stack* (`react-day-picker`), › *Các bảng chính* (`config.target`), › *Tác vụ định kỳ*, › *Các module* (sự kiện của `campaign`); `deploy/.env.example`, `DEPLOY.md`, `docs/SETUP.md` (`SCHEDULER_ENABLED`); story US-1.4 (*Story refresh*); US-1.5, US-1.6, US-3.2, US-3.3 dùng `assertPhase` và `campaign.phase_changed`; US-1.7, US-4.3 dùng `Clock`, `FakeClock`, `withAdvisoryLock`.

**Date**: 2026-10-12
**Version**: 0.3.0

### D28. Doanh nghiệp, lời mời HR, JD và lưu file (US-1.5)

**Context**: *Dev notes* của US-1.5 có tám điểm spec còn mở:

1. **Mốc M1.** Mốc M1 (cuối T4) ghi "HR đăng JD được duyệt". Nhưng vòng đời JD buộc HR xác nhận yêu cầu chuẩn hóa (US-2.3, T5) trước khi Trung tâm duyệt.
2. **Lúc JD rời `DRAFT`.** PRD không có trạng thái "chờ phân tích". Bản nháp US-2.3 AC-4 chuyển *Nháp → Chờ HR xác nhận* khi nhận kết quả phân tích.
3. **Từ chối JD.** Vòng đời JD không có cạnh để Trung tâm từ chối hay trả JD về.
4. **Cột FR-4.** `job_descriptions` không có cột cho địa điểm, hình thức, thời gian thực tập, phụ cấp.
5. **Duyệt doanh nghiệp.** `companies` không có cột trạng thái duyệt.
6. **Doanh nghiệp tham gia đợt.** Không có bảng nối doanh nghiệp với đợt.
7. **Token mời.** Chưa có cách lưu và kiểm tra token mời HR.
8. **File id.** ARCH không có bảng `files`, nên `{id}` của `GET /api/files/{id}/url` chưa có nghĩa.

Ngoài ra, compose chỉ có một biến `MINIO_BUCKET`, trong khi ARCH ghi hai bucket `jd-files` và `cv-files`. Không có KMS thì MinIO không mã hóa phía server được. Ký URL bằng endpoint nội bộ `minio:9000` thì trình duyệt không mở được URL. Gói `file-type` từ bản 17 chỉ có ESM.

**Decision** (người dùng chốt bảy mục đầu ngày 2026-10-13):

- **M1:** đạt bằng dữ liệu seed, không thêm cạnh tắt. `dev-seed` có một JD ở `PENDING_APPROVAL` kèm `requirements` mẫu.
- **Nộp JD:** HR nộp thì JD chuyển ngay `DRAFT → PENDING_HR_CONFIRMATION` qua `transitionTo`. JD chưa có `requirements` thì giao diện hiện nhãn "Chờ phân tích". US-2.3 chỉ lưu `requirements`, không chuyển trạng thái khi nhận kết quả phân tích.
- **Từ chối JD:** Trung tâm chỉ duyệt (`PENDING_APPROVAL → APPROVED`), không thêm cạnh trả về.
- **Cột FR-4:** `job_descriptions` thêm `location`, `work_mode` (CHECK `ONSITE`/`HYBRID`/`REMOTE`), `internship_period`, `allowance` và `file_name`.
  - Các cột nullable ở DB.
  - API bắt buộc các trường của FR-4, trừ phụ cấp.
- **Doanh nghiệp:**
  - Doanh nghiệp do Trung tâm tạo coi như đã duyệt. Không có luồng tự đăng ký.
  - Doanh nghiệp tham gia một đợt khi có JD trong đợt đó.
- **Token mời:**
  - JWT HS256 ký bằng khóa của access token, `aud = hr-invite`, hạn 7 ngày. Không có bảng mới.
  - Token chỉ dùng được một lần. Câu lệnh đặt mật khẩu có điều kiện `password_hash IS NULL`.
  - Token mời không có `role`, nên guard của access token từ chối nó.
  - Mời lại email của một HR chưa kích hoạt trong cùng công ty thì cấp token mới. Các trường hợp email đã có khác trả `409 EMAIL_TAKEN`.
  - Đường dẫn mời là `/accept-invitation#<token>`. Phần sau `#` không gửi lên server nên không vào log.
  - Nhận lời mời trả session luôn.
- **File:**
  - `{id}` có dạng `<owner>:<id>` (`jd:12`, `cv:457`).
  - `FileAccessRegistry` ở `common/storage` giữ resolver cho từng loại chủ sở hữu, do module sở hữu dữ liệu đăng ký (`company` cho `jd`, US-1.6 cho `cv`). Resolver áp quyền cấp bản ghi và trả `404` khi ngoài phạm vi.
  - File JD gửi qua `PUT /api/jds/{id}/file` (multipart, kèm `rowVersion`), tách khỏi `POST /api/jds` (JSON).
- **MinIO:**
  - Bucket cố định `jd-files`, `cv-files`, bỏ `MINIO_BUCKET`.
  - API tạo bucket khi khởi động, đặt mã hóa mặc định SSE-S3, và gửi `ServerSideEncryption: AES256` với mọi object.
  - Service `minio` cần `MINIO_KMS_SECRET_KEY`.
  - URL ký sẵn ký với `MINIO_PUBLIC_ENDPOINT` (mặc định bằng `MINIO_ENDPOINT`), hạn 5 phút. Mốc ký lấy từ `Clock`.
- **Thư viện:** `@aws-sdk/client-s3` và `@aws-sdk/s3-request-presigner` 3.1142.0; `file-type` 16.5.4 (bản CommonJS cuối); multer dùng qua `FileInterceptor` của `@nestjs/platform-express`. MIME kiểm bằng magic bytes, không tin phần mở rộng. Giới hạn 5 MB đặt ở multer, nên file lớn bị chặn trước khi đọc hết vào bộ nhớ hay ghi MinIO.
- **Pha của đợt:** mọi thao tác ghi JD của HR (tạo, sửa, tải file, nộp) gọi `assertPhase(…, ['INTAKE'])` trong giao dịch. Thao tác duyệt không kiểm pha.
- **Guard duyệt (BR-02):** `requirements` phải có. Chỉ qua bước HR xác nhận thì JD mới tới được `PENDING_APPROVAL`, nên đây là lớp phòng thủ thêm.
- **Sự kiện:** `hr.invited`, `jd.submitted`, `jd.approved` phát qua `@nestjs/event-emitter` sau khi commit.

**Rationale**:

- Không thêm cạnh tắt và không thêm trạng thái "chờ phân tích", nên vòng đời JD giữ đúng PRD.
- Chuyển trạng thái ngay khi nộp thì việc nộp có audit, và HR không sửa được JD đang chờ phân tích.
- Token không lưu bảng vẫn chỉ dùng được một lần, vì trạng thái "đã dùng" chính là cột mật khẩu.
- Endpoint file riêng giữ `POST /api/jds` là JSON thuần, kiểm bằng schema dùng chung như mọi endpoint khác. US-1.6 dùng lại cùng interceptor.
- Registry giữ `common` không phụ thuộc module nghiệp vụ (Nguyên tắc 13).
- Từ bản 17, `file-type` là ESM, mà Jest của API không nạp được ESM (LESSONS §9).

**Alternatives considered**:
- **Cạnh tạm `PENDING_HR_CONFIRMATION → PENDING_APPROVAL` cho M1:** loại vì là code tạm, US-2.3 phải gỡ.
- **Giữ `DRAFT` khi nộp, thêm cột `submitted_at`:** loại vì phải khóa sửa bằng cột riêng, ngoài bảng chuyển trạng thái.
- **Bảng `invitations` lưu hash token:** loại vì không cần với một luồng mời đơn giản.
- **Một `POST /api/jds` nhận cả JSON lẫn multipart:** loại vì hai dạng body khó kiểm bằng một schema.
- **Tự viết kiểm tra magic bytes:** loại vì nhận DOCX phải đọc mục trong file zip, `file-type` đã làm việc này.
- **Gọi `import()` động cho `file-type` 22:** loại vì Jest cần `--experimental-vm-modules`.

**Impact**:
- ARCHITECTURE: *Các bảng chính* (cột mới của `job_descriptions`), *Lưu trữ file* (KMS, endpoint công khai), *API architecture*, *Các module* (`company`, `iam`, `FileAccessRegistry`), *Thư viện chính*.
- `deploy/.env.example`, `deploy/docker-compose.yml`, `DEPLOY.md`, `docs/SETUP.md`: biến `MINIO_*`.
- Story US-1.5: *Story refresh*.
- US-1.6: dùng `StorageService`, `upload-validation.ts`, `FileAccessRegistry` (`cv`).
- US-1.7: nghe `hr.invited`, ghép base URL cho email.
- US-2.3: AC-4 không chuyển trạng thái.
- US-4.1: nghe `jd.approved`.

**Date**: 2026-10-13
**Version**: 0.4.0

### D29. Thu hồi link mời cũ, tải file qua nginx, bucket lúc khởi động (revision of D28)

**Context**: Review US-1.5 (`/code-review`) tìm ra ba chỗ D28 chưa đủ:

1. Token mời không lưu gì. Mời lại một HR chưa kích hoạt thì cấp token mới, nhưng các token cũ vẫn dùng được tới khi có người đặt mật khẩu hoặc hết 7 ngày. Ai nhận nhầm link đầu tiên vẫn chiếm được tài khoản.
2. Compose ký URL tải file với `http://localhost:9000`, còn cổng MinIO chỉ mở trên `127.0.0.1` của máy chủ. Trình duyệt ở máy khác không mở được file.
3. D28 ghi "API tạo bucket khi khởi động", nhưng code chỉ tạo ở lần tải file đầu tiên. Một MinIO thiếu KMS chỉ lộ ra khi HR tải file.

**Decision**:

- **Nonce lời mời.**
  - `users.invitation_nonce` (text, nullable). Mỗi lần mời hoặc mời lại sinh một nonce ngẫu nhiên 24 byte, lưu vào cột này và đưa vào token (claim `nonce`).
  - Nhận lời mời chỉ thành công khi nonce của token bằng nonce trong DB. Cùng câu lệnh đó đặt mật khẩu và xóa nonce.
  - Mời lại nên link cũ hết hiệu lực ngay. Mời lại cũng cập nhật họ tên theo lần mời mới, ghi audit có before/after.
  - Vẫn không có bảng mới.
- **Tải file qua nginx.**
  - nginx chuyển `/jd-files/` và `/cv-files/` tới `minio:9000`, giữ nguyên header `Host` vì chữ ký URL gồm cả host.
  - `MINIO_PUBLIC_ENDPOINT` mặc định là địa chỉ web (`http://localhost:<NGINX_PORT>`). Máy chủ thật đặt bằng địa chỉ công khai của site.
  - Cổng MinIO không cần mở ra ngoài. Request không có chữ ký hợp lệ vẫn bị MinIO trả `403`.
  - Dùng S3 bên ngoài thì `MINIO_PUBLIC_ENDPOINT` là địa chỉ của dịch vụ đó.
- **Bucket lúc khởi động.**
  - `onApplicationBootstrap` tạo bucket và đặt mã hóa mặc định, nhưng không chặn app. Lỗi được ghi log ngay lúc khởi động.
  - Lần tải file sau thử lại.
  - Export OpenAPI (dựng app mà không khởi động) vẫn không cần MinIO.
- **Đợt HR không thấy.** HR tạo JD trong đợt còn `DRAFT` nhận `404 ENTITY_NOT_FOUND` như đợt không tồn tại, theo phạm vi đọc của D27. Không trả `409` kèm trạng thái đợt. AC-4 (`409 CAMPAIGN_PHASE_MISMATCH`) vẫn áp cho đợt HR thấy được nhưng không ở `INTAKE`, hoặc đã qua `intake_end`.
- **PATCH người liên hệ.** Gộp từng trường: trường không gửi giữ nguyên, `null` hoặc `''` thì xóa.

**Rationale**:

- Nonce là trạng thái tối thiểu để thu hồi link mà không cần bảng `invitations`. Nonce trong DB không giả được token, vì token còn cần khóa ký.
- Tải file cùng origin với web thì chỉ cần mở một cổng ra ngoài, và URL ký đúng host người dùng thấy.
- Kiểm bucket lúc khởi động mà không chặn app: lỗi cấu hình lộ ra ngay khi deploy, nhưng API vẫn chạy được các phần không dùng file.

**Alternatives considered**:
- **Bảng `invitations` lưu hash token:** loại vì một cột đã đủ.
- **Ký URL bằng host lấy từ request:** loại vì tin header `Host` của client để ký là không an toàn, và API không biết địa chỉ công khai sau proxy.
- **Mở cổng MinIO ra ngoài:** loại vì phải mở thêm một cổng và một chứng chỉ TLS.
- **Health check của API phụ thuộc MinIO:** loại vì chạy `--scale minio=0` với S3 ngoài, hay chạy API ngoài Docker không có MinIO, sẽ làm API "unhealthy".

**Impact**:
- Migration `0002_company_jd_invitations` (cột `invitation_nonce`).
- `deploy/nginx.conf`, `deploy/docker-compose.yml`, `deploy/.env.example`, `DEPLOY.md`, `docs/SETUP.md` (`MINIO_PUBLIC_ENDPOINT`).
- ARCHITECTURE: *Các bảng chính*, *Lưu trữ file*, *Docker Compose*.
- US-1.6 (CV dùng cùng proxy `/cv-files/`).
- US-1.7: email mời dùng link mới nhất; link cũ hết hiệu lực khi mời lại.

**Date**: 2026-10-13
**Version**: 0.4.0

### D30. Đồng ý xử lý dữ liệu, phiên bản CV và nộp CV (US-1.6)

**Context**: *Dev notes* của US-1.6 có các điểm spec còn mở:

1. **Nơi lưu đồng ý.** ARCH không có bảng hay cột nào cho việc này.
2. **Mô hình phiên bản CV.** Partial unique index `(student_id, campaign_id) WHERE active` gợi ý mỗi phiên bản là một dòng. Nhưng `match_results` và payload `ai.cv.parse` dùng cặp `cv_id` + `cv_version`, gợi ý `cv_id` cố định qua các phiên bản.
3. **Nội dung điều khoản (Q8).** Màn đồng ý phải ghi tên nhà cung cấp LLM, thời gian nhà cung cấp lưu dữ liệu, dữ liệu có bị dùng để huấn luyện không. Việc đọc điều khoản của nhà cung cấp (Track B) chưa có kết quả trong repo.
4. **Thời hạn lưu dữ liệu.** NFR-2 ghi "do Trung tâm cấu hình", nhưng bảng tham số GĐ0 không có tham số này.

Ngoài ra: ARCH không liệt kê cột `active` và không có cột tên file của CV, trong khi `FileAccessRegistry` cần tên file để đặt `Content-Disposition`. Story đặt điều khoản ở `packages/shared/consent/terms-v1.md`, nhưng `tsc` của `packages/shared` không chép file `.md` sang `dist`, mà image API chạy từ `dist`.

**Decision** (người dùng chốt bốn mục đầu ngày 2026-10-14):

- **Phiên bản CV:** mỗi lần nộp tạo một dòng `cvs` mới.
  - Dòng mới có id mới, `version = n + 1`, `active = true`. Dòng cũ chuyển `active = false` trong cùng giao dịch, có audit.
  - `cv_id` mà US-2.4, US-3.2 dùng trỏ đúng một phiên bản. `cv_version` để hiển thị và để đối chiếu kết quả phân tích.
  - File của các phiên bản cũ vẫn giữ trên MinIO.
- **Đồng ý:** bảng `core.consents(id, student_id, campaign_id, terms_version, terms_sha256, accepted_at)`, unique `(student_id, campaign_id, terms_version)`.
  - `terms_sha256` là SHA-256 của nội dung điều khoản sinh viên đã thấy, tính từ JSON chuẩn hóa (khóa sắp xếp).
  - Đồng ý tính theo đợt: mỗi đợt mới cần đồng ý lại.
- **Điều khoản v1:** viết theo chính sách dữ liệu API hiện hành của Anthropic (AD-10), đọc ngày 2026-10-14. Nguồn ghi ở *Implementation notes* của US-1.6. Người dùng duyệt nội dung trước khi commit.
- **Thời hạn lưu:** 12 tháng sau khi đóng đợt, ghi cố định trong điều khoản v1. Đổi con số này thì ra điều khoản v2.
- **Điều khoản là module TS** ở `packages/shared/consent/` (`TERMS_V1`, `CURRENT_TERMS`), không phải file `.md`.
  - Web vẽ điều khoản bằng JSX, không thêm thư viện markdown.
  - Unit test ghim hash của v1, nên không ai sửa v1 tại chỗ được. Sửa nội dung thì tạo `TERMS_V2`, và sinh viên phải đồng ý lại.
- **Cột và index của `cvs`:**
  - `active boolean not null default true`.
  - `file_name text not null`: tên file gốc để hiển thị, như `job_descriptions.file_name`.
  - Partial unique index `cvs_student_campaign_active_key (student_id, campaign_id) WHERE active` (BR-01).
  - Unique `cvs_student_campaign_version_key (student_id, campaign_id, version)`.
- **Ghi nhận đồng ý** (`POST /api/me/consents`):
  - Chỉ ghi được khi đợt ở `INTAKE`.
  - Client gửi `termsVersion` đã xem. Phiên bản khác bản hiện hành thì trả `409 TERMS_OUTDATED`.
  - Đồng ý lại cùng phiên bản là idempotent: trả bản ghi cũ, không ghi audit lần hai.
- **Nộp CV** (`POST /api/cvs`, multipart, `campaignId` + `file`), kiểm theo thứ tự:
  1. Vai trò `STUDENT` (403).
  2. File quá 5 MB (413, multer).
  3. Đợt sinh viên không thấy, kể cả đợt `DRAFT` (404), như D29 đã áp cho HR.
  4. Đợt không ở `INTAKE` hoặc đã qua `intake_end` (`409 CAMPAIGN_PHASE_MISMATCH`).
  5. Chưa đồng ý phiên bản điều khoản hiện hành (`403 CONSENT_REQUIRED`).
  6. Nội dung không phải PDF/DOCX (415).

  Sau đó API ghi file lên MinIO rồi mới mở giao dịch. Giao dịch lỗi thì xóa object vừa ghi. Hai lần nộp đồng thời: lần thua nhận `409 CV_SUBMISSION_CONFLICT`. Thành công trả `202 Accepted`.
- **Sự kiện:** `cv.submitted` phát qua `@nestjs/event-emitter` sau khi commit, payload camelCase như mọi sự kiện hiện có: `{ cvId, cvVersion, campaignId, studentId }`.
- **Xem CV:**
  - `GET /api/cvs/me` trả mọi phiên bản của sinh viên.
  - Module `student` đăng ký resolver `cv` vào `FileAccessRegistry`; `GET /api/files/{id}/url` nhận thêm vai trò `STUDENT`.
  - Sinh viên chỉ lấy được file của mình, CENTER và ADMIN lấy được mọi file. HR nhận `404` cho tới US-5.3.
- **Mã lỗi mới:** `CONSENT_REQUIRED` (403), `TERMS_OUTDATED` (409), `CV_SUBMISSION_CONFLICT` (409).
- **Web:** tiến độ tải dùng `XMLHttpRequest`, vì `fetch` không báo tiến độ upload. Thêm primitive shadcn `progress`, không thêm gói mới.

**Rationale**:

- Một dòng cho mỗi phiên bản khớp partial unique index của ARCH. Kết quả phân tích, chấm điểm của phiên bản cũ vẫn gắn với đúng dòng của nó, nên không cần bảng `cv_versions`.
- Hash của điều khoản chứng minh được văn bản nào sinh viên đã đồng ý, kể cả khi mã nguồn đổi về sau.
- Đồng ý theo đợt đúng chữ AC-1, AC-2. Khi đổi nhà cung cấp LLM giữa hai đợt, sinh viên phải đồng ý lại.
- Kiểm hết các điều kiện trước khi ghi MinIO, nên request bị từ chối không để lại file.
- Lần nộp đầu tiên không có dòng nào để khóa. Chỉ partial unique index mới chặn được hai lần nộp đồng thời (Nguyên tắc 11).

**Alternatives considered**:
- **`cv_id` cố định và bảng `cv_versions`:** loại vì phải sửa ARCH và index BR-01, migration lớn hơn.
- **Đồng ý một lần cho mọi đợt:** loại vì lệch AC-1, AC-2.
- **Đồng ý không lưu hash:** loại vì không chứng minh được văn bản sinh viên đã thấy.
- **Điều khoản dạng `.md`:** loại vì phải thêm bước chép file vào build của `packages/shared` và thêm thư viện markdown cho web.
- **Thời hạn lưu là tham số của đợt:** loại ở story này vì phải sửa schema tham số đợt và màn cấu hình đợt. Xem lại khi có story xóa dữ liệu theo thời hạn.
- **Tiến độ tải bằng `fetch` streaming:** loại vì trình duyệt chưa hỗ trợ đồng đều.

**Impact**:
- Migration `0003` (cột `cvs.active`, `cvs.file_name`, hai index, bảng `consents`).
- ARCHITECTURE: *Các bảng chính*, *API architecture*, *Các module* (`student`, sự kiện `cv.submitted`).
- Story US-1.6: *Story refresh*.
- US-1.7: nhắc hạn dựa trên CV `active` qua service của `student`; story merge sau thì rebase rồi mới sinh migration.
- US-2.4: nghe `cv.submitted`; `cv_id` trỏ một phiên bản.
- US-2.6: "Sửa lại" tạo dòng mới dùng lại `file_key` cũ.
- US-5.3: thêm quyền HR vào resolver `cv`.

**Date**: 2026-10-14
**Version**: 0.5.0

---

### D31. Thông báo, SSE, email outbox và nhắc hạn (US-1.7)

**Context**: *Dev notes* của US-1.7 có năm điểm spec còn mở:

1. **Xác thực SSE.** `EventSource` của trình duyệt không gửi được header `Authorization`, còn access token (D25) chỉ nằm trong bộ nhớ của client.
2. **Cột outbox và chống trùng.** Bảng `notifications` ở ARCH chỉ có `id, user_id, type, payload, read_at`.
3. **Số lần thử email.** Spec chỉ ghi "gửi lỗi thì thử lại".
4. **Thời điểm nhắc.** Spec không ghi nhắc trước hạn bao lâu.
5. **Kênh của từng sự kiện.** PRD › *Thông báo* chỉ nêu người nhận.

Ngoài ra còn phải giải quyết:

- `notify` ghi trong giao dịch của caller (AC-1), nên module không biết lúc nào giao dịch commit để đẩy SSE.
- Link mời HR cần địa chỉ web tuyệt đối.
- `tsc` không chép file `.hbs` sang `dist`.

**Decision** (người dùng chốt năm mục đầu ngày 2026-10-19):

- **Xác thực SSE:** client mở `GET /api/events/stream` bằng `fetch` và `ReadableStream`, gửi `Authorization: Bearer` như mọi request, rồi tự tách khung SSE. Không thêm thư viện.
  - `AccessGuard` dùng nguyên: chưa xác thực thì nhận `401` trước khi có sự kiện nào.
  - Không có endpoint vé hay khóa Redis `sse:ticket:*`.
  - Stream tự đóng sau một vòng đời access token (15 phút). Client kết nối lại bằng token mới, nên phiên đã bị thu hồi không nghe tiếp được quá 15 phút.
- **Sự kiện SSE:**
  - `ready`: đã đăng ký kênh xong. Client tải lại danh sách mỗi khi kết nối lại.
  - `ping`: mỗi 25 giây, để proxy không cắt kết nối.
  - `notification`: dữ liệu là một mục của danh sách.
  - Tên sự kiện khai trong `SERVER_EVENTS` (`packages/shared/schemas/notification.ts`). EPIC-2 và US-3.4 thêm tên mới ở đó.
- **Redis pub/sub:** kênh `notify:user:{userId}`.
  - Mỗi instance mở một kết nối subscriber riêng (`duplicate()`). Kênh của một user chỉ được đăng ký khi user đó có ít nhất một stream đang mở.
  - `RealtimePublisher.publishToUser` được export cho story sau.
- **Bảng `core.notifications`:** mỗi người nhận một dòng. Dòng này vừa là thông báo trong app, vừa là mục outbox khi có kênh email.
  - Cột: `id`, `user_id`, `type`, `payload`, `channels text[]`, `read_at`, `dedupe_key`, `email_status`, `email_attempts`, `email_next_attempt_at`, `email_sent_at`, `email_last_error`, `created_at`.
  - CHECK: `type` thuộc danh sách; `channels` khác rỗng và nằm trong `IN_APP`, `EMAIL`; có `email_status` khi và chỉ khi có kênh `EMAIL`.
  - Unique `(user_id, dedupe_key)`; index `(user_id, read_at)` theo ARCH; partial index `(email_next_attempt_at) WHERE email_status = 'PENDING'`.
  - Cột `email_next_attempt_at` không có trong đề xuất của story. Nó cần cho việc lùi lần thử.
- **`type`** viết UPPER_SNAKE: `CAMPAIGN_OPENED`, `HR_INVITED`, `DEADLINE_REMINDER`. Schema của `type` và `payload` dạng union theo `type` nằm ở `packages/shared/schemas/notification.ts`.
- **`email_status`** ∈ `PENDING`, `SENT`, `FAILED`, `CANCELLED`. Đây là trạng thái gửi kỹ thuật, không phải trạng thái nghiệp vụ, nên không đi qua `transitionTo` (Nguyên tắc 10) và bảng không có `row_version`.
- **Gửi email:** tối đa 3 lần, lần thử lại cách 1 phút rồi 5 phút. Lần thứ ba lỗi thì `FAILED` và ghi log error.
  - Worker chạy mỗi 10 giây. Mỗi email xử lý trong một giao dịch riêng, khóa dòng bằng `FOR UPDATE SKIP LOCKED`, nên hai instance không lấy trùng một email. Lỗi SMTP chỉ chạm dòng đó.
  - Gửi ít nhất một lần: process chết sau khi SMTP nhận mà trước khi commit thì email được gửi lại.
  - Địa chỉ email lấy lúc gửi qua `UserDirectory` của `iam`. Tài khoản bị khóa hoặc không còn thì `CANCELLED`.
- **Kênh của từng sự kiện:** mọi thông báo có trong app; mở đợt, nhắc hạn và lời mời HR có thêm email.
  - `HR_INVITED` chỉ có email: HR chưa đăng nhập được, và link chứa token mời.
  - Danh sách chỉ trả dòng có `IN_APP`, nên token không bao giờ ra API.
- **Mời lại HR:** chỉ link mới nhất được gửi.
  - Trong một giao dịch có khóa `pg_advisory_xact_lock(1702, userId)`: email `HR_INVITED` còn `PENDING` của user chuyển `CANCELLED`, rồi chèn email mới.
  - Sự kiện có `expiresAt` cũ hơn dòng mới nhất đã xử lý thì bị bỏ, vì listener của hai lần mời liền nhau có thể chạy xong theo thứ tự bất kỳ.
- **`notify(input, { tx? })`:**
  - Có `tx`: ghi trong giao dịch của caller và trả `PendingNotifications`. Caller gọi `push(pending)` sau commit, cùng mẫu với `emitSafely`.
  - Không có `tx`: tự mở giao dịch và đẩy SSE sau commit.
  - Caller quên `push` thì thông báo vẫn nằm trong DB, và client thấy khi tải lại danh sách.
  - `type`/`payload` sai schema thì ném lỗi trước khi ghi. Lỗi này là lỗi của caller, nên thành `500`.
- **Nhắc hạn:** tham số đợt `campaigns.config.reminder_hours_before`, số nguyên 1–168, mặc định 24.
  - Khóa sau khi mở đợt như mọi tham số khác. Đợt cũ chưa có khóa này thì nhận mặc định khi parse.
  - Khung nhắc là `[hạn − H, hạn)`.
  - Tác vụ chạy mỗi 5 phút, trong `withAdvisoryLock(1701)`, đọc giờ qua `Clock`.
  - Nguồn nhắc đăng ký vào `DeadlineReminderRegistry` trong `onModuleInit`. Nguồn đầu tiên là `cv-intake`: sinh viên thuộc đối tượng của đợt `INTAKE` mà chưa có CV `active`. US-3.3, US-4.3, US-5.3 đăng ký nguồn từ module của mình.
- **`dedupe_key`:**
  - `campaign_opened:{campaignId}`.
  - `deadline:{campaignId}:{deadlineKey}:{hạn ISO}`. Gia hạn mốc (D27) là một hạn mới nên được nhắc thêm một lần.
- **Người nhận của "Mở đợt":** `StudentService.listIdsInTarget` lọc bằng `isInTarget`, cùng hàm mà `canSeeCampaign` dùng, rồi `UserDirectory.userIdsForStudents` lấy tài khoản đang hoạt động. So khớp chạy trong code, không dùng `lower()` của SQL, vì kết quả `lower()` phụ thuộc collation của DB.
- **Template:** Handlebars viết trong `templates/templates.ts`, không dùng file `.hbs`.
  - Chủ đề và bản text không escape. Bản HTML escape mọi giá trị người dùng nhập. Ký tự xuống dòng trong chủ đề bị thay bằng khoảng trắng.
  - Giờ trong email theo `Asia/Ho_Chi_Minh`, định dạng `dd/MM/yyyy HH:mm`.
- **Biến môi trường mới:**
  - `WEB_ORIGIN`: bắt buộc, không có `/` ở cuối. Compose mặc định `http://localhost:<NGINX_PORT>`.
  - `SMTP_HOST` (mặc định `localhost`; compose đặt `mailpit`), `SMTP_PORT` (1025).
  - `SMTP_USER`, `SMTP_PASSWORD`: tùy chọn, chuỗi rỗng coi như không đặt.
  - `MAIL_FROM`.
- **API:**
  - `GET /api/notifications`: phân trang theo con trỏ `?before=<id>&limit=` (mặc định 20, tối đa 50), không dùng offset, vì thông báo mới chèn lên đầu làm lệch offset. Trả `{ items, unreadCount, nextBefore }`.
  - `POST /api/notifications/{id}/read`: `204`. `read_at` đã có thì giữ nguyên. Thông báo của người khác hoặc chỉ-email thì `404`.
  - `POST /api/notifications/read-all`: trả `{ updated }`.
  - Mọi vai trò đều gọi được.
- **Thư viện:** `nodemailer` 10.0.15 và `handlebars` 4.7.10, đều có trong ARCH › *Thư viện chính*.
  - `nodemailer` 10 khai `"type": "module"`, nhưng có bản CommonJS ở `dist/cjs` (với `package.json` riêng `"type": "commonjs"`) và điều kiện `require`, nên Jest nạp được (LESSONS §9).
  - Gói có sẵn kiểu, không cần `@types/nodemailer`.
- **Web:** `EventStreamProvider` mở một kết nối SSE cho mỗi tab, gắn trong hai layout cổng.
  - Hook `useServerEvent(name, handler)` để EPIC-2 và US-3.4 dùng lại.
  - Chuông dùng `Popover` trên desktop và `Sheet side="bottom"` dưới `md`.

**Rationale**:

- `fetch` có header thì dùng lại được guard, không cần thêm endpoint, khóa Redis hay token trong URL (vốn lọt vào log nginx).
  - `EventSource` dùng lại vé cũ khi kết nối lại thì bị `401` và đóng hẳn. Vì vậy cách dùng vé vẫn phải tự viết phần kết nối lại, không gọn hơn.
- Một dòng cho mỗi người nhận làm cho đọc, đánh dấu, outbox và chống trùng đều là câu SQL đơn giản. Unique `(user_id, dedupe_key)` chặn trùng ngay ở DB (Nguyên tắc 11), kể cả khi advisory lock bị bỏ qua.
- `SKIP LOCKED` cho nhiều instance cùng gửi mà không cần khóa riêng cho worker.
- Lấy địa chỉ email lúc gửi thì luôn dùng địa chỉ mới nhất, và không phải sao chép email vào bảng của module khác.
- So khớp đối tượng của đợt bằng cùng một hàm thì người được báo mở đợt chính là người thấy được đợt.

**Alternatives considered**:
- **Vé SSE dùng một lần ở Redis** (đề xuất của story): loại vì thêm endpoint, khóa Redis, token trong URL, mà không bớt được logic kết nối lại.
- **`LISTEN/NOTIFY` của PostgreSQL thay Redis để đẩy sau commit:** loại vì lệch AD-13. Tiến độ job AI và mức cạnh tranh không gắn với giao dịch nào.
- **Đẩy SSE bằng một tác vụ quét bảng:** loại vì trễ vài giây và tốn truy vấn.
- **Thử email 5 lần:** loại theo lựa chọn của người dùng, giữ như NFR-10.
- **Thời gian nhắc là hằng của cả hệ thống:** loại theo lựa chọn của người dùng. Trung tâm cần chỉnh theo từng đợt.
- **File `.hbs` và bước chép file khi build:** loại vì phải sửa build, `dev.mjs` và Dockerfile.
- **Phân trang theo offset** như `GET /api/admin/users`: loại vì danh sách đổi liên tục.

**Impact**:
- Migration `0004` (bảng `notifications`).
- Module mới `notification`.
- Export mới:
  - `CampaignService.listSettingsInPhase`, `isInTarget`, `name` trong `CampaignSettings`;
  - `StudentService.listIdsInTarget`, `CvService.studentIdsWithActiveCv`;
  - `UserDirectory` của `iam`.
- Khóa advisory `1701` (nhắc hạn) và `1702` (khóa giao dịch theo user cho email mời HR).
- ARCHITECTURE: *Các module*, *Các bảng chính*, *Redis*, *API architecture*, *Tác vụ định kỳ*, *Thư viện chính*.
- PRD: bảng tham số GĐ0 (`reminder_hours_before`), bảng *Thông báo* (cột kênh).
- `docs/SETUP.md`, `DEPLOY.md`, `deploy/.env.example`, `deploy/docker-compose.yml`. Tài liệu chạy API ngoài Docker bổ sung các biến `MINIO_*` còn thiếu từ 0.4.0.
- DESIGN.md §6: `popover` dùng thêm cho chuông thông báo.
- Story sau:
  - US-3.3, US-4.3, US-5.3 đăng ký nguồn nhắc hạn.
  - EPIC-2 và US-3.4 đẩy sự kiện bằng `RealtimePublisher`, nghe bằng `useServerEvent`.
  - US-5.2 gọi `notify` khi công bố đề cử.

**Date**: 2026-10-19
**Version**: 0.6.0

---

### D32. Link mời HR ký lúc gửi, stream đóng theo hạn token, email quá hạn bị hủy (revision of D31)

**Context**: Code review của US-1.7 (`/code-review`, 2026-10-19) chỉ ra các vấn đề sau trong thiết kế ở D31:

1. Payload `HR_INVITED` lưu nguyên `invitationPath`. Như vậy token kích hoạt còn hiệu lực nằm dạng thường trong `core.notifications` và không bao giờ bị xóa. Ai đọc được bảng này (bản sao lưu, replica, câu truy vấn hỗ trợ) đều chiếm được tài khoản HR chưa kích hoạt. `iam` cố ý chỉ lưu nonce; dòng này phá điều đó.
2. Bỏ sự kiện mời cũ bằng cách so `expiresAt` là không đáng tin. `expiresAt` chỉ chính xác tới giây và được ký sau khi giao dịch đổi nonce commit, nên hai lần mời trong cùng một giây có thể gửi đi link đã bị thu hồi.
3. Ép `userId::int` trong `pg_advisory_xact_lock` sẽ tràn khi id vượt 2^31 − 1.
4. Stream SSE sống cố định 15 phút tính từ lúc mở kết nối. Token còn 31 giây vẫn giữ stream thêm 15 phút, trái với cam kết của D31.
5. Email nhắc hạn (hoặc báo mở đợt) đang chờ thử lại vẫn được gửi sau khi hạn đã qua.
6. Client gặp 401 mà refresh vẫn thành công thì kết nối lại liên tục, không nghỉ.
7. SMTP không có timeout riêng (mặc định của nodemailer là 10 phút), trong khi worker giữ khóa dòng và một kết nối DB suốt lúc gửi.

**Decision**:

- **Email mời HR không lưu link.** Payload `HR_INVITED` chỉ còn `{ companyId }`.
  - Lúc gửi, worker gọi `InvitationService.currentInvitationLink(userId)` của `iam`. Hàm này ký một token mới từ nonce hiện tại của tài khoản, hạn 7 ngày tính từ lúc gửi.
  - Tài khoản không còn lời mời đang chờ (đã kích hoạt, bị khóa, không có nonce) thì hàm trả `null`, và email chuyển `CANCELLED`.
  - Email luôn mang lời mời mới nhất, nên không cần so `expiresAt` nữa.
  - Listener vẫn khóa theo user và hủy email cũ còn `PENDING`, để HR chỉ nhận một email cho mỗi lần mời.
- **Khóa theo user:** `pg_advisory_xact_lock(1702, hashtext(userId::text))`. Trùng hash chỉ làm hai user phải chờ nhau.
- **Vòng đời stream:** đóng khi access token đã mở stream hết hạn. `AccessTokenService.expiresAt` đọc `exp` của token mà guard đã kiểm. Giới hạn trên vẫn là 15 phút.
- **Email quá hạn:** trước khi gửi, worker kiểm `emailStillRelevant`. `DEADLINE_REMINDER` đã qua `deadline`, hoặc `CAMPAIGN_OPENED` đã qua `intakeEnd`, thì chuyển `CANCELLED` ("out of date").
- **Client SSE:** từ lần 401 thứ hai liên tiếp (dù refresh thành công) thì lùi 1, 2, 4… tối đa 30 giây. Nhận được `ready` thì đặt lại về đầu.
- **SMTP:** dùng pool một kết nối; timeout kết nối và greeting 10 giây, socket 30 giây. Mỗi lượt worker xử lý tối đa 500 email; các lượt không chạy chồng nhau.
- **Helper `errorMessage`** (`common/errors`) thay cho các bản chép trong module `notification`.

**Rationale**:

- Không lưu token thì không có gì để lộ ra. Ký lúc gửi thì luôn khớp nonce mới nhất, nên một cơ chế giải quyết được cả lỗ hổng lẫn thứ tự lời mời.
- Hạn của token được gia hạn thêm bằng độ trễ của email: vài giây, tối đa vài phút khi phải thử lại. Thời hạn 7 ngày vẫn giữ nguyên ý nghĩa.

**Alternatives considered**:
- **Xóa link khỏi payload sau khi gửi:** loại vì token vẫn nằm trong DB suốt lúc chờ và lúc thử lại.
- **Mang nonce hoặc số thứ tự trong sự kiện để so:** loại vì vẫn phải lưu link, nên không giải quyết được vấn đề 1.
- **Lọc sơ đối tượng của đợt bằng SQL** (review gợi ý, do `listIdsInTarget` đọc cả bảng `students` mỗi 5 phút trong khung nhắc): hoãn. `lower()` phụ thuộc collation, nên có thể bỏ sót người nhận. Với quy mô hiện tại (vài nghìn sinh viên) chi phí không đáng kể. Xem lại khi số sinh viên lớn.

**Impact**:
- `packages/shared/schemas/notification.ts` (`HrInvitedPayloadSchema`).
- `InvitationService.currentInvitationLink` (export của `iam`); `AccessTokenService.expiresAt`.
- `EmailOutboxWorker`, `EmailRenderer`, `HrInvitedListener`, `EventStreamService`, `SmtpMailTransport`, `domain/email-relevance.ts`.
- ARCHITECTURE: *Cập nhật thời gian thực*, *Các module*, *Tác vụ định kỳ*.
- Test: `email-outbox.int-spec.ts` (link mời gửi đi dùng được, lời mời đã nhận thì không gửi, nhắc hạn quá hạn bị hủy), `notification-listeners.int-spec.ts`, `events-stream.int-spec.ts` (stream đóng khi token hết hạn).

**Date**: 2026-10-19
**Version**: 0.6.0

---

## Phase 4 — Thực hiện EPIC-2 (2026-10-20)

### D33. Đường ống job AI, hợp đồng message và role DB (US-2.1)

**Context**: US-2.1 dựng đường ống job AI cho cả EPIC-2 đến EPIC-4. Spec của story và ARCH còn để mở các điểm sau:

1. **Driver PostgreSQL của AI Service.** ARCH › *Tech stack* chưa liệt kê thư viện nào (subtask 2.1.6.3).
2. **Tài khoản DB của API.** Subtask 2.1.3.3 nói `api_service` "chỉ đọc `ai.*`", nhưng compose đang cho API đăng nhập bằng tài khoản chủ của DB.
3. **Chỗ thử lại.** NFR-10 chỉ ghi "tối đa 3 lần rồi vào DLQ".
4. **Nội dung `ai.results`.** ARCH › *Hàng đợi* ghi `job_id, type, status, result`. Khi `FAILED` thì không có `result`, nên backend không biết CV hay JD nào lỗi để báo người dùng (AC-6).
5. **Thứ tự ghi, gửi kết quả và ack trong worker**, cách khai báo queue và DLQ, cách xử lý message hỏng ở cả hai phía.
6. **Sự kiện tiến độ job** (subtask 2.1.4.4): `aigateway` không biết ai là người nhận.

**Decision** (người dùng chốt bốn mục đầu ngày 2026-10-20):

- **Driver:** psycopg 3 (`psycopg[binary,pool]`, `AsyncConnectionPool`). Thêm `uvicorn` để chạy FastAPI, `httpx` cho test. MinIO client và adapter pgvector thêm ở US-2.4, US-2.5.
- **Role DB:**
  - Migration `0006` (viết tay bằng `drizzle-kit generate --custom`) tạo `api_service` và `ai_service` ở dạng `NOLOGIN` nếu chưa có, rồi cấp quyền.
  - Bước `migrate` đặt `LOGIN` và mật khẩu từ `API_DB_PASSWORD`, `AI_DB_PASSWORD` (`configureServiceRoles` trong `src/db/migrate.ts`). Biến chưa đặt thì role giữ nguyên. Mật khẩu được nhúng vào URL kết nối, nên chỉ nhận ký tự an toàn trong URL.
  - API trong compose đăng nhập bằng `api_service`. `migrate` vẫn dùng tài khoản chủ.
  - `api_service`: `SELECT`, `INSERT`, `UPDATE`, `DELETE` trên mọi bảng `core`, riêng `audit_logs` chỉ `SELECT` và `INSERT`; chỉ đọc `ai.*`. `ALTER DEFAULT PRIVILEGES` cấp sẵn cho bảng tạo sau.
  - `ai_service`: `USAGE` trên `core` và `SELECT` riêng trên hai view; `SELECT`, `INSERT`, `UPDATE`, `DELETE` trên `ai.*`, không có `CREATE`.
- **View che PII:** `core.v_ai_cv_profile_masked (cv_id, version, campaign_id, profile_masked)` và `core.v_ai_jd_requirements (jd_id, version, campaign_id, position_group, requirements)`.
  - `WITH (security_barrier)`, chạy theo quyền của chủ view, nên `ai_service` không cần quyền trên bảng gốc.
  - Điều kiện lọc lấy từ bảng chuyển trạng thái: CV `active` ở trạng thái từ `CONFIRMED` trở đi; JD ở trạng thái từ `APPROVED` trở đi (`reachableFrom` trong `packages/shared/states/machine.ts`). Test so view với bảng chuyển trạng thái, nên thêm trạng thái mới mà quên sửa view thì test đỏ.
  - `core.v_ai_jd_source` chốt cùng US-2.3.
- **Hợp đồng message** (`packages/shared/contracts`):
  - Mọi message là `z.strictObject`. JSON Schema có `additionalProperties: false`, Pydantic có `extra='forbid'`.
  - `ai.results`: `{ job_id, type, status, job, result, error }`, union phân biệt theo `type`.
    - `job` là bản sao payload job gốc.
    - `result` của mọi kiểu job có `prompt_version` và `model` (Nguyên tắc 12); US-2.3, US-2.4 mở rộng.
    - `error`: `{ code, message, needs_human }`.
    - `status` ∈ `SUCCEEDED`, `PARTIAL`, `FAILED`. Kiểm chéo (`FAILED` thì có `error`, không có `result`; còn lại ngược lại) chỉ có ở phía TS, vì `z.toJSONSchema` bỏ qua refine. Phía Python dựng message ở một chỗ (`app/consumers/base.py`) và có test riêng.
  - Script `pnpm contracts:gen` (`scripts/gen-contracts.mjs`) ghi `packages/shared/contracts/json-schema/*.json` và `ai-service/app/contracts/queues.json`, rồi sinh `ai-service/app/contracts/*.py` bằng `datamodel-code-generator`. `datamodel-code-generator` ghim chính xác và dùng formatter `builtin` của nó, để output chỉ phụ thuộc một phiên bản.
  - CI chạy lại script rồi kiểm `git status --porcelain` trên hai thư mục, để bắt cả file mới chưa track.
- **Queue:**
  - Tên queue, hậu tố `.dlq`, số lần thử (3) và độ trễ thử lại (2 s, 10 s) nằm ở `contracts/queues.ts`; Python đọc qua `queues.json`.
  - Hai phía khai báo queue giống hệt nhau: `durable: true`, `x-queue-type: classic`. FastStream 0.7 luôn thêm tham số này; RabbitMQ từ chối khai báo lại khi tham số khác.
  - Không dùng tham số dead-letter của RabbitMQ. Code tự publish sang `<queue>.dlq`, kèm header lý do lỗi, số lần thử và queue gốc.
- **Worker** (`ai-service/app/consumers/base.py`):
  - Nhận job bằng một câu SQL: chèn `ai.jobs` ở `PROCESSING` với `attempts = 1`; nếu đã có dòng `PROCESSING` thì tăng `attempts`; nếu job đã xong thì không trả dòng nào và message được ack mà không chạy handler.
  - Thử lại ngay trong worker: `RetryableError` (và mọi lỗi không phân loại được) thì ghi `last_error`, chờ 2 s rồi 10 s. Lần thứ 3 lỗi thì `FAILED`, gửi `ai.results` `FAILED`, publish message gốc sang DLQ, rồi ack.
  - `PermanentError`: không thử lại, `FAILED`, gửi `ai.results` với `needs_human = true`.
  - Payload sai schema: publish sang DLQ rồi ack.
  - Thứ tự: publish kết quả (có confirm) → ghi `SUCCEEDED`/`FAILED` → ack. Giao ít nhất một lần: worker chết giữa chừng thì message được giao lại và `attempts` tăng; backend hấp thụ kết quả trùng.
  - Bắt mọi ngoại lệ trong handler, vì mặc định FastStream reject không requeue, tức là mất message.
  - Mỗi worker nhận tối đa 8 job cùng lúc (`prefetch_count`); muốn nhanh hơn thì tăng số bản sao `ai-worker`.
- **Consumer `ai.results`** (`aigateway`):
  - Nhận cả message không phải JSON. Message sai JSON hoặc sai schema thì ghi log (kèm `job_id` nếu đọc được), publish nguyên văn sang `ai.results.dlq`, rồi ack. Consumer không dừng.
  - Message hợp lệ thì phát `ai.result.<TYPE>` bằng `emitAsync`, rồi `ai.job.settled`. Listener lỗi lần đầu thì requeue; lỗi khi message đã được giao lại thì vào DLQ.
- **`AiGatewayService.dispatch(type, input)`:** sinh `job_id` (UUID), kiểm bằng schema strict, publish có confirm và timeout, rồi phát `ai.job.dispatched`. Chỉ gọi sau khi giao dịch nghiệp vụ đã commit, nên hàm không nhận `tx`.
  - Kết nối RabbitMQ không chặn lúc khởi động (`wait: false`), để API và bước xuất OpenAPI chạy được khi broker chưa sẵn sàng. Consumer `ai.results` được gắn khi kết nối được, và gắn lại sau mỗi lần kết nối lại.
  - Mỗi app Nest tự tạo một `AmqpConnection` của golevelup trong provider, không dùng `RabbitMQModule`. Module này giữ connection trong biến static theo tên, nên hai app trong một process (integration test) dùng chung và đóng connection của nhau.
  - `amqp-connection-manager` 5 (dưới golevelup) cần `promise-breaker` 7, gói chỉ có ESM. Node 22 nạp được bằng require(esm); Jest thì không, nên `jest.config.cjs` biên dịch riêng gói này sang CommonJS ([LESSONS §9](LESSONS.md)).
- **Quy ước cho listener `ai.result.<TYPE>`** (module sở hữu, US-2.3, US-2.4):
  - `@OnEvent(name, { suppressErrors: false })`, **không** `async: true`. Với `async: true`, `emitAsync` trả về trước khi listener chạy xong, nên lỗi không quay về consumer.
  - Kết quả đã áp dụng hoặc thuộc phiên bản cũ thì trả về im lặng. Ghi kiểu upsert theo khóa tự nhiên và đi qua `transitionTo`.
- **Sự kiện tiến độ:** `aigateway` chỉ phát sự kiện nội bộ `ai.job.dispatched`, `ai.job.settled`. Module sở hữu đối tượng (US-2.3, US-2.4) tự đẩy SSE qua `RealtimePublisher` và thêm tên sự kiện vào `SERVER_EVENTS`.

**Rationale**:

- Quyền DB là lớp bảo vệ chính của AD-4. API đổi sang `api_service` ngay thì lỗi thiếu quyền lộ ra từ bây giờ, không phải lúc demo.
- Thử lại trong worker không cần exchange hay queue trễ riêng, và `attempts` ở `ai.jobs` cho biết chính xác số lần đã chạy. Chi phí là một worker bị giữ tối đa khoảng 12 s cho một job lỗi.
- Gửi kèm payload job trong `ai.results` thì backend xử lý `FAILED` như mọi kết quả khác, không cần bảng tra `job_id` → đối tượng.
- Tự publish DLQ thì hai phía không phải khớp thêm tham số dead-letter, và message trong DLQ mang đủ thông tin để xử lý tay.
- Bắt mọi lỗi ở cả hai phía vì mặc định của hai thư viện đều sai cho trường hợp này: golevelup requeue mãi (vòng lặp message độc), FastStream bỏ message.

**Alternatives considered**:
- **asyncpg, SQLAlchemy:** loại theo lựa chọn của người dùng. psycopg 3 có pool async và cú pháp tham số an toàn, không thêm lớp ORM.
- **Thử lại bằng queue trễ (TTL + dead-letter về queue gốc):** loại vì thêm ba queue cho mỗi kiểu job và hai phía phải khớp tham số.
- **Giữ API ở tài khoản chủ, chỉ tạo `ai_service`:** loại theo lựa chọn của người dùng.
- **Transactional outbox cho việc gửi job:** hoãn như story đã ghi. Trigger: phát hiện job bị mất.
- **Lưu `job_id` → đối tượng ở backend thay cho gửi kèm payload:** loại vì cần thêm bảng và một lần đọc cho mỗi kết quả.

**Impact**:
- Migration `0005` (schema `ai`, bảng `ai.jobs`) và `0006` (view, role, quyền).
- `packages/shared/contracts/*`, `packages/shared/states/machine.ts` (`reachableFrom`), `scripts/gen-contracts.mjs`, `.gitattributes`.
- Module mới `aigateway`; `@golevelup/nestjs-rabbitmq` 9.1.0.
- `ai-service`: `app/contracts` (sinh tự động), `app/consumers`, `app/handlers`, `app/worker.py`, `app/main.py`, `Dockerfile`.
- Biến môi trường mới: `RABBITMQ_URL` (API), `API_DB_PASSWORD`, `AI_DB_PASSWORD`, `AI_DATABASE_URL`, `AI_API_HOST_PORT`.
- ARCHITECTURE: *Phân vùng schema*, *Các bảng chính*, *Hàng đợi*, *Docker Compose*, *CI*, *Tech stack*.
- Story sau: US-2.2 (`PermanentError` khi LLM từ chối), US-2.3 và US-2.4 (thay handler giả, thêm `result`, viết listener theo quy ước trên), US-2.5 (`ai.embeddings` dưới role `ai_service`).

**Date**: 2026-10-20
**Version**: 0.7.0

### D34. Nhà cung cấp LLM: Gemini mặc định, Claude thay thế qua `LLMClient` (revision of D10; chốt một phần Q8) (US-2.2)

**Context**: D10 chọn một model `claude-opus-5-5` cho mọi agent. Khi lên kế hoạch US-2.2, người dùng muốn dùng được Gemini, không bắt buộc Claude. Q8 (API thương mại hay mô hình tự host) chưa chốt; NFR-12 yêu cầu đổi nhà cung cấp mà không sửa nghiệp vụ. Story viết cứng quanh API của Claude (`output_config.effort`, `stop_reason == "refusal"`, `fallbacks`).

**Decision** (người dùng chốt ba mục đầu ngày 2026-10-20):

- **Hai nhà cung cấp, mặc định Gemini.** `LLM_PROVIDER=gemini|anthropic|fixture`, mặc định `gemini`. Agent chỉ phụ thuộc `Protocol` `LLMClient` trong `ai-service/app/llm/`. Q8 chốt một phần: dùng API thương mại; mô hình tự host chưa làm.
- **Một model cho mọi agent theo từng nhà cung cấp** (giữ tinh thần D10): Gemini `gemini-3.8-flash`, Claude `claude-opus-5-5`. `LLM_MODEL` ghi đè. Độ sâu suy luận vẫn theo bảng effort của ARCH: `effort` của Claude, `thinking_level` (`LOW`/`MEDIUM`/`HIGH`) của Gemini.
- **Không gửi `temperature`.** `claude-opus-5-5` từ chối tham số sampling; Google khuyên giữ mặc định với Gemini 3.x. Tính nhất quán dựa vào cố định model + phiên bản prompt, structured output và cache kết quả. Sửa PRD › guardrails theo đó.
- **Lõi chung + adapter.** `StructuredLLMClient` làm mọi việc chung: kiểm refusal trước khi đọc nội dung, thử lại tối đa 2 lần khi sai schema hoặc `MAX_TOKENS`, ghi log. Adapter (`GeminiProvider`, `AnthropicProvider`, `FixtureProvider`) chỉ dựng tham số và chuẩn hóa phản hồi về `StopReason` (`END_TURN`, `MAX_TOKENS`, `REFUSAL`, `OTHER`) và `Usage`.
  - Gemini gọi `client.aio.models.generate_content` (không lưu trạng thái phía Google; Interactions API mặc định `store=true`). JSON lấy bằng `response_mime_type="application/json"` + `response_json_schema`. Refusal: `prompt_feedback.block_reason`, hoặc `finish_reason` thuộc `SAFETY`, `RECITATION`, `BLOCKLIST`, `PROHIBITED_CONTENT`, `SPII`, nhóm `IMAGE_*`. SDK mặc định không thử lại, nên bật `HttpRetryOptions(attempts=3)`.
  - Claude gọi `client.beta.messages.create` với `output_config.effort`, `output_config.format` và `fallbacks="default"` (beta `server-side-fallback-2026-07-01`). Model dự phòng có thể khác, nên `model` luôn lấy từ phản hồi.
  - Schema gửi đi là tập con chung của hai bên (`strict_json_schema`): inline `$ref`, `additionalProperties: false`, bỏ ràng buộc số và chuỗi. Pydantic vẫn kiểm đủ ràng buộc khi nhận.
- **Bảng `ai.llm_calls`** thêm bốn cột so với ARCH: `provider`, `attempt`, `outcome` (`SUCCEEDED`, `INVALID_OUTPUT`, `TRUNCATED`, `REFUSED`, `API_ERROR`), `raw_stop_reason` (mã gốc của nhà cung cấp). Lỗi API sau khi SDK đã thử lại cũng ghi một dòng. Bảng chỉ ghi thêm: migration `0008` thu hồi `UPDATE`, `DELETE` của `ai_service`, để dịch vụ bị kiểm toán không sửa được nhật ký của chính nó. `cost_usd` tính theo bảng giá paid tier cấu hình được (`LLM_PRICING`), kể cả khi dev chạy free tier, để ước tính được chi phí một đợt thật. Giá mặc định đọc ngày 2026-10-20: `gemini-3.8-flash` 0,75 / 3,75 / 0,075 USD mỗi triệu token vào / ra / cache đọc (tăng gấp đôi từ 2027-01-01); `claude-opus-5-5` 4 / 20 / 0,20, cache ghi 5.
- **Log MinIO:** thư viện `minio` (SDK chính thức, tương thích S3), gọi qua `anyio.to_thread`. Bucket `llm-logs` do AI Service tạo ở lần ghi đầu, bật SSE-S3 vì log của `cv_parser` chứa CV đầy đủ. MinIO client chuyển từ US-2.4 (D33) sang US-2.2.
- **Ghi log:** kết quả sẽ được dùng thì bắt buộc có log; ghi không được thì lỗi lan lên và tầng job thử lại (PRD › guardrails yêu cầu truy vết lượt gọi ảnh hưởng điểm). Log của lần thử thất bại chỉ ghi theo kiểu best-effort, để sự cố MinIO/DB không che mất refusal hay lỗi gốc.
- **Prompt:** mỗi file `v<N>.md` có hai block Jinja `system` và `user`. Block `system` render với context rỗng nên không thể chứa dữ liệu thay đổi. Registry dùng cho production kiểm manifest lúc render, nên `LLM_PROMPT_VERSIONS` không chạy được bản nháp hay file đã bị sửa. Manifest băm sau khi đổi `\r\n` thành `\n`, cộng `.gitattributes` `eol=lf`, để Windows và CI cho cùng một băm.
- **Chưa nối `LLMClient` vào `worker.py`** và chưa thêm biến LLM vào compose: US-2.3 làm khi có handler thật đầu tiên.

**Rationale**: Hai nhà cung cấp sau một `Protocol` chứng minh được NFR-12 bằng test. Gemini có free tier cho giai đoạn phát triển; Claude giữ làm phương án thay thế. Logic quyết định nằm ở lõi chung nên chỉ test một lần với fixture; adapter chỉ cần test ánh xạ bằng SDK client giả.

**Alternatives considered**:
- **Chỉ Gemini / chỉ Claude:** người dùng chọn cài cả hai.
- **`gemini-4-argon`:** không có free tier, giá 2 / 10 USD (tăng gấp đôi từ 2026-12-01). **`gemini-2.5-flash`:** rẻ hơn nhưng là thế hệ cũ.
- **Interactions API của Gemini** (Google khuyên dùng cho dự án mới): mặc định lưu hội thoại phía server, phải tắt bằng `store=false`; `generate_content` vẫn được hỗ trợ đầy đủ. Xem lại nếu Google ngừng hỗ trợ `generate_content`.
- **`boto3` cho MinIO:** nặng hơn, không cần tính năng AWS riêng.
- **Mỗi adapter tự làm refusal, thử lại, ghi log:** loại vì phải test hai lần và dễ lệch nhau.

**Impact**:
- AD-10 (đổi nội dung, trỏ D34), ARCH › *Tech stack*, *Chọn model*, bảng effort, `ai.llm_calls`, kênh AI → LLM, *Ước tính chi phí*; PRD › guardrails (temperature) và Q8; AGENTS › *Gọi LLM*.
- Migration `0007` (`ai.llm_calls`; quyền đến từ `ALTER DEFAULT PRIVILEGES` của `0006`) và `0008` (viết tay: `ai_service` chỉ `SELECT`, `INSERT`).
- `ai-service`: `app/llm/`, `app/prompts/`, `evals/smoke_llm.py`; thư viện `google-genai` 2.28.0, `anthropic` 1.11.0, `jinja2` 3.1.6, `minio` 7.2.20.
- **Đồng ý điều khoản (D30):** `TERMS_V1` ghi tên Anthropic. Trước khi US-2.4 gửi CV thật cho Gemini phải có `TERMS_V2` ghi tên Google và sinh viên đồng ý lại. Free tier của Gemini có thể dùng dữ liệu để cải thiện sản phẩm, nên chỉ dùng free tier với dữ liệu giả; dữ liệu thật dùng paid tier.
- Story cần refresh khi bắt đầu: US-2.3, US-2.4 (điều khoản, PDF scan gửi thẳng cho model), US-2.5, US-3.2 (Batches và cache khác nhau giữa hai nhà cung cấp), US-4.1 (vòng lặp công cụ), US-4.2, US-4.4, US-4.8, US-6.3 (evals theo nhà cung cấp), US-6.6.

**Date**: 2026-10-20
**Version**: 0.8.0

### D35. Phân tích JD, xác nhận yêu cầu chuẩn hóa và phiên bản yêu cầu (US-2.3)

**Context**: Khi bắt đầu US-2.3, spec và code còn để mở các điểm sau:

1. **Đọc JD dạng file.** AC-2 và AC-12 cần trích văn bản PDF/DOCX và loại chữ ẩn bằng `ai-service/app/parsing/`, nhưng thư mục này thuộc US-2.4, vẫn đang `backlog`.
2. **Trạng thái phân tích.** D28 giữ JD ở `PENDING_HR_CONFIRMATION` từ lúc nộp, nên giao diện chỉ còn `requirements` null để đoán "đang phân tích". Không phân biệt được đang chạy với đã lỗi. Bảng `job_descriptions` cũng chưa có cột cho cờ chữ ẩn (subtask 2.3.3.3) hay model, prompt của đề xuất (Nguyên tắc 12).
3. **BR-18.** "Đã mở test" chưa định nghĩa bằng dữ liệu. Spec không nói phiên bản mới có phải qua Trung tâm duyệt lại không.
4. **Kiểm AC-7.** `apps/web` chưa có hạ tầng test component.
5. **View nguồn JD.** D33 để `core.v_ai_jd_source` chốt cùng story này.

**Decision** (người dùng chốt bốn mục đầu ngày 2026-10-21):

- **`parsing/` do US-2.3 dựng**, theo spec TASK-2.4.2: `pdf.py` (PyMuPDF 1.28.2), `docx.py` (python-docx 1.2.0), `hidden_text.py` (kiểu kết quả chung). US-2.4 dùng lại và chỉ thêm phần riêng của CV (PDF scan gửi thẳng cho model, tách PII). JD là PDF không có lớp chữ thì kết quả `FAILED` mã `JD_NO_TEXT`, HR nhập tay. PyMuPDF 2.0 ra ngày 2026-10-19, chưa đủ 2 tuần nên chưa dùng.
- **Bốn cột mới của `job_descriptions`:**
  - `analysis_status` (`PENDING`, `SUCCEEDED`, `FAILED`; null khi JD chưa từng được gửi phân tích);
  - `hidden_text_flag` (boolean, mặc định `false`, giống `cvs`);
  - `analysis_model`, `analysis_prompt_version` (model và prompt của đề xuất AI).
  - JD nộp trước 0.9.0 giữ `analysis_status` null. Giao diện coi như không có phân tích và cho HR nhập tay.
- **Luồng phân tích (sửa AC-1, AC-4, AC-6 theo D28):**
  - Nộp JD thì đặt `analysis_status = PENDING` trong cùng giao dịch với `DRAFT → PENDING_HR_CONFIRMATION`. Sau commit, một listener của `jd.submitted` gọi `AiGatewayService.dispatch('JD_ANALYZE', …)`. Gửi lỗi thì `analysis_status = FAILED` (mã `DISPATCH_FAILED`) và báo HR.
  - Kết quả `SUCCEEDED` chỉ lưu `requirements`, `position_group`, cờ chữ ẩn, model và prompt, **không chuyển trạng thái**. Kết quả `FAILED` đặt `analysis_status = FAILED`. Cả hai đều có audit (actor hệ thống) và thông báo cho HR của công ty.
  - Kết quả chỉ được áp dụng khi JD vẫn ở `PENDING_HR_CONFIRMATION`, đúng `version`, `analysis_status = PENDING` và `requirements` còn null. Ngược lại thì bỏ qua im lặng (AC-5). Nhờ vậy HR được bấm "Nhập tay" ngay khi đang phân tích: lưu của HR thắng, kết quả AI đến sau bị bỏ qua.
- **View `core.v_ai_jd_source (jd_id, version, title, raw_text, file_key)`**: chỉ JD ở `PENDING_HR_CONFIRMATION` với `analysis_status = PENDING` và `requirements` còn null, `security_barrier`, `SELECT` cho `ai_service`. HR nhập tay trong lúc đang phân tích thì `analysis_status` giữ `PENDING` nhưng JD rời view; giao diện coi "đang phân tích" là `PENDING` **và** chưa có `requirements`. AI Service tải file gốc từ bucket `jd-files` bằng tài khoản MinIO của nó.
- **Xác nhận:** `PUT /api/jds/{id}/requirements/confirm` (chỉ HR của công ty sở hữu, đợt ở `INTAKE`) ghi `requirements` rồi `transitionTo('PENDING_APPROVAL')` trong cùng giao dịch. Trung tâm đọc được, không xác nhận thay.
- **BR-18 (sửa AC-11):** sau khi JD đã `APPROVED` hoặc `RECRUITING` (đợt chưa `CLOSED`), **mọi** lần sửa yêu cầu, của HR hay của Trung tâm, đều tạo `version + 1`, bất kể đợt đã sang `TESTING` hay chưa. Phiên bản mới có hiệu lực ngay, không phải duyệt lại. Sau commit phát `jd.requirements.versioned` và báo Trung tâm. Yêu cầu cũ truy qua `before`/`after` của `audit_logs`. Hàm thuần `decideRequirementsEdit` (`company/domain/requirements-versioning.ts`) quyết định sửa tại chỗ, tạo phiên bản mới hay từ chối.
- **Hợp đồng `JdRequirements`** (`packages/shared/contracts/jd.ts`):
  - `level` ∈ `BASIC`, `INTERMEDIATE`, `ADVANCED` (Cơ bản / Khá / Thành thạo); `weight` là số tương đối, > 0 và ≤ 10;
  - `position_group` ∈ `BACKEND`, `FRONTEND`, `MOBILE`, `DATA_AI`, `TESTER_QA`, `BA`, `DEVOPS`, `OTHER` (`OTHER` thay cho "…" của PRD);
  - điều kiện cứng: `majors[]`, `min_study_year` (1–6), `min_gpa` (thang 4), `required_languages[]`; trường không có trong JD để null hoặc mảng rỗng.
  - Một kỹ năng không được nằm ở cả hai nhóm. Phía TS kiểm bằng `superRefine`, phía Python bằng lớp con của model sinh tự động trong agent, nên LLM trả sai thì `StructuredLLMClient` thử lại.
- **Nhãn tiếng Việt** của enum đặt ở `apps/web/src/features/jds/labels.ts`, theo quy ước có sẵn, không ở `packages/shared`.
- **AC-7** kiểm bằng Jest cho Zod schema ở `packages/shared` (form và API dùng chung schema) và kiểm tay trong trình duyệt. Không thêm Vitest hay Testing Library.
- **Compose:** `ai-worker` nhận `LLM_PROVIDER` (mặc định `fixture`, để stack chạy được khi chưa có key), `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `MINIO_*`. Ở chế độ `fixture`, JD thật không có fixture nên phân tích lỗi ngay (`LLM_FIXTURE_MISSING` là `PermanentError`, không thử lại vào DLQ) và HR nhập tay; muốn phân tích thật thì đặt `LLM_PROVIDER=gemini` và key.
- **Thông báo chỉ trong app** (PRD › *Thông báo* để story chốt kênh): `JD_REQUIREMENTS_READY`, `JD_ANALYSIS_FAILED` cho HR của công ty, `JD_REQUIREMENTS_VERSIONED` cho cán bộ Trung tâm. HR đang ở trang JD khi kết quả về sau vài giây; email ngay sau đó chỉ lặp lại. `notify` từ chối kênh EMAIL cho các loại này.
- **Gửi job lỗi:** broker không xác nhận thì phân tích `FAILED` ngay (`DISPATCH_FAILED`). Mỗi phiên bản chỉ gửi một lần, nên một kết quả `SUCCEEDED` đến sau `FAILED` là job broker thực ra đã nhận; nó vẫn được áp dụng nếu HR chưa nhập gì.
- **Cờ chữ ẩn khi job lỗi:** `AiJobError` thêm `hidden_text_detected` (tùy chọn, dùng chung cho CV). Handler gắn cờ vào exception (`flag_hidden_text`), `JobRunner` đưa nó vào kết quả `FAILED`, backend lưu `hidden_text_flag` cả khi không có đề xuất.
- **Chữ ẩn trong PDF** tính theo thứ tự vẽ (`get_bboxlog`): ngoài ba kiểu của US-2.4 AC-2 còn loại chữ bị hình đục vẽ sau che lấp; chữ trên ảnh không bị so màu. Chữ render mode "invisible" (lớp OCR) chưa bị coi là chữ ẩn.

**Rationale**:

- Dựng `parsing/` ngay thì story đóng đủ 12 AC mà không phải chờ làn khác. US-2.4 chưa bắt đầu nên không có xung đột.
- `analysis_status` cho giao diện đủ bốn trạng thái kể cả sau khi tải lại trang. Nó cũng làm điều kiện lọc của view nguồn, nên AI không đọc được JD đã xong hoặc HR đã nhập tay.
- Sau khi duyệt, ngân hàng câu hỏi (GĐ1 bước 5) và điểm phù hợp có thể đã dùng yêu cầu. Tạo phiên bản cho mọi lần sửa thì luôn truy được kết quả nào chấm theo yêu cầu nào. Không duyệt lại để không chặn sinh viên giữa đợt test.

**Alternatives considered**:
- **Chỉ làm JD nhập form, chờ US-2.4 cho phần file:** loại theo lựa chọn của người dùng; AC-12 sẽ để mở.
- **Chỉ thêm `hidden_text_flag`, suy trạng thái từ `requirements`:** loại vì không phân biệt được đang chạy với đã lỗi; model và prompt chỉ còn trong audit.
- **Theo chữ BR-18 (chỉ tạo phiên bản khi đợt từ `TESTING` trở đi):** loại vì sửa tại chỗ một JD đã duyệt làm mất dấu yêu cầu mà ngân hàng câu hỏi và điểm phù hợp đã dùng.
- **Phiên bản mới quay lại `PENDING_APPROVAL`:** loại vì cần cạnh trạng thái mới và JD rời view chấm điểm giữa đợt.
- **Vitest + Testing Library cho `apps/web`:** loại vì ngoài danh sách thư viện của ARCH; giữ cách kiểm tay như các story EPIC-1.

**Impact**:
- Migration `0009` (bốn cột, CHECK `analysis_status`, CHECK `notifications_type_check` thêm ba loại) và `0010` (viết tay: view `v_ai_jd_source`, quyền).
- `packages/shared`: `contracts/jd.ts`, `JdAnalyzeOutput`, `schemas/job-description.ts`, loại thông báo `JD_REQUIREMENTS_READY`, `JD_ANALYSIS_FAILED`, `JD_REQUIREMENTS_VERSIONED`, sự kiện SSE `jd.analysis`, mã lỗi `JD_REQUIREMENTS_NOT_EDITABLE`.
- `apps/api`: module `company` (dispatch, listener kết quả, ba endpoint yêu cầu), `iam` (`UserDirectory` tìm HR của công ty và cán bộ Trung tâm), `notification` (template).
- `ai-service`: `app/parsing/`, `app/agents/jd_analyzer/`, prompt `jd_analyzer/v1`, nối `LLMClient` vào `worker.py`; thư viện PyMuPDF 1.28.2, python-docx 1.2.0.
- ARCH › *Các bảng chính* (`job_descriptions`), *Phân vùng schema* (view), *API architecture*; story US-2.4 (refresh: `parsing/` đã có).

**Date**: 2026-10-21
**Version**: 0.9.0

### D36. Ma trận S_cv đọc theo hai chiều: danh sách JD gợi ý cho sinh viên, CV phù hợp theo JD cho Trung tâm

**Context**: PRD › GĐ3 chấm mọi cặp (SV, JD) nhưng chỉ dùng kết quả theo một chiều: shortlist của từng sinh viên. Report thiết kế bài test ngày 25/10 ([reports/2026-10-15-exam-generation-design.md](../reports/2026-10-15-exam-generation-design.md), mục 1.1 và 15.5) chỉ ra rằng cùng kết quả đó còn trả lời được câu hỏi "JD này có những CV nào phù hợp". Theo PRD, Trung tâm chỉ biết JD thiếu hồ sơ sau khi khóa nguyện vọng (biện pháp 4 của *Cơ chế hỗ trợ JD ít hồ sơ*, US-3.4 AC-5). Report đề xuất thêm chiều đọc theo JD ở điểm cần chốt số 12.

**Decision** (người dùng chốt ngày 2026-10-25):

- Kết quả chấm phù hợp của cả đợt là **ma trận S_cv**, đọc theo hai chiều (PRD › GĐ3 bước 2, 3, 5).
- **Theo sinh viên:** shortlist chính là **danh sách JD gợi ý** cho sinh viên. Định nghĩa giữ nguyên (đủ điều kiện cứng, S_cv ≥ θ_cv, sắp giảm dần theo S_cv). Danh sách do code lập; AI không chọn, không xếp hạng JD. Giao diện sinh viên gọi là "danh sách JD gợi ý"; code giữ tên `shortlist`.
- **Theo JD:** Cán bộ Trung tâm xem với mỗi JD các CV phù hợp (đạt điều kiện cứng, S_cv ≥ θ_cv) sắp theo S_cv, tỷ lệ CV phù hợp / chỉ tiêu và số cặp bị lọc sơ bộ (UC-09, FR-38, P1).
- **Cảnh báo sớm:** ngay khi lượt chấm phù hợp xong, Trung tâm được báo các JD có tỷ lệ CV phù hợp / chỉ tiêu < 1, trước khi mở chọn NV. Đây là biện pháp 5 của *Cơ chế hỗ trợ JD ít hồ sơ*. Biện pháp 1–4 giữ số cũ vì US-3.4 và US-6.1 tham chiếu theo số.
- **HR không xem** danh sách hay số lượng này trước khi có đề cử (BR-11). Trung tâm tự quyết định có liên hệ doanh nghiệp hay không.
- Số liệu đếm từ `match_results`, không gọi LLM (ARCH › *Những chỗ cố ý KHÔNG dùng LLM*).

**Rationale**:

- Dữ liệu đã có sẵn sau GĐ3, nên chiều đọc theo JD không tốn thêm lượt gọi LLM nào.
- JD ít CV phù hợp thì cũng khó đủ NV. Biết từ sau GĐ3 cho Trung tâm thời gian đề nghị doanh nghiệp nới yêu cầu trước khi sinh viên chọn NV; nếu chờ tới sau khi khóa NV thì sinh viên đã chọn xong và phải đợi vòng bổ sung.
- Cặp bị lọc sơ bộ không có S_cv. Đếm riêng thì Trung tâm không hiểu nhầm là các CV đó đã chấm và không đạt.

**Alternatives considered**:
- **Chỉ dùng biện pháp 4 (NV / chỉ tiêu sau GĐ4):** loại vì tín hiệu đến muộn, khi sinh viên đã chọn xong nguyện vọng.
- **Cho HR xem số CV phù hợp (không kèm danh tính):** loại vì BR-11 chỉ cho HR thấy hồ sơ được đề cử, và con số này có thể làm doanh nghiệp đổi yêu cầu theo tập sinh viên cụ thể. Trung tâm là bên liên hệ.
- **Đánh số lại biện pháp theo thứ tự thời gian:** loại vì làm sai tham chiếu "biện pháp 1", "biện pháp 4" trong US-3.4 và US-6.1.

**Impact**:
- PRD: GĐ3 bước 2–5, sơ đồ *Luồng nghiệp vụ tổng thể*, bảng GĐ, UC-09 (mới), UC-12, Personas, *Cơ chế hỗ trợ JD ít hồ sơ* biện pháp 5, FR-38 (mới, EPIC-3), Glossary, EPIC-3 Goal và dải FR.
- Chưa có story nào nhận FR-38. Đề xuất: cảnh báo sớm thêm vào US-3.4 (dùng cơ chế thông báo của AC-5), màn xem theo JD thêm vào dashboard US-6.1. Hai story này thêm khối *Story refresh* và `FR-38` vào `prd_ref` khi bắt đầu.
- ARCH › *Màn hình theo cổng* (cổng Trung tâm) cần thêm màn xem theo JD khi làm story tương ứng.
- Report thiết kế bài test: điểm cần chốt số 12 chuyển thành đã chốt.

**Date**: 2026-10-25
**Version**: 0.9.0

### D37. Phân tích CV: trạng thái lỗi phân tích, cột `pii` mã hóa, che PII bằng code, PDF scan gửi nguyên file, `TERMS_V2` (US-2.4)

**Context**: Khi bắt đầu US-2.4, spec và code còn để mở các điểm sau:

1. **Điều khoản.** D34 yêu cầu `TERMS_V2` ghi tên Google trước khi gửi CV thật cho Gemini, nhưng chưa story nào nhận việc này.
2. **AC-11.** "Trung tâm thấy CV trong danh sách cần xử lý", nhưng chưa có màn hay endpoint nào cho Trung tâm xem CV.
3. **Văn bản CV cho US-3.2.** Story đề xuất đặt ở `profile_masked.source_text`, chốt cùng US-3.2.
4. **Che email, SĐT bằng regex.** ARCH ghi "có thể"; story đề xuất cấu hình, mặc định bật, và ghi phải hỏi.
5. **Trạng thái CV.** Bảng chuyển trạng thái chưa có trạng thái lỗi phân tích. Bảng `cvs` chưa có cột `pii`.
6. **Gửi PDF scan.** `LLMRequest` chỉ chứa văn bản, chưa gửi được tài liệu cho Gemini hay Claude.
7. **Vòng import.** `notification` và `iam` import `student`, nên `student` không gọi được `NotificationService` như `company` làm với JD.

**Decision** (người dùng chốt bốn mục đầu ngày 2026-10-25):

- **`TERMS_V2`** ghi tên Google (Gemini API, gói trả phí, lưu 55 ngày để chống lạm dụng, không dùng để cải thiện sản phẩm) và Anthropic (như v1). Nó cũng nói rõ bản scan được gửi nguyên file mà không che trước, và log gửi AI nằm trong thời hạn lưu 12 tháng. `CURRENT_TERMS = TERMS_V2`: sinh viên chỉ đồng ý v1 thì nộp CV nhận 403 `CONSENT_REQUIRED` và phải đồng ý lại. Người dùng duyệt nội dung trước khi commit.
- **AC-11:** endpoint `GET /api/cvs` (CENTER, ADMIN; lọc theo `campaignId`, `attention`) và trang tối giản "CV cần xử lý" ở cổng Trung tâm. Trang liệt kê CV đang dùng bị lỗi phân tích hoặc có chữ ẩn, cùng thông báo trong app `CV_NEEDS_ATTENTION`. Không có nút "Phân tích lại".
- **Văn bản CV đã che** lưu ở cột riêng `cvs.masked_text`, view `core.v_ai_cv_profile_masked` thêm cột này ở cuối. `profile_masked` giữ đúng hình dạng `CvProfile`. Bản scan có `masked_text = null`.
- **Che email và SĐT bằng regex** trước khi gửi LLM: mặc định bật, tắt bằng `CV_MASK_CONTACTS=false` của `ai-worker`. LLM chỉ thấy `[EMAIL_1]`, `[PHONE_1]`; giá trị gốc vào thẳng `pii`.
- **Trạng thái `ANALYSIS_FAILED`** (nhãn "Lỗi phân tích"):
  - `PENDING_ANALYSIS → PENDING_CONFIRMATION | ANALYSIS_FAILED`;
  - `ANALYSIS_FAILED → PENDING_ANALYSIS`, chỉ do lệnh chạy bù `--retry-failed`;
  - `ANALYSIS_FAILED → PENDING_CONFIRMATION`, khi kết quả đến sau một lần gửi bị báo lỗi nhưng broker thực ra đã nhận (như JD ở D35).
  - Kết quả chỉ áp dụng khi CV còn `active`, đúng `version` và ở `PENDING_ANALYSIS` (hoặc `ANALYSIS_FAILED` với kết quả thành công). Hàm thuần `decideCvParseResult` quyết định.
  - `PARTIAL` và output không khớp CV đều coi là lỗi (`INVALID_RESULT`). Gửi job không được thì lỗi ngay (`DISPATCH_FAILED`).
- **Cột mới của `cvs`** (migration `0011`, `0012`):
  - `pii bytea`, ghi bằng `pgp_sym_encrypt(json, PII_ENCRYPTION_KEY)`; khóa truyền dạng tham số, không nằm trong SQL;
  - `masked_text`;
  - `analysis_source` (`TEXT_PDF`, `SCANNED_PDF`, `DOCX`), `analysis_model`, `analysis_prompt_version`, `analysis_error_code`.
  - CHECK: model và prompt cùng null hoặc cùng có; CV ở `PENDING_CONFIRMATION`/`CONFIRMED` phải có `profile`, `profile_masked`, `pii`, model và nguồn; CV ở `ANALYSIS_FAILED` phải có mã lỗi.
  - Mã lỗi không bị xóa khi một kết quả sau đó thành công: CHECK không cho thứ tự ghi nào khác. API chỉ trả mã lỗi khi CV đang `ANALYSIS_FAILED`.
- **`PII_ENCRYPTION_KEY`** chỉ có ở API, bắt buộc, tối thiểu 32 ký tự, từ chối giá trị bắt đầu bằng `change-me`. AI Service không bao giờ thấy khóa.
- **Thông báo** qua sự kiện nội bộ `cv.analysis.settled`, phát sau commit. Listener ở module `notification` (`CvAnalysisListener`) gửi:
  - `CV_PROFILE_READY` cho sinh viên, chỉ trong app;
  - `CV_ANALYSIS_FAILED` cho sinh viên, trong app và email (sinh viên có thể đã rời trang, mà vẫn phải tải lại trước hạn);
  - `CV_NEEDS_ATTENTION` cho Trung tâm, chỉ trong app, khi phân tích lỗi hoặc file có chữ ẩn;
  - sự kiện SSE `cv.analysis` `{ cvId, status }` cho sinh viên.
  - Khác JD (D35): thông báo ghi sau commit, không cùng giao dịch. `dedupeKey` gồm CV và `job_id`.
- **PDF scan:**
  - Coi là scan khi PDF không có lớp chữ, hoặc có ảnh mà chữ thấy được ít hơn 100 ký tự (bắt được bản scan có watermark chữ của app quét).
  - Nguyên file PDF được gửi cho model: Gemini nhận `inline_data` (không qua Files API, vốn giữ file 48 giờ), Claude nhận `document` block base64 đặt trước khối text. Không chạy OCR riêng.
  - PDF giống scan mà có chữ ẩn thì lỗi `CV_SCAN_WITH_HIDDEN_TEXT`, vì model sẽ đọc cả chữ ẩn.
  - DOCX không gửi nguyên file được: DOCX không có chữ thì lỗi `CV_NO_TEXT`.
- **Tài liệu đính kèm trong `LLMClient`:** `generate(..., documents=[Document(media_type, data)])`. `LLMRequest` chỉ giữ tham chiếu (`sha256`, `size`), `build_params` đặt chỗ giữ tham chiếu, `send(params, documents)` mới gắn bytes. Log `llm-logs` không chép file, vì file gốc đã nằm ở `cv-files`. Khóa fixture chỉ thêm `documents` khi có tài liệu, nên fixture cũ giữ nguyên khóa.
- **Che PII bằng code** (`ai-service/app/parsing/pii.py`, hàm thuần):
  - So khớp không phân biệt hoa thường và dấu. Tên thử cả hai thứ tự và dạng viết liền (`nguyenvanan`). SĐT so theo dãy số. Ngày sinh thử nhiều định dạng.
  - Email, SĐT, link bất kỳ cũng bị che bằng regex.
  - Dòng có nhãn cá nhân ("Giới tính: …", "Quê quán: …") mất giá trị.
  - Giới tính và tình trạng hôn nhân là enum trong `pii`, không bao giờ thay theo chuỗi: thay "Nam" sẽ hỏng "Việt Nam".
  - Kiểm lần cuối: còn sót giá trị nào thì job lỗi `PII_MASK_FAILED`; thông điệp chỉ nêu loại, không nêu giá trị.
  - Bộ ca dùng chung `packages/shared/contracts/fixtures/pii-mask-cases.json`, để US-2.6 dựng lại `profile_masked` sau khi sinh viên sửa hồ sơ.
  - `has_photo` của CV có chữ lấy theo ảnh nhúng trong file. Logo cũng tính là ảnh, nhưng cờ này chỉ nằm trong `pii` và không được chấm.
- **Chỗ cắm cho US-2.5:** `CvParser(profile_steps=[...])`, chạy trên hồ sơ chưa che, trước bước che.
- **Handler giả của CV bị bỏ.** Marker `__fake__/retryable`, `__fake__/permanent` chỉ còn khi `AI_FAKE_FILE_KEYS=true` (test trọn vòng đặt, compose không đặt). Test trọn vòng chạy parser thật trên CV mẫu với fixture LLM chép vào container.
- **Lệnh chạy bù** `pnpm --filter @srm/api cv:redispatch [--campaign N] [--retry-failed]` gửi job cho CV đang chờ (kể cả CV nộp trước 0.10.0) và, với `--retry-failed`, CV lỗi.

**Rationale**:

- Có trạng thái lỗi riêng thì sinh viên biết phải tải lại, còn Trung tâm lọc được CV cần xử lý. Đọc `analysis_error_code` khi CV vẫn `PENDING_ANALYSIS` thì giao diện không phân biệt được đang chạy với đã lỗi.
- Che PII bằng code tất định và kiểm thử được. BR-03 là quy tắc công bằng, không giao cho LLM.
- Gửi tham chiếu thay cho bytes giữ log nhỏ và tránh nhân bản CV sang một nơi lưu nữa.
- Phát sự kiện thay vì gọi `NotificationService` tránh vòng import `student ↔ notification`, theo mẫu `CampaignOpenedListener`.

**Alternatives considered**:
- **`source_text` trong `profile_masked`:** loại vì `profile_masked` không còn đúng hình dạng `CvProfile`, và US-2.6 phải tách ra khi sinh viên sửa hồ sơ.
- **Giữ CV ở `PENDING_ANALYSIS` kèm cột lỗi:** loại vì lý do trên.
- **OCR riêng cho bản scan để che trước:** loại vì ngoài danh sách thư viện của ARCH; ARCH cho phép ngoại lệ ở bước phân tích CV.
- **Che giới tính theo chuỗi:** loại vì làm hỏng tên địa danh.
- **Nút "Phân tích lại" trên trang Trung tâm:** để sau; lệnh chạy bù đủ cho đồ án.

**Impact**:
- Migration `0011` (cột, CHECK `cvs_*`, CHECK `notifications_type_check` thêm ba loại) và `0012` (viết tay: view `v_ai_cv_profile_masked` thêm `masked_text`).
- `packages/shared`: `contracts/cv.ts` (`CvProfile`, `CvPii`, `CvExtraction`, `CvSource`), `CvParseOutput` đầy đủ, `states/cv.ts`, `schemas/cv.ts` (danh sách của Trung tâm), ba loại thông báo, sự kiện SSE `cv.analysis`, `consent/terms-v2.ts`, `contracts/fixtures/pii-mask-cases.json`.
- `ai-service`: `app/agents/cv_parser/`, `app/parsing/pii.py`, DOCX đọc header và footer, `ExtractedText.has_images`, tài liệu đính kèm ở cả ba provider, prompt `cv_parser/v1`, `CV_MASK_CONTACTS`, `AI_FAKE_FILE_KEYS`, `evals/perf_cv_parse.py`, `smoke_llm.py --cv`.
- `apps/api`: module `student` (`CvAnalysisService`, `GET /api/cvs`, lệnh `cv:redispatch`), `notification` (`CvAnalysisListener`, template email `CV_ANALYSIS_FAILED`), biến `PII_ENCRYPTION_KEY`.
- `apps/web`: trạng thái phân tích ở trang "Hồ sơ" (SSE), trang "CV cần xử lý".
- ARCH › *Pipeline CV Parser*, *Các bảng chính*, *Phân vùng schema*, *Security architecture*, *API architecture*; DESIGN §6 (badge "Lỗi phân tích"); DEPLOY, SETUP (biến mới).

**Date**: 2026-10-25
**Version**: 0.10.0

### D38. Giới hạn chi phí context của agent: ba phiên mỗi story, mục lục CONTEXT/LESSONS, AGENTS.md không giữ trạng thái

**Context**: Đo 23 phiên Claude Code của dự án (2026-10-04 → 2026-10-25). Mỗi phiên làm một story có 450–754 lượt, context trung bình 295–442 nghìn token mỗi lượt (đỉnh 506–742 nghìn), đọc lại 143–272 triệu token từ cache; ba subagent Explore lúc lập kế hoạch tốn thêm 2–38 triệu. Chi phí xấp xỉ số lượt × cỡ context. Context cố định lúc mở phiên khoảng 50 nghìn token, trong đó `AGENTS.md` 21 KB với đoạn *Trạng thái* dài thêm sau mỗi story. `CONTEXT.md` (120 KB) bị đọc 31 lần, `LESSONS.md` 17 lần; file story nặng 30–40 KB.

**Decision**:
- Mỗi story chạy ba phiên, gõ `/clear` giữa các phiên: (1) Plan; (2) Execute + Self-verify; (3) Review + Doc/Version gate + Commit. File story và `.active-context.md` mang trạng thái sang phiên sau. Context vượt khoảng 200 nghìn token thì `/compact`.
- Không chạy subagent Explore theo mặc định; dùng tối đa một subagent khi story chạm vùng code chưa có mẫu.
- `AGENTS.md` không ghi trạng thái từng story (đã có ở `STATUS.md`, CHANGELOG, `.active-context.md`). Các mẫu dùng lại chuyển sang mục *Mẫu có sẵn*.
- `CONTEXT.md` và `LESSONS.md` có mục lục ở đầu file; agent đọc mục lục rồi chỉ đọc mục liên quan.
- File story giữ dưới khoảng 15 KB.
- `.active-context.md`: *Recent Decisions*, *Recent Lessons* giữ 5 mục gần nhất, mỗi mục một cụm từ, như template Active Context của koni-docs.

**Rationale**: Giảm cả hai thừa số mà không bỏ bước nào của vòng koni; nguồn sự thật vẫn nằm trong `docs/`. Ước tính context trung bình mỗi lượt giảm 2–3 lần.

**Alternatives considered**:
- Chuyển D1–D30 sang file lưu trữ — loại vì trái RULE-7 (không xóa mục cũ) và làm hỏng các liên kết "CONTEXT D-N" trong tài liệu.
- Bỏ bớt bước Doc/Version gate — loại; giữ quy trình, chỉ giảm lượng đọc.

**Impact**: `AGENTS.md` (*Trạng thái*, *Mẫu có sẵn*, *Đọc gì trước khi làm*, *Quy trình làm việc*), mục lục trong `CONTEXT.md` và `LESSONS.md`, `.active-context.example.md`. LESSONS §15 bổ sung cấu hình Jest và WSL.

**Date**: 2026-10-25
**Version**: 0.10.0

### D39. Danh mục kỹ năng và embedding: module `skills`, `EMBEDDING_PROVIDER`, hợp đồng kỹ năng, index HNSW một phần (US-2.5)

**Context**: Story US-2.5 còn để mở các điểm sau:

1. Danh mục kỹ năng thuộc module nào. Story đề xuất `matching`, nhưng cả `student` (US-2.6) và form JD đều cần tra cứu.
2. Compose có tải sẵn `BAAI/bge-m3` hay không. Mô hình nặng khoảng 2,3 GB và cần 2,5–3 GB RAM cho mỗi bản sao worker.
3. `group` của kỹ năng là chuỗi tự do hay enum.
4. Nơi đặt kết quả chuẩn hóa trong hợp đồng mà không làm đổi khóa fixture LLM của US-2.4.
5. Các bước 6 và 8 của ARCH › *Pipeline CV Parser* cắm vào đâu (D37 để chỗ `profile_steps`).

**Decision** (người dùng chốt ba mục đầu ngày 2026-10-26):

- **Module NestJS mới `skills`.** Module này sở hữu `core.skills` và export `SkillCatalogService.search` cho US-2.6, form JD và matching. Nó nghe thẳng `ai.result.CV_PARSE` / `ai.result.JD_ANALYZE` để tạo dòng chờ duyệt. Cách này giao ít nhất một lần và có thử lại.
- **`EMBEDDING_PROVIDER = bge-m3 | hashing`.**
  - Compose mặc định `hashing`: embedding giả, tất định (trigram ký tự băm vào 1024 chiều, model `hashing-v1`), giống `LLM_PROVIDER=fixture`. Worker ghi WARNING khi chạy chế độ này.
  - Muốn dùng `bge-m3` thì đặt biến này trong `deploy/.env` rồi `up --build`. Compose truyền cùng một biến làm build arg của image và env của `ai-worker`. Image mặc định không cài `torch` và `sentence-transformers`. Image `bge-m3` thêm một layer torch bản CPU rồi cài extra `embedding`, đặt `HF_HOME=/models` trên volume `hf-models`. Lần đầu tải khoảng 4,5 GB, vì transformers tải trọng số cả dạng `.bin` lẫn safetensors. Chọn `bge-m3` trên image chưa có extra thì worker dừng lúc khởi động và báo cần build lại.
  - `Settings` của ai-service mặc định `bge-m3` (AD-11). Compose và test e2e đặt `hashing`. Image đặt `ENV EMBEDDING_PROVIDER` theo build arg, nên chạy image mà không truyền biến vẫn dùng đúng thứ đã cài.
  - Mô hình nạp một lần cho mỗi tiến trình trong `on_startup`, rồi tính embedding cho các kỹ năng của danh mục còn thiếu. Ghim `sentence-transformers==6.1.0` (extra `embedding`), `pgvector==0.5.1`, `torch==2.14.1` bản CPU.
- **`group` là enum** `SKILL_GROUPS`: LANGUAGE, FRAMEWORK, DATABASE, CLOUD_DEVOPS, TOOL, TESTING, DATA_AI, METHODOLOGY, SOFT_SKILL, OTHER. DB có CHECK; kỹ năng `APPROVED` bắt buộc có `group`.
- **Khóa so tên** `skillMatchKey` (TS) và `skill_match_key` (Python): NFKC, chữ thường, bỏ khoảng trắng, `.`, `-`, `_`, `/`; giữ `+` và `#`. Bộ ca dùng chung nằm ở `contracts/fixtures/skill-key-cases.json`. Chuẩn hóa theo thứ tự: khớp key với tên chuẩn hoặc alias (`ALIAS`), rồi cosine ≥ `SKILL_MATCH_THRESHOLD` (mặc định 0,85) với kỹ năng gần nhất (`EMBEDDING`), còn lại là `NEW`. Embedding của kỹ năng tính từ `canonical_name`, khóa theo `row_version`. Khi tính bù, vector kỹ năng của phiên bản cũ và của model khác bị xóa, vì index HNSW lọc sau khi quét (LESSONS §24).
- **Hợp đồng**:
  - Phía LLM: `CvExtractedSkill`, `CvExtractedProfile`, giữ nguyên field và mô tả nên schema gửi LLM và khóa fixture không đổi.
  - Phía lưu: `CvSkill = { name, canonical_name | null, match }`, có refine `canonical_name` null đúng khi `NEW`.
  - `CvParseOutput.new_skills` lấy từ `profile_masked` và bỏ tên chứa token che PII (BR-03).
  - JD không thêm field: tên khớp được thay bằng tên chuẩn ngay trong `requirements`. Hai tên cùng quy về một kỹ năng thì giữ bản `must_have`; trong cùng nhóm, giữ bản có trọng số cao hơn. `JdAnalyzeOutput.new_skills` thêm vào output.
  - Quy tắc kỹ năng trùng của `JdRequirements` (`skillKey`, dùng ở form HR và API) so bằng `skillMatchKey`, nên HR không nhập được "React" cùng "React.js".
  - Hồ sơ phân tích trước 0.11.0: migration 0018 thêm `canonical_name: null, match: NEW` vào từng kỹ năng. Các tên này không vào hàng chờ duyệt, và CV không có embedding hồ sơ; US-3.2 tính embedding từ hồ sơ đã xác nhận.
- **Thay `CvParser(profile_steps=…)`** bằng hai phụ thuộc bắt buộc: `skills: SkillNormalizer` (bước 6, trước khi che PII) và `embeddings: ProfileEmbeddings` (bước 8, sau khi kiểm che PII, từ `profile_masked`, upsert `(cv, cv_id, cv_version, model)`). `JdAnalyzer` nhận `skills`.
- **Bảng `core.skills`**:
  - cột `canonical_name` UNIQUE, `name_key` UNIQUE, `aliases text[]`, `alias_keys text[]` (cùng số phần tử, index GIN), `group`, `status`, `merged_into_id`, `suggestion` + `suggestion_model` + `suggestion_prompt_version` (CHECK cùng null);
  - CHECK `MERGED` ⇒ có `merged_into_id`. Chỉ một chiều, vì chỉ `transitionTo` được ghi `status` (AD-8): khi gộp, backend ghi đích trước rồi mới chuyển trạng thái.

  Kỹ năng chờ duyệt giữ tên như CV/JD viết trong `canonical_name`. Dòng đã duyệt, gộp hay từ chối vẫn được giữ, nên key của nó chặn việc đưa cùng tên vào hàng chờ lần nữa. Máy trạng thái `skillMachine`: `PENDING → APPROVED | REJECTED | MERGED`, ba trạng thái sau là trạng thái cuối. Seed 174 kỹ năng IT kèm alias, không có hai cách viết nào của hai kỹ năng khác nhau trùng key.
- **View**: `core.v_ai_skills` (`APPROVED`: `skill_id, canonical_name, aliases, group, version`) và `core.v_ai_skill_candidates` (`PENDING`: `skill_id, name`).
- **`ai.embeddings`**:
  - unique `(owner_type, owner_id, version, model)`, `owner_type` viết thường theo ARCH;
  - mỗi `owner_type` một index HNSW `vector_cosine_ops` một phần;
  - truy vấn ghi `owner_type` dạng hằng trong SQL để planner chọn đúng index.

  Một index chung cộng bộ lọc sẽ quét vector CV trước và có thể trả thiếu kỹ năng. Adapter là `pgvector.psycopg`, đăng ký trong `configure` của pool.
- **Job gợi ý**: kiểu `SKILL_NORMALIZE`, queue `ai.skills.normalize`, agent `skill_normalizer` (`effort: low`), payload `{ job_id, skill_ids[1..50] }`.
  - Agent chỉ đọc các kỹ năng của job còn `PENDING`. Nếu không còn kỹ năng nào thì job FAILED với mã `SKILLS_NOT_PENDING`; backend bỏ qua kết quả FAILED.
  - Guardrail: bỏ gợi ý cho `skill_id` ngoài job và gợi ý lặp lại; `similar_skills` chỉ giữ tên có trong danh mục, ghi theo tên chuẩn. Tên chuẩn LLM gợi ý mà trùng key một kỹ năng có sẵn thì kỹ năng đó được thêm vào `similar_skills`.
- **Backend** (module `skills`):
  - Listener `ai.result.CV_PARSE` / `JD_ANALYZE` bỏ qua tên mà một kỹ năng đã duyệt khớp theo tên hoặc alias, kể cả alias vừa sinh ra do đổi tên lúc duyệt. Lý do: AI Service có thể đọc danh mục trước quyết định mới nhất của ADMIN, và `ON CONFLICT (name_key)` không bắt được alias.
  - Gợi ý: chỉ lưu gợi ý đầu tiên của một kỹ năng còn `PENDING`, không tăng `row_version` (gợi ý chỉ để tham khảo, ADMIN không sửa). Audit `SKILL_PROPOSED`, `SKILL_SUGGESTED` với actor SYSTEM.
  - Không hai kỹ năng nào khớp cùng một key, gồm tên của mọi dòng và alias của kỹ năng đã duyệt. API kiểm điều này bằng TypeScript (`domain/catalogue-keys.ts`), dưới khóa advisory `SKILL_CATALOGUE` (2505): ADMIN giữ khóa exclusive, listener giữ khóa shared. Vi phạm trả 409 `SKILL_NAME_TAKEN`, `details` nêu kỹ năng đang giữ key để ADMIN gộp vào. DB giữ cùng quy tắc (Invariant 11): backend ghi `alias_keys` cùng `aliases`, như `name_key`, và trigger `skills_keys_distinct` (migration 0017) kiểm lúc commit, vì khi gộp, alias của đích được ghi trước `merged_into_id` của nguồn.
  - Duyệt có đổi tên sang key khác thì tên CV/JD viết thành alias. Gộp chỉ nhận đích `APPROVED`, khác chính nó; sai thì trả 422 `TRANSITION_CONDITION_FAILED` / `MERGE_TARGET_NOT_APPROVED`. Đích nhận thêm alias thì tăng `row_version`.
  - `GET /api/skills?query=` so key của câu truy vấn với `name_key` và `alias_keys`. Migration 0016 tính `alias_keys` cho seed bằng SQL tương đương `skillMatchKey`; test kiểm nó khớp kết quả của TypeScript.
  - `GET /api/admin/skills`: kỹ năng chờ duyệt xếp cũ trước như hàng đợi; trạng thái khác xếp quyết định mới trước. Tối đa 500 dòng, chưa phân trang.

- **Ngưỡng 0,85, đo với bge-m3 thật** (test `@slow`, ngày 2026-10-26, 6 cặp cùng kỹ năng và 6 cặp khác kỹ năng trông giống nhau):
  - Không cặp khác kỹ năng nào đạt 0,85. Cao nhất là "Kiểm thử tự động" ~ "Kiểm thử thủ công" (0,847), rồi React ~ React Native (0,807).
  - Biến thể cách viết thì khớp: ReactJS ~ React 0,857, Node JS ~ Node.js 0,903, Postgres SQL ~ PostgreSQL 0,910.
  - Tên Việt ~ Anh và tên có thêm chữ thì không khớp (0,63–0,70; VD "Học máy" ~ "Machine Learning" 0,664).

  Giữ 0,85: hạ xuống 0,80 thì React Native bị gán vào React. Tên không khớp thành kỹ năng mới. ADMIN gộp một lần, từ đó alias bắt được tên này (AC-10).
- **Web** (`/admin/skills`, chỉ ADMIN):
  - Bảng lọc theo trạng thái, mặc định "Chờ duyệt". Duyệt, gộp và từ chối đều dùng `AlertDialog`, vì cả ba đều không hoàn tác được.
  - Dialog duyệt điền sẵn gợi ý của AI. Gặp `SKILL_NAME_TAKEN` mà kỹ năng giữ tên đã được duyệt, dialog cho gộp luôn vào kỹ năng đó.
  - Ô chọn đích khi gộp là ô tìm (`GET /api/skills`, tối đa 6 kết quả) cùng `RadioGroup`. Không dùng combobox của shadcn vì nó cần `@base-ui/react`, nằm ngoài stack.

**Rationale**: Một module sở hữu danh mục tránh vòng import giữa `student`, `company` và `matching`. Chế độ `hashing` giữ được việc khởi động bằng một lệnh `compose up` trên máy dev, như LLM fixture. Enum `group` giúp lọc và hiển thị nhãn tiếng Việt, và ép structured output. Tách hợp đồng phía LLM với phía lưu giữ được các fixture đã ghi của US-2.4. Lấy `new_skills` từ bản đã che thì tên ghi vào `core.skills` và gửi LLM không mang dữ liệu cá nhân.

**Alternatives considered**:
- Đặt danh mục trong `matching` — loại vì `student` và `company` sẽ phải import `matching`.
- Compose tải bge-m3 mặc định — loại vì máy dev cần thêm khoảng 3 GB RAM và lần đầu phải tải khoảng 4,5 GB.
- `group` là chuỗi tự do — loại vì khó lọc và LLM có thể sinh nhóm lạ.
- Thêm field `canonical_name` vào `JdSkillRequirement` — loại vì sửa form HR của US-2.3. Thay tên ngay trong `requirements` là đủ, HR vẫn sửa được.
- Một index HNSW chung cho mọi `owner_type` — loại vì bẫy lọc nói ở trên.
- Bảng khóa riêng (`key` là khóa chính, trỏ tới kỹ năng) để giữ mỗi key cho một kỹ năng — loại vì phải viết lại listener và seed. Trigger trên `alias_keys` đủ cho danh mục vài trăm dòng.

**Impact**:
- `packages/shared`: `contracts/{skills,cv,envelope,jobs,queues}.ts`, `states/skill.ts`.
- `apps/api`: migration 0013–0018, `db/schema/{skills,ai}.ts`, `skillLifecycle`, `AI_RESULT_EVENTS.SKILL_NORMALIZE`, module `modules/skills/`, lỗi `SKILL_NAME_TAKEN`, khóa advisory `SKILL_CATALOGUE`.
- `ai-service`: `app/embedding/`, `app/agents/skill_normalizer/`, prompt `skill_normalizer/v1`, CV Parser, JD Analyzer, `worker.py`, `config.py`.
- `apps/web`: `features/center/skills/`, route `/admin/skills`, primitive `radio-group` (DESIGN §6).
- Triển khai: `ai-service/Dockerfile` (`ARG EMBEDDING_PROVIDER`), compose (`EMBEDDING_PROVIDER`, `SKILL_MATCH_THRESHOLD`, volume `hf-models`), `deploy/.env.example`, `DEPLOY.md`, `docs/SETUP.md`.
- ARCH: *Tech stack*, *Các module*, *Pipeline từng agent*, *Các bảng chính*, *Hàng đợi*, *API architecture*, *Docker Compose*; AGENTS *Mẫu có sẵn*.

**Date**: 2026-10-26 (bổ sung sau review 2026-10-27)
**Version**: 0.11.0
