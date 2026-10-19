import { Injectable } from '@nestjs/common';
import type { NotificationChannel, NotificationContent } from '@srm/shared';

/** One reminder to send: the same notice to every recipient, once per `dedupeKey`. */
export interface ReminderBatch {
  userIds: number[];
  content: NotificationContent;
  channels: NotificationChannel[];
  /** Identifies the deadline; a rerun or a second instance inserts nothing new (AC-6). */
  dedupeKey: string;
}

/**
 * A kind of deadline the reminder job checks (US-1.7 AC-6). A source reads its own module's data
 * through exported services, finds who still has work before a deadline that is near, and returns
 * one batch per deadline. No LLM (AGENTS › Invariant 2).
 */
export interface DeadlineReminderSource {
  /** Unique name, used in logs and reports. */
  readonly name: string;
  collect(now: Date): Promise<ReminderBatch[]>;
}

/**
 * Where deadline sources register, in `onModuleInit` (same pattern as FileAccessRegistry). The
 * first source is the CV deadline (`cv-intake`); US-3.3 (preferences), US-4.3 (tests) and US-5.3
 * (HR SLA) register theirs from their own modules, importing NotificationModule.
 */
@Injectable()
export class DeadlineReminderRegistry {
  private readonly sources = new Map<string, DeadlineReminderSource>();

  register(source: DeadlineReminderSource): void {
    if (this.sources.has(source.name)) throw new Error(`deadline reminder source "${source.name}" is already registered`);
    this.sources.set(source.name, source);
  }

  list(): DeadlineReminderSource[] {
    return [...this.sources.values()];
  }
}
