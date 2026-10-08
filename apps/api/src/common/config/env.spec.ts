import { loadEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://srm:srm@localhost:5432/srm',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-only-jwt-secret-with-enough-length-0123',
};

describe('environment (CONTEXT D25)', () => {
  it('accepts a valid environment and defaults the refresh lifetime to 7 days', () => {
    expect(loadEnv(base)).toMatchObject({ REFRESH_TOKEN_TTL_DAYS: 7, NODE_ENV: 'development' });
  });

  it('refuses a short or placeholder JWT key, so copied example values cannot sign tokens', () => {
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'too-short' })).toThrow('JWT_ACCESS_SECRET');
    expect(() =>
      loadEnv({ ...base, JWT_ACCESS_SECRET: 'change-me-jwt-access-secret-at-least-32-chars' }),
    ).toThrow('placeholder');
  });

  it('requires REDIS_URL with a redis scheme', () => {
    expect(() => loadEnv({ ...base, REDIS_URL: undefined })).toThrow('REDIS_URL');
    expect(() => loadEnv({ ...base, REDIS_URL: 'http://localhost:6379' })).toThrow('REDIS_URL');
  });
});
