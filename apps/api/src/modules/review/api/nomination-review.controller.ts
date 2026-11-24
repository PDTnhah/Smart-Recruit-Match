import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type {
  HrDecisionResult,
  JdNominationList,
  MyNominationReviews,
  NominationDetail,
  ReviewDeadline,
  ReviewDeadlineList,
  SupplementRequest,
} from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { HrDecisionService } from '../application/hr-decision.service.js';
import { NominationQueryService } from '../application/nomination-query.service.js';
import { ReviewDeadlineService } from '../application/review-deadline.service.js';
import { SupplementRequestService } from '../application/supplement-request.service.js';
import {
  HrDecisionRequestDto,
  HrDecisionResultDto,
  JdNominationListDto,
  MyNominationReviewsDto,
  NominationDetailDto,
  ReviewDeadlineDto,
  ReviewDeadlineExtensionRequestDto,
  ReviewDeadlineListDto,
  SupplementRequestBodyDto,
  SupplementRequestDto,
} from './dto.js';

/**
 * HR's side of GĐ8 (FR-28, FR-29, US-5.3): the nominations of a JD, one nomination, the decision,
 * the supplement request. `@Roles('HR')` checks the role only; the services check that the JD
 * belongs to the caller's company and answer 404 otherwise (BR-11, Invariant 7). PRD Q5: no route
 * lists, searches or opens a student outside the nominations.
 */
@ApiTags('review')
@Controller()
export class NominationReviewController {
  constructor(
    private readonly query: NominationQueryService,
    private readonly decisions: HrDecisionService,
    private readonly supplements: SupplementRequestService,
  ) {}

  @Roles('HR')
  @Get('jds/:id/nominations')
  @ZodResponse({ status: 200, type: JdNominationListDto })
  list(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto): Promise<JdNominationList> {
    return this.query.listForJd(user, id);
  }

  @Roles('HR')
  @Get('nominations/:id')
  @ZodResponse({ status: 200, type: NominationDetailDto })
  detail(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto): Promise<NominationDetail> {
    return this.query.detail(user, id);
  }

  @Roles('HR')
  @Post('nominations/:id/decision')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: HrDecisionResultDto })
  decide(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: HrDecisionRequestDto,
  ): Promise<HrDecisionResult> {
    return this.decisions.decide(user, id, body);
  }

  @Roles('HR')
  @Post('jds/:id/supplement-requests')
  @HttpCode(201)
  @ZodResponse({ status: 201, type: SupplementRequestDto })
  requestSupplement(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: SupplementRequestBodyDto,
  ): Promise<SupplementRequest> {
    return this.supplements.request(user, id, body);
  }
}

/** HR's deadlines for the center (US-5.3 AC-10): see them per round, extend one with a reason. */
@ApiTags('review')
@Controller()
export class ReviewDeadlinesController {
  constructor(private readonly deadlines: ReviewDeadlineService) {}

  @Roles('CENTER')
  @Get('allocation-rounds/:id/review-deadlines')
  @ZodResponse({ status: 200, type: ReviewDeadlineListDto })
  list(@Param() { id }: IdParamDto): Promise<ReviewDeadlineList> {
    return this.deadlines.listForRound(id);
  }

  @Roles('CENTER')
  @Post('jds/:id/review-deadline-extensions')
  @HttpCode(201)
  @ZodResponse({ status: 201, type: ReviewDeadlineDto })
  extend(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: ReviewDeadlineExtensionRequestDto,
  ): Promise<ReviewDeadline> {
    return this.deadlines.extend(user, id, body);
  }
}

/**
 * The student's side (US-5.3 AC-6): what HR decided on their own nominations, the reason as a
 * catalogue code. No parameter, so no other student's decisions can be asked for (IDOR).
 */
@ApiTags('review')
@Controller('me/nomination-reviews')
export class MeNominationReviewsController {
  constructor(private readonly query: NominationQueryService) {}

  @Roles('STUDENT')
  @Get()
  @ZodResponse({ status: 200, type: MyNominationReviewsDto })
  mine(@CurrentUser() user: AuthUser): Promise<MyNominationReviews> {
    return this.query.mine(user);
  }
}
