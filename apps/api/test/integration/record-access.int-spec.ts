// US-1.3 AC-6 (BR-11, NFR-1): records outside the caller's scope answer 404, like missing ones.
// The resource below exists only in this test; real resources (JD, CV…) get their own IDOR tests
// in their stories, written the same way.
import { Body, Controller, Get, Inject, Param, Patch } from '@nestjs/common';
import { ApiErrorSchema } from '@srm/shared';
import { and, eq } from 'drizzle-orm';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  assertRecordAccess,
  type AuthUser,
  CurrentUser,
  recordScopeWhere,
  Roles,
} from '../../src/common/auth/index.js';
import { IdParamDto } from '../../src/common/validation/id-param.dto.js';
import { cvs, jobDescriptions } from '../../src/db/schema/index.js';
import { DRIZZLE } from '../../src/db/tokens.js';
import type { Database } from '../../src/db/types.js';
import { api, type AuthTestApp, createAuthTestApp } from '../helpers/auth.js';
import { createCv, createJobDescription } from '../helpers/factories.js';
import { createTwoCompanyFixture, type TwoCompanyFixture } from '../helpers/fixtures.js';

class RenameDto extends createZodDto(z.object({ title: z.string().min(1) })) {}

const JD_COLUMNS = { id: jobDescriptions.id, companyId: jobDescriptions.companyId, title: jobDescriptions.title };

@Controller('test-records')
class RecordAccessTestController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Roles('HR', 'CENTER', 'ADMIN')
  @Get('job-descriptions/:id')
  async getJobDescription(@Param() { id }: IdParamDto, @CurrentUser() user: AuthUser) {
    const [row] = await this.db.select(JD_COLUMNS).from(jobDescriptions).where(eq(jobDescriptions.id, id));
    return assertRecordAccess(user, row, 'job_description', id);
  }

  @Roles('HR', 'CENTER', 'ADMIN')
  @Patch('job-descriptions/:id')
  async renameJobDescription(
    @Param() { id }: IdParamDto,
    @Body() body: RenameDto,
    @CurrentUser() user: AuthUser,
  ) {
    const [row] = await this.db
      .update(jobDescriptions)
      .set({ title: body.title })
      .where(and(eq(jobDescriptions.id, id), recordScopeWhere(user, { companyId: jobDescriptions.companyId })))
      .returning(JD_COLUMNS);
    return assertRecordAccess(user, row, 'job_description', id);
  }

  @Roles('STUDENT', 'CENTER', 'ADMIN')
  @Get('cvs/:id')
  async getCv(@Param() { id }: IdParamDto, @CurrentUser() user: AuthUser) {
    const [row] = await this.db
      .select({ id: cvs.id, studentId: cvs.studentId })
      .from(cvs)
      .where(eq(cvs.id, id));
    return assertRecordAccess(user, row, 'cv', id);
  }
}

describe('BR-11: record-level access (US-1.3 AC-6)', () => {
  let t: AuthTestApp;
  let f: TwoCompanyFixture;

  beforeAll(async () => {
    t = await createAuthTestApp({ controllers: [RecordAccessTestController] });
    f = await createTwoCompanyFixture(t);
  });

  afterAll(async () => {
    await t.close();
  });

  it('BR-11: HR of company A gets 404 on company B record', async () => {
    const jdB = await createJobDescription(t.db, { companyId: f.companyB.id, title: 'JD của B' });
    const path = api(`test-records/job-descriptions/${jdB.id}`);

    const read = await f.hrA.agent.get(path).expect(404);
    expect(ApiErrorSchema.parse(read.body)).toEqual({
      code: 'ENTITY_NOT_FOUND',
      message: `job_description ${jdB.id} not found`,
      details: { entity: 'job_description', id: jdB.id },
    });
    // Same answer as for an ID that does not exist.
    const missingId = jdB.id + 1_000_000;
    const missing = await f.hrA.agent.get(api(`test-records/job-descriptions/${missingId}`)).expect(404);
    expect(ApiErrorSchema.parse(missing.body).code).toBe('ENTITY_NOT_FOUND');

    await f.hrA.agent.patch(path).send({ title: 'Bị sửa' }).expect(404);
    const [unchanged] = await t.db
      .select({ title: jobDescriptions.title })
      .from(jobDescriptions)
      .where(eq(jobDescriptions.id, jdB.id));
    expect(unchanged?.title).toBe('JD của B');

    await f.hrB.agent.get(path).expect(200);
    await f.hrB.agent.patch(path).send({ title: 'B tự sửa' }).expect(200);
    const { agent: center } = await t.loginAs('CENTER');
    await center.get(path).expect(200);
  });

  it('NFR-1: student X gets 404 on student Y record', async () => {
    const cvY = await createCv(t.db, { studentId: f.studentYId });
    const path = api(`test-records/cvs/${cvY.id}`);
    await f.studentX.agent.get(path).expect(404);
    await f.studentY.agent.get(path).expect(200);
    const { agent: admin } = await t.loginAs('ADMIN');
    await admin.get(path).expect(200);
  });

  it('validates the id parameter', async () => {
    const res = await f.hrA.agent.get(api('test-records/job-descriptions/abc')).expect(400);
    expect(ApiErrorSchema.parse(res.body).code).toBe('VALIDATION_FAILED');
  });
});
