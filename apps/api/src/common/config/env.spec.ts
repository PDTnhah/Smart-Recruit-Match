import { loadEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://srm:srm@localhost:5432/srm',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-only-jwt-secret-with-enough-length-0123',
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'srm-minio',
  MINIO_SECRET_KEY: 'test-only-minio-secret',
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

  it('requires the MinIO endpoint and keys; the public endpoint is optional (CONTEXT D28)', () => {
    expect(loadEnv(base).MINIO_PUBLIC_ENDPOINT).toBeUndefined();
    expect(loadEnv({ ...base, MINIO_PUBLIC_ENDPOINT: 'https://files.example.edu' }).MINIO_PUBLIC_ENDPOINT).toBe(
      'https://files.example.edu',
    );
    expect(() => loadEnv({ ...base, MINIO_ENDPOINT: undefined })).toThrow('MINIO_ENDPOINT');
    expect(() => loadEnv({ ...base, MINIO_ENDPOINT: 'minio:9000' })).toThrow('MINIO_ENDPOINT');
    expect(() => loadEnv({ ...base, MINIO_SECRET_KEY: 'short' })).toThrow('MINIO_SECRET_KEY');
  });

  it('runs scheduled jobs unless SCHEDULER_ENABLED is false (CONTEXT D27)', () => {
    expect(loadEnv(base).SCHEDULER_ENABLED).toBe(true);
    expect(loadEnv({ ...base, SCHEDULER_ENABLED: 'false' }).SCHEDULER_ENABLED).toBe(false);
    expect(() => loadEnv({ ...base, SCHEDULER_ENABLED: 'maybe' })).toThrow('SCHEDULER_ENABLED');
  });
});
