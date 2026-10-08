import { Module } from '@nestjs/common';
import { AuditModule } from '../../modules/audit/index.js';
import { StateTransitionService } from './state-transition.service.js';

@Module({
  imports: [AuditModule],
  providers: [StateTransitionService],
  exports: [StateTransitionService],
})
export class StateModule {}
