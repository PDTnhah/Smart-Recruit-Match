// US-1.5 AC-8 (BR-11, NFR-1): HR reaches only its own company's JDs and files; a JD of another
// company answers 404 exactly like a missing one. Students have no access to JD endpoints.
import { fileId, JdListSchema } from '@srm/shared';
import { eq } from 'drizzle-orm';
import { jobDescriptions } from '../../src/db/schema/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createTwoCompanyFixture, type TwoCompanyFixture } from '../helpers/fixtures.js';
import { createIntakeCampaign, createJdInState, fixtureFile } from '../helpers/jd.js';
import { readState } from '../helpers/state.js';

describe('BR-11: JD record-level access (US-1.5 AC-8)', () => {
  let t: AuthTestApp;
  let f: TwoCompanyFixture;
  let center: LoggedIn;
  let campaignId: number;

  beforeAll(async () => {
    t = await createAuthTestApp();
    f = await createTwoCompanyFixture(t);
    center = await t.loginAs('CENTER');
    campaignId = (await createIntakeCampaign(t.db)).id;
  });

  afterAll(async () => {
    await t.close();
  });

  /** A draft of company B that has a stored file key (the object itself is not needed for 404s). */
  async function draftOfB() {
    const jd = await createJdInState(t.db, { companyId: f.companyB.id, campaignId, status: 'DRAFT' });
    await t.db
      .update(jobDescriptions)
      .set({ fileKey: `jd/${jd.id}/missing.pdf`, fileName: 'b.pdf' })
      .where(eq(jobDescriptions.id, jd.id));
    return jd;
  }

  it('BR-11: HR of company A gets 404 on company B JD and its file', async () => {
    const jd = await draftOfB();
    const hrA = f.hrA.agent;
    await hrA.get(api(`jds/${jd.id}`)).expect(404);
    await hrA.patch(api(`jds/${jd.id}`)).send({ rowVersion: jd.rowVersion, quota: 9 }).expect(404);
    await hrA
      .put(api(`jds/${jd.id}/file`))
      .field('rowVersion', String(jd.rowVersion))
      .attach('file', fixtureFile('sample.pdf'), 'a.pdf')
      .expect(404);
    await hrA.post(api(`jds/${jd.id}/submit`)).send({ rowVersion: jd.rowVersion }).expect(404);
    await hrA.get(api(`files/${fileId('jd', jd.id)}/url`)).expect(404);

    // Same answer as for an id that does not exist.
    await hrA.get(api('jds/999999999')).expect(404);
    await hrA.get(api(`files/${fileId('jd', 999_999_999)}/url`)).expect(404);

    // Nothing changed, and HR of B still reaches its own JD.
    expect(await readState(t.db, 'jobDescription', jd.id)).toMatchObject({ status: 'DRAFT', rowVersion: 0 });
    await f.hrB.agent.get(api(`jds/${jd.id}`)).expect(200);
  });

  it('BR-11: HR list contains only own company JDs', async () => {
    const [ofA, ofB] = await Promise.all([
      createJdInState(t.db, { companyId: f.companyA.id, campaignId, status: 'DRAFT' }),
      createJdInState(t.db, { companyId: f.companyB.id, campaignId, status: 'DRAFT' }),
    ]);
    const listA = JdListSchema.parse((await f.hrA.agent.get(api('jds')).expect(200)).body);
    expect(listA.items.every((jd) => jd.companyId === f.companyA.id)).toBe(true);
    expect(listA.items.map((jd) => jd.id)).toContain(ofA.id);
    expect(listA.items.map((jd) => jd.id)).not.toContain(ofB.id);

    const all = JdListSchema.parse((await center.agent.get(api(`jds?campaignId=${campaignId}`)).expect(200)).body);
    expect(all.items.map((jd) => jd.id)).toEqual(expect.arrayContaining([ofA.id, ofB.id]));
  });

  it('BR-11: the center filters JDs by campaign and status', async () => {
    const pending = await createJdInState(t.db, { companyId: f.companyA.id, campaignId, status: 'PENDING_APPROVAL' });
    const list = JdListSchema.parse(
      (await center.agent.get(api(`jds?campaignId=${campaignId}&status=PENDING_APPROVAL`)).expect(200)).body,
    );
    expect(list.items.map((jd) => jd.id)).toContain(pending.id);
    expect(list.items.every((jd) => jd.status === 'PENDING_APPROVAL' && jd.campaignId === campaignId)).toBe(true);
  });

  it('BR-11: STUDENT calling HR and center JD endpoints gets 403', async () => {
    const jd = await createJdInState(t.db, { companyId: f.companyA.id, campaignId, status: 'PENDING_APPROVAL' });
    const student = f.studentX.agent;
    await student.get(api('jds')).expect(403);
    await student.get(api(`jds/${jd.id}`)).expect(403);
    await student.post(api('jds')).send({}).expect(403);
    await student.patch(api(`jds/${jd.id}`)).send({ rowVersion: 0 }).expect(403);
    await student.post(api(`jds/${jd.id}/submit`)).send({ rowVersion: 0 }).expect(403);
    await student.post(api(`jds/${jd.id}/approve`)).send({ rowVersion: 0 }).expect(403);
    await student.get(api(`files/${fileId('jd', jd.id)}/url`)).expect(403);
  });
});
