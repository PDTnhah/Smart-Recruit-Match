import { Inject, Injectable } from '@nestjs/common';
import type { NominationStatus } from '@srm/shared';
import { StateTransitionService } from '../../../common/state/index.js';
import { nominationLifecycle } from '../../../db/lifecycles.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import type { Actor } from '../../audit/index.js';
import { compareRankKeys, type RankKey, toCentiScore } from '../domain/index.js';
import {
  AllocationRoundRepository,
  type PublishedNominationRecord,
  type PublishedRoundRecord,
  type ReviewGroupRecord,
} from '../infrastructure/allocation-round.repository.js';

/** A nomination of a published round as HR review reads it (US-5.3), scores as stored (0–100). */
export interface PublishedNomination {
  id: number;
  roundId: number;
  roundNo: number;
  publishedAt: Date;
  campaignId: number;
  studentId: number;
  jdId: number;
  preferenceId: number;
  status: NominationStatus;
  rowVersion: number;
  sFinal: number;
  /** From the round's snapshot: the S_test and S_cv S_final was computed from; null when missing. */
  sTest: number | null;
  sCv: number | null;
}

export type { PublishedRoundRecord as PublishedRound, ReviewGroupRecord as ReviewGroup };

const pairKey = (studentId: number | string, jdId: number | string) => `${studentId}:${jdId}`;

/**
 * What HR review (module `review`, US-5.3, CONTEXT D64) reads and changes of nominations, so it never
 * touches `core.nominations` or `core.allocation_rounds` itself (AGENTS › Invariant 13). Only
 * published rounds are visible here: a draft's nominations never reach HR (AC-1, AC-3).
 */
@Injectable()
export class NominationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly repository: AllocationRoundRepository,
    private readonly transitions: StateTransitionService,
  ) {}

  /**
   * AC-1: the JD's nominations of every published round, by S_final, then the tie-breaks of US-5.1
   * (`compareRankKeys` on the rank keys of each round's snapshot), then id.
   */
  async listPublishedOfJd(jdId: number): Promise<PublishedNomination[]> {
    const rows = await this.repository.publishedNominationsOfJd(jdId);
    const keys = await this.rankKeysOf(rows);
    return rows
      .map((row) => ({ row, key: keys.get(row.id) }))
      .sort((a, b) => {
        const byScore = toCentiScore(b.row.sFinal) - toCentiScore(a.row.sFinal);
        if (byScore !== 0) return byScore;
        const byKey = a.key && b.key ? compareRankKeys(a.key, b.key) : 0;
        return byKey || a.row.id - b.row.id;
      })
      .map(({ row, key }) => toPublished(row, key));
  }

  /** A nomination of a published round; undefined otherwise. With `lock`, its row is locked in `tx`. */
  async findPublished(id: number, options: { tx?: DbTx; lock?: 'update' } = {}): Promise<PublishedNomination | undefined> {
    const row = await this.repository.findPublishedNomination(id, options);
    if (!row) return undefined;
    return toPublished(row, (await this.rankKeysOf([row])).get(row.id));
  }

  /**
   * HR's decision moves the nomination (AC-5, AC-6): through `transitionTo` at the version HR read,
   * audited in `tx` (AD-8). Returns the new row version.
   */
  async transition(
    id: number,
    to: NominationStatus,
    expectedRowVersion: number,
    actor: Actor,
    reason: string,
    options: { tx: DbTx },
  ): Promise<number> {
    const result = await this.transitions.transitionTo({
      lifecycle: nominationLifecycle,
      id,
      to,
      actor,
      reason,
      expectedRowVersion,
      tx: options.tx,
    });
    return result.rowVersion;
  }

  /** The student's nominations in published rounds, newest first (US-5.3 AC-6: what HR decided). */
  publishedIdsOfStudent(studentId: number): Promise<number[]> {
    return this.repository.publishedNominationIdsOfStudent(studentId);
  }

  /** AC-9: nominations of the JD HR has invited (INTERVIEW, PASSED, RESERVE, ACCEPTED). */
  countInvited(jdId: number, options: { tx?: DbTx } = {}): Promise<number> {
    return this.repository.countInvited(options.tx ?? this.db, jdId);
  }

  /** The campaign's newest published round, which a supplement request belongs to. */
  latestPublishedRound(campaignId: number, options: { tx?: DbTx } = {}): Promise<PublishedRoundRecord | undefined> {
    return this.repository.latestPublishedRound(options.tx ?? this.db, campaignId);
  }

  /** A published round; undefined for a draft or a missing one. */
  async findPublishedRound(roundId: number): Promise<PublishedRoundRecord | undefined> {
    const round = await this.repository.findRound(roundId);
    if (round?.status !== 'PUBLISHED' || !round.publishedAt) return undefined;
    return { id: round.id, campaignId: round.campaignId, roundNo: round.roundNo, publishedAt: round.publishedAt };
  }

  /** AC-10: nominations per round and JD; one round, or every group with one still NOMINATED. */
  reviewGroups(filter: { roundId?: number; pendingOnly?: boolean }): Promise<ReviewGroupRecord[]> {
    return this.repository.reviewGroups(filter);
  }

  /** Rank keys of the nominations, by nomination id, read from the snapshots of their rounds. */
  private async rankKeysOf(rows: readonly PublishedNominationRecord[]): Promise<Map<number, RankKey>> {
    const keys = new Map<number, RankKey>();
    for (const roundId of new Set(rows.map((row) => row.roundId))) {
      const round = await this.repository.findRound(roundId);
      if (!round) continue;
      const byPair = new Map(round.inputSnapshot.pairs.map((pair) => [pairKey(pair.studentId, pair.jdId), pair.rankKey]));
      for (const row of rows) {
        const key = row.roundId === roundId ? byPair.get(pairKey(row.studentId, row.jdId)) : undefined;
        if (key) keys.set(row.id, key);
      }
    }
    return keys;
  }
}

function toPublished(row: PublishedNominationRecord, key: RankKey | undefined): PublishedNomination {
  return {
    id: row.id,
    roundId: row.roundId,
    roundNo: row.roundNo,
    publishedAt: row.publishedAt,
    campaignId: row.campaignId,
    studentId: row.studentId,
    jdId: row.jdId,
    preferenceId: row.preferenceId,
    status: row.status,
    rowVersion: row.rowVersion,
    sFinal: row.sFinal,
    sTest: key ? key.sTest / 100 : null,
    sCv: key ? key.sCv / 100 : null,
  };
}
