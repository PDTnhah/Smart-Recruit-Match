import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { MatchingRun } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { userActor } from '../../audit/index.js';
import { RunMatchingService } from '../application/run-matching.service.js';
import { MatchingRunDto } from './dto.js';

/** Matching runs of a campaign (FR-14, US-3.2 AC-1, AC-13): CENTER starts one; scoring runs in the background. */
@ApiTags('matching')
@Controller('campaigns/:id/matching-runs')
export class MatchingRunsController {
  constructor(private readonly runs: RunMatchingService) {}

  @Roles('CENTER')
  @Post()
  @HttpCode(202)
  @ZodResponse({ status: 202, type: MatchingRunDto })
  start(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto): Promise<MatchingRun> {
    return this.runs.start(id, userActor(user));
  }
}
