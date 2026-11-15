---
id: US-1.8
title: "Màn Hồ sơ mở đúng đợt khi sinh viên thấy nhiều đợt"
epic: EPIC-1
status: review
priority: P1
points: 3
sprint: sprint-2026-W46
version_shipped: 0.24.1
prd_ref: [FR-6]
depends_on: [US-1.6, US-2.6]
assignee: PDTnhah
commit:
created: 2026-11-15
updated: 2026-11-15
---

## Goal

Sinh viên mở "Hồ sơ" là thấy CV của mình, kể cả khi Trung tâm vừa mở thêm một đợt cho cùng khóa và ngành. Khi sinh viên đang xem một đợt chưa có CV, màn hình nói rõ CV nằm ở đợt nào, để không ai tưởng CV đã mất rồi nộp lại.

## Background

Người dùng báo lỗi ngày 2026-11-15: "cùng một tab, đăng xuất SV A, đăng nhập SV khác (hình như có nộp CV), đăng nhập lại A thì CV của A mất". Dòng thời gian dưới đây dựng từ log request của container `api` ngày 13/11. Độ dài response của `/api/auth/login` cho biết tài khoản: 343 byte là `sv001`, 341 là `sv002`, 324–326 là CENTER/ADMIN/HR.

| Giờ (UTC) | Tài khoản | Request | Ý nghĩa |
|---|---|---|---|
| 04:01:49 | sv001 (A) | `GET /api/cvs/me` (có `cv:1`), `GET /api/cvs/me/profile?campaignId=1` | A thấy CV ở đợt 1 |
| 04:02:34 | sv002 (B) | `GET /api/cvs/me` → `{"items":[]}`, `POST /api/me/consents` | B chỉ đồng ý điều khoản, **không nộp CV** |
| 04:03:04 | CENTER | `POST /api/campaigns` → 6, `POST /api/campaigns/6/open` | Đợt 6 mở, cùng khóa và ngành của A (đợt 5 mở lúc 04:01:37) |
| 04:04:35 | sv001 (A) | `GET /api/cvs/me` (vẫn có `cv:1`); **không** có `profile?campaignId=1` | Màn Hồ sơ đang hiện đợt 6, nơi A chưa có CV |
| 04:04:47 | sv001 (A) | `POST /api/me/consents` | A đồng ý điều khoản của đợt 6 |
| 04:05:27 | sv001 (A) | `POST /api/cvs` | A nộp lại CV, vào đợt 6 (`cv:2`) |
| 04:09:57 | sv001 (A) | `GET /api/cvs/me` có `cv:1` và `cv:2`; `profile?campaignId=1` → 304 | CV ở đợt 1 vẫn nguyên |

Không có dữ liệu nào mất, và không phải do SV khác. `defaultCampaign` của [cv-page.tsx](../../../apps/web/src/features/student/profile/cv-page.tsx) chọn đợt mới nhất đang nhận CV, không xét SV đã có CV ở đâu. Trung tâm mở đợt mới thì SV đã nộp CV bị đưa sang một đợt trống. Ô chọn đợt chỉ ghi tên, không cho biết đợt nào đã có CV. Backend đúng: mọi truy vấn `cvs` lọc theo `studentIdOf(user)`, và một SV được có CV ở nhiều đợt (CONTEXT D40).

Người dùng chốt thứ tự chọn đợt mới ngày 2026-11-15 ([CONTEXT D55](../../CONTEXT.md)).

**Lessons applied**: §2 sửa tay PRD, epic, sprint, không chạy `docs:sync`. Mục lục chưa có mục nào về chọn mặc định giữa nhiều đợt; mục mới ghi ở phiên 3.

## Acceptance criteria

- [x] **AC-1** — **Given** SV thấy nhiều đợt và URL không có `?campaign=` hợp lệ, **When** mở "Hồ sơ", **Then** màn chọn đợt theo thứ tự:
  1. đợt đang nhận CV (`INTAKE`, trước `intake_end`) mà SV đã có CV đang dùng;
  2. đợt đang nhận CV khác;
  3. đợt của CV đang dùng mới nhất, chưa `DRAFT`, chưa `CLOSED` (cùng quy tắc với shortlist, D47);
  4. đợt mới nhất.

  Trong bậc 1, 2 và 4, đợt mới hơn (id lớn hơn) đứng trước, bất kể thứ tự danh sách; bậc 3 theo CV mới nhất. Unit test ở `packages/shared`.
- [ ] **AC-2** — `?campaign=<id>` của một đợt SV thấy được vẫn thắng mọi bậc. Id không thuộc danh sách thì dùng AC-1.
- [ ] **AC-3** — **Given** đợt đang xem không có phiên bản CV nào của SV, **And** SV có CV đang dùng ở đợt khác, chưa `CLOSED`, mà SV thấy được, **Then** màn hiện `Alert` nêu tên đợt đã có CV, kèm nút chuyển sang đợt đó (ghi `?campaign=`). `Alert` đứng trước thẻ đồng ý điều khoản / nộp CV.
- [ ] **AC-4** — Ô chọn đợt cho biết trạng thái từng đợt: "Đã có CV" hoặc "Chưa nộp CV".
- [ ] **AC-5** — Hồi quy đúng sự cố. **Given** SV có CV đã xác nhận ở một đợt đang nhận CV, **When** CENTER mở một đợt mới cùng khóa và ngành rồi SV đăng nhập lại, **Then** "Hồ sơ" mở đợt có CV và hiện CV đó **And** trang chủ có việc "Đồng ý điều khoản và nộp CV" của đợt mới, link `?campaign=`.
- [ ] **AC-6** — Kiểm tay ở 360 / 768 / 1024 px: tên đợt dài và nhãn trạng thái xuống dòng, không tràn; `Alert` không che thẻ nộp CV.
- [ ] **AC-7** — (thêm sau review, D55) Thông báo trong app và email nêu một đợt dẫn tới `/sv/cv?campaign=<id>` của đợt đó: "Đợt thực tập đã mở" (`CAMPAIGN_OPENED`), nhắc hạn `intake_end` (`DEADLINE_REMINDER`), "Chưa phân tích được CV" (`CV_ANALYSIS_FAILED`). Nhờ vậy AC-1 không đổi đích của chúng.

## Tasks

- [x] **TASK-1.8.1** — Quy tắc thuần ở `packages/shared` (AC: 1, 2, 3)
  - [x] 1.8.1.1 — `packages/shared/schemas/student-campaign.ts`:
    - `takesCvs` chuyển từ `apps/web/src/features/student/profile/intake.ts`;
    - `campaignOfNewestActiveCv` chuyển từ `preferenceCampaignOf` của trang chủ SV;
    - `pickProfileCampaign`;
    - `campaignIdsWithActiveCv` (nhãn của AC-4) và `otherCampaignWithCv` (đợt mà `Alert` của AC-3 trỏ tới).

    Export qua `schemas/index.ts`.
  - [x] 1.8.1.2 — `schemas/__tests__/student-campaign.spec.ts`, tên test có `GĐ2`:
    - từng bậc;
    - ca sự cố;
    - đợt cũ đã qua `intake_end`;
    - CV không active bị bỏ qua;
    - danh sách rỗng.
- [x] **TASK-1.8.2** — Web (AC: 1–4)
  - [x] 1.8.2.1 — Đọc `DESIGN.md` §6, §7, §9; ghi `Design applied: …` vào *Implementation notes*.
  - [x] 1.8.2.2 — `cv-page.tsx`:
    - dùng `pickProfileCampaign`;
    - nhãn trạng thái trong `SelectItem` và trên trigger;
    - `Alert` "CV đã nộp ở đợt khác" kèm nút "Xem CV đã nộp".
  - [x] 1.8.2.3 — `student-home-page.tsx` và `intake.ts` dùng hàm từ shared; `intake.ts` chỉ còn `PROFILE_PATH`, `hasCurrentConsent`.
- [ ] **TASK-1.8.3** — Kiểm tay AC-2…AC-7 (người dùng; checklist ở *Implementation notes*).
- [x] **TASK-1.8.4** — Sửa sau `/code-review` (AC: 1, 3, 7)
  - [x] 1.8.4.1 — `pickProfileCampaign` tự xếp theo id; `otherCampaignWithCv` bỏ đợt `CLOSED`; thêm test cho hai điều này.
  - [x] 1.8.4.2 — `cv-page.tsx`: nút "Xem CV đã nộp" thêm một mục history; trang chủ dùng `campaignIdsWithActiveCv`.
  - [x] 1.8.4.3 — Link `?campaign=` trong `shared/notifications/messages.ts` và `notification/application/email-renderer.ts`; `email-outbox.int-spec.ts` kiểm query của link.

## Dev notes

### Architecture constraints

- Đổi web, `packages/shared` và link trong email (module `notification`, từ review). Không migration, không đổi route hay contract API, không thêm thư viện.
- Quy tắc chọn đợt là hàm thuần ở shared, theo tiền lệ `schemas/portal.ts`, để unit test được (web chưa có bộ test unit).
- `campaigns` là các đợt SV thấy được, thứ tự nào cũng được: id lớn hơn là đợt mới hơn, như `GET /api/campaigns` xếp (D27). `cvs` là mọi phiên bản của SV (`GET /api/cvs/me`).

### Cross-story dependencies

- Builds on [US-1.6](US-1.6-data-consent-and-cv-upload.md) (màn Hồ sơ, ô chọn đợt, `?campaign=`), [US-2.6](US-2.6-student-profile-confirmation.md) (xem và xác nhận hồ sơ trên cùng màn), [US-3.3](US-3.3-shortlist-and-preferences.md) (quy tắc đợt của CV mới nhất, D47).
- Tách khi điều tra: [US-1.9](US-1.9-cross-tab-session-consistency.md) (phiên giữa các tab), [US-2.8](US-2.8-skill-search-empty-query.md) (tìm kỹ năng với query rỗng).

### What we explicitly did NOT do

- Không chặn Trung tâm mở hai đợt cùng đối tượng: một SV được có CV ở nhiều đợt.
- Không xóa bản CV nộp trùng ở đợt 6 trên DB dev; giữ hay bỏ là việc của người dùng.

## Verification commands

Unit: `pnpm --filter @srm/shared test`. Integration: `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/(email-outbox|notification|deadline)' --selectProjects integration`. Kiểm kiểu và lint: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm depcruise`.

| AC | Test (file › case) |
|---|---|
| AC-1 | `student-campaign.spec.ts` › các ca `GĐ2` theo từng bậc, ca thứ tự danh sách |
| AC-2 | Kiểm tay (`?campaign=` hợp lệ và `?campaign=999`) |
| AC-3 | `student-campaign.spec.ts` › `otherCampaignWithCv (AC-3)`, gồm ca đợt `CLOSED`; kiểm tay |
| AC-4 | Kiểm tay |
| AC-5 | `student-campaign.spec.ts` › ca sự cố; kiểm tay |
| AC-6 | Kiểm tay |
| AC-7 | `email-outbox.int-spec.ts` › `FR-8: outbox sends email and records sent time` (link `?campaign=3`); thông báo trong app: kiểm tay |

## Changelog entry

### Fixed
- Màn "Hồ sơ" của sinh viên mở đợt có CV của mình thay vì đợt mới nhất đang nhận CV. Trước đây, khi Trung tâm mở thêm một đợt cùng khóa và ngành, CV trông như đã mất.
- Ô chọn đợt cho biết đợt nào đã có CV. Đang xem một đợt chưa có CV trong khi một đợt khác chưa đóng đã có, màn chỉ ra đợt đó, kèm nút chuyển sang.
- Thông báo trong app và email "Đợt thực tập đã mở", "Sắp hết hạn nộp CV" và "Chưa phân tích được CV" mở đúng đợt được nêu.

**Commit**:

## Implementation notes

**Phiên 1 (2026-11-15): Plan.** Điều tra bằng log request của container `api` (bảng ở *Background*). Người dùng chốt thứ tự chọn đợt và tách hai lỗi phụ thành US-1.9, US-2.8 ([CONTEXT D55](../../CONTEXT.md)). Plan (máy này): `C:\Users\PHAM TIEN BINH\.claude\plans\l-n-plan-s-a-l-i-stateless-phoenix.md`.

**Phiên 2 (2026-11-15): Execute + Self-verify.** Không đổi API, không migration, không thêm thư viện.
- Một CV chỉ hết `active` khi phiên bản mới cùng đợt thay nó (`cv.repository.ts`). Vì vậy đợt có phiên bản luôn có đúng một CV đang dùng, và nhãn, `Alert` chỉ cần xét `active`.
- `Alert` của AC-3 trỏ tới đợt mà "Hồ sơ" sẽ mở nếu chỉ xét các đợt có CV (`otherCampaignWithCv`). Câu "Chỉ nộp CV ở đây nếu muốn tham gia cả đợt này" chỉ hiện khi đợt đang xem còn nhận CV.

**Design applied:**
- DESIGN §6 `select`:
  - `SelectItem` có hai dòng: tên đợt `break-words`, và trạng thái CV `text-xs text-muted-foreground`;
  - `textValue` là tên đợt, để gõ tìm theo tên;
  - `SelectValue` nhận children: tên đợt `truncate`, theo sau là "· Đã có CV" `shrink-0`, nên tên nhường chỗ khi hẹp;
  - trigger `w-full sm:w-80`.
- §6 `alert`: `AlertAction` (tuyệt đối, chừa 72 px) chỉ hợp nút ngắn như "Thử lại". Nút "Xem CV đã nộp" đặt dưới đoạn chữ trong `AlertDescription`, `w-full sm:w-auto`. Đã ghi quy ước vào DESIGN §6.
- §9: tiêu đề trung tính "CV đã nộp ở đợt khác", thay cho "Bạn đã nộp…" trong plan, vì nhãn không xưng "bạn". Tên đợt đặt trong “…” như cổng Trung tâm, vì tên thường bắt đầu bằng "Đợt".
- §7: không thêm khối tự tải dữ liệu; bốn trạng thái của màn giữ nguyên.

Self-verify:
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm depcruise`: sạch;
- `@srm/shared` 389/389 test, 14 test mới;
- `@srm/api test:unit` 593/593.

**Phiên 3 (2026-11-15): Review + Doc/Version gate.** `/code-review` nêu 14 điểm, đã sửa 8:
- Link thông báo và email tới `/sv/cv` không có `?campaign=` nên ngầm dựa vào mặc định cũ; giờ mang id của đợt (AC-7, LESSONS §46).
- `otherCampaignWithCv` bỏ đợt `CLOSED`. Trước đó, SV chỉ có CV ở đợt đã đóng mà xem đợt đang mở thì nhận câu "Chỉ nộp CV ở đây nếu muốn tham gia cả đợt này", tức là bị khuyên đừng nộp ở đợt duy nhất còn chạy.
- `pickProfileCampaign` tự xếp theo id, không dựa vào thứ tự của caller.
- Nút "Xem CV đã nộp" thêm một mục history; ô chọn đợt vẫn `replace`.
- Trang chủ dùng `campaignIdsWithActiveCv`; sửa docstring; tên test có `GĐ4`; câu "Ba story này" của `sprints/README.md` trỏ nhầm sang ba story mới.

Không sửa:
- AGENTS › *Trạng thái*: D55 › Impact đã ghi việc sửa số story.
- `choosesPreferences` của trang chủ: có từ trước, ngoài phạm vi.
- Tính `Set` vài lần mỗi lần render: danh sách nhỏ.
- Đợt mặc định không ghim vào URL. Đợt đang xem chỉ nhảy khi SV nộp CV ở thiết bị khác lúc trang đang mở.
- `campaignOfNewestActiveCv` chỉ xét đợt SV thấy được, còn shortlist của API xét mọi CV: logic có từ US-3.3, chỉ chuyển chỗ; docstring đã ghi rõ.

Ba file của phiên 2 bị đổi sang CRLF; đã đổi lại về LF (LESSONS §47). Self-verify lại:
- typecheck, lint, build, depcruise: sạch;
- `@srm/shared` `student-campaign` 16/16;
- `@srm/api test:unit` 593/593;
- integration `email-outbox` 6/6, `notification|deadline` 16/16.

Không có route hay dữ liệu mới, nên không chạy review bảo mật riêng. Lessons: §46, §47 mới.

**Kiểm tay AC-2…AC-7** (người dùng), compose ở :8080:

  1. sv001 có CV ở một đợt đang nhận CV. CENTER tạo và mở một đợt mới, target K66 và cả hai ngành.
  2. Đăng nhập sv001: "Hồ sơ" mở đợt có CV và thấy CV. Trang chủ có việc của đợt mới.
  3. Chọn đợt mới trong ô chọn: thấy `Alert` nêu đợt cũ; nút chuyển về đúng đợt cũ; URL có `?campaign=`; Back quay lại đợt mới. Ô chọn ghi "Đã có CV" / "Chưa nộp CV".
  4. Mở `/sv/cv?campaign=<đợt mới>` từ trang chủ thì đúng đợt mới; `?campaign=999` thì về mặc định.
  5. Ở 360 / 768 / 1024 px không cuộn ngang; tên đợt dài và nhãn xuống dòng.
  6. Chuông của sv001 có "Đợt thực tập đã mở" của đợt mới: bấm vào thì mở đúng đợt mới, không phải đợt có CV.

  Xong thì `[x]` AC-2…AC-7, TASK-1.8.3.

## Files modified

- `packages/shared/schemas/`: `student-campaign.ts` (mới), `index.ts`, `__tests__/student-campaign.spec.ts` (mới)
- `apps/web/src/features/student/`: `profile/cv-page.tsx`, `profile/intake.ts`, `home/student-home-page.tsx`; `apps/web/src/shared/notifications/messages.ts`
- `apps/api`: `modules/notification/application/email-renderer.ts`, `test/integration/email-outbox.int-spec.ts`
- `VERSION`, bốn `package.json` (0.24.1)
- `DESIGN.md` §6 (`select`, `alert`); CHANGELOG, LESSONS §46–§47; sprint W46 (mới); tài liệu của phiên 1 (story, D55, PRD, EPIC-1, EPIC-2, `sprints/README.md`, AGENTS)

## Cross-references

- [PRD FR-6](../../PRD.md#functional-requirements) · [EPIC-1](../epics/EPIC-1.md) · [CONTEXT D27, D47, D55](../../CONTEXT.md)
- [US-1.6 Đồng ý xử lý dữ liệu và nộp CV](US-1.6-data-consent-and-cv-upload.md) · [US-2.6 SV xác nhận hồ sơ năng lực](US-2.6-student-profile-confirmation.md)
