import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { type CompetitionUpdatedEvent, SERVER_EVENTS } from '@srm/shared';
import { Clock } from '../../../common/clock/index.js';
import { errorMessage } from '../../../common/errors/index.js';
import { ADVISORY_LOCK_KEYS, lockEntitiesInTx } from '../../../common/scheduling/advisory-lock.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { CampaignService, type CampaignSettings } from '../../campaign/index.js';
import { JdService } from '../../company/index.js';
import { RealtimePublisher } from '../../notification/index.js';
import { jdCompetition } from '../domain/competition.js';
import {
  PREFERENCES_AUTO_ASSIGNED,
  PREFERENCES_REPLACED,
  type PreferencesAutoAssignedEvent,
  type PreferencesReplacedEvent,
} from '../domain/events.js';
import { PREFERENCE_PHASES } from '../domain/preference-list.js';
import { CompetitionCounter } from '../infrastructure/competition-counter.js';
import { PreferencesRepository } from '../infrastructure/preferences.repository.js';

/** Life of a counter when the campaign has no `preference_end`; renewed by every write (CONTEXT D48). */
const FALLBACK_TTL_SECONDS = 24 * 60 * 60;

/**
 * Competition level of GĐ4 step 2 (FR-17, US-3.4 AC-2, AC-3, CONTEXT D48): how many preferences
 * each JD has, by code alone (AGENTS › Invariant 2). After a change commits, the JDs it touched are
 * counted again from `core.preferences` under a lock per JD and written to Redis, then the new
 * levels go to the students of the campaign over SSE. Reads take Redis while preferences may still
 * change and the database otherwise.
 */
@Injectable()
export class CompetitionService {
  private readonly logger = new Logger(CompetitionService.name);
  /** JDs waiting for a recount, by campaign. */
  private readonly queued = new Map<number, Set<number>>();
  private draining: Promise<void> | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly campaigns: CampaignService,
    private readonly jds: JdService,
    private readonly repository: PreferencesRepository,
    private readonly counter: CompetitionCounter,
    private readonly publisher: RealtimePublisher,
    private readonly clock: Clock,
  ) {}

  // `async: true`: the save has committed; a failing recount is logged and its counters dropped.
  @OnEvent(PREFERENCES_REPLACED, { async: true })
  async onPreferencesReplaced(event: PreferencesReplacedEvent): Promise<void> {
    await this.schedule(event.campaignId, event.jdIds);
  }

  @OnEvent(PREFERENCES_AUTO_ASSIGNED, { async: true })
  async onPreferencesAutoAssigned(event: PreferencesAutoAssignedEvent): Promise<void> {
    await this.schedule(event.campaignId, event.jdIds);
  }

  /**
   * Preferences of each JD now, 0 for a JD nobody chose. While the campaign takes preferences the
   * counters answer, and a missing one is counted from the database and set again (AC-2). Outside
   * that phase, or when Redis fails, the database answers.
   */
  async counts(campaign: CampaignSettings, jdIds: readonly number[]): Promise<Map<number, number>> {
    if (jdIds.length === 0) return new Map();
    const expiresAt = this.expiryOf(campaign);
    if (expiresAt === null || !this.campaigns.isPhaseOpen(campaign, PREFERENCE_PHASES)) {
      return this.countFromDb(campaign.id, jdIds);
    }
    let cached: Map<number, number>;
    try {
      cached = await this.counter.read(jdIds);
    } catch (error) {
      this.logger.warn(`campaign ${campaign.id}: competition counters unreadable, counting from the database: ${errorMessage(error)}`);
      return this.countFromDb(campaign.id, jdIds);
    }
    const missing = jdIds.filter((jdId) => !cached.has(jdId));
    if (missing.length === 0) return cached;
    const counted = await this.countFromDb(campaign.id, missing);
    await this.counter
      .fill(counted, expiresAt)
      .catch((error: unknown) => this.logger.warn(`campaign ${campaign.id}: competition counters not rebuilt: ${errorMessage(error)}`));
    return new Map([...cached, ...counted]);
  }

  /**
   * Counts the JDs again from the database and overwrites their counters, then publishes the new
   * levels (AC-2, AC-3). The JD locks are held from before the count until the levels are
   * published: the last write of a JD has read every commit before it, and two recounts of a JD
   * reach the students in the order they counted.
   */
  async recount(campaignId: number, jdIds: readonly number[]): Promise<void> {
    const ids = [...new Set(jdIds)];
    if (ids.length === 0) return;
    const campaign = await this.campaigns.getSettings(campaignId);
    const expiresAt = this.expiryOf(campaign);
    const quotas = await this.quotasOf(campaignId);
    await this.db.transaction(async (tx) => {
      await lockEntitiesInTx(tx, ADVISORY_LOCK_KEYS.JD_COMPETITION, ids);
      const counts = withZeros(ids, await this.repository.countByJd(campaignId, ids, tx));
      if (expiresAt !== null) await this.writeCounters(campaignId, counts, expiresAt);
      await this.publish(campaign, counts, quotas);
    });
  }

  /**
   * Queues a recount. Recounts run one at a time per process and JDs queued meanwhile are merged,
   * so a rush of saves near the deadline holds one database connection and counts each JD once per
   * round, not once per save.
   */
  private schedule(campaignId: number, jdIds: readonly number[]): Promise<void> {
    if (jdIds.length === 0) return Promise.resolve();
    const queued = this.queued.get(campaignId) ?? new Set<number>();
    for (const jdId of jdIds) queued.add(jdId);
    this.queued.set(campaignId, queued);
    this.draining ??= this.drain();
    return this.draining;
  }

  private async drain(): Promise<void> {
    try {
      for (let next = this.queued.entries().next(); !next.done; next = this.queued.entries().next()) {
        const [campaignId, jdIds] = next.value;
        this.queued.delete(campaignId);
        await this.recountSafely(campaignId, [...jdIds]);
      }
    } finally {
      // Same turn as the last empty check: a JD queued later starts a new drain.
      this.draining = null;
    }
  }

  private async recountSafely(campaignId: number, jdIds: readonly number[]): Promise<void> {
    try {
      await this.recount(campaignId, jdIds);
    } catch (error) {
      this.logger.error(`campaign ${campaignId}: competition of JDs ${jdIds.join(',')} not recounted: ${errorMessage(error)}`);
      // The counters may predate the change: without them the next read counts from the database.
      await this.dropCounters(campaignId, jdIds);
    }
  }

  /** A failed write leaves no stale value behind: the keys are dropped and rebuilt on the next read. */
  private async writeCounters(campaignId: number, counts: ReadonlyMap<number, number>, expiresAt: number): Promise<void> {
    try {
      await this.counter.write(counts, expiresAt);
    } catch (error) {
      this.logger.warn(`campaign ${campaignId}: competition counters not written: ${errorMessage(error)}`);
      await this.dropCounters(campaignId, [...counts.keys()]);
    }
  }

  private async dropCounters(campaignId: number, jdIds: readonly number[]): Promise<void> {
    await this.counter
      .drop(jdIds)
      .catch((error: unknown) => this.logger.error(`campaign ${campaignId}: stale competition counters not dropped: ${errorMessage(error)}`));
  }

  /** Quota of each JD on the shortlists of the campaign. */
  private async quotasOf(campaignId: number): Promise<Map<number, number>> {
    return new Map((await this.jds.listShortlistCards(campaignId)).map((card) => [card.jdId, card.quota]));
  }

  /** A lost message is only a stale badge: the client loads the shortlist again when it reconnects. */
  private async publish(campaign: CampaignSettings, counts: ReadonlyMap<number, number>, quotas: ReadonlyMap<number, number>): Promise<void> {
    const thresholds = campaign.config.competition_thresholds;
    // A JD no longer APPROVED or RECRUITING is on no shortlist: nobody needs its level.
    const items = [...counts].flatMap(([jdId, nvCount]) => {
      const quota = quotas.get(jdId);
      return quota === undefined ? [] : [{ jdId, ...jdCompetition(nvCount, quota, thresholds) }];
    });
    if (items.length === 0) return;
    const data: CompetitionUpdatedEvent = { campaignId: campaign.id, items };
    try {
      await this.publisher.publishToCampaignStudents(campaign.id, { event: SERVER_EVENTS.COMPETITION_UPDATED, data });
    } catch (error) {
      this.logger.warn(`campaign ${campaign.id}: competition levels not pushed: ${errorMessage(error)}`);
    }
  }

  /**
   * Unix seconds the campaign's counters expire at: `preference_end`, or a day from now while it has
   * none. Null once `preference_end` has passed: nothing is cached any more.
   */
  private expiryOf(campaign: CampaignSettings): number | null {
    const now = this.clock.now().getTime();
    const end = campaign.phaseDeadlines.preference_end;
    if (!end) return Math.floor(now / 1000) + FALLBACK_TTL_SECONDS;
    const at = Date.parse(end);
    return at > now ? Math.floor(at / 1000) : null;
  }

  private async countFromDb(campaignId: number, jdIds: readonly number[]): Promise<Map<number, number>> {
    return withZeros(jdIds, await this.repository.countByJd(campaignId, jdIds));
  }
}

function withZeros(jdIds: readonly number[], counts: ReadonlyMap<number, number>): Map<number, number> {
  return new Map(jdIds.map((jdId) => [jdId, counts.get(jdId) ?? 0]));
}
