---
id: EPIC-3
title: "Chấm phù hợp và chọn nguyện vọng"
status: backlog
prd_ref:
  - FR-14
  - FR-15
  - FR-16
  - FR-17
arch_ref:
  - AD-2
  - AD-12
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Sinh viên thấy shortlist có giải thích (S_cv, bằng chứng, kỹ năng còn thiếu, gợi ý cải thiện) và chọn được tối đa N_NV nguyện vọng. Khi chọn, SV thấy mức cạnh tranh để hồ sơ không dồn vào vài công ty.

## Overview

### Business context

Sau EPIC-2, hồ sơ năng lực và yêu cầu JD đã được xác nhận nhưng chưa được so với nhau. EPIC-3 phủ GĐ3 (chấm độ phù hợp) và GĐ4 (chọn nguyện vọng). Theo AD-2, LLM chỉ đánh giá từng tiêu chí và đưa bằng chứng; code lọc điều kiện cứng, kiểm tra trích dẫn và tính S_cv. Nhờ vậy đổi trọng số không phải gọi lại LLM.

Epic này **không** tính S_test hay S_final và không phân bổ. Các phần đó thuộc [EPIC-4](EPIC-4.md) và [EPIC-5](EPIC-5.md). Kết quả của EPIC-3 là `match_results`, shortlist và danh sách `preferences` có thứ tự. Cũng ở đây bảng chuyển trạng thái đầy đủ của hồ sơ ứng tuyển (PRD › *Vòng đời trạng thái*) được đưa vào `packages/shared/states`.

### Feature pillars

| # | Pillar | Stories | Purpose |
|---|---|---|---|
| 1 | **Chấm tất định** | US-3.1 | Lọc điều kiện cứng và công thức S_cv dạng hàm thuần |
| 2 | **Matching Agent** | US-3.2 | Đánh giá tiêu chí hàng loạt bằng Batches + prompt caching, kiểm tra trích dẫn |
| 3 | **Shortlist và nguyện vọng** | US-3.3 | Shortlist có giải thích, chọn và sắp NV, khóa khi hết hạn, vòng đời hồ sơ ứng tuyển |
| 4 | **Chống dồn hồ sơ** | US-3.4 | Mức cạnh tranh theo thời gian thực, gợi ý ít cạnh tranh, báo JD thiếu NV |

### Schedule and dependencies

| Story | Điểm | Tuần | Làn | Phụ thuộc |
|---|---|---|---|---|
| US-3.1 | 3 | T5 (W45) | A | US-2.3 |
| US-3.2 | 8 | T7 (W47) | A + B | US-2.2, US-2.5, US-2.6, US-3.1 |
| US-3.3 | 8 | T8 (W48) | A | US-3.2, US-1.4 |
| US-3.4 | 3 | T8 (W48) | A | US-3.3, US-1.7 |

### Out of scope

- **S_test, S_final, quy tắc phá hòa** — thuộc [EPIC-4](EPIC-4.md) (US-4.4).
- **Thêm NV ở vòng bổ sung** — thuộc [EPIC-5](EPIC-5.md) (US-5.5); dùng lại màn chọn NV của US-3.3.
- **Báo cáo tỷ lệ NV/chỉ tiêu trên dashboard** — thuộc [EPIC-6](EPIC-6.md) (US-6.1). US-3.4 chỉ gửi cảnh báo cho Trung tâm.

## FR Coverage

| FR | Story | Status |
|----|-------|--------|
| FR-14 | US-3.1, US-3.2 | 📋 backlog |
| FR-15 | US-3.3 | 📋 backlog |
| FR-16 | US-3.3 | 📋 backlog |
| FR-17 | US-3.4 | 📋 backlog |

## AD Coverage

| AD | Title | Story |
|----|-------|-------|
| AD-2 | LLM không ra quyết định; code tính S_cv | US-3.1, US-3.2 |
| AD-12 | Message Batches + prompt caching cho tác vụ hàng loạt | US-3.2 |

## Stories

| ID | Title | Goal | Status | Version |
|---|---|---|---|---|
| US-3.1 | Lọc điều kiện cứng và công thức S_cv | Điều kiện cứng và S_cv được tính bằng hàm thuần có unit test | 📋 backlog | — |
| US-3.2 | Matching Agent chạy hàng loạt | Mọi cặp SV × JD hợp lệ có điểm tiêu chí, bằng chứng đã kiểm tra và S_cv | 📋 backlog | — |
| US-3.3 | Shortlist và chọn nguyện vọng | SV xem shortlist có giải thích và sắp tối đa N_NV nguyện vọng | 📋 backlog | — |
| US-3.4 | Mức cạnh tranh và gợi ý ít cạnh tranh | SV thấy mức cạnh tranh khi chọn NV; Trung tâm biết JD thiếu NV | 📋 backlog | — |

## Object map & user-story interactions

### US ↔ entity / subsystem matrix

| US | Primary entity / subsystem | FR |
|---|---|---|
| US-3.1 | `apps/api/src/modules/matching/domain/` | FR-14 |
| US-3.2 | agent `matching`; queue `ai.match.run`; `match_results` | FR-14 |
| US-3.3 | `preferences`; `packages/shared/states` (hồ sơ ứng tuyển); `apps/web/src/features/student/` | FR-15, FR-16 |
| US-3.4 | Redis `competition:{jdId}`; SSE | FR-17 |

## Cross-cutting invariants

- **LLM không tính điểm tổng (AD-2, BR-13):** LLM trả verdict từng tiêu chí; S_cv = Σ wᵢ·sᵢ do code tính theo PRD › *Điểm phù hợp CV–JD (S_cv)*. Thực thi ở US-3.1; unit test công thức.
- **Bằng chứng phải có thật (AGENTS › Nguyên tắc 5):** verdict `MET`/`PARTIAL` mà `evidence` không khớp văn bản CV (RapidFuzz < 85) thì bị hạ về `NOT_MET`. Thực thi ở US-3.2; test với bằng chứng bịa.
- **Matching chỉ nhận `profile_masked` (BR-03):** đọc qua view che PII. Thực thi ở US-3.2.
- **Kết quả không bị chấm lại khi không có gì đổi:** `match_results` unique theo (cv_id, jd_id, cv_version, jd_version, prompt_version). Thực thi ở US-3.2.
- **Chỉ chọn NV từ shortlist, tối đa N_NV (BR-04):** kiểm tra ở service và ràng buộc DB `unique(campaign_id, student_id, rank)`, `unique(student_id, jd_id)`. Thực thi ở US-3.3.
- **Mức cạnh tranh không dùng LLM** (ARCH › *Những chỗ cố ý KHÔNG dùng LLM*). Thực thi ở US-3.4.
- **SV chỉ thấy điểm của mình** (PRD › Personas). Thực thi ở US-3.3; test IDOR.

## Cross-story testing requirements

| Pattern | Stories that apply | Shared infra |
|---|---|---|
| **Fixture kết quả Message Batches** | US-3.2, US-4.4 | fixture batch trong `ai-service/tests/fixtures/batches/` (US-3.2) |
| **Bộ test kiểm tra trích dẫn** | US-3.2, US-6.3 | cặp CV/bằng chứng đúng và bịa (US-3.2) |
| **Bảng chuyển trạng thái hồ sơ ứng tuyển** | US-3.3, EPIC-4, EPIC-5 | unit test bảng chuyển trong `packages/shared/states` (US-3.3) |

## Performance budgets & invariants

| Concern | Budget | Story | Rationale |
|---|---|---|---|
| **Chấm phù hợp hàng loạt** | 500 SV × 50 JD chạy nền xong trong vài giờ (NFR-7) | US-3.2 | Batches có thể mất đến 24 giờ; lọc top-M bằng pgvector để giảm số cặp |
| **Ngưỡng trích dẫn** | RapidFuzz ≥ 85 | US-3.2 | PRD › *Điểm phù hợp CV–JD (S_cv)* |
| **Chi phí matching** | ~115 USD cho 500 SV (top-10 JD/SV) | US-3.2 | ARCH › *Ước tính chi phí (thô)*; đo lại bằng `ai.llm_calls` |

## Acceptance criteria (propagated from stories)

- [ ] Cặp không đạt điều kiện cứng có lý do; S_cv tính đúng theo bảng trọng số (US-3.1)
- [ ] Trung tâm chạy chấm phù hợp; mọi cặp hợp lệ có điểm tiêu chí, bằng chứng đã kiểm tra, S_cv; bằng chứng bịa bị hạ về `NOT_MET` (US-3.2)
- [ ] SV xem shortlist có giải thích; chọn và sắp tối đa N_NV NV; danh sách bị khóa khi hết hạn (US-3.3)
- [ ] SV thấy mức cạnh tranh cập nhật thời gian thực và gợi ý "phù hợp – ít cạnh tranh"; Trung tâm được báo các JD có NV/chỉ tiêu < 1 (US-3.4)
