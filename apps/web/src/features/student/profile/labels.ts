import type { CvStatus } from '@srm/shared';
import type { VariantProps } from 'class-variance-authority';
import type { badgeVariants } from '@/components/ui/badge';

// UI wording of the "Hồ sơ" screen (DESIGN.md §9). CV states follow ARCHITECTURE › Luồng nộp và
// phân tích CV.

export const CV_STATUS_LABELS: Record<CvStatus, string> = {
  PENDING_ANALYSIS: 'Chờ phân tích',
  PENDING_CONFIRMATION: 'Chờ xác nhận hồ sơ',
  CONFIRMED: 'Đã xác nhận',
};

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

/** DESIGN.md §6: waiting states `secondary`, done `default`; the label carries the meaning. */
export const CV_STATUS_BADGE: Record<CvStatus, BadgeVariant> = {
  PENDING_ANALYSIS: 'secondary',
  PENDING_CONFIRMATION: 'secondary',
  CONFIRMED: 'default',
};
