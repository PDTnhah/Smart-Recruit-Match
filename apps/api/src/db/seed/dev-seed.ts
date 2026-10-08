// Dev/test seed (US-1.3 AC-8): one account per role, two companies with one HR each, two students.
// Idempotent: running it again creates nothing new and leaves existing passwords alone.
// Usage: DATABASE_URL=… [SEED_PASSWORD=…] pnpm --filter @srm/api db:seed
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import type { Role } from '@srm/shared';
import { hashPassword } from '../../modules/iam/index.js';
import * as schema from '../schema/index.js';
import { companies, students, users } from '../schema/index.js';
import type { Database } from '../types.js';

/** Default password of every seeded account when SEED_PASSWORD is not set (docs/SETUP.md). */
export const DEFAULT_SEED_PASSWORD = 'Srm-Dev-12345';

export const SEED_COMPANIES = ['Công ty Demo Alpha', 'Công ty Demo Beta'] as const;

export const SEED_STUDENTS = [
  { studentCode: 'SV-DEMO-001', fullName: 'Sinh viên Demo Một', major: 'Công nghệ thông tin', cohort: 'K66', gpa: 3.2 },
  { studentCode: 'SV-DEMO-002', fullName: 'Sinh viên Demo Hai', major: 'Khoa học máy tính', cohort: 'K66', gpa: 3.6 },
] as const;

interface SeedAccount {
  email: string;
  fullName: string;
  role: Role;
  company?: (typeof SEED_COMPANIES)[number];
  studentCode?: (typeof SEED_STUDENTS)[number]['studentCode'];
}

export const SEED_ACCOUNTS: readonly SeedAccount[] = [
  { email: 'admin@srm.local', fullName: 'Quản trị hệ thống', role: 'ADMIN' },
  { email: 'center@srm.local', fullName: 'Cán bộ Trung tâm', role: 'CENTER' },
  { email: 'hr.alpha@srm.local', fullName: 'HR Demo Alpha', role: 'HR', company: 'Công ty Demo Alpha' },
  { email: 'hr.beta@srm.local', fullName: 'HR Demo Beta', role: 'HR', company: 'Công ty Demo Beta' },
  { email: 'sv001@srm.local', fullName: 'Sinh viên Demo Một', role: 'STUDENT', studentCode: 'SV-DEMO-001' },
  { email: 'sv002@srm.local', fullName: 'Sinh viên Demo Hai', role: 'STUDENT', studentCode: 'SV-DEMO-002' },
];

export async function seedDev(db: Database, password: string = DEFAULT_SEED_PASSWORD): Promise<void> {
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    // companies.name has no unique constraint, so look the seed companies up by name.
    const companyIds = new Map<string, number>();
    for (const name of SEED_COMPANIES) {
      const [existing] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.name, name));
      const id = existing?.id ?? (await tx.insert(companies).values({ name }).returning({ id: companies.id }))[0]?.id;
      if (id === undefined) throw new Error(`seed: could not create company ${name}`);
      companyIds.set(name, id);
    }

    await tx.insert(students).values([...SEED_STUDENTS]).onConflictDoNothing({ target: students.studentCode });
    const studentRows = await tx
      .select({ id: students.id, studentCode: students.studentCode })
      .from(students)
      .where(inArray(students.studentCode, SEED_STUDENTS.map((s) => s.studentCode)));
    const studentIds = new Map(studentRows.map((row) => [row.studentCode, row.id]));

    await tx
      .insert(users)
      .values(
        SEED_ACCOUNTS.map((account) => ({
          email: account.email,
          fullName: account.fullName,
          role: account.role,
          passwordHash,
          companyId: account.company ? companyIds.get(account.company) : undefined,
          studentId: account.studentCode ? studentIds.get(account.studentCode) : undefined,
        })),
      )
      .onConflictDoNothing({ target: users.email });
  });
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (process.env.NODE_ENV === 'production') {
    console.error('seed: refusing to run with NODE_ENV=production (dev/test data only)');
    process.exit(1);
  }
  if (!url) {
    console.error('seed: DATABASE_URL is not set');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  const password = process.env.SEED_PASSWORD || DEFAULT_SEED_PASSWORD;
  seedDev(drizzle({ client: pool, schema }), password)
    .then(() => {
      console.log('seed: accounts (password from SEED_PASSWORD, default in docs/SETUP.md):');
      for (const account of SEED_ACCOUNTS) console.log(`  ${account.role.padEnd(8)} ${account.email}`);
    })
    .catch((error: unknown) => {
      console.error('seed: failed', error);
      process.exitCode = 1;
    })
    .finally(() => void pool.end());
}
