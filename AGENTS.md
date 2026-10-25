# AGENTS.md — Smart Recruit Match

> **File này là nguồn chỉ dẫn chính cho mọi agent AI trong dự án** (Claude Code, Codex, Cursor, Gemini…). `CLAUDE.md` chỉ import file này và thêm khối cấu hình koni-docs. Hai file mâu thuẫn thì theo file này.

## Dự án

Hệ thống giúp Trung tâm quan hệ doanh nghiệp của trường ghép sinh viên thực tập với doanh nghiệp. LLM phân tích CV/JD, chấm độ phù hợp, sinh đề và chấm bài test. Thuật toán Deferred Acceptance phân bổ sinh viên theo chỉ tiêu. HR duyệt hồ sơ và phỏng vấn. Đây là đồ án tốt nghiệp: tính đúng, giải thích được và đo được quan trọng hơn tính năng phụ.

## Trạng thái

- Story nào xong, story nào đang `review` và còn chờ gì: [STATUS.md](docs/sprints/STATUS.md) (tự sinh) và file story. Đã phát hành gì: [CHANGELOG](docs/CHANGELOG.md). Việc đang làm của người dùng hiện tại: `.active-context.md`; đọc file này khi bắt đầu phiên, nếu có.
- 37 story của 6 epic nằm trong `docs/sprints/stories/` ([CONTEXT D21](docs/CONTEXT.md)). Lộ trình: xong trong tháng 12/2026, hai làn chạy song song bằng agent ([sprints/README › Lộ trình](docs/sprints/README.md#lộ-trình), [CONTEXT D20](docs/CONTEXT.md)).
- Khi bắt đầu một story, đọc lại file của nó và thêm khối *Story refresh* nếu spec đã đổi.
- Không ghi trạng thái từng story vào file này ([CONTEXT D38](docs/CONTEXT.md)). Chỉ sửa khi có quy tắc mới hoặc mẫu mới cho mục *Mẫu có sẵn*.

## Mẫu có sẵn

Code đã có các mẫu sau. Dùng lại thay vì dò code hay viết mới:

| Cần | Dùng |
|---|---|
| Gọi AI từ một module | `AiGatewayService.dispatch` sau khi commit; nghe `ai.result.<TYPE>` theo quy ước trong `modules/aigateway/domain/events.ts`. Hợp đồng mới thêm vào `packages/shared/contracts` rồi chạy `pnpm contracts:gen` ([CONTEXT D33](docs/CONTEXT.md)) |
| Agent AI mới | Theo mẫu `ai-service/app/agents/jd_analyzer/`: đọc view nguồn `core.v_ai_*`, trích văn bản bằng `app/parsing/`, `flag_hidden_text` khi lỗi. Thay handler giả trong `app/handlers/` và đăng ký qua `build_handlers`. Gọi LLM theo mục *Gọi LLM*; compose truyền biến LLM cho `ai-worker`, mặc định `LLM_PROVIDER=fixture` |
| Thêm bước xử lý hồ sơ CV (chuẩn hóa kỹ năng, embedding) | `CvParser(profile_steps=…)`. Kết quả nằm ở `cvs.profile` / `profile_masked` / `masked_text`; che PII bằng `ai-service/app/parsing/pii.py` với bộ ca `packages/shared/contracts/fixtures/pii-mask-cases.json` ([CONTEXT D37](docs/CONTEXT.md)) |
| Báo tin cho người dùng | `NotificationService.notify` hoặc phát sự kiện. Nguồn nhắc hạn mới đăng ký vào `DeadlineReminderRegistry`; sự kiện SSE đẩy bằng `RealtimePublisher`, nghe ở web bằng `useServerEvent` ([CONTEXT D31](docs/CONTEXT.md)) |
| Chặn thao tác ngoài pha của đợt; thời gian trong test | `CampaignService.assertPhase`; `Clock` / `FakeClock` ([CONTEXT D27](docs/CONTEXT.md)) |
| Lưu, tải file | `common/storage`: MinIO SSE-S3, URL tạm qua nginx, `FileAccessRegistry` ([CONTEXT D28, D29](docs/CONTEXT.md)) |
| Điều khoản xử lý dữ liệu | `packages/shared/consent/`, bảng `consents` ([CONTEXT D30](docs/CONTEXT.md)) |

## Tài liệu

| File | Nội dung |
|---|---|
| [docs/BRIEF.md](docs/BRIEF.md) | Tóm tắt sản phẩm |
| [docs/PRD.md](docs/PRD.md) | Nghiệp vụ: quy trình GĐ0–GĐ10, công thức điểm, thuật toán phân bổ, vòng đời trạng thái, BR-01…BR-18, FR, NFR, epic |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, thành phần, DB, queue, API, bảo mật, triển khai, AD-1…AD-14 |
| [docs/CONTEXT.md](docs/CONTEXT.md) | Nhật ký quyết định D-N; chỉ ghi thêm; mục lục ở đầu file |
| [docs/LESSONS.md](docs/LESSONS.md) | Bẫy đã gặp; mục lục theo chủ đề ở đầu file, đọc trước khi bắt đầu việc |
| [docs/SETUP.md](docs/SETUP.md) | Cài môi trường |
| [docs/sprints/](docs/sprints/README.md) | Epic, story, sprint; `STATUS.md` tự sinh |
| [VERSION](VERSION) + [docs/CHANGELOG.md](docs/CHANGELOG.md) | Phiên bản, lịch sử phát hành |

PRD và ARCHITECTURE là spec gốc, code phải khớp với chúng. Khi spec mâu thuẫn, mơ hồ, hoặc chạm vào điểm chưa chốt (PRD › *Các điểm cần chốt*, Q1–Q8): **hỏi, đừng tự quyết**. Tạm dùng cột "Đề xuất" và đưa thành tham số cấu hình.

## Đọc gì trước khi làm

PRD (~990 dòng), ARCHITECTURE (~820 dòng), CONTEXT (~1200 dòng) và LESSONS (~330 dòng) quá dài để đọc hết. Không đọc cả file: lấy số dòng bằng `grep -n` (tiêu đề mục, `^### D37\.`, `^## 15\.`) rồi chỉ đọc đoạn đó. CONTEXT và LESSONS có mục lục ở đầu file. Mỗi file chỉ đọc một lần trong một phiên. Chỉ đọc mục liên quan:

| Việc | Đọc |
|---|---|
| Bất kỳ story nào | File story + mục lục `docs/LESSONS.md` và các mục khớp với story + các FR (`prd_ref`) và AD (`arch_ref`) mà story tham chiếu |
| Module nghiệp vụ | PRD › *Quy trình nghiệp vụ theo giai đoạn* (GĐ tương ứng) + *Quy tắc nghiệp vụ* + ARCH › *Các module* |
| Trạng thái, chuyển trạng thái | PRD › *Vòng đời trạng thái* + ARCH › *Quản lý trạng thái* |
| Tính S_cv / S_test / S_final | PRD › *Cơ chế chấm điểm* |
| Phân bổ, vòng bổ sung | PRD › *Thuật toán phân bổ* + GĐ10 + ARCH › *Allocation Engine* |
| Bảng DB, migration | ARCH › Data architecture + PRD › *Mô hình dữ liệu khái niệm* |
| AI agent, prompt, chi phí | ARCH › *AI Service và các AI Agent* + LLM usage and cost + PRD › *Kiểm soát rủi ro AI (guardrails)* |
| Queue, message | ARCH › Messaging and data flow |
| Phòng thi | PRD GĐ5 + ARCH › *Phòng thi* |
| Bảo mật, phân quyền | ARCH › Security architecture + PRD › Personas |
| Giao diện | `DESIGN.md` (khi đã có) + skill shadcn |

## Stack

Monorepo pnpm (cấu trúc thư mục: ARCH › Project structure):

- `apps/web`: React 19 + TS + Vite, Tailwind CSS + shadcn/ui, TanStack Query, TanStack Table, React Hook Form + Zod
- `apps/api`: NestJS (TS strict), Drizzle ORM, nestjs-zod, @golevelup/nestjs-rabbitmq; Jest, fast-check, testcontainers
- `packages/shared`: Zod schema, kiểu trạng thái + bảng chuyển trạng thái, contract message
- `ai-service`: Python 3.12, FastStream, FastAPI, google-genai + Anthropic SDK (sau `LLMClient`), Jinja2, minio, Pydantic v2; pytest
- PostgreSQL 16 + pgvector, Redis, RabbitMQ, MinIO; Docker Compose trong `deploy/`

Không thêm thư viện ngoài danh sách ở ARCH › Tech stack và *Thư viện chính* khi chưa hỏi.

## Lệnh

Chạy tại gốc repo, sau `nvm use` (Node 22, `.nvmrc`) và `pnpm install`. Đừng đoán lệnh không có trong `package.json` hoặc `pyproject.toml`. Cài đặt máy: [docs/SETUP.md](docs/SETUP.md); Docker Compose: [DEPLOY.md](DEPLOY.md).

```bash
pnpm typecheck                         # build @srm/shared rồi tsc mọi package
pnpm lint                              # ESLint (api, web, shared)
pnpm test                              # Jest api: unit + integration (testcontainers, cần Docker); dừng compose trước (LESSONS §15)
pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/(cv-upload|consent)' --selectProjects integration   # vài file integration (LESSONS §21)
pnpm --filter @srm/api test:unit       # unit test, không cần Docker
pnpm build                             # build shared → api, web
pnpm depcruise                         # ranh giới module (Nguyên tắc 13)
pnpm depcruise:fixture                 # luật ranh giới còn bắt được vi phạm
pnpm --filter @srm/api dev             # API ở :3000
pnpm --filter @srm/web dev             # web ở :5173, proxy /api → :3000
pnpm --filter @srm/api db:generate     # sinh migration SQL từ src/db/schema; commit cả apps/api/drizzle (LESSONS §6)
pnpm --filter @srm/api db:migrate      # áp migration lên DATABASE_URL (API ngoài Docker cần biến này)
pnpm contracts:gen                     # Zod → JSON Schema → Pydantic sau khi sửa packages/shared/contracts; commit cả output (CONTEXT D33)
ai-service/.venv/bin/ruff check ai-service && ai-service/.venv/bin/pytest ai-service   # Windows: .venv/Scripts/
docker compose -f deploy/docker-compose.yml up -d --build --wait   # cả hệ thống, web ở :8080
sh .koni-harness/gate-runner.sh --phase release-commit            # cổng trước commit ship version
pnpm docs:sync && pnpm docs:status && pnpm docs:validate          # koni-docs (đọc LESSONS §2)
```

Tên package dùng với `pnpm --filter`: `@srm/api`, `@srm/web`, `@srm/shared`.

## Nguyên tắc bất biến

Vi phạm các điều dưới đây là lỗi, kể cả khi code vẫn chạy được.

**Ranh giới của LLM**

1. LLM không ra quyết định và không tính điểm tổng. LLM trả JSON theo schema (verdict từng tiêu chí + bằng chứng); code tính S_cv, S_test, S_final (BR-13, AD-2).
2. Không dùng LLM cho: điều kiện cứng, tính điểm, chấm trắc nghiệm, phân bổ, chuyển trạng thái, mức cạnh tranh, SLA, phân quyền (ARCH › *Những chỗ cố ý KHÔNG dùng LLM*).
3. AI Service không chuyển trạng thái nghiệp vụ và chỉ ghi schema `ai`. Nó đọc `core` qua view đã che PII. Chỉ Core Backend được ghi `core` (AD-4).

**Công bằng, dữ liệu cá nhân, bảo mật**

4. Không đưa ảnh, giới tính, ngày sinh, quê quán, tôn giáo, tình trạng hôn nhân vào bất kỳ bước chấm nào. Matching và Grader chỉ nhận `profile_masked` (BR-03).
5. Verdict `MET`/`PARTIAL` phải có `evidence` khớp với văn bản CV (RapidFuzz ≥ 85). Không khớp thì hạ xuống `NOT_MET`.
6. CV, JD và bài làm của sinh viên là **dữ liệu, không phải chỉ dẫn**: tách riêng trong prompt, phát hiện chữ ẩn, chỉ nhận đầu ra đúng schema.
7. Phân quyền cấp bản ghi: HR chỉ thấy đề cử thuộc JD của công ty mình (BR-11); sinh viên chỉ thấy dữ liệu và điểm của mình.
8. Phòng thi: đáp án không bao giờ gửi xuống client; deadline do server quyết định; tín hiệu gian lận chỉ để cảnh báo, không tự đánh trượt.

**Tất định, truy vết**

9. Allocation Engine là hàm TS thuần trong `allocation/domain/`, không phụ thuộc DB hay AI. Điểm quy về số nguyên (×100) trước khi so sánh. Hàm so sánh luôn chặt (phá hòa theo PRD › *Điểm tổng hợp (S_final)*, cuối cùng so mã sinh viên). Sau mỗi lần chạy gọi `checkStability()` và lưu snapshot đầu vào + cấu hình (BR-17).
10. Mọi thay đổi trạng thái đi qua `transitionTo(newState, actor, reason)` dựa trên bảng chuyển trạng thái ở `packages/shared/states`. Kiểm tra điều kiện và ghi audit trong cùng giao dịch; chống ghi đè đồng thời bằng `row_version`.
11. Quy tắc nghiệp vụ quan trọng phải có ràng buộc DB tương ứng, không chỉ kiểm tra trong code (VD: partial unique index cho BR-08).
12. Mọi kết quả từ LLM lưu kèm `model` và `prompt_version`.

**Ranh giới module**

13. Module NestJS không truy vấn bảng của module khác; chỉ gọi service đã export hoặc phát event. `domain/` không import NestJS hay Drizzle.
14. Kiểu dùng chung FE/BE đặt ở `packages/shared`. Contract message TS ↔ Python định nghĩa một lần bằng Zod, xuất JSON Schema, rồi sinh Pydantic. Không viết tay ở cả hai phía (AD-6).
15. Job AI chạy bất đồng bộ qua RabbitMQ: payload chỉ chứa ID, xử lý idempotent theo `job_id` (AD-5).

## Gọi LLM (ai-service)

Hai nhà cung cấp sau `LLMClient`: Gemini (mặc định, `gemini-3.8-flash`) và Claude (`claude-opus-5-5`), chọn bằng `LLM_PROVIDER` ([CONTEXT D34](docs/CONTEXT.md)).

- Agent gọi `LLMClient.generate(prompt=..., output_model=..., effort=EFFORT_BY_AGENT[...], job_id=...)` (`ai-service/app/llm/`). Chỉ `app/llm/` được import `google.genai` và `anthropic`; test chặn chỗ khác.
- Ghi rõ effort cho từng tác vụ theo ARCH › *Bản đồ sử dụng LLM theo giai đoạn*; `generate` không có giá trị mặc định cho effort. JSON lấy bằng structured output với model Pydantic, không dùng `tool_choice` để ép gọi công cụ, không gửi `temperature`.
- Refusal được kiểm trước khi đọc nội dung, sai schema được thử lại 2 lần, mọi lần thử được ghi vào `ai.llm_calls` và `llm-logs`: việc của `StructuredLLMClient`, agent không tự làm. Kết quả lưu kèm `result.model` (model thật sự trả lời) và `result.prompt_version`.
- Sửa adapter hoặc nâng SDK: phần Claude dùng skill `claude-api` (có sẵn trong Claude Code); phần Gemini đối chiếu tài liệu chính thức ai.google.dev và kiểu dữ liệu của `google-genai` đã cài. Không viết tham số API theo trí nhớ. Xong thì chạy `ai-service/evals/smoke_llm.py` với key thật.
- Prompt là file có phiên bản: `ai-service/app/prompts/<agent>/v<N>.md`, hai block Jinja `system` (không biến) và `user`. Không sửa prompt đã phát hành (có trong `manifest.json`); tạo `v<N+1>`. Phiên bản đang dùng chọn trong `active.json`.
- Phần cố định của prompt đặt đầu, phần thay đổi đặt cuối. Không chèn thời gian hay ID ngẫu nhiên vào `system`. JSON đưa vào prompt dùng filter `tojson_sorted`; CV, JD, bài làm dùng filter `untrusted("<thẻ>")`.
- Test dùng fixture, **không gọi API thật**: `conftest.py` xóa key và chặn kết nối ra ngoài. API thật chỉ chạy trong `ai-service/evals/`, khởi động thủ công, với dữ liệu giả khi dùng free tier của Gemini.

## Kiểm thử

- Công thức điểm, bảng chuyển trạng thái, quy tắc phá hòa: unit test.
- Allocation: property-based test (fast-check) cho ba tính chất ổn định, không vượt sức chứa, tất định. Ví dụ ở PRD › *Ví dụ minh họa* phải là một test cố định.
- Integration test dùng PostgreSQL/RabbitMQ/Redis/MinIO thật qua testcontainers.
- Ghi mã BR-xx hoặc GĐx liên quan vào tên test để truy vết khi viết báo cáo.

## Quy trình làm việc

Theo vòng lặp koni (skill koni-harness): Plan → Execute → Self-verify → Review → Doc/Version gate → Commit.

1. **Plan.** Mỗi việc là một story trong `docs/sprints/stories/`. Chưa có thì tạo bằng template story của skill koni-docs; mã story phải có trong PRD › Epics & User Stories. Đặt `status: in-progress`. Đọc mục lục `docs/LESSONS.md` và các mục liên quan, ghi `Lessons applied:` vào story.
2. **Execute.** Code theo spec; đánh `[x]` từng task ngay khi xong. Quyết định kiến trúc hoặc phạm vi mới thì thêm mục D vào `docs/CONTEXT.md` ngay lúc đó. Việc có giao diện: đọc `DESIGN.md` trước khi code và ghi `Design applied: …` vào story.
3. **Self-verify.** Chạy typecheck, lint, test.
4. **Review.** `/code-review`; độ phủ test theo skill koni-qc; giao diện so với `DESIGN.md` và quy tắc của skill shadcn.
5. **Doc/Version gate.** Làm checklist ở [docs/README.md](docs/README.md): VERSION + CHANGELOG cùng commit với code; ghi kết luận bài học (mục mới trong LESSONS.md hoặc dòng `Lessons: none new — <lý do>`); chạy `koni-docs sync`, `status`, `validate`; cập nhật `.active-context.md`. Mục mới trong CONTEXT hay LESSONS thì thêm cả một dòng vào mục lục của file đó.
6. **Commit.** Message tiếng Anh, prefix `feat:`/`fix:`/`chore:`/`docs:`/`style:`/`refactor:`/`test:`, có mã story (US-x.y).

### Phiên và context

Mỗi lượt gửi lại toàn bộ context, nên chi phí một story xấp xỉ số lượt × cỡ context ([CONTEXT D38](docs/CONTEXT.md)).

- **Ba phiên cho mỗi story**, gõ `/clear` giữa các phiên: (1) Plan; (2) Execute + Self-verify; (3) Review + Doc/Version gate + Commit. Cuối mỗi phiên ghi việc còn dở vào file story (task `[x]`, *Implementation notes*) và `.active-context.md`; phiên sau đọc hai file này rồi làm tiếp. Story lớn (≥ 8 điểm) thì chia phiên 2 theo nhóm task.
- Context vượt khoảng 200 nghìn token thì `/compact` hoặc kết thúc phiên sớm, đừng chờ tự compact.
- **Không chạy subagent Explore theo mặc định, kể cả trong plan mode.** Bảng *Đọc gì trước khi làm* và mục *Mẫu có sẵn* đã chỉ chỗ cần đọc. Chỉ dùng tối đa một subagent, với câu hỏi cụ thể, khi story chạm vùng code chưa có mẫu.
- Gom các lệnh đọc độc lập vào cùng một lượt. Lệnh có output dài (test, build) thì chỉ lấy phần cuối hoặc lọc dòng lỗi.
- Khi phát triển, chỉ chạy test của phần đang sửa (`--testPathPatterns`, LESSONS §21). Cả bộ test chạy một lần ở Self-verify, sau khi dừng compose (LESSONS §15).
- Phần Doc/Version gate là việc cơ học: có thể chuyển sang model rẻ hơn bằng `/model` trước bước này. Review code giữ model mạnh.
- **File story giữ dưới khoảng 15 KB.** *Implementation notes* chỉ ghi điều người sau cần mà code, CONTEXT và LESSONS chưa có. *Files modified* liệt kê theo thư mục hoặc nhóm, không liệt kê từng file (git đã có).
- `.active-context.md`: *Recent Decisions* và *Recent Lessons* giữ 5 mục gần nhất, mỗi mục là mã kèm một cụm từ (`D37 = phân tích CV`).

Skill koni có nhắc tới BMAD, gstack (`/design-review`, `/qa`), Superpowers và `frontend-design`, nhưng repo **chưa cài** các công cụ này. Không gọi chúng. Dùng thay bằng: plan mode cho Plan, `/code-review` cho Review, skill koni-qc cho test, skill shadcn cho giao diện.

## Ngôn ngữ

Theo [CONTEXT D16](docs/CONTEXT.md):

- Trả lời người dùng bằng tiếng Việt.
- Tài liệu trong `docs/`: nội dung tiếng Việt. Tên file, tiêu đề H2 theo template, khóa frontmatter, enum và mã ID giữ tiếng Anh.
- Code, comment, commit message: tiếng Anh. Identifier, tên bảng/cột, enum, route API: tiếng Anh.
- Chuỗi giao diện: tiếng Việt; cổng sinh viên phải dùng tốt trên điện thoại.

## Thuật ngữ và tên trong code

Theo ARCH › *Các bảng chính*:

| Nghiệp vụ | Code |
|---|---|
| Đợt thực tập; tham số đợt (N_NV, θ_cv, θ_test, α, β, k…) | `campaign`; `campaigns.config` |
| JD; yêu cầu chuẩn hóa; chỉ tiêu | `job_description`; `requirements`; `quota` |
| Hồ sơ năng lực (bản đầy đủ / đã che PII) | `cvs.profile` / `cvs.profile_masked` |
| Điều kiện cứng; kết quả phù hợp | `eligible`, `ineligible_reasons`; `match_result` |
| Nguyện vọng (NV1 = ưu tiên cao nhất) | `preference` (`rank` = 1) |
| Ngân hàng câu hỏi; ma trận đề | `question_bank`; `exam_blueprint` |
| Bài test; câu trả lời; phúc khảo | `exam_session`; `exam_answer`; `appeal` |
| Vòng phân bổ; đề cử; sức chứa C_j | `allocation_round`; `nomination`; `capacity` |
| HR duyệt; phỏng vấn; lời mời thực tập | `hr_review`; `interview`; `offer` |
| Trạng thái đề cử đang chạy (BR-08) | `NOMINATED`, `INTERVIEW`, `PASSED`, `RESERVE` |

## Koni-Docs

Dự án quản lý tài liệu bằng koni-docs. Cấu trúc và checklist ở [docs/README.md](docs/README.md); template, quy tắc (RULE-1…RULE-17) và quy trình ở skill koni-docs.

## Skill

Bản gốc nằm ở `.agents/skills/`. Claude Code đọc qua liên kết `.claude/skills` ([LESSONS §1](docs/LESSONS.md)).

| Skill | Dùng khi |
|---|---|
| `koni-docs` | Tạo/sửa story, epic, sprint, CONTEXT, LESSONS, CHANGELOG; checklist trước commit |
| `koni-harness` | Vòng lặp làm việc, cổng commit, chọn story tiếp theo, chạy song song nhiều story |
| `koni-qc` | Viết test case, ma trận AC↔TC, review bảo mật, QC trước release |
| `shadcn` | Thêm, sửa, ghép component giao diện |
| `claude-api` (có sẵn trong Claude Code) | Sửa adapter Claude trong `ai-service/app/llm/` |
