import { Client } from 'pg';
import { databaseUrl } from '../helpers/db.js';

const INSERT_ENTRY = `INSERT INTO core.audit_logs (actor_kind, action, entity, entity_id, reason)
  VALUES ('SYSTEM', 'TRANSITION', 'append_only_check', $1, 'seed') RETURNING id`;

/** The trigger raises insufficient_privilege (42501) with an "append-only" message. */
async function expectRejected(promise: Promise<unknown>, operation: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    code: '42501',
    message: expect.stringContaining(`append-only: ${operation} is not allowed`) as unknown,
  });
}

/** Runs the three forbidden statements against one existing entry and checks it is still there. */
async function expectAppendOnly(client: Client, entryId: number): Promise<void> {
  await expectRejected(client.query("UPDATE core.audit_logs SET reason = 'edited' WHERE id = $1", [entryId]), 'UPDATE');
  await expectRejected(client.query('DELETE FROM core.audit_logs WHERE id = $1', [entryId]), 'DELETE');
  await expectRejected(client.query('TRUNCATE core.audit_logs'), 'TRUNCATE');
  const { rows } = await client.query<{ reason: string }>('SELECT reason FROM core.audit_logs WHERE id = $1', [entryId]);
  expect(rows).toEqual([{ reason: 'seed' }]);
}

describe('BR-10: UPDATE, DELETE and TRUNCATE on audit_logs are rejected by the database', () => {
  const role = `audit_app_${process.pid}`;
  const password = 'audit-app-test';
  let owner: Client;

  beforeAll(async () => {
    // The container user is a superuser and owns the tables, like the compose stack's account.
    owner = new Client({ connectionString: databaseUrl() });
    await owner.connect();
    await owner.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
    await owner.query(`GRANT USAGE ON SCHEMA core TO ${role}`);
    await owner.query(`GRANT ALL PRIVILEGES ON core.audit_logs TO ${role}`);
    await owner.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA core TO ${role}`);
  });

  afterAll(async () => {
    await owner?.query(`DROP OWNED BY ${role}`);
    await owner?.query(`DROP ROLE IF EXISTS ${role}`);
    await owner?.end();
  });

  it('allows INSERT and rejects the rest for the owning superuser', async () => {
    const { rows } = await owner.query<{ id: number }>(INSERT_ENTRY, [1]);
    await expectAppendOnly(owner, rows[0]!.id);
  });

  it('rejects the rest for an ordinary role granted ALL on the table', async () => {
    const url = new URL(databaseUrl());
    url.username = role;
    url.password = password;
    const app = new Client({ connectionString: url.toString() });
    await app.connect();
    try {
      const { rows } = await app.query<{ id: number }>(INSERT_ENTRY, [2]);
      await expectAppendOnly(app, rows[0]!.id);
    } finally {
      await app.end();
    }
  });

  it('still rejects them when a superuser sets session_replication_role = replica (ENABLE ALWAYS)', async () => {
    const { rows } = await owner.query<{ id: number }>(INSERT_ENTRY, [3]);
    await owner.query('SET session_replication_role = replica');
    try {
      await expectAppendOnly(owner, rows[0]!.id);
    } finally {
      await owner.query('RESET session_replication_role');
    }
  });
});
