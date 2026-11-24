import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AllocationExplanation, AllocationRoundList, AllocationRoundView } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { userActor } from '../../audit/index.js';
import { AllocationRoundService } from '../application/allocation-round.service.js';
import { AllocationViewService } from '../application/allocation-view.service.js';
import {
  AdjustNominationsRequestDto,
  AllocationExplanationDto,
  AllocationRoundListDto,
  AllocationRoundViewDto,
  PublishAllocationRoundRequestDto,
  RoundStudentParamDto,
} from './dto.js';

/** GĐ7 for the center (FR-26, US-5.2 AC-1, AC-6): run round 1 of a campaign, list its rounds. */
@ApiTags('allocation')
@Controller('campaigns/:id/allocation-rounds')
export class CampaignAllocationRoundsController {
  constructor(
    private readonly rounds: AllocationRoundService,
    private readonly views: AllocationViewService,
  ) {}

  @Roles('CENTER')
  @Post()
  @HttpCode(201)
  @ZodResponse({ status: 201, type: AllocationRoundViewDto })
  run(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto): Promise<AllocationRoundView> {
    return this.rounds.run(id, userActor(user));
  }

  @Roles('CENTER')
  @Get()
  @ZodResponse({ status: 200, type: AllocationRoundListDto })
  list(@Param() { id }: IdParamDto): Promise<AllocationRoundList> {
    return this.views.list(id);
  }
}

/** A round's draft, its adjustments, publishing and explanations (FR-27, NFR-4, US-5.2): CENTER only. */
@ApiTags('allocation')
@Controller('allocation-rounds')
export class AllocationRoundsController {
  constructor(
    private readonly rounds: AllocationRoundService,
    private readonly views: AllocationViewService,
  ) {}

  @Roles('CENTER')
  @Get(':id')
  @ZodResponse({ status: 200, type: AllocationRoundViewDto })
  get(@Param() { id }: IdParamDto): Promise<AllocationRoundView> {
    return this.views.view(id);
  }

  @Roles('CENTER')
  @Patch(':id/nominations')
  @ZodResponse({ status: 200, type: AllocationRoundViewDto })
  adjust(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: AdjustNominationsRequestDto,
  ): Promise<AllocationRoundView> {
    return this.rounds.adjust(id, body, userActor(user));
  }

  @Roles('CENTER')
  @Post(':id/publish')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: AllocationRoundViewDto })
  publish(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: PublishAllocationRoundRequestDto,
  ): Promise<AllocationRoundView> {
    return this.rounds.publish(id, body, userActor(user));
  }

  @Roles('CENTER')
  @Get(':id/students/:studentId/explanation')
  @ZodResponse({ status: 200, type: AllocationExplanationDto })
  explain(@Param() { id, studentId }: RoundStudentParamDto): Promise<AllocationExplanation> {
    return this.views.explain(id, studentId);
  }
}
