import { z } from 'zod';
import { EmailSchema } from './auth.js';
import { optionalText } from './common.js';

// Companies and HR invitations (FR-3, US-1.5, CONTEXT D28). The center creates companies, which
// count as approved, and invites their HR accounts; HR never registers on its own.

/**
 * Contact email: may be left empty, valid when given. A refined string rather than a union with
 * `''`, so the OpenAPI type stays a plain string.
 */
const OptionalEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, { error: 'Email quá dài' })
  .refine((value) => value === '' || EmailSchema.safeParse(value).success, { error: 'Email không hợp lệ' });

/** Contact person; every field may be left empty. */
export const CompanyContactSchema = z.object({
  name: optionalText('Tên người liên hệ', 200),
  email: OptionalEmailSchema.nullable().optional(),
  phone: optionalText('Số điện thoại', 50),
});

export type CompanyContactInput = z.output<typeof CompanyContactSchema>;

const CompanyNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Vui lòng nhập tên doanh nghiệp' })
  .max(200, { error: 'Tên doanh nghiệp tối đa 200 ký tự' });

/** Body of `POST /api/companies`. */
export const CreateCompanyRequestSchema = z.object({
  name: CompanyNameSchema,
  field: optionalText('Lĩnh vực', 200),
  address: optionalText('Địa chỉ', 500),
  contact: CompanyContactSchema.optional(),
});

export type CreateCompanyRequest = z.output<typeof CreateCompanyRequestSchema>;

/** Body of `PATCH /api/companies/{id}`: only the fields that change; `null` clears one. */
export const UpdateCompanyRequestSchema = CreateCompanyRequestSchema.partial();

export type UpdateCompanyRequest = z.output<typeof UpdateCompanyRequestSchema>;

export const CompanySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  field: z.string().nullable(),
  address: z.string().nullable(),
  contact: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Company = z.output<typeof CompanySchema>;

export const CompanyListSchema = z.object({ items: z.array(CompanySchema) });

export type CompanyList = z.output<typeof CompanyListSchema>;

// --- HR invitations ---------------------------------------------------------------------------

/** An invitation link stays valid for 7 days (CONTEXT D28). */
export const HR_INVITATION_TTL_DAYS = 7;

/** Web route of the accept-invitation page. */
export const ACCEPT_INVITATION_PATH = '/accept-invitation';

/** The token goes after `#`: browsers never send the fragment, so it stays out of server logs. */
export function invitationPath(token: string): string {
  return `${ACCEPT_INVITATION_PATH}#${token}`;
}

/** Body of `POST /api/companies/{id}/hr-invitations`. */
export const InviteHrRequestSchema = z.object({
  email: EmailSchema,
  fullName: z
    .string()
    .trim()
    .min(1, { error: 'Vui lòng nhập họ tên' })
    .max(200, { error: 'Họ tên tối đa 200 ký tự' }),
});

export type InviteHrRequest = z.output<typeof InviteHrRequestSchema>;

/** PENDING: invited, no password yet. ACTIVE: the invitation was accepted. */
export const HR_ACCOUNT_STATUSES = ['PENDING', 'ACTIVE'] as const;

export type HrAccountStatus = (typeof HR_ACCOUNT_STATUSES)[number];

export const HrAccountSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  fullName: z.string().nullable(),
  status: z.enum(HR_ACCOUNT_STATUSES),
});

export type HrAccount = z.output<typeof HrAccountSchema>;

export const HrAccountListSchema = z.object({ items: z.array(HrAccountSchema) });

export type HrAccountList = z.output<typeof HrAccountListSchema>;

/** Response of an invitation: the link the center sends by hand until email exists (US-1.7). */
export const HrInvitationSchema = z.object({
  account: HrAccountSchema,
  /** Relative to the web origin: `/accept-invitation#<token>`. */
  invitationPath: z.string(),
  expiresAt: z.iso.datetime(),
});

export type HrInvitation = z.output<typeof HrInvitationSchema>;
