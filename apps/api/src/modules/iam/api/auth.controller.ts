import { Body, Controller, Get, Header, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type AuthSession, type Me, ROLES } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Public, Roles } from '../../../common/auth/index.js';
import { AuthService, type IssuedSession } from '../application/auth.service.js';
import {
  clearRefreshCookie,
  type CookieRequest,
  type CookieResponse,
  readRefreshCookie,
  setRefreshCookie,
} from './cookies.js';
import { AuthSessionDto, LoginRequestDto, MeDto } from './dto.js';

/** Login, refresh, logout and the current account (FR-1, US-1.3 AC-1…AC-4). */
@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
