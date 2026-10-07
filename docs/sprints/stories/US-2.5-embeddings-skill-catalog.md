---
id: US-2.5
title: "Embedding và danh mục kỹ năng"
epic: EPIC-2
status: backlog
priority: P1
points: 5
sprint:
version_shipped:
prd_ref: [FR-13]
arch_ref: [AD-11]
depends_on: [US-2.1, US-2.4]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Tên kỹ năng trong hồ sơ năng lực và yêu cầu JD được quy về một danh mục chung: "ReactJS", "React.js" đều thành `React`. Kỹ năng chưa có trong danh mục được đánh dấu là kỹ năng mới và chờ quản trị duyệt; AI không tự thêm vào danh mục. Story cũng dựng dịch vụ embedding `bge-m3` và bảng `ai.embeddings`, để US-3.2 lọc sơ bộ top-M JD, US-4.1 tìm câu hỏi trùng và US-4.7 so bài tự luận giống nhau mà không phải tự dựng lại.

## Background

GĐ2 bước 3 (PRD) yêu cầu chuẩn hóa tên kỹ năng theo danh mục; FR-13 giao cho Quản trị quản lý danh mục và duyệt kỹ năng mới do AI phát hiện (PRD › *Personas*: Quản trị quản lý danh mục kỹ năng). Nếu không chuẩn hóa, cùng một kỹ năng mang nhiều tên khác nhau, làm sai lọc sơ bộ bằng embedding và làm danh sách "kỹ năng thiếu" của SV khó hiểu.

AD-11 ([D11](../../CONTEXT.md)) chọn `BAAI/bge-m3` tự host trong AI Service: Claude không có API embedding, bge-m3 hỗ trợ tiếng Việt, vector 1024 chiều, chạy được trên CPU ở quy mô đồ án (2–4 GB RAM), dữ liệu không rời máy chủ. Vector lưu trong `ai.embeddings` (pgvector, index HNSW `vector_cosine_ops`, ARCH › *Các bảng chính*).

ARCH › *Pipeline CV Parser* bước 6: so embedding với danh mục kỹ năng, cosine ≥ 0,85 thì gán, thấp hơn thì đánh dấu "kỹ năng mới" cho quản trị duyệt. Bước 8: tính embedding hồ sơ, lưu `ai.embeddings`. Theo ARCH › *Bản đồ sử dụng LLM* (GĐ2), Claude chỉ được gọi cho kỹ năng chưa có trong danh mục, `effort: low`, chạy như job nền. Story này cắm hai bước đó vào pipeline của [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md) và dùng cùng bộ chuẩn hóa cho kỹ năng trong yêu cầu JD của [US-2.3](US-2.3-jd-analyzer-hr-requirement-confirmation.md).

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** worker AI khởi động, **When** cần embedding, **Then** mô hình `BAAI/bge-m3` được nạp một lần cho mỗi tiến trình (không nạp lại mỗi job), trả vector 1024 chiều đã chuẩn hóa, và chạy được khi không có GPU.
- [ ] **AC-2** — **Given** bảng `ai.embeddings` (`owner_type` ∈ {`cv`, `jd`, `question`, `skill`, `essay`}, `owner_id`, `version`, `model`, `embedding vector(1024)`), **When** ghi cùng (`owner_type`, `owner_id`, `version`, `model`) lần thứ hai, **Then** vector được cập nhật, không sinh dòng trùng; có index HNSW `vector_cosine_ops`.
- [ ] **AC-3** — **Given** danh mục có `React` với alias `ReactJS`, **When** chuẩn hóa "ReactJS", "React.js", "react js", **Then** cả ba được gán `React` (khớp alias sau khi chuẩn hóa chữ hoa/thường, dấu chấm, khoảng trắng, hoặc cosine ≥ 0,85).
- [ ] **AC-4** — **Given** tên kỹ năng có cosine cao nhất với danh mục < 0,85, **When** chuẩn hóa, **Then** kỹ năng được giữ nguyên tên, đánh dấu `NEW` trong hồ sơ, và có trong danh sách kỹ năng mới của kết quả job; ngưỡng 0,85 đọc từ cấu hình.
- [ ] **AC-5** — **Given** kết quả `CV_PARSE` hoặc `JD_ANALYZE` có kỹ năng mới, **When** backend xử lý, **Then** mỗi tên kỹ năng mới (đã gộp trùng theo tên chuẩn hóa) có một dòng trong `skills` ở trạng thái chờ duyệt; kỹ năng chờ duyệt không xuất hiện trong view danh mục mà AI Service đọc.
- [ ] **AC-6** — **Given** kỹ năng mới chờ duyệt, **When** chạy job nền gợi ý, **Then** Claude được gọi qua `LLMClient` với `effort: low` chỉ cho các kỹ năng này, trả gợi ý tên chuẩn, nhóm và kỹ năng có sẵn có thể trùng; gợi ý chỉ để quản trị tham khảo, không tự duyệt.
- [ ] **AC-7** — **Given** người dùng vai trò `ADMIN`, **When** mở màn danh mục kỹ năng, **Then** thấy danh sách chờ duyệt kèm gợi ý, và thực hiện được: duyệt (có thể sửa tên chuẩn, nhóm), gộp vào kỹ năng có sẵn (tên mới thành alias), từ chối. Mỗi thao tác ghi `audit_logs`.
- [ ] **AC-8** — **Given** người dùng không phải `ADMIN` (SV, HR, Trung tâm), **When** gọi các endpoint quản trị danh mục, **Then** trả `403`. Endpoint tra cứu danh mục đã duyệt (cho ô gợi ý ở US-2.6, US-2.3) chỉ trả kỹ năng đã duyệt, không trả kỹ năng chờ duyệt.
- [ ] **AC-9** — **Given** CV Parser xong, **When** pipeline chạy bước 8, **Then** embedding của hồ sơ (dựng từ `profile_masked`, không từ PII) được ghi vào `ai.embeddings` với `owner_type = cv`, `owner_id = cv_id`, `version = cv_version`.
- [ ] **AC-10** — **Given** kỹ năng mới được duyệt hoặc gộp, **When** chuẩn hóa lần sau gặp cùng tên, **Then** tên đó được gán ngay mà không thành kỹ năng mới lần nữa.

## Tasks

- [ ] **TASK-2.5.1** — Dịch vụ embedding và bảng `ai.embeddings` (AC: 1, 2)
  - [ ] Subtask 2.5.1.1 — `ai-service/app/embedding/model.py`: nạp `BAAI/bge-m3` bằng sentence-transformers khi worker khởi động; hàm `embed(texts)` trả vector đã chuẩn hóa.
  - [ ] Subtask 2.5.1.2 — `ai-service/app/embedding/store.py`: upsert và truy vấn cosine trên `ai.embeddings` (pgvector).
  - [ ] Subtask 2.5.1.3 — Migration Drizzle: bảng `ai.embeddings` theo ARCH, index HNSW `vector_cosine_ops`, ràng buộc unique (`owner_type`, `owner_id`, `version`, `model`) (đề xuất); bật extension `vector` nếu chưa bật.
  - [ ] Subtask 2.5.1.4 — `deploy/docker-compose.yml`: volume giữ trọng số mô hình để không tải lại mỗi lần khởi động; ghi yêu cầu RAM vào `docs/SETUP.md` khi làm story.
- [ ] **TASK-2.5.2** — Danh mục kỹ năng ở Core Backend (AC: 5, 7, 8, 10)
  - [ ] Subtask 2.5.2.1 — Migration bảng `skills` (`id`, `canonical_name`, `aliases TEXT[]`, `group`, unique(`canonical_name`)) theo ARCH, thêm cột trạng thái duyệt và cột gợi ý (đề xuất, ARCH chưa có); seed danh mục kỹ năng IT phổ biến kèm alias.
  - [ ] Subtask 2.5.2.2 — View `core.v_ai_skills` (tên đề xuất): chỉ kỹ năng đã duyệt; quyền `SELECT` cho role `ai_service`.
  - [ ] Subtask 2.5.2.3 — Service và API trong module `matching` (đề xuất, xem Dev notes): `GET /api/skills?query=` (đã duyệt), `GET /api/admin/skills?status=PENDING`, `POST /api/admin/skills/{id}/approve`, `POST /api/admin/skills/{id}/merge`, `POST /api/admin/skills/{id}/reject` (tên endpoint đề xuất); guard `@Roles('ADMIN')`; audit.
  - [ ] Subtask 2.5.2.4 — Handler: nhận danh sách kỹ năng mới trong kết quả `CV_PARSE`/`JD_ANALYZE` (qua sự kiện từ `student`/`company`), tạo dòng chờ duyệt, gộp trùng.
- [ ] **TASK-2.5.3** — Bộ chuẩn hóa kỹ năng ở AI Service (AC: 3, 4, 9)
  - [ ] Subtask 2.5.3.1 — `ai-service/app/embedding/skill_normalizer.py`: khớp alias đã chuẩn hóa → cosine ≥ ngưỡng → `NEW`; tự tính embedding cho kỹ năng đã duyệt còn thiếu trong `ai.embeddings` (`owner_type = skill`).
  - [ ] Subtask 2.5.3.2 — Cắm vào `ai-service/app/agents/cv_parser/` (bước 6 và 8) và `ai-service/app/agents/jd_analyzer/`; thêm trường kỹ năng chuẩn hóa và danh sách kỹ năng mới vào hợp đồng `CvParseResult`, `JdAnalyzeResult` trong `packages/shared/contracts`.
- [ ] **TASK-2.5.4** — Gợi ý cho kỹ năng mới bằng Claude (AC: 6)
  - [ ] Subtask 2.5.4.1 — Job nền qua queue `ai.skills.normalize` (tên đề xuất theo quy ước `ai.<đối tượng>.<hành động>`; ARCH › *Hàng đợi* chưa có queue này), payload chỉ chứa `job_id` và ID kỹ năng.
  - [ ] Subtask 2.5.4.2 — `ai-service/app/prompts/skill_normalizer/v1.md`; gọi `LLMClient` với `effort="low"`, đầu vào là tên kỹ năng mới và danh mục đã duyệt (JSON `sort_keys=True`).
- [ ] **TASK-2.5.5** — Màn quản trị danh mục kỹ năng (AC: 7)
  - [ ] Subtask 2.5.5.1 — Đọc `DESIGN.md` trước khi code; ghi `Design applied: …` vào story.
  - [ ] Subtask 2.5.5.2 — Màn dưới `/admin/*` (thư mục đề xuất `apps/web/src/features/center/skills/`): bảng TanStack Table các kỹ năng chờ duyệt, gợi ý, nút duyệt / gộp / từ chối; trạng thái rỗng, đang tải, lỗi.
- [ ] **TASK-2.5.6** — Test (AC: 1–10)
  - [ ] Subtask 2.5.6.1 — `ai-service/tests/embedding/test_skill_normalizer.py` (dùng mô hình embedding giả trong unit test; một test đánh dấu chậm chạy bge-m3 thật).
  - [ ] Subtask 2.5.6.2 — `apps/api/test/matching/skills-catalog.int-spec.ts` (duyệt, gộp, từ chối, 403, view chỉ trả kỹ năng đã duyệt).

## Dev notes

### Architecture constraints

- [AD-11](../../ARCHITECTURE.md#architecture-decisions): bge-m3 chạy trong AI Service. Loại phương án gọi API embedding bên ngoài (dữ liệu rời máy chủ) và CSDL vector riêng (D4: pgvector đủ cho vài chục nghìn vector).
- AD-4: AI Service đọc danh mục qua view, ghi `ai.embeddings`; không ghi `skills`. Kỹ năng mới đi qua `ai.results`, Core Backend tạo dòng `skills`.
- AD-2 và PRD › *Personas*: AI chỉ gợi ý; quản trị quyết định thêm kỹ năng vào danh mục.
- AD-10: Claude chỉ cho kỹ năng chưa có trong danh mục, `effort: low`, qua `LLMClient`.
- Embedding hồ sơ dựng từ `profile_masked`, không dùng `pii` (BR-03).
- Story này không thêm AD mới.
- ARCH › *Các module* không giao bảng `skills` cho module nào. Đề xuất đặt ở `matching` vì đây là nơi dùng danh mục để so kỹ năng (GĐ3). Hỏi trước khi chốt.
- ARCH không có queue cho job gợi ý kỹ năng mới, cũng không có cột trạng thái duyệt trong `skills`. Tên `ai.skills.normalize`, cột trạng thái và cột gợi ý là đề xuất.
- Embedding hồ sơ tính lúc parse (ARCH bước 8) có thể lệch với hồ sơ SV đã sửa ở US-2.6 mà không đổi `cv_version`. Đề xuất: US-3.2 tính lại embedding từ `profile_masked` đã xác nhận trước khi lọc top-M (upsert cùng khóa). Chốt cùng US-3.2.

### Cross-story dependencies

- Builds on [US-2.1](US-2.1-ai-job-pipeline-message-contracts.md) — schema `ai`, role `ai_service`, khung consumer, `aigateway`.
- Builds on [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md) — pipeline `cv_parser` có chỗ cắm bước 6 và 8; hợp đồng `CvParseResult`.
- Builds on [US-2.2](US-2.2-llm-client-versioned-prompts.md) — `LLMClient` cho job gợi ý kỹ năng mới.
- Builds on [US-2.3](US-2.3-jd-analyzer-hr-requirement-confirmation.md) — áp cùng bộ chuẩn hóa cho kỹ năng trong `JdRequirements`.
- Sibling [US-2.6](US-2.6-student-profile-confirmation.md) — cùng tuần T6, làn khác. US-2.6 dùng `GET /api/skills?query=` để gợi ý khi SV sửa kỹ năng; story này tạo bảng `skills` nên merge migration trước.
- Required by [US-3.2](US-3.2-batch-matching-agent.md) — top-M JD theo cosine trên `ai.embeddings`.
- Required by [US-4.1](US-4.1-exam-blueprint-test-generator.md) — `find_similar_questions` dùng embedding câu hỏi.
- Required by [US-4.7](US-4.7-cheating-signals.md) — so độ tương đồng bài tự luận bằng embedding.

### Performance budget

- Ngưỡng gán kỹ năng: cosine ≥ 0,85 (epic › *Performance budgets*, ARCH › *Pipeline CV Parser*). Kiểm bằng `ai-service/tests/embedding/test_skill_normalizer.py`.
- Bước chuẩn hóa và embedding nằm trong ngân sách NFR-6 (< 30 giây/CV) của US-2.4; mô hình nạp sẵn khi khởi động để không cộng thời gian nạp vào từng job.

### What we explicitly did NOT do

- Không chuẩn hóa lại các hồ sơ đã lưu khi một kỹ năng mới được duyệt. Trigger để làm lại: nhiều SV có kỹ năng `NEW` sau khi danh mục đã được duyệt.
- Không tính embedding JD lúc phân tích, vì HR còn sửa yêu cầu. US-3.2 tính cho phiên bản đã xác nhận.
- Không dùng Claude để chuẩn hóa kỹ năng đã có trong danh mục (ARCH: Claude chỉ cho kỹ năng chưa có).

### References

- [Source: PRD › GĐ2 – Sinh viên nộp CV (bước 3)](../../PRD.md)
- [Source: PRD › Functional Requirements (FR-13); Personas](../../PRD.md#functional-requirements)
- [Source: ARCHITECTURE › Pipeline từng agent › CV Parser (bước 6, 8)](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Bản đồ sử dụng LLM theo giai đoạn (GĐ2, chuẩn hóa tên kỹ năng)](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Tech stack (Embedding); Các bảng chính (`skills`, `ai.embeddings`); Docker Compose](../../ARCHITECTURE.md)
- [Source: CONTEXT D4, D11](../../CONTEXT.md)
- [Source: Epic EPIC-2](../epics/EPIC-2.md)

## Verification commands

> Lệnh chạy cụ thể (`pnpm …`, `pytest …`) sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `ai-service/tests/embedding/test_model.py::test_ad11_bge_m3_loaded_once_returns_1024_dims` (đánh dấu chậm) |
| AC-2 | `apps/api/test/matching/skills-catalog.int-spec.ts` › "AD-11 ai.embeddings upsert không trùng, có index HNSW" |
| AC-3 | `ai-service/tests/embedding/test_skill_normalizer.py::test_gd2_reactjs_variants_map_to_react` |
| AC-4 | `ai-service/tests/embedding/test_skill_normalizer.py::test_gd2_below_threshold_marked_new` |
| AC-5 | `apps/api/test/matching/skills-catalog.int-spec.ts` › "FR-13 kỹ năng mới vào trạng thái chờ duyệt, không có trong v_ai_skills" |
| AC-6 | `ai-service/tests/agents/test_skill_normalizer_agent.py::test_new_skill_suggestion_effort_low_fixture` |
| AC-7 | `apps/api/test/matching/skills-catalog.int-spec.ts` › "FR-13 quản trị duyệt, gộp, từ chối có audit" |
| AC-8 | `apps/api/test/matching/skills-catalog.int-spec.ts` › "FR-13 vai trò khác ADMIN nhận 403; tra cứu chỉ trả kỹ năng đã duyệt" |
| AC-9 | `ai-service/tests/agents/test_cv_parser.py::test_br03_profile_embedding_from_masked_profile` |
| AC-10 | `ai-service/tests/embedding/test_skill_normalizer.py::test_approved_skill_matched_next_time` |

## Changelog entry

### Added
- Dịch vụ embedding `BAAI/bge-m3` tự host trong AI Service và bảng `ai.embeddings` (pgvector, index HNSW).
- Chuẩn hóa tên kỹ năng trong hồ sơ năng lực và yêu cầu JD theo danh mục (khớp alias hoặc cosine ≥ 0,85); kỹ năng chưa có được đánh dấu là kỹ năng mới.
- Màn quản trị danh mục kỹ năng: duyệt, gộp, từ chối kỹ năng mới do AI phát hiện, kèm gợi ý tên chuẩn từ Claude.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-13](../../PRD.md#functional-requirements)
- [Epic EPIC-2](../epics/EPIC-2.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D11](../../CONTEXT.md)
- [ARCHITECTURE › Architecture decisions](../../ARCHITECTURE.md#architecture-decisions)
