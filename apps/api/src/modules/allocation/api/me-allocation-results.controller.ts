import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { MyAllocationResults } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { studentIdOf } from '../../student/index.js';
import { AllocationViewService } from '../application/allocation-view.service.js';
import { MyAllocationResultsDto } from './dto.js';

/**
 * The student's published allocation results (US-5.2 AC-12, AC-13). The route takes no parameter,
 * so no other student's results can be asked for (IDOR).
 */
@ApiTags('allocation')
@Controller('me/allocation-results')
export class MeAllocationResultsController {
  constructor(private readonly views: AllocationViewService) {}

  @Roles('STUDENT')
  @Get()
  @ZodResponse({ status: 200, type: MyAllocationResultsDto })
  mine(@CurrentUser() user: AuthUser): Promise<MyAllocationResults> {
    return this.views.myResults(studentIdOf(user));
  }
}
