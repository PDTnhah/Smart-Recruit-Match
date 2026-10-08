// US-1.3 AC-7 (account administration) and AC-8 (idempotent dev seed).
import { ApiErrorSchema, AuthSessionSchema, UserListSchema, UserSummarySchema } from '@srm/shared';
import { eq, inArray } from 'drizzle-orm';
import { companies, students, users } from '../../src/db/schema/index.js';
import {
  DEFAULT_SEED_PASSWORD,
  SEED_ACCOUNTS,
  SEED_COMPANIES,
  SEED_STUDENTS,
  seedDev,
} from '../../src/db/seed/dev-seed.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { uniqueValue } from '../helpers/factories.js';

const PASSWORD = 'Initial-Password-1';

function newEmail(): string {
  return `${uniqueValue('admin-created')}@test.local`;
}

describe('FR-1: account administration (US-1.3 AC-7)', () => {
  let t: AuthTestApp;
  let admin: LoggedIn;

  beforeAll(async () => {
    t = await createAuthTestApp();
    admin = await t.loginAs('ADMIN');
  });

  afterAll(async () => {
    await t.close();
  });

  const create = (body: Record<string, unknown>) => admin.agent.post(api('admin/users')).send(body);

  it('FR-1: admin creates CENTER, ADMIN, STUDENT accounts; HR is rejected with 422; duplicate email returns 409; non-admin gets 403', async () => {
    for (const role of ['CENTER', 'ADMIN'] as const) {
      const email = newEmail();
      const res = await create({ role, email, password: PASSWORD, fullName: 'Cán bộ mới' }).expect(201);
      expect(UserSummarySchema.parse(res.body)).toMatchObject({ email, role, studentId: null, isActive: true });
    }

    const studentCode = uniqueValue('SV');
    const studentEmail = newEmail();
    const created = await create({
      role: 'STUDENT',
      email: studentEmail,
      password: PASSWORD,
      fullName: 'Trần Thị B',
      student: { studentCode, major: 'Hệ thống thông tin', cohort: 'K67', gpa: 3.75 },
    }).expect(201);
    const summary = UserSummarySchema.parse(created.body);
    expect(summary.studentId).not.toBeNull();
    const [student] = await t.db.select().from(students).where(eq(students.studentCode, studentCode));
    expect(student).toMatchObject({ id: summary.studentId, fullName: 'Trần Thị B', cohort: 'K67', gpa: 3.75 });

    const hr = await create({ role: 'HR', email: newEmail(), password: PASSWORD, fullName: 'HR' }).expect(422);
    expect(ApiErrorSchema.parse(hr.body).code).toBe('ROLE_NOT_ALLOWED');

    const duplicate = await create({
      role: 'CENTER',
      email: studentEmail.toUpperCase(),
      password: PASSWORD,
      fullName: 'Trùng email',
    }).expect(409);
    expect(ApiErrorSchema.parse(duplicate.body).code).toBe('EMAIL_TAKEN');

    const { agent: center } = await t.loginAs('CENTER');
    const forbidden = await center
      .post(api('admin/users'))
      .send({ role: 'CENTER', email: newEmail(), password: PASSWORD, fullName: 'X' })
      .expect(403);
    expect(ApiErrorSchema.parse(forbidden.body).code).toBe('FORBIDDEN');
    await t.http().post(api('admin/users')).send({}).expect(401);
  });

  it('lets the created account log in with the initial password', async () => {
    const email = newEmail();
    await create({ role: 'CENTER', email, password: PASSWORD, fullName: 'Cán bộ C' }).expect(201);
    const res = await t.http().post(api('auth/login')).send({ email, password: PASSWORD }).expect(200);
    expect(AuthSessionSchema.parse(res.body).user).toMatchObject({ email, role: 'CENTER' });
  });

  it('rolls back the student when the account email is taken', async () => {
    const email = newEmail();
    await create({ role: 'CENTER', email, password: PASSWORD, fullName: 'Có trước' }).expect(201);
    const studentCode = uniqueValue('SV');
    await create({
      role: 'STUDENT',
      email,
      password: PASSWORD,
      fullName: 'Không được tạo',
      student: { studentCode, major: 'CNTT', cohort: 'K66', gpa: 3 },
    }).expect(409);
    expect(await t.db.select().from(students).where(eq(students.studentCode, studentCode))).toEqual([]);
  });

  it('returns 409 STUDENT_CODE_TAKEN and creates no account for a duplicate student code', async () => {
    const studentCode = uniqueValue('SV');
    const student = { studentCode, major: 'CNTT', cohort: 'K66', gpa: 3 };
    await create({ role: 'STUDENT', email: newEmail(), password: PASSWORD, fullName: 'A', student }).expect(201);
    const email = newEmail();
    const res = await create({ role: 'STUDENT', email, password: PASSWORD, fullName: 'B', student }).expect(409);
    expect(ApiErrorSchema.parse(res.body).code).toBe('STUDENT_CODE_TAKEN');
    expect(await t.db.select().from(users).where(eq(users.email, email))).toEqual([]);
  });

  it('validates the body: short password, missing student fields, student fields on a non-student', async () => {
    const bodies = [
      { role: 'CENTER', email: newEmail(), password: 'short', fullName: 'A' },
      { role: 'STUDENT', email: newEmail(), password: PASSWORD, fullName: 'A' },
      {
        role: 'ADMIN',
        email: newEmail(),
        password: PASSWORD,
        fullName: 'A',
        student: { studentCode: 'X', major: 'Y', cohort: 'Z', gpa: 1 },
      },
      { role: 'GUEST', email: newEmail(), password: PASSWORD, fullName: 'A' },
    ];
    for (const body of bodies) {
      const res = await create(body).expect(400);
      expect(ApiErrorSchema.parse(res.body).code).toBe('VALIDATION_FAILED');
    }
  });

  it('lists accounts without password hashes and filters by role', async () => {
    const email = newEmail();
    await create({ role: 'CENTER', email, password: PASSWORD, fullName: 'Liệt kê' }).expect(201);
    const res = await admin.agent.get(api('admin/users')).query({ role: 'CENTER', limit: 200 }).expect(200);
    const list = UserListSchema.parse(res.body);
    expect(list.items.every((item) => item.role === 'CENTER')).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt/);
    await admin.agent.get(api('admin/users')).query({ limit: 0 }).expect(400);
  });
});

describe('US-1.3 AC-8: dev seed', () => {
  let t: AuthTestApp;

  beforeAll(async () => {
    t = await createAuthTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('dev seed is idempotent', async () => {
    await seedDev(t.db);
    await seedDev(t.db);

    const emails = SEED_ACCOUNTS.map((account) => account.email);
    const seededUsers = await t.db.select().from(users).where(inArray(users.email, emails));
    expect(seededUsers.map((user) => user.role).sort()).toEqual(
      ['ADMIN', 'CENTER', 'HR', 'HR', 'STUDENT', 'STUDENT'],
    );
    const seededCompanies = await t.db.select().from(companies).where(inArray(companies.name, [...SEED_COMPANIES]));
    expect(seededCompanies).toHaveLength(2);
    const seededStudents = await t.db
      .select()
      .from(students)
      .where(inArray(students.studentCode, SEED_STUDENTS.map((s) => s.studentCode)));
    expect(seededStudents).toHaveLength(2);
    // Each HR belongs to a different seeded company.
    const hrCompanies = seededUsers.filter((user) => user.role === 'HR').map((user) => user.companyId);
    expect(new Set(hrCompanies)).toEqual(new Set(seededCompanies.map((company) => company.id)));

    for (const email of emails) {
      await t.http().post(api('auth/login')).send({ email, password: DEFAULT_SEED_PASSWORD }).expect(200);
    }
  });
});
