import { API_PREFIX } from '@srm/shared';
import createClient, { type Middleware } from 'openapi-fetch';
import { ApiRequestError } from './errors';
import { refreshSession } from './refresh';
import type { paths } from './schema';
import { getAccessToken } from './token';

// Typed API client generated from apps/api's OpenAPI document (CONTEXT D26). Regenerate the types
// with `pnpm api:sync` after changing an endpoint.

let onSessionExpired: () => void = () => undefined;

/** Called when a request got 401 and the one refresh attempt failed (US-1.3 AC-4). */
export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

function isAuthEndpoint(request: Request): boolean {
  return new URL(request.url).pathname.startsWith(`/${API_PREFIX}/auth/`);
}

// A copy of each request taken before it is sent: the original body is consumed by fetch. This
// buffers request bodies twice; revisit (refresh before expiry instead) if large uploads use this client.
const retryCopies = new WeakMap<Request, Request>();

const authMiddleware: Middleware = {
  onRequest({ request }) {
    const token = getAccessToken();
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    if (!isAuthEndpoint(request)) retryCopies.set(request, request.clone());
    return request;
  },
  // On 401: refresh once, then resend once. A second 401 is returned to the caller.
  async onResponse({ request, response }) {
    const retry = retryCopies.get(request);
    if (response.status !== 401 || !retry) return response;
    const session = await refreshSession().catch(() => null);
    if (!session) {
      onSessionExpired();
      return response;
    }
    retry.headers.set('Authorization', `Bearer ${session.accessToken}`);
    return fetch(retry);
  },
};

export const api = createClient<paths>({ credentials: 'same-origin' });
api.use(authMiddleware);

/** Returns `data` of an openapi-fetch result, or throws ApiRequestError for a non-2xx response. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok || result.data === undefined) {
    throw ApiRequestError.from(result.response.status, result.error);
  }
  return result.data;
}
