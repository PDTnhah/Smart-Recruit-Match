import { Injectable } from '@nestjs/common';

/**
 * The current time, injected so tests can move it (US-1.4 TASK-1.4.4). Business code asks the
 * Clock instead of calling `new Date()` or `Date.now()`. The abstract class is also the DI token.
 * US-1.7, US-4.3 and later schedulers reuse it; do not add a second one.
 */
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
