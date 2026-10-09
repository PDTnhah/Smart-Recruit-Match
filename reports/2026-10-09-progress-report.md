# Báo cáo tiến độ đồ án tốt nghiệp — Smart Recruit Match

| | |
|---|---|
| Sinh viên thực hiện | … |
| Giảng viên hướng dẫn | … |
| Ngày báo cáo | 09/10/2026 (cuối tuần 1 trong lộ trình 13 tuần) |
| Phiên bản hệ thống | 0.2.0 |
| Mã nguồn | <https://github.com/PDTnhah/Smart-Recruit-Match> |

## Tóm tắt

- **Thiết kế đã xong.** Đặc tả nghiệp vụ gồm quy trình 11 giai đoạn, 18 quy tắc nghiệp vụ (BR), 37 yêu cầu chức năng (FR) và 13 yêu cầu phi chức năng (NFR). Tài liệu kiến trúc có 14 quyết định kiến trúc (AD). Cả 37 user story đã được viết sẵn, kèm tiêu chí nghiệm thu.
- **Nền tảng đã chạy được.** Đã xong 3/37 story, tương đương 18/212 điểm (khoảng 8%). Kế hoạch tuần 1 chỉ có 5 điểm, nên tiến độ đang sớm khoảng một tuần.
- **Chưa có:** chức năng nghiệp vụ (tạo đợt, đăng JD, nộp CV), phần AI và thuật toán phân bổ. Các phần này bắt đầu từ tuần 2.
- **Cần thầy cho ý kiến** ở [mục 9](#9-xin-ý-kiến-thầy): một số quy tắc nghiệp vụ chưa chốt, và việc hỗ trợ dữ liệu CV/JD cùng người đánh giá cho chương thực nghiệm.

---

## 1. Bài toán và mục tiêu

Mỗi đợt thực tập, Trung tâm quan hệ doanh nghiệp là cầu nối giữa hàng trăm sinh viên và hàng chục doanh nghiệp. Hiện nay sinh viên tự nộp CV và doanh nghiệp tự lọc. Cách làm này gây ra bốn vấn đề:

- **Dồn hồ sơ:** sinh viên tập trung vào vài công ty nổi tiếng, trong khi công ty khác thiếu ứng viên.
- **Sàng lọc thủ công:** tốn thời gian, cảm tính, thiếu nhất quán.
- **CV tự khai:** khó kiểm chứng năng lực thật trước khi phỏng vấn.
- **Bị từ chối liên tiếp:** có sinh viên đến cuối đợt vẫn chưa có nơi thực tập.

Hướng giải quyết:

- LLM đọc CV và JD, chấm độ phù hợp có trích dẫn bằng chứng, sinh và chấm bài test theo yêu cầu của từng JD.
- Thuật toán Deferred Acceptance phân bổ sinh viên theo điểm, có giới hạn chỉ tiêu.
- Con người giữ quyền quyết định: HR duyệt hồ sơ và phỏng vấn, Trung tâm duyệt và điều chỉnh kết quả phân bổ.

**Mục tiêu**

| Mã | Mục tiêu |
|---|---|
| MT1 | Tự động đánh giá độ phù hợp CV–JD, có giải thích và bằng chứng |
| MT2 | Tự động sinh và chấm bài test theo yêu cầu của JD |
| MT3 | Phân bổ theo điểm từ cao xuống thấp, có giới hạn chỉ tiêu, để không doanh nghiệp nào quá tải hay bỏ trống |
| MT4 | Con người quyết định ở các điểm then chốt; mọi điều chỉnh đều được ghi vết |
| MT5 | Giảm thời gian xử lý của Trung tâm và HR, tăng tỷ lệ sinh viên có nơi thực tập |

**Chỉ số sẽ đo ở chương thực nghiệm**

| Thành phần | Chỉ số | Cách đo |
|---|---|---|
| Phân tích CV/JD | Precision, Recall, F1 theo từng trường | So với khoảng 50 CV và 20 JD gán nhãn tay |
| Chấm phù hợp | Tương quan Spearman, NDCG@k | So xếp hạng của AI với xếp hạng độc lập của 2–3 người đánh giá |
| Sinh đề | Tỷ lệ câu hợp lệ, độ khó thực tế, độ phân biệt | Chuyên gia đánh giá và dữ liệu làm bài thử |
| Chấm tự luận | MAE, Cohen's kappa có trọng số | So với điểm của người chấm |
| Phân bổ | Tỷ lệ lấp đầy chỉ tiêu, tỷ lệ vào NV1 và top-3, độ lệch hồ sơ/chỉ tiêu giữa các JD, số cặp bất ổn định | Mô phỏng, so với phương án tự do ứng tuyển và các phương án đối chứng khác |
| Toàn hệ thống | Thời gian xử lý một đợt, chi phí LLM trên mỗi sinh viên, mức hài lòng | Log hệ thống, khảo sát |

---

## 2. Luồng nghiệp vụ

```mermaid
flowchart TD
    A[Cán bộ Trung tâm tạo đợt thực tập] --> B[HR đăng JD và chỉ tiêu]
    A --> C[Sinh viên nộp CV]
    B --> B1[AI phân tích JD → yêu cầu chuẩn hóa]
    B1 --> B2{HR xác nhận,<br/>Trung tâm duyệt}
    B2 --> B3[AI sinh ngân hàng câu hỏi cho JD]
    C --> C1[AI phân tích CV → hồ sơ năng lực]
    C1 --> C2{Sinh viên xác nhận}
    B2 --> D[AI chấm độ phù hợp<br/>mọi cặp SV × JD]
    C2 --> D
    D --> E[Sinh viên xem shortlist,<br/>chọn tối đa N nguyện vọng]
    B3 --> F[Sinh viên làm test cho từng nguyện vọng]
    E --> F
    F --> G[AI chấm test → điểm tổng hợp]
    G --> H[Thuật toán phân bổ có chỉ tiêu]
    H --> H1{Trung tâm xem dự thảo,<br/>điều chỉnh, công bố}
    H1 --> I{HR duyệt danh sách đề cử}
    I -- Mời phỏng vấn --> K[Phỏng vấn]
    I -- Từ chối --> L[Sinh viên về hàng chờ]
    K -- Đạt --> M[Sinh viên xác nhận nhận thực tập]
    K -- Không đạt --> L
    M -- Từ chối --> L
    L --> N{Còn vòng bổ sung?}
    N -- Có --> H
    N -- Không --> O[Trung tâm xử lý thủ công]
    M -- Nhận --> P[Đóng đợt, báo cáo]
    O --> P
```

| GĐ | Tên | Tác nhân chính | Đầu ra |
|---|---|---|---|
| 0 | Thiết lập đợt | Cán bộ Trung tâm | Đợt với mốc thời gian và cấu hình |
| 1 | Tiếp nhận JD | HR, AI | JD có yêu cầu chuẩn hóa, ngân hàng câu hỏi |
| 2 | Tiếp nhận CV | Sinh viên, AI | Hồ sơ năng lực đã xác nhận |
| 3 | Chấm độ phù hợp | AI | S_cv của mọi cặp SV × JD, shortlist từng sinh viên |
| 4 | Chọn nguyện vọng | Sinh viên | Danh sách nguyện vọng có thứ tự |
| 5 | Làm bài test | Sinh viên | Bài làm |
| 6 | Chấm test, tính điểm | AI, người chấm khi cần | S_test, S_final |
| 7 | Phân bổ | Thuật toán, Cán bộ Trung tâm | Danh sách đề cử cho từng JD |
| 8 | HR duyệt | HR | Mời phỏng vấn hoặc từ chối |
| 9 | Phỏng vấn, xác nhận | HR, Sinh viên | Sinh viên nhận thực tập |
| 10 | Vòng bổ sung, đóng đợt | Cán bộ Trung tâm | Kết quả cuối cùng, báo cáo |

Một đợt mẫu kéo dài khoảng 9 tuần.

### Điểm và phân bổ

- **S_cv** (độ phù hợp CV–JD) là tổng có trọng số của 5 tiêu chí, chi tiết ở [mục 7](#7-thiết-kế-chấm-phù-hợp-cvjd).
- **S_test** = 0,6 × phần A (trắc nghiệm) + 0,4 × phần B (tự luận), thang 100.
- **S_final** = α · S_cv + β · S_test, với α + β = 1, mặc định α = 0,4 và β = 0,6. Bài test được trọng số cao hơn vì là đánh giá khách quan, cùng chuẩn cho mọi người; CV là thông tin tự khai.
- Sinh viên chỉ được phân bổ vào một JD khi đạt điều kiện cứng, có S_cv ≥ θ_cv và S_test ≥ θ_test.
- **Thuật toán phân bổ:** Deferred Acceptance (Gale–Shapley), phía sinh viên đề xuất.
    - Mỗi JD có sức chứa C_j = ⌈chỉ tiêu_j × k⌉, đề xuất k = 1,5.
    - Mỗi vòng, mỗi sinh viên được đề cử vào tối đa một JD.
    - Độ phức tạp O(n · N_NV · log C).
- **Tính ổn định:** không tồn tại cặp (sinh viên a, JD x) mà a thích x hơn kết quả của mình, đồng thời x còn suất hoặc đang giữ người điểm thấp hơn a. Vì vậy không ai có lý do chính đáng để khiếu nại kết quả.
- **Tất định:** bằng điểm thì phá hòa lần lượt theo S_test, S_cv, GPA, thời điểm nộp bài, cuối cùng là mã sinh viên. Cùng đầu vào luôn cho cùng kết quả.

---

## 3. Tác vụ hệ thống: ai làm gì

### Phân công tác vụ

LLM chỉ làm ba việc: đọc, trích xuất và đánh giá theo từng tiêu chí. Kết quả là JSON kèm bằng chứng. Mọi con số và mọi quyết định đều do code hoặc con người đưa ra.

| Tác vụ | GĐ | Thực hiện | Con người kiểm soát |
|---|---|---|---|
| Chuẩn hóa yêu cầu JD (kỹ năng, mức độ, điều kiện cứng) | 1 | LLM: JD Analyzer | HR xác nhận, Trung tâm duyệt JD |
| Sinh ngân hàng câu hỏi theo ma trận đề | 1 | LLM: Test Generator (agent có công cụ), Validator tự giải lại để kiểm đáp án | Trung tâm duyệt mẫu |
| Trích hồ sơ năng lực từ CV, phát hiện chữ ẩn, tách thông tin cá nhân | 2 | LLM: CV Parser, cùng code | Sinh viên xác nhận hồ sơ |
| Lọc điều kiện cứng (ngành, năm học, GPA, ngoại ngữ) | 3 | Code | – |
| Lọc sơ bộ top-M JD cho mỗi sinh viên | 3 | Embedding bge-m3 tự host | – |
| Đánh giá từng tiêu chí CV–JD kèm bằng chứng | 3 | LLM: Matching Agent | – |
| Kiểm tra bằng chứng, tính S_cv, lập shortlist | 3 | Code | – |
| Tính mức cạnh tranh của từng JD | 4 | Code | – |
| Chấm trắc nghiệm | 6 | Code | – |
| Chấm tự luận | 6 | LLM: Grader, chấm 2 lần độc lập | Chuyển người chấm khi độ tự tin thấp, điểm sát ngưỡng θ_test (±5) hoặc hai lần chấm lệch nhau; sinh viên được phúc khảo |
| Tính S_test, S_final | 6 | Code | – |
| Phân bổ | 7 | Code: Deferred Acceptance | Trung tâm xem dự thảo, điều chỉnh, công bố |
| Duyệt hồ sơ, phỏng vấn, gửi lời mời | 8–9 | Con người | HR |
| Vòng bổ sung, đóng đợt | 10 | Code | Trung tâm |
| Chuyển trạng thái, nhắc hạn, tín hiệu gian lận, phân quyền | Mọi GĐ | Code | – |

Có những chỗ hệ thống cố ý không dùng LLM:

- Các bước ảnh hưởng trực tiếp tới quyền lợi sinh viên.
- Các bước có lời giải chính xác bằng code.

Dùng LLM ở những chỗ này chỉ làm hệ thống đắt hơn, chậm hơn và khó giải thích hơn.

### Vai trò của Cán bộ Trung tâm và Quản trị

Cán bộ Trung tâm vận hành nghiệp vụ, còn Quản trị lo phần kỹ thuật. Hai vai trò dùng chung cổng `/admin` nhưng mỗi bên chỉ thấy menu của mình. Gọi chức năng của bên kia thì bị từ chối (`403`).

**Cán bộ Trung tâm: người điều phối đợt thực tập**

| GĐ | Việc |
|---|---|
| 0 | Tạo đợt, cấu hình tham số (N_NV, θ_cv, θ_test, α, β, k, các mốc thời gian) |
| 1 | Tạo doanh nghiệp, mời tài khoản HR, duyệt JD |
| 3 | Chạy chấm phù hợp hàng loạt |
| 4 | Theo dõi các JD có tỷ lệ nguyện vọng/chỉ tiêu < 1 để chủ động liên hệ doanh nghiệp |
| 6 | Chấm tay câu tự luận được chuyển, xử lý phúc khảo, xem tín hiệu gian lận |
| 7 | Chạy phân bổ, xem dự thảo, điều chỉnh (bắt buộc ghi lý do), công bố |
| 8 | Can thiệp khi HR quá hạn phản hồi |
| 10 | Mở vòng bổ sung, xử lý thủ công sinh viên còn lại, đóng đợt, xem dashboard, xuất báo cáo |

Trung tâm là vai trò giữ quyền quyết định ở phía nhà trường (MT4). Mọi điều chỉnh của Trung tâm đều được ghi vào nhật ký thao tác.

**Quản trị hệ thống: bộ phận kỹ thuật, không tham gia nghiệp vụ**

- Tạo tài khoản Trung tâm, Quản trị, Sinh viên. Chức năng này đã có.
- Quản lý danh mục kỹ năng, duyệt kỹ năng mới do AI phát hiện.
- Cấu hình model AI và phiên bản prompt.
- Theo dõi chi phí LLM.

**Ranh giới giữa hai vai trò**

- Quản trị không được tạo hay sửa đợt, chạy chấm, chạy phân bổ, xem dashboard hay xuất báo cáo.
- Trung tâm không được quản lý tài khoản, danh mục kỹ năng hay chi phí AI.
- Tài khoản HR do Trung tâm tạo, qua lời mời gắn với doanh nghiệp. Quản trị không tạo được tài khoản HR.

---

## 4. Kiến trúc hệ thống

### Sơ đồ và thành phần

```mermaid
flowchart TB
    subgraph Client[Trình duyệt]
        FE[Web App React<br/>Cổng Sinh viên · HR · Trung tâm]
    end
    FE -- HTTPS REST / SSE --> GW[Nginx<br/>reverse proxy]
    GW --> BE[Core Backend<br/>NestJS · TypeScript]
    BE <--> PG[(PostgreSQL<br/>+ pgvector)]
    BE <--> RD[(Redis)]
    BE <--> S3[(MinIO<br/>file CV, JD)]
    BE -- job --> MQ{{RabbitMQ}}
    MQ -- job --> AIW[AI Service<br/>Python workers]
    AIW -- kết quả --> MQ
    MQ -- kết quả --> BE
    AIW --> LLM[Claude API]
    AIW --> EMB[Mô hình embedding<br/>bge-m3 tự host]
    AIW <--> PG
    AIW --> S3
    BE --> SMTP[Email SMTP]
```

| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| Web App | React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui | Ba cổng: Sinh viên `/sv` (ưu tiên điện thoại), HR `/hr`, Trung tâm và Quản trị `/admin` |
| Core Backend | NestJS, TypeScript, Drizzle ORM | Nghiệp vụ, trạng thái, tính điểm, phân bổ, phân quyền. Là thành phần duy nhất được ghi dữ liệu nghiệp vụ |
| AI Service | Python 3.12, FastStream, FastAPI, Anthropic SDK | Worker không trạng thái: nhận job, gọi LLM hoặc embedding, trả kết quả có cấu trúc. Không chuyển trạng thái, không ghi bảng nghiệp vụ |
| PostgreSQL 16 + pgvector | | Dữ liệu nghiệp vụ (schema `core`), dữ liệu AI và embedding (schema `ai`) |
| RabbitMQ | | Hàng đợi job AI. Message chỉ chứa ID, xử lý idempotent, lỗi 3 lần thì vào hàng đợi lỗi |
| Redis | | Refresh token, cache |
| MinIO | | Lưu file CV, JD |
| Claude API | `claude-opus-5-5` | LLM cho mọi agent; độ sâu suy luận chỉnh theo từng tác vụ |

Cả hệ thống dựng bằng Docker Compose với một lệnh.

### Nguyên tắc thiết kế

1. **LLM không ra quyết định** và không tính điểm tổng.
2. **Công bằng.** Ảnh, giới tính, ngày sinh, quê quán, tôn giáo và tình trạng hôn nhân không đi vào bất kỳ bước chấm nào. AI chỉ đọc hồ sơ đã che thông tin cá nhân, qua một view riêng của DB.
3. **Chống ảo giác.** Verdict "đáp ứng" phải có trích dẫn khớp với văn bản CV (RapidFuzz ≥ 85); không khớp thì bị hạ xuống "không đáp ứng".
4. **Chống prompt injection.** CV, JD và bài làm là dữ liệu, không phải chỉ dẫn. Chữ ẩn trong CV (màu trùng nền, cỡ chữ < 2pt…) bị phát hiện và loại bỏ.
5. **Truy vết.**
    - Mọi kết quả LLM lưu kèm model và phiên bản prompt.
    - Prompt là file có phiên bản; bản đã dùng thì không sửa.
    - Mọi thay đổi trạng thái được ghi vào nhật ký không sửa, xóa được.
6. **Tất định.**
    - Thuật toán phân bổ là hàm thuần.
    - Điểm quy về số nguyên trước khi so sánh.
    - Mỗi lần chạy lưu lại đầu vào và cấu hình để chạy lại cho cùng kết quả.
7. **Tiết kiệm chi phí.** Chấm hàng loạt qua Message Batches (rẻ hơn 50%) và dùng prompt caching. Ước tính bước chấm phù hợp cho 500 sinh viên × 50 JD tốn khoảng 115 USD.

### Lưu trữ: thành phần nào ghi gì

PostgreSQL là nguồn sự thật duy nhất. Mỗi thành phần chỉ ghi vào vùng của mình.

| Nơi lưu | Core Backend | AI Service |
|---|---|---|
| PostgreSQL, schema `core` | Ghi toàn bộ dữ liệu nghiệp vụ: đợt, JD, CV, hồ sơ năng lực, kết quả chấm, câu hỏi, bài thi, đề cử, nhật ký | Chỉ đọc, qua các view đã che thông tin cá nhân |
| PostgreSQL, schema `ai` | – | Ghi embedding, log gọi LLM, trạng thái job |
| MinIO | Ghi file CV/JD gốc, báo cáo xuất ra | Đọc file CV/JD gốc; ghi log request/phản hồi LLM |
| Redis | Đọc, ghi | – |

**AI Service không ghi dữ liệu nghiệp vụ.** Hồ sơ năng lực, verdict hay câu hỏi được AI Service gửi về backend qua RabbitMQ, và backend mới là bên ghi vào `core`. AI Service chỉ ghi:

| Nơi | Nội dung | Dùng để |
|---|---|---|
| `ai.embeddings` | Vector 1024 chiều của CV, JD, câu hỏi, kỹ năng, bài tự luận | Lọc top-M JD, chuẩn hóa kỹ năng, phát hiện trùng |
| `ai.llm_calls` | Mỗi lượt gọi LLM một dòng: agent, phiên bản prompt, model, số token, chi phí, độ trễ | Theo dõi chi phí, truy vết |
| `ai.jobs` | Trạng thái, số lần thử của từng job | Chống xử lý trùng một job |
| MinIO, bucket `llm-logs` | Request và phản hồi đầy đủ của từng lượt gọi LLM, mỗi lượt một file JSON | Truy vết. Để ngoài DB vì mỗi lượt dài hàng chục KB, hàng nghìn lượt mỗi đợt |

AI Service đọc dữ liệu nghiệp vụ bằng một tài khoản DB riêng, chỉ được đọc các view đã che thông tin cá nhân. Vì vậy dù code có lỗi, AI cũng không đọc được tên, ngày sinh, quê quán của sinh viên. Log của bước phân tích CV chứa CV đầy đủ, nên `llm-logs` nằm trong chính sách xóa dữ liệu sau khi đóng đợt.

### Redis

Redis không thay PostgreSQL. Redis chỉ giữ những dữ liệu có ít nhất một trong các đặc điểm sau:

- tự hết hạn;
- được ghi hoặc đọc rất dày;
- cần chia sẻ giữa nhiều instance API;
- dựng lại được từ DB.

| Dữ liệu | Vì sao dùng Redis | Trạng thái |
|---|---|---|
| Refresh token (chỉ lưu giá trị băm) | Tự hết hạn sau 7 ngày. Lấy và xóa trong một lệnh nguyên tử, nên một token không dùng lại được | Đã có |
| Đáp án đang làm dở, deadline của phiên thi | 200 sinh viên tự lưu liên tục, tức hàng nghìn lần ghi mỗi phút; ghi vào bộ nhớ thì rẻ. Khi nộp bài, đáp án được ghi vào PostgreSQL trong một giao dịch | Phòng thi (US-4.3) |
| Bộ đếm mức cạnh tranh của từng JD | Mọi sinh viên xem liên tục khi chọn nguyện vọng. Tăng, giảm là thao tác nguyên tử nên không đếm sai. Chỉ dùng để hiển thị; số liệu dùng ra quyết định vẫn đếm từ DB | US-3.4 |
| Khóa khi chạy phân bổ | Ngăn hai lần chạy cùng lúc, kể cả khi API chạy nhiều instance | US-5.2 |
| Giới hạn tần suất gọi API | Bộ đếm tự hết hạn sau 1 phút | – |
| Kênh pub/sub cho thông báo thời gian thực | Thông báo tạo ở một instance đến được người dùng đang kết nối với instance khác | US-1.7 |

Rủi ro: đáp án đang làm dở chỉ có một bản, nằm trong Redis, cho tới khi nộp. Redis bật ghi nhật ký ra đĩa (AOF), nên khởi động lại vẫn còn dữ liệu, nhưng có thể mất khoảng 1 giây ghi cuối.

### RabbitMQ

RabbitMQ là hàng đợi nối backend (TypeScript) với AI Service (Python), để hai bên làm việc bất đồng bộ.

**Vì sao cần hàng đợi**

- **Gọi LLM chậm.** Phân tích một CV mất vài giây đến vài chục giây; chấm hàng loạt qua Message Batches có thể mất hàng giờ. Không thể bắt request HTTP chờ lâu như vậy. Backend trả "đã nhận" ngay, khi có kết quả thì báo người dùng qua thông báo thời gian thực.
- **Gọi LLM có thể lỗi.** Job chỉ bị xóa khỏi hàng đợi khi AI Service xác nhận xử lý xong. AI Service dừng giữa chừng thì job vẫn còn và được xử lý lại. Sau 3 lần lỗi, job chuyển vào hàng đợi lỗi để người xử lý.
- **Hai bên độc lập.** Hai ngôn ngữ, hai tiến trình, tắt bật riêng. Khi tải lớn, chỉ cần chạy thêm worker AI.

**Các hàng đợi**

| Hàng đợi | Hướng | Nội dung message |
|---|---|---|
| `ai.cv.parse` | Backend → AI | Mã job, mã CV, phiên bản CV, khóa file |
| `ai.jd.analyze` | Backend → AI | Mã job, mã JD, phiên bản JD |
| `ai.questions.generate` | Backend → AI | Mã job, mã ngân hàng câu hỏi |
| `ai.match.run` | Backend → AI | Mã job, mã đợt, danh sách cặp CV–JD đã qua điều kiện cứng |
| `ai.essay.grade` | Backend → AI | Mã job, danh sách bài thi |
| `ai.results` | AI → Backend | Mã job, loại, trạng thái (thành công / một phần / lỗi), kết quả |

**Ba quy tắc**

1. Message chỉ chứa ID. Nội dung CV/JD được đọc từ DB hoặc MinIO, nên message nhỏ và thông tin cá nhân không đi qua hàng đợi.
2. Mỗi job có mã duy nhất. Nhận trùng một message cũng không làm sai dữ liệu.
3. Định dạng message chỉ viết một lần, rồi sinh ra cho cả TypeScript và Python. Một phía đổi mà phía kia không đổi theo thì CI báo lỗi.

**Ví dụ: luồng nộp CV**

1. Sinh viên tải CV lên. Backend lưu file vào MinIO, gửi job `ai.cv.parse`, trả "đã nhận".
2. AI Service đọc file từ MinIO, gọi Claude, rồi ghi log cuộc gọi, log đầy đủ và embedding của CV.
3. AI Service gửi hồ sơ năng lực về qua `ai.results`.
4. Backend lưu hồ sơ, chuyển CV sang "Chờ sinh viên xác nhận", rồi báo sinh viên.

### Mô hình embedding bge-m3

Embedding biến một đoạn văn thành một vector số, ở đây là vector 1024 chiều. Hai đoạn văn gần nghĩa cho ra hai vector gần nhau. Nhờ vậy hệ thống so được độ gần nghĩa giữa hàng nghìn đoạn văn bằng phép tính, không cần gọi LLM.

| Việc | GĐ | Cách làm | Nếu không có embedding |
|---|---|---|---|
| **Lọc sơ bộ top-M JD cho mỗi CV** | 3 | Mỗi CV chỉ giữ M = 10 JD gần nhất rồi mới gửi cho Matching Agent | Phải gọi LLM cho 25.000 cặp (500 × 50) thay vì 5.000 cặp. Chi phí chấm phù hợp tăng khoảng 5 lần, từ ~115 lên ~575 USD mỗi đợt |
| **Chuẩn hóa tên kỹ năng** | 1, 2 | "ReactJS", "React.js", "react js" đều được gán về `React` khi độ tương đồng ≥ 0,85. Dưới ngưỡng thì thành kỹ năng mới, chờ Quản trị duyệt | Kỹ năng ở CV và JD viết khác nhau sẽ không khớp, nên chấm sai |
| **Tránh câu hỏi trùng khi sinh đề** | 1 | Test Generator tra 3 câu đã có gần nhất trước khi thêm câu mới | Ngân hàng có nhiều câu gần giống nhau |
| **Phát hiện bài tự luận giống nhau** | 6 | So vector các bài làm của cùng một câu | Bỏ sót dấu hiệu chép bài. Đây chỉ là cảnh báo, không tự đánh trượt |

**Vì sao dùng embedding thay vì LLM cho các việc này.** Đây đều là bài toán "cái nào gần cái nào" trên số lượng lớn. Mỗi văn bản chỉ cần tính vector một lần; sau đó so với mọi văn bản khác chỉ mất vài mili giây. Kết quả tất định và không tốn phí. LLM chỉ dùng ở bước cần đọc hiểu và lập luận, và chỉ cho các cặp đã qua lọc.

**Vì sao chọn bge-m3 và tự host**

- Claude không có API embedding. Dùng embedding qua API phải thêm một nhà cung cấp nữa, tức thêm chi phí và thêm một nơi nhận dữ liệu của sinh viên.
- Tự host thì nội dung CV không rời máy chủ (liên quan Q8 ở [mục 9](#9-xin-ý-kiến-thầy)). Vector CV được tính từ hồ sơ đã che thông tin cá nhân.
- bge-m3 là mô hình đa ngôn ngữ, xử lý được CV và JD trộn tiếng Việt với tiếng Anh, vốn phổ biến trong ngành IT.
- Chạy được trên CPU với khoảng 2–4 GB RAM; quy mô đồ án không cần GPU.

**Rủi ro**

- **Lọc sơ bộ có thể loại nhầm JD phù hợp.** Embedding chỉ đo độ gần nghĩa chung. Một JD thực sự hợp có thể nằm ngoài top-10 và không bao giờ được LLM chấm. Em đề xuất đo thêm chỉ số **recall@M**: trong các JD mà người đánh giá cho là phù hợp, bao nhiêu phần trăm lọt vào top-M. Ở quy mô demo (10 JD), M = 10 nghĩa là không cắt cặp nào.
- **Vector có thể cũ.** Vector CV được tính lúc phân tích CV, nhưng sinh viên có thể sửa hồ sơ ở bước xác nhận. Cần tính lại vector từ hồ sơ đã xác nhận trước khi lọc.
- **Ngưỡng 0,85** cho chuẩn hóa kỹ năng là số đề xuất, để thành tham số cấu hình và cần đo trên dữ liệu thật.

---

## 5. Kết quả đã đạt

| Phiên bản | Ngày | Story | Kết quả |
|---|---|---|---|
| 0.2.0 | 08/10/2026 | US-1.3 | Đăng nhập, phân quyền 4 vai trò, design system, khung giao diện 3 cổng |
| 0.1.1 | 08/10/2026 | US-1.2 | Lược đồ CSDL lõi, máy trạng thái, nhật ký thao tác |
| 0.1.0 | 08/10/2026 | US-1.1 | Khung monorepo, Docker Compose, CI |

### US-1.1: Khung dự án (0.1.0)

- Monorepo gồm 4 phần:
    - `apps/api`: backend NestJS.
    - `apps/web`: giao diện React.
    - `packages/shared`: kiểu và schema dùng chung cho frontend và backend.
    - `ai-service`: dịch vụ AI viết bằng Python.
- Docker Compose dựng 7 service bằng một lệnh, mỗi service có health check: PostgreSQL + pgvector, Redis, RabbitMQ, MinIO, Mailpit (email thử), API, web.
- CI trên GitHub Actions chạy:
    - kiểm kiểu, lint;
    - test, gồm cả test tích hợp với DB thật;
    - build;
    - kiểm ranh giới module;
    - lint và test Python.
- Luật ranh giới module được kiểm tự động: tầng `domain/` không phụ thuộc framework hay DB; một module chỉ gọi module khác qua giao diện đã export.

### US-1.2: CSDL lõi và chuyển trạng thái (0.1.1)

- 7 bảng đầu tiên: đợt thực tập, công ty, người dùng, sinh viên, JD, CV, nhật ký thao tác.
- Vòng đời của đợt, JD và CV được định nghĩa một lần dưới dạng bảng chuyển trạng thái, dùng chung cho web và API:
    - **Đợt:** Nháp → Mở nhận JD/CV → Chọn nguyện vọng → Làm test → Phân bổ và HR duyệt → Vòng bổ sung → Đã đóng.
    - **JD:** Nháp → Chờ HR xác nhận yêu cầu → Chờ Trung tâm duyệt → Đã duyệt → Đang tuyển → Đủ chỉ tiêu hoặc Đóng.
    - **CV:** Chờ phân tích → Chờ sinh viên xác nhận → Đã xác nhận.
- Hàm `transitionTo` là đường duy nhất để đổi trạng thái. Trong cùng một giao dịch, hàm này:
    1. khóa dòng;
    2. kiểm số phiên bản của dòng để hai người không ghi đè nhau (lệch thì trả 409);
    3. kiểm bước chuyển có hợp lệ không (sai thì trả 422);
    4. ghi nhật ký.
- Nhật ký thao tác chỉ ghi thêm: trigger trong PostgreSQL chặn mọi lệnh UPDATE, DELETE và TRUNCATE, kể cả khi sửa thẳng vào DB.
- Cột trạng thái có ràng buộc CHECK lấy từ chính bảng chuyển trạng thái, nên DB cũng từ chối giá trị lạ.

### US-1.3: Đăng nhập, phân quyền, giao diện (0.2.0)

- Đăng nhập bằng email và mật khẩu, access token 15 phút, refresh token xoay vòng (chi tiết ở [mục 6](#6-cơ-chế-phân-quyền)).
- Phân quyền theo 4 vai trò, mặc định từ chối, chống truy cập bản ghi của người khác.
- Quản trị viên tạo được tài khoản Trung tâm, Quản trị, Sinh viên.
- Có dữ liệu mẫu cho môi trường dev: một tài khoản mỗi vai trò, hai công ty, hai sinh viên.
- Mọi lỗi API trả cùng một dạng `{ code, message, details }`.
- Tài liệu API (Swagger) tự sinh từ code; web dùng kiểu dữ liệu sinh ra từ tài liệu này.
- `DESIGN.md` quy định giao diện:
    - bảng màu đã kiểm độ tương phản, chữ, khoảng cách;
    - quy tắc cho màn hình điện thoại 360 px;
    - bốn trạng thái bắt buộc của mọi màn: rỗng, đang tải, lỗi, có dữ liệu.
- Web có trang đăng nhập và khung 3 cổng; cổng sinh viên có thanh điều hướng dưới cho điện thoại. Chưa có màn nghiệp vụ.

### Kiểm thử

- Có khoảng 100 test tự động:
    - **Unit test:** bảng chuyển trạng thái, băm mật khẩu, cấu hình, xử lý lỗi.
    - **Integration test**, chạy với PostgreSQL và Redis thật (testcontainers): lược đồ DB, `transitionTo`, nhật ký không sửa được, đăng nhập, phân quyền mọi route, chống truy cập chéo giữa hai công ty.
- CI chạy toàn bộ test trên mỗi pull request.

### Trạng thái hiện tại

- US-1.1 và US-1.2 đã merge vào nhánh chính (PR #3, #4).
- US-1.3 đã push lên nhánh `us-1.3`, chưa merge.
- Cả ba story đang ở bước review. US-1.3 còn 4 tiêu chí phía giao diện chờ kiểm tay:
    - tự refresh khi token hết hạn;
    - chuyển đúng cổng theo vai trò;
    - form đăng nhập;
    - hiển thị ở 360 px.

### Kịch bản demo (khoảng 5 phút)

Chạy ở chế độ dev để có Swagger. Swagger bị tắt khi chạy bằng Docker Compose (chế độ production).

```bash
docker compose -f deploy/docker-compose.yml up -d --wait postgres redis
export DATABASE_URL=postgres://srm:change-me-postgres@localhost:5432/srm
export REDIS_URL=redis://localhost:6379
export JWT_ACCESS_SECRET=dev-only-jwt-access-secret-0123456789
pnpm --filter @srm/api db:migrate && pnpm --filter @srm/api db:seed
pnpm --filter @srm/api dev     # API ở :3000, Swagger ở /api/docs
pnpm --filter @srm/web dev     # web ở http://localhost:5173
```

1. Đăng nhập lần lượt `sv001@srm.local`, `hr.alpha@srm.local`, `center@srm.local`, `admin@srm.local` (mật khẩu `Srm-Dev-12345`). Mỗi vai trò vào đúng cổng của mình.
2. Đang đăng nhập bằng tài khoản sinh viên, gõ đường dẫn `/hr`: bị chuyển về `/sv`.
3. Mở Swagger ở `http://localhost:3000/api/docs`. Gọi `GET /api/admin/users` bằng token sinh viên thì nhận `403`, bằng token quản trị thì nhận danh sách.
4. Chạy `pnpm test`: cả bộ test chạy với DB thật, trong đó có test chống truy cập chéo.

---

## 6. Cơ chế phân quyền

API có ba lớp kiểm tra, cộng thêm ràng buộc ở DB. Phía web chỉ điều hướng cho tiện; mọi kiểm tra thật đều nằm ở API.

```mermaid
flowchart TD
    R[Request tới API] --> P{Route đánh dấu Public?}
    P -- Có --> C[Vào controller]
    P -- Không --> T{Access token hợp lệ?}
    T -- Không --> E1[401]
    T -- Có --> D{Route có khai báo vai trò?}
    D -- Không --> E2[403: mặc định từ chối]
    D -- Có --> V{Vai trò người gọi được phép?}
    V -- Không --> E3[403]
    V -- Có --> S{Bản ghi thuộc phạm vi người gọi?}
    S -- Không --> E4[404: như không tồn tại]
    S -- Có --> OK[Trả dữ liệu]
```

### Lớp 1: Xác thực

- Mật khẩu băm bằng `scrypt`. Email sai và mật khẩu sai trả cùng một lỗi `401`. Khi email không tồn tại, hệ thống vẫn chạy một lần băm để thời gian phản hồi không làm lộ email nào đã có tài khoản.
- **Access token:** JWT, hiệu lực 15 phút. Token chứa mã người dùng, vai trò, và thêm mã công ty (với HR) hoặc mã sinh viên (với sinh viên). Nhờ vậy API biết phạm vi của người gọi mà không cần truy vấn DB.
- **Refresh token:** chuỗi ngẫu nhiên 32 byte, lưu trong cookie `HttpOnly` và `SameSite=Strict`, chỉ được gửi tới `/api/auth`.
    - Redis chỉ lưu giá trị băm SHA-256 của token.
    - Mỗi lần refresh, token cũ bị xóa và token mới được phát, nên một token không dùng lại được.
    - Đăng xuất thì token bị thu hồi.
- Web chỉ giữ access token trong bộ nhớ, không lưu vào localStorage. Khi gặp `401`, web tự refresh một lần rồi gửi lại request.

### Lớp 2: Phân quyền theo vai trò

Toàn API có một guard duy nhất, kiểm theo thứ tự ở sơ đồ trên. Route quên khai báo quyền sẽ bị khóa chứ không bị mở. Một test tự động duyệt mọi route của ứng dụng và báo lỗi nếu có route thiếu khai báo.

| Route | Quyền |
|---|---|
| `GET /api/health` | Công khai |
| `POST /api/auth/login`, `/refresh`, `/logout` | Công khai |
| `GET /api/me` | Cả 4 vai trò |
| `POST`, `GET /api/admin/users` | Chỉ Quản trị |

### Lớp 3: Phân quyền theo bản ghi

| Vai trò | Thấy được |
|---|---|
| Cán bộ Trung tâm, Quản trị | Tất cả |
| HR | Bản ghi thuộc công ty của mình |
| Sinh viên | Bản ghi của chính mình |

- Bản ghi ngoài phạm vi trả `404`, giống hệt bản ghi không tồn tại, để người dò không biết ID nào có thật.
- Truy vấn danh sách tự thêm điều kiện lọc theo phạm vi. Bảng không có cột phạm vi tương ứng thì HR và sinh viên không thấy gì.

### Ràng buộc ở DB

Bảng người dùng có ràng buộc CHECK:

- vai trò phải thuộc 4 giá trị cho phép;
- tài khoản HR bắt buộc gắn với công ty;
- tài khoản sinh viên bắt buộc gắn với hồ sơ sinh viên.

Vì vậy token của HR luôn mang mã công ty, token của sinh viên luôn mang mã sinh viên.

### Giới hạn hiện tại

- **Lớp 3 mới có hàm dùng chung và test.** Chưa có endpoint nghiệp vụ nào dùng tới. Nơi dùng đầu tiên là JD (US-1.5) và CV (US-1.6).
- **Khóa tài khoản có hiệu lực chậm tối đa 15 phút.** Access token đã cấp vẫn dùng được tới khi hết hạn; lần refresh tiếp theo mới bị chặn.
- **Refresh token bị đánh cắp thì phiên bị chiếm.** Token dùng lại chỉ bị từ chối, chưa thu hồi cả phiên. Kẻ lấy được token và refresh trước người dùng sẽ giữ phiên tới khi token hết hạn. Việc này đã ghi nhận để xử lý trước khi mở demo ra ngoài.
- **Tài khoản HR chưa tạo được.** HR sẽ vào hệ thống qua lời mời (US-1.5).
- **Trung tâm và Quản trị có cùng phạm vi "thấy tất cả" ở lớp 3.** Hai vai trò được tách hoàn toàn nhờ khai báo vai trò trên từng route. Nếu một route nghiệp vụ lỡ cho phép Quản trị, Quản trị sẽ đọc được toàn bộ dữ liệu của route đó. Mỗi story có test `403` cho từng vai trò để chặn lỗi này.

---

## 7. Thiết kế chấm phù hợp CV–JD

Phần này đã có thiết kế chi tiết nhưng chưa cài đặt. Lịch dự kiến:

- US-3.1 (lọc điều kiện cứng và công thức S_cv): tuần 5 (02–08/11).
- US-3.2 (Matching Agent chạy hàng loạt): tuần 7 (16–22/11).

### Pipeline 6 bước

| # | Bước | Thực hiện | Mô tả |
|---|---|---|---|
| 0 | Chọn đầu vào | Code | Chỉ ghép CV đã được sinh viên xác nhận với JD đã được HR xác nhận và Trung tâm duyệt |
| 1 | Lọc điều kiện cứng | Code | Ngành, năm học, GPA tối thiểu, ngoại ngữ bắt buộc. Cặp không đạt được ghi lý do và không bao giờ gửi cho LLM |
| 2 | Lọc sơ bộ top-M | Embedding bge-m3, pgvector | Mỗi CV chỉ giữ M JD gần nhất (đề xuất M = 10) để giảm số lượt gọi LLM |
| 3 | Đánh giá từng tiêu chí | LLM: Matching Agent | Chỉ nhận hồ sơ đã che thông tin cá nhân. Trả verdict cho từng kỹ năng, mức liên quan của dự án (0–4), mức khớp ngành, verdict ngoại ngữ, kèm trích dẫn bằng chứng |
| 4 | Kiểm tra trích dẫn | Code: RapidFuzz | Verdict "đáp ứng" hoặc "một phần" mà trích dẫn khớp với văn bản CV dưới 85 điểm thì bị hạ về "không đáp ứng" |
| 5 | Tính S_cv | Code | Tính trên số nguyên. Đổi trọng số thì tính lại từ verdict đã lưu, không gọi lại LLM |
| 6 | Lập shortlist | Code | JD đủ điều kiện và có S_cv ≥ θ_cv, sắp giảm dần |

Luồng dữ liệu:

1. Backend gửi job lên RabbitMQ; message chỉ chứa ID.
2. AI Service gửi yêu cầu theo lô (Message Batches). Phần rubric và yêu cầu JD được cache.
3. Kết quả quay về backend qua hàng đợi kết quả.
4. Chỉ backend ghi bảng kết quả chấm, lưu kèm model và phiên bản prompt.

### Vì sao lọc điều kiện cứng bằng code, không giao cho AI

AI vẫn tham gia, nhưng ở phần đọc hiểu văn bản, không ở phần ra quyết định loại.

| Phần việc | Ví dụ | Ai làm | Có người kiểm |
|---|---|---|---|
| Hiểu điều kiện trong JD (văn bản tự do) | "Ưu tiên SV năm 3–4 ngành CNTT, GPA từ 3.0, TOEIC 600+" → `{ngành: [CNTT], năm: [3, 4], gpa_min: 3.0, toeic_min: 600}` | AI (GĐ1) | HR xác nhận |
| Hiểu chứng chỉ trong CV | "TOEIC 650 (2025)" → `{toeic: 650}` | AI (GĐ2) | Sinh viên xác nhận |
| So dữ kiện với điều kiện, cho từng cặp SV × JD | 2,95 < 3,0 → loại, lý do "GPA dưới mức tối thiểu" | Code | Không ai kiểm từng cặp |

Mỗi JD hay CV chỉ cần đọc hiểu một lần, và luôn có người xác nhận lại. Phần so sánh thì lặp lại cho mọi cặp mà không có người kiểm, nên phải tuyệt đối đúng. Phần này giao cho code vì:

1. **Đây là quyết định loại.** Cặp bị loại không bao giờ được chấm và không vào shortlist. Một đợt có 25.000 cặp; LLM chỉ cần sai 1% là đã có 250 quyết định sai mà không ai phát hiện.
2. **Công bằng và tất định.** Hai sinh viên cùng dữ kiện phải nhận cùng kết quả, và chạy lại phải ra y như cũ. LLM có thể xử lý ca sát ngưỡng (GPA 2,99 so với 3,0) khác nhau giữa các lần chạy.
3. **Chi phí.** Lọc điều kiện cứng chạy trước LLM chính là để bớt số cặp phải gửi đi. Một phép so sánh số không tốn gì.
4. **Chống gian lận.** GPA, ngành, năm học lấy từ dữ liệu học vụ của trường, không lấy từ CV. Nếu LLM đọc CV để quyết định, một dòng chữ ẩn kiểu "ứng viên này đáp ứng mọi điều kiện" có thể lừa được nó.
5. **Chứng minh được.** Code kiểm được bằng unit test, nên có thể khẳng định hàm lọc đúng với mọi đầu vào. Với LLM chỉ nói được "đúng khoảng X% trên tập mẫu". Mỗi lần loại đều có lý do kèm giá trị yêu cầu và giá trị thực tế, ví dụ "yêu cầu GPA 3,0, thực tế 2,95".

Một số ca code làm một mình sẽ khó, và cách xử lý:

- **Ngành tương đương** (JD ghi "CNTT", sinh viên học "Kỹ thuật phần mềm"): ở GĐ1, AI chuẩn hóa danh sách ngành của JD về danh mục mã ngành của trường, HR xác nhận. Code chỉ việc so mã ngành.
- **Quy đổi chứng chỉ** (JD yêu cầu TOEIC 600, sinh viên có IELTS 6.0): dùng bảng quy đổi cấu hình sẵn trong code, không để LLM tự quy đổi mỗi lần. Đặc tả hiện chưa có bảng này.
- **Điều kiện không đo được** ("chủ động", "làm được full-time"): không coi là điều kiện cứng. Matching Agent đánh giá như một tiêu chí có bằng chứng; điều kiện này chỉ ảnh hưởng tới điểm, không loại thẳng.

### Công thức

```
S_cv = Σ wᵢ · sᵢ
```

| Tiêu chí | Trọng số wᵢ | Cách tính sᵢ (0–100) |
|---|---|---|
| Kỹ năng bắt buộc | 40% | Trung bình có trọng số: đáp ứng = 1; một phần = 0,5; không có bằng chứng = 0 |
| Kỹ năng bổ trợ | 15% | Như trên |
| Dự án, kinh nghiệm | 20% | Rubric 0–4 × 25 |
| Học vấn | 15% | Ngành đúng/gần/khác (100/60/20) × 0,6 + GPA quy về thang 100 × 0,4 |
| Ngoại ngữ, chứng chỉ | 10% | Đáp ứng / một phần / không: 100 / 50 / 0 |

"Một phần" nghĩa là sinh viên có nêu kỹ năng nhưng không có dự án minh chứng, hoặc mức độ thấp hơn yêu cầu.

### Ví dụ

Ví dụ này lấy từ đặc tả và sẽ là một test cố định.

| Tiêu chí | LLM đánh giá | sᵢ | wᵢ · sᵢ |
|---|---|---|---|
| Kỹ năng bắt buộc | Java: đáp ứng; SQL: một phần; Docker: không | 50 | 20,0 |
| Kỹ năng bổ trợ | Redis: không | 0 | 0,0 |
| Dự án | Mức 3/4 | 75 | 15,0 |
| Học vấn | Đúng ngành, GPA 3,2/4 | 92 | 13,8 |
| Ngoại ngữ | TOEIC 650: đáp ứng | 100 | 10,0 |
| **S_cv** | | | **58,8** |

Mỗi cặp lưu đủ dữ liệu để giải thích cho sinh viên:

- verdict và trích dẫn của từng kỹ năng, kèm kết quả kiểm tra trích dẫn;
- bảng thành phần của S_cv;
- điểm mạnh, kỹ năng còn thiếu, gợi ý cải thiện.

---

## 8. Kế hoạch

Lộ trình 13 tuần, xong ngày 31/12/2026, đủ 37 story, không cắt phạm vi. Công việc chạy song song hai làn: backend/web và AI/thuật toán.

| Giai đoạn | Thời gian | Nội dung chính | Mốc kiểm chứng | Phiên bản |
|---|---|---|---|---|
| 1. Nền tảng, hạ tầng AI, lõi phân bổ **(đang ở đây)** | T1–T4 (05/10–01/11) | Đợt, doanh nghiệp, JD, CV, thông báo; hàng đợi AI; thuật toán phân bổ; mô phỏng | **M1:** tạo đợt, HR đăng JD được duyệt, sinh viên nộp CV; thuật toán phân bổ qua property-based test; mô phỏng có số liệu đầu tiên | 0.1.x |
| 2. AI trích xuất CV/JD | T5–T6 (02/11–15/11) | JD Analyzer, CV Parser, embedding, lọc điều kiện cứng, S_cv, chi phí LLM | **M2:** sinh viên và HR sửa, xác nhận dữ liệu AI trích xuất; xem được chi phí LLM | 0.2.x |
| 3. Matching, nguyện vọng, sinh đề | T7–T8 (16/11–29/11) | Matching Agent, shortlist, mức cạnh tranh, Test Generator, Validator | **M3:** sinh viên thấy shortlist có giải thích và chọn nguyện vọng; ngân hàng câu hỏi đã kiểm định | 0.3.x |
| 4. Thi, chấm, đánh giá AI | T9–T10 (30/11–13/12) | Phòng thi, Grader, chấm tay, tín hiệu gian lận, bộ đánh giá AI | **M4:** mỗi nguyện vọng có S_test, S_final; có số liệu đánh giá các agent | 0.4.x |
| 5. Phân bổ, HR, phỏng vấn, báo cáo | T11–T12 (14/12–27/12) | Vòng phân bổ, HR duyệt, phỏng vấn, lời mời, vòng bổ sung, phúc khảo, dashboard | **M5:** chạy trọn luồng từ tạo đợt đến lúc sinh viên nhận thực tập | 0.5.x |
| 6. Demo, kiểm thử, phát hành | T13 (28/12–31/12) | Test đầu–cuối, kiểm thử tải, dữ liệu demo | **M6:** bản bảo vệ | 1.0.0 |

**Tuần tới (T2, 12–18/10), dự kiến:**

- Allocation Engine (US-5.1): thuật toán Deferred Acceptance viết thành hàm thuần. Property-based test kiểm ba tính chất: ổn định, không vượt sức chứa, tất định. Ví dụ minh họa trong đặc tả là một test cố định.
- Vì làn backend đã sớm một tuần, kéo sớm tạo và cấu hình đợt (US-1.4), doanh nghiệp, tài khoản HR và JD (US-1.5).

**Rủi ro**

| Rủi ro | Ảnh hưởng | Cách xử lý |
|---|---|---|
| Thiếu dữ liệu CV/JD thật và người đánh giá | Chương thực nghiệm thiếu số liệu | Bắt đầu thu dữ liệu ngay; thiếu thì dùng dữ liệu tổng hợp |
| Chi phí gọi Claude API | Vượt ngân sách | Message Batches, prompt caching; mọi test dùng dữ liệu giả, chỉ bộ đánh giá gọi API thật |
| Một người làm, 212 điểm trong 13 tuần | Trễ ở giai đoạn 4–5 | Tuần 6 là tuần đệm; dùng agent AI hỗ trợ code, chạy hai làn song song |

---

## 9. Xin ý kiến thầy

### 9.1. Quy tắc nghiệp vụ chưa chốt

Hệ thống đang tạm dùng cột "Đề xuất" và để thành tham số cấu hình, đổi được khi thầy chốt.

| # | Câu hỏi | Đề xuất hiện tại |
|---|---|---|
| Q1 | Sinh viên tự chọn nguyện vọng hay hệ thống phân bổ hoàn toàn theo điểm? | Sinh viên chọn tối đa 3 nguyện vọng từ shortlist |
| Q2 | Một bài test cho mỗi nguyện vọng hay một bài chung theo nhóm vị trí? | Theo JD; các JD cùng nhóm vị trí được dùng chung |
| **Q3** | **Hệ số đề cử k (số hồ sơ gửi HR so với chỉ tiêu)?** | **1,5: HR có dư lựa chọn mà không quá tải** |
| Q4 | Sinh viên từ chối lời mời thực tập thì xử lý thế nào? | Xếp ưu tiên thấp nhất ở vòng sau |
| Q5 | HR có được chọn sinh viên ngoài danh sách đề cử? | Không; chỉ được "yêu cầu bổ sung hồ sơ" qua hệ thống |
| Q6 | Sinh viên không chọn nguyện vọng đến hạn? | Tự gán các JD có S_cv cao nhất trong shortlist và thông báo |
| Q7 | Có chấm bài lập trình tự động không? | Để phần mở rộng; bản chính dùng trắc nghiệm và tự luận |
| **Q8** | **Dùng LLM thương mại qua API hay mô hình mở tự triển khai?** | **Claude API, qua một lớp trừu tượng để đổi được. Cần thầy ý kiến về việc gửi dữ liệu CV (đã che thông tin cá nhân) ra dịch vụ bên ngoài** |

### 9.2. Điểm chưa rõ trong thiết kế chấm phù hợp

1. **Có cho đổi trọng số sau khi chấm không?** Thiết kế hứa đổi trọng số không phải gọi lại LLM. Nhưng cấu hình đợt bị khóa ngay khi mở đợt, tức là trước khi có kết quả chấm. Hiện thiết kế chỉ có hàm tính lại S_cv, chưa có luồng nào để Trung tâm đổi trọng số. Em xin ý kiến thầy có nên cho đổi trọng số sau khi chấm hay không, và nếu có thì đến mốc nào.
2. **Trích dẫn so với văn bản nào?** Đặc tả ghi "văn bản CV", nhưng Matching chỉ được đọc bản đã che thông tin cá nhân. Em đề xuất so với văn bản CV đã che thông tin cá nhân và đã loại chữ ẩn.
3. **Tách trích dẫn và lời giải thích.** Ví dụ "một phần" trong đặc tả dùng câu giải thích thay cho trích dẫn ("Chỉ liệt kê MySQL…"), nên sẽ không bao giờ qua được bước kiểm tra. Em đề xuất tách thành hai trường: `evidence` là trích nguyên văn và có kiểm tra; `reason` là lời giải thích và không kiểm tra.

### 9.3. Hỗ trợ cho chương thực nghiệm

| Cần gì | Dùng để | Cần trước |
|---|---|---|
| Khoảng 50 CV (ẩn danh, có sự đồng ý) và 20 JD thật | Đo P/R/F1 của bước phân tích CV/JD | Gán nhãn trong T1–T5, tức trước 08/11 |
| 2–3 người đánh giá (giảng viên hoặc HR) xếp hạng độc lập các cặp CV–JD | Đo Spearman, NDCG@k của bước chấm phù hợp | Xếp hạng trong T5–T8, tức trước 29/11 |
| Bài làm thử và điểm của người chấm | Đo MAE, kappa của bước chấm tự luận | T8–T10, tức trước 13/12 |

Nếu không đủ dữ liệu thật, em sẽ dùng dữ liệu tổng hợp, có phân bố nguyện vọng lệch về vài công ty "hot". Em xin ý kiến thầy về việc dùng dữ liệu tổng hợp có được chấp nhận trong báo cáo hay không.

### 9.4. Các điểm khác

1. **Vai trò giảng viên.** Đặc tả ghi "Cán bộ Trung tâm hoặc giảng viên" chấm tay câu tự luận và xử lý phúc khảo, còn giảng viên duyệt mẫu ngân hàng câu hỏi. Nhưng hệ thống chỉ có 4 vai trò, nên hiện giảng viên phải dùng tài khoản Trung tâm. Khi đó giảng viên có cả quyền chạy phân bổ, duyệt JD. Em xin ý kiến thầy: nên thêm vai trò Giảng viên riêng, hay chấp nhận cách này cho bản đồ án?
2. **Bảng quy đổi chứng chỉ ngoại ngữ** cho điều kiện cứng (TOEIC, IELTS, VSTEP…). Em nên theo chuẩn đầu ra ngoại ngữ của trường, hay một bảng quy đổi chung?
3. **Bổ sung chỉ số recall@M** vào chương thực nghiệm, để đo bước lọc sơ bộ bằng embedding có loại nhầm JD phù hợp hay không (xem [Mô hình embedding bge-m3](#mô-hình-embedding-bge-m3)).

---

## Phụ lục A. Tài liệu

| File | Nội dung | Nên đọc |
|---|---|---|
| [docs/BRIEF.md](../docs/BRIEF.md) | Tóm tắt sản phẩm, 2 trang | Cả file |
| [docs/PRD.md](../docs/PRD.md) | Đặc tả nghiệp vụ | *Success Criteria*, *Luồng nghiệp vụ tổng thể*, *Cơ chế chấm điểm*, *Thuật toán phân bổ*, *Vòng đời trạng thái*, *Các điểm cần chốt* |
| [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) | Kiến trúc | *Sơ đồ tổng thể*, *AI Service và các AI Agent*, *Những chỗ cố ý KHÔNG dùng LLM*, *Architecture decisions* |
| [docs/CONTEXT.md](../docs/CONTEXT.md) | Nhật ký 26 quyết định thiết kế, mỗi quyết định có lý do và phương án đã loại | Khi cần biết vì sao chọn một cách làm |
| [docs/sprints/README.md](../docs/sprints/README.md) | Lộ trình, lịch theo tuần | Mục *Lộ trình* |
| [docs/CHANGELOG.md](../docs/CHANGELOG.md) | Những gì đã làm theo từng phiên bản | Cả file |
| [DESIGN.md](../DESIGN.md) | Quy chuẩn giao diện | Khi xem phần web |

## Phụ lục B. Mã nguồn chính

| File | Minh họa cho |
|---|---|
| [packages/shared/states/campaign.ts](../packages/shared/states/campaign.ts), [machine.ts](../packages/shared/states/machine.ts) | Vòng đời trạng thái viết dưới dạng dữ liệu, dùng chung cho web và API |
| [apps/api/src/common/state/state-transition.service.ts](../apps/api/src/common/state/state-transition.service.ts) | `transitionTo`: khóa dòng, kiểm phiên bản, ghi nhật ký trong một giao dịch |
| [apps/api/drizzle/0001_audit_append_only.sql](../apps/api/drizzle/0001_audit_append_only.sql) | Trigger chặn sửa, xóa nhật ký thao tác |
| [apps/api/src/db/schema/](../apps/api/src/db/schema/) | Lược đồ CSDL |
| [apps/api/src/common/auth/access.guard.ts](../apps/api/src/common/auth/access.guard.ts) | Guard phân quyền mặc định từ chối |
| [apps/api/src/common/auth/record-access.ts](../apps/api/src/common/auth/record-access.ts) | Kiểm phạm vi bản ghi, trả 404 khi ngoài phạm vi |
| [apps/api/src/modules/iam/](../apps/api/src/modules/iam/) | Đăng nhập, refresh token, quản trị tài khoản |
| [apps/api/src/modules/iam/infrastructure/refresh-token.store.ts](../apps/api/src/modules/iam/infrastructure/refresh-token.store.ts) | Lưu refresh token trong Redis, xoay vòng bằng `GETDEL` |
| [apps/web/src/app/navigation.ts](../apps/web/src/app/navigation.ts) | Menu của từng vai trò; Trung tâm và Quản trị dùng chung cổng `/admin` nhưng menu khác nhau |
| [apps/api/test/integration/route-guards.int-spec.ts](../apps/api/test/integration/route-guards.int-spec.ts) | Test duyệt mọi route, đảm bảo không route nào thiếu khai báo quyền |
| [apps/api/test/integration/record-access.int-spec.ts](../apps/api/test/integration/record-access.int-spec.ts) | Test chống truy cập chéo giữa hai công ty |
| [deploy/docker-compose.yml](../deploy/docker-compose.yml) | Dựng cả hệ thống bằng một lệnh |
| [.github/workflows/ci.yml](../.github/workflows/ci.yml) | Các bước CI |
