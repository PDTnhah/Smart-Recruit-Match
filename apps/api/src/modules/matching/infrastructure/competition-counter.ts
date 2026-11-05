import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../../../redis/redis.module.js';

/** Redis key of a JD's preference count (ARCHITECTURE › Redis, CONTEXT D48). */
export const competitionKey = (jdId: number) => `competition:${jdId}`;

/**
 * `competition:{jdId}`: how many preferences a JD has, for fast reads while students choose
 * (US-3.4 AC-2). Only a cache: `core.preferences` is the truth, and every value here was counted
 * from it. Keys expire at a Unix time in seconds (`EXAT`), normally `preference_end`.
 */
@Injectable()
export class CompetitionCounter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** The stored counts; a JD without a key, or with a value that is not a count, is left out. */
  async read(jdIds: readonly number[]): Promise<Map<number, number>> {
    const counts = new Map<number, number>();
    if (jdIds.length === 0) return counts;
    const values = await this.redis.mget(jdIds.map(competitionKey));
    jdIds.forEach((jdId, index) => {
      const value = Number(values[index] ?? Number.NaN);
      if (Number.isInteger(value) && value >= 0) counts.set(jdId, value);
    });
    return counts;
  }

  /** Overwrites the counts: a recount under the JD lock always wins. */
  async write(counts: ReadonlyMap<number, number>, expiresAt: number): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (const [jdId, count] of counts) pipeline.set(competitionKey(jdId), count, 'EXAT', expiresAt);
    throwOnFailure(await pipeline.exec());
  }

  /**
   * Sets only the keys still missing (a lost key rebuilt on read, AC-2): a recount written since
   * this count was read keeps its newer value.
   */
  async fill(counts: ReadonlyMap<number, number>, expiresAt: number): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (const [jdId, count] of counts) pipeline.set(competitionKey(jdId), count, 'EXAT', expiresAt, 'NX');
    throwOnFailure(await pipeline.exec());
  }

  /** Deletes the keys, so the next read counts them from the database again. */
  async drop(jdIds: readonly number[]): Promise<void> {
    if (jdIds.length > 0) await this.redis.del(...jdIds.map(competitionKey));
  }
}

function throwOnFailure(results: [Error | null, unknown][] | null): void {
  const failed = results?.find(([error]) => error !== null);
  if (failed?.[0]) throw failed[0];
}
