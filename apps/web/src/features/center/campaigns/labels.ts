import type { CampaignConfig, CampaignDeadlineKey, CampaignStatus, NoPreferencePolicy, ScvCriterion } from '@srm/shared';
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

/** Parameters entered as numbers; the policy keys of US-3.3 are choices, not numbers. */
export type NumericConfigKey = { [K in keyof CampaignConfig]: CampaignConfig[K] extends number ? K : never }[keyof CampaignConfig];

export interface ParameterField {
  key: NumericConfigKey;
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
  {
    key: 'match_top_m',
    label: 'Số JD AI chấm cho mỗi CV (M)',
    description: 'AI chỉ chấm dự án cho M JD có điểm kỹ năng cao nhất của mỗi CV. Từ 1 đến 50. Mặc định 10.',
    step: 1,
  },
];

/** The five S_cv criteria (PRD › S_cv table); the student's explanation of a score uses the same names. */
export const SCV_CRITERION_LABELS: Record<ScvCriterion, string> = {
  must_have: 'Kỹ năng bắt buộc',
  nice_to_have: 'Kỹ năng bổ trợ',
  project: 'Dự án, kinh nghiệm liên quan',
  education: 'Học vấn (ngành, GPA)',
  language: 'Ngoại ngữ, chứng chỉ',
};

/** Weights wᵢ of the five S_cv criteria, in PRD › S_cv table order (US-3.1, CONTEXT D41). */
export const SCV_WEIGHT_FIELDS: readonly ParameterField[] = [
  { key: 'scv_weight_must_have', label: SCV_CRITERION_LABELS.must_have, description: 'Mặc định 0,4.', step: 0.01 },
  { key: 'scv_weight_nice_to_have', label: SCV_CRITERION_LABELS.nice_to_have, description: 'Mặc định 0,15.', step: 0.01 },
  { key: 'scv_weight_project', label: SCV_CRITERION_LABELS.project, description: 'Mặc định 0,2.', step: 0.01 },
  { key: 'scv_weight_education', label: SCV_CRITERION_LABELS.education, description: 'Mặc định 0,15.', step: 0.01 },
  { key: 'scv_weight_language', label: SCV_CRITERION_LABELS.language, description: 'Mặc định 0,1.', step: 0.01 },
];

/** Q6 (CONTEXT D47): what happens at `preference_end` to a student with suggestions and no saved preference. */
export const NO_PREFERENCE_POLICY_LABELS: Record<NoPreferencePolicy, string> = {
  AUTO_ASSIGN_TOP_SCV: 'Tự gán các JD có điểm phù hợp cao nhất',
  NONE: 'Không tự gán',
};

/** `require_full_preferences`, keyed by the value the Select carries. */
export const REQUIRE_FULL_PREFERENCES_LABELS: Record<'true' | 'false', string> = {
  false: 'Khuyến nghị chọn đủ N_NV',
  true: 'Bắt buộc chọn đủ N_NV',
};

/** The two choices of GĐ4 (US-3.3 AC-19), after the numbers. */
export const PREFERENCE_POLICY_FIELDS = {
  no_preference_policy: {
    label: 'Khi sinh viên không chọn nguyện vọng',
    description:
      'Đến hạn chọn nguyện vọng, sinh viên có JD được gợi ý mà chưa lưu nguyện vọng nào được xử lý theo lựa chọn này. Mặc định: tự gán tối đa N_NV JD đầu danh sách gợi ý.',
  },
  require_full_preferences: {
    label: 'Số nguyện vọng phải chọn',
    description:
      'Bắt buộc: sinh viên phải chọn đủ N_NV nguyện vọng (hoặc tất cả JD được gợi ý nếu ít hơn) mới lưu được. Mặc định: khuyến nghị.',
  },
} as const satisfies Partial<Record<keyof CampaignConfig, { label: string; description: string }>>;

/** Why a draft could not be opened, by `reasonCode` of the 422 answer (US-1.4 AC-5). */
export const OPEN_FAILURE_MESSAGES: Record<string, string> = {
  DEADLINES_MISSING: 'Đợt chưa đủ ba mốc thời gian. Thêm các mốc còn thiếu rồi mở lại.',
  DEADLINE_IN_PAST: 'Có mốc thời gian đã qua. Lùi các mốc đó về sau rồi mở lại.',
};
