const HOUR_MS = 3_600_000;

/**
 * Whether `now` falls in the reminder window of a deadline: from `hoursBefore` hours before it up
 * to the deadline itself, `[deadline − hoursBefore, deadline)` (US-1.7 AC-6, CONTEXT D31). Plain
 * date arithmetic, no LLM (AGENTS › Invariant 2).
 */
export function inReminderWindow(deadline: Date, hoursBefore: number, now: Date): boolean {
  const end = deadline.getTime();
  const at = now.getTime();
  return at < end && at >= end - hoursBefore * HOUR_MS;
}
