// US-1.7 AC-3 (FR-8, AD-13): `GET /api/events/stream` delivers a user's notifications in real time,
// across API instances through Redis pub/sub, to that user only.
import { type Notification, SERVER_EVENTS } from '@srm/shared';
import { JwtService } from '@nestjs/jwt';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { EVENT_STREAM_SETTINGS } from '../../src/modules/notification/application/event-stream.service.js';
import { NotificationService } from '../../src/modules/notification/index.js';
import { type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { type EventStream, listen, openEventStream, type ServerEvent } from '../helpers/sse.js';

const PING_MS = 200;

const fastPing = {
  configure: (builder: TestingModuleBuilder) =>
    builder.overrideProvider(EVENT_STREAM_SETTINGS).useValue({ pingIntervalMs: PING_MS, maxLifetimeMs: 60_000 }),
};

const isNotification = (campaignName: string) => (event: ServerEvent) =>
  event.event === SERVER_EVENTS.NOTIFICATION &&
  (event.data as Notification).type === 'CAMPAIGN_OPENED' &&
  (event.data as Extract<Notification, { type: 'CAMPAIGN_OPENED' }>).payload.campaignName === campaignName;

describe('FR-8: event stream (US-1.7 AC-3)', () => {
  let instance1: AuthTestApp;
  let instance2: AuthTestApp;
  let baseUrl: string;
  let alice: LoggedIn;
  let bob: LoggedIn;
  const streams: EventStream[] = [];

  beforeAll(async () => {
    [instance1, instance2] = await Promise.all([createAuthTestApp(fastPing), createAuthTestApp(fastPing)]);
    baseUrl = await listen(instance1.app);
    [alice, bob] = await Promise.all([instance1.loginAs('STUDENT'), instance1.loginAs('CENTER')]);
  });

  afterAll(async () => {
    for (const stream of streams) stream.close();
    await Promise.all([instance1.close(), instance2.close()]);
  });

  async function open(token?: string): Promise<EventStream> {
    const stream = await openEventStream(baseUrl, token);
    streams.push(stream);
    return stream;
  }

  const notifyFromInstance2 = (userId: number, campaignName: string) =>
    instance2.app.get(NotificationService).notify({
      type: 'CAMPAIGN_OPENED',
      payload: { campaignId: 1, campaignName, intakeEnd: '2030-01-01T00:00:00.000Z' },
      userIds: [userId],
      channels: ['IN_APP'],
    });

  it('FR-8: notification created on instance 2 reaches SSE client on instance 1 via Redis', async () => {
    const stream = await open(alice.accessToken);
    expect(stream.status).toBe(200);
    // `ready` means the subscription is active; a client reloads its list at this point.
    await stream.next((event) => event.event === SERVER_EVENTS.READY);

    await notifyFromInstance2(alice.user.id, 'Đợt qua Redis');
    const received = await stream.next(isNotification('Đợt qua Redis'));
    expect(received.data).toMatchObject({
      type: 'CAMPAIGN_OPENED',
      readAt: null,
      payload: { campaignName: 'Đợt qua Redis' },
    });
  });

  it('FR-8: user B does not receive user A events', async () => {
    const [aliceStream, bobStream] = await Promise.all([open(alice.accessToken), open(bob.accessToken)]);
    await Promise.all([
      aliceStream.next((event) => event.event === SERVER_EVENTS.READY),
      bobStream.next((event) => event.event === SERVER_EVENTS.READY),
    ]);

    await notifyFromInstance2(alice.user.id, 'Chỉ cho Alice');
    await aliceStream.next(isNotification('Chỉ cho Alice'));
    // Give Bob's stream time to receive anything it wrongly would: two heartbeats.
    await bobStream.next((event) => event.event === SERVER_EVENTS.PING);
    await new Promise((resolve) => setTimeout(resolve, PING_MS * 2));
    expect(bobStream.events.filter((event) => event.event === SERVER_EVENTS.NOTIFICATION)).toEqual([]);
  });

  it('FR-8: a second stream of the same user also receives, and closing one keeps the other', async () => {
    const [first, second] = await Promise.all([open(alice.accessToken), open(alice.accessToken)]);
    await Promise.all([first, second].map((stream) => stream.next((event) => event.event === SERVER_EVENTS.READY)));
    first.close();
    await new Promise((resolve) => setTimeout(resolve, 100));

    await notifyFromInstance2(alice.user.id, 'Còn một tab');
    await second.next(isNotification('Còn một tab'));
  });

  it('FR-8: server sends heartbeat pings', async () => {
    const stream = await open(bob.accessToken);
    await stream.next((event) => event.event === SERVER_EVENTS.PING, PING_MS * 10);
  });

  it('FR-8: the stream ends when the access token that opened it expires', async () => {
    // Same claims as a normal token, 2 seconds of life left.
    const shortLived = await instance1.app
      .get(JwtService)
      .signAsync({ sub: String(bob.user.id), role: 'CENTER' }, { algorithm: 'HS256', expiresIn: 2 });
    const stream = await open(shortLived);
    expect(stream.status).toBe(200);
    await stream.next((event) => event.event === SERVER_EVENTS.READY);
    await expect(
      Promise.race([stream.ended.then(() => 'ended'), new Promise((resolve) => setTimeout(resolve, 5_000, 'open'))]),
    ).resolves.toBe('ended');
  });

  it('FR-8: unauthenticated stream returns 401', async () => {
    expect((await open()).status).toBe(401);
    expect((await open('not-a-token')).status).toBe(401);
  });
});
