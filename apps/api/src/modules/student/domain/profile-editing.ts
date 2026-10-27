import { type CvProfile, type CvSkill, type CvStatus, skillMatchKey } from '@srm/shared';
import { hasMaskToken } from './mask-profile.js';

// The student's review of the profile the CV Parser read (US-2.6, FR-11, CONTEXT D40). Pure: the
// service reads the CV, the campaign phase and the catalogue, then asks these functions.

export interface ProfileActions {
  /** "Lưu nháp" and "Xác nhận" (AC-4, AC-5). */
  editable: boolean;
  /** "Sửa lại": a new version to confirm again (AC-12). */
  canReopen: boolean;
}

/**
 * What the student may do with a CV version now. Only the version that counts (BR-01), and only
 * while the campaign takes CVs (AC-8): after that the confirmed profile is what gets scored.
 */
export function profileActions(cv: { status: CvStatus; active: boolean }, intakeOpen: boolean): ProfileActions {
  const open = intakeOpen && cv.active;
  return {
    editable: open && cv.status === 'PENDING_CONFIRMATION',
    canReopen: open && cv.status === 'CONFIRMED',
  };
}

/**
 * The skills of an edited profile mapped to the catalogue again, as the AI Service maps them
 * (US-2.5): an approved skill with the same key (name or alias) is ALIAS, else NEW. The
 * `canonical_name` and `match` the client sent are not trusted. An EMBEDDING mapping cannot be
 * recomputed here, so it is kept only for an entry left as stored: the same name and
 * `canonical_name` (CONTEXT D40). A retyped name, even one with the same key, is NEW.
 *
 * `catalogue` maps a match key to the name of the approved skill that has it.
 */
export function normalizeProfileSkills(
  skills: readonly CvSkill[],
  stored: readonly CvSkill[],
  catalogue: ReadonlyMap<string, string>,
): CvSkill[] {
  return skills.map(({ name, canonical_name }): CvSkill => {
    const canonical = catalogue.get(skillMatchKey(name));
    if (canonical !== undefined) return { name, canonical_name: canonical, match: 'ALIAS' };
    const kept = stored.some(
      (skill) => skill.match === 'EMBEDDING' && skill.name === name && skill.canonical_name === canonical_name,
    );
    if (kept) return { name, canonical_name, match: 'EMBEDDING' };
    return { name, canonical_name: null, match: 'NEW' };
  });
}

/**
 * Names for the ADMIN review queue once the profile is confirmed (US-2.5 AC-5): the NEW skills of
 * `profile_masked`, without a name that held personal data (BR-03: these names are stored in
 * core.skills and sent to the LLM).
 */
export function newSkillNames(profileMasked: CvProfile): string[] {
  return profileMasked.skills.filter((skill) => skill.match === 'NEW' && !hasMaskToken(skill.name)).map((skill) => skill.name);
}
