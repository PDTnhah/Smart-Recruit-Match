// US-1.6 AC-6 (BR-01, AGENTS › Invariant 11, CONTEXT D30): at most one active CV per student and
// campaign, enforced by the partial unique index `cvs_student_campaign_active_key`, not only by code.
import { ApiErrorSchema } from '@srm/shared';
import { CvRepository } from '../../src/modules/student/infrastructure/cv.repository.js';
import { type AuthTestApp, createAuthTestApp } from '../helpers/auth.js';
import { acceptTerms, cvObjectKeys, cvRows, loginTargetStudent, submitCv } from '../helpers/cv.js';
import { createCampaign, createCv, createStudent } from '../helpers/factories.js';
import { createIntakeCampaign, fixtureFile, testS3 } from '../helpers/jd.js';

/** Resolves for every caller once `parties` callers are waiting, or after `timeoutMs` regardless. */
function barrier(parties: number, timeoutMs = 5_000): () => Promise<void> {
  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
    setTimeout(resolve, timeoutMs).unref();
  });
  return () => {
    arrived += 1;
    if (arrived >= parties) release();
    return gate;
  };
}

describe('BR-01: one active CV per student and campaign (US-1.6 AC-6)', () => {
  let t: AuthTestApp;
  const s3 = testS3();

  beforeAll(async () => {
    t = await createAuthTestApp();
  });

  afterAll(async () => {
    s3.destroy();
    await t.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('BR-01: database rejects a second active CV for same student and campaign', async () => {
    const [student, campaign] = [await createStudent(t.db), await createCampaign(t.db)];
    await createCv(t.db, { studentId: student.id, campaignId: campaign.id, version: 1, active: false });
    await createCv(t.db, { studentId: student.id, campaignId: campaign.id, version: 2, active: true });

    // Plain SQL, bypassing the API and Drizzle.
    const insert = (version: number, active: boolean) =>
      t.db.$client.query(
        `INSERT INTO core.cvs (student_id, campaign_id, file_key, file_name, version, active)
         VALUES ($1, $2, $3, 'cv.pdf', $4, $5)`,
        [student.id, campaign.id, `cv/raw-${version}-${String(active)}`, version, active],
      );
    await expect(insert(3, true)).rejects.toMatchObject({ code: '23505', constraint: 'cvs_student_campaign_active_key' });
    // Inactive versions are not limited, but each version number is used once.
    await insert(3, false);
    await expect(insert(3, false)).rejects.toMatchObject({
      code: '23505',
      constraint: 'cvs_student_campaign_version_key',
    });
    // The same student may have an active CV in another campaign.
    await createCv(t.db, { studentId: student.id, version: 1, active: true });
  });

  it('BR-01: concurrent uploads leave exactly one active CV and one 409', async () => {
    const student = await loginTargetStudent(t);
    const campaignId = (await createIntakeCampaign(t.db)).id;
    await acceptTerms(student.agent, campaignId).expect(200);

    // Both requests pass the checks before either reaches the database lock, so they truly race:
    // first with no CV yet (only the index can refuse), then with an active version to replace.
    const repository = t.app.get(CvRepository);
    const lockActive = repository.lockActive.bind(repository);
    for (const existing of [0, 1]) {
      const bothArrived = barrier(2);
      jest.spyOn(repository, 'lockActive').mockImplementation(async (...args) => {
        await bothArrived();
        return lockActive(...args);
      });

      const results = await Promise.all([
        submitCv(student.agent, campaignId, fixtureFile('sample.pdf'), 'a.pdf'),
        submitCv(student.agent, campaignId, fixtureFile('sample.docx'), 'b.docx'),
      ]);
      jest.restoreAllMocks();

      expect(results.map((res) => res.status).sort()).toEqual([202, 409]);
      const loser = results.find((res) => res.status === 409)!;
      expect(ApiErrorSchema.parse(loser.body).code).toBe('CV_SUBMISSION_CONFLICT');

      const rows = await cvRows(t.db, student.studentId, campaignId);
      expect(rows).toHaveLength(existing + 1);
      expect(rows.filter((row) => row.active)).toHaveLength(1);
      expect(rows.at(-1)).toMatchObject({ version: existing + 1, active: true });
      // The loser's object was deleted; every row still has its file.
      expect((await cvObjectKeys(s3, student.studentId, campaignId)).sort()).toEqual(
        rows.map((row) => row.fileKey).sort(),
      );
    }
  });
});
