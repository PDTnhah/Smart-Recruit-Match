// Two companies with one HR each and two students, all logged in (US-1.3 AC-8). The base fixture
// for IDOR tests: HR of A must never reach B's records, student X never Y's (BR-11, NFR-1).
import type { AuthTestApp, LoggedIn } from './auth.js';
import { createCompany, createStudent, uniqueValue } from './factories.js';

export interface TwoCompanyFixture {
  companyA: { id: number };
  companyB: { id: number };
  studentXId: number;
  studentYId: number;
  hrA: LoggedIn;
  hrB: LoggedIn;
  studentX: LoggedIn;
  studentY: LoggedIn;
}

export async function createTwoCompanyFixture(t: AuthTestApp): Promise<TwoCompanyFixture> {
  const [companyA, companyB, studentX, studentY] = await Promise.all([
    createCompany(t.db, { name: uniqueValue('Công ty A') }),
    createCompany(t.db, { name: uniqueValue('Công ty B') }),
    createStudent(t.db, { fullName: 'Sinh viên X' }),
    createStudent(t.db, { fullName: 'Sinh viên Y' }),
  ]);
  const [hrA, hrB, loggedX, loggedY] = await Promise.all([
    t.loginAs('HR', { companyId: companyA.id }),
    t.loginAs('HR', { companyId: companyB.id }),
    t.loginAs('STUDENT', { studentId: studentX.id }),
    t.loginAs('STUDENT', { studentId: studentY.id }),
  ]);
  return {
    companyA,
    companyB,
    studentXId: studentX.id,
    studentYId: studentY.id,
    hrA,
    hrB,
    studentX: loggedX,
    studentY: loggedY,
  };
}
