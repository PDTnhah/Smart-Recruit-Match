import { Inject, Injectable } from '@nestjs/common';
import type {
  HardFilterFacts,
  IneligibleReason,
  MatchCodeCriteria,
  ScvBreakdownRow,
  StoredMatchAssessment,
} from '@srm/shared';
import { and, desc, eq, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm';
import { matchResults } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { type PairKey, pairKeyOf } from '../domain/match-plan.js';

/** The code part of one pair, as a run writes it; the LLM part stays empty until the result. */
export interface MatchCodeRow extends PairKey {
  campaignId: number;
  studentId: number;
  rulesVersion: string;
  facts: HardFilterFacts;
  /** Null when the pair failed the hard filter. */
  code: { criteria: MatchCodeCriteria; skillFitX100: number } | { ineligibleReasons: IneligibleReason[] };
  skippedByPrefilter: boolean;
}

/** What earlier runs left for this run to skip (US-3.2 AC-4, AC-9). */
export interface KnownPairs {
  /** Keys of the pairs scored with the rules and the pinned prompt. */
  done: Set<string>;
  /** Keys of the waiting pairs the LLM refused twice. */
  review: Set<string>;
}

/** A row of a pair a MATCH result names: waiting for the LLM, or already scored. */
export interface ResultRow extends PairKey {
  id: number;
  promptVersion: string | null;
  /** Null when the pair no longer passes the hard filter. */
  criteria: MatchCodeCriteria | null;
  facts: HardFilterFacts;
}

/** A scored row, as `recomputeScv` reads it. */
export interface ScoredRow {
  id: number;
  jdId: number;
  jdVersion: number;
  criteria: MatchCodeCriteria;
  assessment: StoredMatchAssessment;
  facts: HardFilterFacts;
  sCv: number;
}

/** The LLM part of a pair and the S_cv code computed from it (AGENTS › Invariant 12). */
export interface LlmPart {
  promptVersion: string;
  model: string;
  assessment: StoredMatchAssessment;
  scvX100: number;
  breakdown: ScvBreakdownRow[];
}

const excluded = (column: string) => sql.raw(`excluded.${column}`);

/** `(cv_id, cv_version, jd_id, jd_version) in (…)`; `keys` is never empty. */
function pairIn(keys: readonly PairKey[]): SQL {
  const values = keys.map((key) => sql`(${key.cvId}, ${key.cvVersion}, ${key.jdId}, ${key.jdVersion})`);
  return sql`(${matchResults.cvId}, ${matchResults.cvVersion}, ${matchResults.jdId}, ${matchResults.jdVersion}) in (${sql.join(values, sql`, `)})`;
}

/** Drizzle access to `core.match_results`, owned by the matching module (AGENTS › Invariant 13). */
@Injectable()
export class MatchResultsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * The prompt of the campaign's results, which later runs are pinned to (CONTEXT D46); null before
   * the first result. Should two be there, the latest result wins.
   */
  async pinnedPrompt(tx: DbTx, campaignId: number): Promise<string | null> {
    const [row] = await tx
      .select({ promptVersion: matchResults.promptVersion })
      .from(matchResults)
      .where(and(eq(matchResults.campaignId, campaignId), isNotNull(matchResults.promptVersion)))
      .orderBy(desc(matchResults.updatedAt), desc(matchResults.id))
      .limit(1);
    return row?.promptVersion ?? null;
  }

  async knownPairs(tx: DbTx, campaignId: number, rulesVersion: string, pinnedPrompt: string | null): Promise<KnownPairs> {
    const rows = await tx
      .select({
        cvId: matchResults.cvId,
        cvVersion: matchResults.cvVersion,
        jdId: matchResults.jdId,
        jdVersion: matchResults.jdVersion,
        promptVersion: matchResults.promptVersion,
        needsReview: matchResults.needsReview,
      })
      .from(matchResults)
      .where(
        and(
          eq(matchResults.campaignId, campaignId),
          eq(matchResults.rulesVersion, rulesVersion),
          or(
            and(isNull(matchResults.promptVersion), eq(matchResults.needsReview, true)),
            pinnedPrompt === null ? undefined : eq(matchResults.promptVersion, pinnedPrompt),
          ),
        ),
      );
    const known: KnownPairs = { done: new Set(), review: new Set() };
    for (const row of rows) (row.promptVersion === null ? known.review : known.done).add(pairKeyOf(row));
    return known;
  }

  /**
   * Writes the code part of pairs without a result: a new row, or the waiting row of the same
   * versions and rules refreshed (the facts or the top M may have changed). A pair left to staff
   * stays so while it passes the hard filter. One statement; each pair at most once.
   */
  async upsertCodePart(tx: DbTx, rows: readonly MatchCodeRow[]): Promise<void> {
    if (rows.length === 0) return;
    await tx
      .insert(matchResults)
      .values(
        rows.map((row) => {
          const eligible = 'criteria' in row.code;
          return {
            campaignId: row.campaignId,
            studentId: row.studentId,
            cvId: row.cvId,
            cvVersion: row.cvVersion,
            jdId: row.jdId,
            jdVersion: row.jdVersion,
            rulesVersion: row.rulesVersion,
            eligible,
            ineligibleReasons: 'ineligibleReasons' in row.code ? row.code.ineligibleReasons : [],
            facts: row.facts,
            criteria: 'criteria' in row.code ? row.code.criteria : null,
            skillFit: 'criteria' in row.code ? row.code.skillFitX100 / 100 : null,
            skippedByPrefilter: row.skippedByPrefilter,
          };
        }),
      )
      .onConflictDoUpdate({
        target: [
          matchResults.cvId,
          matchResults.jdId,
          matchResults.cvVersion,
          matchResults.jdVersion,
          matchResults.rulesVersion,
          matchResults.promptVersion,
        ],
        set: {
          campaignId: excluded('campaign_id'),
          studentId: excluded('student_id'),
          eligible: excluded('eligible'),
          ineligibleReasons: excluded('ineligible_reasons'),
          facts: excluded('facts'),
          criteria: excluded('criteria'),
          skillFit: excluded('skill_fit'),
          skippedByPrefilter: excluded('skipped_by_prefilter'),
          needsReview: sql`${matchResults.needsReview} and ${excluded('eligible')}`,
          updatedAt: sql`now()`,
        },
      });
  }

  /**
   * The rows of these pairs that wait for the LLM or were scored with `promptVersion`, locked until
   * the result is applied, so two deliveries of one message cannot both score a pair.
   */
  async lockForResult(
    tx: DbTx,
    campaignId: number,
    rulesVersion: string,
    promptVersion: string,
    keys: readonly PairKey[],
  ): Promise<ResultRow[]> {
    if (keys.length === 0) return [];
    return tx
      .select({
        id: matchResults.id,
        cvId: matchResults.cvId,
        cvVersion: matchResults.cvVersion,
        jdId: matchResults.jdId,
        jdVersion: matchResults.jdVersion,
        promptVersion: matchResults.promptVersion,
        criteria: matchResults.criteria,
        facts: matchResults.facts,
      })
      .from(matchResults)
      .where(
        and(
          eq(matchResults.campaignId, campaignId),
          eq(matchResults.rulesVersion, rulesVersion),
          or(isNull(matchResults.promptVersion), eq(matchResults.promptVersion, promptVersion)),
          pairIn(keys),
        ),
      )
      .orderBy(matchResults.id)
      .for('update');
  }

  /**
   * Fills the LLM part of a waiting row (AC-10): its key moves from prompt null to the job's prompt.
   * The pair was sent, so it is no longer outside the top M, and no longer left to staff.
   */
  async applyLlmPart(tx: DbTx, id: number, part: LlmPart): Promise<void> {
    await tx
      .update(matchResults)
      .set({
        promptVersion: part.promptVersion,
        model: part.model,
        assessment: part.assessment,
        sCv: part.scvX100 / 100,
        scvBreakdown: part.breakdown,
        skippedByPrefilter: false,
        needsReview: false,
      })
      .where(and(eq(matchResults.id, id), isNull(matchResults.promptVersion)));
  }

  /**
   * AC-9: the LLM refused these pairs twice; their waiting rows are left to staff and later runs do
   * not send them. A pair scored meanwhile, or no longer eligible, stays as it is.
   */
  async flagForReview(tx: DbTx, campaignId: number, rulesVersion: string, keys: readonly PairKey[]): Promise<void> {
    if (keys.length === 0) return;
    await tx
      .update(matchResults)
      .set({ needsReview: true })
      .where(
        and(
          eq(matchResults.campaignId, campaignId),
          eq(matchResults.rulesVersion, rulesVersion),
          isNull(matchResults.promptVersion),
          eq(matchResults.eligible, true),
          eq(matchResults.needsReview, false),
          pairIn(keys),
        ),
      );
  }

  /** Every scored row of the campaign, locked for a recompute (AC-11). */
  async lockScored(tx: DbTx, campaignId: number): Promise<ScoredRow[]> {
    const rows = await tx
      .select({
        id: matchResults.id,
        jdId: matchResults.jdId,
        jdVersion: matchResults.jdVersion,
        criteria: matchResults.criteria,
        assessment: matchResults.assessment,
        facts: matchResults.facts,
        sCv: matchResults.sCv,
      })
      .from(matchResults)
      .where(and(eq(matchResults.campaignId, campaignId), isNotNull(matchResults.sCv)))
      .orderBy(matchResults.id)
      .for('update');
    // The CHECKs of the table: a row with S_cv has the code verdicts and the LLM part.
    return rows.map((row) => {
      if (row.criteria === null || row.assessment === null || row.sCv === null) {
        throw new Error(`match_results ${row.id}: S_cv without its verdicts`);
      }
      return { ...row, criteria: row.criteria, assessment: row.assessment, sCv: row.sCv };
    });
  }

  async updateScv(tx: DbTx, id: number, scvX100: number, breakdown: ScvBreakdownRow[]): Promise<void> {
    await tx
      .update(matchResults)
      .set({ sCv: scvX100 / 100, scvBreakdown: breakdown })
      .where(eq(matchResults.id, id));
  }
}
