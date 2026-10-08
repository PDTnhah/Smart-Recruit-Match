# AGENTS.md — Smart Recruit Match

> **File này là nguồn chỉ dẫn chính cho mọi agent AI trong dự án** (Claude Code, Codex, Cursor, Gemini…). `CLAUDE.md` chỉ import file này và thêm khối cấu hình koni-docs. Hai file mâu thuẫn thì theo file này.

## Dự án

Hệ thống giúp Trung tâm quan hệ doanh nghiệp của trường ghép sinh viên thực tập với doanh nghiệp. LLM phân tích CV/JD, chấm độ phù hợp, sinh đề và chấm bài test. Thuật toán Deferred Acceptance phân bổ sinh viên theo chỉ tiêu. HR duyệt hồ sơ và phỏng vấn. Đây là đồ án tốt nghiệp: tính đúng, giải thích được và đo được quan trọng hơn tính năng phụ.

## Trạng thái

- Đã có khung monorepo (US-1.1, `VERSION` 0.1.0): `apps/api`, `apps/web`, `packages/shared`, `ai-service`, Docker Compose, CI, cổng koni-harness. Chưa có nghiệp vụ. 37 story của 6 epic nằm trong `docs/sprints/stories/` ([CONTEXT D21](docs/CONTEXT.md)). Sprint đang mở: `sprint-2026-W41`.
- Lộ trình: xong trong tháng 12/2026, hai làn chạy song song bằng agent ([sprints/README › Lộ trình](docs/sprints/README.md#lộ-trình), [CONTEXT D20](docs/CONTEXT.md)).
- Bước tiếp theo: W42 gồm US-1.2, US-1.3 (làn A) và US-5.1 (làn B). Khi bắt đầu một story, đọc lại file của nó và thêm khối *Story refresh* nếu spec đã đổi.
- Việc đang làm của người dùng hiện tại nằm ở `.active-context.md`. Đọc file này khi bắt đầu phiên, nếu có.

## Tài liệu

| File | Nội dung |
|---|---|
| [docs/BRIEF.md](docs/BRIEF.md) | Tóm tắt sản phẩm |
| [docs/PRD.md](docs/PRD.md) | Nghiệp vụ: quy trình GĐ0–GĐ10, công thức điểm, thuật toán phân bổ, vòng đời trạng thái, BR-01…BR-18, FR, NFR, epic |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, thành phần, DB, queue, API, bảo mật, triển khai, AD-1…AD-14 |
| [docs/CONTEXT.md](docs/CONTEXT.md) | Nhật ký quyết định D-N; chỉ ghi thêm |
| [docs/LESSONS.md](docs/LESSONS.md) | Bẫy đã gặp; đọc trước khi bắt đầu việc |
| [docs/SETUP.md](docs/SETUP.md) | Cài môi trường |
| [docs/sprints/](docs/sprints/README.md) | Epic, story, sprint; `STATUS.md` tự sinh |
| [VERSION](VERSION) + [docs/CHANGELOG.md](docs/CHANGELOG.md) | Phiên bản, lịch sử phát hành |

PRD và ARCHITECTURE là spec gốc, code phải khớp với chúng. Khi spec mâu thuẫn, mơ hồ, hoặc chạm vào điểm chưa chốt (PRD › *Các điểm cần chốt*, Q1–Q8): **hỏi, đừng tự quyết**. Tạm dùng cột "Đề xuất" và đưa thành tham số cấu hình.

## Đọc gì trước khi làm

PRD (~930 dòng) và ARCHITECTURE (~750 dòng) quá dài để đọc hết mỗi lần. Chỉ đọc mục liên quan:

| Việc | Đọc |
|---|---|
| Bất kỳ story nào | File story + `docs/LESSONS.md` + các FR (`prd_ref`) và AD (`arch_ref`) mà story tham chiếu |
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
- `ai-service`: Python 3.12, FastStream, FastAPI, Anthropic SDK, Pydantic v2; pytest
- PostgreSQL 16 + pgvector, Redis, RabbitMQ, MinIO; Docker Compose trong `deploy/`

Không thêm thư viện ngoài danh sách ở ARCH › Tech stack và *Thư viện chính* khi chưa hỏi.

## Lệnh

Chạy tại gốc repo, sau `nvm use` (Node 22, `.nvmrc`) và `pnpm install`. Đừng đoán lệnh không có trong `package.json` hoặc `pyproject.toml`. Cài đặt máy: [docs/SETUP.md](docs/SETUP.md); Docker Compose: [DEPLOY.md](DEPLOY.md).

```bash
pnpm typecheck                         # build @srm/shared rồi tsc mọi package
pnpm lint                              # ESLint (api, web, shared)
pnpm test                              # Jest api: unit + integration (testcontainers, cần Docker)
pnpm --filter @srm/api test:unit       # unit test, không cần Docker
pnpm build                             # build shared → api, web
pnpm depcruise                         # ranh giới module (Nguyên tắc 13)
pnpm depcruise:fixture                 # luật ranh giới còn bắt được vi phạm
pnpm --filter @srm/api dev             # API ở :3000
pnpm --filter @srm/web dev             # web ở :5173, proxy /api → :3000
ai-service/.venv/bin/ruff check ai-service && ai-service/.venv/bin/pytest ai-service
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

## Gọi Claude API (ai-service)

- Trước khi viết code gọi LLM, dùng skill `claude-api` (có sẵn trong Claude Code). Không viết tham số API theo trí nhớ.
- Model `claude-opus-5-5`. Ghi rõ `output_config.effort` cho từng tác vụ (ARCH › *Bản đồ sử dụng LLM theo giai đoạn*). Lấy JSON bằng structured outputs (`output_config.format`), không dùng `tool_choice` để ép gọi công cụ.
- Luôn kiểm tra `stop_reason == "refusal"` trước khi đọc nội dung.
- Mọi lượt gọi đi qua `LLMClient` trong `ai-service/app/llm/`; agent không gọi SDK trực tiếp.
- Prompt là file có phiên bản: `ai-service/app/prompts/<agent>/v<N>.md`. Không sửa prompt đã dùng; tạo `v<N+1>`.
- Phần cố định của prompt đặt đầu, phần thay đổi đặt cuối. Không chèn thời gian hay ID ngẫu nhiên vào `system`. JSON đưa vào prompt dùng `sort_keys=True`, để prompt caching hoạt động.
- Test dùng fixture, **không gọi API thật**. API thật chỉ chạy trong `ai-service/evals/`, khởi động thủ công.

## Kiểm thử

- Công thức điểm, bảng chuyển trạng thái, quy tắc phá hòa: unit test.
- Allocation: property-based test (fast-check) cho ba tính chất ổn định, không vượt sức chứa, tất định. Ví dụ ở PRD › *Ví dụ minh họa* phải là một test cố định.
- Integration test dùng PostgreSQL/RabbitMQ/Redis/MinIO thật qua testcontainers.
- Ghi mã BR-xx hoặc GĐx liên quan vào tên test để truy vết khi viết báo cáo.

## Quy trình làm việc

Theo vòng lặp koni (skill koni-harness): Plan → Execute → Self-verify → Review → Doc/Version gate → Commit.

1. **Plan.** Mỗi việc là một story trong `docs/sprints/stories/`. Chưa có thì tạo bằng template story của skill koni-docs; mã story phải có trong PRD › Epics & User Stories. Đặt `status: in-progress`. Đọc `docs/LESSONS.md` và ghi `Lessons applied:` vào story.
2. **Execute.** Code theo spec; đánh `[x]` từng task ngay khi xong. Quyết định kiến trúc hoặc phạm vi mới thì thêm mục D vào `docs/CONTEXT.md` ngay lúc đó. Việc có giao diện: đọc `DESIGN.md` trước khi code và ghi `Design applied: …` vào story.
3. **Self-verify.** Chạy typecheck, lint, test.
4. **Review.** `/code-review`; độ phủ test theo skill koni-qc; giao diện so với `DESIGN.md` và quy tắc của skill shadcn.
5. **Doc/Version gate.** Làm checklist ở [docs/README.md](docs/README.md): VERSION + CHANGELOG cùng commit với code; ghi kết luận bài học (mục mới trong LESSONS.md hoặc dòng `Lessons: none new — <lý do>`); chạy `koni-docs sync`, `status`, `validate`; cập nhật `.active-context.md`.
6. **Commit.** Message tiếng Anh, prefix `feat:`/`fix:`/`chore:`/`docs:`/`style:`/`refactor:`/`test:`, có mã story (US-x.y).

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
| `claude-api` (có sẵn trong Claude Code) | Viết code gọi Claude API |
