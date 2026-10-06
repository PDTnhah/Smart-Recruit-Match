---
id: EPIC-5
title: "Phân bổ, HR duyệt và phỏng vấn"
status: backlog
prd_ref:
  - FR-26
  - FR-27
  - FR-28
  - FR-29
  - FR-30
  - FR-31
  - FR-32
arch_ref:
  - AD-7
  - AD-8
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Chạy trọn luồng từ phân bổ đến khi sinh viên nhận thực tập, kể cả vòng bổ sung. Phân bổ tất định, ổn định, không JD nào vượt sức chứa, và tái hiện được khi có khiếu nại. HR và Trung tâm là người quyết định ở mọi điểm then chốt.

## Overview

### Business context

Sau EPIC-4, mỗi nguyện vọng có S_final. EPIC-5 phủ GĐ7–GĐ10: chạy Deferred Acceptance phía sinh viên đề xuất (AD-7), Trung tâm xem dự thảo, điều chỉnh có lý do rồi công bố; HR duyệt danh sách đề cử, phỏng vấn, gửi lời mời; SV nhận hoặc từ chối; SV chưa có nơi được xét ở vòng bổ sung với sức chứa C_j(r).

Allocation Engine (US-5.1) là hàm TS thuần, không phụ thuộc DB hay AI. Vì vậy nó được làm ở Tuần 2, sớm hơn nhiều so với các story còn lại của epic, và mô phỏng thực nghiệm (US-6.4) dùng lại nó. Epic này **không** dùng LLM để ra quyết định. Phần tóm tắt hồ sơ cho HR (US-5.3) chỉ để tham khảo.

### Feature pillars

| # | Pillar | Stories | Purpose |
|---|---|---|---|
| 1 | **Allocation Engine** | US-5.1 | Deferred Acceptance thuần, phá hòa chặt, `checkStability`, property-based test |
| 2 | **Vòng phân bổ** | US-5.2 | Snapshot, dự thảo, điều chỉnh có lý do, công bố |
| 3 | **HR duyệt** | US-5.3 | Danh sách đề cử, hồ sơ chi tiết, quyết định có lý do, SLA |
| 4 | **Phỏng vấn và lời mời** | US-5.4 | Lịch, kết quả, Dự bị, lời mời có hạn |
| 5 | **Vòng bổ sung và đóng đợt** | US-5.5 | Hàng chờ thêm NV, C_j(r), R_max, đóng đợt |

### Schedule and dependencies

| Story | Điểm | Tuần | Làn | Phụ thuộc |
|---|---|---|---|---|
| US-5.1 | 5 | T2 (W42) | B | US-1.1 |
| US-5.2 | 8 | T11 (W51) | A | US-5.1, US-4.4, US-1.7 |
| US-5.3 | 8 | T11 (W51) | A | US-5.2 |
| US-5.4 | 8 | T12 (W52) | A | US-5.3 |
| US-5.5 | 5 | T12 (W52) | A | US-5.4 |

### Out of scope

- **Mô phỏng so sánh DA với các phương án đối chứng** — thuộc [EPIC-6](EPIC-6.md) (US-6.4), dùng lại engine của US-5.1.
- **Tối ưu ILP làm thuật toán chính** — PRD chỉ dùng làm đối chứng (D7).
- **Tích hợp lịch/email doanh nghiệp** — PRD xếp vào *Mở rộng*.
- **HR chủ động chọn SV ngoài danh sách đề cử** — không cho phép (Q5); chỉ có "yêu cầu bổ sung hồ sơ".

## FR Coverage

| FR | Story | Status |
|----|-------|--------|
| FR-26 | US-5.1, US-5.2 | 📋 backlog |
| FR-27 | US-5.2 | 📋 backlog |
| FR-28 | US-5.3 | 📋 backlog |
| FR-29 | US-5.3 | 📋 backlog |
| FR-30 | US-5.4 | 📋 backlog |
| FR-31 | US-5.4 | 📋 backlog |
| FR-32 | US-5.5 | 📋 backlog |

## AD Coverage

| AD | Title | Story |
|----|-------|-------|
| AD-7 | Deferred Acceptance tất định, kiểm tra ổn định | US-5.1 |
| AD-8 | Chuyển trạng thái đề cử, phỏng vấn, lời mời qua `transitionTo` + `row_version` | US-5.2, US-5.3, US-5.4 |

## Stories

| ID | Title | Goal | Status | Version |
|---|---|---|---|---|
| US-5.1 | Allocation Engine và property-based test | Thuật toán phân bổ thuần, ổn định, tất định, có chứng minh bằng test | 📋 backlog | — |
| US-5.2 | Vòng phân bổ: dự thảo, điều chỉnh, công bố | Trung tâm chạy phân bổ, xem dự thảo, điều chỉnh có lý do và công bố | 📋 backlog | — |
| US-5.3 | HR duyệt danh sách đề cử | HR xem hồ sơ chi tiết và mời phỏng vấn hoặc từ chối có lý do | 📋 backlog | — |
| US-5.4 | Phỏng vấn, Dự bị và lời mời thực tập | Kết quả phỏng vấn dẫn đến lời mời; SV nhận hoặc từ chối trong hạn | 📋 backlog | — |
| US-5.5 | Vòng bổ sung và đóng đợt | SV trong hàng chờ được xét vòng sau; Trung tâm đóng đợt | 📋 backlog | — |

## Object map & user-story interactions

### US ↔ entity / subsystem matrix

| US | Primary entity / subsystem | FR |
|---|---|---|
| US-5.1 | `apps/api/src/modules/allocation/domain/` | FR-26 |
| US-5.2 | `allocation_rounds`, `nominations`; Redis `lock:allocation:{campaignId}` | FR-26, FR-27 |
| US-5.3 | module `review`; `hr_reviews` | FR-28, FR-29 |
| US-5.4 | module `interview`; `interviews`, `offers` | FR-30, FR-31 |
| US-5.5 | `allocation_rounds` (round_no > 1); trạng thái đợt | FR-32 |

## Cross-cutting invariants

- **Engine là hàm thuần (AGENTS › Nguyên tắc 9):** `allocation/domain/` không import NestJS, Drizzle hay AI. Thực thi ở US-5.1; dependency-cruiser chặn.
- **So sánh luôn chặt và tất định:** điểm quy về số nguyên (×100); phá hòa S_test → S_cv → GPA → nộp bài sớm → mã SV; SV bị hạ ưu tiên (BR-16) xếp sau mọi người. Thực thi ở US-5.1.
- **Ổn định và không vượt sức chứa (BR-09):** sau mỗi lần chạy gọi `checkStability()`; sai thì hủy kết quả. Thực thi ở US-5.1, US-5.2.
- **Tái hiện được (BR-17):** lưu `input_snapshot`, `config_snapshot`, phiên bản model và prompt cho mỗi vòng. Thực thi ở US-5.2.
- **Mỗi SV tối đa 1 hồ sơ đang chạy (BR-08):** partial unique index trên `nominations(campaign_id, student_id) WHERE status IN ('NOMINATED','INTERVIEW','PASSED','RESERVE')`. Thực thi ở US-5.2.
- **Chỉ đủ điều kiện mới được đề cử (BR-07):** đạt điều kiện cứng, S_cv ≥ θ_cv, S_test ≥ θ_test. Thực thi ở US-5.2.
- **Điều chỉnh tay phải ghi lý do và có audit (BR-10).** Thực thi ở US-5.2.
- **HR chỉ thấy đề cử của JD công ty mình (BR-11).** Thực thi ở US-5.3; test IDOR.
- **Từ chối phải có lý do; không đề cử lại vào JD đã từ chối (BR-12).** Thực thi ở US-5.3, US-5.5.
- **Quyết định cuối do người (BR-13).** Thực thi ở US-5.3, US-5.4.
- **Số Đạt ≤ chỉ tiêu còn lại, phần dư chuyển Dự bị (BR-14).** Thực thi ở US-5.4.
- **SV nhận thực tập thì đóng mọi hồ sơ khác (BR-15); từ chối hoặc quá hạn thì xếp ưu tiên thấp nhất ở vòng sau (BR-16, Q4).** Thực thi ở US-5.4.
- **Sức chứa vòng r:** C_j(r) = max(0, ⌈(chỉ tiêu_j − đã nhận_j) × k⌉ − đang trong quy trình_j). Thực thi ở US-5.1 (hàm), US-5.5 (dùng).

## RBAC additions

| Resource | New action | Story | Default roles |
|---|---|---|---|
| `allocation_round` | run, adjust, publish | US-5.2 | CENTER |
| `nomination` | read, decide | US-5.3 | HR (JD công ty mình) |
| `interview` | schedule, record-result | US-5.4 | HR (JD công ty mình) |
| `interview` | confirm, reschedule-once | US-5.4 | STUDENT (của mình) |
| `offer` | accept, decline | US-5.4 | STUDENT (của mình) |
| `campaign` | open-supplementary-round, close | US-5.5 | CENTER |

## Cross-story testing requirements

| Pattern | Stories that apply | Shared infra |
|---|---|---|
| **Property-based test cho phân bổ** | US-5.1, US-5.2, US-5.5, US-6.4 | generator fast-check cho nguyện vọng, điểm, sức chứa (US-5.1) |
| **Ví dụ minh họa trong PRD là test cố định** | US-5.1 | test `PRD example: A–Bình; B–Chi, An; C–Dũng` (US-5.1) |
| **Test IDOR cho HR** | US-5.3, US-5.4 | helper đăng nhập theo vai trò (US-1.3) |
| **Đồng hồ giả lập cho SLA, T_offer, hết hạn Dự bị** | US-5.3, US-5.4, US-5.5 | clock injectable (US-4.3) |

## Performance budgets & invariants

| Concern | Budget | Story | Rationale |
|---|---|---|---|
| **Chạy phân bổ** | < 1 phút cho cả đợt (NFR-8); engine < 1 giây với vài nghìn SV | US-5.1, US-5.2 | Trung tâm chạy lại nhiều lần khi xem dự thảo |
| **SLA HR** | SLA_HR (mặc định 5 ngày làm việc); nhắc trước hạn 2 ngày | US-5.3 | PRD GĐ8 |
| **Hạn xác nhận lời mời** | T_offer (mặc định 3 ngày) | US-5.4 | PRD GĐ9 |
| **Số vòng tối đa** | R_max (mặc định 3) | US-5.5 | PRD GĐ10 |

## Acceptance criteria (propagated from stories)

- [ ] Engine qua property test cho ba tính chất ổn định, không vượt sức chứa, tất định; ví dụ PRD cho đúng kết quả (US-5.1)
- [ ] Trung tâm chạy phân bổ, xem dự thảo, điều chỉnh có lý do, công bố; mỗi vòng có snapshot tái hiện được (US-5.2)
- [ ] HR chỉ thấy đề cử của JD công ty mình; mời phỏng vấn, từ chối có lý do hoặc yêu cầu bổ sung hồ sơ; được nhắc SLA (US-5.3)
- [ ] HR lên lịch và nhập kết quả; Dự bị được chuyển thành Đạt khi có suất; SV nhận hoặc từ chối lời mời trong T_offer (US-5.4)
- [ ] SV trong hàng chờ thêm NV và được xét ở vòng bổ sung với C_j(r); Trung tâm đóng đợt (US-5.5)
