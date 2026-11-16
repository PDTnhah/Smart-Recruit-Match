import { type CampaignConfig, CampaignConfigSchema, DEADLINE_REQUIRED, DEADLINE_TOO_SOON } from '@srm/shared';
import { hasChanges, planRunningEdit, type RunningCampaign } from '../running-edit.js';

const HOUR = 3_600_000;

const deadlines = {
  intake_end: '2026-11-01T10:00:00.000Z',
  preference_end: '2026-11-08T10:00:00.000Z',
  testing_end: '2026-11-15T10:00:00.000Z',
};

const config: CampaignConfig = CampaignConfigSchema.parse({});

const campaign = (overrides: Partial<RunningCampaign> = {}): RunningCampaign => ({
  status: 'INTAKE',
  name: 'Đợt HK1',
  target: { cohorts: ['K66'], majors: ['CNTT'] },
  config,
  phaseDeadlines: deadlines,
  ...overrides,
});

/** During INTAKE, well before intake_end. */
const duringIntake = new Date('2026-10-20T00:00:00.000Z');
/** intake_end has passed but the scheduler has not moved the campaign yet. */
const afterIntakeEnd = new Date('2026-11-01T10:00:00.000Z');

describe('FR-41: parameters of an open campaign (US-1.10 AC-1)', () => {
  it('GĐ0: S_cv weights and θ_cv change during intake; T_test and the top M are locked', () => {
    const edit = planRunningEdit(
      campaign(),
      { config: { scv_weight_project: 0.3, scv_weight_language: 0, theta_cv: 60, match_top_m: 5, t_test_minutes: 60 } },
      duringIntake,
    );
    expect(edit.locked).toEqual(['config.match_top_m', 'config.t_test_minutes']);
    expect(edit.config).toEqual({ scv_weight_project: 0.3, scv_weight_language: 0, theta_cv: 60 });
  });

  it('FR-41: once intake_end has passed, the parameters of preference selection are locked', () => {
    const edit = planRunningEdit(campaign(), { config: { theta_cv: 60, theta_test: 50 } }, afterIntakeEnd);
    expect(edit).toMatchObject({ phase: 'PREFERENCE_SELECTION', locked: ['config.theta_cv'], config: { theta_test: 50 } });
  });

  it('FR-41: k changes until allocation starts; the reminder until the campaign is over', () => {
    const during = new Date('2026-11-10T00:00:00.000Z');
    expect(planRunningEdit(campaign({ status: 'TESTING' }), { config: { k: 2, alpha: 0.5, beta: 0.5 } }, during)).toMatchObject({
      locked: ['config.alpha', 'config.beta'],
      config: { k: 2 },
    });
    const allocation = campaign({ status: 'ALLOCATION_REVIEW' });
    expect(planRunningEdit(allocation, { config: { k: 2, reminder_hours_before: 12 } }, during)).toMatchObject({
      locked: ['config.k'],
      config: { reminder_hours_before: 12 },
    });
    const closed = planRunningEdit(campaign({ status: 'CLOSED' }), { config: { reminder_hours_before: 12 } }, during);
    expect(closed.locked).toEqual(['config.reminder_hours_before']);
  });

  it('values sent unchanged are not edits, objects compared by value', () => {
    const edit = planRunningEdit(
      campaign({ status: 'TESTING' }),
      { config: { match_top_m: config.match_top_m, competition_thresholds: { ...config.competition_thresholds } } },
      duringIntake,
    );
    expect(edit).toMatchObject({ locked: [], invalid: [], config: {} });
    expect(hasChanges(edit)).toBe(false);
  });
});

describe('FR-41: name and target of an open campaign (US-1.10 AC-3)', () => {
  it('GĐ0: the name changes in any phase until the campaign is closed or cancelled', () => {
    expect(planRunningEdit(campaign({ status: 'SUPPLEMENTARY' }), { name: 'Tên mới' }, afterIntakeEnd).name).toBe('Tên mới');
    expect(planRunningEdit(campaign({ status: 'CANCELLED' }), { name: 'Tên mới' }, duringIntake).locked).toEqual(['name']);
  });

  it('GĐ0: during intake cohorts and majors can be added; the stored spelling is kept', () => {
    const edit = planRunningEdit(
      campaign(),
      { target: { cohorts: [' k66 ', 'K67'], majors: ['CNTT', 'Kinh tế'] } },
      duringIntake,
    );
    expect(edit.locked).toEqual([]);
    expect(edit.target).toEqual({ cohorts: ['K66', 'K67'], majors: ['CNTT', 'Kinh tế'] });
  });

  it('FR-41: a value cannot be removed, nor added once intake_end has passed', () => {
    const removed = planRunningEdit(campaign(), { target: { cohorts: ['K67'], majors: ['CNTT'] } }, duringIntake);
    expect(removed.locked).toEqual(['target.cohorts']);
    const late = planRunningEdit(campaign(), { target: { cohorts: ['K66'], majors: ['CNTT', 'Kinh tế'] } }, afterIntakeEnd);
    expect(late.locked).toEqual(['target.majors']);
  });

  it('the same target, written another way, is no change', () => {
    const edit = planRunningEdit(campaign(), { target: { cohorts: ['k66'], majors: [' cntt'] } }, afterIntakeEnd);
    expect(edit.locked).toEqual([]);
    expect(hasChanges(edit)).toBe(false);
  });
});

describe('FR-41: deadlines of an open campaign (US-1.10 AC-4)', () => {
  it('FR-41: a deadline still ahead moves later', () => {
    const edit = planRunningEdit(campaign(), { phaseDeadlines: { intake_end: '2026-11-03T10:00:00.000Z' } }, duringIntake);
    expect(edit.deadlines).toEqual([{ key: 'intake_end', before: deadlines.intake_end, after: '2026-11-03T10:00:00.000Z' }]);
  });

  it('FR-41: it moves earlier down to exactly 24 hours from now, not closer', () => {
    const now = new Date('2026-10-31T10:00:00.000Z');
    const exactly = new Date(now.getTime() + 24 * HOUR).toISOString();
    const tooSoon = new Date(now.getTime() + 24 * HOUR - 1).toISOString();
    expect(planRunningEdit(campaign(), { phaseDeadlines: { preference_end: exactly } }, now)).toMatchObject({
      invalid: [],
      deadlines: [{ key: 'preference_end', after: exactly }],
    });
    expect(planRunningEdit(campaign(), { phaseDeadlines: { preference_end: tooSoon } }, now).invalid).toEqual([
      { path: 'phaseDeadlines.preference_end', message: DEADLINE_TOO_SOON },
    ]);
  });

  it('FR-41: a later move is always allowed, even within 24 hours of now', () => {
    const now = new Date('2026-11-01T09:00:00.000Z');
    const edit = planRunningEdit(campaign(), { phaseDeadlines: { intake_end: '2026-11-01T12:00:00.000Z' } }, now);
    expect(edit).toMatchObject({ invalid: [], locked: [], deadlines: [{ key: 'intake_end' }] });
  });

  it('FR-41: a passed deadline is locked, also before the scheduler moves the campaign', () => {
    const edit = planRunningEdit(campaign(), { phaseDeadlines: { intake_end: '2026-11-05T10:00:00.000Z' } }, afterIntakeEnd);
    expect(edit.locked).toEqual(['phaseDeadlines.intake_end']);
  });

  it('FR-41: a deadline cannot be cleared; every deadline of a cancelled campaign is locked', () => {
    expect(planRunningEdit(campaign(), { phaseDeadlines: { testing_end: null } }, duringIntake).invalid).toEqual([
      { path: 'phaseDeadlines.testing_end', message: DEADLINE_REQUIRED },
    ]);
    const cancelled = planRunningEdit(
      campaign({ status: 'CANCELLED' }),
      { phaseDeadlines: { testing_end: '2026-11-20T10:00:00.000Z' } },
      duringIntake,
    );
    expect(cancelled.locked).toEqual(['phaseDeadlines.testing_end']);
  });

  it('a key sent with its current value is not a change, whatever its offset', () => {
    const patch = { intake_end: '2026-11-01T17:00:00+07:00', preference_end: deadlines.preference_end };
    expect(hasChanges(planRunningEdit(campaign(), { phaseDeadlines: patch }, afterIntakeEnd))).toBe(false);
  });
});
