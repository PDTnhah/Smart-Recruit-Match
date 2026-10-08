import { createHash, randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';

// Refresh tokens (CONTEXT D25): 32 random bytes handed to the client in a cookie. Redis keeps only
// the SHA-256 of the token, under `auth:refresh:{sha256}`, with the user ID as value.

export const REFRESH_TOKEN_STORE = Symbol('REFRESH_TOKEN_STORE');

export interface RefreshTokenStore {
  readonly ttlSeconds: number;
  /** Creates a new token for the user. */
  issue(userId: number): Promise<string>;
  /** Atomically removes the token and returns its user; null if unknown, used, revoked or expired. */
  consume(token: string): Promise<number | null>;
  revoke(token: string): Promise<void>;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function key(token: string): string {
  return `auth:refresh:${createHash('sha256').update(token).digest('hex')}`;
}

export class RedisRefreshTokenStore implements RefreshTokenStore {
  constructor(
    private readonly redis: Redis,
    readonly ttlSeconds: number,
  ) {}

  async issue(userId: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.redis.set(key(token), String(userId), 'EX', this.ttlSeconds);
    return token;
  }

  async consume(token: string): Promise<number | null> {
    if (!TOKEN_PATTERN.test(token)) return null;
    // GETDEL: of two concurrent refreshes with the same token, exactly one wins.
    const value = await this.redis.getdel(key(token));
    const userId = Number(value);
    return value !== null && Number.isSafeInteger(userId) ? userId : null;
  }

  async revoke(token: string): Promise<void> {
    if (TOKEN_PATTERN.test(token)) await this.redis.del(key(token));
  }
}
