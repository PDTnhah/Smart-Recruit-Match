import { Client } from 'pg';

describe('infra: PostgreSQL via testcontainers (US-1.1 AC-6)', () => {
  let client: Client;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL not set — global setup did not run');
    client = new Client({ connectionString });
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
