// Public entry of the review module (CONTEXT D22): other code imports only from here.
export { ReviewModule } from './review.module.js';
// HR's deadlines and the supplement requests, for the supplementary round (US-5.5).
export { type Deadline, ReviewDeadlineService } from './application/review-deadline.service.js';
export { SupplementRequestService } from './application/supplement-request.service.js';
// The SLA sweep, for tests.
export { ReviewSlaScheduler, type ReviewSlaSweepReport } from './application/review-sla.scheduler.js';
