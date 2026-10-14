import { notifySessionExpired } from './client';
import { ApiRequestError } from './errors';
import { refreshSession } from './refresh';
import { expiresWithin, getAccessToken } from './token';

// Multipart POST with upload progress (US-1.6 AC-9, CONTEXT D30). fetch, and so openapi-fetch,
// cannot report upload progress; XMLHttpRequest can. Auth matches the API client: the in-memory
// access token, one refresh and one resend on 401, then the session-expired handler. A token about
// to expire is refreshed first, so a 5 MB file is not sent twice.

/** Refresh before sending when the access token (15 minutes) has less than this left. */
const EXPIRY_MARGIN_MS = 60_000;

interface XhrResult {
  status: number;
  body: unknown;
}

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // nginx answers some errors (413 over 6 MB) with an HTML page.
    return undefined;
  }
}

/** The current token, refreshed first when it is about to expire; the old one if refresh fails. */
async function tokenForUpload(): Promise<string | null> {
  const token = getAccessToken();
  if (token && !expiresWithin(token, EXPIRY_MARGIN_MS)) return token;
  const session = await refreshSession().catch(() => null);
  return session?.accessToken ?? token;
}

function send(url: string, form: FormData, token: string | null, onProgress: (fraction: number) => void) {
  return new Promise<XhrResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });
    xhr.addEventListener('load', () => resolve({ status: xhr.status, body: parseBody(xhr.responseText) }));
    // A TypeError, like fetch's, so apiErrorMessage() reports a network problem.
    xhr.addEventListener('error', () => reject(new TypeError('Network request failed')));
    xhr.addEventListener('abort', () => reject(new TypeError('Request aborted')));
    xhr.send(form);
  });
}

/**
 * POSTs `form` to `url` (same origin) and reports progress as a fraction from 0 to 1. Returns the
 * parsed JSON body of a 2xx answer; throws ApiRequestError otherwise.
 */
export async function postFormWithProgress(
  url: string,
  form: FormData,
  onProgress: (fraction: number) => void,
): Promise<unknown> {
  let result = await send(url, form, await tokenForUpload(), onProgress);
  if (result.status === 401) {
    const session = await refreshSession().catch(() => null);
    if (!session) {
      notifySessionExpired();
      throw ApiRequestError.from(result.status, result.body);
    }
    onProgress(0);
    result = await send(url, form, session.accessToken, onProgress);
  }
  if (result.status < 200 || result.status >= 300) throw ApiRequestError.from(result.status, result.body);
  return result.body;
}
