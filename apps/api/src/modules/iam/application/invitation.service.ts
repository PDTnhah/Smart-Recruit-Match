import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { type HrAccount, type HrAccountList, type HrInvitation, invitationPath, type InviteHrRequest } from '@srm/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { InvitationTokenService } from '../../../common/auth/index.js';
import { EmailTakenError, InvitationInvalidError } from '../../../common/errors/index.js';
import { emitSafely } from '../../../common/events/index.js';
import { uniqueViolation } from '../../../db/errors.js';
import { users } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { type Actor, AuditService } from '../../audit/index.js';
import { IAM_AUDIT_ACTIONS, USER_ENTITY } from '../domain/audit-actions.js';
import { HR_INVITED, type HrInvitedEvent } from '../domain/events.js';
import { hashPassword } from '../domain/password.js';
import { ACCOUNT_COLUMNS, type AccountRow, AuthService, type IssuedSession } from './auth.service.js';

export interface InviteHrInput extends InviteHrRequest {
  companyId: number;
}

/**
 * HR accounts by invitation (FR-3, US-1.5 AC-2, AC-3, CONTEXT D28, D29). The company module checks
 * the company and calls `invite`; the HR accepts with the token and sets a password. Every
 * invitation stores a fresh nonce that its token carries: a re-invite replaces the nonce, so
 * earlier links stop working, and accepting clears it in the same statement that sets the
 * password, so a token works once even when two requests race.
 */
@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly tokens: InvitationTokenService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Creates an HR account without a password, or issues a new link for one that has not accepted
   * yet in the same company (its name is updated to the one sent). Any other existing account
   * with the email: 409 EMAIL_TAKEN.
   */
  async invite(actor: Actor, input: InviteHrInput): Promise<HrInvitation> {
    const invitationNonce = randomBytes(24).toString('base64url');
    let account: AccountRow;
    try {
      account = await this.db.transaction(async (tx) => {
        const [existing] = await tx
          .select(ACCOUNT_COLUMNS)
          .from(users)
          .where(eq(users.email, input.email))
          .for('update');
        if (existing) {
          if (!isPendingHrOf(existing, input.companyId)) throw new EmailTakenError();
          const [reinvited] = await tx
            .update(users)
            .set({ fullName: input.fullName, invitationNonce })
            .where(eq(users.id, existing.id))
            .returning(ACCOUNT_COLUMNS);
          if (!reinvited) throw new Error(`update of users ${existing.id} returned no row`);
          await this.audit.record(tx, {
            actor,
            action: IAM_AUDIT_ACTIONS.HR_REINVITED,
            entity: USER_ENTITY,
            entityId: existing.id,
            before: { fullName: existing.fullName },
            after: { role: 'HR', companyId: input.companyId, fullName: input.fullName },
          });
          return reinvited;
        }
        const [created] = await tx
          .insert(users)
          .values({
            email: input.email,
            fullName: input.fullName,
            role: 'HR',
            companyId: input.companyId,
            invitationNonce,
          })
          .returning(ACCOUNT_COLUMNS);
        if (!created) throw new Error('insert into users returned no row');
        await this.audit.record(tx, {
          actor,
          action: IAM_AUDIT_ACTIONS.HR_INVITED,
          entity: USER_ENTITY,
          entityId: created.id,
          after: { role: 'HR', companyId: input.companyId, fullName: input.fullName },
        });
        return created;
      });
    } catch (error) {
      // Two invitations of the same new email at once: the loser hits the unique constraint.
      if (uniqueViolation(error) === 'users_email_unique') throw new EmailTakenError();
      throw error;
    }

    const signed = await this.tokens.sign(account.id, invitationNonce);
    const invitation: HrInvitation = {
      account: toHrAccount(account),
      invitationPath: invitationPath(signed.token),
      expiresAt: signed.expiresAt.toISOString(),
    };
    emitSafely(this.events, this.logger, HR_INVITED, {
      userId: account.id,
      companyId: input.companyId,
      email: account.email,
      fullName: account.fullName,
      invitationPath: invitation.invitationPath,
      expiresAt: invitation.expiresAt,
    } satisfies HrInvitedEvent);
    return invitation;
  }

  /** AC-3: sets the password and logs the HR in. Used, replaced, expired or forged tokens: 422. */
  async accept(token: string, password: string): Promise<IssuedSession> {
    const { userId, nonce } = await this.tokens.verify(token);
    const passwordHash = await hashPassword(password);
    const account = await this.db.transaction(async (tx) => {
      // Only the latest invitation matches; clearing the nonce makes the token single-use, also
      // when two requests race.
      const [updated] = await tx
        .update(users)
        .set({ passwordHash, invitationNonce: null })
        .where(
          and(
            eq(users.id, userId),
            eq(users.role, 'HR'),
            eq(users.isActive, true),
            isNull(users.passwordHash),
            eq(users.invitationNonce, nonce),
          ),
        )
        .returning(ACCOUNT_COLUMNS);
      if (!updated) throw new InvitationInvalidError();
      await this.audit.record(tx, {
        actor: { kind: 'USER', userId },
        action: IAM_AUDIT_ACTIONS.HR_INVITATION_ACCEPTED,
        entity: USER_ENTITY,
        entityId: userId,
      });
      return updated;
    });
    return this.auth.issue(account);
  }

  /** HR accounts of a company, oldest first; PENDING until the invitation is accepted. */
  async listHrAccounts(companyId: number): Promise<HrAccountList> {
    const rows = await this.db
      .select(ACCOUNT_COLUMNS)
      .from(users)
      .where(and(eq(users.role, 'HR'), eq(users.companyId, companyId)))
      .orderBy(asc(users.id));
    return { items: rows.map(toHrAccount) };
  }
}

function isPendingHrOf(account: AccountRow, companyId: number): boolean {
  return account.role === 'HR' && account.companyId === companyId && account.isActive && account.passwordHash === null;
}

function toHrAccount(account: AccountRow): HrAccount {
  return {
    id: account.id,
    email: account.email,
    fullName: account.fullName,
    status: account.passwordHash === null ? 'PENDING' : 'ACTIVE',
  };
}
