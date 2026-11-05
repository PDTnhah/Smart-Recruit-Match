import type { ShortlistItem } from '@srm/shared';
import { Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { POSITION_GROUP_LABELS, WORK_MODE_LABELS } from '@/features/jds/labels';
import { CompetitionSummary, LowCompetitionBadge } from './competition-badge';
import { JdExplanationSheet } from './jd-explanation-sheet';
import { formatX100 } from './labels';

/** Missing skills named on the card; the sheet lists them all. */
const GAPS_ON_CARD = 3;

interface ShortlistCardProps {
  item: ShortlistItem;
  /** Position in the list being edited, from 1; null when not chosen. */
  rank: number | null;
  /** The list can be changed: the campaign is in preference selection, before the deadline. */
  editable: boolean;
  /** N_NV preferences are chosen already. */
  full: boolean;
  onAdd: () => void;
  onRemove: () => void;
}

/**
 * One suggested JD (US-3.3 AC-1): title, company, S_cv, the first missing skills, the competition
 * level (US-3.4 AC-4, AC-8), and choose.
 */
export function ShortlistCard({ item, rank, editable, full, onAdd, onRemove }: ShortlistCardProps) {
  const { jd } = item;
  const facts = [
    jd.positionGroup && POSITION_GROUP_LABELS[jd.positionGroup],
    jd.location,
    jd.workMode && WORK_MODE_LABELS[jd.workMode],
  ].filter((fact): fact is string => Boolean(fact));
  const gaps = item.gaps.slice(0, GAPS_ON_CARD);
  const more = item.gaps.length - gaps.length;

  const choose = !editable ? null : rank !== null ? (
    <Button variant="outline" className="w-full sm:w-auto" onClick={onRemove}>
      <X data-icon="inline-start" />
      Bỏ chọn
    </Button>
  ) : (
    <Button className="w-full sm:w-auto" onClick={onAdd} disabled={full}>
      <Plus data-icon="inline-start" />
      Chọn
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="min-w-0">
          <h3 className="break-words">{jd.title}</h3>
        </CardTitle>
        <CardDescription className="truncate" title={jd.companyName}>
          {jd.companyName}
        </CardDescription>
        <CardAction className="flex flex-col items-end">
          <span className="text-xl font-semibold tabular-nums">{formatX100(Math.round(item.sCv * 100))}</span>
          <span className="text-xs text-muted-foreground">điểm phù hợp</span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {facts.length > 0 && <p className="break-words text-muted-foreground">{facts.join(' · ')}</p>}
        <p className="break-words">
          {gaps.length > 0 ? (
            <>
              <span className="text-muted-foreground">Kỹ năng còn thiếu:</span> {gaps.map((gap) => gap.skill).join(', ')}
              {more > 0 && ` và ${more} kỹ năng khác`}
            </>
          ) : (
            <span className="text-muted-foreground">Hồ sơ đáp ứng mọi kỹ năng JD yêu cầu.</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {item.lowCompetitionSuggestion && <LowCompetitionBadge />}
          <CompetitionSummary competition={item.competition} />
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        {rank !== null && (
          <Badge className="self-start sm:mr-auto sm:self-center">NV{rank}</Badge>
        )}
        <JdExplanationSheet item={item} footer={choose} />
        {choose}
      </CardFooter>
    </Card>
  );
}
