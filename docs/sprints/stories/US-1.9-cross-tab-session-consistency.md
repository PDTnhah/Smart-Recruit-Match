---
id: US-1.9
title: "Phiên đăng nhập nhất quán giữa các tab"
epic: EPIC-1
status: backlog
priority: P0
points: 3
sprint:
version_shipped:
prd_ref: [FR-1, NFR-1]
arch_ref: [AD-13]
depends_on: [US-1.3, US-1.7]
assignee:
commit:
created: 2026-11-15
updated: 2026-11-15
---

## Goal

Access token của một tab luôn thuộc đúng tài khoản tab đó đang hiện. Không request nào dựng cho tài khoản A được gửi bằng token của tài khoản khác. Khi tài khoản khác đăng nhập trên cùng trình duyệt, các tab cũ chuyển sang tài khoản đó một cách công khai, có thông báo, không lặng lẽ đổi danh tính.

## Background

Phát hiện khi điều tra [US-1.8](US-1.8-profile-default-campaign.md) ngày 2026-11-15 (đọc code, chưa gặp trong log; [CONTEXT D55](../../CONTEXT.md)).

- Cookie `srm_refresh` (httpOnly, `Path=/api/auth`, D25) thuộc về **trình duyệt**, mọi tab dùng chung. Access token và cache `['session']` thì mỗi tab giữ riêng trong bộ nhớ (`shared/api/token.ts`, `app/session.ts`, D26).
- Tab 1 là SV A. Ở tab 2, người dùng đăng xuất rồi đăng nhập SV B, nên cookie thành của B. Tab 1 giữ token của A tới khi hết hạn (15 phút). Server đóng stream SSE đúng lúc đó (D32), rồi `shared/notifications/event-stream.ts` gọi `refreshSession()`. Cũng vậy với 401 ở `shared/api/client.ts` và upload ở `shared/api/upload.ts`.
- `requestRefresh()` trong `shared/api/refresh.ts` cài token của B mà không so `session.user.id` với tài khoản của tab. `['session']` vẫn là A, nên menu tài khoản vẫn ghi A.
- Từ lúc đó mọi request của tab 1 chạy dưới danh nghĩa B:
  - màn Hồ sơ hiện CV của B;
  - request bị 401 được **gửi lại bằng token của B**, nên nộp CV, đồng ý điều khoản, lưu NV, lưu bài thi… ghi vào tài khoản B;
  - SSE nối lại dưới tên B.
- Backend đúng. Mỗi request được xác thực bằng token của chính nó; lỗi chỉ nằm ở web.

**Lessons applied**: none yet — story tạo ở backlog lúc điều tra US-1.8; đọc mục lục `docs/LESSONS.md` khi bắt đầu story.

## Acceptance criteria (nháp, xem lại khi bắt đầu story)

- [ ] **AC-1** — **Given** tab 1 là SV A, **When** tab 2 cùng trình duyệt đăng xuất rồi đăng nhập SV B, **Then** tab 1 tự tải lại trong khoảng 1 giây, hiện cổng của B kèm thông báo chuyển tài khoản. Tab 1 không lúc nào hiện tên A cùng dữ liệu của B.
- [ ] **AC-2** — Dự phòng khi không nhận được tin nhắn giữa các tab (tab bị treo, trình duyệt không có `BroadcastChannel`). Lượt refresh giữa phiên trả về tài khoản khác thì tab **không** cài token đó, **không** gửi lại request, rồi tải lại kèm thông báo. Áp dụng cho cả ba đường: 401 của `client.ts`, SSE, upload.
- [ ] **AC-3** — Đăng xuất ở một tab thì mọi tab khác của trình duyệt về `/login` ngay.
- [ ] **AC-4** — `signIn` (đăng nhập, nhận lời mời HR) xóa mọi query của tài khoản trước, trừ `['session']`.
- [ ] **AC-5** — Kiểm tay theo checklist ở *Dev notes*. Thông báo đọc được ở 360 px.

## Dev notes

**Hành vi người dùng đã chọn ngày 2026-11-15:** mỗi trình duyệt chỉ có một phiên. Tài khoản khác đăng nhập ở một tab thì các tab cũ tự tải lại, lấy phiên hiện hành từ cookie và hiện thông báo. Đăng xuất ở một tab thì các tab khác về `/login`. Đã loại hai cách: mỗi tab một tài khoản (refresh token trong sessionStorage, trái D26) và về `/login` thay vì chuyển tài khoản.

**Cách làm đề xuất:**

1. `token.ts`: token đi kèm tài khoản của tab: `setSessionToken(token, userId)`, `clearSessionToken()`, `getSessionUserId()`.
2. `refresh.ts`: `refreshSession()` trả `RefreshOutcome = refreshed | expired | switched`.
   - Tab đã có tài khoản mà `session.user.id` khác thì **không** cài token, trả `switched` và gọi handler `onAccountSwitched` một lần.
   - Vẫn giữ Web Lock và promise in-flight.
3. Ba chỗ gọi refresh xử lý `switched`:
   - `client.ts`: trả nguyên response 401, không gửi lại;
   - `upload.ts`: không gửi file, ném lỗi;
   - `event-stream.ts`: dừng vòng lặp.
4. `session.ts` và `providers.tsx`:
   - `BroadcastChannel('srm-session')`, tin nhắn kiểm bằng Zod: `signed-in { userId }` / `signed-out`;
   - `signIn` xóa query cũ, `signOut` phát `signed-out`;
   - `reloadForAccountSwitch()` ghi cờ vào `sessionStorage` (try/catch) rồi `window.location.replace('/')`;
   - sau khi tải lại, `toast.info` nêu email tài khoản hiện hành và gợi ý dùng cửa sổ ẩn danh nếu cần hai tài khoản cùng lúc.

   Tải lại thay vì đổi tài khoản ngay trong app: một lần tải lại bỏ sạch mọi request và mutation đang chạy (`onSuccess` của chúng có thể ghi dữ liệu A vào cache mới), form chưa lưu, hàng chờ tự lưu của phòng thi và SSE.
5. Không thêm thư viện, không đổi backend. Thêm dòng vào AGENTS › *Mẫu có sẵn*: gọi API ngoài client `api` thì xử lý đủ ba kết quả refresh.

**Đã biết:** phòng thi và trang NV có `useBeforeUnload`, nên trình duyệt có thể hỏi trước khi tải lại. Trong lúc đó tab vẫn giữ token của A, không bao giờ giữ token của B.

**Kiểm tay** (compose ở :8080):

1. AC-1, AC-3: tab 1 là A, mở "Hồ sơ". Tab 2 đăng xuất: tab 1 về `/login` ngay. Tab 2 đăng nhập B: tab 1 tự tải lại, vào cổng của B, có toast.
2. AC-2: tab 1 là A. Ở tab 2, trong Console, gọi `fetch('/api/auth/login', …)` của B: cookie đổi mà không có tin nhắn giữa các tab. Để tab 1 mở hơn 15 phút. Network của tab 1 thấy `/api/auth/refresh` 200 rồi trang tải lại, không có request nào gửi lại bằng token mới.
3. AC-2 đường upload: như bước 2 nhưng chọn file CV ở tab 1. File không được gửi; B không có phiên bản CV mới.

## Verification commands

`pnpm typecheck`, `pnpm lint`, `pnpm build`. Web chưa có bộ test unit: kiểm tay theo checklist; Playwright hai tab để US-6.6.

## Cross-references

- [PRD FR-1](../../PRD.md#functional-requirements) · [EPIC-1](../epics/EPIC-1.md) · [CONTEXT D25, D26, D32, D55](../../CONTEXT.md)
- [US-1.3 Đăng nhập, phân quyền](US-1.3-auth-rbac-design-system-app-shell.md) · [US-1.7 Thông báo, SSE](US-1.7-notifications-sse-email-reminders.md) · [US-6.6 Dữ liệu demo, E2E](US-6.6-demo-data-e2e-load-test.md)
