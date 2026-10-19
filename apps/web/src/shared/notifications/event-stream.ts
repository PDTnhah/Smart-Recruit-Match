import { API_PREFIX, SERVER_EVENTS } from '@srm/shared';
import { refreshSession } from '@/shared/api/refresh';
import { expiresWithin, getAccessToken } from '@/shared/api/token';

// Client of `GET /api/events/stream` (AD-13, US-1.7, CONTEXT D31). EventSource cannot send the
// Authorization header and the access token lives only in memory, so the stream is read with
// fetch and its frames are parsed here. Reconnects on its own: after the server ends the stream
// (it does so once per token lifetime), after a network error (backing off up to 30 s), and after
// a 401 (one refresh, then the session is over).

export interface EventStreamHandlers {
  onEvent(name: string, data: unknown): void;
  /** The refresh after a 401 failed: the user must sign in again. */
  onSessionExpired(): void;
}

const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 30_000;
/** Refresh before connecting when the token would expire this soon. */
const TOKEN_MARGIN_MS = 30_000;

type Outcome = 'ended' | 'unauthorized' | 'failed';

/** Opens the stream and keeps it open until the returned function is called. */
export function connectEventStream(handlers: EventStreamHandlers): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let wake: (() => void) | null = null;

  const pause = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });

  async function run(): Promise<void> {
    let delay = RETRY_MIN_MS;
    while (!stopped) {
      const token = getAccessToken();
      if (!token || expiresWithin(token, TOKEN_MARGIN_MS)) {
        if (!(await refreshSession().catch(() => null))) {
          if (!stopped) handlers.onSessionExpired();
          return;
        }
      }
      controller = new AbortController();
      let outcome: Outcome;
      try {
        outcome = await readStream(controller.signal, (name, data) => {
          // A working connection resets the back-off.
          if (name === SERVER_EVENTS.READY) delay = RETRY_MIN_MS;
          handlers.onEvent(name, data);
        });
      } catch {
        outcome = 'failed';
      }
      if (stopped) return;
      if (outcome === 'unauthorized') {
        if (!(await refreshSession().catch(() => null))) {
          if (!stopped) handlers.onSessionExpired();
          return;
        }
        continue;
      }
      await pause(delay);
      if (outcome === 'failed') delay = Math.min(delay * 2, RETRY_MAX_MS);
    }
  }

  void run();
  return () => {
    stopped = true;
    controller?.abort();
    wake?.();
  };
}

async function readStream(signal: AbortSignal, onEvent: (name: string, data: unknown) => void): Promise<Outcome> {
  const token = getAccessToken();
  const response = await fetch(`/${API_PREFIX}/events/stream`, {
    headers: { Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  });
  if (response.status === 401) return 'unauthorized';
  if (!response.ok || !response.body) return 'failed';

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = createFrameParser(onEvent);
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return 'ended';
    parser(value);
  }
}

/**
 * Feeds text chunks in, calls `onEvent` once per complete frame (`event:` + `data:` lines, ended
 * by a blank line). Comment lines and unknown fields are ignored; `data` is parsed as JSON.
 */
export function createFrameParser(onEvent: (name: string, data: unknown) => void): (chunk: string) => void {
  let buffer = '';
  return (chunk) => {
    buffer += chunk.replace(/\r\n?/g, '\n');
    let end = buffer.indexOf('\n\n');
    while (end >= 0) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let name = 'message';
      const data: string[] = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) name = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.length > 0) {
        const text = data.join('\n');
        let parsed: unknown = text;
        try {
          parsed = JSON.parse(text);
        } catch {
          // Plain text data stays a string.
        }
        onEvent(name, parsed);
      }
      end = buffer.indexOf('\n\n');
    }
  };
}
