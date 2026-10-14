---
id: sprint-2026-W42
status: in-progress
start: 2026-10-12T00:00:00.000Z
end: 2026-10-18T00:00:00.000Z
goal: 'Ship US-1.4: Trung tâm tạo và cấu hình đợt thực tập, đợt tự chuyển pha theo mốc, các thao tác bị chặn khi sai pha (v0.3.0); ship US-1.5: doanh nghiệp, mời HR, đăng và duyệt JD (v0.4.0); ship US-1.6: sinh viên đồng ý điều khoản và nộp CV có phiên bản (v0.5.0); đóng US-1.1 và US-1.3'
---
## Sprint scope

| US     | Title                                             | Epic   | Pri | Points | Status    | Carry    | Story file                                                                                                             |
| ------ | ------------------------------------------------- | ------ | --- | ------ | --------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| US-1.1 | Scaffold monorepo, Docker Compose, CI             | EPIC-1 | P0  | 5      | 👀 review | from W41 | [stories/US-1.1-scaffold-monorepo-docker-compose-ci.md](stories/US-1.1-scaffold-monorepo-docker-compose-ci.md)         |
| US-1.3 | Đăng nhập, phân quyền, DESIGN.md, khung giao diện | EPIC-1 | P0  | 8      | 👀 review | from W41 | [stories/US-1.3-auth-rbac-design-system-app-shell.md](stories/US-1.3-auth-rbac-design-system-app-shell.md)             |
| US-1.4 | Tạo và cấu hình đợt thực tập                      | EPIC-1 | P0  | 5      | 👀 review | new      | [stories/US-1.4-campaign-setup-and-config.md](stories/US-1.4-campaign-setup-and-config.md)                             |
| US-1.5 | Doanh nghiệp, tài khoản HR, đăng và duyệt JD      | EPIC-1 | P0  | 8      | 👀 review | new      | [stories/US-1.5-company-hr-accounts-jd-posting-approval.md](stories/US-1.5-company-hr-accounts-jd-posting-approval.md) |
| US-1.6 | Đồng ý xử lý dữ liệu và nộp CV                    | EPIC-1 | P0  | 5      | 👀 review | new      | [stories/US-1.6-data-consent-and-cv-upload.md](stories/US-1.6-data-consent-and-cv-upload.md)                           |

> **Convention**: AC + Tasks live inside each story file. This sprint file lists planned
> stories at a glance only. Design + decision docs cross-linked at the bottom.

## Sprint goal recap

Tuần T2 của lộ trình 13 tuần ([sprints/README › Lộ trình](README.md#lộ-trình)). US-1.2 và US-1.3 vốn thuộc W42 đã làm xong ở W41, nên kéo US-1.4 từ T3 (W43) vào tuần này. US-1.4 là nền cho US-1.5 và US-1.6: hai story này gọi `CampaignService.assertPhase` và đọc tham số đợt qua `CampaignService`.

**Deliverable cut**: module `campaign` (tạo, sửa, mở đợt; tham số mặc định theo PRD GĐ0), tác vụ định kỳ chuyển pha theo mốc, `assertPhase`, `Clock`/`FakeClock`, màn "Đợt thực tập" ở cổng Trung tâm. Chưa làm: ghi đè tham số ở cấp JD, mở vòng bổ sung và đóng đợt (US-5.5), lịch ngày nghỉ cho SLA_HR (US-5.3). Story không sinh migration.

US-1.5 kéo từ T3 (W43) vào sau khi US-1.4 merge vào `dev` (2026-10-13). **Deliverable cut**: module `company` (doanh nghiệp, JD), lời mời HR trong `iam`, lớp lưu file dùng chung (`common/storage`), màn "Doanh nghiệp", "Duyệt JD", "JD của tôi" và trang nhận lời mời. Chưa làm: phân tích JD bằng AI và màn xác nhận yêu cầu (US-2.3). US-1.5 là story duy nhất sinh migration trong tuần ([CONTEXT D28](../CONTEXT.md)).

US-1.6 kéo từ T4 (W44) vào sau khi US-1.5 merge vào `dev` (2026-10-14). **Deliverable cut**: bảng `consents` và điều khoản xử lý dữ liệu có phiên bản (`packages/shared/consent/`), nộp và cập nhật CV PDF/DOCX có phiên bản, partial unique index cho BR-01, sự kiện `cv.submitted`, quyền xem file CV, màn "Hồ sơ" ở cổng sinh viên. Chưa làm: phân tích CV bằng AI (US-2.4), xác nhận hồ sơ năng lực (US-2.6), rút lại đồng ý và xóa dữ liệu theo thời hạn lưu. US-1.6 là story duy nhất sinh migration trong đợt; US-1.7 rebase sau ([CONTEXT D30](../CONTEXT.md)).

US-1.1 và US-1.3 chuyển từ W41 sang ở trạng thái `review`, chờ xác nhận CI xanh và kiểm tay trong trình duyệt.

## Parked / deferred from W41

- ✅ **Closed in W41**: US-1.2 — ship ở 0.1.1.
- 🚧 **Carried into W42**: US-1.1 — chờ xác nhận CI xanh (AC-4).
- 🚧 **Carried into W42**: US-1.3 — chờ kiểm tay AC-4 (phía web), AC-11, AC-12, AC-13.

## Risks & dependencies

- **US-1.5 sửa chung `packages/shared/schemas`** — *Impact*: xung đột khi chạy song song. *Mitigation*: US-1.4 merge trước, US-1.5 rebase sau ([README › Chạy song song](README.md#chạy-song-song)). *Owner*: @PDTnhah.

- **Cron chạm vào dữ liệu integration test** — *Impact*: test lỗi lúc được lúc không vì đợt bị chuyển pha giữa chừng. *Mitigation*: `SCHEDULER_ENABLED=false` trong test, test scheduler dùng `FakeClock` ở năm 2001 ([CONTEXT D27](../CONTEXT.md)). *Owner*: @PDTnhah.

- **US-1.6 sửa `common/storage/files.controller.ts` và `packages/shared/schemas`** — *Impact*: xung đột với US-5.1 (làn B) và US-1.7. *Mitigation*: US-1.6 merge trước; story khác rebase rồi mới sinh migration ([README › Chạy song song](README.md#chạy-song-song)). *Owner*: @PDTnhah.

## Per-Epic Retrospective

| Epic   | Retro Status | Notes                 |
| ------ | ------------ | --------------------- |
| EPIC-1 | optional     | Epic còn chạy tới W44 |

## Retrospective

*Điền khi đóng sprint.*

## Cross-references

- [Story US-1.4](stories/US-1.4-campaign-setup-and-config.md) — AC + Tasks
- [Story US-1.5](stories/US-1.5-company-hr-accounts-jd-posting-approval.md) — AC + Tasks
- [Story US-1.6](stories/US-1.6-data-consent-and-cv-upload.md) — AC + Tasks
- [Story US-1.1](stories/US-1.1-scaffold-monorepo-docker-compose-ci.md), [Story US-1.3](stories/US-1.3-auth-rbac-design-system-app-shell.md) — chuyển từ W41
- [Sprint W41 (đã đóng)](sprint-2026-W41.md)
- [EPIC-1](epics/EPIC-1.md) — epic cha
- [CONTEXT D27](../CONTEXT.md) — đối tượng, phạm vi đọc, khóa tham số, gia hạn mốc, kiểm tra pha
- [CONTEXT D28](../CONTEXT.md) — doanh nghiệp, lời mời HR, nộp và duyệt JD, lưu file
- [CONTEXT D30](../CONTEXT.md) — đồng ý xử lý dữ liệu, phiên bản CV, nộp CV
- [README.md](README.md) — quy ước sprint
- [STATUS.md](STATUS.md) — bảng kanban tự sinh
