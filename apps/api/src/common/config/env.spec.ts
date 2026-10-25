import { loadEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://srm:srm@localhost:5432/srm',
  REDIS_URL: 'redis://localhost:6379',
  RABBITMQ_URL: 'amqp://srm:srm@localhost:5672',
  JWT_ACCESS_SECRET: 'test-only-jwt-secret-with-enough-length-0123',
  PII_ENCRYPTION_KEY: 'test-only-pii-key-with-enough-length-0123456',
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'srm-minio',
  MINIO_SECRET_KEY: 'test-only-minio-secret',
  WEB_ORIGIN: 'http://localhost:8080',
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

  it('NFR-3 requires a PII key of 32+ characters, not a placeholder (US-2.4, CONTEXT D37)', () => {
    expect(loadEnv(base).PII_ENCRYPTION_KEY).toBe(base.PII_ENCRYPTION_KEY);
    expect(() => loadEnv({ ...base, PII_ENCRYPTION_KEY: undefined })).toThrow('PII_ENCRYPTION_KEY');
    // Compose passes an unset variable as an empty string (LESSONS §14).
    expect(() => loadEnv({ ...base, PII_ENCRYPTION_KEY: '' })).toThrow('PII_ENCRYPTION_KEY');
    expect(() => loadEnv({ ...base, PII_ENCRYPTION_KEY: 'too-short' })).toThrow('PII_ENCRYPTION_KEY');
    expect(() => loadEnv({ ...base, PII_ENCRYPTION_KEY: 'change-me-pii-encryption-key-at-least-32' })).toThrow(
      'placeholder',
    );
  });

  it('requires REDIS_URL with a redis scheme', () => {
    expect(() => loadEnv({ ...base, REDIS_URL: undefined })).toThrow('REDIS_URL');
    expect(() => loadEnv({ ...base, REDIS_URL: 'http://localhost:6379' })).toThrow('REDIS_URL');
  });

  it('requires RABBITMQ_URL with an amqp scheme (CONTEXT D33)', () => {
    expect(loadEnv({ ...base, RABBITMQ_URL: 'amqps://srm:srm@mq.example.edu:5671/srm' }).RABBITMQ_URL).toBe(
      'amqps://srm:srm@mq.example.edu:5671/srm',
    );
    expect(() => loadEnv({ ...base, RABBITMQ_URL: undefined })).toThrow('RABBITMQ_URL');
    expect(() => loadEnv({ ...base, RABBITMQ_URL: '' })).toThrow('RABBITMQ_URL');
    expect(() => loadEnv({ ...base, RABBITMQ_URL: 'http://localhost:15672' })).toThrow('RABBITMQ_URL');
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

  it('requires the web origin for links in emails, without a trailing slash (CONTEXT D31)', () => {
    expect(loadEnv(base).WEB_ORIGIN).toBe('http://localhost:8080');
    expect(() => loadEnv({ ...base, WEB_ORIGIN: undefined })).toThrow('WEB_ORIGIN');
    expect(() => loadEnv({ ...base, WEB_ORIGIN: 'http://localhost:8080/' })).toThrow('WEB_ORIGIN');
    expect(() => loadEnv({ ...base, WEB_ORIGIN: 'localhost:8080' })).toThrow('WEB_ORIGIN');
  });

  it('defaults SMTP to Mailpit on the host; credentials are optional (CONTEXT D31)', () => {
    expect(loadEnv(base)).toMatchObject({ SMTP_HOST: 'localhost', SMTP_PORT: 1025 });
    expect(loadEnv(base).SMTP_USER).toBeUndefined();
    expect(loadEnv({ ...base, SMTP_HOST: 'mailpit', SMTP_PORT: '2525' })).toMatchObject({
      SMTP_HOST: 'mailpit',
      SMTP_PORT: 2525,
    });
    expect(() => loadEnv({ ...base, SMTP_PORT: '70000' })).toThrow('SMTP_PORT');
    // Compose passes unset optional values as empty strings.
    expect(loadEnv({ ...base, SMTP_USER: '', SMTP_PASSWORD: '' })).toMatchObject({
      SMTP_USER: undefined,
      SMTP_PASSWORD: undefined,
    });
    expect(loadEnv({ ...base, SMTP_USER: 'mailer' }).SMTP_USER).toBe('mailer');
  });
});
