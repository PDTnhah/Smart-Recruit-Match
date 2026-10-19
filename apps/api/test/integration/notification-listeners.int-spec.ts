// US-1.7 AC-5: events of EPIC-1 become notifications. `campaign.opened` notifies the campaign's
// target students (in app + email); `hr.invited` queues an invitation email whose link is issued
// when sent, so only the newest invitation of a re-invited HR goes out.
//
// No outbox worker runs here (see email-outbox.int-spec.ts); emails are rendered directly.
import { CampaignSchema, HrInvitationSchema, NotificationContentSchema } from '@srm/shared';
import { eq } from 'drizzle-orm';
import { Clock } from '../../src/common/clock/index.js';
import { users } from '../../src/db/schema/index.js';
import { InvitationService } from '../../src/modules/iam/index.js';
import { EmailRenderer } from '../../src/modules/notification/application/email-renderer.js';
import { CampaignOpenedListener } from '../../src/modules/notification/application/listeners/campaign-opened.listener.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createCompany, createStudent, uniqueValue } from '../helpers/factories.js';
import { FakeClock } from '../helpers/fake-clock.js';
import { notificationsOf, waitFor } from '../helpers/notifications.js';

const DAY_MS = 86_400_000;

describe('EPIC-1 notifications (US-1.7 AC-5)', () => {
  const clock = new FakeClock();
  let t: AuthTestApp;
  let center: LoggedIn;

  beforeAll(async () => {
    t = await createAuthTestApp({ configure: (b) => b.overrideProvider(Clock).useValue(clock) });
    center = await t.loginAs('CENTER');
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(() => {
    clock.set(new Date());
  });

  /** A student account; `isActive: false` makes it a deactivated one. */
  async function studentUser(cohort: string | null, major: string | null, isActive = true) {
    const student = await createStudent(t.db, { cohort, major });
    const user = await t.createLoginUser('STUDENT', { studentId: student.id });
    if (!isActive) await t.db.update(users).set({ isActive: false }).where(eq(users.id, user.id));
    return user;
  }

  describe('campaign.opened', () => {
    it('GĐ0: campaign.opened notifies target students', async () => {
      const cohort = uniqueValue('K');
      const target = { cohorts: [cohort], majors: ['CNTT', 'KTPM'] };
      // Matching ignores case and surrounding spaces, as campaign visibility does.
      const [inTarget, otherMajor, sameCaseless, inactive, otherCohort] = await Promise.all([
        studentUser(cohort, 'CNTT'),
        studentUser(cohort, 'KTPM'),
        studentUser(` ${cohort.toLowerCase()} `, 'cntt'),
        studentUser(cohort, 'CNTT', false),
        studentUser(uniqueValue('K'), 'CNTT'),
      ]);
      // A target student without an account cannot be told anything.
      await createStudent(t.db, { cohort, major: 'CNTT' });

      const now = Date.now();
      const phaseDeadlines = {
        intake_end: new Date(now + 7 * DAY_MS).toISOString(),
        preference_end: new Date(now + 14 * DAY_MS).toISOString(),
        testing_end: new Date(now + 21 * DAY_MS).toISOString(),
      };
      const created = CampaignSchema.parse(
        (await center.agent.post(api('campaigns')).send({ name: 'Đợt HK2 2026', target, phaseDeadlines }).expect(201))
          .body,
      );
      await center.agent.post(api(`campaigns/${created.id}/open`)).send({ rowVersion: created.rowVersion }).expect(200);

      const recipients = [inTarget, otherMajor, sameCaseless];
      const rows = await waitFor(async () => {
        const found = await notificationsOf(t.db, ...recipients.map((user) => user.id));
        return found.length === recipients.length ? found : undefined;
      });
      for (const row of rows) {
        expect(row).toMatchObject({
          type: 'CAMPAIGN_OPENED',
          channels: ['IN_APP', 'EMAIL'],
          payload: { campaignId: created.id, campaignName: 'Đợt HK2 2026', intakeEnd: phaseDeadlines.intake_end },
          dedupeKey: `campaign_opened:${created.id}`,
        });
        expect(['PENDING', 'SENT']).toContain(row.emailStatus);
      }
      expect(await notificationsOf(t.db, inactive.id, otherCohort.id)).toEqual([]);

      // The same event again (a retried listener) notifies nobody twice.
      expect(await t.app.get(CampaignOpenedListener).notifyTargetStudents(created.id)).toBe(0);
      expect(await notificationsOf(t.db, ...recipients.map((user) => user.id))).toHaveLength(3);
    });
  });

  describe('hr.invited', () => {
    async function invite(companyId: number, email: string) {
      const res = await center.agent
        .post(api(`companies/${companyId}/hr-invitations`))
        .send({ email, fullName: 'Lê Văn HR' })
        .expect(201);
      return HrInvitationSchema.parse(res.body);
    }

    const invitationRows = async (userId: number) =>
      (await notificationsOf(t.db, userId)).filter((row) => row.type === 'HR_INVITED');

    const accept = (invitationPath: string) =>
      t
        .http()
        .post(api('auth/accept-invitation'))
        .send({ token: invitationPath.split('#')[1], password: 'Mat-khau-moi-123' });

    it('FR-3: hr.invited emails the invite link', async () => {
      const company = await createCompany(t.db);
      const email = `${uniqueValue('hr')}@company.test`.toLowerCase();
      const first = await invite(company.id, email);
      const userId = first.account.id;

      const [queued] = await waitFor(async () => {
        const rows = await invitationRows(userId);
        return rows.length === 1 ? rows : undefined;
      });
      // Email only, and no live token at rest: the link is issued when the email is sent.
      expect(queued).toMatchObject({ channels: ['EMAIL'], emailStatus: 'PENDING', payload: { companyId: company.id } });
      expect(JSON.stringify(queued?.payload)).not.toContain('accept-invitation');

      // What the worker sends: an absolute link to the current invitation.
      const link = await t.app.get(InvitationService).currentInvitationLink(userId);
      expect(link?.invitationPath).toMatch(/^\/accept-invitation#/);
      const content = NotificationContentSchema.parse(queued);
      const message = t.app
        .get(EmailRenderer)
        .render(content, { id: userId, email, fullName: 'Lê Văn HR', isActive: true }, { invitation: link! });
      expect(message.subject).toBe('Lời mời tham gia Smart Recruit Match');
      expect(message.html).toContain(`href="http://srm.test${link!.invitationPath}"`);
      expect(message.text).toContain(`http://srm.test${link!.invitationPath}`);
      expect(message.text).toContain('Chào Lê Văn HR');
    });

    it('FR-3: after a re-invite only the newest invitation is emailed', async () => {
      const company = await createCompany(t.db);
      const email = `${uniqueValue('hr')}@company.test`.toLowerCase();
      const first = await invite(company.id, email);
      const userId = first.account.id;
      await waitFor(async () => ((await invitationRows(userId)).length === 1 ? true : undefined));

      clock.advance({ minutes: 5 });
      await invite(company.id, email);
      const rows = await waitFor(async () => {
        const found = await invitationRows(userId);
        return found.length === 2 ? found : undefined;
      });
      // The older email still waiting is withdrawn; the HR gets one email.
      expect(rows.map((row) => row.emailStatus)).toEqual(['CANCELLED', 'PENDING']);

      // The link the worker would send now opens the newest invitation; the first link does not.
      const link = await t.app.get(InvitationService).currentInvitationLink(userId);
      await accept(first.invitationPath).expect(422);
      await accept(link!.invitationPath).expect(200);
      // Accepted: nothing left to email.
      expect(await t.app.get(InvitationService).currentInvitationLink(userId)).toBeNull();
    });
  });
});
