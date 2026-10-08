import { API_PREFIX, type AuthSession, AuthSessionSchema } from '@srm/shared';
import { setAccessToken } from './token';

// Refresh tokens rotate on every use (CONTEXT D25), so two refreshes sent with the same cookie
// race: the loser gets 401 and its response clears the cookie the winner just received. Hence one
// in-flight refresh per tab (React StrictMode runs effects twice) and a Web Lock across tabs.

let inFlight: Promise<AuthSession | null> | null = null;

async function requestRefresh(): Promise<AuthSession | null> {
  const response = await fetch(`/${API_PREFIX}/auth/refresh`, {
    method: 'POST',
    credentials: 'same-origin',
  });
  if (!response.ok) {
    setAccessToken(null);
    return null;
  }
  const session = AuthSessionSchema.parse(await response.json());
  setAccessToken(session.accessToken);
  return session;
}

/** Exchanges the refresh cookie for a new session; null when the cookie is missing or rejected. */
export function refreshSession(): Promise<AuthSession | null> {
  // Web Locks exist only in secure contexts (HTTPS, localhost); elsewhere fall back to the
  // per-tab guard alone.
  const locks = 'locks' in navigator ? navigator.locks : undefined;
  inFlight ??= (locks ? locks.request('srm-auth-refresh', requestRefresh) : requestRefresh()).finally(
    () => {
      inFlight = null;
    },
  );
  return inFlight;
}
