import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Redis } from 'ioredis';
import { REDIS } from '../../redis/redis.module.js';
import type { AuthenticatedRequest } from '../auth/auth-user.js';
import { errorMessage, RateLimitedError } from '../errors/index.js';

/** Length of a rate-limit window (US-4.3 AC-12, CONTEXT D51). */
export const RATE_LIMIT_WINDOW_SECONDS = 60;

const RATE_LIMIT_KEY = 'srm:rate-limit';

interface RateLimitRule {
  /** Names the route in the Redis key and the error, e.g. `exam.answers`. */
  route: string;
  /** Calls allowed per user within one window. */
  limit: number;
}

/** Redis key of one user's calls of one route in the current window. */
export const rateLimitKey = (userId: number, route: string) => `ratelimit:${userId}:${route}`;

/**
 * Counts the call and returns `[count, seconds left in the window]`. The first call of a window
 * sets the expiry; a key left without one (an expiry lost on a restart) gets it again, so a
 * counter never blocks a user for good.
 */
const COUNT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

type CountingRedis = Redis & {
  rateLimitCount(key: string, windowSeconds: number): Promise<[number, number]>;
};

/**
 * At most `limit` calls of the route per user and window (US-4.3 AC-12): the next one answers
 * `429 RATE_LIMITED` with `Retry-After`. Runs after the global AccessGuard, so the caller is known.
 */
export const RateLimit = (route: string, limit: number) =>
  applyDecorators(SetMetadata(RATE_LIMIT_KEY, { route, limit } satisfies RateLimitRule), UseGuards(RateLimitGuard));

/**
 * Fixed windows counted in Redis (`ratelimit:{userId}:{route}`, CONTEXT D51); no library outside
 * ARCH's list. When Redis fails the call goes through and the failure is logged: the limit guards
 * the API from a runaway client, it is not a business rule.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    if (!('rateLimitCount' in redis)) redis.defineCommand('rateLimitCount', { numberOfKeys: 1, lua: COUNT_SCRIPT });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.get<RateLimitRule | undefined>(RATE_LIMIT_KEY, context.getHandler());
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!rule || !user) return true;
    let counted: [number, number];
    try {
      counted = await (this.redis as CountingRedis).rateLimitCount(
        rateLimitKey(user.userId, rule.route),
        RATE_LIMIT_WINDOW_SECONDS,
      );
    } catch (error) {
      this.logger.warn(`rate limit of ${rule.route} not checked: ${errorMessage(error)}`);
      return true;
    }
    const [count, ttl] = counted;
    if (count <= rule.limit) return true;
    const retryAfter = Math.max(1, ttl);
    context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>().setHeader('Retry-After', String(retryAfter));
    throw new RateLimitedError(rule.route, retryAfter);
  }
}
