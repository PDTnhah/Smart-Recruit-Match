// US-1.10 AC-5, AC-8 (FR-41, CONTEXT D56): students of the target and HR of the companies with a JD
// in the campaign hear of moved deadlines and of a cancellation, in the app and by email. Students
// are told by the notification module, HR by the company module.
//
// No outbox worker runs here (see email-outbox.int-spec.ts); emails are rendered directly.
import { type Campaign, CampaignSchema, NotificationContentSchema } from '@srm/shared';
import { EmailRenderer, formatVietnamTime } from '../../src/modules/notification/application/email-renderer.js';
import { CampaignChangesListener } from '../../src/modules/notification/application/listeners/campaign-changes.listener.js';
import { HrCampaignChangesListener } from '../../src/modules/company/application/campaign-changes.listener.js';
import type { CampaignUpdatedEvent } from '../../src/modules/campaign/index.js';
import { NotificationService } from '../../src/modules/notification/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn, type TestUser } from '../helpers/auth.js';
import { createCompany, createJobDescription, createStudent, uniqueValue } from '../helpers/factories.js';
import { type NotificationRow, notificationsOf, notificationsOfType, waitFor } from '../helpers/notifications.js';

const DAY = 86_400_000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

describe('FR-41: notices of a changed or cancelled campaign (US-1.10 AC-5, AC-8)', () => {
  let t: AuthTestApp;
  let center: LoggedIn;

  beforeAll(async () => {
    t = await createAuthTestApp();
    center = await t.loginAs('CENTER');
  });

  afterAll(async () => {
    await t.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  interface Audience {
    campaign: Campaign;
    student: TestUser;
    hr: TestUser;
    /** Neither in the target nor HR of a company with a JD in the campaign. */
    outsiders: TestUser[];
  }

  /**
   * An open campaign with one target student and one HR whose company has a JD in it; outside it a
   * student of another cohort, an HR of a company without a JD and an HR whose JD is elsewhere.
   */
  async function openAudience(): Promise<Audience> {
    const cohort = uniqueValue('K');
    const created = CampaignSchema.parse(
      (
        await center.agent
          .post(api('campaigns'))
          .send({
            name: 'Đợt HK2 2026',
            target: { cohorts: [cohort], majors: ['CNTT'] },
            phaseDeadlines: { intake_end: inDays(7), preference_end: inDays(14), testing_end: inDays(21) },
          })
          .expect(201)
      ).body,
    );
    const [withJd, withoutJd, elsewhere] = await Promise.all([createCompany(t.db), createCompany(t.db), createCompany(t.db)]);
    await createJobDescription(t.db, { campaignId: created.id, companyId: withJd.id });
    await createJobDescription(t.db, { companyId: elsewhere.id });
    const [inTarget, otherCohort] = await Promise.all([
      createStudent(t.db, { cohort, major: 'CNTT' }),
      createStudent(t.db, { cohort: uniqueValue('K'), major: 'CNTT' }),
    ]);
    const [student, outsider, hr, hrWithoutJd, hrElsewhere] = await Promise.all([
      t.createLoginUser('STUDENT', { studentId: inTarget.id }),
      t.createLoginUser('STUDENT', { studentId: otherCohort.id }),
      t.createLoginUser('HR', { companyId: withJd.id }),
      t.createLoginUser('HR', { companyId: withoutJd.id }),
      t.createLoginUser('HR', { companyId: elsewhere.id }),
    ]);
    const campaign = CampaignSchema.parse(
      (await center.agent.post(api(`campaigns/${created.id}/open`)).send({ rowVersion: 0 }).expect(200)).body,
    );
    // The opening notice reaches the target student first; wait so its listener is done.
    await waitFor(async () => ((await notificationsOf(t.db, student.id)).length === 1 ? true : undefined));
    return { campaign, student, hr, outsiders: [outsider, hrWithoutJd, hrElsewhere] };
  }

  /** The one row of `type` of each user, in the order of `users`; two modules write them. */
  const rowsOf = (type: NotificationRow['type'], ...users: TestUser[]) =>
    Promise.all(
      users.map((user) =>
        waitFor(async () => {
          const [row, extra] = await notificationsOfType(t.db, type, user.id);
          return row && !extra ? row : undefined;
        }),
      ),
    );

  function render(row: NotificationRow, user: TestUser) {
    return t.app
      .get(EmailRenderer)
      .render(NotificationContentSchema.parse(row), { id: user.id, email: user.email, fullName: 'Người nhận', isActive: true });
  }

  it('FR-41: a deadline move tells target students and HR, with before, after and reason, once per edit', async () => {
    const { campaign, student, hr, outsiders } = await openAudience();
    const before = campaign.phaseDeadlines.testing_end!;
    const after = inDays(28);
    const res = await center.agent
      .patch(api(`campaigns/${campaign.id}`))
      .send({ rowVersion: campaign.rowVersion, phaseDeadlines: { testing_end: after }, reason: 'Lịch thi của trường đổi' })
      .expect(200);
    const edited = CampaignSchema.parse(res.body);

    const [forStudent, forHr] = await rowsOf('CAMPAIGN_DEADLINES_CHANGED', student, hr);
    const move = { key: 'testing_end', before, after };
    expect(forStudent).toMatchObject({
      channels: ['IN_APP', 'EMAIL'],
      payload: { campaignId: campaign.id, campaignName: 'Đợt HK2 2026', audience: 'STUDENT', deadlines: [move] },
      dedupeKey: `campaign_deadlines_changed:${campaign.id}:${edited.rowVersion}`,
    });
    expect(forHr).toMatchObject({ payload: { audience: 'HR', deadlines: [move], reason: 'Lịch thi của trường đổi' } });
    expect(await notificationsOfType(t.db, 'CAMPAIGN_DEADLINES_CHANGED', ...outsiders.map((user) => user.id))).toEqual([]);

    // Each line of the plain-text email stands on its own (LESSONS §35); links lead to each portal.
    const studentEmail = render(forStudent!, student);
    expect(studentEmail.subject).toBe('Đợt thực tập "Đợt HK2 2026" đổi mốc thời gian');
    expect(studentEmail.text).toContain(
      `\n- Hạn làm bài test: ${formatVietnamTime(after)} (trước đây ${formatVietnamTime(before)})\n`,
    );
    expect(studentEmail.text).toContain('Lý do: Lịch thi của trường đổi');
    expect(studentEmail.text).toContain(`http://srm.test/sv/cv?campaign=${campaign.id}`);
    const hrEmail = render(forHr!, hr);
    expect(hrEmail.text).toContain('- Hạn sinh viên làm bài test:');
    expect(hrEmail.html).toContain('href="http://srm.test/hr/job-descriptions"');

    // The same edit again (a retried listener) tells nobody twice.
    const event: CampaignUpdatedEvent = {
      campaignId: campaign.id,
      rowVersion: edited.rowVersion,
      targetBefore: null,
      configKeys: [],
      deadlines: [{ key: 'testing_end', before, after }],
      reason: 'Lịch thi của trường đổi',
    };
    expect(await t.app.get(CampaignChangesListener).notifyDeadlinesChanged(event)).toBe(0);
    expect(await t.app.get(HrCampaignChangesListener).notifyDeadlinesChanged(event)).toBe(0);

    // A later edit moving a deadline again is another notice.
    await center.agent
      .patch(api(`campaigns/${campaign.id}`))
      .send({ rowVersion: edited.rowVersion, phaseDeadlines: { preference_end: inDays(15) }, reason: 'Thêm một ngày' })
      .expect(200);
    await waitFor(async () =>
      (await notificationsOfType(t.db, 'CAMPAIGN_DEADLINES_CHANGED', student.id, hr.id)).length === 4 ? true : undefined,
    );
  });

  it('FR-41: an edit that moves no deadline tells nobody', async () => {
    const { campaign, student } = await openAudience();
    await center.agent
      .patch(api(`campaigns/${campaign.id}`))
      .send({ rowVersion: campaign.rowVersion, name: 'Đợt HK2 2026 (sửa tên)', reason: 'Sửa chính tả' })
      .expect(200);
    // The listeners return before reading anything; called directly, they create nothing either.
    const event: CampaignUpdatedEvent = {
      campaignId: campaign.id,
      rowVersion: campaign.rowVersion + 1,
      targetBefore: null,
      configKeys: [],
      deadlines: [],
      reason: 'Sửa chính tả',
    };
    await t.app.get(CampaignChangesListener).handleUpdated(event);
    await t.app.get(HrCampaignChangesListener).handleUpdated(event);
    expect(await notificationsOfType(t.db, 'CAMPAIGN_DEADLINES_CHANGED', student.id)).toEqual([]);
  });

  it('FR-41: a cancellation tells target students and HR the reason, once', async () => {
    const { campaign, student, hr, outsiders } = await openAudience();
    // What the center types reaches the email as text, never as markup.
    const reason = 'Không đủ doanh nghiệp <b>& đối tác</b>';
    await center.agent
      .post(api(`campaigns/${campaign.id}/cancel`))
      .send({ rowVersion: campaign.rowVersion, reason })
      .expect(200);

    const [forStudent, forHr] = await rowsOf('CAMPAIGN_CANCELLED', student, hr);
    expect(forStudent).toMatchObject({
      channels: ['IN_APP', 'EMAIL'],
      payload: { campaignId: campaign.id, audience: 'STUDENT', reason },
      dedupeKey: `campaign_cancelled:${campaign.id}`,
    });
    expect(forHr).toMatchObject({ payload: { audience: 'HR' } });
    expect(await notificationsOfType(t.db, 'CAMPAIGN_CANCELLED', ...outsiders.map((user) => user.id))).toEqual([]);

    // The campaign is hidden: the emails lead to each portal's home page.
    const studentEmail = render(forStudent!, student);
    expect(studentEmail.subject).toBe('Đợt thực tập "Đợt HK2 2026" đã bị hủy');
    expect(studentEmail.text).toContain(`Lý do: ${reason}`);
    expect(studentEmail.html).toContain('Lý do: Không đủ doanh nghiệp &lt;b&gt;&amp; đối tác&lt;/b&gt;');
    expect(studentEmail.html).toContain('href="http://srm.test/sv"');
    expect(render(forHr!, hr).html).toContain('href="http://srm.test/hr"');

    const event = { campaignId: campaign.id, reason };
    expect(await t.app.get(CampaignChangesListener).notifyCancelled(event)).toBe(0);
    expect(await t.app.get(HrCampaignChangesListener).notifyCancelled(event)).toBe(0);
  });

  it('FR-41: a failing notice is logged; the edit and the cancellation still answer 200', async () => {
    const { campaign } = await openAudience();
    const notify = jest.spyOn(t.app.get(NotificationService), 'notify').mockRejectedValue(new Error('db down'));
    const edited = CampaignSchema.parse(
      (
        await center.agent
          .patch(api(`campaigns/${campaign.id}`))
          .send({ rowVersion: campaign.rowVersion, phaseDeadlines: { testing_end: inDays(30) }, reason: 'Lùi hạn' })
          .expect(200)
      ).body,
    );
    await center.agent
      .post(api(`campaigns/${campaign.id}/cancel`))
      .send({ rowVersion: edited.rowVersion, reason: 'Hủy' })
      .expect(200);
    // Both listeners of both events tried, and failed.
    await waitFor(() => Promise.resolve(notify.mock.calls.length >= 4 ? true : undefined));
    expect(CampaignSchema.parse((await center.agent.get(api(`campaigns/${campaign.id}`)).expect(200)).body).status).toBe(
      'CANCELLED',
    );
  });
});
