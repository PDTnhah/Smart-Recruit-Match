---
id: sprint-2026-W47
status: in-progress
start: 2026-11-16T00:00:00.000Z
end: 2026-11-22T00:00:00.000Z
goal: 'Sửa lỗi tìm kỹ năng khi ô tìm còn trống (US-2.8, v0.25.1); đóng W45, W46 và gom các story còn `review` về một sprint'
---
## Sprint scope

| US      | Title                                              | Epic   | Pri | Points | Status     | Carry    | Story file                                                                                                   |
| ------- | -------------------------------------------------- | ------ | --- | ------ | ---------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| US-2.8  | Tìm kỹ năng trong danh mục khi ô tìm còn trống     | EPIC-2 | P1  | 1      | 👀 review  | new      | [stories/US-2.8-skill-search-empty-query.md](stories/US-2.8-skill-search-empty-query.md)                     |
| US-1.8  | Màn Hồ sơ mở đúng đợt khi sinh viên thấy nhiều đợt | EPIC-1 | P1  | 3      | 👀 review  | from W46 | [stories/US-1.8-profile-default-campaign.md](stories/US-1.8-profile-default-campaign.md)                     |
| US-1.10 | Sửa, hủy và xóa đợt sau khi mở                     | EPIC-1 | P1  | 8      | 👀 review  | from W46 | [stories/US-1.10-campaign-edit-cancel-delete.md](stories/US-1.10-campaign-edit-cancel-delete.md)             |
| US-2.7  | Vùng, họ và quan hệ kéo theo của kỹ năng           | EPIC-2 | P0  | 8      | 👀 review  | from W45 | [stories/US-2.7-skill-zones-families-implications.md](stories/US-2.7-skill-zones-families-implications.md)   |
| US-3.1  | Lọc điều kiện cứng và công thức S_cv               | EPIC-3 | P0  | 5      | 👀 review  | from W44 | [stories/US-3.1-hard-filters-and-scv-formula.md](stories/US-3.1-hard-filters-and-scv-formula.md)             |
| US-3.2  | Matching Agent chạy hàng loạt                      | EPIC-3 | P0  | 13     | 👀 review  | from W45 | [stories/US-3.2-batch-matching-agent.md](stories/US-3.2-batch-matching-agent.md)                             |
| US-3.3  | Shortlist và chọn nguyện vọng                      | EPIC-3 | P0  | 8      | 👀 review  | from W45 | [stories/US-3.3-shortlist-and-preferences.md](stories/US-3.3-shortlist-and-preferences.md)                   |
| US-3.4  | Mức cạnh tranh và gợi ý ít cạnh tranh              | EPIC-3 | P1  | 3      | 👀 review  | from W45 | [stories/US-3.4-competition-level-and-suggestions.md](stories/US-3.4-competition-level-and-suggestions.md)   |
| US-3.5  | Hồ sơ kỹ năng chi tiết và khớp kỹ năng bằng code   | EPIC-3 | P0  | 8      | 👀 review  | from W45 | [stories/US-3.5-skill-evidence-code-matching.md](stories/US-3.5-skill-evidence-code-matching.md)             |
| US-3.6  | Quy đổi ngoại ngữ CEFR và mức khớp ngành bằng code | EPIC-3 | P0  | 5      | 👀 review  | from W45 | [stories/US-3.6-language-cefr-major-match.md](stories/US-3.6-language-cefr-major-match.md)                   |
| US-4.1  | Ma trận đề và Test Generator                       | EPIC-4 | P0  | 8      | 👀 review  | from W45 | [stories/US-4.1-exam-blueprint-test-generator.md](stories/US-4.1-exam-blueprint-test-generator.md)           |
| US-4.2  | Validator và khóa ngân hàng câu hỏi                | EPIC-4 | P0  | 8      | 👀 review  | from W45 | [stories/US-4.2-validator-and-question-bank-lock.md](stories/US-4.2-validator-and-question-bank-lock.md)     |
| US-4.3  | Phòng thi                                          | EPIC-4 | P0  | 8      | 👀 review  | from W45 | [stories/US-4.3-exam-room.md](stories/US-4.3-exam-room.md)                                                   |
| US-4.4  | Chấm bài, S_test và S_final                        | EPIC-4 | P0  | 13     | 👀 review  | from W45 | [stories/US-4.4-grading-stest-sfinal.md](stories/US-4.4-grading-stest-sfinal.md)                             |
| US-4.5  | Chấm tay câu tự luận được chuyển                   | EPIC-4 | P0  | 5      | 👀 review  | from W45 | [stories/US-4.5-manual-essay-grading.md](stories/US-4.5-manual-essay-grading.md)                             |
| US-5.1  | Allocation Engine và property-based test           | EPIC-5 | P0  | 5      | 📋 backlog | from W42 | [stories/US-5.1-allocation-engine-property-tests.md](stories/US-5.1-allocation-engine-property-tests.md)     |
| US-6.4  | Mô phỏng phân bổ so với baseline                   | EPIC-6 | P1  | 5      | 📋 backlog | from W44 | [stories/US-6.4-allocation-simulation-vs-baselines.md](stories/US-6.4-allocation-simulation-vs-baselines.md) |
| US-4.8  | Câu hỏi xác minh CV và chỉ số tin cậy              | EPIC-4 | P1  | 8      | 👀 review  | new  | [stories/US-4.8-cv-verification-questions-trust-score.md](stories/US-4.8-cv-verification-questions-trust-score.md) |
| US-2.9  | Thêm nhà cung cấp LLM OpenAI và DeepSeek           | EPIC-2 | P1  | 5      | 👀 review  | new  | [stories/US-2.9-openai-deepseek-llm-providers.md](stories/US-2.9-openai-deepseek-llm-providers.md) |
| US-4.12 | Sửa giao diện ngân hàng câu hỏi: ô độ phủ và đổi phần D thành C | EPIC-4 | P1 | 3 | 👀 review | new | [stories/US-4.12-question-bank-ui-fixes-part-c.md](stories/US-4.12-question-bank-ui-fixes-part-c.md) |
| US-4.10 | Tách Validator khỏi job sinh câu: AI kiểm câu khi Trung tâm yêu cầu | EPIC-4 | P0 | 8 | 👀 review | new | [stories/US-4.10-on-demand-question-validation.md](stories/US-4.10-on-demand-question-validation.md) |
| US-4.9  | Duyệt mẫu ngân hàng câu hỏi; màn "Duyệt JD" giữ JD đã duyệt | EPIC-4 | P2 | 2 | 👀 review | new | [stories/US-4.9-question-bank-sample-review.md](stories/US-4.9-question-bank-sample-review.md) |

> **Convention**: AC + Tasks live inside each story file. This sprint file lists planned
> stories at a glance only. Design + decision docs cross-linked at the bottom.

## Sprint goal recap

Ngày 2026-11-16, người dùng bắt đầu US-2.8 (1 điểm, sửa lỗi tách ra lúc điều tra US-1.8, [CONTEXT D55](../CONTEXT.md)) và chọn đóng luôn W45, W46. Hai sprint này đã qua ngày kết thúc, và W46 *Risks* đã nêu chỗ này: `active_sprint` chỉ trỏ được một sprint. Các story còn `review` chuyển sang đây. Mỗi story chờ một việc của người dùng, ghi ở bảng *Carry-overs to W47* của [W45](sprint-2026-W45.md) và [W46](sprint-2026-W46.md).

**Deliverable cut**: US-2.8 ship 0.25.1.

## Phased plan

1. **US-2.8** (một phiên, vì 1 điểm): sửa `ORDER BY` của `SkillRepository.search`, thêm ca integration, VERSION 0.25.1, đóng W45 và W46, commit.
2. **Người dùng**: kiểm tay, `db:migrate`, `smoke_llm` theo bảng carry-over, rồi chuyển các story sang `done`.
3. **US-4.8** (bắt đầu 2026-11-16, người dùng chọn): phần D và chỉ số tin cậy CV ([CONTEXT D57](../CONTEXT.md)); xong 0.26.0 ngày 2026-11-18, `review`, chờ kiểm tay và `db:migrate` `0040`–`0041`.
4. **US-2.9** (bắt đầu 2026-11-19, người dùng chọn): người dùng không có key Gemini hay Claude, nên thêm nhà cung cấp OpenAI và DeepSeek ([CONTEXT D58](../CONTEXT.md)). v0.27.0, `review`; chờ người dùng chạy với key thật (TASK-2.9.9).
5. **Story kế tiếp**: US-5.1 (mốc M1), khi người dùng chọn.
6. **Ngân hàng câu hỏi** (lập ngày 2026-11-19 từ phản hồi của người dùng về ngân hàng JD 5, [CONTEXT D60](../CONTEXT.md)): ba story mới ở `backlog`, thứ tự đề xuất [US-4.12](stories/US-4.12-question-bank-ui-fixes-part-c.md) (ô độ phủ, phần D → C; 3 điểm) → [US-4.10](stories/US-4.10-on-demand-question-validation.md) (Validator chạy khi Trung tâm yêu cầu; 8 điểm) → [US-4.11](stories/US-4.11-question-bank-browser-and-rejection.md) (xem toàn bộ câu, loại câu; 5 điểm). US-4.12 bắt đầu 2026-11-19 (người dùng chọn), xong 0.27.1, `review`; chờ người dùng kiểm tay 360 / 768 / 1024 px. US-4.10 làm ngày 2026-11-19, xong 0.28.0, `review`; chờ `/code-review`, `db:migrate` `0043`, `smoke_llm --bank` với key thật và kiểm tay. Tiếp theo US-4.11.

## Parked / deferred from W45, W46

- ✅ **Closed**: [W45](sprint-2026-W45.md) (11 story, 0.14.0–0.24.0), [W46](sprint-2026-W46.md) (US-1.8 0.24.1, US-1.10 0.25.0), đóng ngày 2026-11-16.
- 🚧 **Carried into W47**: 14 story `review` (bảng trên).
- ⏭️ **Not started**: US-5.1, US-6.4.
- 📋 **Backlog**: US-1.9 (phiên giữa các tab).

## Risks & dependencies

- **14 story `review` chờ người dùng** — *Impact*: chưa story nào chuyển `done`. US-4.1…US-4.5 và US-1.10 cần migration `0028`…`0039`; kiểm tay trên DB chưa migrate sẽ lỗi. *Mitigation*: chạy `db:migrate` một lần trước khi kiểm tay; làm theo bảng carry-over của W45, W46. *Owner*: @PDTnhah.
- **Mốc M1 còn thiếu US-5.1, US-6.4** — *Impact*: chưa có số liệu mô phỏng phân bổ cho báo cáo. *Mitigation*: US-5.1 là hàm thuần, làm ngay sau US-2.8. *Owner*: @PDTnhah.

## Per-Epic Retrospective

| Epic   | Retro Status | Notes                                    |
| ------ | ------------ | ---------------------------------------- |
| EPIC-1 | optional     | US-1.8, US-1.10 chờ kiểm tay; US-1.9 backlog |
| EPIC-2 | optional     | US-2.8 0.25.1; US-2.7 chờ kiểm tay       |
| EPIC-3 | optional     | US-3.1…US-3.6 chờ kiểm tay hoặc key thật |
| EPIC-4 | optional     | US-4.1…US-4.5 chờ `db:migrate`, kiểm tay |
| EPIC-5 | optional     | US-5.1 chưa bắt đầu                      |
| EPIC-6 | optional     | US-6.4 chưa bắt đầu                      |

## Retrospective

*Điền khi đóng sprint.*

## Cross-references

- [Story US-2.8](stories/US-2.8-skill-search-empty-query.md): story mới của sprint
- [Sprint W45](sprint-2026-W45.md), [Sprint W46](sprint-2026-W46.md): đã đóng, bảng *Carry-overs to W47*
- [CONTEXT D55](../CONTEXT.md): tách US-2.8 khi điều tra US-1.8
- [CONTEXT D60](../CONTEXT.md): thêm US-4.10, US-4.11, US-4.12
- [README.md](README.md): quy ước sprint
- [STATUS.md](STATUS.md): bảng kanban tự sinh
