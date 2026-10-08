import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import {
  EntityNotFoundError,
  InvalidTransitionError,
  RowVersionConflictError,
  TransitionConditionFailedError,
} from '../../src/common/errors/domain-error.js';
import type { GuardResult } from '../../src/common/state/index.js';
import type { DbTx } from '../../src/db/types.js';
import { type Actor, AuditService, SYSTEM_ACTOR } from '../../src/modules/audit/index.js';
import { createTestDb, type TestDb } from '../helpers/db.js';
import {
  auditEntries,
  createStateTestingModule,
  expectExactlyOneConflict,
  insertInState,
  lifecycle,
  readState,
  runConcurrently,
  type StateTestContext,
  transitionAndReadAudit,
} from '../helpers/state.js';

const CENTER: Actor = { kind: 'USER', userId: 1 };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** updated_at in epoch milliseconds; set by the database (now()) on every Drizzle update. */
async function readUpdatedAt(pool: Pool, campaignId: number): Promise<number> {
  const { rows } = await pool.query<{ updated_at: Date }>('SELECT updated_at FROM core.campaigns WHERE id = $1', [
    campaignId,
  ]);
  return rows[0]!.updated_at.getTime();
}

describe('transitionTo (US-1.2, AD-8)', () => {
  let ctx: StateTestContext;
  let testDb: TestDb;

  beforeAll(async () => {
    ctx = await createStateTestingModule();
    testDb = createTestDb();
  });

  afterAll(async () => {
    await ctx.close();
    await testDb.close();
  });

  it('AD-8: valid transition bumps row_version and writes one audit row in same transaction', async () => {
    const campaign = await insertInState(testDb.db, 'campaign', 'DRAFT', 3);
    const updatedAtBefore = await readUpdatedAt(testDb.pool, campaign.id);

    const { result, audit } = await transitionAndReadAudit(ctx.service, testDb.db, {
      lifecycle: lifecycle('campaign'),
      id: campaign.id,
      to: 'INTAKE',
      expectedRowVersion: 3,
      actor: CENTER,
      reason: 'Mở nhận JD/CV',
    });

    expect(result).toEqual({ id: campaign.id, from: 'DRAFT', to: 'INTAKE', rowVersion: 4 });
    expect(await readState(testDb.db, 'campaign', campaign.id)).toEqual({
      id: campaign.id,
      status: 'INTAKE',
      rowVersion: 4,
    });
    expect(await readUpdatedAt(testDb.pool, campaign.id)).toBeGreaterThan(updatedAtBefore);
    expect(await auditEntries(testDb.db, 'campaign', campaign.id)).toHaveLength(1);
    expect(audit).toMatchObject({
      actorKind: 'USER',
      actorId: 1,
      action: 'TRANSITION',
      entity: 'campaign',
      entityId: campaign.id,
      before: { status: 'DRAFT', rowVersion: 3 },
      after: { status: 'INTAKE', rowVersion: 4 },
      reason: 'Mở nhận JD/CV',
    });
    expect(audit.at).toBeInstanceOf(Date);

    // Same transaction: both rows carry the id of the transaction that wrote them.
    const { rows } = await testDb.pool.query<{ campaign_xmin: string; audit_xmin: string }>(
      `SELECT (SELECT xmin::text FROM core.campaigns WHERE id = $1) AS campaign_xmin,
              (SELECT xmin::text FROM core.audit_logs WHERE id = $2) AS audit_xmin`,
      [campaign.id, audit.id],
    );
    expect(rows[0]!.campaign_xmin).toBe(rows[0]!.audit_xmin);
  });

  it('AD-8: invalid transition is rejected with INVALID_TRANSITION and no audit row', async () => {
    const campaign = await insertInState(testDb.db, 'campaign', 'DRAFT');

    const attempt = ctx.service.transitionTo({
      lifecycle: lifecycle('campaign'),
      id: campaign.id,
      to: 'CLOSED',
      expectedRowVersion: 0,
      actor: CENTER,
      reason: 'skip ahead',
    });

    await expect(attempt).rejects.toBeInstanceOf(InvalidTransitionError);
    await expect(attempt).rejects.toMatchObject({ code: 'INVALID_TRANSITION', httpStatus: 422 });
    expect(await readState(testDb.db, 'campaign', campaign.id)).toEqual(campaign);
    expect(await auditEntries(testDb.db, 'campaign', campaign.id)).toEqual([]);
  });

  it('AD-8: concurrent transitions with same row_version yield exactly one 409', async () => {
    const jd = await insertInState(testDb.db, 'jobDescription', 'PENDING_APPROVAL');
    // The guard holds the row lock for a while, so the second request queues on FOR UPDATE.
    const slowGuard = async (): Promise<GuardResult> => {
      await sleep(150);
      return { ok: true };
    };
    const approve = () =>
      ctx.service.transitionTo({
        lifecycle: lifecycle('jobDescription'),
        id: jd.id,
        to: 'APPROVED',
        expectedRowVersion: 0,
        actor: CENTER,
        reason: 'Trung tâm duyệt JD',
        guard: slowGuard,
      });

    const winner = expectExactlyOneConflict(await runConcurrently(approve, approve));

    expect(winner).toMatchObject({ from: 'PENDING_APPROVAL', to: 'APPROVED', rowVersion: 1 });
    expect(await readState(testDb.db, 'jobDescription', jd.id)).toMatchObject({ status: 'APPROVED', rowVersion: 1 });
    expect(await auditEntries(testDb.db, 'job_description', jd.id)).toHaveLength(1);
  });

  it('AD-8: stale row_version is rejected with ROW_VERSION_CONFLICT even when the edge is valid', async () => {
    const cv = await insertInState(testDb.db, 'cv', 'PENDING_ANALYSIS', 2);

    const attempt = ctx.service.transitionTo({
      lifecycle: lifecycle('cv'),
      id: cv.id,
      to: 'PENDING_CONFIRMATION',
      expectedRowVersion: 1,
      actor: CENTER,
      reason: 'analysis done',
    });

    await expect(attempt).rejects.toBeInstanceOf(RowVersionConflictError);
    await expect(attempt).rejects.toMatchObject({ details: { expectedRowVersion: 1, actualRowVersion: 2 } });
    expect(await readState(testDb.db, 'cv', cv.id)).toEqual(cv);
    expect(await auditEntries(testDb.db, 'cv', cv.id)).toEqual([]);
  });

  it('AD-8: failing guard rejects with TRANSITION_CONDITION_FAILED and no change', async () => {
    const campaign = await insertInState(testDb.db, 'campaign', 'DRAFT');
    const other: Pool = testDb.pool;
    let lockProbe: unknown;

    const attempt = ctx.service.transitionTo({
      lifecycle: lifecycle('campaign'),
      id: campaign.id,
      to: 'INTAKE',
      expectedRowVersion: 0,
      actor: CENTER,
      reason: 'open campaign',
      guard: async (row, tx: DbTx) => {
        // Runs inside the transaction, after the lock: another connection cannot lock the row now.
        lockProbe = await other
          .query('SELECT 1 FROM core.campaigns WHERE id = $1 FOR UPDATE NOWAIT', [row.id])
          .catch((error: unknown) => error);
        const seen = await tx.execute(sql`SELECT status FROM core.campaigns WHERE id = ${row.id}`);
        expect(seen.rows[0]).toEqual({ status: 'DRAFT' });
        return { ok: false, reasonCode: 'MISSING_DEADLINES' };
      },
    });

    await expect(attempt).rejects.toBeInstanceOf(TransitionConditionFailedError);
    await expect(attempt).rejects.toMatchObject({
      code: 'TRANSITION_CONDITION_FAILED',
      httpStatus: 422,
      details: { reasonCode: 'MISSING_DEADLINES' },
    });
    expect(lockProbe).toMatchObject({ code: '55P03' }); // lock_not_available
    expect(await readState(testDb.db, 'campaign', campaign.id)).toEqual(campaign);
    expect(await auditEntries(testDb.db, 'campaign', campaign.id)).toEqual([]);
  });

  it('BR-10: audit insert failure rolls back the state change', async () => {
    // A real failing INSERT inside the transaction: actor_kind 'ROBOT' violates the CHECK.
    const failing = await createStateTestingModule((builder) =>
      builder.overrideProvider(AuditService).useValue({
        record: async (tx: DbTx) => {
          await tx.execute(
            sql`INSERT INTO core.audit_logs (actor_kind, action, entity, entity_id) VALUES ('ROBOT', 'TRANSITION', 'campaign', 0)`,
          );
        },
      }),
    );
    try {
      const campaign = await insertInState(testDb.db, 'campaign', 'DRAFT');

      await expect(
        failing.service.transitionTo({
          lifecycle: lifecycle('campaign'),
          id: campaign.id,
          to: 'INTAKE',
          expectedRowVersion: 0,
          actor: CENTER,
          reason: 'open campaign',
        }),
      ).rejects.toMatchObject({ cause: { code: '23514' } });

      expect(await readState(testDb.db, 'campaign', campaign.id)).toEqual(campaign);
      expect(await auditEntries(testDb.db, 'campaign', campaign.id)).toEqual([]);
    } finally {
      await failing.close();
    }
  });

  it("AD-8: joins the caller's transaction and rolls back with it", async () => {
    const campaign = await insertInState(testDb.db, 'campaign', 'DRAFT');
    const callerFailure = new Error('caller failed after the transition');

    await expect(
      ctx.db.transaction(async (tx) => {
        await ctx.service.transitionTo({
          lifecycle: lifecycle('campaign'),
          id: campaign.id,
          to: 'INTAKE',
          expectedRowVersion: 0,
          actor: CENTER,
          reason: 'open campaign',
          tx,
        });
        throw callerFailure;
      }),
    ).rejects.toBe(callerFailure);

    expect(await readState(testDb.db, 'campaign', campaign.id)).toEqual(campaign);
    expect(await auditEntries(testDb.db, 'campaign', campaign.id)).toEqual([]);
  });

  it('AD-8: a SYSTEM actor may omit row_version and is audited without actor_id', async () => {
    const campaign = await insertInState(testDb.db, 'campaign', 'TESTING', 5);

    const { result, audit } = await transitionAndReadAudit(ctx.service, testDb.db, {
      lifecycle: lifecycle('campaign'),
      id: campaign.id,
      to: 'ALLOCATION_REVIEW',
      actor: SYSTEM_ACTOR,
      reason: 'Hết hạn làm test',
    });

    expect(result.rowVersion).toBe(6);
    expect(audit).toMatchObject({ actorKind: 'SYSTEM', actorId: null, reason: 'Hết hạn làm test' });
  });

  it('AD-8: rejects a USER request without row_version, an empty reason, and an unknown id', async () => {
    const campaign = await insertInState(testDb.db, 'campaign', 'DRAFT');
    const base = { lifecycle: lifecycle('campaign'), id: campaign.id, to: 'INTAKE' as const, actor: CENTER };

    await expect(ctx.service.transitionTo({ ...base, reason: 'open' })).rejects.toThrow(/expectedRowVersion/);
    await expect(ctx.service.transitionTo({ ...base, expectedRowVersion: 0, reason: '  ' })).rejects.toThrow(/reason/);
    await expect(
      ctx.service.transitionTo({ ...base, id: 2_000_000_000, expectedRowVersion: 0, reason: 'open' }),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(await readState(testDb.db, 'campaign', campaign.id)).toEqual(campaign);
  });
});
