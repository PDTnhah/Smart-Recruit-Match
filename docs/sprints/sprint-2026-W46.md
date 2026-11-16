---
id: sprint-2026-W46
status: closed
start: 2026-11-09T00:00:00.000Z
end: 2026-11-15T00:00:00.000Z
goal: 'Sửa lỗi màn Hồ sơ mở đợt trống khi Trung tâm mở thêm đợt cùng khóa và ngành (US-1.8, v0.24.1); Trung tâm sửa, hủy, xóa đợt sau khi mở (US-1.10)'
---
## Sprint scope

| US     | Title                                              | Epic   | Pri | Points | Status    | Carry | Story file                                                                               |
| ------ | -------------------------------------------------- | ------ | --- | ------ | --------- | ----- | ---------------------------------------------------------------------------------------- |
| US-1.8 | Màn Hồ sơ mở đúng đợt khi sinh viên thấy nhiều đợt | EPIC-1 | P1  | 3      | 👀 review | new   | [stories/US-1.8-profile-default-campaign.md](stories/US-1.8-profile-default-campaign.md) |
| US-1.10 | Sửa, hủy và xóa đợt sau khi mở | EPIC-1 | P1 | 8 | 👀 review | new | [stories/US-1.10-campaign-edit-cancel-delete.md](stories/US-1.10-campaign-edit-cancel-delete.md) |

> **Convention**: AC + Tasks live inside each story file. This sprint file lists planned
> stories at a glance only. Design + decision docs cross-linked at the bottom.

## Sprint goal recap

Ngày 2026-11-15, người dùng báo "CV của SV mất sau khi đăng nhập tài khoản khác". Log request cho thấy dữ liệu còn nguyên: màn Hồ sơ mở đợt mới do Trung tâm vừa mở, thay vì đợt SV đã có CV. Thêm US-1.8 (3 điểm) để sửa. Hai lỗi phụ tìm được khi điều tra thành US-1.9 và US-2.8, để backlog ([CONTEXT D55](../CONTEXT.md)).

Sprint này mở riêng cho US-1.8: `sprint-2026-W45` đã qua ngày kết thúc (08/11), nên story mới không xếp vào đó được. W45 vẫn `in-progress` với các story `review`; đóng W45 và chuyển các story đó là việc để sau (người dùng chọn ngày 2026-11-15).

Cùng ngày, người dùng yêu cầu cho Trung tâm sửa hoặc xóa đợt sau khi mở. Thêm US-1.10 (8 điểm) và FR-41; người dùng chốt bốn điểm theo Đề xuất ([CONTEXT D56](../CONTEXT.md)). Nhánh `us-1.10` tạo từ `us-1.8`.

**Deliverable cut**: US-1.8 ship 0.24.1 (sửa lỗi); US-1.10 ship 0.25.0.

## Phased plan

1. **US-1.8 phiên 1**: điều tra bằng log request, chốt thứ tự chọn đợt (D55), tách US-1.9, US-2.8.
2. **US-1.8 phiên 2**: hàm thuần ở `packages/shared`, màn Hồ sơ và trang chủ SV.
3. **US-1.8 phiên 3**: review, link `?campaign=` của thông báo và email, VERSION 0.24.1, CHANGELOG, commit.
4. **Người dùng**: kiểm tay AC-2…AC-7 trên compose.
5. **US-1.10 phiên 1**: chốt D56, viết story. **Phiên 2a/2b/2c**: quy tắc + `PATCH`; hủy, xóa, thông báo; web. **Phiên 3**: review, 0.25.0, commit.

## Parked / deferred from W45

- 🚧 **Còn ở W45** (`review`, chờ kiểm tay hoặc `db:migrate`): US-2.7, US-3.1…US-3.6, US-4.1…US-4.5.
- ⏭️ **Not started**: US-5.1, US-6.4 (vẫn ở W45).
- 📋 **Backlog mới**: US-1.9 (phiên giữa các tab), US-2.8 (tìm kỹ năng với query rỗng).

## Risks & dependencies

- **Hai sprint cùng `in-progress`** — *Impact*: `active_sprint` trong CLAUDE.md chỉ trỏ được một sprint, nên W45 dễ bị quên. *Mitigation*: khi bắt đầu story kế tiếp, đóng W45 và mở sprint của tuần đó, chuyển các story `review` sang. *Owner*: @PDTnhah.

## Per-Epic Retrospective

| Epic   | Retro Status | Notes                                 |
| ------ | ------------ | ------------------------------------- |
| EPIC-1 | optional     | US-1.8 sửa lỗi; US-1.10 sửa, hủy, xóa đợt; US-1.9 còn ở backlog |

## Retrospective

Đóng ngày 2026-11-16. Sprint ship hai story: 0.24.1 (US-1.8, 3 điểm, sửa lỗi) và 0.25.0 (US-1.10, 8 điểm). Tổng 11 điểm. Nhánh `us-1.10` tạo từ `us-1.8`, nên cả hai merge vào `dev` cùng PR #31. Cả hai còn `review`, chuyển sang W47.

### What went well

- Điều tra bằng log request của container `api` cho thấy dữ liệu không mất, nên sửa đúng chỗ (màn Hồ sơ chọn đợt) thay vì sửa phiên đăng nhập. Cũng từ log này tìm ra hai lỗi phụ, US-1.9 và US-2.8.
- US-1.10 (8 điểm) chia phiên 2 thành 2a/2b/2c theo nhóm task, mỗi phiên kết thúc với test xanh.

### What didn't

- Ba bẫy mới (LESSONS §46–§48). Bẫy §47 (CRLF trong working tree) làm diff của ba file thành diff cả file.
- Hai sprint cùng `in-progress` suốt tuần, như *Risks* đã nêu.

### Followups

- Người dùng làm các việc còn chờ ở bảng *Carry-overs to W47*.
- US-1.9 (phiên giữa các tab) còn ở backlog.

## Carry-overs to W47

| US      | Lý do                                                    | Từ sprint |
| ------- | -------------------------------------------------------- | --------- |
| US-1.8  | `review`: chờ kiểm tay AC-2…AC-7 theo checklist trong story | W46       |
| US-1.10 | `review`: chờ `db:migrate` `0039`, kiểm tay AC-10         | W46       |

## Cross-references

- [Story US-1.8](stories/US-1.8-profile-default-campaign.md); [US-1.9](stories/US-1.9-cross-tab-session-consistency.md), [US-2.8](stories/US-2.8-skill-search-empty-query.md): tách khi điều tra
- [Sprint W45](sprint-2026-W45.md): đóng cùng ngày · [Sprint W47](sprint-2026-W47.md): nhận các story chuyển tiếp
- [EPIC-1](epics/EPIC-1.md): epic cha
- [CONTEXT D55](../CONTEXT.md): thứ tự chọn đợt, thêm ba story
- [Story US-1.10](stories/US-1.10-campaign-edit-cancel-delete.md); [CONTEXT D56](../CONTEXT.md): sửa, hủy, xóa đợt sau khi mở
- [README.md](README.md): quy ước sprint
- [STATUS.md](STATUS.md): bảng kanban tự sinh
