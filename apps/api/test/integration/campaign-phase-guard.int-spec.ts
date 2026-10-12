// US-1.4 AC-8 (FR-2): CampaignService.assertPhase blocks actions outside their phase. The endpoint
// below exists only in this test; US-1.5 (JD) and US-1.6 (CV) call assertPhase the same way.
import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiErrorSchema } from '@srm/shared';
import { Roles } from '../../src/common/auth/index.js';
import { IdParamDto } from '../../src/common/validation/id-param.dto.js';
import { CampaignModule, CampaignService } from '../../src/modules/campaign/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createCampaign } from '../helpers/factories.js';

const DAY = 86_400_000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

@Controller('test-phase')
class PhaseGuardTestController {
  constructor(private readonly campaigns: CampaignService) {}

  @Roles('CENTER')
  @Post(':id/intake-action')
  @HttpCode(200)
  async intakeAction(@Param() { id }: IdParamDto) {
    const settings = await this.campaigns.assertPhase(id, ['INTAKE']);
    return { ok: true, status: settings.status };
  }
}

describe('FR-2: phase guard (US-1.4 AC-8)', () => {
  let t: AuthTestApp;
  let center: LoggedIn;
  let testDb: TestDb;

  beforeAll(async () => {
    t = await createAuthTestApp({ controllers: [PhaseGuardTestController], imports: [CampaignModule] });
    center = await t.loginAs('CENTER');
    testDb = createTestDb();
  });

  afterAll(async () => {
    await t.close();
    await testDb.close();
  });

  const call = (id: number) => center.agent.post(api(`test-phase/${id}/intake-action`)).send({});

  it('FR-2: action outside its phase returns 409 CAMPAIGN_PHASE_MISMATCH', async () => {
    const campaign = await createCampaign(t.db, {
      status: 'PREFERENCE_SELECTION',
      phaseDeadlines: { intake_end: inDays(-1), preference_end: inDays(6), testing_end: inDays(13) },
    });
    const res = await call(campaign.id).expect(409);
    expect(ApiErrorSchema.parse(res.body)).toMatchObject({
      code: 'CAMPAIGN_PHASE_MISMATCH',
      details: { campaignId: campaign.id, status: 'PREFERENCE_SELECTION', allowed: ['INTAKE'] },
    });
  });

  it('FR-2: action in its phase before the deadline goes through', async () => {
    const campaign = await createCampaign(t.db, { status: 'INTAKE', phaseDeadlines: { intake_end: inDays(3) } });
    expect((await call(campaign.id).expect(200)).body).toEqual({ ok: true, status: 'INTAKE' });
  });

  it('FR-2: action after the phase deadline is refused even before the scheduler moves the campaign', async () => {
    const intakeEnd = new Date(Date.now() - 60_000).toISOString();
    const campaign = await createCampaign(t.db, {
      status: 'INTAKE',
      phaseDeadlines: { intake_end: intakeEnd, preference_end: inDays(6), testing_end: inDays(13) },
    });
    const res = await call(campaign.id).expect(409);
    expect(ApiErrorSchema.parse(res.body)).toMatchObject({
      code: 'CAMPAIGN_PHASE_MISMATCH',
      details: { status: 'INTAKE', phaseEndedAt: intakeEnd },
    });
  });

  it('FR-2: unknown campaign returns 404', async () => {
    const res = await call(999_999_999).expect(404);
    expect(ApiErrorSchema.parse(res.body).code).toBe('ENTITY_NOT_FOUND');
  });

  it('FR-2: inside a transaction the campaign row stays locked until the caller commits', async () => {
    const campaign = await createCampaign(t.db, { status: 'INTAKE', phaseDeadlines: { intake_end: inDays(3) } });
    const service = t.app.get(CampaignService);
    await t.db.transaction(async (tx) => {
      await service.assertPhase(campaign.id, ['INTAKE'], { tx });
      // A phase change needs FOR UPDATE on the row; it cannot get it while the caller holds FOR SHARE.
      await expect(
        testDb.pool.query('SELECT id FROM core.campaigns WHERE id = $1 FOR UPDATE NOWAIT', [campaign.id]),
      ).rejects.toMatchObject({ code: '55P03' });
    });
    await expect(
      testDb.pool.query('SELECT id FROM core.campaigns WHERE id = $1 FOR UPDATE NOWAIT', [campaign.id]),
    ).resolves.toMatchObject({ rowCount: 1 });
  });
});
