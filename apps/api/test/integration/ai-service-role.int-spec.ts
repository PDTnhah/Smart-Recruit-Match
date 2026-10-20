// US-2.1 AC-8, AC-9 (AD-4, CONTEXT D33): the AI Service's database role reads `core` only through
// the PII-free views and writes only `ai`; the API's role writes `core` and only reads `ai`.
import {
  CV_STATES,
  JOB_DESCRIPTION_STATES,
  cvMachine,
  jobDescriptionMachine,
  reachableFrom,
  type CvStatus,
  type JobDescriptionStatus,
} from '@srm/shared';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { aiDatabaseUrl, createTestDb, ownerDatabaseUrl, type TestDb } from '../helpers/db.js';
import { createCv, createJobDescription } from '../helpers/factories.js';

const CV_VIEW = 'core.v_ai_cv_profile_masked';
const JD_VIEW = 'core.v_ai_jd_requirements';

/** PostgreSQL's insufficient_privilege, raised before the statement touches any row. */
async function expectDenied(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code: '42501' });
}

async function connect(url: string): Promise<Client> {
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

describe('AD-4: database roles of the AI Service and the API', () => {
  let owner: Client;
  let ai: Client;
  let coreTables: string[];

  beforeAll(async () => {
    owner = await connect(ownerDatabaseUrl());
    ai = await connect(aiDatabaseUrl());
    const { rows } = await owner.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'core' AND table_type = 'BASE TABLE' ORDER BY table_name`,
    );
    coreTables = rows.map((r) => r.table_name);
  });

  afterAll(async () => {
    await ai?.end();
    await owner?.end();
  });

  it('AD-4 tài khoản ai_service không ghi được schema core', async () => {
    expect(coreTables).toContain('cvs');
    for (const table of coreTables) {
      await expectDenied(ai.query(`INSERT INTO core.${table} DEFAULT VALUES`));
      await expectDenied(ai.query(`UPDATE core.${table} SET id = DEFAULT WHERE false`));
      await expectDenied(ai.query(`DELETE FROM core.${table} WHERE false`));
      await expectDenied(ai.query(`TRUNCATE core.${table}`));
      await expectDenied(ai.query(`SELECT 1 FROM core.${table} LIMIT 1`));
    }
  });

  it('AD-4 ai_service cannot change the views or create objects', async () => {
    await expectDenied(ai.query(`UPDATE ${CV_VIEW} SET version = version WHERE false`));
    await expectDenied(ai.query(`DELETE FROM ${JD_VIEW} WHERE false`));
    await expectDenied(ai.query('CREATE TABLE ai.ai_service_probe (id int)'));
    await expectDenied(ai.query('CREATE TABLE core.ai_service_probe (id int)'));
    await expectDenied(ai.query('CREATE TABLE public.ai_service_probe (id int)'));
  });

  it('AD-4 ai_service reads the views and reads and writes ai.jobs', async () => {
    await ai.query(`SELECT * FROM ${CV_VIEW} LIMIT 1`);
    await ai.query(`SELECT * FROM ${JD_VIEW} LIMIT 1`);
    const jobId = randomUUID();
    await ai.query("INSERT INTO ai.jobs (job_id, type, status, attempts) VALUES ($1, 'CV_PARSE', 'PROCESSING', 1)", [
      jobId,
    ]);
    await ai.query("UPDATE ai.jobs SET status = 'SUCCEEDED', finished_at = now() WHERE job_id = $1", [jobId]);
    const { rows } = await ai.query<{ status: string }>('SELECT status FROM ai.jobs WHERE job_id = $1', [jobId]);
    expect(rows).toEqual([{ status: 'SUCCEEDED' }]);
    await ai.query('DELETE FROM ai.jobs WHERE job_id = $1', [jobId]);
  });

  it('AD-4 ai_service holds exactly these table grants', async () => {
    const { rows } = await owner.query<{ grant: string }>(
      `SELECT table_schema || '.' || table_name || ' ' || privilege_type AS grant
       FROM information_schema.table_privileges WHERE grantee = 'ai_service' ORDER BY 1`,
    );
    expect(rows.map((r) => r.grant)).toEqual([
      'ai.jobs DELETE',
      'ai.jobs INSERT',
      'ai.jobs SELECT',
      'ai.jobs UPDATE',
      `${CV_VIEW} SELECT`,
      `${JD_VIEW} SELECT`,
    ]);
  });

  it('AD-4 api_service writes core (audit_logs insert-only) and only reads ai', async () => {
    const can = async (table: string, privilege: string) =>
      (
        await owner.query<{ ok: boolean }>('SELECT has_table_privilege($1, $2, $3) AS ok', [
          'api_service',
          table,
          privilege,
        ])
      ).rows[0]!.ok;
    for (const table of coreTables) {
      const audit = table === 'audit_logs';
      expect([table, await can(`core.${table}`, 'SELECT,INSERT')]).toEqual([table, true]);
      expect([table, await can(`core.${table}`, 'UPDATE')]).toEqual([table, !audit]);
      expect([table, await can(`core.${table}`, 'DELETE')]).toEqual([table, !audit]);
      expect([table, await can(`core.${table}`, 'TRUNCATE')]).toEqual([table, false]);
    }
    expect(await can('ai.jobs', 'SELECT')).toBe(true);
    for (const privilege of ['INSERT', 'UPDATE', 'DELETE']) expect(await can('ai.jobs', privilege)).toBe(false);
    const { rows } = await owner.query<{ core: boolean; ai: boolean }>(
      "SELECT has_schema_privilege('api_service', 'core', 'CREATE') AS core, has_schema_privilege('api_service', 'ai', 'CREATE') AS ai",
    );
    expect(rows).toEqual([{ core: false, ai: false }]);
  });
});

describe('AD-4: views the AI Service reads', () => {
  let owner: Client;
  let ai: Client;
  let seed: TestDb;

  beforeAll(async () => {
    owner = await connect(ownerDatabaseUrl());
    ai = await connect(aiDatabaseUrl());
    seed = createTestDb();
  });

  afterAll(async () => {
    await seed?.close();
    await ai?.end();
    await owner?.end();
  });

  const columnsOf = async (view: string) => {
    const [schema, name] = view.split('.');
    const { rows } = await owner.query<{ column_name: string }>(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position',
      [schema, name],
    );
    return rows.map((r) => r.column_name);
  };

  it('BR-03 view v_ai_* không có cột PII', async () => {
    // An exact allow-list: any new column, PII or not, has to be added here on purpose.
    expect(await columnsOf(CV_VIEW)).toEqual(['cv_id', 'version', 'campaign_id', 'profile_masked']);
    expect(await columnsOf(JD_VIEW)).toEqual(['jd_id', 'version', 'campaign_id', 'position_group', 'requirements']);
  });

  it('BR-01 BR-02 view chỉ trả dữ liệu đã xác nhận', async () => {
    const readable = new Set<CvStatus>(reachableFrom(cvMachine, 'CONFIRMED'));
    const cvs = await Promise.all(
      CV_STATES.flatMap((status) =>
        [true, false].map(async (active) => ({
          status,
          active,
          id: (await createCv(seed.db, { status, active, profile: { name: 'Nguyễn Văn A' }, profileMasked: { skills: ['sql'] } }))
            .id,
        })),
      ),
    );
    const { rows: cvRows } = await ai.query<{ cv_id: string; profile_masked: unknown }>(
      `SELECT cv_id, profile_masked FROM ${CV_VIEW} WHERE cv_id = ANY($1)`,
      [cvs.map((cv) => cv.id)],
    );
    const visibleCvs = new Set(cvRows.map((r) => Number(r.cv_id)));
    for (const cv of cvs) {
      expect([cv.status, cv.active, visibleCvs.has(cv.id)]).toEqual([cv.status, cv.active, cv.active && readable.has(cv.status)]);
    }
    expect(cvRows.every((r) => JSON.stringify(r.profile_masked) === '{"skills":["sql"]}')).toBe(true);

    const approved = new Set<JobDescriptionStatus>(reachableFrom(jobDescriptionMachine, 'APPROVED'));
    const jds = await Promise.all(
      JOB_DESCRIPTION_STATES.map(async (status) => ({ status, id: (await createJobDescription(seed.db, { status })).id })),
    );
    const { rows: jdRows } = await ai.query<{ jd_id: string }>(`SELECT jd_id FROM ${JD_VIEW} WHERE jd_id = ANY($1)`, [
      jds.map((jd) => jd.id),
    ]);
    const visibleJds = new Set(jdRows.map((r) => Number(r.jd_id)));
    for (const jd of jds) expect([jd.status, visibleJds.has(jd.id)]).toEqual([jd.status, approved.has(jd.status)]);
  });
});
