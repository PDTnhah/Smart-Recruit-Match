// The full API (AppModule) over HTTP for integration tests, plus `loginAs` for RBAC and IDOR tests
// (US-1.3 AC-8). Later stories write an IDOR check in one line:
//   const { agent } = await t.loginAs('HR', { companyId: other.id });
//   await agent.get(`/api/job-descriptions/${jd.id}`).expect(404);
import type { INestApplication, ModuleMetadata, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { API_PREFIX, AuthSessionSchema, type Role } from '@srm/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { DRIZZLE } from '../../src/db/tokens.js';
import type { Database } from '../../src/db/types.js';
import { hashPassword } from '../../src/modules/iam/index.js';
import { createCompany, createStudent, createUser } from './factories.js';

/** Password of every account created by `loginAs` and `createLoginUser`. */
export const TEST_PASSWORD = 'Test-Password-123';

export type TestAgent = ReturnType<typeof request.agent>;
export type TestUser = Awaited<ReturnType<typeof createUser>>;

export interface LoginOptions {
  /** HR only; a new company is created when omitted. */
  companyId?: number;
  /** STUDENT only; a new student is created when omitted. */
  studentId?: number;
}

export interface LoggedIn {
  /** Supertest agent sending `Authorization: Bearer <access token>` on every request. */
  agent: TestAgent;
  user: TestUser;
  accessToken: string;
}

export interface AuthTestApp {
  app: INestApplication<App>;
  db: Database;
  /** Anonymous requests. */
  http(): ReturnType<typeof request>;
  /** Creates a fresh account with TEST_PASSWORD (no login). */
  createLoginUser(role: Role, options?: LoginOptions): Promise<TestUser>;
  /** Creates a fresh account of the role and logs it in through POST /api/auth/login. */
  loginAs(role: Role, options?: LoginOptions): Promise<LoggedIn>;
  close(): Promise<void>;
}

/** Path under the global prefix: `api('auth/login')` → `/api/auth/login`. */
export function api(path: string): string {
  return `/${API_PREFIX}/${path.replace(/^\/+/, '')}`;
}

// scrypt takes ~50-100 ms and 32 MiB; hash the shared test password once per Jest worker.
let testPasswordHash: Promise<string> | undefined;

function passwordHash(): Promise<string> {
  testPasswordHash ??= hashPassword(TEST_PASSWORD);
  return testPasswordHash;
}

export interface AuthTestAppOptions {
  /** Test-only controllers, e.g. a resource for record-access checks. */
  controllers?: Type[];
  imports?: ModuleMetadata['imports'];
}

export async function createAuthTestApp(options: AuthTestAppOptions = {}): Promise<AuthTestApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ...(options.imports ?? [])],
    controllers: options.controllers ?? [],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: false });
  configureApp(app, { NODE_ENV: 'test' });
  await app.init();
  const db = app.get<Database>(DRIZZLE);
  const server = app.getHttpServer();

  async function createLoginUser(role: Role, loginOptions: LoginOptions = {}): Promise<TestUser> {
    const companyId =
      role === 'HR' ? (loginOptions.companyId ?? (await createCompany(db)).id) : undefined;
    const studentId =
      role === 'STUDENT' ? (loginOptions.studentId ?? (await createStudent(db)).id) : undefined;
    return createUser(db, { role, companyId, studentId, passwordHash: await passwordHash() });
  }

  async function loginAs(role: Role, loginOptions: LoginOptions = {}): Promise<LoggedIn> {
    const user = await createLoginUser(role, loginOptions);
    const response = await request(server)
      .post(api('auth/login'))
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(200);
    const { accessToken } = AuthSessionSchema.parse(response.body);
    const agent = request.agent(server).set('Authorization', `Bearer ${accessToken}`);
    return { agent, user, accessToken };
  }

  return {
    app,
    db,
    http: () => request(server),
    createLoginUser,
    loginAs,
    close: () => app.close(),
  };
}

/** Value of the refresh cookie in a response's Set-Cookie header, or undefined. */
export function refreshCookieFrom(setCookie: string[] | string | undefined): string | undefined {
  const headers = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookie = headers.find((header) => header.startsWith('srm_refresh='));
  return cookie?.slice('srm_refresh='.length).split(';')[0];
}
