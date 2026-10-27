import { isDeepStrictEqual } from 'node:util';
import { Inject, Injectable } from '@nestjs/common';
import type {
  Company,
  CompanyContactInput,
  CompanyList,
  CreateCompanyRequest,
  HrAccountList,
  HrInvitation,
  InviteHrRequest,
  UpdateCompanyRequest,
} from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import { EntityNotFoundError } from '../../../common/errors/index.js';
import type { CompanyContact } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { AuditService, userActor } from '../../audit/index.js';
import { InvitationService } from '../../iam/index.js';
import { COMPANY_AUDIT_ACTIONS, COMPANY_ENTITY } from '../domain/audit-actions.js';
import { type CompanyContent, type CompanyRecord, CompanyRepository } from '../infrastructure/company.repository.js';

/**
 * Companies taking part in internships and their HR accounts (FR-3, US-1.5 AC-1, AC-2). Only the
 * center calls this. A company created here counts as approved, and it joins a campaign by having
 * a JD in it (CONTEXT D28). HR accounts belong to iam; this service checks the company exists and
 * calls its exported InvitationService (AGENTS › Invariant 13).
 */
@Injectable()
export class CompanyService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly repository: CompanyRepository,
    private readonly audit: AuditService,
    private readonly invitations: InvitationService,
  ) {}

  async create(user: AuthUser, input: CreateCompanyRequest): Promise<Company> {
    const content: CompanyContent = {
      name: input.name,
      field: textOrNull(input.field),
      address: textOrNull(input.address),
      contact: contactOf(input.contact),
    };
    const record = await this.db.transaction(async (tx) => {
      const created = await this.repository.insert(tx, content);
      await this.audit.record(tx, {
        actor: userActor(user),
        action: COMPANY_AUDIT_ACTIONS.COMPANY_CREATED,
        entity: COMPANY_ENTITY,
        entityId: created.id,
        after: snapshot(created),
      });
      return created;
    });
    return toCompany(record);
  }

  async list(): Promise<CompanyList> {
    return { items: (await this.repository.list()).map(toCompany) };
  }

  async get(id: number): Promise<Company> {
    return toCompany(await this.requireCompany(id));
  }

  /** Fields left out (also inside `contact`) keep their value; `null` clears one. No change, no audit entry. */
  async update(user: AuthUser, id: number, patch: UpdateCompanyRequest): Promise<Company> {
    const record = await this.db.transaction(async (tx) => {
      const before = await this.repository.findById(id, { tx, lock: 'update' });
      if (!before) throw new EntityNotFoundError(COMPANY_ENTITY, id);
      const content: CompanyContent = {
        name: patch.name ?? before.name,
        field: patch.field === undefined ? before.field : textOrNull(patch.field),
        address: patch.address === undefined ? before.address : textOrNull(patch.address),
        contact: patch.contact === undefined ? before.contact : mergeContact(before.contact, patch.contact),
      };
      if (isDeepStrictEqual(content, contentOf(before))) return before;
      const after = await this.repository.update(tx, id, content);
      await this.audit.record(tx, {
        actor: userActor(user),
        action: COMPANY_AUDIT_ACTIONS.COMPANY_UPDATED,
        entity: COMPANY_ENTITY,
        entityId: id,
        before: snapshot(before),
        after: snapshot(after),
      });
      return after;
    });
    return toCompany(record);
  }

  /** AC-2: creates (or re-issues the link of) an HR account of this company. */
  async inviteHr(user: AuthUser, companyId: number, input: InviteHrRequest): Promise<HrInvitation> {
    await this.requireCompany(companyId);
    return this.invitations.invite(userActor(user), { ...input, companyId });
  }

  async listHrAccounts(companyId: number): Promise<HrAccountList> {
    await this.requireCompany(companyId);
    return this.invitations.listHrAccounts(companyId);
  }

  private async requireCompany(id: number): Promise<CompanyRecord> {
    const record = await this.repository.findById(id);
    if (!record) throw new EntityNotFoundError(COMPANY_ENTITY, id);
    return record;
  }
}

function textOrNull(value: string | null | undefined): string | null {
  return value ? value : null;
}

/** Keeps only the contact fields that hold something, so `{}` means "no contact". */
function contactOf(input: CompanyContactInput | undefined): CompanyContact {
  const contact: CompanyContact = {};
  if (input?.name) contact.name = input.name;
  if (input?.email) contact.email = input.email;
  if (input?.phone) contact.phone = input.phone;
  return contact;
}

/** Contact fields left out of the patch keep their value; `null` or `''` clears one. */
function mergeContact(before: CompanyContact, patch: CompanyContactInput): CompanyContact {
  return contactOf({
    name: patch.name === undefined ? before.name : patch.name,
    email: patch.email === undefined ? before.email : patch.email,
    phone: patch.phone === undefined ? before.phone : patch.phone,
  });
}

function contentOf(record: CompanyRecord): CompanyContent {
  return { name: record.name, field: record.field, address: record.address, contact: record.contact };
}

function snapshot(record: CompanyRecord): Record<string, unknown> {
  return { ...contentOf(record) };
}

function toCompany(record: CompanyRecord): Company {
  return {
    id: record.id,
    name: record.name,
    field: record.field,
    address: record.address,
    contact: {
      name: record.contact.name ?? null,
      email: record.contact.email ?? null,
      phone: record.contact.phone ?? null,
    },
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
