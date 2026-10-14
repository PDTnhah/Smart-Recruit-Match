import type { JobDescription, JobDescriptionStatus, WorkMode } from '@srm/shared';
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

/** Submitted but not analysed yet: no normalized requirements (US-1.5 AC-10, CONTEXT D28). */
export const AWAITING_ANALYSIS_LABEL = 'Chờ phân tích';

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

/** The label a JD shows: "Chờ phân tích" while it waits for the JD Analyzer. */
export function jdStatusLabel(jd: Pick<JobDescription, 'status' | 'requirementsReady'>): string {
  if (jd.status === 'PENDING_HR_CONFIRMATION' && !jd.requirementsReady) return AWAITING_ANALYSIS_LABEL;
  return JD_STATUS_LABELS[jd.status];
}

/** Why a JD could not be submitted or approved, by `reasonCode` of the 422 answer. */
export const JD_REASON_MESSAGES: Record<string, string> = {
  JD_NO_CONTENT: 'JD chưa có nội dung mô tả hay file gốc. Nhập mô tả hoặc tải file lên rồi nộp lại.',
  REQUIREMENTS_NOT_CONFIRMED: 'HR chưa xác nhận yêu cầu chuẩn hóa của JD này nên chưa duyệt được.',
};
