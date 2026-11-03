import { majorGroupOf, type MatchEducation, POSITION_MAJOR_FIT, type PositionGroup } from '@srm/shared';

// How close the student's major is to a JD, by code (PRD › Mức khớp ngành, FR-40, US-3.6 AC-6,
// CONTEXT D42, D45). The LLM never judges it (AGENTS › Invariant 2).

export interface MajorMatchJd {
  /** `hard_conditions.majors`: the majors the JD accepts, empty when it accepts any. */
  majors: readonly string[];
  positionGroup: PositionGroup;
}

/**
 * For a pair that passed the hard filter: a JD that names majors let in only those, so EXACT; a JD
 * that names none is read from the position group's row of `POSITION_MAJOR_FIT`. A major in no
 * group, or no major at all, is OTHER and flagged, so the explanation can say the major was not
 * recognised rather than unrelated.
 */
export function majorMatch(jd: MajorMatchJd, studentMajor: string | null): MatchEducation {
  if (jd.majors.length > 0) return { major_match: 'EXACT', major_unrecognized: false };
  const group = majorGroupOf(studentMajor);
  if (group === null) return { major_match: 'OTHER', major_unrecognized: true };
  const fit = POSITION_MAJOR_FIT[jd.positionGroup];
  if (fit.exact.includes(group)) return { major_match: 'EXACT', major_unrecognized: false };
  if (fit.related.includes(group)) return { major_match: 'RELATED', major_unrecognized: false };
  return { major_match: 'OTHER', major_unrecognized: false };
}
