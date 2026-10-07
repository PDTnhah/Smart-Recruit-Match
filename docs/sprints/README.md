# Sprints

Kế hoạch làm việc theo koni-docs: epic → story → sprint. Template và quy tắc chi tiết ở skill koni-docs (`.agents/skills/koni-docs/references/`).

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `epics/EPIC-N.md` | Một epic; danh sách epic gốc ở [PRD › Epics & User Stories](../PRD.md#epics--user-stories) |
| `stories/US-N.M-<slug>.md` | Một story — nguồn sự thật cho task và tiêu chí nghiệm thu |
| `sprint-YYYY-WNN.md` | Sprint đang chạy (theo tuần ISO) |
| `archive/` | Sprint đã đóng |
| `STATUS.md` | Bảng kanban do `koni-docs status` sinh, không sửa tay |

## Vòng đời story

```
backlog → ready → in-progress → review → done
                      ↓
                   blocked  (ghi lý do trong Implementation notes)
```

- Tối đa 3 story `in-progress` cùng lúc.
- `done` cần: `version_shipped` (semver không có "v"), mục CHANGELOG, mọi tiêu chí nghiệm thu đã `[x]`.
- Mã story phải khớp giữa tên file, frontmatter `id:` và PRD (RULE-6).
- Trường ID trong frontmatter chỉ chứa mã, không chứa chữ giải thích (RULE-17): `prd_ref: [FR-1, FR-2]`, `arch_ref: [AD-3]`, `depends_on: [US-1.1]`.
- `assignee:` là GitHub login, không phải tên trong git (RULE-15).
- Story trên 8 điểm thì tách nhỏ.

## Lộ trình

Theo [CONTEXT D20](../CONTEXT.md): 1 người code, có agent chạy song song; xong trong tháng 12/2026; đủ 37 story phủ FR-1 – FR-37, không cắt. Tổng khoảng 212 điểm, tức khoảng 18 điểm/tuần. Sprint dài 1 tuần (`sprint-YYYY-WNN`).

### Giai đoạn và mốc

| Giai đoạn | Tuần (ngày) | Story | Điểm | Mốc kiểm chứng | Version |
|---|---|---|---|---|---|
| 1. Nền tảng + hạ tầng AI + lõi phân bổ | T1–T4 (05/10–01/11) | US-1.1…US-1.7, US-2.1, US-2.2, US-5.1, US-6.4 | 64 | **M1**: `docker compose up`; tạo đợt, HR đăng JD được duyệt, SV nộp CV; thông báo/SSE; job AI đi qua RabbitMQ; engine phân bổ qua property test; mô phỏng có số liệu đầu tiên | 0.1.x |
| 2. AI trích xuất CV/JD | T5–T6 (02/11–15/11) | US-2.3…US-2.6, US-3.1, US-6.2 | 32 | **M2**: SV và HR sửa, xác nhận dữ liệu AI trích xuất; xem được chi phí LLM | 0.2.x |
| 3. Matching, NV, sinh đề | T7–T8 (16/11–29/11) | US-3.2…US-3.4, US-4.1, US-4.2 | 32 | **M3**: SV thấy shortlist có giải thích, chọn NV; ngân hàng câu hỏi đã kiểm định và khóa | 0.3.x |
| 4. Thi, chấm, đánh giá AI | T9–T10 (30/11–13/12) | US-4.3…US-4.5, US-4.7…US-4.9, US-6.3 | 37 | **M4**: mỗi NV có S_test, S_final; có số liệu đánh giá các agent | 0.4.x |
| 5. Phân bổ, HR, phỏng vấn, báo cáo | T11–T12 (14/12–27/12) | US-5.2…US-5.5, US-4.6, US-6.1, US-6.5 | 42 | **M5**: chạy trọn luồng từ tạo đợt đến lúc SV nhận thực tập, có vòng bổ sung, phúc khảo, dashboard, xuất báo cáo | 0.5.x |
| 6. Demo, E2E, kiểm thử tải, phát hành | T13 (28/12–31/12) | US-6.6 | 5 | **M6**: E2E và k6 đạt; seed đợt demo; bản bảo vệ | 1.0.0 |

### Lịch theo tuần

Làn A gồm backend và web (TypeScript). Làn B gồm AI Service (Python), hàm thuần, mô phỏng và đánh giá.

| Tuần | Làn A | Làn B | Điểm |
|---|---|---|---|
| T1 · W41 · 05–11/10 | Chuẩn bị; US-1.1 | – | 5 |
| T2 · W42 · 12–18/10 | US-1.2, US-1.3 | US-5.1 | 18 |
| T3 · W43 · 19–25/10 | US-1.4, US-1.5 | US-2.1 | 21 |
| T4 · W44 · 26/10–01/11 | US-1.6, US-1.7 | US-2.2, US-6.4 | 20 |
| T5 · W45 · 02–08/11 | US-2.3, US-3.1 | US-2.4 | 19 |
| T6 · W46 · 09–15/11 | US-2.6, US-6.2 | US-2.5 | 13 (tuần đệm) |
| T7 · W47 · 16–22/11 | US-3.2 (phần backend) | US-3.2 (agent), US-4.1 | 16 |
| T8 · W48 · 23–29/11 | US-3.3, US-3.4 | US-4.2 | 16 |
| T9 · W49 · 30/11–06/12 | US-4.3, US-4.9 | US-4.8, US-6.3 (bắt đầu) | 23 |
| T10 · W50 · 07–13/12 | US-4.4, US-4.5 | US-4.7, US-6.3 (xong) | 14 |
| T11 · W51 · 14–20/12 | US-5.2, US-5.3 | US-4.6 | 21 |
| T12 · W52 · 21–27/12 | US-5.4, US-5.5 | US-6.1, US-6.5 | 21 |
| T13 · W53 · 28–31/12 | US-6.6; đóng băng code; phát hành 1.0.0 | – | 5 |

Bảng điểm, tuần và phụ thuộc của từng story nằm ở mục *Schedule and dependencies* trong mỗi file `epics/EPIC-N.md`.

### Chạy song song

Theo koni-harness `parallel-orchestration.md` (Tier A):

- Mỗi story một git worktree, nhánh `loop/<id>`, do một agent làm. Kết quả gộp vào nhánh tích hợp, chạy lại cổng ở đó; người duyệt merge vào `main`.
- Hai story chạy song song không được sửa chung file.
- **Migration Drizzle:** mỗi đợt chỉ một story được sinh migration; story còn lại rebase lên nhánh tích hợp rồi mới sinh, để số thứ tự migration không đụng nhau.
- **`packages/shared`** (schema, states, contracts) là chỗ dễ xung đột nhất. Story nào thêm vào đây thì merge trước, story phụ thuộc rebase sau.

### Việc không phải code (Track B)

| Tuần | Việc |
|---|---|
| T1–T2 | Mời 2–3 người đánh giá (giảng viên, HR); đọc điều khoản dữ liệu của nhà cung cấp LLM để viết màn đồng ý (US-1.6) |
| T1–T5 | Thu khoảng 50 CV (ẩn danh, có đồng ý) và 20 JD; gán nhãn trường trích xuất; thiếu dữ liệu thật thì dùng dữ liệu tổng hợp. Phải xong trước T9 cho US-6.3 |
| T5–T8 | Người đánh giá xếp hạng các cặp CV–JD mẫu |
| T8–T10 | Thu bài làm thử và điểm của người chấm cho phần tự luận; đánh giá chất lượng câu hỏi sinh ra |
| Cuối mỗi giai đoạn | Viết dần chương báo cáo tương ứng |

### Kiểm soát tiến độ

- Kiểm tra ở cuối T4 (M1), cuối T8 (M3), cuối T10 (M4): so số điểm đã xong với lịch.
- Trễ dưới 1 tuần: dùng T6 và T13 làm đệm, mở thêm worktree cho story độc lập ở làn đang rảnh.
- Trễ từ 1 tuần trở lên: báo người dùng để chọn giữa giãn sang tháng 1 hoặc đổi thứ tự. Không tự cắt story.
- Ngoài phạm vi (spec ghi là tùy chọn hoặc mở rộng): phần C lập trình chấm trong sandbox, chatbot tư vấn SV, học trọng số từ phản hồi HR, SSO OIDC, ClamAV, Prometheus/Grafana.

## Trạng thái hiện tại

Đã tách 37 story cho 6 epic (`epics/EPIC-1.md` … `EPIC-6.md`). Cả 37 file story đã có trong `stories/`, tất cả ở `backlog` ([CONTEXT D21](../CONTEXT.md)). Khi bắt đầu một story, đọc lại file của nó và thêm khối *Story refresh* nếu spec đã đổi. Chưa mở sprint. Bước tiếp theo: mở `sprint-2026-W41` rồi bắt đầu US-1.1.
