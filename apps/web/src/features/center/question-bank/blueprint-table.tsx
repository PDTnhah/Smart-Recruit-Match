import {
  type CellCoverage,
  type CvVerificationSettings,
  type ExamPart,
  type ExamPartBlueprint,
  QUESTION_DIFFICULTIES,
  QUESTION_REJECT_REASONS,
  skillKey,
} from '@srm/shared';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatNumber } from '@/lib/format';
import { IconBadge, type IconBadgeStyle } from '@/shared/ui/icon-badge';
import {
  COVERAGE_CAPTION,
  coverageStatusLabel,
  CV_VERIFICATION_TITLE,
  DIFFICULTY_LABELS,
  EXAM_PART_TITLES,
  REJECT_REASON_LABELS,
} from './labels';

interface SkillRow {
  skill: string;
  cells: (CellCoverage | undefined)[];
}

/** The part's cells as skill rows in blueprint order, a column per difficulty. */
function rowsOf(coverage: readonly CellCoverage[]): SkillRow[] {
  const rows = new Map<string, SkillRow>();
  for (const cell of coverage) {
    const key = skillKey(cell.skill);
    const row = rows.get(key) ?? { skill: cell.skill, cells: QUESTION_DIFFICULTIES.map(() => undefined) };
    row.cells[QUESTION_DIFFICULTIES.indexOf(cell.difficulty)] = cell;
    rows.set(key, row);
  }
  return [...rows.values()];
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** DESIGN.md §6 `badge`: a cell with enough questions, or one short of the minimum. */
const COVERAGE_STYLE: Readonly<Record<'FULL' | 'SHORT', IconBadgeStyle>> = {
  FULL: { variant: 'secondary', icon: CircleCheck },
  SHORT: { variant: 'outline', icon: CircleAlert },
};

/**
 * A cell (US-4.2 AC-10, US-4.12 AC-1): its questions per exam; the bank's VALIDATED ones next to
 * the minimum of 3× (`min` is a floor, never a total, so no fraction); Đủ or Thiếu n; the rejected
 * and still unchecked ones, and why questions were rejected.
 */
function CoverageCell({ cell }: { cell: CellCoverage | undefined }) {
  if (!cell) {
    return (
      <span className="text-muted-foreground" aria-label="Không có câu">
        –
      </span>
    );
  }
  const short = Math.max(cell.min - cell.validated, 0);
  const reasons = QUESTION_REJECT_REASONS.flatMap((reason) => {
    const count = cell.rejectReasons[reason];
    return count ? [{ reason, count }] : [];
  });
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="font-medium tabular-nums">{formatNumber(cell.needed)} câu mỗi đề</span>
      <span className="tabular-nums">
        Ngân hàng: {formatNumber(cell.validated)} câu
        <span aria-hidden="true"> · cần ≥ </span>
        <span className="sr-only">, cần tối thiểu </span>
        {formatNumber(cell.min)}
      </span>
      <IconBadge style={COVERAGE_STYLE[short > 0 ? 'SHORT' : 'FULL']}>{coverageStatusLabel(short)}</IconBadge>
      {(cell.rejected > 0 || cell.pending > 0) && (
        <span className="text-muted-foreground tabular-nums">
          {[
            cell.rejected > 0 && `Bị loại ${formatNumber(cell.rejected)}`,
            cell.pending > 0 && `Chờ kiểm ${formatNumber(cell.pending)}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )}
      {reasons.length > 0 && (
        <ul className="flex flex-col text-muted-foreground" aria-label="Lý do loại">
          {reasons.map(({ reason, count }) => (
            <li key={reason} className="tabular-nums">
              {REJECT_REASON_LABELS[reason]}: {formatNumber(count)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Part C of the saved blueprint, read only (US-4.8 AC-1). */
export function CvVerificationSummary({ settings }: { settings: CvVerificationSettings }) {
  return (
    <section className="flex flex-col gap-1" aria-labelledby="blueprint-part-C">
      <h3 id="blueprint-part-C" className="font-heading text-base font-medium">
        {CV_VERIFICATION_TITLE}
      </h3>
      <p className="text-sm text-muted-foreground">
        {settings.enabled
          ? `${formatNumber(settings.questionCount)} câu mỗi bài, hỏi về dự án, kinh nghiệm, kỹ năng sinh viên khai trong CV. Câu trả lời cho ra chỉ số tin cậy CV để tham khảo, không tính vào điểm bài test.`
          : 'Không dùng.'}
      </p>
    </section>
  );
}

/**
 * One part of the saved blueprint, read only (US-4.1 AC-11, US-4.2 AC-10): a row per skill, a
 * column per difficulty, and the totals. Coverage counts the questions the Validator passed.
 */
export function BlueprintTable({
  part,
  blueprint,
  coverage,
}: {
  part: ExamPart;
  blueprint: ExamPartBlueprint;
  coverage: readonly CellCoverage[];
}) {
  const rows = rowsOf(coverage.filter((cell) => cell.part === part));
  const columnTotals = QUESTION_DIFFICULTIES.map((_, index) => sum(rows.map((row) => row.cells[index]?.needed ?? 0)));
  const headingId = `blueprint-part-${part}`;

  return (
    <section className="flex flex-col gap-2" aria-labelledby={headingId}>
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="font-heading text-base font-medium">
          {EXAM_PART_TITLES[part]}
        </h3>
        <p className="text-sm text-muted-foreground">
          {formatNumber(blueprint.question_count)} câu mỗi đề, chiếm {formatNumber(blueprint.weight_percent)}% điểm bài test.
        </p>
      </div>
      <Table>
        <TableCaption className="text-left">{COVERAGE_CAPTION}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-36">Kỹ năng</TableHead>
            {QUESTION_DIFFICULTIES.map((difficulty) => (
              <TableHead key={difficulty} className="min-w-36">
                {DIFFICULTY_LABELS[difficulty]}
              </TableHead>
            ))}
            <TableHead className="text-right">Tổng</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.skill} className="align-top">
              <TableCell className="font-medium whitespace-normal break-words">{row.skill}</TableCell>
              {row.cells.map((cell, index) => (
                <TableCell key={QUESTION_DIFFICULTIES[index]}>
                  <CoverageCell cell={cell} />
                </TableCell>
              ))}
              <TableCell className="text-right tabular-nums">
                {formatNumber(sum(row.cells.map((cell) => cell?.needed ?? 0)))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Tổng</TableCell>
            {columnTotals.map((total, index) => (
              <TableCell key={QUESTION_DIFFICULTIES[index]} className="tabular-nums">
                {formatNumber(total)}
              </TableCell>
            ))}
            <TableCell className="text-right tabular-nums">{formatNumber(sum(columnTotals))}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </section>
  );
}
