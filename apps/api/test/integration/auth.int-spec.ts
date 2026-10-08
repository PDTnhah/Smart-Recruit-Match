// US-1.3 AC-1…AC-4: login, refresh rotation, logout and access-token checks over HTTP.
import { createHash } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { ApiErrorSchema, AuthSessionSchema, MeSchema } from '@srm/shared';
import { eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { users } from '../../src/db/schema/index.js';
import { REDIS } from '../../src/redis/redis.module.js';
import { api, type AuthTestApp, createAuthTestApp, refreshCookieFrom, TEST_PASSWORD } from '../helpers/auth.js';

function claimsOf(token: string): Record<string, unknown> {
  const payload = token.split('.')[1] ?? '';
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

function setCookieOf(headers: Record<string, unknown>): string[] {
  const value = headers['set-cookie'];
  return Array.isArray(value) ? (value as string[]) : [];
}

describe('FR-1: authentication (US-1.3)', () => {
  let t: AuthTestApp;

  beforeAll(async () => {
    t = await createAuthTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  function login(email: string, password = TEST_PASSWORD) {
    return t.http().post(api('auth/login')).send({ email, password });
  }

  function refresh(cookie: string | undefined) {
    const req = t.http().post(api('auth/refresh'));
    // Supertest does not send Secure cookies over plain HTTP, so the header is set by hand.
    return cookie === undefined ? req : req.set('Cookie', `srm_refresh=${cookie}`);
  }

  it('FR-1: login returns 15-minute access token and httpOnly refresh cookie', async () => {
    const user = await t.createLoginUser('HR');
    const res = await login(user.email.toUpperCase()).expect(200);

    const session = AuthSessionSchema.parse(res.body);
    expect(session.expiresIn).toBe(900);
    expect(session.user).toEqual({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: 'HR',
      companyId: user.companyId,
      studentId: null,
    });
    const claims = claimsOf(session.accessToken);
    expect(claims).toMatchObject({ sub: String(user.id), role: 'HR', company_id: user.companyId });
    expect(Number(claims.exp) - Number(claims.iat)).toBe(900);

    const [cookie] = setCookieOf(res.headers);
    expect(cookie).toMatch(/^srm_refresh=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('Max-Age=604800');
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(res.headers['cache-control']).toBe('no-store');
    // The password and its hash never leave the server.
    expect(JSON.stringify(res.body)).not.toMatch(/password|scrypt/i);
  });

  it('puts student_id in the token of a STUDENT', async () => {
    const user = await t.createLoginUser('STUDENT');
    const res = await login(user.email).expect(200);
    const claims = claimsOf(AuthSessionSchema.parse(res.body).accessToken);
    expect(claims).toMatchObject({ role: 'STUDENT', student_id: user.studentId });
    expect(claims).not.toHaveProperty('company_id');
  });

  it('FR-1: unknown email and wrong password return the same 401', async () => {
    const user = await t.createLoginUser('CENTER');
    const inactive = await t.createLoginUser('CENTER');
    await t.db.update(users).set({ isActive: false }).where(eq(users.id, inactive.id));
    // An invited HR who has not set a password yet (US-1.5).
    const invited = await t.createLoginUser('HR');
    await t.db.update(users).set({ passwordHash: null }).where(eq(users.id, invited.id));

    const responses = await Promise.all([
      login('nobody@test.local'),
      login(user.email, 'Wrong-Password-1'),
      login(inactive.email),
      login(invited.email),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(ApiErrorSchema.parse(res.body)).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
      expect(setCookieOf(res.headers)).toEqual([]);
    }
  });

  it('rejects a malformed login body with 400 without echoing the input', async () => {
    const res = await t
      .http()
      .post(api('auth/login'))
      .send({ email: 'not-an-email', password: 'Secret-Value-42' })
      .expect(400);
    const body = ApiErrorSchema.parse(res.body);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.details).toEqual({ issues: [{ path: 'email', message: 'Email không hợp lệ' }] });
    expect(JSON.stringify(res.body)).not.toContain('Secret-Value-42');
  });

  it('FR-1: refresh rotates token and reused refresh token returns 401', async () => {
    const user = await t.createLoginUser('STUDENT');
    const first = refreshCookieFrom((await login(user.email).expect(200)).headers['set-cookie']);

    const rotated = await refresh(first).expect(200);
    const session = AuthSessionSchema.parse(rotated.body);
    const second = refreshCookieFrom(rotated.headers['set-cookie']);
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    const me = await t
      .http()
      .get(api('me'))
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(MeSchema.parse(me.body).id).toBe(user.id);

    // The first token was consumed by the rotation: using it again fails and clears the cookie.
    const reused = await refresh(first).expect(401);
    expect(ApiErrorSchema.parse(reused.body).code).toBe('UNAUTHENTICATED');
    expect(setCookieOf(reused.headers)[0]).toMatch(/^srm_refresh=;.*Expires=Thu, 01 Jan 1970/);

    await refresh(second).expect(200);
  });

  it('only one of two concurrent refreshes with the same token succeeds', async () => {
    const user = await t.createLoginUser('CENTER');
    const cookie = refreshCookieFrom((await login(user.email).expect(200)).headers['set-cookie']);
    const statuses = (await Promise.all([refresh(cookie), refresh(cookie)])).map((res) => res.status);
    expect(statuses.sort()).toEqual([200, 401]);
  });

  it('returns 401 for a missing, unknown or expired refresh token', async () => {
    await refresh(undefined).expect(401);
    await refresh('A'.repeat(43)).expect(401);

    const user = await t.createLoginUser('ADMIN');
    const cookie = refreshCookieFrom((await login(user.email).expect(200)).headers['set-cookie']);
    const redis = t.app.get<Redis>(REDIS);
    const key = `auth:refresh:${createHash('sha256').update(cookie ?? '').digest('hex')}`;
    expect(await redis.ttl(key)).toBeGreaterThan(604_700);
    await redis.pexpire(key, 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await refresh(cookie).expect(401);
  });

  it('refuses to refresh a deactivated account', async () => {
    const user = await t.createLoginUser('CENTER');
    const cookie = refreshCookieFrom((await login(user.email).expect(200)).headers['set-cookie']);
    await t.db.update(users).set({ isActive: false }).where(eq(users.id, user.id));
    await refresh(cookie).expect(401);
  });

  it('FR-1: logout revokes refresh token', async () => {
    const user = await t.createLoginUser('HR');
    const cookie = refreshCookieFrom((await login(user.email).expect(200)).headers['set-cookie']);

    const res = await t
      .http()
      .post(api('auth/logout'))
      .set('Cookie', `srm_refresh=${cookie}`)
      .expect(204);
    expect(setCookieOf(res.headers)[0]).toMatch(/^srm_refresh=;.*Path=\/api\/auth/);
    await refresh(cookie).expect(401);
    // Logging out twice, or without a cookie, is harmless.
    await t.http().post(api('auth/logout')).expect(204);
  });

  it('FR-1: expired access token returns 401', async () => {
    const { user } = await t.loginAs('CENTER');
    const jwt = t.app.get(JwtService);
    const now = Math.floor(Date.now() / 1000);
    const claims = { sub: String(user.id), role: 'CENTER' };
    const expired = await jwt.signAsync({ ...claims, iat: now - 1000, exp: now - 100 });
    const foreign = new JwtService({ secret: 'another-secret-another-secret-0000' });
    const wrongKey = await foreign.signAsync(claims, { expiresIn: 900 });
    const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ ...claims, exp: now + 900 }),
    ).toString('base64url')}.`;

    for (const token of [expired, wrongKey, unsigned, 'garbage']) {
      const res = await t.http().get(api('me')).set('Authorization', `Bearer ${token}`).expect(401);
      expect(ApiErrorSchema.parse(res.body).code).toBe('UNAUTHENTICATED');
    }
  });

  it('NFR-1: a @Roles route without a token returns 401, not 403', async () => {
    const res = await t.http().get(api('me')).expect(401);
    expect(ApiErrorSchema.parse(res.body).code).toBe('UNAUTHENTICATED');
  });

  it('GET /api/me returns the caller and rejects a deactivated account', async () => {
    const { agent, user } = await t.loginAs('STUDENT');
    const me = MeSchema.parse((await agent.get(api('me')).expect(200)).body);
    expect(me).toMatchObject({ id: user.id, role: 'STUDENT', studentId: user.studentId });

    await t.db.update(users).set({ isActive: false }).where(eq(users.id, user.id));
    await agent.get(api('me')).expect(401);
  });
});
