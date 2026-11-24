// Public entry of the allocation module (CONTEXT D22): other code imports only from here.
export { AllocationModule } from './allocation.module.js';
export { AllocationRoundService, type ReplayReport } from './application/allocation-round.service.js';
export { AllocationViewService } from './application/allocation-view.service.js';
// Nominations of published rounds, read and moved by HR review (US-5.3, CONTEXT D64).
export {
  NominationService,
  type PublishedNomination,
  type PublishedRound,
  type ReviewGroup,
} from './application/nomination.service.js';
// The engine a round runs; a test puts a faulty one in its place (US-5.2 AC-4).
export { ALLOCATION_ENGINE, type AllocationEngine, DEFERRED_ACCEPTANCE_ENGINE } from './application/engine.js';
