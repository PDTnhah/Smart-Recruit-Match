import type { CampaignConfig, CampaignDeadlineKey, CampaignStatus } from '@srm/shared';
import type { badgeVariants } from '@/components/ui/badge';
import type { VariantProps } from 'class-variance-authority';

// UI wording of the campaign screens (DESIGN.md §9). Phase names follow PRD GĐ0.

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: 'Nháp',
  INTAKE: 'Mở nhận JD/CV',
  PREFERENCE_SELECTION: 'Chọn nguyện vọng',
  TESTING: 'Làm test',
  ALLOCATION_REVIEW: 'Phân bổ và HR duyệt',
  SUPPLEMENTARY: 'Vòng bổ sung',
  CLOSED: 'Đã đóng',
};

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

/** The label always carries the meaning; the variant only separates draft, running and closed. */
export const CAMPAIGN_STATUS_BADGE: Record<CampaignStatus, BadgeVariant> = {
  DRAFT: 'outline',
  INTAKE: 'default',
  PREFERENCE_SELECTION: 'default',
  TESTING: 'default',
  ALLOCATION_REVIEW: 'default',
  SUPPLEMENTARY: 'default',
  CLOSED: 'secondary',
};

export const DEADLINE_LABELS: Record<CampaignDeadlineKey, { label: string; description: string }> = {
  intake_end: {
    label: 'Hết hạn nộp JD và CV',
    description: 'Đến mốc này, đợt chuyển sang giai đoạn chọn nguyện vọng.',
  },
  preference_end: {
    label: 'Hết hạn chọn nguyện vọng',
    description: 'Đến mốc này, đợt chuyển sang giai đoạn làm test.',
  },
  testing_end: {
    label: 'Hết hạn làm bài test',
    description: 'Đến mốc này, đợt chuyển sang giai đoạn phân bổ và HR duyệt.',
  },
};

export interface ParameterField {
  key: keyof CampaignConfig;
  label: string;
  description: string;
  /** Step of the number input; decimals use 0.01, counts use 1. */
  step: number;
}

/** Campaign parameters of PRD GĐ0, in the order of its table, then the reminder lead time (US-1.7). */
export const PARAMETER_FIELDS: readonly ParameterField[] = [
  { key: 'n_nv', label: 'Số nguyện vọng tối đa (N_NV)', description: 'Mặc định 3.', step: 1 },
  {
    key: 'theta_cv',
    label: 'Ngưỡng điểm phù hợp CV (θ_cv)',
    description: 'Thang 0–100. JD có S_cv từ ngưỡng này trở lên mới vào shortlist. Mặc định 50.',
    step: 1,
  },
  {
    key: 'theta_test',
    label: 'Ngưỡng điểm test (θ_test)',
    description: 'Thang 0–100. Điểm test tối thiểu để được đề cử. Mặc định 40.',
    step: 1,
  },
  { key: 'alpha', label: 'Trọng số điểm CV (α)', description: 'Từ 0 đến 1, α + β = 1. Mặc định 0,4.', step: 0.01 },
  { key: 'beta', label: 'Trọng số điểm test (β)', description: 'Từ 0 đến 1, α + β = 1. Mặc định 0,6.', step: 0.01 },
  { key: 'k', label: 'Hệ số đề cử (k)', description: 'Từ 1 trở lên. Mặc định 1,5.', step: 0.1 },
  { key: 'r_max', label: 'Số vòng phân bổ tối đa (R_max)', description: 'Mặc định 3.', step: 1 },
  { key: 't_test_minutes', label: 'Thời gian làm bài test (phút)', description: 'Mặc định 45.', step: 1 },
  {
    key: 'sla_hr_business_days',
    label: 'Hạn HR phản hồi (ngày làm việc)',
    description: 'Mặc định 5.',
    step: 1,
  },
  {
    key: 't_offer_days',
    label: 'Hạn sinh viên xác nhận lời mời (ngày)',
    description: 'Mặc định 3.',
    step: 1,
  },
  {
    key: 'reminder_hours_before',
    label: 'Nhắc trước hạn (giờ)',
    description: 'Sinh viên chưa hoàn thành việc của giai đoạn được nhắc khi còn chừng này giờ. Từ 1 đến 168. Mặc định 24.',
    step: 1,
  },
];

/** Weights wᵢ of the five S_cv criteria, in PRD › S_cv table order (US-3.1, CONTEXT D41). */
export const SCV_WEIGHT_FIELDS: readonly ParameterField[] = [
  { key: 'scv_weight_must_have', label: 'Kỹ năng bắt buộc', description: 'Mặc định 0,4.', step: 0.01 },
  { key: 'scv_weight_nice_to_have', label: 'Kỹ năng bổ trợ', description: 'Mặc định 0,15.', step: 0.01 },
  { key: 'scv_weight_project', label: 'Dự án, kinh nghiệm liên quan', description: 'Mặc định 0,2.', step: 0.01 },
  { key: 'scv_weight_education', label: 'Học vấn (ngành, GPA)', description: 'Mặc định 0,15.', step: 0.01 },
  { key: 'scv_weight_language', label: 'Ngoại ngữ, chứng chỉ', description: 'Mặc định 0,1.', step: 0.01 },
];

/** Why a draft could not be opened, by `reasonCode` of the 422 answer (US-1.4 AC-5). */
export const OPEN_FAILURE_MESSAGES: Record<string, string> = {
  DEADLINES_MISSING: 'Đợt chưa đủ ba mốc thời gian. Thêm các mốc còn thiếu rồi mở lại.',
  DEADLINE_IN_PAST: 'Có mốc thời gian đã qua. Lùi các mốc đó về sau rồi mở lại.',
};
