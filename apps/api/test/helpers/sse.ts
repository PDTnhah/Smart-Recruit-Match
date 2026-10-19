// A minimal Server-Sent Events client for tests of `GET /api/events/stream` (US-1.7 AC-3). It
// uses fetch with the Authorization header, like the web client (CONTEXT D31).
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';

export interface ServerEvent {
  event: string;
  data: unknown;
}

export interface EventStream {
  status: number;
  /** Every event received so far, in order. */
  events: ServerEvent[];
  /** Resolves with the first event (past or future) matching `predicate`; rejects after `timeoutMs`. */
  next(predicate: (event: ServerEvent) => boolean, timeoutMs?: number): Promise<ServerEvent>;
  close(): void;
}

/** Starts the app's HTTP server on a free port (once) and returns its base URL. */
export async function listen(app: INestApplication): Promise<string> {
  const server = app.getHttpServer() as { listening: boolean; address(): AddressInfo | string | null };
  if (!server.listening) await app.listen(0, '127.0.0.1');
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

export async function openEventStream(baseUrl: string, accessToken?: string): Promise<EventStream> {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/events/stream`, {
    headers: { Accept: 'text/event-stream', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    signal: controller.signal,
  });
  const events: ServerEvent[] = [];
  const waiters: { predicate: (event: ServerEvent) => boolean; resolve: (event: ServerEvent) => void }[] = [];

  const deliver = (event: ServerEvent) => {
    events.push(event);
    for (const waiter of [...waiters]) {
      if (!waiter.predicate(event)) continue;
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(event);
    }
  };

  if (response.ok && response.body) {
    void (async () => {
      const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          buffer += value;
          let end = buffer.indexOf('\n\n');
          while (end >= 0) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const parsed = parseFrame(frame);
            if (parsed) deliver(parsed);
            end = buffer.indexOf('\n\n');
          }
        }
      } catch {
        // Aborted by close().
      }
    })();
  } else {
    await response.body?.cancel();
  }

  return {
    status: response.status,
    events,
    next(predicate, timeoutMs = 5_000) {
      const seen = events.find(predicate);
      if (seen) return Promise.resolve(seen);
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve: (event: ServerEvent) => {
            clearTimeout(timer);
            resolve(event);
          },
        };
        const timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(new Error(`no matching SSE event within ${timeoutMs} ms; got ${JSON.stringify(events)}`));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    close: () => controller.abort(),
  };
}

function parseFrame(frame: string): ServerEvent | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return null;
  const text = data.join('\n');
  try {
    return { event, data: JSON.parse(text) as unknown };
  } catch {
    return { event, data: text };
  }
}
