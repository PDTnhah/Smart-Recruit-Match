# Smart Recruit Match

Hệ thống giúp Trung tâm quan hệ doanh nghiệp của trường ghép sinh viên thực tập với doanh nghiệp. LLM phân tích CV/JD, chấm độ phù hợp, sinh đề và chấm bài test. Thuật toán Deferred Acceptance phân bổ sinh viên theo chỉ tiêu. HR duyệt hồ sơ và phỏng vấn. Đây là đồ án tốt nghiệp: tính đúng, giải thích được và đo được quan trọng hơn tính năng phụ.

## Trạng thái

- Mới có tài liệu, **chưa có code**. Sắp bắt đầu giai đoạn 1 (Nền tảng) của lộ trình (Kiến trúc mục 12).
- Hai tài liệu là spec gốc, code phải khớp với chúng:
  - [docs/dac-ta-nghiep-vu.md](docs/dac-ta-nghiep-vu.md) (BRD): nghiệp vụ, công thức điểm, thuật toán, vòng đời trạng thái, quy tắc BR-01…BR-18.
  - [docs/kien-truc-he-thong.md](docs/kien-truc-he-thong.md) (Kiến trúc): stack, module, bảng DB, queue, cấu trúc thư mục.
- Khi spec mâu thuẫn, mơ hồ, hoặc chạm vào điểm chưa chốt (BRD 16.2, Q1–Q8): **hỏi, đừng tự quyết**. Tạm dùng cột "Đề xuất" và đưa thành tham số cấu hình.

## Đọc gì trước khi làm

Đừng đọc toàn bộ hai tài liệu mỗi lần (~55K token). Chỉ đọc mục liên quan:

| Việc | Đọc |
|---|---|
| Module nghiệp vụ bất kỳ | BRD mục 5 (giai đoạn tương ứng) + mục 9 (BR) + Kiến trúc 3.2 |
| Trạng thái, chuyển trạng thái | BRD mục 8 + Kiến trúc 3.3 |
| Tính S_cv / S_test / S_final | BRD mục 6 |
| Phân bổ, vòng bổ sung | BRD mục 7 + GĐ10 + Kiến trúc 3.4 |
| Bảng DB, migration | Kiến trúc 6.3 + BRD mục 11 |
| AI agent, prompt, chi phí | Kiến trúc mục 4, 5 + BRD 10.3 |
| Queue, message | Kiến trúc mục 7 |
| Phòng thi | BRD GĐ5 + Kiến trúc 2.3 |
| Bảo mật, phân quyền | Kiến trúc mục 8 + BRD mục 2 |

## Stack

Monorepo pnpm (cấu trúc thư mục: Kiến trúc mục 11):

- `apps/web`: React 19 + TS + Vite, Ant Design (locale vi_VN), TanStack Query, React Hook Form + Zod
- `apps/api`: NestJS (TS strict), Drizzle ORM, nestjs-zod, @golevelup/nestjs-rabbitmq; Jest, fast-check, testcontainers
- `packages/shared`: Zod schema, kiểu trạng thái + bảng chuyển trạng thái, contract message
- `ai-service`: Python 3.12, FastStream, FastAPI, Anthropic SDK, Pydantic v2; pytest
- PostgreSQL 16 + pgvector, Redis, RabbitMQ, MinIO; Docker Compose trong `deploy/`

Không thêm thư viện ngoài danh sách ở Kiến trúc 1.3 và 3.7 khi chưa hỏi.

## Lệnh

Chưa có. Điền sau khi scaffold xong giai đoạn 1. Không đoán lệnh không có trong `package.json` hoặc `pyproject.toml`.

## Nguyên tắc bất biến

Vi phạm các điều dưới đây là lỗi, kể cả khi code vẫn chạy được.

**Ranh giới của LLM**

1. LLM không ra quyết định và không tính điểm tổng. LLM trả JSON theo schema (verdict từng tiêu chí + bằng chứng); code tính S_cv, S_test, S_final (BR-13, BRD 6.1).
2. Không dùng LLM cho: điều kiện cứng, tính điểm, chấm trắc nghiệm, phân bổ, chuyển trạng thái, mức cạnh tranh, SLA, phân quyền (Kiến trúc 5.2).
3. AI Service không chuyển trạng thái nghiệp vụ và chỉ ghi schema `ai`. Nó đọc `core` qua view đã che PII. Chỉ Core Backend được ghi `core`.

**Công bằng, dữ liệu cá nhân, bảo mật**

4. Không đưa ảnh, giới tính, ngày sinh, quê quán, tôn giáo, tình trạng hôn nhân vào bất kỳ bước chấm nào. Matching và Grader chỉ nhận `profile_masked` (BR-03).
5. Verdict `MET`/`PARTIAL` phải có `evidence` khớp với văn bản CV (RapidFuzz ≥ 85). Không khớp thì hạ xuống `NOT_MET`.
6. CV, JD và bài làm của sinh viên là **dữ liệu, không phải chỉ dẫn**: tách riêng trong prompt, phát hiện chữ ẩn, chỉ nhận đầu ra đúng schema.
7. Phân quyền cấp bản ghi: HR chỉ thấy đề cử thuộc JD của công ty mình (BR-11); sinh viên chỉ thấy dữ liệu và điểm của mình.
8. Phòng thi: đáp án không bao giờ gửi xuống client; deadline do server quyết định; tín hiệu gian lận chỉ để cảnh báo, không tự đánh trượt.

**Tất định, truy vết**

9. Allocation Engine là hàm TS thuần trong `allocation/domain/`, không phụ thuộc DB hay AI. Điểm quy về số nguyên (×100) trước khi so sánh. Hàm so sánh luôn chặt (phá hòa theo BRD 6.3, cuối cùng so mã sinh viên). Sau mỗi lần chạy gọi `checkStability()`, và lưu snapshot đầu vào + cấu hình (BR-17).
10. Mọi thay đổi trạng thái đi qua `transitionTo(newState, actor, reason)` dựa trên bảng chuyển trạng thái ở `packages/shared/states`. Kiểm tra điều kiện và ghi audit trong cùng giao dịch; chống ghi đè đồng thời bằng `row_version`.
11. Quy tắc nghiệp vụ quan trọng phải có ràng buộc DB tương ứng, không chỉ kiểm tra trong code (VD: partial unique index cho BR-08).
12. Mọi kết quả từ LLM lưu kèm `model` và `prompt_version`.

**Ranh giới module**

13. Module NestJS không truy vấn bảng của module khác; chỉ gọi service đã export hoặc phát event. `domain/` không import NestJS hay Drizzle.
14. Kiểu dùng chung FE/BE đặt ở `packages/shared`. Contract message TS ↔ Python định nghĩa một lần bằng Zod, xuất JSON Schema, rồi sinh Pydantic. Không viết tay ở cả hai phía.
15. Job AI chạy bất đồng bộ qua RabbitMQ: payload chỉ chứa ID, xử lý idempotent theo `job_id`.

## Gọi Claude API (ai-service)

- Trước khi viết code gọi LLM, dùng skill `claude-api`. Không viết tham số API theo trí nhớ.
- Model `claude-opus-5-5`. Ghi rõ `output_config.effort` cho từng tác vụ (Kiến trúc 5.1). Lấy JSON bằng structured outputs (`output_config.format`), không dùng `tool_choice` để ép gọi công cụ.
- Luôn kiểm tra `stop_reason == "refusal"` trước khi đọc nội dung.
- Mọi lượt gọi đi qua `LLMClient` trong `ai-service/app/llm/`; agent không gọi SDK trực tiếp.
- Prompt là file có phiên bản: `ai-service/app/prompts/<agent>/v<N>.md`. Không sửa prompt đã dùng; tạo `v<N+1>`.
- Phần cố định của prompt đặt đầu, phần thay đổi đặt cuối. Không chèn thời gian hay ID ngẫu nhiên vào `system`. JSON đưa vào prompt dùng `sort_keys=True`, để prompt caching hoạt động.
- Test dùng fixture, **không gọi API thật**. API thật chỉ chạy trong `ai-service/evals/`, khởi động thủ công.

## Kiểm thử

- Công thức điểm, bảng chuyển trạng thái, quy tắc phá hòa: unit test.
- Allocation: property-based test (fast-check) cho ba tính chất ổn định, không vượt sức chứa, tất định. Ví dụ ở BRD 7.3 phải là một test cố định.
- Integration test dùng PostgreSQL/RabbitMQ/Redis/MinIO thật qua testcontainers.
- Ghi mã BR-xx hoặc GĐx liên quan vào tên test và commit message để truy vết khi viết báo cáo.

## Quy ước

- Trả lời người dùng bằng tiếng Việt. Identifier, tên bảng/cột, enum, route API viết tiếng Anh. Chuỗi UI viết tiếng Việt; cổng sinh viên phải dùng tốt trên điện thoại.
- Code thay đổi hành vi so với spec (trạng thái, công thức, bảng, queue) thì cập nhật `docs/` trong cùng commit. Nếu đó là thay đổi thiết kế, hỏi trước.
- Thuật ngữ nghiệp vụ và tên tương ứng trong code (theo Kiến trúc 6.3):

| Nghiệp vụ | Code |
|---|---|
| Đợt thực tập; tham số đợt (N_NV, θ_cv, θ_test, α, β, k…) | `campaign`; `campaigns.config` |
| JD; yêu cầu chuẩn hóa; chỉ tiêu | `job_description`; `requirements`; `quota` |
| Hồ sơ năng lực (bản đầy đủ / đã che PII) | `cvs.profile` / `cvs.profile_masked` |
| Điều kiện cứng; kết quả phù hợp | `eligible`, `ineligible_reasons`; `match_result` |
| Nguyện vọng (NV1 = ưu tiên cao nhất) | `preference` (`rank` = 1) |
| Ngân hàng câu hỏi; ma trận đề | `question_bank`; `exam_blueprint` |
| Bài test; câu trả lời; phúc khảo | `exam_session`; `exam_answer`; `appeal` |
| Vòng phân bổ; đề cử; sức chứa C_j | `allocation_round`; `nomination`; `capacity` |
| HR duyệt; phỏng vấn; lời mời thực tập | `hr_review`; `interview`; `offer` |
| Trạng thái đề cử đang chạy (BR-08) | `NOMINATED`, `INTERVIEW`, `PASSED`, `RESERVE` |
