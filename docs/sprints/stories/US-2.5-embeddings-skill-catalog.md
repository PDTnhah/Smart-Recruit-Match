---
id: US-2.5
title: "Embedding và danh mục kỹ năng"
epic: EPIC-2
status: done
priority: P1
points: 8
sprint: sprint-2026-W44
version_shipped: 0.11.0
prd_ref: [FR-13]
arch_ref: [AD-11]
depends_on: [US-2.1, US-2.4]
assignee: PDTnhah
commit: 9db09995ce273507d9e457485178a2590265168e
created: 2026-10-07
updated: 2026-10-28
---

## Story refresh — 2026-10-26 (bắt đầu story)

Người dùng chốt ngày 2026-10-26: module mới `skills` (không đặt ở `matching`), `group` là enum 10 nhóm, compose mặc định `EMBEDDING_PROVIDER=hashing`. Chi tiết và các quyết định khác ở [CONTEXT D39](../../CONTEXT.md). Nhánh `us-2.5` tách từ `us-2.4`; ước lượng lại 8 điểm. AC-6 gọi LLM đang dùng (mặc định Gemini, D34).

## Goal

Tên kỹ năng trong hồ sơ năng lực và yêu cầu JD được quy về một danh mục chung: "ReactJS", "React.js" đều thành `React`. Kỹ năng chưa có trong danh mục được đánh dấu là kỹ năng mới và chờ quản trị duyệt; AI không tự thêm vào danh mục. Story cũng dựng dịch vụ embedding `bge-m3` và bảng `ai.embeddings` cho US-3.2 (lọc top-M JD), US-4.1 (câu hỏi trùng) và US-4.7 (bài tự luận giống nhau).

## Background

GĐ2 bước 3 (PRD) yêu cầu chuẩn hóa tên kỹ năng theo danh mục; FR-13 giao cho Quản trị duyệt kỹ năng mới do AI phát hiện. AD-11 ([D11](../../CONTEXT.md)): `BAAI/bge-m3` tự host trong AI Service (tiếng Việt, 1024 chiều, CPU), vector ở `ai.embeddings` (pgvector, HNSW). ARCH › *Pipeline CV Parser* bước 6 (chuẩn hóa, cosine ≥ 0,85) và bước 8 (embedding hồ sơ) cắm vào [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md); cùng bộ chuẩn hóa áp cho yêu cầu JD của [US-2.3](US-2.3-jd-analyzer-hr-requirement-confirmation.md). LLM chỉ gợi ý cho kỹ năng chưa có trong danh mục, `effort: low`, job nền.

**Lessons applied**: §6 (migration viết tay cho extension `vector` trước migration bảng), §7 (`skillLifecycle` khai kiểu cụ thể), §10 (refine của schema kỹ năng), §14 (biến rỗng coi như chưa đặt), §15 + §21 (dừng compose trước `pnpm test`, chạy integration theo file), §18 (image e2e build với `hashing`), §19 (test bge-m3 thật chạy offline, `@slow`), §22 (test danh mục chỉ đọc kỹ năng do chính nó tạo).

## Acceptance criteria

- [x] **AC-1** — **Given** worker AI khởi động, **When** cần embedding, **Then** mô hình `BAAI/bge-m3` được nạp một lần cho mỗi tiến trình (không nạp lại mỗi job), trả vector 1024 chiều đã chuẩn hóa, và chạy được khi không có GPU.
- [x] **AC-2** — **Given** bảng `ai.embeddings` (`owner_type` ∈ {`cv`, `jd`, `question`, `skill`, `essay`}, `owner_id`, `version`, `model`, `embedding vector(1024)`), **When** ghi cùng (`owner_type`, `owner_id`, `version`, `model`) lần thứ hai, **Then** vector được cập nhật, không sinh dòng trùng; có index HNSW `vector_cosine_ops`.
- [x] **AC-3** — **Given** danh mục có `React` với alias `ReactJS`, **When** chuẩn hóa "ReactJS", "React.js", "react js", **Then** cả ba được gán `React` (khớp alias sau khi chuẩn hóa chữ hoa/thường, dấu chấm, khoảng trắng, hoặc cosine ≥ 0,85).
- [x] **AC-4** — **Given** tên kỹ năng có cosine cao nhất với danh mục < 0,85, **When** chuẩn hóa, **Then** kỹ năng được giữ nguyên tên, đánh dấu `NEW` trong hồ sơ, và có trong danh sách kỹ năng mới của kết quả job; ngưỡng 0,85 đọc từ cấu hình.
- [x] **AC-5** — **Given** kết quả `CV_PARSE` hoặc `JD_ANALYZE` có kỹ năng mới, **When** backend xử lý, **Then** mỗi tên kỹ năng mới (đã gộp trùng theo tên chuẩn hóa) có một dòng trong `skills` ở trạng thái chờ duyệt; kỹ năng chờ duyệt không xuất hiện trong view danh mục mà AI Service đọc.
- [x] **AC-6** — **Given** kỹ năng mới chờ duyệt, **When** chạy job nền gợi ý, **Then** LLM đang dùng (mặc định Gemini, D34) được gọi qua `LLMClient` với `effort: low` chỉ cho các kỹ năng này, trả gợi ý tên chuẩn, nhóm và kỹ năng có sẵn có thể trùng; gợi ý chỉ để quản trị tham khảo, không tự duyệt.
- [x] **AC-7** — **Given** người dùng vai trò `ADMIN`, **When** mở màn danh mục kỹ năng, **Then** thấy danh sách chờ duyệt kèm gợi ý, và thực hiện được: duyệt (có thể sửa tên chuẩn, nhóm), gộp vào kỹ năng có sẵn (tên mới thành alias), từ chối. Mỗi thao tác ghi `audit_logs`.
- [x] **AC-8** — **Given** người dùng không phải `ADMIN` (SV, HR, Trung tâm), **When** gọi các endpoint quản trị danh mục, **Then** trả `403`. Endpoint tra cứu danh mục đã duyệt (cho ô gợi ý ở US-2.6, US-2.3) chỉ trả kỹ năng đã duyệt, không trả kỹ năng chờ duyệt.
- [x] **AC-9** — **Given** CV Parser xong, **When** pipeline chạy bước 8, **Then** embedding của hồ sơ (dựng từ `profile_masked`, không từ PII) được ghi vào `ai.embeddings` với `owner_type = cv`, `owner_id = cv_id`, `version = cv_version`.
- [x] **AC-10** — **Given** kỹ năng mới được duyệt hoặc gộp, **When** chuẩn hóa lần sau gặp cùng tên, **Then** tên đó được gán ngay mà không thành kỹ năng mới lần nữa.

## Tasks

- [x] **TASK-2.5.1** — Hợp đồng (`CvExtractedSkill`/`CvSkill`, `new_skills`, `contracts/skills.ts`, `SKILL_NORMALIZE`, `skillMatchKey` + bộ ca dùng chung, `states/skill.ts`) và migration 0013–0015 (extension `vector`; `core.skills`, `ai.embeddings`, HNSW một phần; view, `GRANT`, seed 174 kỹ năng) (AC: 2, 5)
- [x] **TASK-2.5.2** — `ai-service/app/embedding/`: `BgeM3Embedder`, `HashingEmbedder`, `build_embedder`; `store.py` (pgvector), `catalog.py`; `config.py`, `pyproject.toml` (AC: 1, 2)
- [x] **TASK-2.5.3** — `SkillNormalizer` (key → cosine → `NEW`); nối vào `cv_parser` (bước 6, 8) và `jd_analyzer`, `worker.py` (AC: 3, 4, 9, 10)
- [x] **TASK-2.5.4** — Agent `skill_normalizer`, prompt `v1`, guardrail (AC: 6)
- [x] **TASK-2.5.5** — Module `skills`: listener, gợi ý, `GET /api/skills`, `/api/admin/skills` (duyệt, gộp, từ chối), `pnpm api:sync` (AC: 5, 7, 8, 10)
- [x] **TASK-2.5.6** — Màn `/admin/skills` (chỉ ADMIN), ba dialog, bốn trạng thái (AC: 7)
- [x] **TASK-2.5.7** — Dockerfile (`ARG EMBEDDING_PROVIDER`, torch CPU), compose (`hf-models`), SETUP, DEPLOY (AC: 1)
- [x] **TASK-2.5.8** — Test theo *Verification commands*; `ai-service-role`, `ai-job-roundtrip` kiểm embedding CV (AC: 1–10)

## Dev notes

### Architecture constraints

- [AD-11](../../ARCHITECTURE.md#architecture-decisions): bge-m3 chạy trong AI Service, không gọi API embedding ngoài, không dùng CSDL vector riêng (D4).
- AD-4: AI Service đọc danh mục qua view, ghi `ai.embeddings`, không ghi `skills`; kỹ năng mới đi qua `ai.results`. AD-2: AI chỉ gợi ý, quản trị quyết định.
- Embedding hồ sơ dựng từ `profile_masked` (BR-03). Hồ sơ SV sửa ở US-2.6 mà không đổi `cv_version` sẽ lệch embedding: đề xuất US-3.2 tính lại từ hồ sơ đã xác nhận trước khi lọc top-M (upsert cùng khóa).

### Cross-story dependencies

- Builds on [US-2.1](US-2.1-ai-job-pipeline-message-contracts.md), [US-2.2](US-2.2-llm-client-versioned-prompts.md), [US-2.3](US-2.3-jd-analyzer-hr-requirement-confirmation.md), [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md).
- Sibling [US-2.6](US-2.6-student-profile-confirmation.md): dùng `GET /api/skills?query=`; migration của US-2.6 phải đứng sau 0018.
- Required by [US-3.2](US-3.2-batch-matching-agent.md), [US-4.1](US-4.1-exam-blueprint-test-generator.md), [US-4.7](US-4.7-cheating-signals.md): dùng `app/embedding/` (AGENTS › *Mẫu có sẵn*; LESSONS §24 khi lọc theo phiên bản).

### Performance budget

- Ngưỡng gán 0,85, đo với bge-m3 thật (D39). Chuẩn hóa và embedding nằm trong NFR-6 (< 30 giây/CV) của US-2.4; mô hình nạp lúc khởi động.

### What we explicitly did NOT do

- Không chuẩn hóa lại hồ sơ đã lưu khi một kỹ năng được duyệt; hồ sơ trước 0.11.0 giữ tên gốc với `match: NEW` (migration 0018). Trigger để làm: nhiều SV có kỹ năng `NEW` sau khi danh mục đã được duyệt.
- Không tính embedding JD lúc phân tích (HR còn sửa); US-3.2 tính cho phiên bản đã xác nhận.
- Không dùng LLM cho kỹ năng đã có trong danh mục.
- Không thêm ô gợi ý kỹ năng vào form JD hay hồ sơ SV; không báo ADMIN khi có kỹ năng mới.
- Danh sách quản trị tối đa 500 dòng mỗi trạng thái, chưa phân trang hay tìm kiếm. Trigger: danh mục đã duyệt vượt khoảng 400 kỹ năng.

### References

[PRD](../../PRD.md) › GĐ2 bước 3, FR-13; [ARCHITECTURE](../../ARCHITECTURE.md) › Pipeline từng agent, Các bảng chính, Docker Compose; [CONTEXT](../../CONTEXT.md) D11, D33, D34, D37, D39.

## Verification commands

> Python: `ai-service/.venv/Scripts/pytest ai-service/<file>`; `@slow` chạy riêng bằng `-m slow` sau khi cài extra `embedding` và tải bge-m3 (SETUP §4). Jest: `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/skills-catalog' --selectProjects integration`.

| AC | Command |
|---|---|
| AC-1 | `tests/embedding/test_model.py::test_ad11_model_loaded_once_per_process`, `::test_ad11_bge_m3_without_the_extra_asks_for_a_rebuild`, `::test_ad11_bge_m3_1024_normalized_on_cpu` (`@slow`) |
| AC-2 | `skills-catalog.int-spec.ts` › "AD-11 ai.embeddings upsert không trùng, có index HNSW"; `tests/embedding/test_store_sql.py`; `test_skill_normalizer.py::test_ad11_superseded_skill_embeddings_deleted` |
| AC-3 | `test_skill_normalizer.py::test_gd2_reactjs_variants_map_to_react`, `::test_gd2_close_name_maps_by_embedding`; `test_skill_key.py`; `contracts/__tests__/skills.spec.ts` |
| AC-4 | `test_skill_normalizer.py::test_gd2_below_threshold_marked_new`; `tests/test_config.py`; `test_model.py::test_gd2_threshold_085_on_labelled_pairs` (`@slow`) |
| AC-5 | `skills-catalog.int-spec.ts` › describe "AC-5"; `tests/agents/test_cv_parser.py::test_br03_new_skills_leave_out_names_with_personal_data` |
| AC-6 | `tests/agents/test_skill_normalizer_agent.py` (effort low, guardrail, chỉ dẫn lọt vào dữ liệu, không còn kỹ năng chờ duyệt) |
| AC-7 | `skills-catalog.int-spec.ts` › describe "AC-7 ADMIN review"; › "FR-13 Invariant 11: DB chặn hai kỹ năng khớp cùng một key" |
| AC-8 | `skills-catalog.int-spec.ts` › "FR-13 vai trò khác ADMIN nhận 403; tra cứu chỉ trả kỹ năng đã duyệt" |
| AC-9 | `test_cv_parser.py::test_br03_profile_embedding_from_masked_profile`, `::test_br03_no_embedding_when_masking_fails`; `ai-job-roundtrip.int-spec.ts` |
| AC-10 | `test_skill_normalizer.py::test_approved_skill_matched_next_time`; phần AC-10 trong các test duyệt và gộp |

## Changelog entry

Xem [CHANGELOG 0.11.0](../../CHANGELOG.md).

**Commit**: 9db0999

## Implementation notes

- 2026-10-26 — Phiên 1 (Plan), phiên 2 (a, b, c): mọi quyết định ở [CONTEXT D39](../../CONTEXT.md), gồm kết quả đo ngưỡng 0,85 với bge-m3 thật.
- **Design applied**: DESIGN §1, §4, §6 (`table`, `alert-dialog` có form, `select`, `badge` nhóm kỹ năng `secondary`, `radio-group` mới), §7 (bốn trạng thái cho trang và cho danh sách tìm trong dialog gộp), §8, §9, §10 (`formatDateTime`), §12 (route `adminOnly`). Không dùng combobox của shadcn vì cần `@base-ui/react`.
- Mọi kết quả CV/JD có tên `NEW` sinh dòng `core.skills` và job `SKILL_NORMALIZE`; với LLM fixture job này FAILED, nên assertion đếm job phải lọc theo loại.
- 2026-10-27 — Phiên 3: `/code-review` (high) ra 10 điểm, đã sửa cả 10:
  - `evals/smoke_llm.py --cv` hỏng vì `CvParser` đổi chữ ký: thêm danh mục rỗng và kho embedding không lưu gì.
  - Vector kỹ năng cũ (theo `row_version`) và của model khác chiếm chỗ ứng viên HNSW: xóa khi tính bù (LESSONS §24).
  - Key alias chỉ được kiểm bằng TS (Invariant 11): thêm `alias_keys` + trigger `skills_keys_distinct` (0016, 0017); `GET /api/skills` so `alias_keys` chính xác.
  - Hồ sơ CV của 0.10.0 thiếu `canonical_name`, `match`: migration 0018.
  - Kỹ năng trùng của JD so bằng `skillMatchKey`.
  - Image chạy provider đã cài khi không truyền `EMBEDDING_PROVIDER` (`ENV` từ build arg).
  - Danh sách quản trị: trạng thái đã xử lý xếp quyết định mới trước.
  - Bỏ hằng trùng (ngưỡng, `MAX_SIMILAR_SKILLS`, bảng key của danh mục). ARCH, AGENTS cập nhật ở doc gate.
- koni-qc: mọi AC có ca dương và ca âm, AC-3, AC-4, AC-5 có ca biên (ngưỡng đúng 0,85, C/C++/C#, lô 51 kỹ năng). Bảo mật: endpoint quản trị chỉ ADMIN (403, 401 có test), LIKE được escape, tên kỹ năng vào prompt qua `untrusted(...)` và guardrail, `new_skills` lấy từ bản đã che PII, React hiển thị tên dạng text. Không có phát hiện mới.
- **Còn lại, cần người kiểm**: xem `/admin/skills` ở 1024 px và 768 px; chạy compose với `EMBEDDING_PROVIDER=bge-m3` (ổ C: máy dev không đủ chỗ) và `evals/perf_cv_parse.py` cho NFR-6; `smoke_llm.py --cv` với key thật.
- **Đã xong (2026-10-28).** Người dùng xác nhận đã kiểm hết các mục còn lại ở trên; story chuyển `done`.

Lessons: §23 mới (`HF_HUB_OFFLINE` đọc lúc import, bge-m3 tải 4,5 GB), §24 mới (HNSW lọc sau khi quét).

## Files modified

- `packages/shared`: `contracts/` (`skills.ts` mới, `cv.ts`, `jd.ts`, `envelope.ts`, `jobs.ts`, `queues.ts`, `schemas.ts`, `json-schema/`, `fixtures/skill-key-cases.json`, test), `states/skill.ts`, `schemas/{skill,errors}.ts`.
- `apps/api`: `drizzle/0013–0018` + snapshot, `src/db/schema/`, `src/db/lifecycles.ts`, `modules/skills/` (mới), `aigateway/domain/events.ts`, `app.module.ts`, `common/errors`, `common/scheduling/advisory-lock.ts`; `test/integration/skills-catalog.int-spec.ts` (mới), helper và test bị chạm.
- `ai-service`: `app/embedding/` (mới), `app/agents/skill_normalizer/` (mới), `app/agents/{cv_parser,jd_analyzer}`, `app/contracts/` (sinh), `app/prompts/skill_normalizer/`, `app/{config,worker}.py`, `app/consumers/`, `app/handlers/`, `app/parsing/pii.py`, `evals/smoke_llm.py`, `pyproject.toml`, `Dockerfile`; `tests/embedding/`, test agent, consumer, fixture LLM.
- `apps/web`: `features/center/skills/` (mới), `app/router.tsx`, `components/ui/radio-group.tsx`, `shared/api/`.
- Triển khai và tài liệu: `deploy/`, `DEPLOY.md`, `DESIGN.md`, `AGENTS.md`, `docs/{SETUP,ARCHITECTURE,CONTEXT,LESSONS,CHANGELOG}.md`, sprint W44, EPIC-2, VERSION và `package.json`.

## Cross-references

- [PRD FR-13](../../PRD.md#functional-requirements)
- [Epic EPIC-2](../epics/EPIC-2.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D11, D39](../../CONTEXT.md)
- [ARCHITECTURE › Architecture decisions](../../ARCHITECTURE.md#architecture-decisions)
