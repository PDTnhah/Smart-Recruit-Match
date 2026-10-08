// Minimal valid rows for the core tables. Test files share one database and run in parallel,
// so every unique column gets a fresh value.
import type { Database } from '../../src/db/types.js';
import type { Role } from '@srm/shared';
import { campaigns, companies, cvs, jobDescriptions, students, users } from '../../src/db/schema/index.js';

let sequence = 0;

/** A value unique across parallel Jest workers. */
export function uniqueValue(prefix: string): string {
  sequence += 1;
  return `${prefix}-${process.pid}-${Date.now()}-${sequence}`;
}

export async function createCompany(db: Database, values: Partial<typeof companies.$inferInsert> = {}) {
  const [row] = await db
    .insert(companies)
    .values({ name: uniqueValue('company'), ...values })
    .returning();
  return row!;
}

export async function createStudent(db: Database, values: Partial<typeof students.$inferInsert> = {}) {
  const [row] = await db
    .insert(students)
    .values({ studentCode: uniqueValue('sv'), fullName: 'Nguyễn Văn A', ...values })
    .returning();
  return row!;
}

export async function createCampaign(db: Database, values: Partial<typeof campaigns.$inferInsert> = {}) {
  const [row] = await db
    .insert(campaigns)
    .values({ name: uniqueValue('campaign'), ...values })
    .returning();
  return row!;
}

export async function createJobDescription(
  db: Database,
  values: Partial<typeof jobDescriptions.$inferInsert> = {},
) {
  const [campaignId, companyId] = await Promise.all([
    values.campaignId ?? createCampaign(db).then((row) => row.id),
    values.companyId ?? createCompany(db).then((row) => row.id),
  ]);
  const [row] = await db
    .insert(jobDescriptions)
    .values({ title: 'Backend Intern', quota: 2, ...values, campaignId, companyId })
    .returning();
  return row!;
}

export async function createCv(db: Database, values: Partial<typeof cvs.$inferInsert> = {}) {
  const [studentId, campaignId] = await Promise.all([
    values.studentId ?? createStudent(db).then((row) => row.id),
    values.campaignId ?? createCampaign(db).then((row) => row.id),
  ]);
  const [row] = await db
    .insert(cvs)
    .values({ fileKey: uniqueValue('cv-files/cv'), ...values, studentId, campaignId })
    .returning();
  return row!;
}

/** A `users` row. HR needs `companyId` and STUDENT needs `studentId` (users CHECKs). */
export async function createUser(
  db: Database,
  values: Partial<typeof users.$inferInsert> & { role: Role },
) {
  const [row] = await db
    .insert(users)
    .values({ email: `${uniqueValue('user')}@test.local`, fullName: 'Người dùng thử', ...values })
    .returning();
  return row!;
}
