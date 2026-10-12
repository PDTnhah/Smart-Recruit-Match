import type { CampaignDeadlines } from '@srm/shared';
import { checkDeadlineExtension } from '../deadline-change.js';

const before: CampaignDeadlines = {
  intake_end: '2026-11-01T10:00:00.000Z',
  preference_end: '2026-11-08T10:00:00.000Z',
  testing_end: '2026-11-15T10:00:00.000Z',
};

/** During INTAKE, before intake_end. */
const duringIntake = new Date('2026-10-20T00:00:00.000Z');
/** During PREFERENCE_SELECTION: intake_end has passed. */
const duringPreferences = new Date('2026-11-03T00:00:00.000Z');

describe('FR-2: deadline extension after DRAFT', () => {
  it('FR-2: the deadline ending the current phase may move later', () => {
    expect(checkDeadlineExtension(before, { intake_end: '2026-11-03T10:00:00.000Z' }, duringIntake)).toEqual({
      ok: true,
      changed: ['intake_end'],
    });
  });

  it('FR-2: deadlines of later phases may move later', () => {
    const patch = { preference_end: '2026-11-09T10:00:00.000Z', testing_end: '2026-11-20T10:00:00.000Z' };
    expect(checkDeadlineExtension(before, patch, duringIntake)).toEqual({
      ok: true,
      changed: ['preference_end', 'testing_end'],
    });
  });

  it('FR-2: a deadline that has passed is locked', () => {
    expect(checkDeadlineExtension(before, { intake_end: '2026-11-05T10:00:00.000Z' }, duringPreferences)).toEqual({
      ok: false,
      kind: 'LOCKED',
      keys: ['intake_end'],
    });
  });

  it('FR-2: deadlines may not move earlier or be cleared', () => {
    const patch = { preference_end: '2026-11-07T10:00:00.000Z', testing_end: null };
    expect(checkDeadlineExtension(before, patch, duringIntake)).toEqual({
      ok: false,
      kind: 'NOT_LATER',
      keys: ['preference_end', 'testing_end'],
    });
  });

  it('a key sent with its current value is not a change, whatever its offset', () => {
    const patch = { intake_end: '2026-11-01T17:00:00+07:00', preference_end: before.preference_end };
    expect(checkDeadlineExtension(before, patch, duringPreferences)).toEqual({ ok: true, changed: [] });
  });

  it('locked keys are reported before keys that move the wrong way', () => {
    const patch = { intake_end: '2026-11-05T10:00:00.000Z', preference_end: '2026-11-04T10:00:00.000Z' };
    expect(checkDeadlineExtension(before, patch, duringPreferences)).toMatchObject({ kind: 'LOCKED', keys: ['intake_end'] });
  });
});
