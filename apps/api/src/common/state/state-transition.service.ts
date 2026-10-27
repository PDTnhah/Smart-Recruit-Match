import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE } from '../../db/tokens.js';
import type { Database } from '../../db/types.js';
import { AuditService } from '../../modules/audit/index.js';
import { transitionTo, type TransitionRequest, type TransitionResult } from './transition-to.js';

/** Injectable entry to `transitionTo` for module services. */
@Injectable()
export class StateTransitionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  transitionTo<S extends string>(request: TransitionRequest<S>): Promise<TransitionResult<S>> {
    return transitionTo(this.db, this.audit, request);
  }
}
