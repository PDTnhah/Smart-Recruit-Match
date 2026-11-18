import { COMPETITION_LEVEL_LABELS, type CompetitionLevel, type JdCompetition } from '@srm/shared';
import { SignalHigh, SignalLow, SignalMedium, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconBadge, type IconBadgeStyle } from '@/shared/ui/icon-badge';

// Competition level of a JD (US-3.4 AC-8, DESIGN.md §6 `badge`): built-in Badge variants, always
// with the words and an icon, so the meaning never rests on colour (DESIGN.md §11).

const STYLE: Record<CompetitionLevel, IconBadgeStyle> = {
  LOW: { variant: 'outline', icon: SignalLow },
  MEDIUM: { variant: 'secondary', icon: SignalMedium },
  HIGH: { variant: 'default', icon: SignalHigh },
};

/** "Cạnh tranh: Thấp / Trung bình / Cao". */
export function CompetitionBadge({ level }: { level: CompetitionLevel }) {
  return <IconBadge style={STYLE[level]}>Cạnh tranh: {COMPETITION_LEVEL_LABELS[level]}</IconBadge>;
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
  return <IconBadge style={{ variant: 'secondary', icon: Sparkles }}>Phù hợp – ít cạnh tranh</IconBadge>;
}
