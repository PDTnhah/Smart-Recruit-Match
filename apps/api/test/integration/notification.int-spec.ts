// US-1.7 AC-1, AC-2 (FR-8): notify writes in the caller's transaction and validates type/payload;
// each user lists, counts and marks only their own in-app notifications.
import { ApiErrorSchema, MarkAllReadResultSchema, type NotifyInput, NotificationListSchema } from '@srm/shared';
import { eq } from 'drizzle-orm';
import { companies } from '../../src/db/schema/index.js';
import { NotificationService } from '../../src/modules/notification/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { uniqueValue } from '../helpers/factories.js';
import { notificationsOf } from '../helpers/notifications.js';

const opened = (userIds: number[], campaignName = 'Đợt HK1'): NotifyInput => ({
  type: 'CAMPAIGN_OPENED',
  payload: { campaignId: 1, campaignName, intakeEnd: '2030-01-01T00:00:00.000Z' },
  userIds,
  channels: ['IN_APP'],
});

describe('FR-8: notification service and list (US-1.7)', () => {
  let t: AuthTestApp;
  let service: NotificationService;

  beforeAll(async () => {
    t = await createAuthTestApp();
    service = t.app.get(NotificationService);
  });

  afterAll(async () => {
    await t.close();
  });

  describe('AC-1: notify', () => {
    it('FR-8: notify writes rows in caller transaction and rolls back with it', async () => {
      const user = await t.createLoginUser('CENTER');
      const companyName = uniqueValue('company');

      await expect(
        t.db.transaction(async (tx) => {
          await tx.insert(companies).values({ name: companyName });
          await service.notify(opened([user.id]), { tx });
          throw new Error('business step failed');
        }),
      ).rejects.toThrow('business step failed');
      expect(await notificationsOf(t.db, user.id)).toEqual([]);
      expect(await t.db.select().from(companies).where(eq(companies.name, companyName))).toEqual([]);

      const pending = await t.db.transaction(async (tx) => {
        await tx.insert(companies).values({ name: companyName });
        return service.notify(opened([user.id]), { tx });
      });
      await service.push(pending);
      expect(pending.count).toBe(1);
      const [row] = await notificationsOf(t.db, user.id);
      expect(row).toMatchObject({
        type: 'CAMPAIGN_OPENED',
        channels: ['IN_APP'],
        readAt: null,
        emailStatus: null,
        payload: { campaignId: 1, campaignName: 'Đợt HK1' },
      });
    });

    it('FR-8: invalid payload is rejected and nothing is written', async () => {
      const user = await t.createLoginUser('CENTER');
      const bad = [
        { ...opened([user.id]), payload: { campaignId: 1 } },
        { ...opened([user.id]), type: 'NOT_A_TYPE' },
        { ...opened([user.id]), channels: [] },
        { ...opened([user.id]), userIds: [] },
      ] as unknown as NotifyInput[];
      for (const input of bad) {
        await expect(service.notify(input)).rejects.toThrow('invalid notification');
      }
      expect(await notificationsOf(t.db, user.id)).toEqual([]);
    });

    it('FR-8: an email notification enters the outbox as PENDING', async () => {
      const user = await t.createLoginUser('CENTER');
      await service.notify({ ...opened([user.id]), channels: ['IN_APP', 'EMAIL'] });
      const [row] = await notificationsOf(t.db, user.id);
      expect(row).toMatchObject({ emailStatus: 'PENDING', emailAttempts: 0, emailSentAt: null });
      expect(row?.emailNextAttemptAt).toBeInstanceOf(Date);
    });

    it('FR-8: the same dedupe key notifies a user once', async () => {
      const [first, second] = await Promise.all([t.createLoginUser('CENTER'), t.createLoginUser('CENTER')]);
      const dedupeKey = uniqueValue('dedupe');
      expect((await service.notify({ ...opened([first.id]), dedupeKey })).count).toBe(1);
      expect((await service.notify({ ...opened([first.id, second.id]), dedupeKey })).count).toBe(1);
      expect(await notificationsOf(t.db, first.id)).toHaveLength(1);
      expect(await notificationsOf(t.db, second.id)).toHaveLength(1);
    });
  });

  describe('AC-2: list and read state', () => {
    let alice: LoggedIn;
    let bob: LoggedIn;

    beforeAll(async () => {
      [alice, bob] = await Promise.all([t.loginAs('STUDENT'), t.loginAs('HR')]);
      for (const name of ['một', 'hai', 'ba']) await service.notify(opened([alice.user.id], `Đợt ${name}`));
      await service.notify(opened([bob.user.id], 'Đợt của Bob'));
      // Email only (like an HR invitation): never listed.
      await service.notify({
        type: 'HR_INVITED',
        payload: { companyId: 1, invitationPath: '/accept-invitation#secret', expiresAt: '2030-01-01T00:00:00.000Z' },
        userIds: [alice.user.id],
        channels: ['EMAIL'],
      });
    });

    const listOf = async (who: LoggedIn, query = '') =>
      NotificationListSchema.parse((await who.agent.get(api(`notifications${query}`)).expect(200)).body);

    it('FR-8: user lists only own notifications with unread count', async () => {
      const list = await listOf(alice);
      expect(list.items.map((item) => item.type === 'CAMPAIGN_OPENED' && item.payload.campaignName)).toEqual([
        'Đợt ba',
        'Đợt hai',
        'Đợt một',
      ]);
      expect(list.unreadCount).toBe(3);
      expect(list.nextBefore).toBeNull();
      expect(JSON.stringify(list)).not.toContain('secret');

      const bobs = await listOf(bob);
      expect(bobs.items).toHaveLength(1);
      expect(bobs.unreadCount).toBe(1);
    });

    it('FR-8: pages back with before', async () => {
      const first = await listOf(alice, '?limit=2');
      expect(first.items).toHaveLength(2);
      expect(first.nextBefore).toBe(first.items[1]?.id);
      const second = await listOf(alice, `?limit=2&before=${first.nextBefore}`);
      expect(second.items).toHaveLength(1);
      expect(second.nextBefore).toBeNull();
      expect(second.unreadCount).toBe(3);
    });

    it("FR-8: marking another user's notification returns 404", async () => {
      const [bobsOwn] = (await listOf(bob)).items;
      const res = await alice.agent.post(api(`notifications/${bobsOwn!.id}/read`)).expect(404);
      expect(ApiErrorSchema.parse(res.body).code).toBe('ENTITY_NOT_FOUND');
      expect((await listOf(bob)).unreadCount).toBe(1);

      const emailOnly = (await notificationsOf(t.db, alice.user.id)).find((row) => row.type === 'HR_INVITED');
      await alice.agent.post(api(`notifications/${emailOnly!.id}/read`)).expect(404);
    });

    it('FR-8: marks one, then all, as read', async () => {
      const [newest] = (await listOf(alice)).items;
      await alice.agent.post(api(`notifications/${newest!.id}/read`)).expect(204);
      const afterOne = await listOf(alice);
      expect(afterOne.unreadCount).toBe(2);
      const readAt = afterOne.items[0]?.readAt;
      expect(readAt).not.toBeNull();

      // Marking again keeps the first read time.
      await alice.agent.post(api(`notifications/${newest!.id}/read`)).expect(204);
      expect((await listOf(alice)).items[0]?.readAt).toBe(readAt);

      const res = await alice.agent.post(api('notifications/read-all')).expect(200);
      expect(MarkAllReadResultSchema.parse(res.body)).toEqual({ updated: 2 });
      expect((await listOf(alice)).unreadCount).toBe(0);
      expect((await listOf(bob)).unreadCount).toBe(1);
    });

    it('FR-8: anonymous callers get 401', async () => {
      await t.http().get(api('notifications')).expect(401);
      await t.http().post(api('notifications/read-all')).expect(401);
    });
  });
});
