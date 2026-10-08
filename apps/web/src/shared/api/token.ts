// The access token lives only in memory (CONTEXT D26): never in localStorage, so injected scripts
// cannot read it from storage. A page reload restores it through one refresh call.

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
