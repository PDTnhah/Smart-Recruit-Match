import type { MatchVerdict } from '@srm/shared';
import { CircleCheck, CircleDashed, CircleX, type LucideIcon } from 'lucide-react';
import type { VariantProps } from 'class-variance-authority';
import { Badge, type badgeVariants } from '@/components/ui/badge';
import { VERDICT_LABELS } from './labels';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

const STYLE: Record<MatchVerdict, { variant: BadgeVariant; icon: LucideIcon }> = {
  MET: { variant: 'default', icon: CircleCheck },
  PARTIAL: { variant: 'secondary', icon: CircleDashed },
  NOT_MET: { variant: 'outline', icon: CircleX },
};

/** "Đáp ứng" / "Một phần" / "Không có bằng chứng" with an icon, so the meaning never rests on colour (DESIGN.md §11). */
export function VerdictBadge({ verdict }: { verdict: MatchVerdict }) {
  const { variant, icon: Icon } = STYLE[verdict];
  return (
    <Badge variant={variant}>
      <Icon data-icon="inline-start" aria-hidden="true" />
      {VERDICT_LABELS[verdict]}
    </Badge>
  );
}
