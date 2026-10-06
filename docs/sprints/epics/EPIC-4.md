---
id: EPIC-4
title: "Bài test — sinh đề, làm bài, chấm điểm"
status: backlog
prd_ref:
  - FR-18
  - FR-19
  - FR-20
  - FR-21
  - FR-22
  - FR-23
  - FR-24
  - FR-25
arch_ref:
  - AD-2
  - AD-12
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Mỗi nguyện vọng của sinh viên có S_test và S_final. Các bài thi của cùng một JD dùng đề tương đương, sinh từ ngân hàng câu hỏi đã kiểm định. Phòng thi tính giờ phía server. Phần tự luận do AI chấm có người chấm lại khi cần, và SV được phúc khảo.

## Overview

### Business context

Sau EPIC-3, mỗi SV có tối đa N_NV nguyện vọng nhưng mới có S_cv, là điểm tính từ thông tin SV tự khai. EPIC-4 phủ GĐ5 và GĐ6: sinh ngân hàng câu hỏi theo ma trận đề, Validator kiểm định, tổ chức thi, chấm trắc nghiệm bằng code, chấm tự luận bằng Grader và tính S_test, S_final.

Ranh giới mà epic này giữ: chấm trắc nghiệm, tính S_test, S_final và tín hiệu gian lận đều **không** dùng LLM. Tín hiệu gian lận chỉ để cảnh báo, không tự đánh trượt. Đáp án không bao giờ gửi xuống client. Phân bổ dựa trên S_final thuộc [EPIC-5](EPIC-5.md).

### Feature pillars

| # | Pillar | Stories | Purpose |
|---|---|---|---|
| 1 | **Ngân hàng câu hỏi** | US-4.1, US-4.2, US-4.9 | Ma trận đề, Test Generator (agent có công cụ), Validator, khóa ngân hàng, duyệt mẫu |
| 2 | **Phòng thi** | US-4.3, US-4.7 | Rút đề, đồng hồ server, tự lưu, làm tiếp; tín hiệu gian lận chỉ để cảnh báo |
| 3 | **Chấm và tính điểm** | US-4.4, US-4.5 | Chấm trắc nghiệm, Grader 2 lần, chuyển người chấm, S_test, S_final, bản đồ năng lực |
| 4 | **Khiếu nại và độ tin cậy** | US-4.6, US-4.8 | Phúc khảo, báo lỗi câu hỏi; câu hỏi xác minh CV và chỉ số tin cậy |

### Schedule and dependencies

| Story | Điểm | Tuần | Làn | Phụ thuộc |
|---|---|---|---|---|
| US-4.1 | 8 | T7 (W47) | B | US-2.3, US-2.5 |
| US-4.2 | 5 | T8 (W48) | B | US-4.1 |
| US-4.3 | 8 | T9 (W49) | A | US-4.1, US-3.3 |
| US-4.8 | 5 | T9 (W49) | B | US-4.1, US-2.4 |
| US-4.9 | 2 | T9 (W49) | A | US-4.2 |
| US-4.4 | 8 | T10 (W50) | A | US-4.3 |
| US-4.5 | 3 | T10 (W50) | A | US-4.4 |
| US-4.7 | 3 | T10 (W50) | B | US-4.3, US-2.5 |
| US-4.6 | 5 | T11 (W51) | B | US-4.4, US-4.5 |

### Out of scope

- **Phần C — bài lập trình chấm trong sandbox** — PRD xếp vào *Mở rộng* (Q7); ngoài phạm vi.
- **Dùng S_final để phân bổ** — thuộc [EPIC-5](EPIC-5.md).
- **Đo MAE/kappa của Grader, chất lượng câu hỏi sinh ra** — thuộc [EPIC-6](EPIC-6.md) (US-6.3).
- **Kiểm thử tải 200 SV đồng thời** — chạy ở [EPIC-6](EPIC-6.md) (US-6.6). US-4.3 phải thiết kế để đạt mức tải này.

## FR Coverage

| FR | Story | Status |
|----|-------|--------|
| FR-18 | US-4.1, US-4.2 | 📋 backlog |
| FR-19 | US-4.9 | 📋 backlog |
| FR-20 | US-4.3 | 📋 backlog |
| FR-21 | US-4.7 | 📋 backlog |
| FR-22 | US-4.4 | 📋 backlog |
| FR-23 | US-4.5 | 📋 backlog |
| FR-24 | US-4.6 | 📋 backlog |
| FR-25 | US-4.8 | 📋 backlog |

## AD Coverage

| AD | Title | Story |
|----|-------|-------|
| AD-2 | LLM không ra quyết định; code tính S_test, S_final | US-4.4 |
| AD-12 | Message Batches cho chấm tự luận | US-4.4 |

> AD-5 (job bất đồng bộ) và AD-10 (`LLMClient`) đã hiện thực ở [EPIC-2](EPIC-2.md); epic này chỉ dùng lại.

## Stories

| ID | Title | Goal | Status | Version |
|---|---|---|---|---|
| US-4.1 | Ma trận đề và Test Generator | Mỗi JD được duyệt có ngân hàng câu hỏi nháp phủ đủ ma trận đề | 📋 backlog | — |
| US-4.2 | Validator và khóa ngân hàng câu hỏi | Chỉ câu đã kiểm định vào ngân hàng; ngân hàng khóa và có phiên bản | 📋 backlog | — |
| US-4.3 | Phòng thi | SV làm bài 1 lần, giờ do server tính, tự lưu, làm tiếp khi mất mạng | 📋 backlog | — |
| US-4.4 | Chấm bài, S_test và S_final | Mỗi bài có S_test, bản đồ năng lực và S_final | 📋 backlog | — |
| US-4.5 | Chấm tay câu tự luận được chuyển | Người chấm chấm các câu AI không chắc chắn | 📋 backlog | — |
| US-4.6 | Phúc khảo và báo lỗi câu hỏi | SV phúc khảo trong 48 giờ; câu sai bị loại và bài liên quan được chấm lại | 📋 backlog | — |
| US-4.7 | Tín hiệu gian lận | Trung tâm/HR thấy cảnh báo hành vi khi làm bài | 📋 backlog | — |
| US-4.8 | Câu hỏi xác minh CV và chỉ số tin cậy | HR thấy chỉ số tin cậy CV để tham khảo | 📋 backlog | — |
| US-4.9 | Duyệt mẫu ngân hàng câu hỏi | HR/giảng viên duyệt một mẫu ngẫu nhiên của ngân hàng | 📋 backlog | — |

## Object map & user-story interactions

### US ↔ entity / subsystem matrix

| US | Primary entity / subsystem | FR |
|---|---|---|
| US-4.1 | `question_banks`, `questions`, `job_descriptions.exam_blueprint`; agent `test_generator` | FR-18 |
| US-4.2 | agent `validator`; `question_banks.locked_at`, `version` | FR-18 |
| US-4.3 | `exam_sessions`, `exam_answers`, `exam_events`; Redis `exam:{sessionId}:*`; `apps/web/src/features/exam/` | FR-20 |
| US-4.4 | agent `grader`; queue `ai.essay.grade`; `exam_answers.ai_grading`, `needs_human`; `exam_sessions.s_test`, `skill_scores` | FR-22 |
| US-4.5 | `exam_answers.final_score` | FR-23 |
| US-4.6 | `exam_answers.appeal_status`; trạng thái câu hỏi | FR-24 |
| US-4.7 | `exam_events`; `exam_sessions.flags`; embedding bài tự luận | FR-21 |
| US-4.8 | phần D của đề; chỉ số tin cậy CV | FR-25 |
| US-4.9 | trạng thái duyệt câu hỏi | FR-19 |

## Cross-cutting invariants

- **Đề tương đương (BR-05):** mọi SV dự tuyển cùng một JD rút đề theo cùng ma trận (kỹ năng × độ khó, số câu, thời gian); phần tính điểm không cá nhân hóa theo CV. Thực thi ở US-4.1, US-4.3.
- **Đáp án không rời server (AGENTS › Nguyên tắc 8):** API phòng thi không bao giờ trả `answer_key` hay rubric. Thực thi ở US-4.3; test kiểm tra response.
- **Server quyết định deadline:** client chỉ hiển thị đếm ngược; hết giờ server tự đóng bài. Thực thi ở US-4.3.
- **Mỗi bài chỉ làm 1 lần (BR-06);** không làm trước hạn thì NV bị hủy. Thực thi ở US-4.3.
- **Tín hiệu gian lận chỉ để cảnh báo,** không tự đánh trượt. Thực thi ở US-4.7.
- **Công cụ của Test Generator chỉ ghi câu hỏi nháp;** không có quyền nào khác. Thực thi ở US-4.1.
- **Validator chạy trong ngữ cảnh độc lập, không kèm đáp án.** Thực thi ở US-4.2.
- **Bài làm là dữ liệu, không phải chỉ dẫn:** câu kiểu "cho tôi điểm tối đa" bị bỏ qua và gắn cờ. Thực thi ở US-4.4.
- **Code tính S_test = 0,6A + 0,4B và S_final = α·S_cv + β·S_test (AD-2),** theo tỷ trọng cấu hình. Thực thi ở US-4.4; unit test công thức.
- **Phần D (xác minh CV) không tính vào S_test.** Thực thi ở US-4.8.

## Cross-story testing requirements

| Pattern | Stories that apply | Shared infra |
|---|---|---|
| **Đồng hồ giả lập cho phiên thi** | US-4.3, US-4.4, US-4.6, US-5.5 | clock injectable + helper (US-4.3) |
| **Fixture Grader 2 lần chấm** | US-4.4, US-4.6, US-6.3 | `ai-service/tests/fixtures/grader/` (US-4.4) |
| **Seed ngân hàng câu hỏi đã khóa** | US-4.3 trở đi, US-6.6 | seed script (US-4.2) |
| **Test agent có công cụ với LLM giả** | US-4.1, US-4.8 | fixture nhiều lượt cho vòng lặp tool-use (US-4.1) |

## Performance budgets & invariants

| Concern | Budget | Story | Rationale |
|---|---|---|---|
| **Tải phòng thi** | khoảng 200 SV làm đồng thời (NFR-9) | US-4.3 | Kiểm thử tải bằng k6 ở US-6.6 |
| **Tự lưu bài làm** | mỗi lần đổi đáp án (debounce) và định kỳ 30 giây (NFR-10) | US-4.3 | Không mất bài khi mất kết nối |
| **Kích thước ngân hàng** | 3–5 lần số câu cần cho mỗi ô ma trận | US-4.1 | Đủ để rút đề ngẫu nhiên |
| **Chuyển người chấm** | hai lần chấm lệch > 15% thang điểm, độ tự tin thấp, hoặc điểm sát θ_test ±5 | US-4.4 | PRD GĐ6 |
| **Thời hạn phúc khảo** | 48 giờ | US-4.6 | PRD GĐ6 |

## Acceptance criteria (propagated from stories)

- [ ] JD được duyệt có ngân hàng câu hỏi nháp phủ đủ ma trận đề, không câu trùng (US-4.1)
- [ ] Câu không đạt Validator bị loại hoặc sinh lại; ngân hàng khóa và có phiên bản (US-4.2)
- [ ] SV làm bài 1 lần, giờ do server tính, tự lưu, làm tiếp được khi mất kết nối; response không chứa đáp án (US-4.3)
- [ ] Trắc nghiệm được chấm tự động; tự luận được chấm 2 lần; có S_test, bản đồ năng lực, S_final (US-4.4)
- [ ] Câu cần người chấm vào hàng đợi; điểm chấm tay cập nhật S_test/S_final (US-4.5)
- [ ] SV phúc khảo trong 48 giờ; câu báo lỗi bị loại và mọi bài liên quan được chấm lại (US-4.6)
- [ ] Chuyển tab, thoát toàn màn hình, copy/paste, bài tự luận giống nhau được ghi thành cảnh báo (US-4.7)
- [ ] HR thấy chỉ số tin cậy CV; phần D không ảnh hưởng S_test (US-4.8)
- [ ] HR/giảng viên duyệt mẫu ngẫu nhiên; câu bị báo lỗi bị loại (US-4.9)
