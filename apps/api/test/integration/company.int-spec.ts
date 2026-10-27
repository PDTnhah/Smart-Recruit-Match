// US-1.5 AC-1, AC-2 (FR-3): the center manages companies and invites HR accounts.
import {
  ApiErrorSchema,
  CompanyListSchema,
  CompanySchema,
  HrAccountListSchema,
  HrInvitationSchema,
} from '@srm/shared';
import { eq } from 'drizzle-orm';
import { users } from '../../src/db/schema/index.js';
import { HR_INVITED, type HrInvitedEvent } from '../../src/modules/iam/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createCompany, uniqueValue } from '../helpers/factories.js';
import { captureEvents } from '../helpers/jd.js';
import { auditEntries } from '../helpers/state.js';

const uniqueEmail = () => `${uniqueValue('hr')}@company.test`.toLowerCase();

describe('FR-3: companies and HR invitations (US-1.5)', () => {
  let t: AuthTestApp;
  let center: LoggedIn;
  let invited: HrInvitedEvent[];

  beforeAll(async () => {
    t = await createAuthTestApp();
    center = await t.loginAs('CENTER');
    invited = captureEvents<HrInvitedEvent>(t.app, HR_INVITED);
  });

  afterAll(async () => {
    await t.close();
  });

  it('FR-3: center creates and updates company with audit; other roles get 403', async () => {
    const created = await center.agent
      .post(api('companies'))
      .send({
        name: 'Công ty Cổ phần Phần mềm Sao Mai',
        field: 'Phần mềm',
        address: 'Cầu Giấy, Hà Nội',
        contact: { name: 'Trần Thị C', email: 'Lien.He@SaoMai.vn', phone: '0901 234 567' },
      })
      .expect(201);
    const company = CompanySchema.parse(created.body);
    expect(company).toMatchObject({
      name: 'Công ty Cổ phần Phần mềm Sao Mai',
      field: 'Phần mềm',
      contact: { name: 'Trần Thị C', email: 'lien.he@saomai.vn', phone: '0901 234 567' },
    });

    const updated = await center.agent
      .patch(api(`companies/${company.id}`))
      .send({ address: null, contact: { name: 'Lê Văn D' } })
      .expect(200);
    // Contact fields left out of the patch keep their value.
    expect(CompanySchema.parse(updated.body)).toMatchObject({
      name: company.name,
      address: null,
      contact: { name: 'Lê Văn D', email: 'lien.he@saomai.vn', phone: '0901 234 567' },
    });

    const entries = await auditEntries(t.db, 'company', company.id);
    expect(entries.map((entry) => entry.action)).toEqual(['COMPANY_UPDATED', 'COMPANY_CREATED']);
    expect(entries[0]).toMatchObject({ actorKind: 'USER', actorId: center.user.id });
    expect(entries[0]?.before).toMatchObject({ address: 'Cầu Giấy, Hà Nội' });
    expect(entries[0]?.after).toMatchObject({ address: null });

    // Saving the same values again writes nothing.
    await center.agent.patch(api(`companies/${company.id}`)).send({ address: null }).expect(200);
    expect(await auditEntries(t.db, 'company', company.id)).toHaveLength(2);

    const list = CompanyListSchema.parse((await center.agent.get(api('companies')).expect(200)).body);
    expect(list.items.map((item) => item.id)).toContain(company.id);

    for (const role of ['HR', 'STUDENT', 'ADMIN'] as const) {
      const { agent } = await t.loginAs(role);
      await agent.post(api('companies')).send({ name: 'X' }).expect(403);
      await agent.patch(api(`companies/${company.id}`)).send({ name: 'X' }).expect(403);
      await agent.get(api('companies')).expect(403);
    }
  });

  it('FR-3: invalid company input returns 400; unknown company returns 404', async () => {
    await center.agent.post(api('companies')).send({ name: '   ' }).expect(400);
    await center.agent.patch(api('companies/999999999')).send({ name: 'X' }).expect(404);
  });

  it('FR-3: center invites HR, emits hr.invited and returns invite link', async () => {
    const company = await createCompany(t.db);
    const email = uniqueEmail();
    const res = await center.agent
      .post(api(`companies/${company.id}/hr-invitations`))
      .send({ email: email.toUpperCase(), fullName: 'Nguyễn Văn HR' })
      .expect(201);
    const invitation = HrInvitationSchema.parse(res.body);
    expect(invitation.account).toMatchObject({ email, fullName: 'Nguyễn Văn HR', status: 'PENDING' });
    expect(invitation.invitationPath).toMatch(/^\/accept-invitation#[\w-]+\.[\w-]+\.[\w-]+$/);
    const expiresInDays = (Date.parse(invitation.expiresAt) - Date.now()) / 86_400_000;
    expect(expiresInDays).toBeGreaterThan(6.9);
    expect(expiresInDays).toBeLessThanOrEqual(7);

    const [account] = await t.db.select().from(users).where(eq(users.email, email));
    expect(account).toMatchObject({ role: 'HR', companyId: company.id, passwordHash: null, isActive: true });

    expect(invited).toContainEqual({
      userId: account!.id,
      companyId: company.id,
      email,
      fullName: 'Nguyễn Văn HR',
      invitationPath: invitation.invitationPath,
      expiresAt: invitation.expiresAt,
    });
    const [entry] = await auditEntries(t.db, 'user', account!.id);
    expect(entry).toMatchObject({ action: 'HR_INVITED', actorId: center.user.id, after: { role: 'HR', companyId: company.id } });

    const accounts = HrAccountListSchema.parse(
      (await center.agent.get(api(`companies/${company.id}/hr-accounts`)).expect(200)).body,
    );
    expect(accounts.items).toEqual([{ id: account!.id, email, fullName: 'Nguyễn Văn HR', status: 'PENDING' }]);
  });

  it('FR-3: inviting an existing email returns 409', async () => {
    const [companyA, companyB] = await Promise.all([createCompany(t.db), createCompany(t.db)]);
    const active = await t.createLoginUser('HR', { companyId: companyA.id });
    const student = await t.createLoginUser('STUDENT');

    for (const email of [active.email, student.email]) {
      const res = await center.agent
        .post(api(`companies/${companyA.id}/hr-invitations`))
        .send({ email, fullName: 'Ai đó' })
        .expect(409);
      expect(ApiErrorSchema.parse(res.body).code).toBe('EMAIL_TAKEN');
    }

    // A pending HR of company A cannot be moved to company B by inviting it there.
    const pendingEmail = uniqueEmail();
    await center.agent
      .post(api(`companies/${companyA.id}/hr-invitations`))
      .send({ email: pendingEmail, fullName: 'HR A' })
      .expect(201);
    await center.agent
      .post(api(`companies/${companyB.id}/hr-invitations`))
      .send({ email: pendingEmail, fullName: 'HR A' })
      .expect(409);
  });

  it('FR-3: re-inviting a pending HR of the same company issues a new link (CONTEXT D28)', async () => {
    const company = await createCompany(t.db);
    const email = uniqueEmail();
    const first = HrInvitationSchema.parse(
      (
        await center.agent
          .post(api(`companies/${company.id}/hr-invitations`))
          .send({ email, fullName: 'HR mời lại' })
          .expect(201)
      ).body,
    );
    const second = HrInvitationSchema.parse(
      (
        await center.agent
          .post(api(`companies/${company.id}/hr-invitations`))
          .send({ email, fullName: 'HR mời lại' })
          .expect(201)
      ).body,
    );
    expect(second.account.id).toBe(first.account.id);
    const entries = await auditEntries(t.db, 'user', first.account.id);
    expect(entries.map((entry) => entry.action)).toEqual(['HR_REINVITED', 'HR_INVITED']);
  });

  it('FR-3: re-inviting with a corrected name updates the account and records the change', async () => {
    const company = await createCompany(t.db);
    const email = uniqueEmail();
    const invitePath = api(`companies/${company.id}/hr-invitations`);
    await center.agent.post(invitePath).send({ email, fullName: 'Nguyen Van A' }).expect(201);
    const res = await center.agent.post(invitePath).send({ email, fullName: 'Nguyễn Văn A' }).expect(201);
    const invitation = HrInvitationSchema.parse(res.body);
    expect(invitation.account.fullName).toBe('Nguyễn Văn A');
    expect(invited.at(-1)).toMatchObject({ email, fullName: 'Nguyễn Văn A' });
    const [entry] = await auditEntries(t.db, 'user', invitation.account.id);
    expect(entry?.before).toEqual({ fullName: 'Nguyen Van A' });
    expect(entry?.after).toMatchObject({ fullName: 'Nguyễn Văn A' });
  });

  it('FR-3: a contact patch changes only the fields it sends', async () => {
    const created = CompanySchema.parse(
      (
        await center.agent
          .post(api('companies'))
          .send({ name: 'Công ty Liên hệ', contact: { name: 'An', email: 'an@lienhe.vn', phone: '090' } })
          .expect(201)
      ).body,
    );
    const phoneOnly = await center.agent
      .patch(api(`companies/${created.id}`))
      .send({ contact: { phone: '091' } })
      .expect(200);
    expect(CompanySchema.parse(phoneOnly.body).contact).toEqual({ name: 'An', email: 'an@lienhe.vn', phone: '091' });
    const cleared = await center.agent
      .patch(api(`companies/${created.id}`))
      .send({ contact: { email: null, name: '' } })
      .expect(200);
    expect(CompanySchema.parse(cleared.body).contact).toEqual({ name: null, email: null, phone: '091' });
  });

  it('FR-3: inviting into an unknown company returns 404; only the center may invite', async () => {
    await center.agent
      .post(api('companies/999999999/hr-invitations'))
      .send({ email: uniqueEmail(), fullName: 'X' })
      .expect(404);
    const company = await createCompany(t.db);
    const hr = await t.loginAs('HR', { companyId: company.id });
    await hr.agent
      .post(api(`companies/${company.id}/hr-invitations`))
      .send({ email: uniqueEmail(), fullName: 'X' })
      .expect(403);
    await hr.agent.get(api(`companies/${company.id}/hr-accounts`)).expect(403);
  });
});
