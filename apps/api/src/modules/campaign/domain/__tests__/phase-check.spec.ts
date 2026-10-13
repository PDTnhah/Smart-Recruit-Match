import type { CampaignDeadlines } from '@srm/shared';
import { checkOpenable, checkPhase } from '../phase-check.js';

const deadlines: CampaignDeadlines = {
  intake_end: '2026-11-01T10:00:00.000Z',
  preference_end: '2026-11-08T10:00:00.000Z',
  testing_end: '2026-11-15T10:00:00.000Z',
};

const at = (iso: string) => new Date(iso);

describe('FR-2: checkPhase', () => {
  it('FR-2: allows an action in its phase before the phase deadline', () => {
    expect(checkPhase('INTAKE', deadlines, ['INTAKE'], at('2026-10-20T00:00:00.000Z'))).toEqual({ ok: true });
  });

  it('FR-2: rejects an action outside its phase', () => {
    expect(checkPhase('PREFERENCE_SELECTION', deadlines, ['INTAKE'], at('2026-11-02T00:00:00.000Z'))).toEqual({
      ok: false,
    });
  });

  it('FR-2: rejects an action once the phase deadline passed, before the scheduler moves the campaign', () => {
    expect(checkPhase('INTAKE', deadlines, ['INTAKE'], at('2026-11-01T10:00:00.000Z'))).toEqual({
      ok: false,
      phaseEndedAt: '2026-11-01T10:00:00.000Z',
    });
  });

  it('accepts any of several allowed phases', () => {
    const now = at('2026-11-05T00:00:00.000Z');
    expect(checkPhase('PREFERENCE_SELECTION', deadlines, ['INTAKE', 'PREFERENCE_SELECTION'], now)).toEqual({ ok: true });
  });

  it('phases without a deadline only depend on the status', () => {
    expect(checkPhase('ALLOCATION_REVIEW', deadlines, ['ALLOCATION_REVIEW'], at('2030-01-01T00:00:00.000Z'))).toEqual({
      ok: true,
    });
  });
});

describe('GĐ0: checkOpenable', () => {
  const now = at('2026-10-12T00:00:00.000Z');

  it('GĐ0: opens when every deadline is set and ahead', () => {
    expect(checkOpenable(deadlines, now)).toEqual({ ok: true });
  });

  it('GĐ0: reports missing deadlines first', () => {
    expect(checkOpenable({ intake_end: deadlines.intake_end }, now)).toEqual({
      ok: false,
      reasonCode: 'DEADLINES_MISSING',
      keys: ['preference_end', 'testing_end'],
    });
  });

  it('GĐ0: refuses a deadline that is now or past', () => {
    expect(checkOpenable(deadlines, at('2026-11-01T10:00:00.000Z'))).toEqual({
      ok: false,
      reasonCode: 'DEADLINE_IN_PAST',
      keys: ['intake_end'],
    });
  });
});
