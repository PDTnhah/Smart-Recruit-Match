import type { ExamBlueprintView } from '@srm/shared';

/** Questions nobody has checked in the blueprint's cells: what "Kiểm câu bằng AI" sends (US-4.10 AC-2). */
export const uncheckedOf = (view: ExamBlueprintView) => view.coverage.reduce((total, cell) => total + cell.pending, 0);
