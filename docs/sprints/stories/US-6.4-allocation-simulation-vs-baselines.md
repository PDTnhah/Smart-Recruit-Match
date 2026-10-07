---
id: US-6.4
title: "Mô phỏng phân bổ so với baseline"
epic: EPIC-6
status: backlog
priority: P1
points: 5
sprint:
version_shipped:
prd_ref: [FR-36]
depends_on: [US-5.1]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Có số liệu và biểu đồ cho thấy Deferred Acceptance (DA) tốt hơn ba phương án đối chứng (tự do ứng tuyển, tham lam theo cặp, ILP) trên dữ liệu giả lập có nguyện vọng dồn vào vài công ty "hot". Đây là lõi của chương thực nghiệm và là bằng chứng định lượng cho vấn đề P1 (dồn hồ sơ). Làm ở Tuần 4 để có số liệu từ mốc M1 và viết chương báo cáo sớm.

## Background

FR-36 (P1) nằm trong mức "Nên có: thực nghiệm so sánh với các baseline" của PRD › *Phạm vi MVP cho đồ án*. PRD › *Phương án đối chứng cho phần thực nghiệm* định nghĩa ba phương án:

- **Baseline 1 – Tự do ứng tuyển:** mỗi sinh viên gửi hồ sơ cho tất cả NV, HR tự lọc.
- **Baseline 2 – Tham lam theo cặp:** sắp mọi cặp (SV, JD) theo S_final giảm dần, lần lượt gán nếu sinh viên chưa có đề cử và JD còn suất (bỏ qua thứ tự NV).
- **Tối ưu toàn cục (ILP / min-cost flow):** `max Σ S_final · x_ij` với `Σ_j x_ij ≤ 1`, `Σ_i x_ij ≤ C_j`, có thể thêm ràng buộc mềm "mỗi JD tối thiểu m_j hồ sơ".

So sánh theo hàng *Phân bổ* của PRD › *Chỉ số đánh giá hệ thống*: tỷ lệ lấp đầy chỉ tiêu; tỷ lệ sinh viên có đề cử; tỷ lệ vào NV1 / top-3; độ lệch chuẩn của tỷ lệ hồ sơ/chỉ tiêu giữa các JD; số cặp bất ổn định. Khi thiếu dữ liệu thật, PRD cho sinh dữ liệu giả lập với nguyện vọng lệch về vài công ty "hot". BRIEF › Success Criteria đặt mục tiêu khi bảo vệ: tỷ lệ lấp đầy và tỷ lệ SV có đề cử cao hơn, độ lệch hồ sơ/chỉ tiêu thấp hơn tự do ứng tuyển.

CONTEXT D7 giữ tham lam theo cặp và ILP làm phương án đối chứng, không dùng làm thuật toán chính. ARCH › *Allocation Engine* đặt ILP trong `simulation/` bằng Python + OR-Tools, chỉ để so sánh; ARCH › *Testing strategy* ghi công cụ mô phỏng là notebook trong `simulation/`. "Tối ưu ILP" ở mục Out of Scope của BRIEF và *Mở rộng* của PRD là ILP làm thuật toán phân bổ của sản phẩm; story này chỉ dùng ILP làm đối chứng (EPIC-5 › Out of scope).

Epic đặt hai invariant cho story: mô phỏng dùng đúng engine của [US-5.1](US-5.1-allocation-engine-property-tests.md), không viết lại DA; mỗi số liệu ghi phiên bản dữ liệu và cấu hình. Story làm ở T4 (W44), làn B, ngay sau engine (T2). CONTEXT D20 đưa nó lên sớm vì không phụ thuộc DB hay AI.

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** bộ tham số kịch bản (số SV, số JD, phân bố chỉ tiêu, `N_NV`, `k`, mức lệch về công ty "hot", phân bố điểm, `seed`), **When** chạy bộ sinh dữ liệu, **Then** ra file kịch bản JSON chứa nguyện vọng có thứ tự, S_final của từng cặp NV dạng số nguyên (×100), các trường phá hòa (S_test, S_cv, GPA, thời điểm nộp bài, mã SV) và sức chứa `C_j = ⌈chỉ tiêu_j × k⌉` **And** cùng tham số và `seed` cho file giống hệt từng byte.
- [ ] **AC-2** — **Given** hai kịch bản chỉ khác mức lệch, **When** sinh dữ liệu với cùng `seed`, **Then** kịch bản có mức lệch lớn hơn có tỷ lệ NV1 rơi vào nhóm JD "hot" lớn hơn **And** mức lệch 0 cho NV1 phân bố đều giữa các JD; tỷ lệ thực tế được in trong báo cáo kịch bản.
- [ ] **AC-3** — **Given** một file kịch bản, **When** chạy DA, **Then** kết quả lấy từ `deferredAcceptance` và hàm dựng `compareAt` do US-5.1 export, qua một runner Node đọc JSON và ghi JSON **And** `checkStability()` chạy sau mỗi kịch bản và qua **And** `simulation/` không chứa bản cài đặt DA thứ hai.
- [ ] **AC-4** — Runner ở AC-3 xuất thêm thứ tự xếp hạng của các SV tại mỗi JD theo `compareAt` của US-5.1. Baseline 2, ILP và phép đếm cặp bất ổn định dùng thứ tự này; `simulation/` không viết lại quy tắc phá hòa.
- [ ] **AC-5** — **Given** một kịch bản, **When** chạy Baseline 1, **Then** mỗi SV gửi hồ sơ tới mọi NV; mỗi JD nhận hồ sơ và chọn theo giả định mô hình hóa ghi ở Dev notes (đề xuất) **And** giả định đó được in trong báo cáo cùng số liệu.
- [ ] **AC-6** — **Given** một kịch bản, **When** chạy Baseline 2, **Then** mọi cặp (SV, JD) trong tập NV được sắp theo S_final giảm dần (hòa thì theo thứ tự ở AC-4), lần lượt gán nếu SV chưa có đề cử và JD còn sức chứa, đúng định nghĩa của PRD.
- [ ] **AC-7** — **Given** một kịch bản, **When** chạy phương án tối ưu toàn cục, **Then** lời giải tối đa hóa `Σ S_final · x_ij` với `Σ_j x_ij ≤ 1` và `Σ_i x_ij ≤ C_j` trên tập cặp NV **And** tham số `m_j` (ràng buộc mềm, mặc định tắt) bật được **And** trạng thái bộ giải (tối ưu / không tối ưu / hết giờ) được ghi; lời giải không tối ưu bị đánh dấu trong báo cáo **And** cùng kịch bản cho cùng lời giải.
- [ ] **AC-8** — Cả bốn phương án được đo bằng cùng một hàm cho từng chỉ số: tỷ lệ lấp đầy, tỷ lệ SV có đề cử, tỷ lệ vào NV1 và top-3 (trên tổng số SV), độ lệch chuẩn của (số hồ sơ JD nhận / chỉ tiêu) giữa các JD, số cặp bất ổn định **And** DA luôn có 0 cặp bất ổn định, khớp với `checkStability()`.
- [ ] **AC-9** — Ví dụ minh họa của PRD là một kịch bản cố định (4 SV, 3 JD, k = 1): DA cho **A – Bình; B – Chi, An; C – Dũng**; Baseline 1 cho A nhận 3 hồ sơ cho 1 suất, B nhận 1 hồ sơ cho 2 suất, C không có hồ sơ.
- [ ] **AC-10** — Mỗi lần chạy ghi `simulation/results/<scenario_id>/` gồm tham số kịch bản, hash cấu hình, phiên bản bộ sinh dữ liệu, `seed`, commit git của engine, tham số từng phương án, số liệu (JSON/CSV) và biểu đồ **And** chạy lại cùng cấu hình cho cùng số liệu **And** mỗi biểu đồ ghi `scenario_id` và hash cấu hình trong chú thích.
- [ ] **AC-11** — Notebook trong `simulation/` vẽ biểu đồ so sánh bốn phương án cho từng chỉ số ở AC-8 theo các mức lệch **And** có một kịch bản quy mô 500 SV × 50 JD, ghi thời gian chạy của engine để đối chiếu với ngân sách của US-5.1.

## Tasks

- [ ] **TASK-6.4.1** — Hỏi người dùng về thư viện và cách đóng gói Python của `simulation/` trước khi cài; ghi mục D mới vào `docs/CONTEXT.md` nếu được duyệt (AC: 7, 10, 11)
  - [ ] Subtask 6.4.1.1 — Jupyter, numpy/pandas, matplotlib, OR-Tools không có trong ARCH › Tech stack hay *Thư viện chính* (OR-Tools chỉ được nhắc ở *Allocation Engine*).
- [ ] **TASK-6.4.2** — Runner Node gọi engine của US-5.1 (AC: 3, 4, 11)
  - [ ] Subtask 6.4.2.1 — Đề xuất `simulation/engine_runner/run_da.mjs`: đọc file kịch bản, dựng `AllocationInput`, gọi `deferredAcceptance`, `checkStability`, ghi đề cử và thứ tự xếp hạng tại mỗi JD ra JSON. Chạy trên bản build của `apps/api` theo script build của US-1.1; không thêm công cụ chạy TS mới khi chưa hỏi.
  - [ ] Subtask 6.4.2.2 — Ghi thời gian chạy của `deferredAcceptance` vào JSON đầu ra.
- [ ] **TASK-6.4.3** — Bộ sinh dữ liệu (AC: 1, 2, 9)
  - [ ] Subtask 6.4.3.1 — `simulation/generator.py`: tham số kịch bản, `seed`, mức lệch "hot", xuất JSON sắp khóa (`sort_keys`) để file tất định.
  - [ ] Subtask 6.4.3.2 — `simulation/scenarios/prd_example.json`: ví dụ minh họa của PRD.
- [ ] **TASK-6.4.4** — Ba phương án đối chứng (AC: 5, 6, 7)
  - [ ] Subtask 6.4.4.1 — `simulation/baselines/free_application.py` theo giả định ở Dev notes.
  - [ ] Subtask 6.4.4.2 — `simulation/baselines/greedy_pairs.py`.
  - [ ] Subtask 6.4.4.3 — `simulation/baselines/global_optimum.py`: OR-Tools; seed cố định và một luồng giải để kết quả tất định.
- [ ] **TASK-6.4.5** — Hàm đo chỉ số dùng chung cho mọi phương án (AC: 8)
  - [ ] Subtask 6.4.5.1 — `simulation/metrics.py`: năm chỉ số ở AC-8; định nghĩa từng chỉ số ghi ở docstring và in vào báo cáo.
- [ ] **TASK-6.4.6** — Notebook, thư mục kết quả, biểu đồ (AC: 10, 11)
  - [ ] Subtask 6.4.6.1 — `simulation/notebooks/compare_allocation.ipynb`: quét mức lệch, gọi bộ sinh dữ liệu, runner, baseline, `metrics.py`; vẽ biểu đồ.
  - [ ] Subtask 6.4.6.2 — Ghi `simulation/results/<scenario_id>/` kèm siêu dữ liệu ở AC-10.
- [ ] **TASK-6.4.7** — Test (AC: 1, 2, 3, 4, 6, 8, 9)
  - [ ] Subtask 6.4.7.1 — `simulation/tests/test_generator.py`, `test_baselines.py`, `test_metrics.py`, `test_prd_example.py`.

## Dev notes

### Architecture constraints

- [AD-7](../../ARCHITECTURE.md#architecture-decisions): DA phía sinh viên đề xuất là hàm TS thuần trong `apps/api/src/modules/allocation/domain/`. Mô phỏng gọi đúng hàm đó (invariant của EPIC-6). Phương án bị loại: viết lại DA bằng Python cho tiện notebook — hai bản có thể lệch, và số liệu thực nghiệm sẽ không phản ánh hệ thống thật.
- AGENTS › Nguyên tắc 9: điểm quy về số nguyên (×100) trước khi so sánh; hàm so sánh luôn chặt. Bộ sinh dữ liệu xuất S_final dạng số nguyên ngay từ đầu; thứ tự tại mỗi JD lấy từ `compareAt` của US-5.1 (AC-4), nên baseline và phép đếm cặp bất ổn định không cần quy tắc phá hòa riêng.
- ARCH › *Allocation Engine*: ILP đặt trong `simulation/`, Python + OR-Tools, chỉ để so sánh. Khi không bật `m_j`, bài toán là luồng chi phí nhỏ nhất và giải chính xác được; khi bật `m_j` thì dùng bộ giải ILP. Tên file `global_optimum.py` là đề xuất.
- **Điểm cần hỏi — cầu nối Python ↔ TypeScript.** ARCH đặt mô phỏng trong notebook Python nhưng engine viết bằng TS, và không nói hai bên nối với nhau thế nào. Đề xuất: trao đổi bằng file JSON qua runner Node ở TASK-6.4.2. [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md) cũng cần cách này để gọi hàm S_cv.
- **Điểm cần hỏi — giả định mô hình hóa Baseline 1.** PRD chỉ ghi "HR tự lọc". Đề xuất: mỗi JD chọn tối đa `C_j` hồ sơ có thứ hạng cao nhất trong số hồ sơ nhận được, chọn một lần, không biết SV đó có được JD khác chọn không; SV được nhiều JD chọn giữ JD có thứ tự NV cao nhất; suất bị bỏ không được lấp lại. Giả định này là tham số và được in trong báo cáo.
- **Điểm cần hỏi — mẫu số của tỷ lệ lấp đầy.** PRD gọi là "tỷ lệ lấp đầy chỉ tiêu", nhưng ở bước phân bổ mỗi JD nhận tới `C_j = ⌈chỉ tiêu × k⌉` đề cử. Đề xuất: báo cả hai, Σ min(đề cử_j, C_j) / Σ C_j và Σ min(đề cử_j, chỉ tiêu_j) / Σ chỉ tiêu_j.
- **Điểm cần hỏi — thư viện.** Xem TASK-6.4.1. AGENTS cấm thêm thư viện ngoài danh sách khi chưa hỏi.
- Chạm Q1 và Q3: tạm dùng Đề xuất (`N_NV` = 3, `k` = 1,5) làm giá trị mặc định của kịch bản, cùng tên với khóa trong `campaigns.config` mà US-1.4 định nghĩa; quét thêm các giá trị khác khi cần. Hỏi trước khi chốt.
- Không dùng LLM, không chạm DB hay RabbitMQ.
- Story này không thêm AD mới.

### Cross-story dependencies

- Builds on [US-5.1](US-5.1-allocation-engine-property-tests.md) — `deferredAcceptance`, hàm dựng `compareAt` (phá hòa S_test → S_cv → GPA → nộp bài sớm → mã SV), `checkStability()`, kiểu `AllocationInput`; test cố định ví dụ PRD.
- Builds on [US-1.1](US-1.1-scaffold-monorepo-docker-compose-ci.md) — script build của `apps/api`.
- Required by [US-6.3](US-6.3-labeled-dataset-and-ai-evals.md) — dùng lại cách gọi hàm TS từ Python qua runner Node.
- Required by [US-6.6](US-6.6-demo-data-e2e-load-test.md) — kịch bản 500 SV × 50 JD dùng để đo lại NFR-8.
- Sibling [US-2.2](US-2.2-llm-client-versioned-prompts.md) — cùng T4, làn B; không sửa chung file.

### What we explicitly did NOT do

- Không mô phỏng vòng bổ sung hay quyết định của HR. Muốn vậy phải mô hình hóa HR từ chối và SV từ chối lời mời, mà spec không có số liệu. Mở lại nếu hội đồng hỏi về hiệu quả nhiều vòng.
- Không dùng dữ liệu đợt thật. Mở lại khi có một đợt thật đã đóng (dùng snapshot `input_snapshot` của US-5.2).
- Không đưa mô phỏng vào CI. Test nhỏ ở `simulation/tests/` chạy được bằng pytest; notebook chạy tay.

### References

- [Source: PRD › Success Criteria (Chỉ số đánh giá hệ thống)](../../PRD.md#success-criteria)
- [Source: PRD › Functional Requirements (FR-36)](../../PRD.md#functional-requirements)
- [Source: PRD › Thuật toán phân bổ (Ví dụ minh họa, Phương án đối chứng cho phần thực nghiệm)](../../PRD.md)
- [Source: BRIEF › Success Criteria](../../BRIEF.md#success-criteria)
- [Source: ARCHITECTURE › Component architecture (Allocation Engine)](../../ARCHITECTURE.md#component-architecture)
- [Source: ARCHITECTURE › Testing strategy (Mô phỏng)](../../ARCHITECTURE.md#testing-strategy)
- [Source: ARCHITECTURE › Project structure (`simulation/`)](../../ARCHITECTURE.md#project-structure)
- [Source: CONTEXT D7, D20](../../CONTEXT.md)
- [Source: EPIC-6](../epics/EPIC-6.md)

## Verification commands

Lệnh chạy cụ thể sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `simulation/tests/test_generator.py` › `test_same_params_and_seed_give_identical_bytes` |
| AC-2 | `simulation/tests/test_generator.py` › `test_p1_higher_skew_concentrates_nv1_on_hot_jds` |
| AC-3 | `simulation/tests/test_prd_example.py` › `test_gd7_da_via_engine_runner_passes_check_stability`; `rg -n -i "def .*deferred\|gale.?shapley" simulation --glob '*.py'` không trả dòng nào |
| AC-4 | `simulation/tests/test_baselines.py` › `test_baselines_use_ts_rank_order_for_ties` |
| AC-5 | `simulation/tests/test_baselines.py` › `test_free_application_follows_documented_assumption` |
| AC-6 | `simulation/tests/test_baselines.py` › `test_greedy_pairs_ignores_preference_order` |
| AC-7 | `simulation/tests/test_baselines.py` › `test_global_optimum_maximizes_total_score_and_is_deterministic` |
| AC-8 | `simulation/tests/test_metrics.py` › `test_gd7_da_has_zero_blocking_pairs`; `test_metrics_same_definition_for_all_methods` |
| AC-9 | `simulation/tests/test_prd_example.py` › `test_gd7_prd_example_a_binh_b_chi_an_c_dung`; `test_free_application_prd_example_overloads_a` |
| AC-10 | Chạy notebook hai lần với cùng cấu hình; `diff -r` hai thư mục `simulation/results/<scenario_id>/` chỉ khác thời điểm chạy |
| AC-11 | Notebook chạy hết không lỗi; thư mục kết quả có biểu đồ cho cả năm chỉ số và kịch bản 500 SV × 50 JD |

## Changelog entry

### Added
- Mô phỏng phân bổ trong `simulation/` (FR-36): bộ sinh dữ liệu giả lập có nguyện vọng lệch về công ty "hot", so sánh Deferred Acceptance với tự do ứng tuyển, tham lam theo cặp và tối ưu toàn cục (OR-Tools).
- Runner Node gọi đúng engine phân bổ của `allocation/domain/`; mỗi kết quả ghi tham số kịch bản, `seed`, hash cấu hình và commit của engine.
- Notebook vẽ biểu đồ năm chỉ số: tỷ lệ lấp đầy, tỷ lệ SV có đề cử, tỷ lệ vào NV1/top-3, độ lệch hồ sơ/chỉ tiêu, số cặp bất ổn định.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-36](../../PRD.md#functional-requirements)
- [Epic EPIC-6](../epics/EPIC-6.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D7, D20](../../CONTEXT.md)
- [US-5.1 — Allocation Engine và property-based test](US-5.1-allocation-engine-property-tests.md)
