import type { InterviewStatus, OfferStatus } from '@srm/shared';
import { CalendarCheck, CalendarClock, CalendarX, CircleCheck, CircleMinus, CircleX, Clock, Hourglass } from 'lucide-react';
import type { IconBadgeStyle } from '@/shared/ui/icon-badge';

// DESIGN.md §6 › badge: GĐ9 states, always with words and an icon (US-5.4). What asks HR to act
// (the student asked for another time) is the outlined one.
export const INTERVIEW_STATUS_STYLE: Record<InterviewStatus, IconBadgeStyle> = {
  SCHEDULED: { variant: 'secondary', icon: CalendarClock },
  CONFIRMED: { variant: 'default', icon: CalendarCheck },
  RESCHEDULE_REQUESTED: { variant: 'outline', icon: CalendarX },
  DONE: { variant: 'secondary', icon: CircleCheck },
};

export const OFFER_STATUS_STYLE: Record<OfferStatus, IconBadgeStyle> = {
  PENDING: { variant: 'outline', icon: Hourglass },
  ACCEPTED: { variant: 'default', icon: CircleCheck },
  DECLINED: { variant: 'secondary', icon: CircleX },
  EXPIRED: { variant: 'secondary', icon: CircleMinus },
};

/** An interview not scheduled yet. */
export const NOT_SCHEDULED_STYLE: IconBadgeStyle = { variant: 'outline', icon: Clock };
