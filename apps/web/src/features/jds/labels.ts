import type { JobDescription, JobDescriptionStatus, PositionGroup, SkillLevel, WorkMode } from '@srm/shared';
import type { VariantProps } from 'class-variance-authority';
import type { badgeVariants } from '@/components/ui/badge';

// UI wording of the JD screens (DESIGN.md §9). States follow PRD › Vòng đời trạng thái › JD.

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  ONSITE: 'Tại văn phòng',
  HYBRID: 'Kết hợp',
  REMOTE: 'Từ xa',
};

export const JD_STATUS_LABELS: Record<JobDescriptionStatus, string> = {
  DRAFT: 'Nháp',
  PENDING_HR_CONFIRMATION: 'Chờ HR xác nhận yêu cầu',
  PENDING_APPROVAL: 'Chờ Trung tâm duyệt',
  APPROVED: 'Đã duyệt',
  RECRUITING: 'Đang tuyển',
  FILLED: 'Đủ chỉ tiêu',
  CLOSED: 'Đóng',
};

/** Submitted, the JD Analyzer is running (US-2.3 AC-1, CONTEXT D28, D35). */
export const ANALYSING_LABEL = 'Đang phân tích';

/** The analysis failed (or the JD predates it): HR enters the requirements by hand (AC-6). */
export const NEEDS_MANUAL_REQUIREMENTS_LABEL = 'Chờ HR nhập yêu cầu';

/** PRD GĐ1: Cơ bản / Khá / Thành thạo. */
export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  BASIC: 'Cơ bản',
  INTERMEDIATE: 'Khá',
  ADVANCED: 'Thành thạo',
};

/** PRD GĐ1 position groups; `OTHER` stands for the "…" of the PRD list (CONTEXT D35). */
export const POSITION_GROUP_LABELS: Record<PositionGroup, string> = {
  BACKEND: 'Backend',
  FRONTEND: 'Frontend',
  MOBILE: 'Mobile',
  DATA_AI: 'Data/AI',
  TESTER_QA: 'Tester/QA',
  BA: 'BA',
  DEVOPS: 'DevOps',
  OTHER: 'Khác',
};

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

/** DESIGN.md §6: draft `outline`; waiting `secondary`; approved and recruiting `default`. */
export const JD_STATUS_BADGE: Record<JobDescriptionStatus, BadgeVariant> = {
  DRAFT: 'outline',
  PENDING_HR_CONFIRMATION: 'secondary',
  PENDING_APPROVAL: 'secondary',
  APPROVED: 'default',
  RECRUITING: 'default',
  FILLED: 'secondary',
  CLOSED: 'secondary',
};

/** Fields the status label reads. */
export type JdStatusFields = Pick<JobDescription, 'status' | 'requirementsReady' | 'analysisStatus'>;

/**
 * The label a JD shows. Awaiting HR confirmation without requirements, it says whether the JD
 * Analyzer is still running or HR has to enter them (US-2.3 AC-1, AC-6).
 */
export function jdStatusLabel(jd: JdStatusFields): string {
  if (jd.status === 'PENDING_HR_CONFIRMATION' && !jd.requirementsReady) {
    return jd.analysisStatus === 'PENDING' ? ANALYSING_LABEL : NEEDS_MANUAL_REQUIREMENTS_LABEL;
  }
  return JD_STATUS_LABELS[jd.status];
}

/** Why a JD could not be submitted or approved, by `reasonCode` of the 422 answer. */
export const JD_REASON_MESSAGES: Record<string, string> = {
  JD_NO_CONTENT: 'JD chưa có nội dung mô tả hay file gốc. Nhập mô tả hoặc tải file lên rồi nộp lại.',
  REQUIREMENTS_NOT_CONFIRMED: 'HR chưa xác nhận yêu cầu chuẩn hóa của JD này nên chưa duyệt được.',
};

/** Why requirements cannot be saved, by `reasonCode` of a 409 JD_REQUIREMENTS_NOT_EDITABLE. */
export const JD_REQUIREMENTS_REASON_MESSAGES: Record<string, string> = {
  JD_NOT_SUBMITTED: 'JD chưa được nộp nên chưa có yêu cầu để sửa.',
  REQUIREMENTS_CONFIRMED_BY_HR: 'Yêu cầu của JD đang chờ HR của doanh nghiệp xác nhận; Trung tâm chỉ xem được.',
  CAMPAIGN_NOT_IN_INTAKE: 'Đợt thực tập đã hết giai đoạn nhận JD nên không sửa yêu cầu được nữa.',
  JD_NOT_AWAITING_CONFIRMATION: 'JD không còn ở bước chờ HR xác nhận yêu cầu. Tải lại trang để xem trạng thái mới.',
  JD_AWAITING_APPROVAL: 'Yêu cầu đã được xác nhận và đang chờ Trung tâm duyệt nên không sửa được.',
  JD_CLOSED: 'JD hoặc đợt thực tập đã đóng nên không sửa yêu cầu được.',
};
