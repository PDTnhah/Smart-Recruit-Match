import { type CellCoverage, type ExamPart, type ExamPartBlueprint, QUESTION_DIFFICULTIES, skillKey } from '@srm/shared';
import { CircleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatNumber } from '@/lib/format';
import { DIFFICULTY_LABELS, EXAM_PART_TITLES } from './labels';

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

/** A cell: its questions per exam, the drafts it has against the 3×–5× it needs (AC-11). */
function CoverageCell({ cell }: { cell: CellCoverage | undefined }) {
  if (!cell) {
    return (
      <span className="text-muted-foreground" aria-label="Không có câu">
        –
      </span>
    );
  }
  const short = cell.min - cell.drafted;
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="font-medium tabular-nums">{formatNumber(cell.needed)} câu</span>
      <span className="text-muted-foreground tabular-nums">
        <span className="sr-only">Câu nháp: có </span>
        {formatNumber(cell.drafted)}
        <span aria-hidden="true">/</span>
        <span className="sr-only">, cần </span>
        {formatNumber(cell.min)}–{formatNumber(cell.max)}
      </span>
      {short > 0 && (
        <Badge variant="outline">
          <CircleAlert data-icon="inline-start" />
          Thiếu {formatNumber(short)}
        </Badge>
      )}
    </div>
  );
}

/**
 * One part of the saved blueprint, read only (US-4.1 AC-11): a row per skill, a column per
 * difficulty, and the totals. Coverage counts the drafts of the bank (`questions`, DRAFT).
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
        <TableCaption className="text-left">
          Mỗi ô: số câu của một đề; câu nháp đã có / cần (3–5 lần số câu).
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-36">Kỹ năng</TableHead>
            {QUESTION_DIFFICULTIES.map((difficulty) => (
              <TableHead key={difficulty} className="min-w-28">
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
