// US-4.4 AC-14 (BR-07, AGENTS › Invariants 9, 10, CONTEXT D53): once a session's results have been
// published for `appeal_window_hours` (48 by default), its preference still TEST_GRADED with S_test
// below θ_test (40 by default) moves to BELOW_THRESHOLD; THRESHOLD_HOLDS holds back what US-4.6
// says. Only this file calls the threshold sweep's runOnce(); its clock is in June 2000, after the
// grading test's (March 2000), whose published sessions all score S_test ≥ 60
// (test/helpers/fake-clock.ts). Publication times are set here, so a grading sweep of another file
// that publishes one of these sessions first changes nothing.
import type { TestingModuleBuilder } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import { Clock } from '../../src/common/clock/index.js';
import { examSessions, preferences } from '../../src/db/schema/index.js';
import { GradingService, THRESHOLD_HOLDS, type ThresholdHolds, ThresholdScheduler } from '../../src/modules/assessment/index.js';
import { type AuthTestApp, createAuthTestApp } from '../helpers/auth.js';
import { FakeClock } from '../helpers/fake-clock.js';
import { createGradingFixture, takeExam } from '../helpers/grading.js';
import { minutesAfter } from '../helpers/exam.js';
import { auditEntries } from '../helpers/state.js';

const START = '2000-06-05T08:00:00.000Z';
const HOUR = 60 * 60_000;

describe('GĐ6 threshold sweep (US-4.4)', () => {
  const clock = new FakeClock(START);
  const held = new Set<number>();
  const holds: ThresholdHolds = {
    heldSessionIds: (sessionIds) => Promise.resolve(new Set(sessionIds.filter((id) => held.has(id)))),
  };
  let t: AuthTestApp;
  let scheduler: ThresholdScheduler;

  beforeAll(async () => {
    t = await createAuthTestApp({
      configure: (b: TestingModuleBuilder) => b.overrideProvider(Clock).useValue(clock).overrideProvider(THRESHOLD_HOLDS).useValue(holds),
    });
    scheduler = t.app.get(ThresholdScheduler);
  });

  afterAll(() => t.close());

  const status = async (id: number) => {
    const [row] = await t.db.select({ status: preferences.status }).from(preferences).where(eq(preferences.id, id));
    return row!.status;
  };

  it('BR-07 BELOW_THRESHOLD after appeal window only', async () => {
    const testingEnd = minutesAfter(clock.now(), 60);
    const low = await createGradingFixture(t, { now: clock.now(), testingEnd });
    const { campaignId } = low;
    const high = await createGradingFixture(t, { now: clock.now(), campaignId });
    const appealing = await createGradingFixture(t, { now: clock.now(), campaignId });
    // S_test 0 (the MCQ wrong), 60 (right), 0.
    const sessions = [
      (await takeExam(t, low, { mcq: 'WRONG', essays: [null, null] })).sessionId,
      (await takeExam(t, high, { mcq: 'RIGHT', essays: [null, null] })).sessionId,
      (await takeExam(t, appealing, { mcq: null, essays: [null, null] })).sessionId,
    ];
    // Results are published once the test window is over.
    clock.set(new Date(Date.parse(testingEnd) + 60_000));
    const grading = t.app.get(GradingService);
    for (const sessionId of sessions) await grading.finalizeIfReady(sessionId);
    const publishedAt = clock.now();
    await t.db.update(examSessions).set({ resultsPublishedAt: publishedAt }).where(inArray(examSessions.id, sessions));
    expect((await t.db.select({ sTest: examSessions.sTest }).from(examSessions).where(inArray(examSessions.id, sessions))).map((row) => row.sTest).sort()).toEqual([0, 0, 60]);
    for (const fixture of [low, high, appealing]) expect(await status(fixture.preferenceId)).toBe('TEST_GRADED');
    held.add(sessions[2]!);

    // Within the window the student may still appeal: nothing moves.
    clock.set(new Date(publishedAt.getTime() + 48 * HOUR - 1_000));
    expect((await scheduler.runOnce()).below).not.toEqual(expect.arrayContaining([low.preferenceId]));
    expect(await status(low.preferenceId)).toBe('TEST_GRADED');

    // Past it: below θ_test moves, at or above stays, a held session waits.
    clock.set(new Date(publishedAt.getTime() + 48 * HOUR + 1_000));
    const report = await scheduler.runOnce();
    expect(report.acquired).toBe(true);
    expect(report.below).toContain(low.preferenceId);
    expect(report.below).not.toContain(high.preferenceId);
    expect(report.below).not.toContain(appealing.preferenceId);
    expect(await status(low.preferenceId)).toBe('BELOW_THRESHOLD');
    expect(await status(high.preferenceId)).toBe('TEST_GRADED');
    expect(await status(appealing.preferenceId)).toBe('TEST_GRADED');
    const [transition] = (await auditEntries(t.db, 'application', low.preferenceId)).filter((entry) => entry.reason === 'BELOW_THETA_TEST');
    expect(transition).toMatchObject({ action: 'TRANSITION', actorKind: 'SYSTEM' });

    // The hold is released: the next run moves it; nothing moves twice.
    held.clear();
    const next = await scheduler.runOnce();
    expect(next.below).toContain(appealing.preferenceId);
    expect(next.below).not.toContain(low.preferenceId);
    expect(await status(appealing.preferenceId)).toBe('BELOW_THRESHOLD');
  });
});
