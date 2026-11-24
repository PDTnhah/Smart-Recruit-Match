import type { NominationStatus, SupplementBlock } from '@srm/shared';
import { CalendarCheck, CircleCheck, CircleMinus, CircleX, Clock, UserCheck } from 'lucide-react';
import type { IconBadgeStyle } from '@/shared/ui/icon-badge';

// DESIGN.md §6 › badge: a nomination's state for HR, always with words and an icon. Waiting for HR
// is the one that asks for action, so it is the outlined one that stands out in the table.
export const NOMINATION_STATUS_STYLE: Record<NominationStatus, IconBadgeStyle> = {
  NOMINATED: { variant: 'outline', icon: Clock },
  INTERVIEW: { variant: 'default', icon: CalendarCheck },
  HR_REJECTED: { variant: 'secondary', icon: CircleX },
  PASSED: { variant: 'default', icon: CircleCheck },
  RESERVE: { variant: 'secondary', icon: UserCheck },
  INTERVIEW_FAILED: { variant: 'secondary', icon: CircleX },
  ACCEPTED: { variant: 'default', icon: CircleCheck },
  DECLINED: { variant: 'secondary', icon: CircleMinus },
  CLOSED: { variant: 'secondary', icon: CircleMinus },
};

/** HR's own words for NOMINATED: the student is waiting for HR. */
export const HR_STATUS_LABELS: Partial<Record<NominationStatus, string>> = {
  NOMINATED: 'Chờ HR duyệt',
};

/** Why "Yêu cầu bổ sung hồ sơ" is off (AC-9), shown above the button (DESIGN.md §6 › alert-dialog). */
export const SUPPLEMENT_BLOCK_TEXT: Record<SupplementBlock, string> = {
  // Before the first round and after the campaign closed alike.
  PHASE_CLOSED: 'Chỉ gửi được khi đợt thực tập đang ở giai đoạn HR duyệt đề cử.',
  NO_PUBLISHED_ROUND: 'Chưa có vòng phân bổ nào được công bố.',
  QUOTA_REACHED: 'Số sinh viên được mời phỏng vấn đã đủ chỉ tiêu.',
  ALREADY_REQUESTED: 'Đã gửi yêu cầu bổ sung hồ sơ ở vòng này.',
};
