// US-1.5 AC-3 (FR-3): an invited HR sets a password through the invitation link, then logs in.
import { ApiErrorSchema, AuthSessionSchema, HrInvitationSchema } from '@srm/shared';
import { Clock } from '../../src/common/clock/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn, refreshCookieFrom } from '../helpers/auth.js';
import { createCompany, uniqueValue } from '../helpers/factories.js';
import { FakeClock } from '../helpers/fake-clock.js';
import { runConcurrently } from '../helpers/state.js';

const PASSWORD = 'Mat-khau-moi-123';

describe('FR-3: accepting an HR invitation (US-1.5 AC-3)', () => {
  let t: AuthTestApp;
  let center: LoggedIn;
  const clock = new FakeClock();

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

  /** Invites a fresh HR account and returns its email and token. */
  async function invite(): Promise<{ email: string; token: string; companyId: number }> {
    const company = await createCompany(t.db);
    const email = `${uniqueValue('invitee')}@company.test`.toLowerCase();
    const res = await center.agent
      .post(api(`companies/${company.id}/hr-invitations`))
      .send({ email, fullName: 'HR được mời' })
      .expect(201);
    const token = HrInvitationSchema.parse(res.body).invitationPath.split('#')[1]!;
    return { email, token, companyId: company.id };
  }

  const accept = (token: string, password = PASSWORD) =>
    t.http().post(api('auth/accept-invitation')).send({ token, password });

  function expectInvalid(res: { status: number; body: unknown }) {
    expect(res.status).toBe(422);
    expect(ApiErrorSchema.parse(res.body).code).toBe('INVITATION_INVALID');
  }

  it('FR-3: HR accepts invitation and can log in', async () => {
    const { email, token, companyId } = await invite();
    // Before accepting, the account cannot log in.
    await t.http().post(api('auth/login')).send({ email, password: PASSWORD }).expect(401);

    const res = await accept(token).expect(200);
    const session = AuthSessionSchema.parse(res.body);
    expect(session.user).toMatchObject({ email, role: 'HR', companyId });
    expect(refreshCookieFrom(res.headers['set-cookie'])).toBeDefined();
    expect(res.headers['cache-control']).toBe('no-store');

    await t
      .http()
      .get(api('me'))
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    await t.http().post(api('auth/login')).send({ email, password: PASSWORD }).expect(200);

    const accounts = await center.agent.get(api(`companies/${companyId}/hr-accounts`)).expect(200);
    expect(accounts.body).toMatchObject({ items: [{ email, status: 'ACTIVE' }] });
  });

  it('FR-3: reused or expired invitation returns 422 INVITATION_INVALID', async () => {
    const used = await invite();
    await accept(used.token).expect(200);
    expectInvalid(await accept(used.token, 'Another-password-1'));
    // The first password still works: the second attempt changed nothing.
    await t.http().post(api('auth/login')).send({ email: used.email, password: PASSWORD }).expect(200);

    const expired = await invite();
    clock.advance({ days: 7, seconds: 1 });
    expectInvalid(await accept(expired.token));
    clock.set(new Date());
    await accept(expired.token).expect(200);
  });

  it('FR-3: a forged, malformed or access token is not an invitation', async () => {
    const { token } = await invite();
    const [header, payload] = token.split('.');
    expectInvalid(await accept(`${header}.${payload}.forged-signature`));
    expectInvalid(await accept('not-a-jwt'));
    // An access token is signed with the same key but has no `hr-invite` audience.
    expectInvalid(await accept(center.accessToken));
    // And an invitation token is not an access token.
    await t.http().get(api('me')).set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('FR-3: re-inviting revokes the earlier link; only the newest one works (CONTEXT D29)', async () => {
    const first = await invite();
    const res = await center.agent
      .post(api(`companies/${first.companyId}/hr-invitations`))
      .send({ email: first.email, fullName: 'HR được mời' })
      .expect(201);
    const newest = HrInvitationSchema.parse(res.body).invitationPath.split('#')[1]!;
    expect(newest).not.toBe(first.token);

    expectInvalid(await accept(first.token));
    await accept(newest).expect(200);
    expectInvalid(await accept(newest, 'Another-password-1'));
  });

  it('FR-3: a weak password returns 400 and keeps the invitation usable', async () => {
    const { token } = await invite();
    await accept(token, 'short').expect(400);
    await accept(token).expect(200);
  });

  it('FR-3: two concurrent accepts of one token: only one succeeds', async () => {
    const { token } = await invite();
    const results = await runConcurrently(
      () => accept(token, 'First-password-123').then((res) => res.status),
      () => accept(token, 'Second-password-123').then((res) => res.status),
    );
    const statuses = results.map((result) => (result.status === 'fulfilled' ? result.value : 0)).sort();
    expect(statuses).toEqual([200, 422]);
  });
});
