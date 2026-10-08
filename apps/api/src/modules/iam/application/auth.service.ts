import { Inject, Injectable } from '@nestjs/common';
import { ACCESS_TOKEN_TTL_SECONDS, type AuthSession, type Me, type Role } from '@srm/shared';
import { eq, type SQL } from 'drizzle-orm';
import { AccessTokenService, type AuthUser, authUserFromRow } from '../../../common/auth/index.js';
import { InvalidCredentialsError, UnauthenticatedError } from '../../../common/errors/index.js';
import { users } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { dummyPasswordHash, verifyPassword } from '../domain/password.js';
import { REFRESH_TOKEN_STORE, type RefreshTokenStore } from '../infrastructure/refresh-token.store.js';

const ACCOUNT_COLUMNS = {
  id: users.id,
  email: users.email,
  fullName: users.fullName,
  role: users.role,
  companyId: users.companyId,
  studentId: users.studentId,
  isActive: users.isActive,
  passwordHash: users.passwordHash,
};

interface AccountRow {
  id: number;
  email: string;
  fullName: string | null;
  role: Role;
  companyId: number | null;
  studentId: number | null;
  isActive: boolean;
  passwordHash: string | null;
}

/** A session plus the refresh token the controller puts into the cookie. */
export interface IssuedSession {
  session: AuthSession;
  refreshToken: string;
  refreshTtlSeconds: number;
}

/** Login, refresh-token rotation and logout (FR-1, CONTEXT D25). */
@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly accessTokens: AccessTokenService,
    @Inject(REFRESH_TOKEN_STORE) private readonly refreshTokens: RefreshTokenStore,
  ) {}

  /** Unknown email, missing password, inactive account and wrong password fail identically (AC-2). */
  async login(email: string, password: string): Promise<IssuedSession> {
    const account = await this.findAccount(eq(users.email, email));
    const passwordMatches = await verifyPassword(password, account?.passwordHash ?? (await dummyPasswordHash()));
    if (!account?.passwordHash || !account.isActive || !passwordMatches) throw new InvalidCredentialsError();
    return this.issue(account);
  }

  /** Rotates the refresh token: the presented one stops working whether or not this call succeeds. */
  async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
    const userId = refreshToken ? await this.refreshTokens.consume(refreshToken) : null;
    if (userId === null) throw new UnauthenticatedError('Invalid or expired refresh token');
    // Re-read the account: it may have been deactivated since the last login.
    const account = await this.findAccount(eq(users.id, userId));
    if (!account?.passwordHash || !account.isActive) {
      throw new UnauthenticatedError('Invalid or expired refresh token');
    }
    return this.issue(account);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) await this.refreshTokens.revoke(refreshToken);
  }

  async me(user: AuthUser): Promise<Me> {
    const account = await this.findAccount(eq(users.id, user.userId));
    if (!account?.isActive) throw new UnauthenticatedError();
    return toMe(account);
  }

  private async findAccount(where: SQL): Promise<AccountRow | undefined> {
    const [row] = await this.db.select(ACCOUNT_COLUMNS).from(users).where(where).limit(1);
    return row;
  }

  private async issue(account: AccountRow): Promise<IssuedSession> {
    const user = authUserFromRow(account);
    // The users CHECKs pair HR with a company and STUDENT with a student, so this cannot happen.
    if (!user) throw new Error(`users ${account.id} breaks the role/scope pairing`);
    const [accessToken, refreshToken] = await Promise.all([
      this.accessTokens.sign(user),
      this.refreshTokens.issue(account.id),
    ]);
    return {
      session: { accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, user: toMe(account) },
      refreshToken,
      refreshTtlSeconds: this.refreshTokens.ttlSeconds,
    };
  }
}

function toMe(account: AccountRow): Me {
  return {
    id: account.id,
    email: account.email,
    fullName: account.fullName,
    role: account.role,
    companyId: account.companyId,
    studentId: account.studentId,
  };
}
