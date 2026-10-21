// Public entry of the company module (CONTEXT D22): other code imports only from here.
export { CompanyModule } from './company.module.js';
export { CompanyService } from './application/company.service.js';
export { JdService } from './application/jd.service.js';
export {
  JD_APPROVED,
  JD_REQUIREMENTS_VERSIONED,
  JD_SUBMITTED,
  type JdEvent,
  type JdRequirementsVersionedEvent,
} from './domain/events.js';
