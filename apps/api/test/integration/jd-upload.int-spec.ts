// US-1.5 AC-5 (FR-4, ARCHITECTURE › Security architecture › Tải file): the original JD file is
// checked by content, limited to 5 MB and stored encrypted in the `jd-files` bucket.
import { ApiErrorSchema, JobDescriptionSchema, MAX_UPLOAD_BYTES } from '@srm/shared';
import { eq } from 'drizzle-orm';
import { jobDescriptions } from '../../src/db/schema/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createCompany } from '../helpers/factories.js';
import { createIntakeCampaign, fixtureFile, headJdObject, jdBody, jdObjectKeys, testS3 } from '../helpers/jd.js';
import { auditEntries } from '../helpers/state.js';

describe('GĐ1: JD file upload (US-1.5 AC-5)', () => {
  let t: AuthTestApp;
  let hr: LoggedIn;
  let campaignId: number;
  const s3 = testS3();

  beforeAll(async () => {
    t = await createAuthTestApp();
    hr = await t.loginAs('HR', { companyId: (await createCompany(t.db)).id });
    campaignId = (await createIntakeCampaign(t.db)).id;
  });

  afterAll(async () => {
    s3.destroy();
    await t.close();
  });

  async function createDraft() {
    const res = await hr.agent.post(api('jds')).send(jdBody(campaignId, { description: null })).expect(201);
    return JobDescriptionSchema.parse(res.body);
  }

  const upload = (jdId: number, rowVersion: number, content: Buffer, filename: string) =>
    hr.agent
      .put(api(`jds/${jdId}/file`))
      .field('rowVersion', String(rowVersion))
      .attach('file', content, { filename, contentType: 'application/octet-stream' });

  async function storedKey(jdId: number): Promise<string | null> {
    const [row] = await t.db
      .select({ fileKey: jobDescriptions.fileKey })
      .from(jobDescriptions)
      .where(eq(jobDescriptions.id, jdId));
    return row?.fileKey ?? null;
  }

  it('GĐ1: real PDF and DOCX are stored encrypted in jd-files', async () => {
    for (const [fixture, name, ext] of [
      ['sample.pdf', 'JD Thực tập Backend.pdf', 'pdf'],
      ['sample.docx', 'mo-ta.docx', 'docx'],
    ] as const) {
      const jd = await createDraft();
      const res = await upload(jd.id, jd.rowVersion, fixtureFile(fixture), name).expect(200);
      expect(JobDescriptionSchema.parse(res.body)).toMatchObject({ file: { name }, rowVersion: jd.rowVersion + 1 });

      const key = await storedKey(jd.id);
      expect(key).toMatch(new RegExp(`^jd/${jd.id}/[0-9a-f-]{36}\\.${ext}$`));
      const head = await headJdObject(s3, key!);
      expect(head.ServerSideEncryption).toBe('AES256');
      expect(head.ContentLength).toBe(fixtureFile(fixture).length);

      const [entry] = await auditEntries(t.db, 'job_description', jd.id);
      expect(entry?.action).toBe('JD_FILE_ATTACHED');
      expect(entry?.after).toMatchObject({ fileName: name, type: ext });
    }
  });

  it('GĐ1: a file alone lets the JD be submitted; a new file replaces the old object', async () => {
    const jd = await createDraft();
    const first = JobDescriptionSchema.parse(
      (await upload(jd.id, jd.rowVersion, fixtureFile('sample.pdf'), 'v1.pdf').expect(200)).body,
    );
    const firstKey = await storedKey(jd.id);
    const second = JobDescriptionSchema.parse(
      (await upload(jd.id, first.rowVersion, fixtureFile('sample.docx'), 'v2.docx').expect(200)).body,
    );
    expect(second.file).toEqual({ name: 'v2.docx' });
    expect(await jdObjectKeys(s3, `jd/${jd.id}/`)).toEqual([await storedKey(jd.id)]);
    expect(await jdObjectKeys(s3, firstKey!)).toEqual([]);

    await hr.agent.post(api(`jds/${jd.id}/submit`)).send({ rowVersion: second.rowVersion }).expect(200);
  });

  it('GĐ1: fake .pdf returns 415', async () => {
    const jd = await createDraft();
    for (const fixture of ['fake.pdf', 'plain.zip']) {
      const res = await upload(jd.id, jd.rowVersion, fixtureFile(fixture), 'jd.pdf').expect(415);
      expect(ApiErrorSchema.parse(res.body).code).toBe('UNSUPPORTED_FILE_TYPE');
    }
    expect(await storedKey(jd.id)).toBeNull();
    expect(await jdObjectKeys(s3, `jd/${jd.id}/`)).toEqual([]);
  });

  it('GĐ1: 6 MB file returns 413 and nothing is written to MinIO', async () => {
    const jd = await createDraft();
    // A real PDF header, so only the size can be the reason for the refusal. Built at run time
    // instead of committing a 6 MB fixture (US-1.5 Story refresh).
    const big = Buffer.concat([fixtureFile('sample.pdf'), Buffer.alloc(6 * 1024 * 1024 - 607, 0x20)]);
    expect(big.length).toBeGreaterThan(MAX_UPLOAD_BYTES);
    const res = await upload(jd.id, jd.rowVersion, big, 'big.pdf').expect(413);
    expect(ApiErrorSchema.parse(res.body).code).toBe('FILE_TOO_LARGE');
    expect(await storedKey(jd.id)).toBeNull();
    expect(await jdObjectKeys(s3, `jd/${jd.id}/`)).toEqual([]);
  });

  it('GĐ1: upload without a file returns 400; stale row_version returns 409 and leaves no object', async () => {
    const jd = await createDraft();
    await hr.agent.put(api(`jds/${jd.id}/file`)).field('rowVersion', String(jd.rowVersion)).expect(400);
    await upload(jd.id, jd.rowVersion + 5, fixtureFile('sample.pdf'), 'x.pdf').expect(409);
    expect(await jdObjectKeys(s3, `jd/${jd.id}/`)).toEqual([]);
  });

  it('GĐ1: a submitted JD takes no new file', async () => {
    const jd = await createDraft();
    const withFile = JobDescriptionSchema.parse(
      (await upload(jd.id, jd.rowVersion, fixtureFile('sample.pdf'), 'a.pdf').expect(200)).body,
    );
    const sent = JobDescriptionSchema.parse(
      (await hr.agent.post(api(`jds/${jd.id}/submit`)).send({ rowVersion: withFile.rowVersion }).expect(200)).body,
    );
    const res = await upload(jd.id, sent.rowVersion, fixtureFile('sample.docx'), 'b.docx').expect(409);
    expect(ApiErrorSchema.parse(res.body).code).toBe('JD_NOT_EDITABLE');
  });
});
