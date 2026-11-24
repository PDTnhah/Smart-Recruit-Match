import {
  type ExamBlueprint,
  MANUAL_QUESTION_IMPORT_MAX_ROWS,
  type ManualQuestionInput,
  ManualQuestionInputSchema,
  type ManualQuestionIssue,
  type ManualQuestionIssueCode,
  OPTION_LETTERS,
  QUESTION_BANK_FACTORS,
  QUESTION_BANK_MAX_DRAFTS,
  QUESTION_DIFFICULTIES,
  QUESTION_IMPORT_COLUMNS,
  QUESTION_IMPORT_DIFFICULTY_LABELS,
  QUESTION_IMPORT_TYPE_LABELS,
  QUESTION_TYPES,
  type QuestionDifficulty,
  type QuestionImportFileError,
  type QuestionImportIssue,
  type QuestionImportRow,
  type QuestionStatus,
  type QuestionType,
  RUBRIC_MAX_CRITERIA,
  rubricImportColumns,
} from '@srm/shared';
import { type BlueprintCellRef, cellKeyOf, cellsOf } from './blueprint.js';
import { type ManualStoredQuestion, toManualStoredQuestion } from './stored-question.js';

// Questions CENTER and HR add by hand or from a file (FR-42, US-4.13, CONTEXT D62). Pure: no
// NestJS, no Drizzle. The rules are those `submit_questions()` applies to the Test Generator's
// drafts (ai-service app/agents/test_generator/tools.py), in the same order.

/**
 * Key of a stem for exact duplicates, as `stem_key` of ai.question_drafts: NFKC, lower case,
 * whitespace collapsed (unhashed: compared in memory only).
 */
export const stemKey = (stem: string): string => stem.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean).join(' ');

/** A question of the bank as the rules see it: its cell, its status and its stem. */
export interface ExistingQuestion {
  type: QuestionType;
  skill: string;
  difficulty: QuestionDifficulty;
  status: QuestionStatus;
  stem: string;
}

export interface ManualQuestionPlan {
  /** Every rule broken, by position in `questions`; empty when all of them may be saved. */
  issues: ManualQuestionIssue[];
  /** One row per question that passed, in order; the skill as the blueprint cell writes it. */
  rows: { index: number; row: ManualStoredQuestion }[];
}

const DIFFICULTY_NAMES = QUESTION_IMPORT_DIFFICULTY_LABELS;

/**
 * AC-2: checks each question in order against the blueprint and the questions the bank holds, as
 * `submit_questions()` screens a batch: UNKNOWN_CELL, then BANK_FULL, CELL_FULL (questions not
 * REJECTED; `QUESTION_BANK_FACTORS.max` × the cell's count) and DUPLICATE (any question of the
 * bank, or one before it). A question that passes takes its room at once, so the later ones of
 * the same save see it. `label` names an earlier question in a DUPLICATE message ("dòng 4").
 */
export function planManualQuestions(
  questions: readonly ManualQuestionInput[],
  bank: { blueprint: ExamBlueprint; existing: readonly ExistingQuestion[] },
  label: (index: number) => string = (index) => `câu ${index + 1}`,
): ManualQuestionPlan {
  const cells = new Map<string, BlueprintCellRef>(
    cellsOf(bank.blueprint).map((cell) => [cellKeyOf(cell.type, cell.skill, cell.difficulty), cell]),
  );
  const kept = new Map<string, number>();
  for (const question of bank.existing) {
    if (question.status === 'REJECTED') continue;
    const key = cellKeyOf(question.type, question.skill, question.difficulty);
    kept.set(key, (kept.get(key) ?? 0) + 1);
  }
  const stems = new Set(bank.existing.map((question) => stemKey(question.stem)));
  const batch = new Map<string, number>();
  let total = bank.existing.length;

  const issues: ManualQuestionIssue[] = [];
  const rows: ManualQuestionPlan['rows'] = [];
  const refuse = (index: number, field: string | null, code: ManualQuestionIssueCode, message: string) =>
    issues.push({ index, field, code, message });

  questions.forEach((question, index) => {
    const key = cellKeyOf(question.type, question.skill, question.difficulty);
    const cell = cells.get(key);
    const stem = stemKey(question.stem);
    const earlier = batch.get(stem);
    if (!cell) {
      refuse(
        index,
        'skill',
        'UNKNOWN_CELL',
        `Ma trận đề không có ô ${QUESTION_IMPORT_TYPE_LABELS[question.type]} – ${question.skill} – ${DIFFICULTY_NAMES[question.difficulty]}`,
      );
    } else if (total >= QUESTION_BANK_MAX_DRAFTS) {
      refuse(index, null, 'BANK_FULL', `Ngân hàng đã có ${QUESTION_BANK_MAX_DRAFTS} câu`);
    } else if ((kept.get(key) ?? 0) >= cell.count * QUESTION_BANK_FACTORS.max) {
      refuse(
        index,
        'skill',
        'CELL_FULL',
        `Ô ${cell.skill} – ${DIFFICULTY_NAMES[cell.difficulty]} đã đủ ${cell.count * QUESTION_BANK_FACTORS.max} câu`,
      );
    } else if (stems.has(stem)) {
      refuse(index, 'stem', 'DUPLICATE', 'Trùng đề với một câu đã có trong ngân hàng');
    } else if (earlier !== undefined) {
      refuse(index, 'stem', 'DUPLICATE', `Trùng đề với ${label(earlier)}`);
    } else {
      kept.set(key, (kept.get(key) ?? 0) + 1);
      batch.set(stem, index);
      total += 1;
      rows.push({ index, row: toManualStoredQuestion(question, cell.skill) });
    }
  });
  return { issues, rows };
}

// The import file (AC-3, AC-4).

/** One cell of the sheet: its text, or a formula, which is never computed. */
export interface ImportCell {
  text: string;
  formula: boolean;
}

/** A row of the sheet: its number in the sheet (1 holds the headers) and its cells, column A first. */
export interface ImportRow {
  row: number;
  cells: readonly ImportCell[];
}

/** Whether a row holds anything: text, or a formula (reported, never read). */
export function hasImportContent(cells: readonly ImportCell[]): boolean {
  return cells.some((cell) => cell.formula || cell.text.trim() !== '');
}

export type ImportSheetResult =
  | { ok: true; rows: QuestionImportRow[] }
  | { ok: false; error: QuestionImportFileError; columns?: string[] };

/** Header of the column a field path of the question is read from; null for the question as a whole. */
export type ColumnOf = (field: string | null) => string | null;

const normalise = (text: string) => text.normalize('NFC').toLowerCase().split(/\s+/).filter(Boolean).join(' ');

/** Cell values a column accepts: the template's label or the enum code, any case. */
const TYPE_VALUES = new Map<string, QuestionType>(
  QUESTION_TYPES.flatMap((type) => [
    [normalise(QUESTION_IMPORT_TYPE_LABELS[type]), type],
    [normalise(type), type],
  ]),
);
const DIFFICULTY_VALUES = new Map<string, QuestionDifficulty>(
  QUESTION_DIFFICULTIES.flatMap((difficulty) => [
    [normalise(QUESTION_IMPORT_DIFFICULTY_LABELS[difficulty]), difficulty],
    [normalise(difficulty), difficulty],
  ]),
);

const C = QUESTION_IMPORT_COLUMNS;

/** Headers a file must have: every field of both types and the first rubric criterion. */
const REQUIRED_HEADERS = [
  C.type,
  C.skill,
  C.difficulty,
  C.stem,
  ...C.options,
  C.correctOption,
  C.explanation,
  C.sampleAnswer,
  ...Object.values(rubricImportColumns(1)),
];

const EMPTY: ImportCell = { text: '', formula: false };

/**
 * AC-4: the rows of the sheet as questions, with what is wrong in each by template column. Row 1
 * holds the headers, matched to the template's by text (any case and spacing, any
 * order); criteria 2 to 10 may be left out in pairs. Empty rows are skipped. A formula is reported
 * and its value never read. A row whose fields break `ManualQuestionInputSchema` has no question.
 * The rules of the bank are not checked here: see `planManualQuestions`.
 */
export function readImportSheet(sheet: readonly ImportRow[]): ImportSheetResult {
  const header = sheet.find((entry) => entry.row === 1)?.cells ?? [];
  const columnIndex = new Map<string, number>();
  header.forEach((cell, index) => {
    const key = normalise(cell.text);
    if (key !== '' && !columnIndex.has(key)) columnIndex.set(key, index);
  });
  const has = (column: string) => columnIndex.has(normalise(column));
  const criteria = Array.from({ length: RUBRIC_MAX_CRITERIA }, (_, i) => rubricImportColumns(i + 1)).filter(
    (pair, i) => i === 0 || has(pair.criterion) || has(pair.points),
  );
  const missing = [...REQUIRED_HEADERS, ...criteria.flatMap((pair) => [pair.criterion, pair.points])].filter(
    (column, i, all) => !has(column) && all.indexOf(column) === i,
  );
  if (missing.length > 0) return { ok: false, error: 'MISSING_COLUMNS', columns: missing };

  const filled = sheet.filter(({ row, cells }) => row > 1 && hasImportContent(cells));
  if (filled.length === 0) return { ok: false, error: 'NO_ROWS' };
  if (filled.length > MANUAL_QUESTION_IMPORT_MAX_ROWS) return { ok: false, error: 'TOO_MANY_ROWS' };

  const columns = [...REQUIRED_HEADERS, ...criteria.slice(1).flatMap((pair) => [pair.criterion, pair.points])];
  return {
    ok: true,
    rows: filled.map(({ cells, row }) =>
      readRow(row, (column) => cells[columnIndex.get(normalise(column)) ?? -1] ?? EMPTY, criteria, columns),
    ),
  };
}

function readRow(
  row: number,
  cellAt: (column: string) => ImportCell,
  criteria: readonly { criterion: string; points: string }[],
  columns: readonly string[],
): QuestionImportRow {
  const issues: QuestionImportIssue[] = [];
  /** Columns already reported: the schema's issue there would say the same thing again. */
  const reported = new Set<string>();
  const report = (column: string, code: QuestionImportIssue['code'], message: string) => {
    issues.push({ column, code, message });
    reported.add(column);
  };
  /** The trimmed text of the column; undefined for a formula, which is reported once. */
  const read = (column: string): string | undefined => {
    const cell = cellAt(column);
    if (!cell.formula) return cell.text.trim();
    if (!reported.has(column)) report(column, 'FORMULA', 'Ô chứa công thức: nhập giá trị thay cho công thức');
    return undefined;
  };

  const typeText = read(C.type);
  const type = typeText ? TYPE_VALUES.get(normalise(typeText)) : undefined;
  if (typeText && !type) report(C.type, 'INVALID', 'Loại là "Trắc nghiệm" hoặc "Tự luận"');
  const difficultyText = read(C.difficulty);
  const difficulty = difficultyText ? DIFFICULTY_VALUES.get(normalise(difficultyText)) : undefined;
  if (difficultyText && !difficulty) report(C.difficulty, 'INVALID', 'Độ khó là "Dễ", "Trung bình" hoặc "Khó"');

  const candidate: Record<string, unknown> = {
    type,
    skill: read(C.skill),
    difficulty,
    stem: read(C.stem),
    explanation: read(C.explanation),
  };
  /** Rubric criterion k of the question comes from the pair `rubricPairs[k]` of the file. */
  const rubricPairs: { criterion: string; points: string }[] = [];
  if (type === 'MCQ') {
    candidate.options = C.options.map((column) => read(column));
    const answer = read(C.correctOption);
    const index = answer ? OPTION_LETTERS.indexOf(answer.toUpperCase() as (typeof OPTION_LETTERS)[number]) : -1;
    if (answer && index < 0) report(C.correctOption, 'INVALID', 'Đáp án đúng là A, B, C hoặc D');
    candidate.correctOption = index < 0 ? undefined : index;
  } else if (type === 'ESSAY') {
    candidate.sampleAnswer = read(C.sampleAnswer);
    candidate.rubric = criteria.flatMap((pair) => {
      const criterion = read(pair.criterion);
      const points = read(pair.points);
      if (criterion === '' && points === '') return [];
      rubricPairs.push(pair);
      if (points !== undefined && points !== '' && !/^\d+$/.test(points)) {
        report(pair.points, 'INVALID', 'Điểm là số nguyên');
        return [{ criterion, maxPoints: undefined }];
      }
      return [{ criterion, maxPoints: points ? Number(points) : undefined }];
    });
  }

  // A formula in a column the row's type does not use is reported too: nothing is ever computed.
  for (const column of columns) if (cellAt(column).formula) read(column);

  const columnOf: ColumnOf = (field) => importColumnOf(field, rubricPairs);
  const parsed = ManualQuestionInputSchema.safeParse(candidate);
  for (const issue of parsed.error?.issues ?? []) {
    const column = columnOf(issue.path.length === 0 ? null : issue.path.join('.')) ?? C.type;
    if (!reported.has(column)) report(column, 'INVALID', issue.message);
  }
  return {
    row,
    type: cellAt(C.type).text.trim(),
    skill: cellAt(C.skill).text.trim(),
    difficulty: cellAt(C.difficulty).text.trim(),
    stem: cellAt(C.stem).text.trim(),
    question: parsed.success && issues.length === 0 ? parsed.data : null,
    issues,
  };
}

/**
 * The template column a field of a question comes from: `options.2` → "Phương án C", `rubric.1.maxPoints`
 * → the points column of the second criterion the row filled in. Null for the question as a whole.
 */
export function importColumnOf(field: string | null, rubricPairs: readonly { criterion: string; points: string }[] = []): string | null {
  if (field === null) return null;
  const [head, at, leaf] = field.split('.');
  switch (head) {
    case 'type':
      return C.type;
    case 'skill':
      return C.skill;
    case 'difficulty':
      return C.difficulty;
    case 'stem':
      return C.stem;
    case 'explanation':
      return C.explanation;
    case 'sampleAnswer':
      return C.sampleAnswer;
    case 'correctOption':
      return C.correctOption;
    case 'options':
      return C.options[Number(at ?? 0)] ?? null;
    case 'rubric': {
      const pair = rubricPairs[Number(at ?? 0)] ?? rubricImportColumns(1);
      return leaf === 'maxPoints' ? pair.points : pair.criterion;
    }
    default:
      return null;
  }
}
