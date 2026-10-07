---
id: US-2.6
title: "SV xác nhận hồ sơ năng lực"
epic: EPIC-2
status: backlog
priority: P0
points: 5
sprint:
version_shipped:
prd_ref: [FR-12]
depends_on: [US-2.4]
assignee:
commit:
created: 2026-10-07
updated: 2026-10-07
---

## Goal

Sinh viên xem file CV của mình bên cạnh hồ sơ năng lực do AI trích xuất, sửa chỗ sai và xác nhận. Chỉ hồ sơ đã xác nhận mới được đưa vào chấm phù hợp. Màn hình dùng tốt trên điện thoại. Nhờ vậy dữ liệu đầu vào của Matching (US-3.2) là dữ liệu chính SV đã kiểm, không phải đầu ra thô của LLM.

## Background

GĐ2 bước 4 (PRD): SV xem lại, sửa chỗ trích xuất sai và **xác nhận**; chỉ hồ sơ đã xác nhận mới được chấm. FR-12 và UC-11 mô tả việc này; BR-01 quy định mỗi SV tối đa 1 CV hiệu lực trong một đợt và chỉ CV đã được SV xác nhận mới được chấm. PRD › *Rủi ro* xem việc SV/HR xác nhận dữ liệu trích xuất là một biện pháp chính chống "ảo giác" của LLM.

ARCH › *Màn hình theo cổng* mô tả màn Hồ sơ của cổng Sinh viên: xem/sửa hồ sơ năng lực, hiển thị song song với file CV. ARCH › *Luồng nộp và phân tích CV* kết thúc bằng `PUT /api/cvs/me/profile/confirm`. Giao diện dựng bằng shadcn/ui, form bằng React Hook Form + Zod với cùng schema `CvProfile` mà [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md) định nghĩa trong `packages/shared/contracts`. NFR-13 yêu cầu phần sinh viên dùng tốt trên điện thoại; AGENTS › *Ngôn ngữ* yêu cầu chuỗi giao diện tiếng Việt.

SV sửa `profile` thì `profile_masked` phải được tạo lại, vì Matching chỉ đọc `profile_masked` (BR-03). Chuyển trạng thái CV sang *Đã xác nhận* đi qua `transitionTo` (AD-8, US-1.2).

**Lessons applied**: none — LESSONS.md mới có §1 (Claude Code chỉ nạp skill từ `.claude/skills`), không liên quan nội dung story này; đọc lại khi bắt đầu story.

## Acceptance criteria

- [ ] **AC-1** — **Given** SV có CV ở *Chờ SV xác nhận*, **When** mở màn Hồ sơ, **Then** trên màn rộng thấy file CV (xem bằng URL tạm có hạn 5 phút) cạnh form hồ sơ; trên điện thoại hai phần chuyển thành hai tab "CV" / "Hồ sơ năng lực", không cuộn ngang.
- [ ] **AC-2** — **Given** form hồ sơ, **When** SV sửa học vấn, kỹ năng, dự án, kinh nghiệm, ngoại ngữ, chứng chỉ (thêm, sửa, xóa từng mục), **Then** dữ liệu được kiểm bằng Zod `CvProfile` ở cả form và API; lỗi hiển thị tiếng Việt cạnh trường sai.
- [ ] **AC-3** — **Given** ô nhập kỹ năng, **When** SV gõ, **Then** ô gợi ý tên từ danh mục kỹ năng đã duyệt (US-2.5); SV vẫn nhập được tên ngoài danh mục, tên đó được đánh dấu là kỹ năng mới.
- [ ] **AC-4** — **Given** SV bấm "Lưu nháp", **When** gọi API lưu, **Then** thay đổi được lưu, CV vẫn ở *Chờ SV xác nhận*, không được chấm.
- [ ] **AC-5** — **Given** SV bấm "Xác nhận", **When** gọi `PUT /api/cvs/me/profile/confirm`, **Then** `profile` được lưu, `profile_masked` được tạo lại từ `profile` đã sửa (không chứa PII), CV chuyển sang *Đã xác nhận* bằng `transitionTo`, audit ghi trong cùng giao dịch (không chứa PII ở dạng rõ).
- [ ] **AC-6** — **Given** `row_version` gửi lên đã cũ (VD kết quả phân tích của phiên bản mới vừa ghi đè, hoặc SV mở hai tab), **When** lưu hoặc xác nhận, **Then** trả `409 Conflict`, không ghi gì, giao diện báo và tải lại hồ sơ mới nhất.
- [ ] **AC-7** — **Given** CV chưa được xác nhận (đang phân tích, *Chờ SV xác nhận*, lỗi phân tích) hoặc không còn hiệu lực, **When** truy vấn `core.v_ai_cv_profile_masked`, **Then** CV đó không có trong kết quả. Sau khi SV xác nhận, CV xuất hiện với `profile_masked` mới (BR-01).
- [ ] **AC-8** — **Given** đợt đã qua hạn nộp CV (US-1.4), **When** SV lưu hoặc xác nhận, **Then** API từ chối với mã lỗi nghiệp vụ và giao diện ẩn nút tương ứng.
- [ ] **AC-9** — **Given** người dùng vai trò HR, Trung tâm hoặc chưa đăng nhập, **When** gọi `GET /api/cvs/me/profile`, các API lưu/xác nhận, **Then** trả `403`/`401`. **Given** SV A, **When** xin URL tạm của file CV thuộc SV B, **Then** trả `404`, không lộ file (NFR-1).
- [ ] **AC-10** — **Given** CV đang phân tích hoặc phân tích lỗi, **When** SV mở màn Hồ sơ, **Then** thấy trạng thái "Đang phân tích CV…" (cập nhật qua SSE, tự chuyển sang form khi có kết quả) hoặc thông báo lỗi kèm nút tải lại CV.
- [ ] **AC-11** — **Given** màn Hồ sơ, **When** hiển thị, **Then** có dòng giải thích rằng thông tin cá nhân (tên, liên lạc, ảnh, ngày sinh, giới tính, quê quán, tôn giáo, tình trạng hôn nhân) đã được tách riêng và không dùng để chấm điểm (BR-03).
- [ ] **AC-12** — **Given** SV đã xác nhận và đợt còn trong hạn nộp CV, **When** SV bấm "Sửa lại", **Then** hệ thống tạo phiên bản CV mới (giữ file và hồ sơ cũ, không gọi lại AI) ở *Chờ SV xác nhận*; phiên bản này chỉ được chấm sau khi SV xác nhận lại.

## Tasks

- [ ] **TASK-2.6.1** — Đọc `DESIGN.md` trước khi code giao diện; ghi `Design applied: …` vào story (AC: 1, 10, 11)
  - [ ] Subtask 2.6.1.1 — Kiểm bố cục hai cột / hai tab theo breakpoint trong `DESIGN.md`; dùng component shadcn có sẵn (Tabs, Form, Card…) theo skill shadcn.
- [ ] **TASK-2.6.2** — API hồ sơ trong module `student` (AC: 4, 5, 6, 8, 9, 12)
  - [ ] Subtask 2.6.2.1 — `apps/api/src/modules/student/api/`: `GET /api/cvs/me/profile`, `PUT /api/cvs/me/profile` (tên đề xuất, lưu nháp), `PUT /api/cvs/me/profile/confirm` (ARCH › *API architecture*), `POST /api/cvs/me/profile/reopen` (tên đề xuất, cho AC-12). SV lấy từ JWT, không nhận `student_id` từ client.
  - [ ] Subtask 2.6.2.2 — `apps/api/src/modules/student/application/`: kiểm pha đợt (US-1.4), `transitionTo` + `row_version`, audit không chứa PII.
  - [ ] Subtask 2.6.2.3 — Kiểm quyền sở hữu khi cấp URL tạm `GET /api/files/{id}/url` cho file CV (US-1.6).
- [ ] **TASK-2.6.3** — Tạo lại `profile_masked` sau khi SV sửa (AC: 5, 7)
  - [ ] Subtask 2.6.3.1 — `apps/api/src/modules/student/domain/mask-profile.ts`: hàm thuần nhận `profile` + PII đã giải mã, trả `profile_masked`.
  - [ ] Subtask 2.6.3.2 — Chạy cùng bộ ca `packages/shared/contracts/fixtures/pii-mask-cases.json` (US-2.4) trong Jest để hai phía TS và Python che PII giống nhau.
- [ ] **TASK-2.6.4** — Màn Hồ sơ của SV (AC: 1, 2, 3, 4, 10, 11, 12)
  - [ ] Subtask 2.6.4.1 — `apps/web/src/features/student/profile/`: xem file PDF bằng react-pdf; với DOCX hiện nút tải file (react-pdf không hiển thị DOCX — đề xuất).
  - [ ] Subtask 2.6.4.2 — Form React Hook Form + Zod `CvProfile` với danh sách mục thêm/xóa được; ô kỹ năng gợi ý từ `GET /api/skills?query=` (US-2.5).
  - [ ] Subtask 2.6.4.3 — Trạng thái: đang phân tích (SSE), lỗi phân tích, chờ xác nhận, đã xác nhận (chỉ đọc + "Sửa lại"), xung đột `409`, hết hạn.
- [ ] **TASK-2.6.5** — Test (AC: 1–12)
  - [ ] Subtask 2.6.5.1 — `apps/api/src/modules/student/domain/mask-profile.spec.ts` (unit, bộ ca dùng chung).
  - [ ] Subtask 2.6.5.2 — `apps/api/test/student/profile-confirmation.int-spec.ts` (Supertest + testcontainers: xác nhận, 409, hết hạn, IDOR, view BR-01, sửa lại).
  - [ ] Subtask 2.6.5.3 — `apps/web/src/features/student/profile/__tests__/profile-page.test.tsx` (form, trạng thái, bố cục điện thoại).

## Dev notes

### Architecture constraints

- AD-8: chuyển trạng thái CV qua `transitionTo` + `row_version`; audit trong cùng giao dịch. ARCH › *Các bảng chính* chưa ghi `row_version` cho `cvs`; story giả định US-1.2/US-1.6 đã thêm cột này như mọi bảng có vòng đời (ARCH › *Quản lý trạng thái*).
- AD-6: form, API và AI Service dùng chung `CvProfile` trong `packages/shared/contracts`.
- AD-4 và BR-03: Matching chỉ đọc `profile_masked` qua view; vì vậy `profile_masked` phải được tạo lại ở Core Backend khi SV xác nhận. ARCH đặt việc che PII ở `ai-service/app/parsing/`, không nói gì về lúc SV sửa. Story tạm dùng hàm thuần TS kèm bộ ca kiểm thử dùng chung với phía Python (đã nêu là điểm mơ hồ; phương án khác là gửi một job che PII sang AI Service).
- AD-14: shadcn/ui + Tailwind; token màu theo `DESIGN.md`.
- Ranh giới module: `student` sở hữu `cvs`; tra cứu danh mục kỹ năng gọi API/service của module sở hữu `skills` (US-2.5), không truy vấn thẳng bảng.
- Trạng thái "Đã xác nhận hồ sơ" của SV trong đợt (PRD › *Vòng đời trạng thái › Sinh viên trong đợt*) chưa có bảng riêng trong ARCH; story tạm suy ra từ trạng thái CV hiệu lực.
- "Sửa lại" sau khi đã xác nhận (AC-12): spec chỉ nói SV cập nhật CV trước hạn thì tạo phiên bản mới. Cách "tạo phiên bản mới, giữ file và hồ sơ cũ, không gọi lại AI" là đề xuất; hỏi trước khi chốt.
- Story này không thêm AD mới.

### Cross-story dependencies

- Builds on [US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md) — `cvs.profile`, `cvs.pii`, `profile_masked`, hợp đồng `CvProfile`, bộ ca che PII, trạng thái *Chờ SV xác nhận*.
- Builds on [US-1.6](US-1.6-data-consent-and-cv-upload.md) — `cvs` có phiên bản, URL tạm của file, luồng tải lại CV.
- Builds on [US-1.3](US-1.3-auth-rbac-design-system-app-shell.md) — `DESIGN.md`, khung cổng SV, guard `@Roles()`.
- Builds on [US-1.4](US-1.4-campaign-setup-and-config.md) — kiểm pha đợt (hạn nộp CV).
- Builds on [US-1.7](US-1.7-notifications-sse-email-reminders.md) — SSE báo hồ sơ sẵn sàng.
- Sibling [US-2.5](US-2.5-embeddings-skill-catalog.md) — cùng tuần T6; ô gợi ý kỹ năng dùng `GET /api/skills?query=`. `depends_on` không ghi US-2.5, nên nếu US-2.5 chưa merge thì ô kỹ năng tạm là ô nhập tự do và nối gợi ý sau.
- Required by [US-3.2](US-3.2-batch-matching-agent.md) — chỉ chấm CV đã xác nhận, đọc `profile_masked` qua view.
- Required by [US-3.3](US-3.3-shortlist-and-preferences.md) — SV phải có hồ sơ đã xác nhận mới có shortlist.

### What we explicitly did NOT do

- Không tô sáng đoạn bằng chứng trong file CV. ARCH › *Màn hình theo cổng* nhắc tới việc này nhưng bằng chứng chỉ có sau khi Matching chạy (EPIC-3).
- Không cho SV sửa thông tin cá nhân trong `pii`.
- Không hiển thị cờ chữ ẩn cho SV; cờ dành cho Trung tâm.

### References

- [Source: PRD › GĐ2 – Sinh viên nộp CV (bước 4)](../../PRD.md)
- [Source: PRD › Quy tắc nghiệp vụ (BR-01, BR-03)](../../PRD.md)
- [Source: PRD › Vòng đời trạng thái › Sinh viên trong đợt](../../PRD.md)
- [Source: PRD › Functional Requirements (FR-12); Non-Functional Requirements (NFR-13)](../../PRD.md#functional-requirements)
- [Source: ARCHITECTURE › Màn hình theo cổng; Luồng nộp và phân tích CV](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › API architecture; Security architecture](../../ARCHITECTURE.md)
- [Source: ARCHITECTURE › Quản lý trạng thái](../../ARCHITECTURE.md)
- [Source: CONTEXT D4, D6, D8, D14](../../CONTEXT.md)
- [Source: Epic EPIC-2](../epics/EPIC-2.md)

## Verification commands

> Lệnh chạy cụ thể (`pnpm …`) sẽ điền khi US-1.1 tạo script (AGENTS › Lệnh). Bảng dưới ghi file test và tên case.

| AC | Command |
|---|---|
| AC-1 | `apps/web/src/features/student/profile/__tests__/profile-page.test.tsx` › "GĐ2 màn rộng hai cột, điện thoại hai tab" |
| AC-2 | `apps/web/src/features/student/profile/__tests__/profile-page.test.tsx` › "GĐ2 sửa từng mục, lỗi Zod tiếng Việt" |
| AC-3 | `apps/web/src/features/student/profile/__tests__/profile-page.test.tsx` › "FR-13 gợi ý kỹ năng từ danh mục, nhập tên mới được" |
| AC-4 | `apps/api/test/student/profile-confirmation.int-spec.ts` › "BR-01 lưu nháp không đổi trạng thái" |
| AC-5 | `apps/api/test/student/profile-confirmation.int-spec.ts` › "BR-01 xác nhận tạo lại profile_masked, chuyển Đã xác nhận, audit không có PII" |
| AC-6 | `apps/api/test/student/profile-confirmation.int-spec.ts` › "409 khi row_version cũ" |
| AC-7 | `apps/api/test/student/profile-confirmation.int-spec.ts` › "BR-01 CV chưa xác nhận không có trong v_ai_cv_profile_masked" |
| AC-8 | `apps/api/test/student/profile-confirmation.int-spec.ts` › "GĐ2 quá hạn nộp CV không xác nhận được" |
| AC-9 | `apps/api/test/student/profile-confirmation.int-spec.ts` › "NFR-1 vai trò khác 403; URL file của SV khác 404" |
| AC-10 | `apps/web/src/features/student/profile/__tests__/profile-page.test.tsx` › "GĐ2 trạng thái đang phân tích và lỗi phân tích" |
| AC-11 | `apps/web/src/features/student/profile/__tests__/profile-page.test.tsx` › "BR-03 hiện dòng giải thích thông tin cá nhân không dùng để chấm" |
| AC-12 | `apps/api/test/student/profile-confirmation.int-spec.ts` › "BR-01 sửa lại tạo phiên bản mới ở Chờ SV xác nhận, không gọi AI" |

## Changelog entry

### Added
- Màn Hồ sơ của sinh viên: xem file CV cạnh hồ sơ năng lực do AI trích xuất, sửa từng mục và xác nhận; trên điện thoại hai phần chuyển thành hai tab.
- API `GET /api/cvs/me/profile`, lưu nháp và `PUT /api/cvs/me/profile/confirm`; khi xác nhận, `profile_masked` được tạo lại từ hồ sơ đã sửa.
- Chỉ hồ sơ đã xác nhận mới có trong view dữ liệu cho bước chấm (BR-01).

**Commit**:

## Implementation notes

_Chưa bắt đầu._

## Files modified

_Chưa bắt đầu._

## Cross-references

- [PRD FR-12](../../PRD.md#functional-requirements)
- [Epic EPIC-2](../epics/EPIC-2.md)
- [CHANGELOG](../../CHANGELOG.md)
- [CONTEXT D8, D14](../../CONTEXT.md)
- [Story US-2.4](US-2.4-cv-parser-hidden-text-pii-split.md)
