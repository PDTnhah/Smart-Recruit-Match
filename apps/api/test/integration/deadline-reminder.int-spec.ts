// US-1.7 AC-6 (GĐ2): before `intake_end`, target students without an active CV get one reminder,
// in app and by email; reruns and a second instance remind nobody twice. No LLM involved.
//
// The clock is fake and set in 2001, like campaign-scheduler.int-spec.ts: only campaigns with 2001
// deadlines can be in the reminder window, and other files keep their deadlines near the real
// time. Students use a cohort of their own, so no other file's student is a recipient here.
import { DEFAULT_CAMPAIGN_CONFIG } from '@srm/shared';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { Clock } from '../../src/common/clock/index.js';
import { campaigns } from '../../src/db/schema/index.js';
import { DeadlineReminderScheduler } from '../../src/modules/notification/application/deadline-reminder.scheduler.js';
import { type AuthTestApp, createAuthTestApp, type TestUser } from '../helpers/auth.js';
import { createCampaign, createCv, createStudent, uniqueValue } from '../helpers/factories.js';
import { FakeClock } from '../helpers/fake-clock.js';
import { notificationsOf } from '../helpers/notifications.js';
import { runConcurrently } from '../helpers/state.js';

const INTAKE_END = '2001-03-01T00:00:00.000Z';

const deadlines = (intakeEnd: string) => ({
  intake_end: intakeEnd,
  preference_end: '2001-04-01T00:00:00.000Z',
  testing_end: '2001-05-01T00:00:00.000Z',
});

describe('GĐ2: CV deadline reminders (US-1.7 AC-6)', () => {
  const clock = new FakeClock('2001-02-27T00:00:00.000Z');
  let instance1: AuthTestApp;
  let instance2: AuthTestApp;
  let scheduler1: DeadlineReminderScheduler;
  let scheduler2: DeadlineReminderScheduler;

  const withClock = { configure: (builder: TestingModuleBuilder) => builder.overrideProvider(Clock).useValue(clock) };

  beforeAll(async () => {
    [instance1, instance2] = await Promise.all([createAuthTestApp(withClock), createAuthTestApp(withClock)]);
    scheduler1 = instance1.app.get(DeadlineReminderScheduler);
    scheduler2 = instance2.app.get(DeadlineReminderScheduler);
  });

  afterAll(async () => {
    await Promise.all([instance1.close(), instance2.close()]);
  });

  async function studentUser(cohort: string): Promise<TestUser & { studentId: number }> {
    const student = await createStudent(instance1.db, { cohort, major: 'CNTT' });
    const user = await instance1.createLoginUser('STUDENT', { studentId: student.id });
    return { ...user, studentId: student.id };
  }

  async function intakeCampaign(cohort: string, intakeEnd = INTAKE_END, reminderHours?: number) {
    return createCampaign(instance1.db, {
      status: 'INTAKE',
      phaseDeadlines: deadlines(intakeEnd),
      config: {
        ...DEFAULT_CAMPAIGN_CONFIG,
        ...(reminderHours === undefined ? {} : { reminder_hours_before: reminderHours }),
        target: { cohorts: [cohort], majors: ['CNTT'] },
      },
    });
  }

  const remindersOf = async (user: TestUser) =>
    (await notificationsOf(instance1.db, user.id)).filter((row) => row.type === 'DEADLINE_REMINDER');

  it('GĐ2: students without active CV get one reminder before intake_end', async () => {
    const cohort = uniqueValue('K');
    const campaign = await intakeCampaign(cohort);
    const [noCv, submitted, onlyOldVersion, otherCohort] = await Promise.all([
      studentUser(cohort),
      studentUser(cohort),
      studentUser(cohort),
      studentUser(uniqueValue('K')),
    ]);
    await createCv(instance1.db, { studentId: submitted.studentId, campaignId: campaign.id });
    // A superseded version does not count: BR-01 looks at the active CV only.
    await createCv(instance1.db, { studentId: onlyOldVersion.studentId, campaignId: campaign.id, active: false });

    // More than 24 hours before the deadline: nothing yet.
    clock.set('2001-02-27T23:59:59.000Z');
    await scheduler1.runOnce();
    expect(await remindersOf(noCv)).toEqual([]);

    clock.set('2001-02-28T00:00:00.000Z');
    const report = await scheduler1.runOnce();
    expect(report.acquired).toBe(true);
    const dedupeKey = `deadline:${campaign.id}:intake_end:${INTAKE_END}`;
    expect(report.batches.filter((batch) => batch.dedupeKey === dedupeKey)).toEqual([
      { source: 'cv-intake', dedupeKey, created: 2 },
    ]);
    for (const user of [noCv, onlyOldVersion]) {
      const reminders = await remindersOf(user);
      expect(reminders).toHaveLength(1);
      expect(reminders[0]).toMatchObject({
        channels: ['IN_APP', 'EMAIL'],
        emailStatus: 'PENDING',
        dedupeKey,
        payload: { campaignId: campaign.id, campaignName: campaign.name, deadlineKey: 'intake_end', deadline: INTAKE_END },
      });
    }
    expect(await remindersOf(submitted)).toEqual([]);
    expect(await remindersOf(otherCohort)).toEqual([]);

    // At the deadline the window is closed.
    clock.set(INTAKE_END);
    const late = await scheduler1.runOnce();
    expect(late.batches.filter((batch) => batch.dedupeKey === dedupeKey)).toEqual([]);
  });

  it('GĐ2: reminder is not duplicated across reruns and instances', async () => {
    const cohort = uniqueValue('K');
    const campaign = await intakeCampaign(cohort);
    const students = await Promise.all([studentUser(cohort), studentUser(cohort)]);
    clock.set('2001-02-28T12:00:00.000Z');

    await scheduler1.runOnce();
    await scheduler1.runOnce();
    const results = await runConcurrently(
      () => scheduler1.runOnce(),
      () => scheduler2.runOnce(),
    );
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    for (const user of students) expect(await remindersOf(user)).toHaveLength(1);

    // An extended deadline is a new deadline: one more reminder before it.
    const extended = '2001-03-02T00:00:00.000Z';
    await instance1.db.update(campaigns).set({ phaseDeadlines: deadlines(extended) }).where(eq(campaigns.id, campaign.id));
    clock.set('2001-03-01T06:00:00.000Z');
    await scheduler2.runOnce();
    await scheduler1.runOnce();
    for (const user of students) {
      const reminders = await remindersOf(user);
      expect(reminders.map((row) => (row.payload as { deadline: string }).deadline)).toEqual([INTAKE_END, extended]);
    }
  });

  it('GĐ2: the reminder lead time follows the campaign parameter', async () => {
    const cohort = uniqueValue('K');
    await intakeCampaign(cohort, INTAKE_END, 48);
    const user = await studentUser(cohort);

    clock.set('2001-02-26T23:00:00.000Z');
    await scheduler1.runOnce();
    expect(await remindersOf(user)).toEqual([]);

    clock.set('2001-02-27T01:00:00.000Z');
    await scheduler1.runOnce();
    expect(await remindersOf(user)).toHaveLength(1);
  });
});
