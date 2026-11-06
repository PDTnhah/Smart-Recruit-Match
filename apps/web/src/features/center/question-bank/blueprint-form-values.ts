import {
  EXAM_PARTS,
  type ExamBlueprint,
  type ExamPart,
  type JdRequirements,
  QUESTION_DIFFICULTIES,
  skillKey,
} from '@srm/shared';
import { type FieldErrors, type Resolver, set } from 'react-hook-form';
import type { z } from 'zod';
import type { ServerValidationIssue } from '@/shared/forms/server-errors';

// The blueprint form edits a skill × difficulty matrix of counts, while the blueprint is a list of
// cells with a count of at least 1 (BR-05, US-4.1 AC-3). These functions turn one into the other
// and put the errors of the shared schema on the matrix inputs (DESIGN.md §8).

/** A row of the matrix: a skill of the JD's requirements, or one the blueprint still names. */
export interface MatrixRow {
  key: string;
  /** Name written into the cells: the blueprint's spelling, else the requirements'. */
  skill: string;
  /** False when the requirements no longer list the skill (versioned since, BR-18): its cells fail. */
  known: boolean;
}

export interface PartFormValues {
  weight_percent: number;
  question_count: number;
  /** `counts[row][difficulty]`, difficulties in `QUESTION_DIFFICULTIES` order; 0 or empty: no cell. */
  counts: number[][];
}

export interface BlueprintFormValues {
  duration_minutes: number;
  parts: Record<ExamPart, PartFormValues>;
}

interface CellPosition {
  row: number;
  difficulty: number;
}

/** Where each cell of the blueprint built from the form sits in the matrix, by part and cell index. */
type CellPositions = Record<ExamPart, CellPosition[]>;

/** Skills of the blueprint first, in its order, then the requirements' other skills (must-have first). */
export function matrixRows(
  blueprint: ExamBlueprint,
  requirements: Pick<JdRequirements, 'must_have' | 'nice_to_have'>,
): MatrixRow[] {
  const listed = [...requirements.must_have, ...requirements.nice_to_have].map((item) => item.skill);
  const known = new Set(listed.map(skillKey));
  const rows = new Map<string, MatrixRow>();
  const add = (skill: string) => {
    const key = skillKey(skill);
    if (key !== '' && !rows.has(key)) rows.set(key, { key, skill: skill.trim(), known: known.has(key) });
  };
  for (const part of EXAM_PARTS) for (const cell of blueprint.parts[part].cells) add(cell.skill);
  for (const skill of listed) add(skill);
  return [...rows.values()];
}

export function formValuesOf(blueprint: ExamBlueprint, rows: readonly MatrixRow[]): BlueprintFormValues {
  const rowOf = new Map(rows.map((row, index) => [row.key, index]));
  const partValues = (part: ExamPart): PartFormValues => {
    const { weight_percent, question_count, cells } = blueprint.parts[part];
    const counts = rows.map(() => QUESTION_DIFFICULTIES.map(() => 0));
    for (const cell of cells) {
      const row = rowOf.get(skillKey(cell.skill));
      if (row !== undefined) counts[row]![QUESTION_DIFFICULTIES.indexOf(cell.difficulty)]! += cell.count;
    }
    return { weight_percent, question_count, counts };
  };
  return { duration_minutes: blueprint.duration_minutes, parts: { A: partValues('A'), B: partValues('B') } };
}

/** An empty input holds NaN (the number inputs' convention) and means 0, like a blank cell. */
const isEmptyCount = (count: number) => Number.isNaN(count) || count === 0;

/** The blueprint the form stands for: a cell for each count that is not 0, row by row. */
function blueprintOf(values: BlueprintFormValues, rows: readonly MatrixRow[]) {
  const positions: CellPositions = { A: [], B: [] };
  const part = (name: ExamPart) => {
    const { weight_percent, question_count, counts } = values.parts[name];
    const cells: ExamBlueprint['parts'][ExamPart]['cells'] = [];
    rows.forEach((row, rowIndex) =>
      QUESTION_DIFFICULTIES.forEach((difficulty, difficultyIndex) => {
        const count = counts[rowIndex]?.[difficultyIndex] ?? 0;
        if (isEmptyCount(count)) return;
        cells.push({ skill: row.skill, difficulty, count });
        positions[name].push({ row: rowIndex, difficulty: difficultyIndex });
      }),
    );
    return { weight_percent, question_count, cells };
  };
  const blueprint: ExamBlueprint = { duration_minutes: values.duration_minutes, parts: { A: part('A'), B: part('B') } };
  return { blueprint, positions };
}

/**
 * The form field an issue of the schema belongs to: a cell's errors go to its matrix input, an
 * error of a part's cell list (none at all) to the part's question count. Null when none fits.
 */
function formPathOf(path: readonly PropertyKey[], positions: CellPositions): string | null {
  const [head, part, field, index] = path;
  if (head === 'duration_minutes') return 'duration_minutes';
  if (head !== 'parts' || (part !== 'A' && part !== 'B')) return null;
  if (field === 'weight_percent' || field === 'question_count') return `parts.${part}.${field}`;
  if (field !== 'cells') return null;
  const position = typeof index === 'number' ? positions[part][index] : undefined;
  return position ? `parts.${part}.counts.${position.row}.${position.difficulty}` : `parts.${part}.question_count`;
}

interface Issue {
  path: readonly PropertyKey[];
  message: string;
}

/** A field error of the form; `root` for an issue no field fits, shown above the form. */
export interface BlueprintFieldIssue {
  name: string;
  message: string;
}

/** The first issue of each field wins. */
function fieldIssuesOf(issues: readonly Issue[], positions: CellPositions): BlueprintFieldIssue[] {
  const byName = new Map<string, string>();
  for (const issue of issues) {
    const name = formPathOf(issue.path, positions) ?? 'root';
    if (!byName.has(name)) byName.set(name, issue.message);
  }
  return [...byName].map(([name, message]) => ({ name, message }));
}

/**
 * Runs `schema` (the API's own `examBlueprintRequestSchema`) on the blueprint the matrix stands
 * for. RHF keeps only the errors of the fields it checks, so a cell's input lists the sum it is
 * part of in `deps` (LESSONS §26).
 */
export function blueprintResolver(
  schema: z.ZodType<ExamBlueprint>,
  rows: readonly MatrixRow[],
): Resolver<BlueprintFormValues, unknown, ExamBlueprint> {
  return (values) => {
    const { blueprint, positions } = blueprintOf(values, rows);
    const parsed = schema.safeParse(blueprint);
    if (parsed.success) return { values: parsed.data, errors: {} };
    const errors: FieldErrors<BlueprintFormValues> = {};
    for (const { name, message } of fieldIssuesOf(parsed.error.issues, positions)) {
      set(errors, name, { type: 'validate', message });
    }
    return { values: {}, errors };
  };
}

/**
 * The field errors of a 400 on save (the requirements changed since the form was loaded), for the
 * values that were sent: `blueprint.parts.A.cells.3.count` lands on the input of that cell.
 */
export function serverBlueprintIssues(
  issues: readonly ServerValidationIssue[],
  values: BlueprintFormValues,
  rows: readonly MatrixRow[],
): BlueprintFieldIssue[] {
  const { positions } = blueprintOf(values, rows);
  const relative = issues.flatMap((issue) => {
    const [head, ...rest] = issue.path.split('.');
    if (head !== 'blueprint') return [];
    return [{ path: rest.map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment)), message: issue.message }];
  });
  return fieldIssuesOf(relative, positions);
}
