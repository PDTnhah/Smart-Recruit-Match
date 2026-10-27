---
id: US-2.6
title: "SV xác nhận hồ sơ năng lực"
epic: EPIC-2
status: review
priority: P0
points: 5
sprint: sprint-2026-W44
version_shipped: 0.12.0
prd_ref: [FR-12]
depends_on: [US-2.4, US-2.5]
assignee: PDTnhah
commit:
created: 2026-10-07
updated: 2026-10-27
---

## Story refresh — 2026-10-27 (bắt đầu story)

Người dùng chốt ba điểm ([CONTEXT D40](../../CONTEXT.md)): che PII lại bằng hàm thuần TS port từ `pii.py`, lưu nháp cũng che lại; "Sửa lại" (AC-12) tạo phiên bản mới, không gọi AI; kỹ năng SV nhập ngoài danh mục vào hàng chờ duyệt sau khi xác nhận (`depends_on` thêm US-2.5). So với spec ban đầu:

- **Đã có sẵn:** `cvs.row_version`; kiểm quyền URL file (`CvService.fileOf`); view `v_ai_cv_profile_masked` đã lọc `active` + `CONFIRMED`. Không có migration.
- **API:** body có `cvId` + `rowVersion`; `GET` nhận `?campaignId=` vì SV có thể có CV ở nhiều đợt.
- **Test:** không có `profile-page.test.tsx` (D35 loại Vitest); thay bằng Jest cho schema ở `packages/shared` và kiểm tay ở 360/768/1024 px.

## Goal

Sinh viên xem file CV của mình bên cạnh hồ sơ năng lực do AI trích xuất, sửa chỗ sai và xác nhận. Chỉ hồ sơ đã xác nhận mới được đưa vào chấm phù hợp. Màn hình dùng tốt trên điện thoại. Nhờ vậy dữ liệu đầu vào của Matching (US-3.2) là dữ liệu chính SV đã kiểm, không phải đầu ra thô của LLM.

## Background

GĐ2 bước 4 (PRD), FR-12, UC-11: SV xem lại, sửa chỗ trích xuất sai và xác nhận; theo BR-01 chỉ CV hiệu lực đã được SV xác nhận mới được chấm. PRD › *Rủi ro* xem bước này là biện pháp chính chống "ảo giác" của LLM. ARCH › *Màn hình theo cổng* đặt hồ sơ cạnh file CV; form dùng chung schema `CvProfile` của [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md) (AD-6). Matching chỉ đọc `profile_masked` (BR-03), nên SV sửa `profile` thì `profile_masked` phải được tạo lại. NFR-13: dùng tốt trên điện thoại.

**Lessons applied**: §7 (kiểu cụ thể cho helper Drizzle), §8 (ghim `tabs`, `react-pdf`), §10 (lỗi Zod của form, `safeParse(undefined)`), §12 (khóa `cvs` không join), §15 + §21 (chạy test), §22 (test chỉ đọc dòng của chính nó).

## Acceptance criteria

- [ ] **AC-1** — **Given** SV có CV ở *Chờ SV xác nhận*, **When** mở màn Hồ sơ, **Then** trên màn rộng thấy file CV (xem bằng URL tạm có hạn 5 phút) cạnh form hồ sơ; trên điện thoại hai phần chuyển thành hai tab "CV" / "Hồ sơ năng lực", không cuộn ngang.
- [x] **AC-2** — **Given** form hồ sơ, **When** SV sửa học vấn, kỹ năng, dự án, kinh nghiệm, ngoại ngữ, chứng chỉ (thêm, sửa, xóa từng mục), **Then** dữ liệu được kiểm bằng Zod `CvProfile` ở cả form và API; lỗi hiển thị tiếng Việt cạnh trường sai.
- [x] **AC-3** — **Given** ô nhập kỹ năng, **When** SV gõ, **Then** ô gợi ý tên từ danh mục kỹ năng đã duyệt (US-2.5); SV vẫn nhập được tên ngoài danh mục, tên đó được đánh dấu là kỹ năng mới.
- [x] **AC-4** — **Given** SV bấm "Lưu nháp", **When** gọi API lưu, **Then** thay đổi được lưu, CV vẫn ở *Chờ SV xác nhận*, không được chấm.
- [x] **AC-5** — **Given** SV bấm "Xác nhận", **When** gọi `PUT /api/cvs/me/profile/confirm`, **Then** `profile` được lưu, `profile_masked` được tạo lại từ `profile` đã sửa (không chứa PII), CV chuyển sang *Đã xác nhận* bằng `transitionTo`, audit ghi trong cùng giao dịch (không chứa PII ở dạng rõ).
- [x] **AC-6** — **Given** `row_version` gửi lên đã cũ (VD kết quả phân tích của phiên bản mới vừa ghi đè, hoặc SV mở hai tab), **When** lưu hoặc xác nhận, **Then** trả `409 Conflict`, không ghi gì, giao diện báo và tải lại hồ sơ mới nhất.
- [x] **AC-7** — **Given** CV chưa được xác nhận (đang phân tích, *Chờ SV xác nhận*, lỗi phân tích) hoặc không còn hiệu lực, **When** truy vấn `core.v_ai_cv_profile_masked`, **Then** CV đó không có trong kết quả. Sau khi SV xác nhận, CV xuất hiện với `profile_masked` mới (BR-01).
- [x] **AC-8** — **Given** đợt đã qua hạn nộp CV (US-1.4), **When** SV lưu hoặc xác nhận, **Then** API từ chối với mã lỗi nghiệp vụ và giao diện ẩn nút tương ứng.
- [x] **AC-9** — **Given** người dùng vai trò HR, Trung tâm hoặc chưa đăng nhập, **When** gọi `GET /api/cvs/me/profile`, các API lưu/xác nhận, **Then** trả `403`/`401`. **Given** SV A, **When** xin URL tạm của file CV thuộc SV B, **Then** trả `404`, không lộ file (NFR-1).
- [ ] **AC-10** — **Given** CV đang phân tích hoặc phân tích lỗi, **When** SV mở màn Hồ sơ, **Then** thấy trạng thái "Đang phân tích CV…" (cập nhật qua SSE, tự chuyển sang form khi có kết quả) hoặc thông báo lỗi kèm nút tải lại CV.
- [ ] **AC-11** — **Given** màn Hồ sơ, **When** hiển thị, **Then** có dòng giải thích rằng thông tin cá nhân (tên, liên lạc, ảnh, ngày sinh, giới tính, quê quán, tôn giáo, tình trạng hôn nhân) đã được tách riêng và không dùng để chấm điểm (BR-03).
- [x] **AC-12** — **Given** SV đã xác nhận và đợt còn trong hạn nộp CV, **When** SV bấm "Sửa lại", **Then** hệ thống tạo phiên bản CV mới (giữ file và hồ sơ cũ, không gọi lại AI) ở *Chờ SV xác nhận*; phiên bản này chỉ được chấm sau khi SV xác nhận lại.

## Tasks

- [x] **TASK-2.6.1** — Đọc `DESIGN.md`, ghi `Design applied` (AC: 1, 10, 11)
  - [x] Subtask 2.6.1.1 — Bố cục hai cột / hai tab theo breakpoint; primitive shadcn có sẵn.
- [x] **TASK-2.6.2** — API hồ sơ trong module `student` (AC: 4, 5, 6, 8, 9, 12)
  - [x] Subtask 2.6.2.1 — `GET /api/cvs/me/profile`, `PUT /api/cvs/me/profile` (lưu nháp), `PUT …/confirm`, `POST …/reopen`; SV lấy từ JWT.
  - [x] Subtask 2.6.2.2 — Kiểm pha đợt (US-1.4), `transitionTo` + `row_version`, audit không chứa PII.
  - [x] Subtask 2.6.2.3 — Kiểm quyền URL tạm của file CV (có từ US-1.6, chỉ thêm test).
- [x] **TASK-2.6.3** — Tạo lại `profile_masked` sau khi SV sửa (AC: 5, 7)
  - [x] Subtask 2.6.3.1 — `student/domain/mask-profile.ts`: hàm thuần nhận `profile` + PII đã giải mã.
  - [x] Subtask 2.6.3.2 — Chạy bộ ca `pii-mask-cases.json` (US-2.4) trong Jest.
- [x] **TASK-2.6.6** — Kỹ năng trong hồ sơ SV sửa (AC: 3, 5; D40)
  - [x] Subtask 2.6.6.1 — `SkillCatalogService.matchKeys`; `student/domain/profile-editing.ts` chuẩn hóa lại ở backend.
  - [x] Subtask 2.6.6.2 — `NewSkillsService.proposeFromStudentProfile` sau khi commit xác nhận; tên từ `profile_masked`, bỏ tên có token che PII.
- [x] **TASK-2.6.4** — Màn Hồ sơ của SV (AC: 1, 2, 3, 4, 10, 11, 12)
  - [x] Subtask 2.6.4.1 — Xem PDF bằng react-pdf; DOCX hiện nút mở file.
  - [x] Subtask 2.6.4.2 — Form React Hook Form + Zod `CvProfile`, thêm/xóa từng mục; ô kỹ năng gợi ý từ `GET /api/skills?query=` (US-2.5).
  - [x] Subtask 2.6.4.3 — Trạng thái: đang phân tích (SSE), lỗi phân tích, chờ xác nhận, đã xác nhận (chỉ đọc + "Sửa lại"), 409, hết hạn.
- [ ] **TASK-2.6.5** — Test (AC: 1–12)
  - [x] Subtask 2.6.5.1 — Unit `mask-profile.spec.ts` (bộ ca dùng chung), `profile-editing.spec.ts`.
  - [x] Subtask 2.6.5.2 — Integration `cv-profile.int-spec.ts` (testcontainers).
  - [ ] Subtask 2.6.5.3 — Jest cho schema ở `packages/shared` (xong); kiểm tay giao diện ở 360/768/1024 px (còn).

## Dev notes

### Architecture constraints

- AD-8: chuyển trạng thái CV qua `transitionTo` + `row_version`; audit trong cùng giao dịch.
- AD-6: form, API và AI Service dùng chung `CvProfile` trong `packages/shared/contracts`.
- AD-4 và BR-03: Matching chỉ đọc `profile_masked` qua view, nên `profile_masked` được tạo lại ở Core Backend khi SV sửa (hàm thuần TS, D40).
- AD-14: shadcn/ui + Tailwind; token màu theo `DESIGN.md`.
- Ranh giới module: `student` sở hữu `cvs`; tra cứu danh mục kỹ năng gọi API/service của module sở hữu `skills` (US-2.5), không truy vấn thẳng bảng.
- Trạng thái "Đã xác nhận hồ sơ" của SV trong đợt (PRD › *Vòng đời trạng thái › Sinh viên trong đợt*) chưa có bảng riêng trong ARCH; story tạm suy ra từ trạng thái CV hiệu lực.
- "Sửa lại" sau khi đã xác nhận (AC-12): phiên bản mới, giữ file và hồ sơ, không gọi lại AI (D40).
- Story này không thêm AD mới.

### Cross-story dependencies

- Builds on [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md) (hồ sơ, `pii`, bộ ca che PII), [US-2.5](US-2.5-embeddings-skill-catalog.md) (danh mục kỹ năng, hàng chờ duyệt), [US-1.6](US-1.6-data-consent-and-cv-upload.md) (phiên bản CV, URL tạm, điều khoản), [US-1.4](US-1.4-campaign-setup-and-config.md) (pha đợt), [US-1.7](US-1.7-notifications-sse-email-reminders.md) (SSE), [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md) (DESIGN, `@Roles()`).
- Required by [US-3.2](US-3.2-batch-matching-agent.md): chỉ chấm CV đã xác nhận; embedding hồ sơ phải tính lại từ `profile_masked` đã xác nhận (D40). Required by [US-3.3](US-3.3-shortlist-and-preferences.md): shortlist cần hồ sơ đã xác nhận.

### What we explicitly did NOT do

- Không tô sáng đoạn bằng chứng trong file CV. ARCH › *Màn hình theo cổng* nhắc tới việc này nhưng bằng chứng chỉ có sau khi Matching chạy (EPIC-3).
- Không cho SV sửa thông tin cá nhân trong `pii`.
- Không hiển thị cờ chữ ẩn cho SV; cờ dành cho Trung tâm.

### References

- [Source: PRD › GĐ2 bước 4; BR-01, BR-03; FR-12, NFR-13](../../PRD.md)
- [Source: ARCHITECTURE › Màn hình theo cổng; Luồng nộp và phân tích CV; API architecture; Quản lý trạng thái](../../ARCHITECTURE.md)
- [Source: CONTEXT D4, D6, D8, D14, D40](../../CONTEXT.md)
- [Source: Epic EPIC-2](../epics/EPIC-2.md)

## Verification commands

> Integration: `pnpm --filter @srm/api exec jest --testPathPatterns 'test/integration/cv-profile' --selectProjects integration` (LESSONS §21). Unit: `pnpm --filter @srm/api test:unit`. Schema: `pnpm --filter @srm/shared test`.

| AC | Command |
|---|---|
| AC-1 | `cv-profile.int-spec.ts` › "… (AC-1)"; kiểm tay: hai cột từ 1024 px, hai tab dưới đó, PDF, DOCX |
| AC-2 | `shared/schemas/__tests__/cv.spec.ts` › "GĐ2: profile form …"; kiểm tay: thêm, sửa, xóa từng mục |
| AC-3 | `cv-profile.int-spec.ts` › "… (AC-3)"; `profile-editing.spec.ts` › "FR-13 …"; kiểm tay: gợi ý, nhãn "Kỹ năng mới" |
| AC-4 | `cv-profile.int-spec.ts` › "BR-01 lưu nháp không đổi trạng thái (AC-4)" |
| AC-5 | `cv-profile.int-spec.ts` › "… (AC-5)", "BR-03 an entry over its limit once masked …"; `mask-profile.spec.ts` › "BR-03 shared case: …" |
| AC-6 | `cv-profile.int-spec.ts` › hai ca "409 … (AC-6)"; kiểm tay: hai tab |
| AC-7 | `cv-profile.int-spec.ts` › "… (AC-7)" |
| AC-8 | `cv-profile.int-spec.ts` › "… (AC-8)" (lưu, xác nhận, sửa lại); `profile-editing.spec.ts` › "GĐ2 …" |
| AC-9 | `cv-profile.int-spec.ts` › "NFR-1 … (AC-9)" |
| AC-10, AC-11 | Kiểm tay: "Đang phân tích CV…" chuyển sang form qua SSE, lỗi phân tích; dòng giải thích BR-03 |
| AC-12 | `cv-profile.int-spec.ts` › "… (AC-12)" (kể cả 403 khi chưa đồng ý điều khoản hiện hành) |
| D40 | `cv-profile.int-spec.ts` › "FR-13 skills typed outside the catalogue … (CONTEXT D40)" |

## Changelog entry

### Added
- Màn Hồ sơ của sinh viên: xem file CV cạnh hồ sơ năng lực do AI trích xuất, sửa từng mục và xác nhận; trên điện thoại hai phần chuyển thành hai tab.
- API `GET /api/cvs/me/profile`, lưu nháp và `PUT /api/cvs/me/profile/confirm`; khi xác nhận, `profile_masked` được tạo lại từ hồ sơ đã sửa.
- Chỉ hồ sơ đã xác nhận mới có trong view dữ liệu cho bước chấm (BR-01).

**Commit**:

## Implementation notes

- Phiên 1–2 (2026-10-27): quyết định ở [CONTEXT D40](../../CONTEXT.md). `openapi.json` đổi thứ tự route vì `StudentModule` import `SkillsModule`, nội dung route cũ không đổi. `CvViewer` lazy-load: pdf.js (632 KB, worker 1,26 MB) chỉ tải khi mở màn hồ sơ.
- **Design applied**: DESIGN §1, §4 (khối rộng tới `80rem` từ `lg`), §5 (checklist 360 px còn kiểm tay), §6 (`tabs`, `ConfirmActionDialog`), §7, §8, §9, §11, §12.
- Phiên 3: `/code-review` (high) ra 10 điểm, sửa 7:
  - form gửi `rowVersion` của query mới nhất, refetch (SSE) làm mất khóa lạc quan: giữ bản lúc nạp form (LESSONS §25);
  - che PII làm chuỗi dài thêm ("Nam Định" → `[HOMETOWN]`), parse ném lỗi thành 500: giờ trả 400 đúng ô;
  - "Sửa lại" chưa kiểm điều khoản như lần tải CV: thêm 403 `CONSENT_REQUIRED` (D40);
  - `EMBEDDING` giữ theo key, lệch D40: giờ chỉ giữ khi tên và `canonical_name` y như bản đang lưu;
  - 409 vì hết hạn hoặc đã xác nhận ở nơi khác có nút tải bản mới nhất;
  - regex PII dựng một lần cho mỗi `pii`; nhãn "Kỹ năng mới" không còn nhấp nháy theo debounce.
  - Giữ nguyên: PII còn sót sau khi che vẫn là 500 (che và kiểm dùng cùng hàm tìm, nên là bất biến; Python cũng coi là lỗi); `features/student` import từ `features/center` (mẫu đã có ở 7 file); `blankToNull` và `mapStrings` khác mục đích.
- koni-qc: AC-2…AC-9, AC-12 có ca dương và âm; ca biên: 3000 ký tự, 10 ngoại ngữ, ô vượt giới hạn sau khi che, quá `intake_end` cho cả ba thao tác. Bảo mật: 401/403 mọi endpoint, IDOR (404 cho CV và URL file của SV khác), audit không chứa PII, `cvId` + `rowVersion` chặn ghi đè bản mới. Không có phát hiện mới.
- **Còn lại, cần người kiểm** (AC-1, AC-10, AC-11, phần giao diện của AC-6, AC-8): checklist 360 px, 768 và 1024 px; PDF qua nginx của compose, DOCX; gợi ý kỹ năng; 409 khi mở hai tab; đợt hết hạn; "Đang phân tích CV…" chuyển sang form qua SSE.

Lessons: §25 mới (form gửi `row_version` của query mới nhất).

## Files modified

- `packages/shared`: `contracts/cv.ts` (lỗi tiếng Việt), `schemas/cv.ts` (view, request, form schema), `schemas/errors.ts`, test.
- `apps/api/src/modules/student`: `domain/{mask-profile,profile-editing}.ts` + test, `application/cv-profile.service.ts`, `api/cv-profile.controller.ts`, DTO, repository, audit action, module. `modules/skills`: `matchKeys`, `proposeFromStudentProfile`. `common/errors`: `CvProfileNotEditableError`.
- `apps/api/test/integration/cv-profile.int-spec.ts`.
- `apps/web`: `features/student/profile/` (review, form, skill input, viewer, summary, dialog, API hook), `components/ui/tabs.tsx`, `shared/forms/server-errors.ts`, `shared/api/{errors.ts,openapi.json,schema.d.ts}`; thêm `react-pdf` 11.0.0, `pdfjs-dist` 6.3.289.
- Tài liệu: CONTEXT D40, LESSONS §25, ARCHITECTURE, DESIGN, AGENTS, CHANGELOG, VERSION.

## Cross-references

- [PRD FR-12](../../PRD.md#functional-requirements)
- [Epic EPIC-2](../epics/EPIC-2.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D8, D14](../../CONTEXT.md)
- [Story US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md)
