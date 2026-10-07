---
id: US-5.1
title: "Allocation Engine và property-based test"
epic: EPIC-5
status: backlog
priority: P0
points: 5
sprint:
version_shipped:
prd_ref:
  - FR-26
  - NFR-8
arch_ref:
  - AD-7
depends_on:
  - US-1.1
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Hệ thống có một thuật toán phân bổ mà cùng đầu vào luôn cho cùng danh sách đề cử, không JD nào nhận quá sức chứa và không có cặp bất ổn định. Ba tính chất này được chứng minh bằng property-based test trên hàng nghìn bộ dữ liệu ngẫu nhiên, và ví dụ minh họa của PRD là một test cố định. Sau story này, [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md), [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) và mô phỏng [US-6.4](US-6.4-allocation-simulation-vs-baselines.md) chỉ cần dựng đầu vào rồi gọi engine. Không story nào phải viết lại Deferred Acceptance, quy tắc phá hòa hay công thức sức chứa.

## Background

PRD › *Thuật toán phân bổ* mô tả bài toán ghép cặp có sức chứa (College Admissions). Mỗi SV có danh sách NV theo thứ tự, mỗi JD có sức chứa `C_j = ⌈chỉ tiêu_j × k⌉` và xếp hạng SV theo S_final. Trong một vòng, mỗi SV được đề cử vào tối đa 1 JD. [CONTEXT D7](../../CONTEXT.md) (AD-7) chọn Deferred Acceptance phía sinh viên đề xuất vì nó ổn định, ưu tiên người điểm cao, khiến SV không được lợi khi khai sai NV, và tất định. Tham lam theo cặp và ILP/min-cost flow bị loại khỏi vai trò thuật toán chính; chúng chỉ là phương án đối chứng ở US-6.4.

ARCH › *Allocation Engine* chốt cách cài đặt: hàm TypeScript thuần trong `apps/api/src/modules/allocation/domain/`, không phụ thuộc AI hay CSDL. Hàm so sánh tại mỗi JD áp dụng S_final rồi quy tắc phá hòa của PRD › *Điểm tổng hợp (S_final)* (S_test → S_cv → GPA → nộp bài test sớm hơn), cuối cùng so mã SV để thứ hạng luôn chặt. SV bị hạ ưu tiên theo BR-16 xếp sau mọi người ngay trong hàm này. Điểm lưu trong DB kiểu `numeric(5,2)` được quy về số nguyên (×100) trước khi so sánh. Sau mỗi lần chạy, `checkStability()` kiểm tra lại kết quả (AGENTS › Nguyên tắc bất biến 9).

GĐ10 định nghĩa sức chứa ở vòng r: `C_j(r) = max(0, ⌈(chỉ tiêu_j − đã nhận_j) × k⌉ − đang trong quy trình_j)`. Công thức là quy tắc tính toán thuần nên đặt ở đây cùng engine; US-5.5 gọi nó.

Story này phủ phần thuật toán của FR-26 và phần engine của NFR-8 (phân bổ < 1 phút; ARCH đặt mức engine < 1 giây với vài nghìn SV). Phần chạy vòng trên DB, snapshot, dự thảo và công bố thuộc US-5.2. Theo [CONTEXT D20](../../CONTEXT.md), story làm ở T2 (W42), làn B, chỉ phụ thuộc US-1.1. Làm sớm để US-6.4 có số liệu mô phỏng từ T4.

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** đầu vào của PRD › *Ví dụ minh họa* (An, Bình, Chi, Dũng; JD A, B, C; chỉ tiêu A = 1, B = 2, C = 1; k = 1; S_final như bảng), **When** gọi `deferredAcceptance`, **Then** kết quả là A – Bình; B – Chi, An; C – Dũng, cả 4 SV có đề cử **And** `checkStability` trả `ok: true`. Test cố định có tên `PRD example: A–Bình; B–Chi, An; C–Dũng`.
- [ ] **AC-2** — **Given** fast-check sinh ít nhất 1.000 bộ đầu vào ngẫu nhiên (số SV, số JD, sức chứa gồm cả 0, danh sách NV dài từ 0 đến N, điểm cố ý trùng nhau nhiều, có SV bị hạ ưu tiên), **When** chạy engine, **Then** `checkStability` không báo `BLOCKING_PAIR` nào: không tồn tại cặp (SV a, JD x) mà a thích x hơn kết quả của mình, đồng thời x còn chỗ hoặc đang giữ người xếp dưới a.
- [ ] **AC-3** — **Given** cùng bộ sinh dữ liệu, **When** chạy engine, **Then** số SV được giữ tại mỗi JD ≤ sức chứa của JD đó (BR-09) **And** mỗi SV có tối đa 1 JD **And** JD đó nằm trong danh sách NV của SV.
- [ ] **AC-4** — **Given** một đầu vào bất kỳ, **When** chạy engine hai lần, và chạy lại sau khi hoán vị thứ tự chèn SV và JD trong các `Map`, **Then** cả ba kết quả giống hệt nhau, kể cả thứ tự SV trong danh sách đề cử của từng JD (sắp theo thứ hạng tại JD).
- [ ] **AC-5** — Hàm so sánh chặt và đúng quy tắc phá hòa. Thứ tự ưu tiên giảm dần: SV không bị hạ ưu tiên (BR-16) đứng trước SV bị hạ ưu tiên → S_final cao hơn → S_test cao hơn → S_cv cao hơn → GPA cao hơn → nộp bài test sớm hơn → `student_code` nhỏ hơn theo thứ tự chuỗi (chiều so mã SV là đề xuất, xem Dev notes). Mỗi mức có một unit test trong đó các mức trên bằng nhau. Hàm không bao giờ trả 0 với hai SV khác nhau.
- [ ] **AC-6** — **Given** `compareAt` do bên gọi truyền vào trả 0 cho hai SV khác nhau, **When** engine so sánh hai SV đó, **Then** engine ném `NonStrictComparatorError` và không trả kết quả.
- [ ] **AC-7** — `toCentiScore` chuyển giá trị `numeric(5,2)` (chuỗi từ Drizzle hoặc số) thành số nguyên ×100 bằng cách tách chuỗi, không nhân số thực: `"80.29"` → 8029, `"0.29"` → 29, `"100"` → 10000, `"7.5"` → 750. Chuỗi sai định dạng (`"abc"`, `"1.234"`, `""`) hoặc số âm thì ném lỗi. Property: với mọi số nguyên n trong [0, 10000], `toCentiScore(format(n)) === n`.
- [ ] **AC-8** — `computeCapacity({ quota, accepted, inProcess, k })` trả `max(0, ⌈(quota − accepted) × k⌉ − inProcess)`, tính bằng số nguyên (k quy về ×100 trước khi nhân): `(10, 0, 0, 1.1)` → 11 (không phải 12 do sai số dấu phẩy động); `(2, 0, 0, 1.5)` → 3; `(3, 1, 1, 1.5)` → 2; `(1, 1, 0, 1.5)` → 0; `(2, 0, 5, 1.5)` → 0. Đầu vào âm hoặc `accepted > quota` thì ném lỗi.
- [ ] **AC-9** — **Given** kết quả bị sửa cố ý theo từng kiểu: một JD vượt sức chứa; một SV được gán vào JD ngoài danh sách NV; một SV xuất hiện ở hai JD; một cặp chặn (SV a bị đẩy xuống NV thấp hơn trong khi JD x mà a thích hơn còn chỗ hoặc giữ người xếp dưới a), **When** gọi `checkStability`, **Then** kết quả là `ok: false` với đúng loại vi phạm (`OVER_CAPACITY`, `NOT_IN_PREFERENCES`, `DUPLICATE_ASSIGNMENT`, `BLOCKING_PAIR`) và nêu đúng SV, JD liên quan.
- [ ] **AC-10** — Trường hợp biên: đầu vào rỗng trả kết quả rỗng; SV không có NV nằm trong `unassigned`; JD có sức chứa 0 hoặc không có trong `capacity` không giữ ai; SV có NV trỏ tới JD không có rank key, hoặc một JD lặp lại trong danh sách NV của cùng SV, thì engine ném `InvalidAllocationInputError`.
- [ ] **AC-11** — `apps/api/src/modules/allocation/domain/` là code thuần (Nguyên tắc 9, 13): không import `@nestjs/*`, `drizzle-orm`, `ioredis`, `@golevelup/*`, module khác của `apps/api`, không đọc đồng hồ hay số ngẫu nhiên (`Date.now`, `new Date()`, `Math.random`), không I/O. Luật dependency-cruiser cho thư mục này chạy trong CI và fail khi vi phạm.
- [ ] **AC-12** — **Given** 5.000 SV, mỗi SV 3 NV, 200 JD với sức chứa ngẫu nhiên, **When** chạy `deferredAcceptance` rồi `checkStability`, **Then** tổng thời gian < 1 giây (NFR-8, ARCH › *Allocation Engine*).
- [ ] **AC-13** — Bộ sinh dữ liệu fast-check `arbAllocationInput(options)` được export để US-5.2, US-5.5, US-6.4 dùng lại. Options gồm số SV, số JD, số NV tối đa, mật độ điểm trùng, tỷ lệ SV bị hạ ưu tiên. Bộ sinh có test riêng: mọi đầu vào sinh ra đều hợp lệ theo AC-10 (không ném lỗi).

## Tasks

- [ ] **TASK-5.1.1** — Kiểu dữ liệu, lỗi và chuẩn hóa điểm (AC: 7, 10)
  - [ ] Subtask 5.1.1.1 — `apps/api/src/modules/allocation/domain/types.ts`: `StudentId`, `JdId`, `AllocationInput` (như ARCH: `preferences`, `capacity`, `compareAt`), `AllocationResult` (`held: Map<JdId, StudentId[]>`, `unassigned: StudentId[]` — trường `unassigned` là đề xuất), `RankKey` (`demoted`, `sFinal`, `sTest`, `sCv`, `gpa`, `submittedAt`, `studentCode`; điểm đã ×100, `submittedAt` là epoch ms do bên gọi truyền vào).
  - [ ] Subtask 5.1.1.2 — `domain/score.ts`: `toCentiScore(value: string | number): number`, tách phần nguyên và phần thập phân, không nhân số thực.
  - [ ] Subtask 5.1.1.3 — `domain/errors.ts`: `InvalidAllocationInputError`, `NonStrictComparatorError`.
- [ ] **TASK-5.1.2** — Hàm so sánh chặt theo S_final và quy tắc phá hòa (AC: 5)
  - [ ] Subtask 5.1.2.1 — `domain/compare.ts`: `compareRankKeys(a, b)` theo thứ tự ở AC-5; `buildCompareAt(rankKeys: Map<JdId, Map<StudentId, RankKey>>)` trả `compareAt` cho engine.
  - [ ] Subtask 5.1.2.2 — `domain/__tests__/compare.spec.ts`: một test cho mỗi mức phá hòa, tên test chứa "S_final tie-break" hoặc "BR-16".
- [ ] **TASK-5.1.3** — Engine Deferred Acceptance (AC: 1, 4, 6, 10)
  - [ ] Subtask 5.1.3.1 — `domain/deferred-acceptance.ts`: `deferredAcceptance(input)` theo code mẫu ở ARCH › *Allocation Engine*; kiểm tra đầu vào trước khi chạy; ném `NonStrictComparatorError` khi `compareAt` trả 0; trả `held` (danh sách mỗi JD đã sắp theo thứ hạng) và `unassigned` (đã sắp theo `StudentId`).
  - [ ] Subtask 5.1.3.2 — `domain/__tests__/deferred-acceptance.spec.ts`: test cố định ví dụ PRD; các trường hợp biên của AC-10.
- [ ] **TASK-5.1.4** — `checkStability` (AC: 2, 3, 9)
  - [ ] Subtask 5.1.4.1 — `domain/check-stability.ts`: `checkStability(input, result)` trả `{ ok, violations }`; mỗi vi phạm có `type` và các ID liên quan.
  - [ ] Subtask 5.1.4.2 — `domain/__tests__/check-stability.spec.ts`: bốn kiểu kết quả bị sửa cố ý của AC-9.
- [ ] **TASK-5.1.5** — Sức chứa theo vòng (AC: 8)
  - [ ] Subtask 5.1.5.1 — `domain/capacity.ts`: `computeCapacity({ quota, accepted, inProcess, k })` bằng số học nguyên.
  - [ ] Subtask 5.1.5.2 — `domain/__tests__/capacity.spec.ts`: các ca ở AC-8, tên test chứa "GĐ10 C_j(r)".
- [ ] **TASK-5.1.6** — Bộ sinh dữ liệu và property-based test (AC: 2, 3, 4, 13)
  - [ ] Subtask 5.1.6.1 — `domain/__tests__/arbitraries.ts`: `arbAllocationInput(options)`; `student_code` luôn duy nhất để thứ hạng chặt; điểm lấy từ khoảng hẹp để tạo nhiều ca hòa.
  - [ ] Subtask 5.1.6.2 — `domain/__tests__/allocation.property.spec.ts`: ba property (ổn định, không vượt sức chứa, tất định) với `numRuns ≥ 1000`; in `seed` khi fail để tái hiện.
  - [ ] Subtask 5.1.6.3 — `domain/__tests__/arbitraries.spec.ts`: đầu vào sinh ra luôn hợp lệ.
- [ ] **TASK-5.1.7** — Rào chắn tính thuần, đo hiệu năng, API công khai (AC: 11, 12)
  - [ ] Subtask 5.1.7.1 — Thêm luật cho `apps/api/src/modules/allocation/domain/` vào cấu hình dependency-cruiser do US-1.1 tạo.
  - [ ] Subtask 5.1.7.2 — `domain/__tests__/allocation.perf.spec.ts`: đo 5.000 SV × 3 NV × 200 JD.
  - [ ] Subtask 5.1.7.3 — `domain/index.ts`: export `deferredAcceptance`, `checkStability`, `compareRankKeys`, `buildCompareAt`, `computeCapacity`, `toCentiScore` và các kiểu.

## Dev notes

### Architecture constraints

- [AD-7](../../ARCHITECTURE.md#architecture-decisions): phân bổ bằng Deferred Acceptance phía sinh viên đề xuất, hàm TS thuần, không dùng LLM, kiểm tra ổn định sau mỗi lần chạy. Không dùng tham lam theo cặp hay ILP làm thuật toán chính ([CONTEXT D7](../../CONTEXT.md)); hai phương án đó chỉ có trong `simulation/` ở US-6.4. Không dùng LLM ở bất kỳ bước nào (ARCH › *Những chỗ cố ý KHÔNG dùng LLM*).
- ARCH › *Allocation Engine*: chữ ký `AllocationInput` và vòng lặp của engine lấy theo code mẫu. Hàm so sánh chứa toàn bộ quy tắc phá hòa và cờ hạ ưu tiên (BR-16); bên gọi không tự sắp xếp. Không dùng worker thread.
- AGENTS › Nguyên tắc bất biến 9 và 13: `domain/` không import NestJS hay Drizzle. Engine không đọc đồng hồ: thời điểm nộp bài là dữ liệu đầu vào, nên kết quả chỉ phụ thuộc đầu vào.
- Thư viện: chỉ dùng Jest và fast-check (ARCH › *Thư viện chính*). Không thêm thư viện heap. Engine sắp lại danh sách tạm giữ ở mỗi lượt như code mẫu; nếu AC-12 không đạt thì tự viết binary heap trong `domain/`.
- Chiều so `student_code` ở mức phá hòa cuối: ARCH chỉ ghi "cuối cùng so mã sinh viên", không ghi chiều. Story tạm dùng thứ tự chuỗi tăng dần. Đây là đề xuất, hỏi trước khi chốt.
- Chạm Q3 (hệ số đề cử k): tạm dùng Đề xuất k = 1,5, đưa thành tham số `campaigns.config.k`; hỏi trước khi chốt. Engine và `computeCapacity` nhận k là tham số, không hard-code. Tên khóa trong `campaigns.config` theo schema của [US-1.4](US-1.4-campaign-setup-and-config.md).
- Chạm Q4 (SV từ chối lời mời): tạm dùng Đề xuất "xếp ưu tiên thấp nhất ở vòng sau", đưa thành tham số `campaigns.config.offer_decline_policy` (tên khóa là đề xuất); hỏi trước khi chốt. Engine chỉ nhận cờ `demoted` trong `RankKey`; việc ai bị hạ ưu tiên do US-5.4, US-5.5 quyết định từ dữ liệu.
- Story không thêm AD mới.

### Cross-story dependencies

- Builds on [US-1.1](US-1.1-scaffold-monorepo-docker-compose-ci.md) — dùng cấu hình Jest, fast-check, dependency-cruiser và CI do story đó dựng.
- Required by [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md) — dùng `deferredAcceptance`, `checkStability`, `buildCompareAt`, `toCentiScore`, `arbAllocationInput`.
- Required by [US-5.4](US-5.4-interviews-reserve-and-offers.md) — chọn SV Dự bị được lên Đạt theo `compareRankKeys`, gọi qua service export của module `allocation`.
- Required by [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) — dùng `computeCapacity` cho C_j(r) và `arbAllocationInput` cho property test nhiều vòng.
- Required by [US-6.4](US-6.4-allocation-simulation-vs-baselines.md) — mô phỏng phải chạy đúng engine này và dùng lại `arbAllocationInput`. Cách gọi engine TS từ `simulation/` (ARCH ghi là notebook Python) do US-6.4 chốt.
- Sibling [US-1.2](US-1.2-core-db-schema-transition-audit-log.md), [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md) — cùng tuần T2 ở làn A. Chỉ có thể đụng nhau ở file cấu hình dependency-cruiser; merge US-5.1 sau nếu cả hai cùng sửa file đó.

### Performance budget

- Engine: `deferredAcceptance` + `checkStability` < 1 giây với 5.000 SV × 3 NV × 200 JD. ARCH ghi "vài nghìn SV"; mốc 5.000 là đề xuất để có dư.
- Đo bằng `domain/__tests__/allocation.perf.spec.ts`, lấy thời gian tốt nhất trong 3 lần chạy để giảm nhiễu.
- Cả vòng phân bổ < 1 phút (NFR-8) được đo ở US-5.2 trên DB thật.
- Mô tả PR phải ghi rõ số đo.

### What we explicitly did NOT do

- Không đọc DB, không snapshot, không khóa Redis, không dự thảo hay công bố. Tất cả thuộc US-5.2.
- Không lọc BR-07 (điều kiện cứng, θ_cv, θ_test) và không loại cặp đã bị từ chối (BR-12) trong engine. Bên gọi dựng `preferences` đã lọc. Lý do: engine chỉ giải bài toán ghép cặp và giữ được tính thuần.
- Không có property test cho tính "khai thật là có lợi nhất" (strategy-proof). Kiểm tra nó cần liệt kê các cách khai sai, nặng hơn nhiều so với ba tính chất bắt buộc. Làm lại khi US-6.4 cần số liệu này cho chương thực nghiệm.
- Không dùng heap hay worker thread. Chỉ làm khi AC-12 không đạt.

### References

- [Source: PRD › Thuật toán phân bổ (Bài toán, Thuật toán, Ví dụ minh họa)](../../PRD.md)
- [Source: PRD › Cơ chế chấm điểm › Điểm tổng hợp (S_final) — quy tắc phá hòa](../../PRD.md)
- [Source: PRD › GĐ10 — công thức C_j(r)](../../PRD.md)
- [Source: PRD FR-26, NFR-8](../../PRD.md#functional-requirements)
- [Source: ARCHITECTURE › Core Backend › Allocation Engine](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Testing strategy](../../ARCHITECTURE.md#testing-strategy)
- [Source: ARCHITECTURE › Project structure](../../ARCHITECTURE.md#project-structure)
- [Source: CONTEXT D7, D20](../../CONTEXT.md)
- [Source: EPIC-5 › Cross-cutting invariants](../epics/EPIC-5.md)
- [LESSONS](../../LESSONS.md) — đọc lại khi bắt đầu story và ghi `Lessons applied:`.

## Verification commands

> Chưa có `package.json`. Lệnh chạy cụ thể (Jest, dependency-cruiser) điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case; đường dẫn test là đề xuất, theo quy ước test của US-1.1.

| AC | Command |
|---|---|
| AC-1 | `apps/api/src/modules/allocation/domain/__tests__/deferred-acceptance.spec.ts` › `GĐ7 Allocation Engine › PRD example: A–Bình; B–Chi, An; C–Dũng` |
| AC-2 | `domain/__tests__/allocation.property.spec.ts` › `GĐ7 property: result is always stable (no blocking pair)` |
| AC-3 | `domain/__tests__/allocation.property.spec.ts` › `BR-09 property: no JD exceeds capacity; each student holds at most one JD from own preferences` |
| AC-4 | `domain/__tests__/allocation.property.spec.ts` › `GĐ7 property: deterministic under repeated runs and insertion-order permutation` |
| AC-5 | `domain/__tests__/compare.spec.ts` › `S_final tie-break: S_test`, `… S_cv`, `… GPA`, `… earlier submission`, `… student_code`, `BR-16 demoted ranks after everyone` |
| AC-6 | `domain/__tests__/deferred-acceptance.spec.ts` › `throws NonStrictComparatorError when compareAt returns 0` |
| AC-7 | `domain/__tests__/score.spec.ts` › `toCentiScore parses numeric(5,2) without float math`, `toCentiScore round-trips every integer in [0, 10000]` |
| AC-8 | `domain/__tests__/capacity.spec.ts` › `GĐ10 C_j(r) uses integer arithmetic (10 × 1.1 = 11)`, `GĐ10 C_j(r) never negative` |
| AC-9 | `domain/__tests__/check-stability.spec.ts` › `detects OVER_CAPACITY`, `detects NOT_IN_PREFERENCES`, `detects DUPLICATE_ASSIGNMENT`, `detects BLOCKING_PAIR` |
| AC-10 | `domain/__tests__/deferred-acceptance.spec.ts` › `edge cases: empty input, no preferences, zero capacity, duplicate JD, missing rank key` |
| AC-11 | `rg -n "from '(@nestjs\|drizzle-orm\|ioredis\|@golevelup)" apps/api/src/modules/allocation/domain` trả 0 dòng; `rg -n "Date\.now\|new Date\(\|Math\.random" apps/api/src/modules/allocation/domain --glob '!__tests__/**'` trả 0 dòng; dependency-cruiser trong CI không báo lỗi |
| AC-12 | `domain/__tests__/allocation.perf.spec.ts` › `NFR-8 engine runs 5,000 students × 3 preferences × 200 JDs under 1s` |
| AC-13 | `domain/__tests__/arbitraries.spec.ts` › `arbAllocationInput always produces valid input` |

## Changelog entry

### Added
- Allocation Engine trong `apps/api/src/modules/allocation/domain/`: `deferredAcceptance` (Deferred Acceptance phía sinh viên đề xuất), hàm so sánh chặt theo S_final và quy tắc phá hòa (có cờ hạ ưu tiên BR-16), `checkStability`, `computeCapacity` cho C_j(r), `toCentiScore` quy điểm về số nguyên.
- Property-based test (fast-check) cho ba tính chất ổn định, không vượt sức chứa, tất định; test cố định theo ví dụ minh họa của PRD; bộ sinh dữ liệu `arbAllocationInput` dùng lại cho vòng phân bổ và mô phỏng.

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-26, NFR-8](../../PRD.md#functional-requirements)
- [ARCHITECTURE AD-7](../../ARCHITECTURE.md#architecture-decisions)
- [Epic EPIC-5](../epics/EPIC-5.md)
- [CONTEXT D7, D20](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
- [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md) · [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) · [US-6.4](US-6.4-allocation-simulation-vs-baselines.md)
