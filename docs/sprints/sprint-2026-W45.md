---
id: sprint-2026-W45
status: in-progress
start: 2026-11-02T00:00:00.000Z
end: 2026-11-08T00:00:00.000Z
goal: 'Ship US-2.7: danh mục kỹ năng có vùng, họ và quan hệ kéo theo, ADMIN gán khi duyệt và sửa cho kỹ năng đã duyệt, `SkillCatalogService.taxonomy()` cho module matching (v0.14.0); bắt đầu US-3.6 ở làn B; đóng US-3.1'
---
## Sprint scope

| US     | Title                                              | Epic   | Pri | Points | Status     | Carry    | Story file                                                                                                   |
| ------ | -------------------------------------------------- | ------ | --- | ------ | ---------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| US-2.7 | Vùng, họ và quan hệ kéo theo của kỹ năng           | EPIC-2 | P0  | 8      | 👀 review  | new      | [stories/US-2.7-skill-zones-families-implications.md](stories/US-2.7-skill-zones-families-implications.md)   |
| US-3.6 | Quy đổi ngoại ngữ CEFR và mức khớp ngành bằng code | EPIC-3 | P0  | 5      | 👀 review  | new      | [stories/US-3.6-language-cefr-major-match.md](stories/US-3.6-language-cefr-major-match.md)                   |
| US-3.5 | Hồ sơ kỹ năng chi tiết và khớp kỹ năng bằng code   | EPIC-3 | P0  | 8      | 👀 review  | from W46 | [stories/US-3.5-skill-evidence-code-matching.md](stories/US-3.5-skill-evidence-code-matching.md)             |
| US-3.2 | Matching Agent chạy hàng loạt                      | EPIC-3 | P0  | 13     | 👀 review  | from W47 | [stories/US-3.2-batch-matching-agent.md](stories/US-3.2-batch-matching-agent.md)                             |
| US-3.3 | Shortlist và chọn nguyện vọng                      | EPIC-3 | P0  | 8      | 👀 review  | from W48 | [stories/US-3.3-shortlist-and-preferences.md](stories/US-3.3-shortlist-and-preferences.md)                   |
| US-3.4 | Mức cạnh tranh và gợi ý ít cạnh tranh              | EPIC-3 | P1  | 3      | 👀 review  | from W48 | [stories/US-3.4-competition-level-and-suggestions.md](stories/US-3.4-competition-level-and-suggestions.md)   |
| US-3.1 | Lọc điều kiện cứng và công thức S_cv               | EPIC-3 | P0  | 5      | 👀 review  | from W44 | [stories/US-3.1-hard-filters-and-scv-formula.md](stories/US-3.1-hard-filters-and-scv-formula.md)             |
| US-4.1 | Ma trận đề và Test Generator                       | EPIC-4 | P0  | 8      | 👀 review  | from W47 | [stories/US-4.1-exam-blueprint-test-generator.md](stories/US-4.1-exam-blueprint-test-generator.md)           |
| US-4.2 | Validator và khóa ngân hàng câu hỏi                | EPIC-4 | P0  | 8      | 👀 review  | from W48 | [stories/US-4.2-validator-and-question-bank-lock.md](stories/US-4.2-validator-and-question-bank-lock.md)     |
| US-5.1 | Allocation Engine và property-based test           | EPIC-5 | P0  | 5      | 📋 backlog | from W42 | [stories/US-5.1-allocation-engine-property-tests.md](stories/US-5.1-allocation-engine-property-tests.md)     |
| US-6.4 | Mô phỏng phân bổ so với baseline                   | EPIC-6 | P1  | 5      | 📋 backlog | from W44 | [stories/US-6.4-allocation-simulation-vs-baselines.md](stories/US-6.4-allocation-simulation-vs-baselines.md) |

> **Convention**: AC + Tasks live inside each story file. This sprint file lists planned
> stories at a glance only. Design + decision docs cross-linked at the bottom.

## Sprint goal recap

Tuần T5 của lộ trình 13 tuần ([sprints/README › Lộ trình](README.md#lộ-trình)), đầu giai đoạn 2. US-2.3, US-2.4 và US-3.1 của T5 đã xong sớm ở W43–W44. Tuần này làm hai story mới của [CONTEXT D42](../CONTEXT.md) (khớp kỹ năng, ngoại ngữ, ngành bằng code):

- **Làn A — US-2.7** (8 điểm): taxonomy vùng, họ, kéo theo trong `core.skills` và `core.skill_implications`. Chốt phạm vi ở [CONTEXT D43](../CONTEXT.md): 15 vùng, 70 họ, 179 kỹ năng có họ, 81 cạnh kéo theo, bỏ AC-7.
- **Làn B — US-3.6** (5 điểm, bắt đầu): bảng `language-cefr/v1` và mức khớp ngành bằng code.

US-3.5 (khớp kỹ năng theo bậc bằng chứng) cần taxonomy của US-2.7, nên ở W46. Ngày 2026-11-02, sau khi US-2.7 merge vào `dev`, kéo US-3.5 sớm từ W46 (8 điểm, làn A). Phiên Plan chốt khung bậc ở [CONTEXT D44](../CONTEXT.md): thời gian chỉ đọc ở mục kinh nghiệm. US-5.1 và US-6.4 chuyển tiếp để hoàn thành mốc M1 khi một làn rảnh.

Ngày 2026-11-03, sau khi US-3.6 merge vào `dev`, kéo US-3.2 sớm từ W47 (13 điểm, cả hai làn). Phiên Plan chốt [CONTEXT D46](../CONTEXT.md): batch cho Gemini và Claude, ack sớm + bộ poll nền, ghim prompt theo đợt, tạm không hạ điểm dự án, năm học đọc từ hồ sơ.

Ngày 2026-11-03, sau khi US-3.2 xong, kéo US-3.3 sớm (8 điểm); phiên Plan chốt Q1, Q6 ở [CONTEXT D47](../CONTEXT.md).

Ngày 2026-11-04, sau khi US-3.3 merge vào `dev`, kéo US-3.4 sớm từ W48 (3 điểm); phiên Plan chốt ngưỡng, kênh SSE theo đợt và cách đếm lại ở [CONTEXT D48](../CONTEXT.md).

Ngày 2026-11-05, sau khi US-3.4 merge vào `dev` (PR #24), kéo US-4.1 sớm từ W47 (8 điểm), mở EPIC-4. Phiên Plan chốt ở [CONTEXT D49](../CONTEXT.md): vòng lặp sinh đề do code điều khiển (không dùng tool-use), mỗi JD một ngân hàng (Q2 chốt một phần, Q7 chốt), ma trận chỉ nằm ở `question_banks`, tham số mặc định là hằng số.

Ngày 2026-11-06, sau khi US-4.1 merge vào `dev` (PR #25), kéo US-4.2 sớm từ W48 (8 điểm). Phiên Plan chốt bốn điểm mở theo Đề xuất ở [CONTEXT D50](../CONTEXT.md): Validator chạy trong job sinh câu, chỉ CENTER khóa ngân hàng bằng tay, JD có yêu cầu mới thì lưu lại ma trận, độ khó chỉ bị loại khi lệch 2 bậc.

**Deliverable cut**: US-2.7 ship 0.14.0, US-3.5 ship 0.15.0, US-3.6 ship 0.16.0 (sớm hơn lộ trình W46), US-3.2 ship 0.17.0 (sớm hơn lộ trình W47), US-3.3 ship 0.18.0, US-3.4 ship 0.19.0 (sớm hơn lộ trình W48), US-4.1 ship 0.20.0 (sớm hơn lộ trình W47), US-4.2 ship 0.21.0 (sớm hơn lộ trình W48).

## Phased plan

1. **US-2.7 phiên 2a**: `packages/shared` (vùng, họ, schema, mã lỗi), Drizzle schema, migration `0020` và seed `0021`, hàm thuần `findCycle` và `implicationClosure`.
2. **US-2.7 phiên 2b**: API duyệt kèm taxonomy, `PATCH /api/admin/skills/{id}/taxonomy`, `taxonomy()`, integration test.
3. **US-2.7 phiên 2c**: giao diện `/admin/skills`, kiểm tay 360 / 768 / 1024 px.
4. **US-2.7 phiên 3**: review, VERSION 0.14.0, CHANGELOG, commit, merge vào `dev`.
5. **US-3.6**: rebase lên `dev` sau khi US-2.7 merge rồi mới sinh migration.

## Parked / deferred from W44

- ✅ **Closed in W44**: US-2.4 (0.10.0), US-2.5 (0.11.0), US-2.6 (0.12.0, sửa ở 0.13.1); EPIC-1 và US-2.1…US-2.3 đóng ngày 2026-10-28.
- 🚧 **Carried into W45**: US-3.1 — `review`, chờ kiểm tay AC-13.
- ⏭️ **Not started**: US-5.1 (kế hoạch W42), US-6.4 (kế hoạch W44).

## Risks & dependencies

- **Hai làn cùng sửa `packages/shared` và có thể cùng sinh migration** — *Impact*: xung đột ở `schemas/errors.ts`, số thứ tự migration trùng. *Mitigation*: US-2.7 sinh `0020`, `0021` và merge trước; US-3.6 rebase rồi mới chạy `db:generate` ([LESSONS §6](../LESSONS.md), [sprints/README › Chạy song song](README.md#chạy-song-song)). *Owner*: @PDTnhah.

- **Bảng seed của US-2.7 sai một khóa thì cạnh hoặc họ bị bỏ mà không ai biết** — *Impact*: US-3.5 khớp sai. *Mitigation*: migration seed `RAISE` khi số kỹ năng cập nhật khác 174 hoặc số cạnh khác 81; integration test kiểm không có chu trình và mọi kỹ năng mềm có năng lực chuẩn. *Owner*: @PDTnhah.

- **Mốc M1 vẫn thiếu US-5.1, US-6.4** — *Impact*: chưa có số liệu mô phỏng phân bổ. *Mitigation*: hai story là hàm thuần và script, không đụng `packages/shared/contracts` hay migration; làm ở làn B khi US-3.6 xong. *Owner*: @PDTnhah.

## Per-Epic Retrospective

| Epic   | Retro Status | Notes                                                                                           |
| ------ | ------------ | ----------------------------------------------------------------------------------------------- |
| EPIC-2 | optional     | US-2.7 là story cuối của epic                                                                   |
| EPIC-3 | optional     | US-3.1 chờ kiểm tay; US-3.5 0.15.0; US-3.6 0.16.0; US-3.2 0.17.0; US-3.3 0.18.0; US-3.4 0.19.0 |
| EPIC-5 | optional     | US-5.1 chưa bắt đầu                                                                             |
| EPIC-6 | optional     | US-6.4 chưa bắt đầu                                                                             |

## Retrospective

*Điền khi đóng sprint.*

## Cross-references

- [Story US-2.7](stories/US-2.7-skill-zones-families-implications.md), [US-3.6](stories/US-3.6-language-cefr-major-match.md) — story mới theo D42
- [Story US-3.1](stories/US-3.1-hard-filters-and-scv-formula.md), [US-5.1](stories/US-5.1-allocation-engine-property-tests.md), [US-6.4](stories/US-6.4-allocation-simulation-vs-baselines.md) — chuyển từ W42, W44
- [Sprint W44 (đã đóng)](sprint-2026-W44.md)
- [EPIC-2](epics/EPIC-2.md), [EPIC-3](epics/EPIC-3.md) — epic cha
- [CONTEXT D42, D43](../CONTEXT.md) — khớp kỹ năng bằng code, taxonomy
- [README.md](README.md) — quy ước sprint
- [STATUS.md](STATUS.md) — bảng kanban tự sinh
