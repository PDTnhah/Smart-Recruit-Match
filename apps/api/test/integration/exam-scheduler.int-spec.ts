// US-4.3 AC-9, AC-10 (BR-06, ARCHITECTURE › Tác vụ định kỳ, CONTEXT D51): the exam sweep closes
// sessions past their deadline and grace, and preferences whose test was not taken by
// `testing_end`. Only this file calls the sweep's runOnce(); its clock and deadlines are in
// June–July 2001, away from every other file's campaigns (LESSONS §22, test/helpers/fake-clock.ts).
import type { TestingModuleBuilder } from '@nestjs/testing';
import { ExamPaperSchema } from '@srm/shared';
import { eq, sql } from 'drizzle-orm';
import { Clock } from '../../src/common/clock/index.js';
import { examAnswers, preferences } from '../../src/db/schema/index.js';
import {
  EXAM_SESSION_CLOSED,
  type ExamSessionClosedEvent,
  ExamScheduler,
  type ExamSweepReport,
} from '../../src/modules/assessment/index.js';
import { PreferenceExamService } from '../../src/modules/matching/index.js';
import { api, type AuthTestApp, createAuthTestApp } from '../helpers/auth.js';
import { createExamFixture, type ExamFixtureOptions, minutesAfter, sessionRow } from '../helpers/exam.js';
import { FakeClock } from '../helpers/fake-clock.js';
import { captureEvents } from '../helpers/jd.js';
import { notificationsOfType } from '../helpers/notifications.js';
import { auditEntries } from '../helpers/state.js';

const START = '2001-06-04T08:00:00.000Z';

describe('GĐ5 exam sweep (US-4.3)', () => {
  const clock = new FakeClock(START);
  let t: AuthTestApp;
  let scheduler: ExamScheduler;
  let closedEvents: ExamSessionClosedEvent[];

  beforeAll(async () => {
    t = await createAuthTestApp({ configure: (b: TestingModuleBuilder) => b.overrideProvider(Clock).useValue(clock) });
    scheduler = t.app.get(ExamScheduler);
    closedEvents = captureEvents<ExamSessionClosedEvent>(t.app, EXAM_SESSION_CLOSED);
  });

  beforeEach(() => clock.set(START));

  afterAll(() => t.close());

  const fixture = (options: Partial<ExamFixtureOptions> = {}) => createExamFixture(t, { now: clock.now(), ...options });
  const preferenceRow = async (id: number) => {
    const [row] = await t.db.select().from(preferences).where(eq(preferences.id, id));
    return row!;
  };

  it('GĐ5 expired session closed at deadline_at; concurrent sweeps close once', async () => {
    const exam = await fixture();
    const paper = ExamPaperSchema.parse(
      (await exam.student.agent.post(api(`preferences/${exam.preferenceId}/exam/start`)).send().expect(200)).body,
    );
    const essay = paper.questions[1]!.questionId;
    await exam.student.agent
      .put(api(`exam-sessions/${paper.sessionId}/answers`))
      .send({ answers: [{ questionId: essay, answer: { text: 'Viết rồi mất mạng' } }] })
      .expect(200);
    const deadline = Date.parse(paper.deadlineAt);

    // At the very end of the grace the student may still save: not closed yet.
    clock.set(new Date(deadline + 10_000));
    expect((await scheduler.runOnce()).expired).not.toContain(paper.sessionId);
    expect((await sessionRow(t.db, paper.sessionId)).status).toBe('IN_PROGRESS');

    clock.set(new Date(deadline + 10_001));
    const reports: ExamSweepReport[] = await Promise.all([scheduler.runOnce(), scheduler.runOnce()]);
    expect(reports.flatMap((report) => report.expired).filter((id) => id === paper.sessionId)).toEqual([paper.sessionId]);
    expect(await sessionRow(t.db, paper.sessionId)).toMatchObject({
      status: 'EXPIRED',
      submittedAt: new Date(deadline),
      rowVersion: 1,
    });
    const answers = await t.db.select().from(examAnswers).where(eq(examAnswers.sessionId, paper.sessionId));
    expect(answers.map((row) => [row.questionId, row.answer])).toEqual([[essay, { text: 'Viết rồi mất mạng' }]]);
    const audit = await auditEntries(t.db, 'exam_session', paper.sessionId);
    expect(audit[0]).toMatchObject({ action: 'TRANSITION', actorKind: 'SYSTEM' });
    expect(closedEvents.filter((event) => event.sessionId === paper.sessionId)).toEqual([
      { sessionId: paper.sessionId, studentId: exam.studentId, bankId: exam.bankId, status: 'EXPIRED', submittedAt: paper.deadlineAt },
    ]);

    // The student comes back: the submit answers with the closed session, unchanged.
    const late = await exam.student.agent.post(api(`exam-sessions/${paper.sessionId}/submit`)).send().expect(200);
    expect(late.body).toMatchObject({ status: 'EXPIRED', submittedAt: paper.deadlineAt, answeredCount: 1 });
    expect((await scheduler.runOnce()).expired).not.toContain(paper.sessionId);
  });

  it('BR-06 untaken preference closed TEST_NOT_TAKEN; stale row skipped', async () => {
    const testingEnd = minutesAfter(clock.now(), 6 * 24 * 60);
    const untaken = await fixture({ testingEnd });
    const campaignId = untaken.campaignId;
    const taking = await fixture({ campaignId });
    const stale = await fixture({ campaignId });
    const reviewing = await fixture({ status: 'ALLOCATION_REVIEW', testingEnd: minutesAfter(clock.now(), -60) });
    const later = await fixture({ testingEnd: minutesAfter(clock.now(), 30 * 24 * 60) });

    // Twenty minutes before testing_end a student starts: the session ends at testing_end.
    clock.set(new Date(Date.parse(testingEnd) - 20 * 60_000));
    const paper = ExamPaperSchema.parse(
      (await taking.student.agent.post(api(`preferences/${taking.preferenceId}/exam/start`)).send().expect(200)).body,
    );
    expect(paper.deadlineAt).toBe(testingEnd);
    const before = await scheduler.runOnce();
    expect(before.notTaken).toEqual(expect.not.arrayContaining([untaken.preferenceId, taking.preferenceId, stale.preferenceId]));
    // Already past testing_end: an ALLOCATION_REVIEW campaign is swept too.
    expect(before.notTaken).toContain(reviewing.preferenceId);

    // A preference changed between the listing and its transaction is left for the next run.
    const exams = t.app.get(PreferenceExamService);
    const list = exams.listPendingTest.bind(exams);
    const listing = jest.spyOn(exams, 'listPendingTest').mockImplementation(async (id) => {
      const rows = await list(id);
      if (rows.some((row) => row.id === stale.preferenceId)) {
        await t.db
          .update(preferences)
          .set({ rowVersion: sql`${preferences.rowVersion} + 1` })
          .where(eq(preferences.id, stale.preferenceId));
      }
      return rows;
    });
    clock.set(new Date(Date.parse(testingEnd) + 10_001));
    let report: ExamSweepReport;
    try {
      report = await scheduler.runOnce();
    } finally {
      listing.mockRestore();
    }
    expect(report.acquired).toBe(true);
    expect(report.expired).toContain(paper.sessionId);
    expect(report.notTaken).toContain(untaken.preferenceId);
    expect(report.notTaken).not.toContain(stale.preferenceId);
    expect(report.notTaken).not.toContain(taking.preferenceId);
    expect(report.notTaken).not.toContain(later.preferenceId);

    expect(await preferenceRow(untaken.preferenceId)).toMatchObject({ status: 'CLOSED', rowVersion: 1 });
    expect(await preferenceRow(stale.preferenceId)).toMatchObject({ status: 'PENDING_TEST', rowVersion: 1 });
    // A session taken (here closed at testing_end by the sweep) keeps its preference for grading.
    expect(await preferenceRow(taking.preferenceId)).toMatchObject({ status: 'PENDING_TEST' });
    expect((await sessionRow(t.db, paper.sessionId)).status).toBe('EXPIRED');
    expect(await preferenceRow(later.preferenceId)).toMatchObject({ status: 'PENDING_TEST' });
    const [transition] = await auditEntries(t.db, 'application', untaken.preferenceId);
    expect(transition).toMatchObject({ action: 'TRANSITION', reason: 'TEST_NOT_TAKEN', actorKind: 'SYSTEM' });

    const notices = await notificationsOfType(t.db, 'EXAM_NOT_TAKEN', untaken.student.user.id);
    expect(notices.map((notice) => notice.payload)).toEqual([
      {
        campaignId,
        campaignName: expect.any(String) as unknown,
        preferenceId: untaken.preferenceId,
        rank: 1,
        jdTitle: 'Backend Intern',
        companyName: expect.any(String) as unknown,
      },
    ]);
    expect(await notificationsOfType(t.db, 'EXAM_NOT_TAKEN', taking.student.user.id)).toEqual([]);

    // The next run takes the stale row; nothing closed twice, no second notice. A preference with a
    // session is not even locked: it waits for grading (US-4.4).
    const locking = jest.spyOn(exams, 'lockForExam');
    let next: ExamSweepReport;
    let locked: number[];
    try {
      next = await scheduler.runOnce();
      locked = locking.mock.calls.map(([id]) => id);
    } finally {
      locking.mockRestore();
    }
    expect(locked).toContain(stale.preferenceId);
    expect(locked).not.toContain(taking.preferenceId);
    expect(next.notTaken).toContain(stale.preferenceId);
    expect(next.notTaken).not.toContain(untaken.preferenceId);
    expect(await preferenceRow(stale.preferenceId)).toMatchObject({ status: 'CLOSED' });
    expect(await notificationsOfType(t.db, 'EXAM_NOT_TAKEN', untaken.student.user.id)).toHaveLength(1);
    expect(await notificationsOfType(t.db, 'EXAM_NOT_TAKEN', stale.student.user.id)).toHaveLength(1);

    // After testing_end nobody starts a test any more.
    const refused = await untaken.student.agent.post(api(`preferences/${untaken.preferenceId}/exam/start`)).send();
    expect(refused.status).toBe(409);
  });
});
