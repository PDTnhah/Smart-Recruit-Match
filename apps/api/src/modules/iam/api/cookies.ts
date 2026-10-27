import { API_PREFIX } from '@srm/shared';

// The refresh-token cookie (CONTEXT D25). Without cookie-parser the Cookie header is split here.

export const REFRESH_COOKIE = 'srm_refresh';

/** The cookie is sent only to the auth endpoints, never to the rest of the API. */
const REFRESH_COOKIE_PATH = `/${API_PREFIX}/auth`;

/** The part of the Express request/response used here (avoids a dependency on @types/express). */
export interface CookieRequest {
  headers: { cookie?: string };
}

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict';
  path: string;
  maxAge?: number;
}

export interface CookieResponse {
  cookie(name: string, value: string, options: CookieOptions): unknown;
  clearCookie(name: string, options: CookieOptions): unknown;
}

const BASE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: REFRESH_COOKIE_PATH,
};

/** Value of one cookie from a `Cookie` header, or undefined. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1 || pair.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function readRefreshCookie(request: CookieRequest): string | undefined {
  return readCookie(request.headers.cookie, REFRESH_COOKIE);
}

export function setRefreshCookie(response: CookieResponse, token: string, ttlSeconds: number): void {
  response.cookie(REFRESH_COOKIE, token, { ...BASE_OPTIONS, maxAge: ttlSeconds * 1000 });
}

/** Must use the same path and flags as when the cookie was set, or browsers keep it. */
export function clearRefreshCookie(response: CookieResponse): void {
  response.clearCookie(REFRESH_COOKIE, BASE_OPTIONS);
}
