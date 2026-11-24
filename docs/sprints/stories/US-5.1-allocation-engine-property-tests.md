---
id: US-5.1
title: "Allocation Engine và property-based test"
epic: EPIC-5
status: review
priority: P0
points: 5
sprint: sprint-2026-W47
version_shipped: 0.32.0
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
updated: 2026-11-24
---

## Goal

Hệ thống có một thuật toán phân bổ mà cùng đầu vào luôn cho cùng danh sách đề cử, không JD nào nhận quá sức chứa và không có cặp bất ổn định. Ba tính chất này được chứng minh bằng property-based test trên hàng nghìn bộ dữ liệu ngẫu nhiên, và ví dụ minh họa của PRD là một test cố định. Sau story này, [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md), [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) và mô phỏng [US-6.4](US-6.4-allocation-simulation-vs-baselines.md) chỉ cần dựng đầu vào rồi gọi engine. Không story nào phải viết lại Deferred Acceptance, quy tắc phá hòa hay công thức sức chứa.

## Background

PRD › *Thuật toán phân bổ* mô tả bài toán ghép cặp có sức chứa (College Admissions). Mỗi SV có danh sách NV theo thứ tự, mỗi JD có sức chứa `C_j = ⌈chỉ tiêu_j × k⌉` và xếp hạng SV theo S_final. Trong một vòng, mỗi SV được đề cử vào tối đa 1 JD. [CONTEXT D7](../../CONTEXT.md) (AD-7) chọn Deferred Acceptance phía sinh viên đề xuất vì nó ổn định, ưu tiên người điểm cao, khiến SV không được lợi khi khai sai NV, và tất định. Tham lam theo cặp và ILP/min-cost flow bị loại khỏi vai trò thuật toán chính; chúng chỉ là phương án đối chứng ở US-6.4.

ARCH › *Allocation Engine* chốt cách cài đặt: hàm TypeScript thuần trong `apps/api/src/modules/allocation/domain/`, không phụ thuộc AI hay CSDL. Hàm so sánh tại mỗi JD áp dụng S_final rồi quy tắc phá hòa của PRD › *Điểm tổng hợp (S_final)* (S_test → S_cv → GPA → nộp bài test sớm hơn), cuối cùng so mã SV để thứ hạng luôn chặt. SV bị hạ ưu tiên theo BR-16 xếp sau mọi người ngay trong hàm này. Điểm lưu trong DB kiểu `numeric(5,2)` được quy về số nguyên (×100) trước khi so sánh. Sau mỗi lần chạy, `checkStability()` kiểm tra lại kết quả (AGENTS › Nguyên tắc bất biến 9).

GĐ10 định nghĩa sức chứa ở vòng r: `C_j(r) = max(0, ⌈(chỉ tiêu_j − đã nhận_j) × k⌉ − đang trong quy trình_j)`. Công thức là quy tắc tính toán thuần nên đặt ở đây cùng engine; US-5.5 gọi nó.

Story này phủ phần thuật toán của FR-26 và phần engine của NFR-8 (phân bổ < 1 phút; ARCH đặt mức engine < 1 giây với vài nghìn SV). Phần chạy vòng trên DB, snapshot, dự thảo và công bố thuộc US-5.2.

**Story refresh (2026-11-24)**: story viết ngày 2026-10-07, trước khi có code. Những điểm đã đổi:

- Jest project `unit` nhận `src/**/*.spec.ts`, nên test đặt ở `domain/__tests__/`. Luật `domain-no-framework` của dependency-cruiser đã áp cho mọi `domain/`.
- Cột `numeric(5,2)` dùng `mode: 'number'` của Drizzle, nên `toCentiScore` chủ yếu nhận số. Số được đọc qua `String(n)`, không nhân.
- `campaigns.config.k` đã có từ US-1.4 (mặc định 1,5, tối thiểu 1) và không giới hạn số chữ số thập phân. `computeCapacity` đọc k như số thập phân chính xác ([CONTEXT D63](../../CONTEXT.md)).
- `gpa4` có thể null. Người dùng chốt: thiếu GPA xếp sau; mã SV so tăng dần (D63).
- Ví dụ `10 × 1.1` của AC-8 không tái hiện được lỗi dấu phẩy động, vì trong JS `10 * 1.1` ra đúng 11. Test dùng thêm ca `50 × 1.1` (số thực ra 55.00000000000001, lấy trần thành 56).

**Lessons applied**: §15 (dừng compose trước khi chạy `pnpm test`); §21 (chạy test của module bằng `--testPathPatterns`); §22 (ca integration đỏ khi chạy chung DB thì chạy riêng để phân biệt); §47 (đổi về LF các file CRLF đã sửa trước khi stage).

## Acceptance criteria

- [x] **AC-1** — **Given** đầu vào của PRD › *Ví dụ minh họa* (An, Bình, Chi, Dũng; JD A, B, C; chỉ tiêu A = 1, B = 2, C = 1; k = 1; S_final như bảng), **When** gọi `deferredAcceptance`, **Then** kết quả là A – Bình; B – Chi, An; C – Dũng, cả 4 SV có đề cử **And** `checkStability` trả `ok: true`. Test cố định có tên `PRD example: A–Bình; B–Chi, An; C–Dũng`.
- [x] **AC-2** — **Given** fast-check sinh ít nhất 1.000 bộ đầu vào ngẫu nhiên (số SV, số JD, sức chứa gồm cả 0, danh sách NV dài từ 0 đến N, điểm cố ý trùng nhau nhiều, có SV bị hạ ưu tiên), **When** chạy engine, **Then** `checkStability` không báo `BLOCKING_PAIR` nào: không tồn tại cặp (SV a, JD x) mà a thích x hơn kết quả của mình, đồng thời x còn chỗ hoặc đang giữ người xếp dưới a.
- [x] **AC-3** — **Given** cùng bộ sinh dữ liệu, **When** chạy engine, **Then** số SV được giữ tại mỗi JD ≤ sức chứa của JD đó (BR-09) **And** mỗi SV có tối đa 1 JD **And** JD đó nằm trong danh sách NV của SV.
- [x] **AC-4** — **Given** một đầu vào bất kỳ, **When** chạy engine hai lần, và chạy lại sau khi hoán vị thứ tự chèn SV và JD trong các `Map`, **Then** cả ba kết quả giống hệt nhau, kể cả thứ tự SV trong danh sách đề cử của từng JD (sắp theo thứ hạng tại JD).
- [x] **AC-5** — Hàm so sánh chặt và đúng quy tắc phá hòa. Thứ tự ưu tiên giảm dần: SV không bị hạ ưu tiên (BR-16) đứng trước SV bị hạ ưu tiên → S_final cao hơn → S_test cao hơn → S_cv cao hơn → GPA cao hơn (thiếu GPA xếp sau) → nộp bài test sớm hơn → `student_code` nhỏ hơn theo thứ tự code unit ([CONTEXT D63](../../CONTEXT.md)). Mỗi mức có một unit test trong đó các mức trên bằng nhau. Hàm không bao giờ trả 0 với hai SV khác nhau.
- [x] **AC-6** — **Given** `compareAt` do bên gọi truyền vào trả 0 cho hai SV khác nhau, **When** engine so sánh hai SV đó, **Then** engine ném `NonStrictComparatorError` và không trả kết quả.
- [x] **AC-7** — `toCentiScore` chuyển giá trị `numeric(5,2)` (chuỗi từ Drizzle hoặc số) thành số nguyên ×100 bằng cách tách chuỗi, không nhân số thực: `"80.29"` → 8029, `"0.29"` → 29, `"100"` → 10000, `"7.5"` → 750. Chuỗi sai định dạng (`"abc"`, `"1.234"`, `""`) hoặc số âm thì ném lỗi. Property: với mọi số nguyên n trong [0, 10000], `toCentiScore(format(n)) === n`.
- [x] **AC-8** — `computeCapacity({ quota, accepted, inProcess, k })` trả `max(0, ⌈(quota − accepted) × k⌉ − inProcess)`, tính bằng số nguyên (k đọc như số thập phân chính xác, D63): `(10, 0, 0, 1.1)` → 11, `(50, 0, 0, 1.1)` → 55 (số thực cho 56); `(2, 0, 0, 1.5)` → 3; `(3, 1, 1, 1.5)` → 2; `(1, 1, 0, 1.5)` → 0; `(2, 0, 5, 1.5)` → 0. Đầu vào âm hoặc `accepted > quota` thì ném lỗi.
- [x] **AC-9** — **Given** kết quả bị sửa cố ý theo từng kiểu: một JD vượt sức chứa; một SV được gán vào JD ngoài danh sách NV; một SV xuất hiện ở hai JD; một cặp chặn (SV a bị đẩy xuống NV thấp hơn trong khi JD x mà a thích hơn còn chỗ hoặc giữ người xếp dưới a), **When** gọi `checkStability`, **Then** kết quả là `ok: false` với đúng loại vi phạm (`OVER_CAPACITY`, `NOT_IN_PREFERENCES`, `DUPLICATE_ASSIGNMENT`, `BLOCKING_PAIR`) và nêu đúng SV, JD liên quan.
- [x] **AC-10** — Trường hợp biên: đầu vào rỗng trả kết quả rỗng; SV không có NV nằm trong `unassigned`; JD có sức chứa 0 hoặc không có trong `capacity` không giữ ai; SV có NV trỏ tới JD không có rank key, hoặc một JD lặp lại trong danh sách NV của cùng SV, thì engine ném `InvalidAllocationInputError`.
- [x] **AC-11** — `apps/api/src/modules/allocation/domain/` là code thuần (Nguyên tắc 9, 13): không import `@nestjs/*`, `drizzle-orm`, `ioredis`, `@golevelup/*`, module khác của `apps/api`, không đọc đồng hồ hay số ngẫu nhiên (`Date.now`, `new Date()`, `Math.random`), không I/O. Luật dependency-cruiser cho thư mục này chạy trong CI và fail khi vi phạm.
- [x] **AC-12** — **Given** 5.000 SV, mỗi SV 3 NV, 200 JD với sức chứa ngẫu nhiên, **When** chạy `deferredAcceptance` rồi `checkStability`, **Then** tổng thời gian < 1 giây (NFR-8, ARCH › *Allocation Engine*).
- [x] **AC-13** — Bộ sinh dữ liệu fast-check `arbAllocationInput(options)` được export để US-5.2, US-5.5, US-6.4 dùng lại. Options gồm số SV, số JD, số NV tối đa, mật độ điểm trùng, tỷ lệ SV bị hạ ưu tiên. Bộ sinh có test riêng: mọi đầu vào sinh ra đều hợp lệ theo AC-10 (không ném lỗi).

## Tasks

- [x] **TASK-5.1.1** — Kiểu dữ liệu, lỗi và chuẩn hóa điểm (AC: 7, 10)
  - [x] Subtask 5.1.1.1 — `domain/types.ts`: `StudentId`, `JdId`, `AllocationInput` (như ARCH: `preferences`, `capacity`, `compareAt`), `AllocationResult` (`held`, `unassigned`), `RankKey` (`demoted`, `sFinal`, `sTest`, `sCv`, `gpa`, `submittedAt`, `studentCode`).
  - [x] Subtask 5.1.1.2 — `domain/score.ts`: `toCentiScore(value: string | number): number`.
  - [x] Subtask 5.1.1.3 — `domain/errors.ts`: `InvalidAllocationInputError`, `NonStrictComparatorError`.
- [x] **TASK-5.1.2** — Hàm so sánh chặt theo S_final và quy tắc phá hòa (AC: 5)
  - [x] Subtask 5.1.2.1 — `domain/compare.ts`: `compareRankKeys(a, b)`, `buildCompareAt(rankKeys)`.
  - [x] Subtask 5.1.2.2 — `domain/__tests__/compare.spec.ts`: một test cho mỗi mức phá hòa.
- [x] **TASK-5.1.3** — Engine Deferred Acceptance (AC: 1, 4, 6, 10)
  - [x] Subtask 5.1.3.1 — `domain/deferred-acceptance.ts`.
  - [x] Subtask 5.1.3.2 — `domain/__tests__/deferred-acceptance.spec.ts`: ví dụ PRD (`prd-example.ts`), các trường hợp biên của AC-10.
- [x] **TASK-5.1.4** — `checkStability` (AC: 2, 3, 9)
  - [x] Subtask 5.1.4.1 — `domain/check-stability.ts`.
  - [x] Subtask 5.1.4.2 — `domain/__tests__/check-stability.spec.ts`: bốn kiểu kết quả bị sửa cố ý.
- [x] **TASK-5.1.5** — Sức chứa theo vòng (AC: 8)
  - [x] Subtask 5.1.5.1 — `domain/capacity.ts`.
  - [x] Subtask 5.1.5.2 — `domain/__tests__/capacity.spec.ts`.
- [x] **TASK-5.1.6** — Bộ sinh dữ liệu và property-based test (AC: 2, 3, 4, 13)
  - [x] Subtask 5.1.6.1 — `domain/__tests__/arbitraries.ts`: `arbAllocationInput(options)`.
  - [x] Subtask 5.1.6.2 — `domain/__tests__/allocation.property.spec.ts`: ba property, `numRuns` 1000; fast-check in `seed` và `path` khi fail.
  - [x] Subtask 5.1.6.3 — `domain/__tests__/arbitraries.spec.ts`.
- [x] **TASK-5.1.7** — Rào chắn tính thuần, đo hiệu năng, API công khai (AC: 11, 12)
  - [x] Subtask 5.1.7.1 — Luật dependency-cruiser `allocation-domain-self-contained` kèm fixture vi phạm; luật ESLint cấm đồng hồ và số ngẫu nhiên.
  - [x] Subtask 5.1.7.2 — `domain/__tests__/allocation.perf.spec.ts`.
  - [x] Subtask 5.1.7.3 — `domain/index.ts`.

## Dev notes

### Architecture constraints

- [AD-7](../../ARCHITECTURE.md#architecture-decisions): phân bổ bằng Deferred Acceptance phía sinh viên đề xuất, hàm TS thuần, không dùng LLM, kiểm tra ổn định sau mỗi lần chạy ([CONTEXT D7](../../CONTEXT.md)).
- ARCH › *Allocation Engine*: chữ ký `AllocationInput` lấy theo code mẫu. Hàm so sánh chứa toàn bộ quy tắc phá hòa và cờ hạ ưu tiên (BR-16); bên gọi không tự sắp xếp. Không dùng worker thread.
- AGENTS › Nguyên tắc bất biến 9 và 13: engine không đọc đồng hồ; thời điểm nộp bài là dữ liệu đầu vào.
- Thư viện: chỉ Jest và fast-check. Không có thư viện heap; engine chèn bằng tìm kiếm nhị phân.
- Chiều so `student_code` và SV thiếu GPA: người dùng chốt ngày 2026-11-24 ([CONTEXT D63](../../CONTEXT.md)).
- Q3 (hệ số đề cử k) còn mở ở PRD. Engine và `computeCapacity` nhận k là tham số; bên gọi đọc `campaigns.config.k` (US-1.4, mặc định 1,5).
- Q4 (SV từ chối lời mời) còn mở. Engine chỉ nhận cờ `demoted` trong `RankKey`; ai bị hạ ưu tiên do US-5.4, US-5.5 quyết định.

### Cross-story dependencies

- Builds on [US-1.1](US-1.1-scaffold-monorepo-docker-compose-ci.md): Jest, fast-check, dependency-cruiser, CI.
- Required by [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md): `deferredAcceptance`, `checkStability`, `buildCompareAt`, `toCentiScore`, `arbAllocationInput`.
- Required by [US-5.4](US-5.4-interviews-reserve-and-offers.md): chọn SV Dự bị theo `compareRankKeys`, gọi qua service export của module `allocation`.
- Required by [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md): `computeCapacity`, `arbAllocationInput`.
- Required by [US-6.4](US-6.4-allocation-simulation-vs-baselines.md): runner gọi đúng engine này. `compareAt` tự viết phải trả 0 cho `(jd, a, a)` (xem *Implementation notes*).

### Performance budget

- `deferredAcceptance` + `checkStability` < 1 giây với 5.000 SV × 3 NV × 200 JD; lấy thời gian tốt nhất trong 3 lần chạy. Đo được 51 ms (73, 51, 56 ms) trên máy dev.
- Cả vòng phân bổ < 1 phút (NFR-8) được đo ở US-5.2 trên DB thật.

### What we explicitly did NOT do

- Không đọc DB, không snapshot, không khóa Redis, không dự thảo hay công bố: thuộc US-5.2. Chưa có NestJS module `allocation` hay `allocation/index.ts`.
- Không lọc BR-07 và không loại cặp đã bị từ chối (BR-12) trong engine: bên gọi dựng `preferences` đã lọc.
- Không có property test cho tính strategy-proof; làm lại khi US-6.4 cần.
- Không dùng heap hay worker thread.

### References

- [Source: PRD › Thuật toán phân bổ; Điểm tổng hợp (S_final); GĐ10; FR-26, NFR-8](../../PRD.md)
- [Source: ARCHITECTURE › Core Backend › Allocation Engine](../../ARCHITECTURE.md)
- [Source: CONTEXT D7, D20, D63](../../CONTEXT.md)
- [Source: EPIC-5 › Cross-cutting invariants](../epics/EPIC-5.md)

## Verification commands

Đường dẫn test tính từ `apps/api/src/modules/allocation/domain/__tests__/`.

| AC | Command |
|---|---|
| AC-1…AC-10, AC-12, AC-13 | `pnpm --filter @srm/api exec jest --selectProjects unit --testPathPatterns 'modules/allocation'` |
| AC-1 | `deferred-acceptance.spec.ts` › `GĐ7 Allocation Engine (US-5.1) › PRD example: A–Bình; B–Chi, An; C–Dũng` |
| AC-2 | `allocation.property.spec.ts` › `GĐ7 property: result is always stable (no blocking pair)` |
| AC-3 | `allocation.property.spec.ts` › `BR-09 property: no JD exceeds capacity; each student holds at most one JD from own preferences` |
| AC-4 | `allocation.property.spec.ts` › `GĐ7 property: deterministic under repeated runs and insertion-order permutation` |
| AC-5 | `compare.spec.ts` › `S_final tie-break: S_test`, `… S_cv`, `… GPA, a missing GPA after any GPA`, `… earlier submission`, `… student_code`, `BR-16 demoted ranks after everyone`, `never returns 0 for two different students` |
| AC-6 | `deferred-acceptance.spec.ts` › `throws NonStrictComparatorError when compareAt returns 0` |
| AC-7 | `score.spec.ts` › `toCentiScore parses numeric(5,2) without float math`, `toCentiScore round-trips every integer in [0, 10000]` |
| AC-8 | `capacity.spec.ts` › `GĐ10 C_j(r) uses integer arithmetic (50 × 1.1 = 55)`, `GĐ10 C_j(r) never negative` |
| AC-9 | `check-stability.spec.ts` › `detects OVER_CAPACITY`, `… NOT_IN_PREFERENCES`, `… DUPLICATE_ASSIGNMENT`, `… BLOCKING_PAIR` |
| AC-10 | `deferred-acceptance.spec.ts` › `edge cases: empty input, no preferences, zero capacity, duplicate JD, missing rank key` |
| AC-11 | `pnpm depcruise`, `pnpm depcruise:fixture` (luật `allocation-domain-self-contained`), `pnpm lint` (luật `no-restricted-globals`, `no-restricted-properties` cho `allocation/domain/`) |
| AC-12 | `allocation.perf.spec.ts` › `NFR-8 engine runs 5,000 students × 3 preferences × 200 JDs under 1s` |
| AC-13 | `arbitraries.spec.ts` › `arbAllocationInput always produces valid input`, `arbAllocationInput respects its options` |

## Changelog entry

### Added
- Allocation Engine trong `apps/api/src/modules/allocation/domain/`: `deferredAcceptance`, `checkStability`, `computeCapacity` cho C_j(r), `toCentiScore`; hàm so sánh chặt `compareRankKeys` / `buildCompareAt` (BR-16, phá hòa theo D63).
- Property-based test cho ba tính chất ổn định, không vượt sức chứa, tất định; test cố định theo ví dụ của PRD; bộ sinh `arbAllocationInput`; đo hiệu năng 5 000 SV.
- Luật dependency-cruiser và ESLint giữ tính thuần của `allocation/domain/`.

**Commit**: chưa commit.

## Implementation notes

2026-11-24, một phiên (Plan → Doc/Version gate), nhánh `us-5.1` từ `dev` `e27da94`. Người dùng chốt hai điểm mở (D63). Các lựa chọn nhỏ:

- **Kết quả.** `held` có mọi JD của `capacity` (kể cả danh sách rỗng), theo thứ tự mã JD; JD chỉ có trong NV mà không có trong `capacity` không xuất hiện. `unassigned` sắp theo `StudentId`. Ngăn xếp SV tự do khởi tạo theo `StudentId`, nên cả thứ tự đề xuất cũng không phụ thuộc thứ tự chèn của `Map`.
- **Thiếu rank key.** Trước khi chạy, engine gọi `compareAt(jd, sv, sv)` cho mọi NV và đòi kết quả 0. `buildCompareAt` ném lỗi khi thiếu key, nên SV một mình ở JD cũng bị bắt. `buildCompareAt` còn kiểm điểm là số nguyên an toàn (bắt lỗi truyền 80.29 thay cho 8029), `demoted` là boolean (thiếu trường thì hàm so sánh trả −1 cả hai chiều) và mỗi SV đúng một `student_code` không trùng SV khác.
- **`checkStability`** chỉ xét `held` và kiểm `capacity` như engine (NaN làm mọi phép so sức chứa đều sai, báo `ok` nhầm). SV bị giữ ở JD không có trong NV của mình (sửa tay ở US-5.2) vẫn chiếm chỗ nhưng xếp dưới mọi SV có đăng ký JD đó: SV có đăng ký mà thích JD này hơn được báo `BLOCKING_PAIR` với `outranks` là SV ngồi sai chỗ. `outranks: null` chỉ có nghĩa là JD còn chỗ trống thật.
- **`toCentiScore`** nhận tối đa 3 chữ số phần nguyên, đúng `numeric(5,2)`. Số đọc qua `String(n)`, nên `1e-7` hay `NaN` bị từ chối.
- **`arbAllocationInput(options)`** trả `{ input, rankKeys }`. Options: `maxStudents` 30, `maxJds` 8, `maxPreferences` (mặc định bằng số JD), `maxCapacity` 4, `scoreLevels` 2, `demotedRate` 0,2. Sức chứa −1 nghĩa là JD vắng khỏi `capacity`; GPA null với xác suất 1/5; `student_code` là một hoán vị, nên thứ tự mã khác thứ tự id.
- **Kiểm test bắt lỗi:** đảo dấu so sánh trong `insertionIndex` thì hai property ổn định và tất định đỏ, có in `seed`.

Self-verify: typecheck, lint, depcruise, `depcruise:fixture`, build; unit API 687 (thêm 53), shared 409; `pnpm test` 1087/1088. Ca đỏ là `threshold.int-spec` (US-4.4): bắt đầu bài thi trả `409` khi chạy chung DB với các file khác, chạy riêng thì xanh. Story này không đụng code của ca đó.

Review (`/code-review` so với `dev`, 2026-11-24): không có lỗi chặn merge. Sửa ba ý ảnh hưởng kết quả hoặc cảnh báo người dùng thấy: kiểm `demoted`, kiểm `capacity` trong `checkStability`, nghĩa của `outranks` (hai ý trên); thêm 5 ca, unit allocation 58. Các ý còn lại là comment, tài liệu, quy ước tên test và chặn thêm global trong ESLint, để lại.

Design applied: không có giao diện.

Lessons: none new — lỗi dấu phẩy động của ví dụ AC-8 và bẫy CRLF đã có cách xử lý (D63, LESSONS §47); ca integration chập chờn khi chạy chung DB thuộc LESSONS §22.

## Files modified

`apps/api/src/modules/allocation/domain/` (mới: engine và `__tests__/`); `.dependency-cruiser.cjs`, `eslint.config.mjs`, `scripts/check-depcruise-fixture.sh`, fixture `apps/api/test/fixtures/depcruise-violation/modules/allocation/`; tài liệu (CONTEXT D63, PRD, ARCH, CHANGELOG, W47); VERSION và các `package.json`.

## Cross-references

- [PRD FR-26, NFR-8](../../PRD.md#functional-requirements)
- [ARCHITECTURE AD-7](../../ARCHITECTURE.md#architecture-decisions)
- [Epic EPIC-5](../epics/EPIC-5.md)
- [CONTEXT D7, D20, D63](../../CONTEXT.md)
- [CHANGELOG](../../CHANGELOG.md)
- [US-5.2](US-5.2-allocation-round-draft-adjust-publish.md) · [US-5.5](US-5.5-supplementary-rounds-and-campaign-close.md) · [US-6.4](US-6.4-allocation-simulation-vs-baselines.md)
