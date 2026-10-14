// US-1.6 AC-8 (AGENTS › Invariant 7, NFR-1, CONTEXT D30): a student sees only their own CV versions
// and files; HR sees no CV until nominations (US-5.3); the center sees every CV file. Download URLs
// last 5 minutes, signed with the Clock.
import { ApiErrorSchema, CvListSchema, CvSchema, fileId, FileUrlSchema } from '@srm/shared';
import { Clock } from '../../src/common/clock/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { acceptTerms, type LoggedInStudent, loginTargetStudent, submitCv } from '../helpers/cv.js';
import { createCompany } from '../helpers/factories.js';
import { FakeClock } from '../helpers/fake-clock.js';
import { createIntakeCampaign, fixtureFile } from '../helpers/jd.js';

describe('NFR-1: who may read a CV (US-1.6 AC-8)', () => {
  let t: AuthTestApp;
  let x: LoggedInStudent;
  let y: LoggedInStudent;
  let hr: LoggedIn;
  let center: LoggedIn;
  let campaignId: number;
  let cvId: number;
  const clock = new FakeClock();
  const fileName = 'CV Trần Thị B.pdf';

  beforeAll(async () => {
    t = await createAuthTestApp({ configure: (b) => b.overrideProvider(Clock).useValue(clock) });
    [x, y] = [await loginTargetStudent(t), await loginTargetStudent(t)];
    hr = await t.loginAs('HR', { companyId: (await createCompany(t.db)).id });
    center = await t.loginAs('CENTER');
    campaignId = (await createIntakeCampaign(t.db)).id;
    await acceptTerms(x.agent, campaignId).expect(200);
    cvId = CvSchema.parse((await submitCv(x.agent, campaignId, fixtureFile('sample.pdf'), fileName).expect(202)).body).id;
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(() => {
    clock.set(new Date());
  });

  const fileUrl = (agent: LoggedIn['agent']) => agent.get(api(`files/${fileId('cv', cvId)}/url`));

  it('NFR-1: student X lists their versions; student Y does not see them', async () => {
    const mine = CvListSchema.parse((await x.agent.get(api('cvs/me')).expect(200)).body);
    expect(mine.items.map((cv) => cv.id)).toEqual([cvId]);
    const theirs = CvListSchema.parse((await y.agent.get(api('cvs/me')).expect(200)).body);
    expect(theirs.items).toEqual([]);
  });

  it('NFR-1: student Y and HR get 404 on student X CV and file URL', async () => {
    for (const caller of [y, hr]) {
      const res = await fileUrl(caller.agent).expect(404);
      expect(ApiErrorSchema.parse(res.body).code).toBe('ENTITY_NOT_FOUND');
    }
    // HR and the center have no "my CVs" list.
    await hr.agent.get(api('cvs/me')).expect(403);
    await center.agent.get(api('cvs/me')).expect(403);
  });

  it('GĐ2: student X and the center get a URL that downloads the CV', async () => {
    for (const caller of [x, center]) {
      const res = await fileUrl(caller.agent).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const { url } = FileUrlSchema.parse(res.body);
      const download = await fetch(url);
      expect(download.status).toBe(200);
      expect(Buffer.from(await download.arrayBuffer())).toEqual(fixtureFile('sample.pdf'));
      expect(download.headers.get('content-disposition')).toContain(
        `filename*=UTF-8''${encodeURIComponent(fileName)}`,
      );
    }
  });

  it('GĐ2: presigned CV URL expires after 5 minutes', async () => {
    const fresh = FileUrlSchema.parse((await fileUrl(x.agent).expect(200)).body);
    expect(Date.parse(fresh.expiresAt) - clock.now().getTime()).toBe(5 * 60 * 1000);
    expect(new URL(fresh.url).searchParams.get('X-Amz-Expires')).toBe('300');

    // Signed 5 minutes and 1 second ago: MinIO refuses it.
    clock.set(new Date(Date.now() - (5 * 60 + 1) * 1000));
    const stale = FileUrlSchema.parse((await fileUrl(x.agent).expect(200)).body);
    const download = await fetch(stale.url);
    expect(download.status).toBe(403);
    expect(await download.text()).toContain('expired');
  });
});
