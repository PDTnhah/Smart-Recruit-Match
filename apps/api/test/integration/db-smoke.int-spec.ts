import { Client } from 'pg';
import { ownerDatabaseUrl } from '../helpers/db.js';

describe('infra: PostgreSQL via testcontainers (US-1.1 AC-6)', () => {
  let client: Client;

  beforeAll(async () => {
    // As the owner: creating an extension needs more than the app's api_service role has.
    client = new Client({ connectionString: ownerDatabaseUrl() });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('runs SELECT 1', async () => {
    const result = await client.query<{ one: number }>('SELECT 1 AS one');
    expect(result.rows).toEqual([{ one: 1 }]);
  });

  it('has the pgvector extension available (same image as compose)', async () => {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    const result = await client.query<{ extname: string }>(
      "SELECT extname FROM pg_extension WHERE extname = 'vector'",
    );
    expect(result.rows).toHaveLength(1);
  });
});
