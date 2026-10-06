---
id: EPIC-6
title: "Báo cáo, đánh giá và thực nghiệm"
status: backlog
prd_ref:
  - FR-33
  - FR-34
  - FR-35
  - FR-36
  - FR-37
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Có dashboard, báo cáo và số liệu đánh giá cho chương thực nghiệm của đồ án, chứng minh hai điều: cơ chế phân bổ tốt hơn tự do ứng tuyển, và các agent AI đủ chính xác. Hệ thống có dữ liệu demo, test E2E và kiểm thử tải để ra bản 1.0.0.

## Overview

### Business context

Các epic trước làm hệ thống chạy được. EPIC-6 làm cho nó *đo được* và *trình diễn được*. Đây là thứ hội đồng chấm sẽ hỏi. Các chỉ số lấy từ PRD › *Chỉ số đánh giá hệ thống*: P/R/F1 của trích xuất, Spearman/NDCG@k của matching, chất lượng câu hỏi, MAE/kappa của chấm tự luận, các chỉ số phân bổ so với baseline, chi phí LLM trên mỗi SV.

Các story ở đây nằm rải theo lịch, không dồn cuối kỳ. Mô phỏng (US-6.4) chạy từ Tuần 4, ngay sau Allocation Engine. Theo dõi chi phí (US-6.2) chạy từ Tuần 6, ngay sau `LLMClient`. Bộ đánh giá AI (US-6.3) chạy ở Tuần 9–10, khi các agent đã xong và tập gán nhãn (Track B) đã có. Epic này **không** đổi trọng số hay prompt trong một đợt đang chạy; kết quả đánh giá chỉ dùng để hiệu chỉnh cho đợt sau (PRD › *Vòng phản hồi*).

### Feature pillars

| # | Pillar | Stories | Purpose |
|---|---|---|---|
| 1 | **Thực nghiệm cho đồ án** | US-6.3, US-6.4 | Bộ đánh giá AI trên tập gán nhãn; mô phỏng DA so với baseline |
| 2 | **Quan sát vận hành** | US-6.1, US-6.2 | Dashboard đợt; theo dõi token và chi phí LLM |
| 3 | **Đóng đợt và phát hành** | US-6.5, US-6.6 | Xuất báo cáo; dữ liệu demo, E2E, kiểm thử tải, bản 1.0.0 |

### Schedule and dependencies

| Story | Điểm | Tuần | Làn | Phụ thuộc |
|---|---|---|---|---|
| US-6.4 | 5 | T4 (W44) | B | US-5.1 |
| US-6.2 | 3 | T6 (W46) | A | US-2.2 |
| US-6.3 | 8 | T9–T10 (W49–W50) | B | US-2.3, US-2.4, US-3.2, US-4.2, US-4.4 |
| US-6.1 | 5 | T12 (W52) | B | US-5.2 |
| US-6.5 | 3 | T12 (W52) | B | US-5.5 |
| US-6.6 | 5 | T13 (W53) | A | mọi story còn lại |

### Out of scope

- **Học trọng số từ phản hồi HR** — PRD xếp vào *Mở rộng*; EPIC-6 chỉ lưu dữ liệu và đo tương quan.
- **Prometheus/Grafana** — ARCH ghi là tùy chọn; dashboard chi phí lấy thẳng từ `ai.llm_calls`.
- **Chatbot tư vấn sinh viên** — PRD xếp vào *Mở rộng*.

## FR Coverage

| FR | Story | Status |
|----|-------|--------|
| FR-33 | US-6.1 | 📋 backlog |
| FR-34 | US-6.5 | 📋 backlog |
| FR-35 | US-6.3 | 📋 backlog |
| FR-36 | US-6.4 | 📋 backlog |
| FR-37 | US-6.2 | 📋 backlog |

> US-6.6 không ứng với FR nào. Story này kiểm chứng các NFR: NFR-6, NFR-7, NFR-8, NFR-9.

## Stories

| ID | Title | Goal | Status | Version |
|---|---|---|---|---|
| US-6.1 | Dashboard đợt | Trung tâm thấy phễu tuyển, tỷ lệ lấp đầy, heatmap NV/chỉ tiêu | 📋 backlog | — |
| US-6.2 | Theo dõi chi phí LLM | Quản trị thấy token, chi phí theo agent và theo đợt | 📋 backlog | — |
| US-6.3 | Tập gán nhãn và bộ đánh giá AI | Có số liệu chất lượng của từng agent trên tập gán nhãn | 📋 backlog | — |
| US-6.4 | Mô phỏng phân bổ so với baseline | Có số liệu chứng minh DA tốt hơn các phương án đối chứng | 📋 backlog | — |
| US-6.5 | Xuất báo cáo đóng đợt | Trung tâm xuất báo cáo Excel/PDF khi đóng đợt | 📋 backlog | — |
| US-6.6 | Dữ liệu demo, E2E, kiểm thử tải | Đợt demo chạy được; E2E và k6 đạt; phát hành 1.0.0 | 📋 backlog | — |

## Object map & user-story interactions

### US ↔ entity / subsystem matrix

| US | Primary entity / subsystem | FR |
|---|---|---|
| US-6.1 | module `reporting`; `apps/web/src/features/center/` | FR-33 |
| US-6.2 | `ai.llm_calls`; endpoint thống kê của `ai-api` | FR-37 |
| US-6.3 | `ai-service/evals/` | FR-35 |
| US-6.4 | `simulation/` | FR-36 |
| US-6.5 | module `reporting`; bucket `reports` | FR-34 |
| US-6.6 | seed demo; Playwright; k6 | – |

## Cross-cutting invariants

- **Bộ đánh giá gọi API thật chỉ chạy thủ công** trong `ai-service/evals/`, không chạy trong CI (AGENTS › Gọi Claude API). Thực thi ở US-6.3.
- **Mỗi số liệu đánh giá ghi kèm `model`, `prompt_version` và phiên bản tập dữ liệu** để tái hiện trong báo cáo. Thực thi ở US-6.3, US-6.4.
- **Mô phỏng dùng đúng engine của hệ thống** (US-5.1), không viết lại thuật toán DA. Thực thi ở US-6.4.
- **Dữ liệu dùng để đánh giá đã ẩn danh;** CV thật cần SV đồng ý (NFR-2). Thực thi ở US-6.3.
- **Dashboard không dùng LLM để tính chỉ số;** LLM chỉ tổng hợp lý do từ chối dạng văn bản (US-6.5).

## Cross-story testing requirements

| Pattern | Stories that apply | Shared infra |
|---|---|---|
| **E2E luồng chính** | US-6.6 (bắt đầu viết từ T11 song song EPIC-5) | Playwright + seed demo (US-6.6) |
| **Kiểm thử tải phòng thi** | US-6.6 | kịch bản k6 (US-6.6) |
| **Tập dữ liệu gán nhãn** | US-6.3 | `ai-service/evals/data/` (Track B, US-6.3) |

## Performance budgets & invariants

| Concern | Budget | Story | Rationale |
|---|---|---|---|
| **Chi phí LLM mỗi SV** | đo so với ước tính ~0,9 USD/SV; cảnh báo khi vượt ngưỡng ngày | US-6.2 | BRIEF › Success Criteria |
| **Phòng thi** | 200 SV đồng thời không lỗi, không mất bài (NFR-9) | US-6.6 | PRD NFR |
| **Phân tích CV** | < 30 giây (NFR-6), đo lại trên đợt demo | US-6.6 | PRD NFR |
| **Phân bổ** | < 1 phút (NFR-8), đo lại trên đợt demo | US-6.6 | PRD NFR |

## Acceptance criteria (propagated from stories)

- [ ] Dashboard hiển thị phễu tuyển, tỷ lệ lấp đầy, heatmap NV/chỉ tiêu (US-6.1)
- [ ] Màn chi phí hiển thị token, chi phí theo agent/đợt, tỷ lệ cache hit, tỷ lệ refusal (US-6.2)
- [ ] Có số liệu P/R/F1, Spearman/NDCG@k, chất lượng câu hỏi, MAE/kappa trên tập gán nhãn (US-6.3)
- [ ] Có số liệu và biểu đồ so sánh DA với tự do ứng tuyển, tham lam theo cặp, ILP (US-6.4)
- [ ] Trung tâm xuất được báo cáo Excel/PDF khi đóng đợt (US-6.5)
- [ ] Đợt demo 50 SV × 10 JD chạy được; E2E luồng chính và k6 200 SV đạt; phát hành 1.0.0 (US-6.6)
