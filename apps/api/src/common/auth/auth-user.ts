import type { Role } from '@srm/shared';
import { z } from 'zod';

/**
 * The caller as known from the access token alone; guards never query the DB (US-1.3 budget).
 * HR always carries its company and STUDENT its student record, mirroring the `users` CHECKs.
 */
export type AuthUser =
  | { userId: number; role: 'CENTER' | 'ADMIN' }
  | { userId: number; role: 'HR'; companyId: number }
  | { userId: number; role: 'STUDENT'; studentId: number };

const sub = z.string().regex(/^\d+$/);
const scopeId = z.number().int().positive();

/** Access token payload (CONTEXT D25): `sub`, `role`, plus `company_id` or `student_id`. */
export const AccessTokenClaimsSchema = z.discriminatedUnion('role', [
  z.object({ sub, role: z.enum(['CENTER', 'ADMIN']) }),
  z.object({ sub, role: z.literal('HR'), company_id: scopeId }),
  z.object({ sub, role: z.literal('STUDENT'), student_id: scopeId }),
]);

export type AccessTokenClaims = z.infer<typeof AccessTokenClaimsSchema>;

export function toClaims(user: AuthUser): AccessTokenClaims {
  const sub = String(user.userId);
  switch (user.role) {
    case 'HR':
      return { sub, role: user.role, company_id: user.companyId };
    case 'STUDENT':
      return { sub, role: user.role, student_id: user.studentId };
    default:
      return { sub, role: user.role };
  }
}

export function fromClaims(claims: AccessTokenClaims): AuthUser {
  const userId = Number(claims.sub);
  switch (claims.role) {
    case 'HR':
      return { userId, role: claims.role, companyId: claims.company_id };
    case 'STUDENT':
      return { userId, role: claims.role, studentId: claims.student_id };
    default:
      return { userId, role: claims.role };
  }
}

/** Builds an AuthUser from a `users` row; null when the row breaks the role/scope pairing. */
export function authUserFromRow(row: {
  id: number;
  role: Role;
  companyId: number | null;
  studentId: number | null;
}): AuthUser | null {
  switch (row.role) {
    case 'HR':
      return row.companyId === null ? null : { userId: row.id, role: row.role, companyId: row.companyId };
    case 'STUDENT':
      return row.studentId === null ? null : { userId: row.id, role: row.role, studentId: row.studentId };
    default:
      return { userId: row.id, role: row.role };
  }
}

/** The part of the HTTP request the auth layer reads and writes. */
export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
}
