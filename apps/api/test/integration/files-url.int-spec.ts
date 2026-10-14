// US-1.5 AC-9 (ARCHITECTURE › Lưu trữ file): `GET /api/files/{id}/url` returns a presigned MinIO
// URL that works for 5 minutes. The signing time comes from the Clock, so the test can sign a URL
// "6 minutes ago" and check that MinIO refuses it.
import { ApiErrorSchema, fileId, FileUrlSchema, JobDescriptionSchema } from '@srm/shared';
import { Clock } from '../../src/common/clock/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createCompany } from '../helpers/factories.js';
import { FakeClock } from '../helpers/fake-clock.js';
import { createIntakeCampaign, fixtureFile, jdBody } from '../helpers/jd.js';

describe('GĐ1: presigned file URLs (US-1.5 AC-9)', () => {
  let t: AuthTestApp;
  let hr: LoggedIn;
  let center: LoggedIn;
  let jdId: number;
  const clock = new FakeClock();

  beforeAll(async () => {
    t = await createAuthTestApp({ configure: (b) => b.overrideProvider(Clock).useValue(clock) });
    hr = await t.loginAs('HR', { companyId: (await createCompany(t.db)).id });
    center = await t.loginAs('CENTER');
    const campaign = await createIntakeCampaign(t.db);
    const jd = JobDescriptionSchema.parse(
      (await hr.agent.post(api('jds')).send(jdBody(campaign.id)).expect(201)).body,
    );
    await hr.agent
      .put(api(`jds/${jd.id}/file`))
      .field('rowVersion', String(jd.rowVersion))
      .attach('file', fixtureFile('sample.pdf'), 'Mô tả công việc.pdf')
      .expect(200);
    jdId = jd.id;
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(() => {
    clock.set(new Date());
  });

  async function presign(agent: LoggedIn['agent']) {
    const res = await agent.get(api(`files/${fileId('jd', jdId)}/url`)).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    return FileUrlSchema.parse(res.body);
  }

  it('GĐ1: HR of the company and the center get a URL that downloads the original file', async () => {
    for (const caller of [hr, center]) {
      const { url, expiresAt } = await presign(caller.agent);
      expect(Date.parse(expiresAt) - clock.now().getTime()).toBe(5 * 60 * 1000);
      expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('300');

      const download = await fetch(url);
      expect(download.status).toBe(200);
      expect(Buffer.from(await download.arrayBuffer())).toEqual(fixtureFile('sample.pdf'));
      expect(download.headers.get('content-disposition')).toContain(
        `filename*=UTF-8''${encodeURIComponent('Mô tả công việc.pdf')}`,
      );
    }
  });

  it('GĐ1: presigned JD file URL expires after 5 minutes', async () => {
    // Signed 5 minutes and 1 second before the real now: MinIO sees an expired URL.
    clock.set(new Date(Date.now() - (5 * 60 + 1) * 1000));
    const { url } = await presign(hr.agent);
    const download = await fetch(url);
    expect(download.status).toBe(403);
    expect(await download.text()).toContain('expired');
  });

  it('GĐ1: a JD without a file and a malformed id answer 404 and 400', async () => {
    const campaign = await createIntakeCampaign(t.db);
    const bare = JobDescriptionSchema.parse(
      (await hr.agent.post(api('jds')).send(jdBody(campaign.id)).expect(201)).body,
    );
    const missing = await hr.agent.get(api(`files/${fileId('jd', bare.id)}/url`)).expect(404);
    expect(ApiErrorSchema.parse(missing.body).code).toBe('ENTITY_NOT_FOUND');
    await hr.agent.get(api('files/report:1/url')).expect(400);
    // No module has registered `cv` yet (US-1.6).
    await center.agent.get(api('files/cv:1/url')).expect(404);
  });
});
