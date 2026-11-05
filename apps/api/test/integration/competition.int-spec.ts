// US-3.4 AC-2–AC-5, AC-7 (FR-17, GĐ4, CONTEXT D48): the preference count of each JD in Redis matches
// the database, its level reaches the students of the campaign over SSE and their shortlist, and
// center staff hear once which JDs have fewer preferences than places after Q6.
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CompetitionUpdatedEventSchema,
  NotificationContentSchema,
  SERVER_EVENTS,
  type ShortlistResponse,
  ShortlistResponseSchema,
} from '@srm/shared';
import { count, eq, inArray, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { campaigns, jobDescriptions, matchRuns, preferences } from '../../src/db/schema/index.js';
import { CAMPAIGN_PHASE_CHANGED, type CampaignPhaseChangedEvent } from '../../src/modules/campaign/index.js';
import { AutoAssignPreferencesService } from '../../src/modules/matching/application/auto-assign-preferences.service.js';
import { LowPreferenceAlertService } from '../../src/modules/matching/application/low-preference-alert.service.js';
import { RULES_VERSION } from '../../src/modules/matching/domain/rules-version.js';
import { competitionKey } from '../../src/modules/matching/infrastructure/competition-counter.js';
import { EmailRenderer } from '../../src/modules/notification/application/email-renderer.js';
import { REDIS } from '../../src/redis/redis.module.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createPreference } from '../helpers/factories.js';
import { notificationsOfType, waitFor } from '../helpers/notifications.js';
import {
  createApprovedJds,
  createConfirmedCv,
  createPreferenceCampaign,
  type CvRef,
  scorePair,
  waitingPair,
} from '../helpers/shortlist.js';
import { type EventStream, listen, openEventStream, type ServerEvent } from '../helpers/sse.js';
import { runConcurrently } from '../helpers/state.js';

type Jd = { id: number; version: number };

const isCompetition = (event: ServerEvent) => event.event === SERVER_EVENTS.COMPETITION_UPDATED;

describe('GĐ4 competition level (US-3.4)', () => {
  let t: AuthTestApp;
  let redis: Redis;
  let baseUrl: string;
  const streams: EventStream[] = [];

  beforeAll(async () => {
    t = await createAuthTestApp();
    redis = t.app.get<Redis>(REDIS);
    baseUrl = await listen(t.app);
  });

  afterAll(async () => {
    for (const stream of streams) stream.close();
    await t.close();
  });

  /** Approved JDs of the campaign with these quotas, in id order. */
  async function jdsWithQuotas(campaignId: number, quotas: number[]): Promise<Jd[]> {
    const jds = await createApprovedJds(t.db, campaignId, quotas.length);
    for (const [index, jd] of jds.entries()) {
      await t.db.update(jobDescriptions).set({ quota: quotas[index]! }).where(eq(jobDescriptions.id, jd.id));
    }
    return jds;
  }

  /** A student with a confirmed CV in the campaign, scored `sCv` on each of `jds`. */
  async function studentIn(campaignId: number, jds: Jd[], sCv = 70) {
    const student = await t.loginAs('STUDENT');
    const studentId = student.user.studentId!;
    const row = await createConfirmedCv(t.db, studentId, campaignId);
    const cv: CvRef = { id: row.id, version: row.version, studentId, campaignId };
    for (const jd of jds) await scorePair(t.db, cv, jd, sCv);
    return { student, studentId, cv };
  }

  const put = (student: LoggedIn, campaignId: number, jdIds: number[]) =>
    student.agent
      .put(api('me/preferences'))
      .send({ campaignId, preferences: jdIds.map((jdId, index) => ({ jdId, rank: index + 1 })) })
      .expect(200);

  const shortlistOf = async (student: LoggedIn): Promise<ShortlistResponse> =>
    ShortlistResponseSchema.parse((await student.agent.get(api('me/shortlist')).expect(200)).body);

  async function dbCounts(jdIds: number[]): Promise<number[]> {
    const rows = await t.db
      .select({ jdId: preferences.jdId, nvCount: count() })
      .from(preferences)
      .where(inArray(preferences.jdId, jdIds))
      .groupBy(preferences.jdId);
    const counts = new Map(rows.map((row) => [row.jdId, row.nvCount]));
    return jdIds.map((jdId) => counts.get(jdId) ?? 0);
  }

  async function redisCounts(jdIds: number[]): Promise<(number | null)[]> {
    return (await redis.mget(jdIds.map(competitionKey))).map((value) => (value === null ? null : Number(value)));
  }

  /** Waits until each JD's counter equals its rows in the database: the recount runs after the event. */
  const countersSettled = (jdIds: number[]) =>
    waitFor(async () => {
      const [expected, actual] = await Promise.all([dbCounts(jdIds), redisCounts(jdIds)]);
      return expected.every((value, index) => actual[index] === value) ? expected : undefined;
    }, 15_000);

  async function open(user: LoggedIn): Promise<EventStream> {
    const stream = await openEventStream(baseUrl, user.accessToken);
    streams.push(stream);
    await stream.next((event) => event.event === SERVER_EVENTS.READY);
    return stream;
  }

  it('GĐ4 Redis counter matches DB under concurrent updates and rebuilds when missing', async () => {
    const campaign = await createPreferenceCampaign(t.db);
    const jds = await jdsWithQuotas(campaign.id, [2, 2, 2, 2]);
    const jdIds = jds.map((jd) => jd.id);
    const students = await Promise.all(Array.from({ length: 10 }, () => studentIn(campaign.id, jds)));

    // 20 saves at once from 10 students, two each, adding some JDs and dropping others.
    const at = (index: number) => jdIds[index % jdIds.length]!;
    const results = await runConcurrently(
      ...students.flatMap(({ student }, i) => [
        () => put(student, campaign.id, [at(i), at(i + 1)]),
        () => put(student, campaign.id, [at(i + 2)]),
      ]),
    );
    expect(results.filter((result) => result.status === 'rejected')).toEqual([]);

    const settled = await countersSettled(jdIds);
    expect(settled.reduce((sum, value) => sum + value, 0)).toBeGreaterThanOrEqual(students.length);
    // Still equal once every recount is done.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await redisCounts(jdIds)).toEqual(await dbCounts(jdIds));
    // The counters live until preference_end.
    const end = Math.floor(Date.parse(campaign.phaseDeadlines.preference_end!) / 1000);
    for (const jdId of jdIds) expect(await redis.call('EXPIRETIME', competitionKey(jdId))).toBe(end);

    // A lost key (Redis restarted): the next read counts it from the database and sets it again.
    await redis.del(competitionKey(jdIds[0]!));
    const body = await shortlistOf(students[0]!.student);
    const expected = await dbCounts(jdIds);
    expect(new Map(body.items.map((item) => [item.jd.id, item.competition.nvCount]))).toEqual(
      new Map(jdIds.map((jdId, index) => [jdId, expected[index]])),
    );
    expect(await redisCounts([jdIds[0]!])).toEqual([expected[0]]);
    expect(await redis.call('EXPIRETIME', competitionKey(jdIds[0]!))).toBe(end);
  });

  it('GĐ4 competition.updated pushed over SSE without other student data', async () => {
    const campaign = await createPreferenceCampaign(t.db);
    const jds = await jdsWithQuotas(campaign.id, [2, 2]);
    const [first, second] = jds.map((jd) => jd.id) as [number, number];
    const [viewer, chooser] = await Promise.all([studentIn(campaign.id, jds), studentIn(campaign.id, jds)]);
    const stream = await open(viewer.student);

    await put(chooser.student, campaign.id, [second, first]);
    const added = await stream.next(isCompetition, 10_000);
    // Exactly the campaign and the JDs: nothing about the student who chose (AC-3).
    expect(added.data).toEqual({
      campaignId: campaign.id,
      items: [
        { jdId: first, nvCount: 1, quota: 2, level: 'LOW' },
        { jdId: second, nvCount: 1, quota: 2, level: 'LOW' },
      ],
    });
    expect(CompetitionUpdatedEventSchema.parse(added.data)).toEqual(added.data);

    // Only the JD dropped is counted again: the one kept has as many preferences as before.
    await put(chooser.student, campaign.id, [first]);
    const dropped = await stream.next((event) => isCompetition(event) && event !== added, 10_000);
    expect(dropped.data).toEqual({ campaignId: campaign.id, items: [{ jdId: second, nvCount: 0, quota: 2, level: 'LOW' }] });
  });

  it('competition events scoped to students of the campaign', async () => {
    const campaign = await createPreferenceCampaign(t.db);
    const jds = await jdsWithQuotas(campaign.id, [1]);
    const [member, chooser] = await Promise.all([studentIn(campaign.id, jds), studentIn(campaign.id, jds)]);
    const elsewhere = await createPreferenceCampaign(t.db);
    const outsider = await studentIn(elsewhere.id, await jdsWithQuotas(elsewhere.id, [1]));
    const [hr, center, admin] = await Promise.all([t.loginAs('HR'), t.loginAs('CENTER'), t.loginAs('ADMIN')]);
    const [memberStream, ...others] = await Promise.all([member, outsider].map(({ student }) => open(student)).concat(
      [hr, center, admin].map((user) => open(user)),
    ));

    await put(chooser.student, campaign.id, [jds[0]!.id]);
    await memberStream!.next(isCompetition, 10_000);
    // One publish reaches every subscriber at once: by now the others would have it.
    await new Promise((resolve) => setTimeout(resolve, 300));
    for (const stream of others) expect(stream.events.filter(isCompetition)).toEqual([]);
  });

  it('GĐ4 shortlist carries competition and low-competition suggestion', async () => {
    // LOW below 1.5 preferences per place, HIGH from 3: the campaign's own thresholds.
    const campaign = await createPreferenceCampaign(t.db, { config: { competition_thresholds: { low_below: 1.5, high_from: 3 } } });
    const jds = await jdsWithQuotas(campaign.id, [2, 1, 1]);
    const [low, medium, high] = jds.map((jd) => jd.id) as [number, number, number];
    const viewer = await studentIn(campaign.id, jds, 80);
    const others = await Promise.all([0, 1, 2].map(() => studentIn(campaign.id, jds)));
    await put(others[0]!.student, campaign.id, [high, medium, low]);
    await put(others[1]!.student, campaign.id, [high, medium, low]);
    await put(others[2]!.student, campaign.id, [high]);
    await countersSettled([low, medium, high]);

    const expected = new Map([
      // 2 / 2 = 1 < 1.5 (MEDIUM with the default thresholds).
      [low, { competition: { nvCount: 2, quota: 2, level: 'LOW' }, lowCompetitionSuggestion: true }],
      [medium, { competition: { nvCount: 2, quota: 1, level: 'MEDIUM' }, lowCompetitionSuggestion: false }],
      [high, { competition: { nvCount: 3, quota: 1, level: 'HIGH' }, lowCompetitionSuggestion: false }],
    ]);
    const levels = (body: ShortlistResponse) =>
      new Map(body.items.map((item) => [item.jd.id, { competition: item.competition, lowCompetitionSuggestion: item.lowCompetitionSuggestion }]));
    expect(levels(await shortlistOf(viewer.student))).toEqual(expected);

    // Once preference selection is over the database answers, and no counter is set again.
    await redis.del(...jds.map((jd) => competitionKey(jd.id)));
    await t.db.update(campaigns).set({ status: 'TESTING' }).where(eq(campaigns.id, campaign.id));
    expect(levels(await shortlistOf(viewer.student))).toEqual(expected);
    expect(await redisCounts([low, medium, high])).toEqual([null, null, null]);
  });

  describe('FR-17 alert of JDs with few preferences (AC-5)', () => {
    // What a Q6 sweep does for one campaign. Not the sweep itself: it would run Q6 on the TESTING
    // campaigns of preferences.int-spec too, and take their students from its own assertions.
    const sweep = async (campaignId: number) => {
      const outcome = await t.app.get(AutoAssignPreferencesService).run(campaignId);
      await t.app.get(LowPreferenceAlertService).afterAutoAssign(campaignId, outcome);
    };

    // Every CENTER account gets every campaign's alert: read only this campaign's (LESSONS §22).
    const alertsOf = async (userId: number, campaignId: number) =>
      (await notificationsOfType(t.db, 'JD_LOW_PREFERENCES', userId)).filter(
        (row) => (row.payload as { campaignId?: number }).campaignId === campaignId,
      );

    it('FR-17 CENTER alerted once for JDs with preferences/quota < 1 after Q6', async () => {
      const center = await t.loginAs('CENTER');
      const campaign = await createPreferenceCampaign(t.db, { status: 'TESTING' });
      const [short, full, none] = await jdsWithQuotas(campaign.id, [3, 1, 2]);
      await createPreference(t.db, { campaignId: campaign.id, jdId: short!.id });
      await createPreference(t.db, { campaignId: campaign.id, jdId: full!.id });

      t.app.get(EventEmitter2).emit(CAMPAIGN_PHASE_CHANGED, {
        campaignId: campaign.id,
        from: 'PREFERENCE_SELECTION',
        to: 'TESTING',
        actorKind: 'SYSTEM',
      } satisfies CampaignPhaseChangedEvent);
      const notices = await waitFor(async () => {
        const rows = await alertsOf(center.user.id, campaign.id);
        return rows.length > 0 ? rows : undefined;
      });
      expect(notices).toEqual([
        expect.objectContaining({
          type: 'JD_LOW_PREFERENCES',
          channels: ['IN_APP', 'EMAIL'],
          dedupeKey: `jd_low_preferences:${campaign.id}`,
          payload: {
            campaignId: campaign.id,
            campaignName: campaign.name,
            jds: [
              { jdId: short!.id, title: 'Backend Intern', companyName: expect.any(String) as string, nvCount: 1, quota: 3 },
              { jdId: none!.id, title: 'Backend Intern', companyName: expect.any(String) as string, nvCount: 0, quota: 2 },
            ],
          },
        }),
      ]);
      // Another file's outbox worker may have sent it already.
      expect(['PENDING', 'SENT']).toContain(notices[0]!.emailStatus);

      const content = NotificationContentSchema.parse(notices[0]);
      const email = t.app
        .get(EmailRenderer)
        .render(content, { id: center.user.id, email: center.user.email, fullName: 'Lê Văn C', isActive: true });
      const listed = content.type === 'JD_LOW_PREFERENCES' ? content.payload.jds : [];
      const lines = listed.map((jd) => `- Backend Intern – ${jd.companyName}: ${jd.nvCount} nguyện vọng / ${jd.quota} chỉ tiêu`);
      expect(email.subject).toBe(`Đợt "${campaign.name}": 2 JD có ít nguyện vọng hơn chỉ tiêu`);
      // One JD per line.
      expect(email.text).toContain(`chỉ tiêu:\n${lines.join('\n')}\n\nXem đợt thực tập tại:`);
      expect(email.text).toContain(`http://srm.test/admin/campaigns/${campaign.id}`);
      expect(email.html).toContain('<li><strong>Backend Intern</strong>');

      // The sweep runs the alert again: nobody gets it twice, a CENTER account created since gets it.
      const later = await t.loginAs('CENTER');
      await sweep(campaign.id);
      expect(await alertsOf(center.user.id, campaign.id)).toHaveLength(1);
      expect(await alertsOf(later.user.id, campaign.id)).toHaveLength(1);
    });

    it('FR-17 no alert while Q6 still waits for scoring, nor when every JD has enough preferences', async () => {
      const center = await t.loginAs('CENTER');
      // Every JD has as many preferences as places.
      const enough = await createPreferenceCampaign(t.db, { status: 'TESTING' });
      const [filled] = await jdsWithQuotas(enough.id, [1]);
      await createPreference(t.db, { campaignId: enough.id, jdId: filled!.id });
      // A student without preferences whose second JD a running matching run still scores.
      const waiting = await createPreferenceCampaign(t.db, { status: 'TESTING' });
      const jds = await jdsWithQuotas(waiting.id, [1, 1]);
      const student = await studentIn(waiting.id, [jds[0]!]);
      await waitingPair(t.db, student.cv, jds[1]!);
      const [run] = await t.db
        .insert(matchRuns)
        .values({
          campaignId: waiting.id,
          status: 'RUNNING',
          actorKind: 'SYSTEM',
          rulesVersion: RULES_VERSION,
          pairsTotal: 2,
          pairsIneligible: 0,
          pairsSkipped: 0,
          pairsCached: 2,
          pairsSent: 0,
        })
        .returning({ id: matchRuns.id });

      await Promise.all([sweep(enough.id), sweep(waiting.id)]);
      expect(await alertsOf(center.user.id, enough.id)).toEqual([]);
      expect(await alertsOf(center.user.id, waiting.id)).toEqual([]);

      // The run ends: Q6 serves the student, then the alert counts the preferences Q6 gave.
      await t.db.update(matchRuns).set({ status: 'SUCCEEDED', finishedAt: sql`now()` }).where(eq(matchRuns.id, run!.id));
      await sweep(waiting.id);
      const notices = await alertsOf(center.user.id, waiting.id);
      expect(notices.map((row) => row.payload)).toEqual([
        {
          campaignId: waiting.id,
          campaignName: waiting.name,
          jds: [{ jdId: jds[1]!.id, title: 'Backend Intern', companyName: expect.any(String) as string, nvCount: 0, quota: 1 }],
        },
      ]);
      expect(await alertsOf(center.user.id, enough.id)).toEqual([]);
    });
  });
});
