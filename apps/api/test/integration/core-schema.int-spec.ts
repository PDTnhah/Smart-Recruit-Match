import { Client } from 'pg';
import { runMigrations } from '../../src/db/migrate.js';
import { databaseUrl } from '../helpers/db.js';

const CORE_TABLES = ['audit_logs', 'campaigns', 'companies', 'cvs', 'job_descriptions', 'students', 'users'];

/** Expects `query` to fail with the given SQLSTATE and constraint name. */
async function expectViolation(promise: Promise<unknown>, code: string, constraint: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code, constraint });
}

describe('AD-9: migrations apply on empty DB and create core tables with constraints', () => {
  // A database of its own, created empty, so this suite proves the migrations alone build the schema.
  const name = `schema_check_${process.pid}`;
  let admin: Client;
  let client: Client;
  let url: string;

  beforeAll(async () => {
    admin = new Client({ connectionString: databaseUrl() });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${name}`);
    const target = new URL(databaseUrl());
    target.pathname = `/${name}`;
    url = target.toString();
    await runMigrations(url);
    client = new Client({ connectionString: url });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin?.end();
  });

  it('creates exactly the seven core tables', async () => {
    const { rows } = await client.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'core' ORDER BY table_name",
    );
    expect(rows.map((r) => r.table_name)).toEqual(CORE_TABLES);
  });

  it('enables pgcrypto and records both migrations', async () => {
    const ext = await client.query("SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'");
    expect(ext.rowCount).toBe(1);
    const applied = await client.query<{ n: string }>('SELECT count(*) AS n FROM drizzle.__drizzle_migrations');
    expect(Number(applied.rows[0]!.n)).toBe(2);
  });

  it('is a no-op when run again', async () => {
    await runMigrations(url);
    const applied = await client.query<{ n: string }>('SELECT count(*) AS n FROM drizzle.__drizzle_migrations');
    expect(Number(applied.rows[0]!.n)).toBe(2);
  });

  it('gives every lifecycle table row_version default 0', async () => {
    const { rows } = await client.query<{ table_name: string; column_default: string; is_nullable: string }>(
      `SELECT table_name, column_default, is_nullable FROM information_schema.columns
       WHERE table_schema = 'core' AND column_name = 'row_version' ORDER BY table_name`,
    );
    expect(rows).toEqual(
      ['campaigns', 'cvs', 'job_descriptions'].map((table_name) => ({
        table_name,
        column_default: '0',
        is_nullable: 'NO',
      })),
    );
  });

  it('indexes job_descriptions by (campaign_id, status)', async () => {
    const { rows } = await client.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE schemaname = 'core' AND indexname = 'job_descriptions_campaign_id_status_idx'",
    );
    expect(rows[0]?.indexdef).toContain('(campaign_id, status)');
  });

  describe('constraints', () => {
    let companyId: number;
    let studentId: number;

    beforeAll(async () => {
      companyId = (await client.query<{ id: number }>("INSERT INTO core.companies (name) VALUES ('ACME') RETURNING id"))
        .rows[0]!.id;
      studentId = (
        await client.query<{ id: number }>(
          "INSERT INTO core.students (student_code, full_name) VALUES ('SV001', 'Trần Thị B') RETURNING id",
        )
      ).rows[0]!.id;
    });

    it('rejects a duplicate users.email and students.student_code', async () => {
      await client.query("INSERT INTO core.users (email, role) VALUES ('center@uni.edu.vn', 'CENTER')");
      await expectViolation(
        client.query("INSERT INTO core.users (email, role) VALUES ('center@uni.edu.vn', 'ADMIN')"),
        '23505',
        'users_email_unique',
      );
      await expectViolation(
        client.query("INSERT INTO core.students (student_code, full_name) VALUES ('SV001', 'Another')"),
        '23505',
        'students_student_code_unique',
      );
    });

    it('stores users.email lower-cased, so uniqueness is case-insensitive', async () => {
      await expectViolation(
        client.query("INSERT INTO core.users (email, role) VALUES ('Center@Uni.edu.vn', 'CENTER')"),
        '23514',
        'users_email_lowercase_check',
      );
    });

    it('accepts only CENTER, STUDENT, HR, ADMIN as users.role', async () => {
      await expectViolation(
        client.query("INSERT INTO core.users (email, role) VALUES ('x@uni.edu.vn', 'GUEST')"),
        '23514',
        'users_role_check',
      );
    });

    it('requires company_id for HR and only for HR', async () => {
      await expectViolation(
        client.query("INSERT INTO core.users (email, role) VALUES ('hr@acme.vn', 'HR')"),
        '23514',
        'users_hr_company_check',
      );
      await expectViolation(
        client.query("INSERT INTO core.users (email, role, company_id) VALUES ('c2@uni.edu.vn', 'CENTER', $1)", [
          companyId,
        ]),
        '23514',
        'users_hr_company_check',
      );
      await client.query("INSERT INTO core.users (email, role, company_id) VALUES ('hr@acme.vn', 'HR', $1)", [
        companyId,
      ]);
    });

    it('requires student_id for STUDENT and only for STUDENT', async () => {
      await expectViolation(
        client.query("INSERT INTO core.users (email, role) VALUES ('sv@uni.edu.vn', 'STUDENT')"),
        '23514',
        'users_student_link_check',
      );
      await client.query("INSERT INTO core.users (email, role, student_id) VALUES ('sv@uni.edu.vn', 'STUDENT', $1)", [
        studentId,
      ]);
    });

    it('rejects a status outside the shared state table', async () => {
      await expectViolation(
        client.query("INSERT INTO core.campaigns (name, status) VALUES ('Đợt 1', 'ARCHIVED')"),
        '23514',
        'campaigns_status_check',
      );
      const { rows } = await client.query<{ status: string; row_version: number }>(
        "INSERT INTO core.campaigns (name) VALUES ('Đợt 1') RETURNING status, row_version",
      );
      expect(rows[0]).toEqual({ status: 'DRAFT', row_version: 0 });
    });

    it('requires a SYSTEM audit actor to have no actor_id and a USER actor to have one', async () => {
      await expectViolation(
        client.query(
          "INSERT INTO core.audit_logs (actor_kind, action, entity, entity_id) VALUES ('USER', 'TRANSITION', 'campaign', 1)",
        ),
        '23514',
        'audit_logs_actor_id_check',
      );
      await expectViolation(
        client.query(
          "INSERT INTO core.audit_logs (actor_kind, actor_id, action, entity, entity_id) VALUES ('SYSTEM', 1, 'TRANSITION', 'campaign', 1)",
        ),
        '23514',
        'audit_logs_actor_id_check',
      );
    });
  });
});
