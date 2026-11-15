---
id: sprint-2026-W46
status: in-progress
start: 2026-11-09T00:00:00.000Z
end: 2026-11-15T00:00:00.000Z
goal: 'Sửa lỗi màn Hồ sơ mở đợt trống khi Trung tâm mở thêm đợt cùng khóa và ngành (US-1.8, v0.24.1)'
---
## Sprint scope

| US     | Title                                              | Epic   | Pri | Points | Status    | Carry | Story file                                                                               |
| ------ | -------------------------------------------------- | ------ | --- | ------ | --------- | ----- | ---------------------------------------------------------------------------------------- |
| US-1.8 | Màn Hồ sơ mở đúng đợt khi sinh viên thấy nhiều đợt | EPIC-1 | P1  | 3      | 👀 review | new   | [stories/US-1.8-profile-default-campaign.md](stories/US-1.8-profile-default-campaign.md) |

> **Convention**: AC + Tasks live inside each story file. This sprint file lists planned
> stories at a glance only. Design + decision docs cross-linked at the bottom.

## Sprint goal recap

Ngày 2026-11-15, người dùng báo "CV của SV mất sau khi đăng nhập tài khoản khác". Log request cho thấy dữ liệu còn nguyên: màn Hồ sơ mở đợt mới do Trung tâm vừa mở, thay vì đợt SV đã có CV. Thêm US-1.8 (3 điểm) để sửa. Hai lỗi phụ tìm được khi điều tra thành US-1.9 và US-2.8, để backlog ([CONTEXT D55](../CONTEXT.md)).

Sprint này mở riêng cho US-1.8: `sprint-2026-W45` đã qua ngày kết thúc (08/11), nên story mới không xếp vào đó được. W45 vẫn `in-progress` với các story `review`; đóng W45 và chuyển các story đó là việc để sau (người dùng chọn ngày 2026-11-15).

**Deliverable cut**: US-1.8 ship 0.24.1 (sửa lỗi).

## Phased plan

1. **US-1.8 phiên 1**: điều tra bằng log request, chốt thứ tự chọn đợt (D55), tách US-1.9, US-2.8.
2. **US-1.8 phiên 2**: hàm thuần ở `packages/shared`, màn Hồ sơ và trang chủ SV.
3. **US-1.8 phiên 3**: review, link `?campaign=` của thông báo và email, VERSION 0.24.1, CHANGELOG, commit.
4. **Người dùng**: kiểm tay AC-2…AC-7 trên compose.

## Parked / deferred from W45

- 🚧 **Còn ở W45** (`review`, chờ kiểm tay hoặc `db:migrate`): US-2.7, US-3.1…US-3.6, US-4.1…US-4.5.
- ⏭️ **Not started**: US-5.1, US-6.4 (vẫn ở W45).
- 📋 **Backlog mới**: US-1.9 (phiên giữa các tab), US-2.8 (tìm kỹ năng với query rỗng).

## Risks & dependencies

- **Hai sprint cùng `in-progress`** — *Impact*: `active_sprint` trong CLAUDE.md chỉ trỏ được một sprint, nên W45 dễ bị quên. *Mitigation*: khi bắt đầu story kế tiếp, đóng W45 và mở sprint của tuần đó, chuyển các story `review` sang. *Owner*: @PDTnhah.

## Per-Epic Retrospective

| Epic   | Retro Status | Notes                                 |
| ------ | ------------ | ------------------------------------- |
| EPIC-1 | optional     | US-1.8 sửa lỗi; US-1.9 còn ở backlog |

## Retrospective

*Điền khi đóng sprint.*

## Cross-references

- [Story US-1.8](stories/US-1.8-profile-default-campaign.md); [US-1.9](stories/US-1.9-cross-tab-session-consistency.md), [US-2.8](stories/US-2.8-skill-search-empty-query.md): tách khi điều tra
- [Sprint W45](sprint-2026-W45.md): vẫn mở
- [EPIC-1](epics/EPIC-1.md): epic cha
- [CONTEXT D55](../CONTEXT.md): thứ tự chọn đợt, thêm ba story
- [README.md](README.md): quy ước sprint
- [STATUS.md](STATUS.md): bảng kanban tự sinh
