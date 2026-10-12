import type { CampaignDeadlines, CampaignStatus } from '@srm/shared';
import { nextAutoTransition } from '../next-auto-transition.js';

const deadlines: CampaignDeadlines = {
  intake_end: '2026-11-01T10:00:00.000Z',
  preference_end: '2026-11-08T10:00:00.000Z',
  testing_end: '2026-11-15T10:00:00.000Z',
};

const at = (iso: string) => new Date(iso);

describe('GĐ0: nextAutoTransition', () => {
  it('GĐ0: past intake_end yields INTAKE→PREFERENCE_SELECTION', () => {
    expect(nextAutoTransition('INTAKE', deadlines, at('2026-11-01T10:00:01.000Z'))).toEqual({
      from: 'INTAKE',
      to: 'PREFERENCE_SELECTION',
      deadlineKey: 'intake_end',
      deadline: '2026-11-01T10:00:00.000Z',
    });
  });

  it('GĐ0: the phase ends exactly at its deadline, not a millisecond later', () => {
    expect(nextAutoTransition('INTAKE', deadlines, at('2026-11-01T09:59:59.999Z'))).toBeNull();
    expect(nextAutoTransition('INTAKE', deadlines, at('2026-11-01T10:00:00.000Z'))?.to).toBe('PREFERENCE_SELECTION');
  });

  it('GĐ0: preference_end and testing_end end their phases', () => {
    const late = at('2026-12-01T00:00:00.000Z');
    expect(nextAutoTransition('PREFERENCE_SELECTION', deadlines, late)?.to).toBe('TESTING');
    expect(nextAutoTransition('TESTING', deadlines, late)?.to).toBe('ALLOCATION_REVIEW');
  });

  it('GĐ0: looks only at the deadline of the current phase', () => {
    // intake_end has passed, but a campaign already selecting preferences waits for preference_end.
    expect(nextAutoTransition('PREFERENCE_SELECTION', deadlines, at('2026-11-02T00:00:00.000Z'))).toBeNull();
  });

  it.each<CampaignStatus>(['DRAFT', 'ALLOCATION_REVIEW', 'SUPPLEMENTARY', 'CLOSED'])(
    'GĐ0: %s never moves by deadline',
    (status) => {
      expect(nextAutoTransition(status, deadlines, at('2030-01-01T00:00:00.000Z'))).toBeNull();
    },
  );

  it('GĐ0: a phase without its deadline does not move', () => {
    expect(nextAutoTransition('INTAKE', {}, at('2030-01-01T00:00:00.000Z'))).toBeNull();
  });

  it('compares instants, whatever the offset the deadline was written with', () => {
    const local = { intake_end: '2026-11-01T17:00:00+07:00' };
    expect(nextAutoTransition('INTAKE', local, at('2026-11-01T09:59:59.000Z'))).toBeNull();
    expect(nextAutoTransition('INTAKE', local, at('2026-11-01T10:00:00.000Z'))).not.toBeNull();
  });
});
