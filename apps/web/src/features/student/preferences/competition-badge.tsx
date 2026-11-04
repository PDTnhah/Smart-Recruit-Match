import { COMPETITION_LEVEL_LABELS, type CompetitionLevel, type JdCompetition } from '@srm/shared';
import type { VariantProps } from 'class-variance-authority';
import { type LucideIcon, SignalHigh, SignalLow, SignalMedium, Sparkles } from 'lucide-react';
import { Badge, type badgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

// Competition level of a JD (US-3.4 AC-8, DESIGN.md §6 `badge`): built-in Badge variants, always
// with the words and an icon, so the meaning never rests on colour (DESIGN.md §11).

const STYLE: Record<CompetitionLevel, { variant: BadgeVariant; icon: LucideIcon }> = {
  LOW: { variant: 'outline', icon: SignalLow },
  MEDIUM: { variant: 'secondary', icon: SignalMedium },
  HIGH: { variant: 'default', icon: SignalHigh },
};

/** "Cạnh tranh: Thấp / Trung bình / Cao". */
export function CompetitionBadge({ level }: { level: CompetitionLevel }) {
  const { variant, icon: Icon } = STYLE[level];
  return (
    <Badge variant={variant}>
      <Icon data-icon="inline-start" aria-hidden="true" />
      Cạnh tranh: {COMPETITION_LEVEL_LABELS[level]}
    </Badge>
  );
}

/** The level with the numbers it comes from: "2 nguyện vọng / 3 chỉ tiêu". */
export function CompetitionSummary({ competition, className }: { competition: JdCompetition; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <CompetitionBadge level={competition.level} />
      <span className="text-xs text-muted-foreground tabular-nums">
        {competition.nvCount} nguyện vọng / {competition.quota} chỉ tiêu
      </span>
    </div>
  );
}

/** "Phù hợp – ít cạnh tranh" (CONTEXT D48): on the shortlist, and few preferences for the quota. */
export function LowCompetitionBadge() {
  return (
    <Badge variant="secondary">
      <Sparkles data-icon="inline-start" aria-hidden="true" />
      Phù hợp – ít cạnh tranh
    </Badge>
  );
}
