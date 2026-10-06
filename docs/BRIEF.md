# Product Brief: Smart Recruit Match

> Bản tóm tắt cho người đọc nhanh (giảng viên, Trung tâm, thành viên mới). Chi tiết nghiệp vụ ở [PRD.md](PRD.md), kỹ thuật ở [ARCHITECTURE.md](ARCHITECTURE.md).

## Executive Summary

Smart Recruit Match là hệ thống giúp Trung tâm hỗ trợ sinh viên / quan hệ doanh nghiệp của trường điều phối các đợt thực tập. Hệ thống dùng LLM để đọc CV và JD, chấm độ phù hợp có bằng chứng, sinh và chấm bài test theo yêu cầu của từng JD. Sau đó một thuật toán phân bổ có giới hạn chỉ tiêu đưa sinh viên đến doanh nghiệp theo điểm từ cao xuống thấp.

Hệ thống giải quyết tình trạng sinh viên dồn vào vài công ty nổi tiếng trong khi công ty khác bỏ trống chỉ tiêu, và việc sàng lọc CV thủ công tốn thời gian, thiếu nhất quán. Con người vẫn giữ quyền quyết định ở mọi điểm then chốt: HR duyệt hồ sơ và phỏng vấn, Trung tâm duyệt và điều chỉnh kết quả phân bổ.

Đây là đồ án tốt nghiệp. Ngoài sản phẩm chạy được, đồ án cần số liệu thực nghiệm cho thấy cơ chế phân bổ và các agent AI tốt hơn cách làm hiện tại.

## The Problem

Mỗi đợt thực tập, Trung tâm làm cầu nối giữa hàng trăm sinh viên và hàng chục doanh nghiệp. Cách làm phổ biến là sinh viên tự chọn công ty và nộp CV, doanh nghiệp tự lọc. Cách này dẫn tới:

- **Dồn hồ sơ (P1):** sinh viên tập trung vào vài công ty "hot". Các công ty này phải từ chối hàng loạt, trong khi công ty khác thiếu ứng viên.
- **Sàng lọc thủ công (P2):** tốn thời gian của Trung tâm và HR, kết quả cảm tính, thiếu nhất quán.
- **CV tự khai (P3):** khó kiểm chứng năng lực thật trước khi phỏng vấn.
- **Bị từ chối liên tiếp (P4):** sinh viên mất thời gian; có người đến cuối đợt vẫn chưa có nơi thực tập.

## The Solution

1. HR đăng JD; AI chuẩn hóa yêu cầu (kỹ năng, mức độ, điều kiện cứng) để HR xác nhận.
2. Sinh viên nộp CV; AI trích xuất hồ sơ năng lực để sinh viên xác nhận.
3. AI chấm độ phù hợp mọi cặp sinh viên × JD, kèm bằng chứng trích từ CV. Sinh viên xem shortlist và chọn tối đa 3 nguyện vọng.
4. Sinh viên làm bài test do AI sinh theo yêu cầu của JD. Đề tương đương cho mọi người dự tuyển cùng JD.
5. Thuật toán Deferred Acceptance phân bổ theo điểm tổng hợp, không JD nào nhận quá sức chứa.
6. HR duyệt danh sách đề cử, phỏng vấn, gửi lời mời. Sinh viên chưa có nơi được xét ở vòng bổ sung.

## What Makes This Different

| Cách làm khác | Họ làm gì | Lợi thế của Smart Recruit Match |
|---|---|---|
| Tự do ứng tuyển (hiện trạng) | Sinh viên tự nộp CV, HR tự lọc | Phân bổ có sức chứa chống dồn hồ sơ; sinh viên không mất cơ hội ở NV2, NV3 khi đặt công ty cạnh tranh ở NV1 |
| Sàn việc làm / cổng tuyển dụng chung | Đăng tin và nhận hồ sơ cho thị trường mở | Phục vụ đúng một đợt thực tập của trường: có chỉ tiêu, có Trung tâm điều phối, có vòng bổ sung |
| Phần mềm sàng lọc CV bằng AI | Cho điểm CV, thường là một con số tổng | Điểm tách theo tiêu chí, có bằng chứng kiểm chứng được; kết hợp bài test cùng chuẩn; AI không ra quyết định cuối |

## Who This Serves

**Người dùng chính: Cán bộ Trung tâm (điều phối viên)**
- Vận hành đợt thực tập, làm việc với hàng chục doanh nghiệp và hàng trăm sinh viên.
- Cần lấp đầy chỉ tiêu, giảm số sinh viên không có nơi thực tập, và giải thích được mọi kết quả.

**Người dùng chính: Sinh viên**
- Thuộc khóa, ngành mà đợt thực tập nhắm tới; dùng hệ thống nhiều trên điện thoại.
- Cần biết mình hợp với công ty nào, còn thiếu kỹ năng gì, và có nơi thực tập sớm.

**Người dùng phụ: HR doanh nghiệp**
- Đăng JD, duyệt hồ sơ, phỏng vấn.
- Cần ít hồ sơ hơn nhưng đúng người hơn, kèm bằng chứng năng lực.

## Success Criteria

| Chỉ số | Mục tiêu khi bảo vệ đồ án | Mục tiêu khi vận hành thật |
|---|---|---|
| Tỷ lệ lấp đầy chỉ tiêu, tỷ lệ sinh viên có đề cử | Cao hơn phương án tự do ứng tuyển trên dữ liệu mô phỏng | Cao hơn đợt trước khi dùng hệ thống |
| Độ lệch số hồ sơ / chỉ tiêu giữa các JD | Thấp hơn phương án tự do ứng tuyển | Không JD nào vượt sức chứa |
| Chất lượng trích xuất CV/JD | Đo P/R/F1 trên tập gán nhãn | Giữ ổn định giữa các đợt |
| Độ khớp xếp hạng AI với chuyên gia | Đo tương quan Spearman, NDCG@k | Tương quan với quyết định thực tế của HR |
| Chi phí LLM mỗi sinh viên | Đo bằng `usage` thực tế, so với ước tính ~0,9 USD | Nằm trong ngân sách Trung tâm duyệt |

Cách đo chi tiết: [PRD.md › Success Criteria](PRD.md#success-criteria).

## Scope

### In Scope (MVP)
- Quản lý đợt, JD, CV; phân tích CV/JD bằng LLM kèm bước xác nhận.
- Chấm phù hợp có giải thích; chọn nguyện vọng.
- Sinh ngân hàng câu hỏi (trắc nghiệm + tự luận) có Validator; làm và chấm test.
- Thuật toán Deferred Acceptance; HR duyệt; nhập kết quả phỏng vấn; 1 vòng bổ sung; dashboard cơ bản.

### Out of Scope (v1.0)
- Quản lý quá trình thực tập sau khi sinh viên đã nhận (nhật ký, đánh giá cuối kỳ), hợp đồng, phụ cấp; tuyển dụng nhân sự chính thức.
- Bài lập trình chấm trong sandbox, tối ưu ILP, chatbot tư vấn, học trọng số từ phản hồi HR, tích hợp hệ thống đào tạo — để ở phần mở rộng.

## Vision

Nếu thành công, Smart Recruit Match trở thành công cụ chuẩn của Trung tâm cho mọi đợt thực tập: mỗi đợt để lại dữ liệu đã ẩn danh giúp hiệu chỉnh trọng số và prompt cho đợt sau, và có thể mở rộng sang các khoa khác hoặc các trường khác có cùng mô hình Trung tâm điều phối.
