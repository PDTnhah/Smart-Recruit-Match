// Events of the matching module, published with @nestjs/event-emitter after the transaction commits
// (ARCHITECTURE › Các module, CONTEXT D47). Listeners in other modules subscribe with @OnEvent and
// should declare `{ async: true }`, so a slow listener never affects the change.

/** A student saved a new preference list (US-3.3 AC-5). US-3.4 recounts the JDs named here. */
export const PREFERENCES_REPLACED = 'matching.preferences.replaced';

/** Students without a preference at the deadline were given some (Q6, US-3.3 AC-10). */
export const PREFERENCES_AUTO_ASSIGNED = 'matching.preferences.auto_assigned';

export interface PreferencesReplacedEvent {
  campaignId: number;
  studentId: number;
  /** JDs of the old list and of the new one, so a JD the student dropped is recounted too. */
  jdIds: number[];
}

export interface PreferencesAutoAssignedEvent {
  campaignId: number;
  studentIds: number[];
  jdIds: number[];
}
