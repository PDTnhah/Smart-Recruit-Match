import type { Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Publishes a cross-module event after the change it announces has committed (ARCHITECTURE ›
 * Các module, CONTEXT D27). The change is final by then, so a throwing synchronous listener is
 * logged and never turns the request into an error response.
 */
export function emitSafely(events: EventEmitter2, logger: Logger, event: string, payload: object): void {
  try {
    events.emit(event, payload);
  } catch (error) {
    logger.error(`listener of ${event} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
