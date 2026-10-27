import { Controller, Headers, type MessageEvent, Sse } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Observable } from 'rxjs';
import { AccessTokenService, type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { EventStreamService } from '../application/event-stream.service.js';

/**
 * Server-Sent Events (AD-13, US-1.7 AC-3). The browser opens it with `fetch` and the usual
 * `Authorization: Bearer` header, so AccessGuard answers 401 before any event (CONTEXT D31).
 * Events: `ready` (subscribed; reload lists), `ping` (heartbeat), `notification`, and later
 * EPIC-2 job progress and US-3.4 competition levels. Only the caller's own events arrive.
 */
@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(
    private readonly streams: EventStreamService,
    private readonly tokens: AccessTokenService,
  ) {}

  @Roles('STUDENT', 'HR', 'CENTER', 'ADMIN')
  @Sse('stream')
  stream(@CurrentUser() user: AuthUser, @Headers('authorization') authorization: string): Observable<MessageEvent> {
    // AccessGuard has verified this header; only the expiry is read here.
    const token = authorization.replace(/^Bearer\s+/i, '');
    return this.streams.open(user.userId, this.tokens.expiresAt(token));
  }
}
