---
id: US-6.6
title: "Dữ liệu demo, E2E, kiểm thử tải"
epic: EPIC-6
status: backlog
priority: P0
points: 5
sprint:
version_shipped:
prd_ref: [NFR-6, NFR-7, NFR-8, NFR-9]
depends_on:
  - US-1.1
  - US-1.2
  - US-1.3
  - US-1.4
  - US-1.5
  - US-1.6
  - US-1.7
  - US-2.1
  - US-2.2
  - US-2.3
  - US-2.4
  - US-2.5
  - US-2.6
  - US-3.1
  - US-3.2
  - US-3.3
  - US-3.4
  - US-4.1
  - US-4.2
  - US-4.3
  - US-4.4
  - US-4.5
  - US-4.6
  - US-4.7
  - US-4.8
  - US-4.9
  - US-5.1
  - US-5.2
  - US-5.3
  - US-5.4
  - US-5.5
  - US-6.1
  - US-6.2
  - US-6.3
  - US-6.4
  - US-6.5
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Có bản 1.0.0 để bảo vệ đồ án: một lệnh dựng toàn bộ hệ thống, một lệnh seed đợt demo 50 sinh viên × 10 JD chạy được trọn luồng; E2E Playwright cho luồng chính và kiểm thử tải k6 với 200 sinh viên làm bài đồng thời đều đạt; các NFR về hiệu năng (NFR-6, NFR-7, NFR-8, NFR-9) được đo lại và ghi thành báo cáo. Sau phát hành, code đóng băng, chỉ nhận sửa lỗi chặn demo.

## Background

Story không ứng với FR nào; nó kiểm chứng NFR-6 (phân tích CV < 30 giây), NFR-7 (chấm phù hợp 500 SV × 50 JD xong trong vài giờ), NFR-8 (phân bổ < 1 phút), NFR-9 (khoảng 200 SV làm bài đồng thời) (EPIC-6 › FR Coverage). Đây là mốc M6 của [sprints/README › Lộ trình](../README.md#lộ-trình): T13 (W53, 28–31/12/2026), làn A, "E2E và k6 đạt; seed đợt demo; bản bảo vệ", version 1.0.0 (CONTEXT D20). Story phụ thuộc mọi story còn lại vì nó chạy trên toàn hệ thống.

ARCH › *Testing strategy* định nghĩa E2E là luồng chính "nộp CV → chọn NV → thi → phân bổ → HR duyệt" bằng Playwright, và kiểm thử tải là phòng thi khoảng 200 SV đồng thời bằng k6. EPIC-6 › *Cross-story testing requirements* cho phép viết E2E từ T11, song song EPIC-5. EPIC-4 › Out of scope để k6 200 SV cho story này, trong khi [US-4.3](US-4.3-exam-room.md) phải thiết kế để đạt mức tải đó. ARCH › *Ước tính chi phí (thô)* ước một đợt demo 50 SV × 10 JD tốn khoảng 60 USD nếu chạy LLM thật.

Phát hành theo RULE-1: `VERSION` và `docs/CHANGELOG.md` đổi trong cùng commit, mục CHANGELOG ghi SHA thật (RULE-2). Mốc gốc của `VERSION` là 0.0.0 (CONTEXT D19). Báo cáo kiểm thử theo template test-report của koni-docs.

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** máy sạch làm theo `docs/SETUP.md`, **When** chạy `docker compose up` rồi lệnh seed demo, **Then** có 1 đợt dùng tham số mặc định của PRD GĐ0, các doanh nghiệp có tài khoản HR, 10 JD đã được HR xác nhận yêu cầu và Trung tâm duyệt, mỗi JD có ngân hàng câu hỏi đã khóa, 50 sinh viên với CV tổng hợp (không có dữ liệu cá nhân thật), tài khoản `CENTER` và `ADMIN` **And** thông tin đăng nhập demo được ghi trong `docs/SETUP.md` **And** chạy seed lần hai không tạo bản ghi trùng.
- [ ] **AC-2** — Seed chọn được điểm dừng: sau GĐ2 (CV đã xác nhận), sau GĐ4 (đã chọn NV), sau GĐ6 (đã có S_test, S_final), sau GĐ7 (vòng 1 đã công bố); mốc thời gian của đợt đặt theo thời điểm chạy để trạng thái đợt khớp với điểm dừng **And** seed tạo dữ liệu qua service của các module, nên mọi thay đổi trạng thái đi qua `transitionTo` và có `audit_logs`, không `INSERT` thẳng vượt quy tắc.
- [ ] **AC-3** — Seed, E2E và k6 chạy với AI Service ở chế độ fixture: không lượt gọi Claude API nào, CI không có `ANTHROPIC_API_KEY`.
- [ ] **AC-4** — **Given** seed demo, **When** chạy E2E Playwright, **Then** luồng chính qua được: sinh viên nộp CV và xác nhận hồ sơ → chọn NV → làm bài test → Trung tâm chạy phân bổ, xem dự thảo, công bố → HR mời phỏng vấn một hồ sơ và từ chối một hồ sơ có lý do **And** các bước của sinh viên chạy thêm ở viewport điện thoại (NFR-13) **And** response của API phòng thi bắt được trong E2E không chứa đáp án hay rubric **And** HR của công ty khác không mở được đề cử của JD không thuộc công ty mình (BR-11) **And** E2E chạy trong CI.
- [ ] **AC-5** — **Given** seed tải gồm 200 sinh viên có phiên thi cho cùng một JD, **When** chạy k6 với 200 người dùng ảo đồng thời: bắt đầu bài, tự lưu khi đổi đáp án và định kỳ 30 giây, nộp bài hoặc để server tự đóng khi hết giờ, **Then** không request nào lỗi (`http_req_failed` = 0, không có `5xx`) **And** script kiểm tra sau khi chạy xác nhận mọi phiên đã đóng và đáp án cuối cùng mỗi người dùng ảo gửi đều có trong DB (không mất bài) **And** p95 thời gian phản hồi của tự lưu và nộp bài được ghi vào báo cáo.
- [ ] **AC-6** — **Given** lần chạy demo thật (thủ công, có API key) trên 50 CV, **When** đo thời gian từ lúc tạo job `ai.cv.parse` đến lúc Core Backend nhận kết quả, **Then** mọi CV < 30 giây (NFR-6) **And** báo cáo ghi p50, p95, lớn nhất và liệt kê CV vượt ngưỡng nếu có.
- [ ] **AC-7** — Trên đợt demo, thời gian từ lúc Trung tâm bấm chạy phân bổ đến khi có dự thảo < 1 phút (NFR-8) **And** chạy engine trên kịch bản 500 SV × 50 JD của [US-6.4](US-6.4-allocation-simulation-vs-baselines.md) cũng < 1 phút; cả hai số được ghi vào báo cáo.
- [ ] **AC-8** — NFR-7 được kiểm chứng theo cách đã chốt ở TASK-6.6.4 (xem Dev notes); báo cáo ghi rõ cách đo, giả định và kết quả.
- [ ] **AC-9** — Tổng chi phí LLM của lần chạy demo thật, lấy từ màn chi phí của [US-6.2](US-6.2-llm-cost-tracking.md), được ghi vào báo cáo cạnh ước tính ~60 USD của ARCH và chi phí trên mỗi sinh viên.
- [ ] **AC-10** — Phát hành: `VERSION` = `1.0.0`; `docs/CHANGELOG.md` có mục `## [1.0.0] — 2026-12-31 — … — v1.0.0` với SHA thật; 37 story ở `done` và có `version_shipped`; `koni-docs sync`, `status`, `validate` không lỗi **And** có báo cáo phát hành `docs/tests/test-reports/releases/v1.0.0.md` dẫn tới kết quả E2E, k6, các số đo NFR, báo cáo đánh giá AI của [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md) và kết quả mô phỏng của US-6.4.
- [ ] **AC-11** — Sau commit 1.0.0, code đóng băng: chỉ nhận commit `fix:` cho lỗi chặn demo; mỗi commit đó tăng PATCH (1.0.x) và có mục CHANGELOG (RULE-1). Quy tắc đóng băng được ghi thành một mục D trong `docs/CONTEXT.md` lúc đóng băng.

## Tasks

- [ ] **TASK-6.6.1** — Seed đợt demo có điểm dừng (AC: 1, 2, 3)
  - [ ] Subtask 6.6.1.1 — Đề xuất `apps/api/src/db/seed/demo/`: tạo dữ liệu qua service của các module; dùng lại seed ngân hàng câu hỏi đã khóa của US-4.2.
  - [ ] Subtask 6.6.1.2 — CV và JD tổng hợp (dùng lại dữ liệu tổng hợp của Track B/US-6.3 nếu có); kết quả AI dạng fixture cho 50 CV × 10 JD trong `ai-service/tests/fixtures/`.
  - [ ] Subtask 6.6.1.3 — Đặt mốc thời gian theo điểm dừng; dùng clock injectable của US-4.3 khi cần.
- [ ] **TASK-6.6.2** — E2E Playwright luồng chính (AC: 3, 4)
  - [ ] Subtask 6.6.2.1 — Đề xuất `apps/web/e2e/main-flow.spec.ts` và cấu hình Playwright có thêm project viewport điện thoại cho các bước của sinh viên.
  - [ ] Subtask 6.6.2.2 — Kiểm response phòng thi không có đáp án; kiểm HR công ty khác bị chặn.
  - [ ] Subtask 6.6.2.3 — Thêm job E2E vào CI (GitHub Actions của US-1.1), chạy trên Docker Compose với AI Service ở chế độ fixture.
- [ ] **TASK-6.6.3** — Kiểm thử tải phòng thi bằng k6 (AC: 5)
  - [ ] Subtask 6.6.3.1 — Seed tải 200 sinh viên có phiên thi cho cùng một JD.
  - [ ] Subtask 6.6.3.2 — Đề xuất `apps/api/test/load/exam-room.k6.js`: kịch bản bắt đầu bài, tự lưu, nộp; ngưỡng `http_req_failed` = 0.
  - [ ] Subtask 6.6.3.3 — Script kiểm tra sau khi chạy: so đáp án cuối của từng người dùng ảo với DB.
- [ ] **TASK-6.6.4** — Hỏi người dùng cách kiểm chứng NFR-7 trước khi đo (xem Dev notes); ghi mục D nếu chốt (AC: 8)
- [ ] **TASK-6.6.5** — Chạy demo thật một lần và đo NFR (AC: 6, 7, 8, 9)
  - [ ] Subtask 6.6.5.1 — Chạy thủ công với API key; đặt giới hạn chi tiêu trên trang quản lý Claude API trước khi chạy.
  - [ ] Subtask 6.6.5.2 — Ghi kết quả vào `docs/tests/test-reports/runs/2026-12-DD-EPIC-6-run1.md` theo template test-report của koni-docs.
- [ ] **TASK-6.6.6** — Phát hành 1.0.0 (AC: 10)
  - [ ] Subtask 6.6.6.1 — Chạy đủ checklist ở `docs/README.md`; `VERSION` = `1.0.0`; mục CHANGELOG `[1.0.0]` tóm tắt các bản 0.x.
  - [ ] Subtask 6.6.6.2 — `docs/tests/test-reports/releases/v1.0.0.md`; cập nhật trạng thái các story, `koni-docs sync` → `status` → `validate`.
- [ ] **TASK-6.6.7** — Đóng băng code và tài liệu chạy demo (AC: 1, 11)
  - [ ] Subtask 6.6.7.1 — `docs/SETUP.md`: mục chạy demo (lệnh seed, điểm dừng, tài khoản demo).
  - [ ] Subtask 6.6.7.2 — Mục D mới trong `docs/CONTEXT.md` về quy tắc đóng băng.

## Dev notes

### Architecture constraints

- ARCH › *Testing strategy*: E2E bằng Playwright, tải bằng k6 — cả hai đã có trong ARCH, không cần hỏi thêm công cụ. Vị trí `apps/web/e2e/`, `apps/api/test/load/` và `apps/api/src/db/seed/demo/` là **đề xuất**; ARCH › *Project structure* chưa ghi chỗ cho E2E, k6 và seed.
- AGENTS › Nguyên tắc 10: seed tạo trạng thái qua `transitionTo`, không `INSERT` thẳng; nhờ vậy dữ liệu demo cũng thỏa các ràng buộc DB (VD partial unique index của BR-08) và có audit.
- AGENTS › *Gọi Claude API*: E2E, k6 và CI dùng fixture. Chỉ lần chạy demo thật ở TASK-6.6.5 gọi API, chạy tay.
- AGENTS › Nguyên tắc 8: E2E kiểm lại việc đáp án không xuống client trên luồng thật, bổ sung cho test của US-4.3.
- [AD-3](../../ARCHITECTURE.md#architecture-decisions): một lệnh Docker Compose dựng toàn bộ hệ thống là yêu cầu của demo.
- **Điểm cần hỏi — kiểm chứng NFR-7.** Đợt demo chỉ có 50 × 10 = 500 cặp, còn NFR-7 nói 500 SV × 50 JD. Chạy thật quy mô đó tốn khoảng 115 USD cho riêng phần chấm phù hợp (ARCH › *Ước tính chi phí (thô)*), và Message Batches có thể mất tới 24 giờ (EPIC-3 › Performance budgets). Đề xuất: chạy đường ống 500 × 50 với Batches dạng fixture để đo phần không phải LLM (lọc điều kiện cứng, top-M bằng pgvector, xử lý `ai.results`, tính S_cv), cộng với thời gian batch thật đo trên đợt demo, rồi ghi rõ giả định. Hỏi trước TASK-6.6.5.
- Chạm Q1, Q3, Q4, Q6: seed dùng giá trị mặc định của GĐ0 và cột Đề xuất (3 NV, k = 1,5, từ chối lời mời thì xếp ưu tiên thấp nhất, không chọn NV thì tự gán), đã là tham số `campaigns.config` từ các story trước. Seed không chốt thay người dùng; đổi cấu hình thì sửa tham số seed.
- Story này không thêm AD mới.

### Cross-story dependencies

- Builds on mọi story từ US-1.1 đến US-6.5 (danh sách trong `depends_on`). Các artifact dùng trực tiếp:
  - [US-1.1](US-1.1-scaffold-monorepo-docker-compose-ci.md) — `deploy/docker-compose.yml`, CI GitHub Actions.
  - [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md) — helper đăng nhập theo vai trò, khung ba cổng.
  - [US-2.2](US-2.2-llm-client-versioned-prompts.md) — chế độ fixture của `LLMClient`.
  - [US-4.2](US-4.2-validator-and-question-bank-lock.md) — seed ngân hàng câu hỏi đã khóa.
  - [US-4.3](US-4.3-exam-room.md) — API phòng thi, tự lưu, đồng hồ server, clock injectable.
  - [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md) — chạy phân bổ, dự thảo, công bố.
  - [US-5.3](US-5.3-hr-nomination-review.md) — HR duyệt đề cử.
  - [US-6.2](US-6.2-llm-cost-tracking.md) — số chi phí thật của đợt demo.
  - [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md) — báo cáo đánh giá AI, dữ liệu CV/JD tổng hợp.
  - [US-6.4](US-6.4-allocation-simulation-vs-baselines.md) — bộ sinh kịch bản 500 SV × 50 JD.
  - [US-6.5](US-6.5-campaign-close-report-export.md) — đợt demo xuất được báo cáo khi đóng.
- Required by: không story nào. Đây là story cuối của lộ trình.

### Performance budget

| Concern | Budget | Đo bằng |
|---|---|---|
| Phòng thi (NFR-9) | 200 SV đồng thời, không request lỗi, không mất bài | `apps/api/test/load/exam-room.k6.js` + script kiểm tra sau khi chạy |
| Phân tích CV (NFR-6) | < 30 giây mỗi CV, đo trên đợt demo | Lần chạy demo thật, thời điểm tạo job và nhận kết quả |
| Phân bổ (NFR-8) | < 1 phút, đo trên đợt demo và kịch bản 500 × 50 | Lần chạy demo; runner engine của US-6.4 |
| Chấm phù hợp (NFR-7) | 500 SV × 50 JD xong trong vài giờ | Theo cách chốt ở TASK-6.6.4 |
| Chi phí đợt demo | so với ước tính ~60 USD | Màn chi phí của US-6.2 |

Báo cáo phát hành phải xác nhận từng dòng trên đạt, hoặc ghi rõ dòng nào không đạt và lý do.

### What we explicitly did NOT do

- Không triển khai lên máy chủ thật; demo chạy bằng Docker Compose (AD-3).
- Không kiểm thử tải ngoài phòng thi. NFR chỉ đặt mức tải cho phòng thi.
- E2E không phủ vòng bổ sung, phúc khảo, phỏng vấn và lời mời; các luồng đó có test tích hợp trong story của chúng. Mở rộng E2E nếu còn thời gian trước buổi bảo vệ.
- Không Prometheus/Grafana (EPIC-6 › Out of scope).

### References

- [Source: PRD › Non-Functional Requirements (NFR-6 … NFR-9, NFR-13)](../../PRD.md#non-functional-requirements)
- [Source: PRD › GĐ0 (tham số mặc định); Các điểm cần chốt (Q1, Q3, Q4, Q6)](../../PRD.md)
- [Source: ARCHITECTURE › Testing strategy](../../ARCHITECTURE.md#testing-strategy)
- [Source: ARCHITECTURE › LLM usage and cost (Ước tính chi phí)](../../ARCHITECTURE.md#llm-usage-and-cost)
- [Source: ARCHITECTURE › Deployment architecture (Docker Compose, CI)](../../ARCHITECTURE.md#deployment-architecture)
- [Source: sprints/README › Lộ trình (M6)](../README.md#lộ-trình)
- [Source: docs/README › Checklist trước commit](../../README.md)
- [Source: CONTEXT D19, D20](../../CONTEXT.md)
- [Source: EPIC-6](../epics/EPIC-6.md)

## Verification commands

Lệnh chạy cụ thể sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test, tên case hoặc tài liệu kết quả.

| AC | Command |
|---|---|
| AC-1 | Chạy lệnh seed demo hai lần trên DB sạch; test `apps/api/test/seed/demo-seed.int-spec.ts` › `demo seed creates 1 campaign, 10 JD, 50 students and is idempotent` |
| AC-2 | `apps/api/test/seed/demo-seed.int-spec.ts` › `seed stops at GĐ2, GĐ4, GĐ6, GĐ7 with consistent campaign state and audit rows` |
| AC-3 | Job CI không có `ANTHROPIC_API_KEY`; sau E2E, AI Service không ghi lượt gọi Claude API thật nào (dấu hiệu nhận biết chế độ fixture theo US-2.2) |
| AC-4 | `apps/web/e2e/main-flow.spec.ts` › `GĐ2–GĐ8 main flow from CV upload to HR decision` (project desktop và điện thoại); `BR-11 HR of another company cannot open nomination` |
| AC-5 | `k6 run apps/api/test/load/exam-room.k6.js` đạt mọi threshold; script kiểm tra sau khi chạy báo 0 đáp án bị mất |
| AC-6 | `docs/tests/test-reports/runs/2026-12-DD-EPIC-6-run1.md` › mục NFR-6 có p50/p95/max < 30 giây |
| AC-7 | Cùng file báo cáo › mục NFR-8 có hai số đo < 1 phút |
| AC-8 | Cùng file báo cáo › mục NFR-7 ghi cách đo, giả định, kết quả |
| AC-9 | Cùng file báo cáo › mục chi phí có tổng chi phí demo, chi phí/SV và ước tính 60 USD |
| AC-10 | `cat VERSION` ra `1.0.0`; `npx -y -p @koniverse/koni-docs koni-docs validate --docs-path docs/` không lỗi; `docs/tests/test-reports/releases/v1.0.0.md` tồn tại |
| AC-11 | `git log --oneline <sha-1.0.0>..HEAD` chỉ có commit `fix:`; `docs/CONTEXT.md` có mục D về đóng băng code |

## Changelog entry

### Added
- Seed đợt demo 50 sinh viên × 10 JD, chọn được điểm dừng theo giai đoạn (GĐ2, GĐ4, GĐ6, GĐ7), tạo dữ liệu qua `transitionTo` và có audit.
- E2E Playwright cho luồng chính (nộp CV → chọn NV → thi → phân bổ → HR duyệt), chạy cả viewport điện thoại cho cổng sinh viên, chạy trong CI.
- Kiểm thử tải phòng thi bằng k6 với 200 sinh viên đồng thời, kèm script xác nhận không mất bài.
- Báo cáo phát hành 1.0.0: kết quả E2E, k6, số đo NFR-6 … NFR-9, chi phí LLM của đợt demo.

### Changed
- `VERSION` lên 1.0.0 — bản dùng để bảo vệ đồ án; code đóng băng sau mốc này.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD › Non-Functional Requirements](../../PRD.md#non-functional-requirements)
- [Epic EPIC-6](../epics/EPIC-6.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D19, D20](../../CONTEXT.md)
- [sprints/README › Lộ trình](../README.md#lộ-trình)
