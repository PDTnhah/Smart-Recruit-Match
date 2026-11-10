// Public entry of the matching module (CONTEXT D22): other code imports only from here.
export { MatchingModule } from './matching.module.js';
export { MATCHING_PHASES, RunMatchingService } from './application/run-matching.service.js';
export { RecomputeScvService, type ScvRecompute } from './application/recompute-scv.js';
export { type ExamPreference, PreferenceExamService } from './application/preference-exam.service.js';
export { type GradingPreference, PreferenceGradingService } from './application/preference-grading.service.js';
export {
  PREFERENCES_AUTO_ASSIGNED,
  PREFERENCES_REPLACED,
  type PreferencesAutoAssignedEvent,
  type PreferencesReplacedEvent,
} from './domain/events.js';
