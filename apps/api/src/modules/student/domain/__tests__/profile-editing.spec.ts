import type { CvProfile, CvSkill, CvStatus } from '@srm/shared';
import { newSkillNames, normalizeProfileSkills, profileActions } from '../profile-editing.js';

describe('GĐ2 what the student may do with the profile (US-2.6 AC-4, AC-8, AC-12)', () => {
  it.each<[CvStatus, boolean, boolean, { editable: boolean; canReopen: boolean }]>([
    ['PENDING_CONFIRMATION', true, true, { editable: true, canReopen: false }],
    ['CONFIRMED', true, true, { editable: false, canReopen: true }],
    ['PENDING_ANALYSIS', true, true, { editable: false, canReopen: false }],
    ['ANALYSIS_FAILED', true, true, { editable: false, canReopen: false }],
    // AC-8: past intake_end nothing changes any more.
    ['PENDING_CONFIRMATION', true, false, { editable: false, canReopen: false }],
    ['CONFIRMED', true, false, { editable: false, canReopen: false }],
    // BR-01: a superseded version is read only.
    ['PENDING_CONFIRMATION', false, true, { editable: false, canReopen: false }],
    ['CONFIRMED', false, true, { editable: false, canReopen: false }],
  ])('GĐ2 %s, active %p, intake open %p', (status, active, intakeOpen, expected) => {
    expect(profileActions({ status, active }, intakeOpen)).toEqual(expected);
  });
});

describe('FR-13 skills of an edited profile mapped to the catalogue again (US-2.6 AC-3, CONTEXT D40)', () => {
  const catalogue = new Map([
    ['java', 'Java'],
    ['springboot', 'Spring Boot'],
    ['reactjs', 'React'],
  ]);
  const stored: CvSkill[] = [
    { name: 'Golang', canonical_name: 'Go', match: 'EMBEDDING' },
    { name: 'Java', canonical_name: 'Java', match: 'ALIAS' },
  ];

  it('FR-13 a name whose key a catalogue name or alias has is ALIAS, with the catalogue name', () => {
    const skills: CvSkill[] = [
      { name: 'spring-boot', canonical_name: null, match: 'NEW' },
      { name: 'React.js', canonical_name: null, match: 'NEW' },
    ];
    expect(normalizeProfileSkills(skills, stored, catalogue)).toEqual([
      { name: 'spring-boot', canonical_name: 'Spring Boot', match: 'ALIAS' },
      { name: 'React.js', canonical_name: 'React', match: 'ALIAS' },
    ]);
  });

  it('FR-13 the canonical name and match sent by the client are not trusted', () => {
    const forged: CvSkill[] = [
      { name: 'Rust embedded', canonical_name: 'Rust', match: 'ALIAS' },
      { name: 'Kotlin', canonical_name: 'Go', match: 'EMBEDDING' },
    ];
    expect(normalizeProfileSkills(forged, stored, catalogue)).toEqual([
      { name: 'Rust embedded', canonical_name: null, match: 'NEW' },
      { name: 'Kotlin', canonical_name: null, match: 'NEW' },
    ]);
  });

  it('FR-13 an EMBEDDING mapping of the stored profile stays only for the entry left as stored', () => {
    const skills: CvSkill[] = [
      { name: 'Golang', canonical_name: 'Go', match: 'EMBEDDING' },
      { name: 'golang', canonical_name: 'Go', match: 'EMBEDDING' },
      { name: 'Golang', canonical_name: null, match: 'NEW' },
    ];
    expect(normalizeProfileSkills(skills, stored, catalogue)).toEqual([
      { name: 'Golang', canonical_name: 'Go', match: 'EMBEDDING' },
      { name: 'golang', canonical_name: null, match: 'NEW' },
      { name: 'Golang', canonical_name: null, match: 'NEW' },
    ]);
  });

  it('BR-03 new skill names leave out the mapped ones and any that held personal data', () => {
    const masked = {
      skills: [
        { name: 'Java', canonical_name: 'Java', match: 'ALIAS' },
        { name: 'Rust embedded', canonical_name: null, match: 'NEW' },
        { name: '[NAME]-lib', canonical_name: null, match: 'NEW' },
        { name: 'Golang', canonical_name: 'Go', match: 'EMBEDDING' },
      ],
    } as CvProfile;
    expect(newSkillNames(masked)).toEqual(['Rust embedded']);
  });
});
