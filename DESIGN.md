# DESIGN.md — Smart Recruit Match

Design system cho `apps/web` (AD-14, [CONTEXT D14, D26](docs/CONTEXT.md)). Mọi màn hình đọc file này trước khi code và ghi `Design applied: §…` vào *Implementation notes* của story. Cổng `design-first` của koni-harness kiểm tra dòng đó.

- Số mục (§1…§12) cố định để story và design spec trích dẫn. Thêm mục mới thì nối vào cuối, không đánh số lại.
- Đổi token, primitive hay quy tắc ở đây thì sửa cùng commit với code.
- Nguồn token: [`apps/web/src/index.css`](apps/web/src/index.css). File này mô tả ý nghĩa; giá trị nằm trong CSS.

## 1. Nguyên tắc

1. **Dùng shadcn/ui trước, tự viết sau.** Component có sẵn trong §6 thì dùng nó. Cần primitive mới thì thêm bằng `pnpm dlx shadcn@4.21.0 add <tên> --cwd apps/web`, đọc lại file sinh ra, ghim lại phiên bản các gói CLI vừa thêm ([LESSONS §8](docs/LESSONS.md)), rồi ghi vào §6.
2. **Chỉ dùng token ngữ nghĩa** (§2): `bg-primary`, `text-muted-foreground`, `border-border`… Không dùng màu thô (`bg-blue-500`, `#2563eb`, `bg-[#…]`), không tự viết `dark:`.
3. **`className` chỉ để bố cục** (`flex`, `gap-*`, `grid`, `w-*`, `p-*`). Kiểu dáng đến từ `variant`/`size` của component. Biến thể mới viết bằng `cva` trong file component, ghép lớp bằng `cn()`.
4. **Bố cục bằng `flex`/`grid` + `gap-*`**, không dùng `space-x-*`/`space-y-*`. Kích thước vuông dùng `size-*`.
5. **Mobile-first cho cổng sinh viên** (§5). HR và Trung tâm thiết kế cho màn ≥ 1024 px nhưng vẫn dùng được ở 768 px.
6. **Mỗi màn có đủ bốn trạng thái** (§7). Không có màn nào trắng trơn khi đang tải hay khi lỗi.
7. **Ẩn nút không phải là phân quyền.** Giao diện ẩn chức năng theo vai trò cho gọn, nhưng API mới là nơi kiểm tra quyền (CONTEXT D25).

## 2. Token màu ngữ nghĩa

Chỉ có giao diện sáng. Khối `.dark` trong `index.css` là mặc định của preset, giữ lại cho sau này nhưng chưa bật và chưa kiểm tra.

| Token (Tailwind) | Dùng cho | Giá trị sáng |
|---|---|---|
| `background` / `foreground` | Nền trang, chữ chính | trắng / `oklch(0.145 0 0)` |
| `card` / `card-foreground` | Nền `Card`, vùng nội dung | trắng / như `foreground` |
| `popover` / `popover-foreground` | Menu, tooltip, toast | trắng / như `foreground` |
| `primary` / `primary-foreground` | Nút chính, liên kết, mục menu đang chọn | xanh `oklch(0.488 0.243 264.376)` / trắng |
| `secondary` / `secondary-foreground` | Nút phụ | xám rất nhạt / xám đậm |
| `muted` / `muted-foreground` | Nền phụ; chữ phụ, mô tả, placeholder | `oklch(0.97 0 0)` / `oklch(0.5 0 0)` |
| `accent` / `accent-foreground` | Nền khi rê chuột, mục được chọn trong menu | như `muted` |
| `destructive` | Lỗi, hành động xóa, `aria-invalid` | đỏ `oklch(0.577 0.245 27.325)` |
| `border` | Viền trang trí: thẻ, đường ngăn | `oklch(0.922 0 0)` |
| `input` | Viền ô nhập (phải thấy được để nhận ra ô) | `oklch(0.65 0 0)`, đậm hơn preset |
| `ring` | Viền focus | như `primary` (6.8:1) |
| `sidebar-*` | Thanh bên của cổng HR, Trung tâm | `sidebar-primary` như `primary` |
| `chart-1…5` | Biểu đồ (EPIC-6) | thang xám của preset; đổi khi làm báo cáo |

Màu trạng thái nghiệp vụ (đạt, chờ, trượt…) chưa có token riêng. Story đầu tiên cần hiển thị trạng thái thì thêm token vào đây và vào `index.css`, kèm mức tương phản (§11). Không dùng màu thô thay thế.

## 3. Chữ

- **Font:** Geist Variable (`@fontsource-variable/geist`, có subset tiếng Việt), qua token `font-sans`. Tiêu đề dùng `font-heading` (cùng font).
- **Cỡ chữ:**

| Vai trò | Lớp | Ghi chú |
|---|---|---|
| Tiêu đề trang | `text-xl font-semibold` (`md:text-2xl`) | Một tiêu đề `h1` mỗi trang |
| Tiêu đề mục, `CardTitle` | `text-base font-medium` | |
| Chữ thường | `text-sm` | Cỡ mặc định của primitive |
| Chữ phụ | `text-sm text-muted-foreground` | Mô tả, chú thích |
| Ô nhập | `text-base md:text-sm` | 16 px trên điện thoại để iOS không tự phóng to |

- Không dùng chữ nhỏ hơn `text-xs` (12 px). `text-xs` chỉ cho nhãn phụ, không cho nội dung cần đọc.
- Số liệu cần so sánh theo cột (điểm, chỉ tiêu) dùng `tabular-nums`.

## 4. Khoảng cách và bo góc

- Thang 4 px của Tailwind.
- **Lề trang:** `p-4` trên điện thoại, `md:p-6` từ 768 px.
- **Khoảng cách:** giữa các khối trong trang `gap-6`; giữa phần tử trong một khối `gap-4`; trong nhóm nhỏ (nhãn và ô nhập, icon và chữ) `gap-2`.
- **Chiều rộng nội dung:** form đứng một mình `max-w-sm`; trang đọc `max-w-3xl`; bảng dùng hết chiều rộng.
- **Bo góc:** `--radius` = `0.625rem`. Nút, ô nhập dùng `rounded-lg`; `Card` dùng `rounded-xl` (mặc định của primitive). Không tự đặt bo góc khác.

## 5. Breakpoint và điện thoại

- **Breakpoint** (mặc định Tailwind, mobile-first): `sm` 640, `md` 768, `lg` 1024, `xl` 1280 px.
- Dưới `md` (768 px, `useIsMobile()`): thanh bên của HR/Trung tâm chuyển thành `Sheet`. Cổng sinh viên có thanh điều hướng dưới.
- **Vùng chạm ≥ 44 × 44 px trên thiết bị cảm ứng.** `Button` (cỡ `default`, `lg`, `icon`, `icon-lg`) và `Input` đã có biến thể `pointer-coarse:` cao 44 px. Mục của thanh điều hướng dưới cao 56 px. Phần tử tự viết có thể chạm thì thêm `pointer-coarse:min-h-11`.

**Checklist 360 px** (bắt buộc với mọi màn của cổng sinh viên; kiểm bằng chế độ thiết bị của trình duyệt, chọn thiết bị cảm ứng rộng 360 px):

1. Không có thanh cuộn ngang ở bất kỳ trạng thái nào (§7).
2. Không đặt chiều rộng cố định lớn hơn 328 px (360 trừ lề `p-4`). Dùng `w-full`, `max-w-*`, `min-w-0`.
3. Chuỗi dài (email, tên công ty, mã) dùng `truncate` hoặc `break-words`.
4. Bảng rộng nằm trong vùng `overflow-x-auto` riêng, hoặc chuyển thành danh sách `Card` dưới `md`.
5. Thanh điều hướng dưới không che nội dung: vùng nội dung có `pb-20`; thanh dưới có `pb-[env(safe-area-inset-bottom)]`.
6. Nút và ô nhập cao ≥ 44 px khi giả lập cảm ứng.
7. Hộp thoại trên điện thoại dùng `Sheet side="bottom"`, không dùng popup giữa màn.
8. Form một cột; nút gửi rộng hết hàng (`w-full`) dưới `sm`.

## 6. Primitive shadcn được dùng

Nền Radix, preset `radix-nova`, base color `neutral`, icon `lucide-react` (CONTEXT D26). File ở `apps/web/src/components/ui/`, được sửa trực tiếp khi cần; sửa thì ghi ở đây.

| Primitive | Dùng cho | Quy ước |
|---|---|---|
| `button` | Mọi hành động | Hành động chính `variant="default"`, phụ `outline`/`secondary`, hủy/xóa `destructive`. Đang xử lý: `<Spinner data-icon="inline-start" />` + `disabled`; không có prop `isLoading`. Icon trong nút đặt `data-icon`, không đặt lớp kích thước. **Đã sửa:** thêm `pointer-coarse:` 44 px |
| `input`, `label` | Ô nhập | Luôn nằm trong `Field`. **Đã sửa:** `pointer-coarse:h-11` |
| `field` | Mọi form | Xem §8 |
| `card` | Nhóm nội dung | Đủ bộ `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter` |
| `alert` | Lỗi, cảnh báo trong trang | Lỗi dùng `variant="destructive"` |
| `empty` | Trạng thái rỗng | Xem §7 |
| `skeleton` | Trạng thái đang tải | Xem §7 |
| `spinner` | Đang xử lý trong nút, tải cả trang | **Đã sửa:** `aria-label="Đang tải"` |
| `sonner` | Thông báo ngắn sau hành động (`toast()`) | **Đã sửa:** bỏ `next-themes`, theme sáng cố định |
| `sheet` | Hộp thoại trên điện thoại; thanh bên thu gọn | Luôn có `SheetTitle` (có thể `sr-only`) |
| `sidebar` | Khung cổng HR, Trung tâm | `SidebarProvider` + `Sidebar collapsible="icon"` + `SidebarInset` |
| `dropdown-menu` | Menu tài khoản | Mục nằm trong `DropdownMenuGroup` |
| `avatar` | Tài khoản trong menu | Luôn có `AvatarFallback` (chữ cái đầu) |
| `separator` | Ngăn cách | Không dùng `<hr>` hay `border-t` tự viết |
| `tooltip` | Nhãn của nút chỉ có icon | `TooltipProvider` đặt ở `app/providers.tsx` |

## 7. Bốn trạng thái của mọi màn

Mỗi màn (và mỗi khối tự tải dữ liệu) có đủ bốn trạng thái. Design spec của story liệt kê bảng màn × trạng thái.

| Trạng thái | Cách hiển thị |
|---|---|
| **Đang tải** | `Skeleton` cùng hình dạng với nội dung thật (dòng, thẻ, bảng). Cả trang chưa có gì để vẽ (khôi phục phiên) thì dùng `Spinner` giữa màn. Không để màn trắng |
| **Rỗng** | `Empty` gồm `EmptyHeader` (`EmptyMedia variant="icon"` + `EmptyTitle` + `EmptyDescription`), có `EmptyContent` với hành động tiếp theo nếu có |
| **Lỗi** | `Alert variant="destructive"`: tiêu đề nói chuyện gì xảy ra, mô tả nói người dùng làm gì tiếp, kèm nút "Thử lại" nếu gọi lại được. Lỗi API đổi sang chữ bằng `apiErrorMessage()` (`src/shared/api/errors.ts`), không hiện `code` hay thông điệp tiếng Anh của server |
| **Có dữ liệu** | Nội dung thật |

- Thông báo sau hành động (lưu, gửi) dùng `toast()` của sonner. Lỗi của form thì hiện trong form (§8), không chỉ trong toast.
- `401` được client tự xử lý (refresh một lần, rồi về `/login`). `403` và `404` hiện như trạng thái lỗi, không lộ bản ghi có tồn tại hay không.

## 8. Form

- React Hook Form + `zodResolver(<schema trong packages/shared/schemas>)`. API validate bằng chính schema đó (AGENTS › Nguyên tắc 14).
- Bố cục: `FieldGroup` > `Field` > `FieldLabel` + `Input` + `FieldDescription`/`FieldError`.
- **Lỗi trường:** `data-invalid` trên `Field`, `aria-invalid` trên ô nhập, câu lỗi trong `FieldError` (`role="alert"`). Hiện lỗi sau khi người dùng rời ô hoặc bấm gửi, không hiện khi đang gõ lần đầu.
- **Lỗi cả form** (lỗi từ server): `Alert variant="destructive"` ở đầu form.
- **Đang gửi:** nút gửi `disabled` và có `Spinner`; các ô nhập vẫn hiện giá trị.
- Ô nhập có `autoComplete` đúng chuẩn (`email`, `current-password`, `new-password`). Ô đầu tiên có `autoFocus` khi form là nội dung chính của trang.

## 9. Chuỗi tiếng Việt

- Mọi chuỗi giao diện bằng tiếng Việt có dấu, viết trực tiếp trong component. Thông điệp lỗi của schema dùng chung nằm trong `packages/shared/schemas`.
- **Kiểu viết hoa câu:** chỉ viết hoa chữ đầu câu và tên riêng ("Đăng nhập", "Tin tuyển dụng", không viết "Tin Tuyển Dụng").
- **Xưng hô:** trung tính, lịch sự, không xưng "bạn/tôi" trong nhãn. Câu hướng dẫn dùng câu mệnh lệnh nhẹ ("Nhập email trường cấp").
- **Nút:** động từ + tân ngữ ngắn ("Lưu nguyện vọng", "Gửi bài", "Hủy"). Không dùng "OK", "Submit".
- **Thông báo lỗi:** nói chuyện gì xảy ra và cách xử lý ("Email hoặc mật khẩu không đúng. Kiểm tra lại rồi thử lần nữa."). Không đổ lỗi, không dùng dấu chấm than, không hiện mã kỹ thuật.
- **Thuật ngữ** giữ như nghiệp vụ dùng: CV, JD, HR, GPA, nguyện vọng (NV1…), đợt thực tập, đề cử, phỏng vấn. Không dịch tên vai trò trong code (`STUDENT`…) ra giao diện; dùng "Sinh viên", "Doanh nghiệp (HR)", "Cán bộ Trung tâm", "Quản trị".
- `index.html` có `lang="vi"`.

## 10. Ngày giờ và số

- Định dạng qua `src/lib/format.ts` (date-fns, locale `vi`). Không gọi `toLocaleString` hay `format` rời rạc trong component.

| Hàm | Ví dụ |
|---|---|
| `formatDate(d)` | `08/10/2026` |
| `formatDateTime(d)` | `08/10/2026 14:05` (24 giờ) |
| `formatRelative(d)` | `3 phút trước`, `2 ngày nữa` |
| `formatNumber(n, digits)` | `3,45` (dấu phẩy thập phân), `1.200` |

- API trả thời điểm dạng ISO 8601 UTC. Giao diện hiển thị theo múi giờ của trình duyệt; người dùng ở Việt Nam là `Asia/Ho_Chi_Minh`. Hạn chót (deadline) luôn hiện cả ngày lẫn giờ.

## 11. Tương phản và trợ năng

- Mục tiêu WCAG 2.2 AA:
  - chữ thường ≥ 4.5:1, chữ lớn (≥ 18.66 px đậm hoặc ≥ 24 px) ≥ 3:1;
  - viền ô nhập, viền focus và icon mang nghĩa ≥ 3:1 so với nền.
- Các cặp token đã tính theo công thức WCAG (oklch → sRGB):

| Cặp | Tương phản | Ghi chú |
|---|---|---|
| `foreground` / trắng | 19.8:1 | |
| `primary` / trắng (và trắng trên `primary`) | 6.8:1 | |
| `muted-foreground` / trắng | 6.0:1 | Preset là `oklch(0.556 0 0)` = 4.7:1, đã làm đậm |
| `muted-foreground` / `muted` | 5.5:1 | |
| `destructive` / trắng | 4.8:1 | Không đặt chữ `destructive` trên nền `muted` (4.4:1) |
| `input` (viền ô nhập) / trắng | 3.2:1 | Preset là `oklch(0.922 0 0)` = 1.3:1, đã làm đậm |
| `border` / trắng | 1.3:1 | Chỉ để trang trí; không dùng làm ranh giới duy nhất của phần tử tương tác |

- Token mới phải ghi mức tương phản vào bảng này trước khi dùng.
- Focus luôn thấy được (`focus-visible:ring-*` của primitive). Không xóa `outline` mà không thay bằng ring.
- Nút chỉ có icon có `aria-label` hoặc `sr-only`; `Sheet` và `Dialog` luôn có tiêu đề.
- Thứ tự tab theo thứ tự đọc. Mọi thao tác dùng được bằng bàn phím.
- Không chỉ dùng màu để truyền nghĩa: trạng thái có cả chữ hoặc icon.

## 12. Khung ba cổng

Một SPA, điều hướng theo vai trò (ARCH › *Frontend*, CONTEXT D25). Hàm `portalForRole` ở `packages/shared/schemas/portal.ts` ánh xạ vai trò → cổng. Route guard ở `apps/web/src/app/guards/`.

| Cổng | Vai trò | Khung | Điều hướng |
|---|---|---|---|
| `/sv` | `STUDENT` | `StudentLayout`: header (tên hệ thống + menu tài khoản) và nội dung một cột `max-w-3xl` | Dưới `md`: thanh dưới cố định, tối đa 5 mục, icon + nhãn. Từ `md`: liên kết ngang trong header |
| `/hr` | `HR` | `PortalSidebarLayout`: `Sidebar` thu thành icon trên desktop; `SidebarInset` có header (nút thu gọn, tiêu đề trang, menu tài khoản) | Thanh bên; dưới `md` là `Sheet` |
| `/admin` | `CENTER`, `ADMIN` | Như `/hr` | Menu khác nhau theo vai trò |

- Menu của từng cổng khai trong `apps/web/src/app/navigation.ts`, mỗi mục có `roles`. Story thêm màn hình thì thêm mục ở đây và route trong `router.tsx`. Mục chưa có màn hiện trang "Sắp có" (`Empty`).
- Mở đường dẫn của cổng khác thì chuyển về cổng của mình. Chưa đăng nhập thì về `/login`, sau khi đăng nhập quay lại trang định mở nếu nó thuộc cổng của mình.
- Trang đăng nhập nằm ngoài ba cổng, là một `Card` `max-w-sm` giữa màn.
