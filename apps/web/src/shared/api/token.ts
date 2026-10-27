// The access token lives only in memory (CONTEXT D26): never in localStorage, so injected scripts
// cannot read it from storage. A page reload restores it through one refresh call.

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Whether the token expires within `marginMs`, from its `exp` claim. The payload is read, not
 * verified: the API verifies. An unreadable token counts as expiring.
 */
export function expiresWithin(token: string, marginMs: number): boolean {
  try {
    const payload = token.split('.')[1] ?? '';
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const { exp } = JSON.parse(json) as { exp?: unknown };
    return typeof exp !== 'number' || exp * 1000 - Date.now() < marginMs;
  } catch {
    return true;
  }
}
