import type { MatchVerdict } from '@srm/shared';
import { CircleCheck, CircleDashed, CircleX } from 'lucide-react';
import { IconBadge, type IconBadgeStyle } from '@/shared/ui/icon-badge';
import { VERDICT_LABELS } from './labels';

const STYLE: Record<MatchVerdict, IconBadgeStyle> = {
  MET: { variant: 'default', icon: CircleCheck },
  PARTIAL: { variant: 'secondary', icon: CircleDashed },
  NOT_MET: { variant: 'outline', icon: CircleX },
};

/** "Đáp ứng" / "Một phần" / "Không có bằng chứng" with an icon, so the meaning never rests on colour (DESIGN.md §11). */
export function VerdictBadge({ verdict }: { verdict: MatchVerdict }) {
  return <IconBadge style={STYLE[verdict]}>{VERDICT_LABELS[verdict]}</IconBadge>;
}
