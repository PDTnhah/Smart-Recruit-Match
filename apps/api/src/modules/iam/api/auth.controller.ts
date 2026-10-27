import { Body, Controller, Get, Header, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type AuthSession, type Me, ROLES } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Public, Roles } from '../../../common/auth/index.js';
import { AuthService, type IssuedSession } from '../application/auth.service.js';
import { InvitationService } from '../application/invitation.service.js';
import {
  clearRefreshCookie,
  type CookieRequest,
  type CookieResponse,
  readRefreshCookie,
  setRefreshCookie,
} from './cookies.js';
import { AcceptInvitationRequestDto, AuthSessionDto, LoginRequestDto, MeDto } from './dto.js';

/** Login, refresh, logout, the current account (FR-1, US-1.3) and accepting an HR invitation (FR-3, US-1.5). */
@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly invitations: InvitationService,
  ) {}

  @Public()
  @Post('auth/login')
  @Header('Cache-Control', 'no-store')
  @ZodResponse({ status: 200, type: AuthSessionDto })
  async login(
    @Body() body: LoginRequestDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<AuthSession> {
    return this.startSession(response, await this.auth.login(body.email, body.password));
  }

  /** US-1.5 AC-3: an invited HR sets a password and is logged in. Bad or used tokens: 422. */
  @Public()
  @Post('auth/accept-invitation')
  @Header('Cache-Control', 'no-store')
  @ZodResponse({ status: 200, type: AuthSessionDto })
  async acceptInvitation(
    @Body() body: AcceptInvitationRequestDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<AuthSession> {
    return this.startSession(response, await this.invitations.accept(body.token, body.password));
  }

  /** Rotates the refresh token. On failure the cookie is cleared so the client stops retrying. */
  @Public()
  @Post('auth/refresh')
  @Header('Cache-Control', 'no-store')
  @ZodResponse({ status: 200, type: AuthSessionDto })
  async refresh(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<AuthSession> {
    try {
      return this.startSession(response, await this.auth.refresh(readRefreshCookie(request)));
    } catch (error) {
      clearRefreshCookie(response);
      throw error;
    }
  }

  /** Public so a client with an expired access token can still end its session. */
  @Public()
  @Post('auth/logout')
  @HttpCode(204)
  async logout(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(request));
    clearRefreshCookie(response);
  }

  @Roles(...ROLES)
  @Get('me')
  @ZodResponse({ type: MeDto })
  me(@CurrentUser() user: AuthUser): Promise<Me> {
    return this.auth.me(user);
  }

  private startSession(response: CookieResponse, issued: IssuedSession): AuthSession {
    setRefreshCookie(response, issued.refreshToken, issued.refreshTtlSeconds);
    return issued.session;
  }
}
