// US-1.7 AC-4 (FR-8): the outbox worker sends notification emails, retries SMTP failures, gives up
// after 3 attempts, and two instances never send the same email.
//
// Only this file runs the worker. Its clock is fake and set in 1999, and the worker takes only
// emails due by its clock, so it never touches emails other test files create (real time, or 2001
// in the reminder test). Do not run the worker elsewhere with the real clock: it would take these.
import type { TestingModuleBuilder } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { Clock } from '../../src/common/clock/index.js';
import { companies, users } from '../../src/db/schema/index.js';
import { EmailOutboxWorker } from '../../src/modules/notification/application/email-outbox.worker.js';
import { SYSTEM_ACTOR } from '../../src/modules/audit/index.js';
import { InvitationService } from '../../src/modules/iam/index.js';
import { MAIL_TRANSPORT } from '../../src/modules/notification/infrastructure/mailer.js';
import { NotificationService } from '../../src/modules/notification/index.js';
import { api, type AuthTestApp, createAuthTestApp } from '../helpers/auth.js';
import { createCompany, uniqueValue } from '../helpers/factories.js';
import { FakeClock } from '../helpers/fake-clock.js';
import { FakeMailTransport } from '../helpers/mail.js';
import { notificationsOf, waitFor } from '../helpers/notifications.js';
import { runConcurrently } from '../helpers/state.js';

const START = '1999-06-01T00:00:00.000Z';

describe('FR-8: email outbox (US-1.7 AC-4)', () => {
  const clock = new FakeClock(START);
  const mail1 = new FakeMailTransport();
  const mail2 = new FakeMailTransport();
  let instance1: AuthTestApp;
  let instance2: AuthTestApp;
  let worker1: EmailOutboxWorker;
  let worker2: EmailOutboxWorker;
  let notifications: NotificationService;

  const withMail = (mail: FakeMailTransport) => ({
    configure: (builder: TestingModuleBuilder) =>
      builder.overrideProvider(Clock).useValue(clock).overrideProvider(MAIL_TRANSPORT).useValue(mail),
  });

  beforeAll(async () => {
    [instance1, instance2] = await Promise.all([createAuthTestApp(withMail(mail1)), createAuthTestApp(withMail(mail2))]);
    worker1 = instance1.app.get(EmailOutboxWorker);
    worker2 = instance2.app.get(EmailOutboxWorker);
    notifications = instance1.app.get(NotificationService);
  });

  afterAll(async () => {
    await Promise.all([instance1.close(), instance2.close()]);
  });

  beforeEach(() => {
    clock.set(START);
    for (const mail of [mail1, mail2]) {
      mail.failure = null;
      mail.delayMs = 0;
    }
  });

  async function recipient(fullName = 'Trần Thị Bích') {
    return instance1.createLoginUser('CENTER').then(async (user) => {
      await instance1.db.update(users).set({ fullName }).where(eq(users.id, user.id));
      return { ...user, fullName };
    });
  }

  const remind = (userIds: number[], campaignName = 'Đợt HK1 & HK2') =>
    notifications.notify({
      type: 'DEADLINE_REMINDER',
      payload: { campaignId: 3, campaignName, deadlineKey: 'intake_end', deadline: '1999-06-02T10:00:00.000Z' },
      userIds,
      channels: ['IN_APP', 'EMAIL'],
    });

  it('FR-8: outbox sends email and records sent time', async () => {
    const user = await recipient();
    await remind([user.id]);

    const report = await worker1.runOnce();
    expect(report.sent).toBeGreaterThanOrEqual(1);
    const [message] = mail1.to(user.email);
    expect(message?.subject).toBe('Nhắc hạn: nộp CV cho đợt "Đợt HK1 & HK2"');
    expect(message?.text).toContain('Chào Trần Thị Bích');
    // Vietnam time (UTC+7) and an absolute link from WEB_ORIGIN.
    expect(message?.text).toContain('02/06/1999 17:00');
    expect(message?.text).toContain('http://srm.test/sv/cv');
    // HTML escapes what users typed; the subject and plain text do not need to.
    expect(message?.html).toContain('Đợt HK1 &amp; HK2');

    const [row] = await notificationsOf(instance1.db, user.id);
    expect(row).toMatchObject({ emailStatus: 'SENT', emailAttempts: 1, emailNextAttemptAt: null, emailLastError: null });
    expect(row?.emailSentAt?.toISOString()).toBe(START);

    // Sent once: a second run finds nothing for this user.
    await worker1.runOnce();
    expect(mail1.to(user.email)).toHaveLength(1);
  });

  it('FR-8: SMTP failure retries then marks failed without affecting business transaction', async () => {
    const user = await recipient();
    const companyName = uniqueValue('company');
    // The business change and its notification commit together.
    const pending = await instance1.db.transaction(async (tx) => {
      await tx.insert(companies).values({ name: companyName });
      return notifications.notify(
        {
          type: 'CAMPAIGN_OPENED',
          payload: { campaignId: 3, campaignName: 'Đợt lỗi SMTP', intakeEnd: '1999-07-01T00:00:00.000Z' },
          userIds: [user.id],
          channels: ['IN_APP', 'EMAIL'],
        },
        { tx },
      );
    });
    await notifications.push(pending);
    mail1.failure = new Error('connect ECONNREFUSED 127.0.0.1:1025');

    await worker1.runOnce();
    let [row] = await notificationsOf(instance1.db, user.id);
    expect(row).toMatchObject({ emailStatus: 'PENDING', emailAttempts: 1, emailLastError: 'connect ECONNREFUSED 127.0.0.1:1025' });
    expect(row?.emailNextAttemptAt?.toISOString()).toBe('1999-06-01T00:01:00.000Z');

    // Not due yet: nothing happens before the retry time.
    await worker1.runOnce();
    expect((await notificationsOf(instance1.db, user.id))[0]?.emailAttempts).toBe(1);

    clock.advance({ minutes: 1 });
    await worker1.runOnce();
    [row] = await notificationsOf(instance1.db, user.id);
    expect(row).toMatchObject({ emailStatus: 'PENDING', emailAttempts: 2 });
    expect(row?.emailNextAttemptAt?.toISOString()).toBe('1999-06-01T00:06:00.000Z');

    clock.advance({ minutes: 5 });
    await worker1.runOnce();
    [row] = await notificationsOf(instance1.db, user.id);
    expect(row).toMatchObject({ emailStatus: 'FAILED', emailAttempts: 3, emailNextAttemptAt: null, emailSentAt: null });

    clock.advance({ hours: 1 });
    mail1.failure = null;
    await worker1.runOnce();
    expect(mail1.to(user.email)).toEqual([]);
    expect((await notificationsOf(instance1.db, user.id))[0]?.emailStatus).toBe('FAILED');

    // The business row and the in-app notification are untouched.
    expect(await instance1.db.select().from(companies).where(eq(companies.name, companyName))).toHaveLength(1);
    expect(row?.readAt).toBeNull();
  });

  it('FR-8: an inactive recipient is not emailed', async () => {
    const user = await recipient();
    await remind([user.id]);
    await instance1.db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

    await worker1.runOnce();
    expect(mail1.to(user.email)).toEqual([]);
    expect((await notificationsOf(instance1.db, user.id))[0]).toMatchObject({ emailStatus: 'CANCELLED' });
  });

  it('FR-8: a retried reminder is cancelled once its deadline has passed', async () => {
    const user = await recipient();
    await remind([user.id]);
    mail1.failure = new Error('SMTP down');
    await worker1.runOnce();
    expect((await notificationsOf(instance1.db, user.id))[0]).toMatchObject({ emailStatus: 'PENDING', emailAttempts: 1 });

    // The reminder is for 1999-06-02 10:00; the retry comes after it.
    clock.set('1999-06-02T10:00:00.000Z');
    mail1.failure = null;
    await worker1.runOnce();
    expect(mail1.to(user.email)).toEqual([]);
    expect((await notificationsOf(instance1.db, user.id))[0]).toMatchObject({
      emailStatus: 'CANCELLED',
      emailLastError: 'out of date: the deadline has passed',
    });
  });

  it('FR-3: the invitation email links to the current invitation; an accepted one is not emailed', async () => {
    const company = await createCompany(instance1.db);
    const email = `${uniqueValue('hr')}@company.test`.toLowerCase();
    const invitation = await instance1.app
      .get(InvitationService)
      .invite(SYSTEM_ACTOR, { companyId: company.id, email, fullName: 'Phạm HR' });
    const userId = invitation.account.id;
    // The hr.invited listener queues the email (clock in 1999, so this worker takes it).
    await waitFor(async () =>
      (await notificationsOf(instance1.db, userId)).some((row) => row.type === 'HR_INVITED') ? true : undefined,
    );

    await worker1.runOnce();
    const [message] = mail1.to(email);
    const link = /http:\/\/srm\.test(\/accept-invitation#[\w.-]+)/.exec(message?.text ?? '')?.[1];
    expect(link).toBeDefined();
    expect(message?.subject).toBe('Lời mời tham gia Smart Recruit Match');
    // The emailed link works: it carries the account's current invitation.
    await instance1
      .http()
      .post(api('auth/accept-invitation'))
      .send({ token: link!.split('#')[1], password: 'Mat-khau-moi-123' })
      .expect(200);

    // Accepted: a later invitation email has nothing to link to and is cancelled.
    await notifications.notify({ type: 'HR_INVITED', payload: { companyId: company.id }, userIds: [userId], channels: ['EMAIL'] });
    await worker1.runOnce();
    expect(mail1.to(email)).toHaveLength(1);
    const rows = (await notificationsOf(instance1.db, userId)).filter((row) => row.type === 'HR_INVITED');
    expect(rows.map((row) => row.emailStatus)).toEqual(['SENT', 'CANCELLED']);
  });

  it('FR-8: two workers never send the same email twice', async () => {
    const recipients = await Promise.all(Array.from({ length: 12 }, () => recipient()));
    await remind(recipients.map((user) => user.id));
    mail1.delayMs = 20;
    mail2.delayMs = 20;

    const results = await runConcurrently(
      () => worker1.runOnce(),
      () => worker2.runOnce(),
    );
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);

    for (const user of recipients) {
      expect(mail1.to(user.email).length + mail2.to(user.email).length).toBe(1);
    }
    const rows = await notificationsOf(instance1.db, ...recipients.map((user) => user.id));
    expect(rows.map((row) => row.emailStatus)).toEqual(recipients.map(() => 'SENT'));
    // Both instances took part.
    expect(recipients.some((user) => mail1.to(user.email).length === 1)).toBe(true);
    expect(recipients.some((user) => mail2.to(user.email).length === 1)).toBe(true);
  });
});
