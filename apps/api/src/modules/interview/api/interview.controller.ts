import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type {
  InterviewResultResponse,
  InterviewView,
  JdInterviewList,
  MyInterviews,
  OfferAnswerResponse,
  StaffInterviewView,
} from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { InterviewQueryService } from '../application/interview-query.service.js';
import { InterviewResultService } from '../application/interview-result.service.js';
import { InterviewScheduleService } from '../application/interview-schedule.service.js';
import { OfferService } from '../application/offer.service.js';
import {
  InterviewResultRequestDto,
  InterviewResultResponseDto,
  InterviewViewDto,
  JdInterviewListDto,
  MyInterviewsDto,
  OfferAnswerResponseDto,
  RescheduleInterviewRequestDto,
  RescheduleRequestBodyDto,
  RowVersionBodyDto,
  ScheduleInterviewRequestDto,
  StaffInterviewViewDto,
} from './dto.js';

/**
 * GĐ9 (FR-30, FR-31, US-5.4). `@Roles()` checks the role (403 otherwise); the services check whose
 * record it is and answer 404 for another company's or student's (BR-11, Invariant 7, AC-10). HR
 * schedules and records results; the student confirms, asks once for another time, answers offers;
 * the center only reads.
 */
@ApiTags('interview')
@Controller()
export class InterviewController {
  constructor(
    private readonly schedules: InterviewScheduleService,
    private readonly results: InterviewResultService,
    private readonly query: InterviewQueryService,
  ) {}

  @Roles('HR')
  @Post('interviews')
  @HttpCode(201)
  @ZodResponse({ status: 201, type: StaffInterviewViewDto })
  schedule(@CurrentUser() user: AuthUser, @Body() body: ScheduleInterviewRequestDto): Promise<StaffInterviewView> {
    return this.schedules.schedule(user, body);
  }

  @Roles('HR')
  @Put('interviews/:id')
  @ZodResponse({ status: 200, type: StaffInterviewViewDto })
  reschedule(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: RescheduleInterviewRequestDto,
  ): Promise<StaffInterviewView> {
    return this.schedules.reschedule(user, id, body);
  }

  @Roles('STUDENT')
  @Post('interviews/:id/confirm')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: InterviewViewDto })
  confirm(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto, @Body() body: RowVersionBodyDto): Promise<InterviewView> {
    return this.schedules.confirm(user, id, body);
  }

  @Roles('STUDENT')
  @Post('interviews/:id/reschedule-request')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: InterviewViewDto })
  requestReschedule(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: RescheduleRequestBodyDto,
  ): Promise<InterviewView> {
    return this.schedules.requestReschedule(user, id, body);
  }

  @Roles('HR')
  @Put('interviews/:id/result')
  @ZodResponse({ status: 200, type: InterviewResultResponseDto })
  result(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: InterviewResultRequestDto,
  ): Promise<InterviewResultResponse> {
    return this.results.record(user, id, body);
  }

  @Roles('HR', 'CENTER')
  @Get('jds/:id/interviews')
  @ZodResponse({ status: 200, type: JdInterviewListDto })
  listForJd(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto): Promise<JdInterviewList> {
    return this.query.listForJd(user, id);
  }

  /** No parameter, so no other student's interviews can be asked for (IDOR). */
  @Roles('STUDENT')
  @Get('me/interviews')
  @ZodResponse({ status: 200, type: MyInterviewsDto })
  mine(@CurrentUser() user: AuthUser): Promise<MyInterviews> {
    return this.query.mine(user);
  }
}

/** The student's answer to an offer (AC-6…AC-8): before `expires_at` by the server's clock. */
@ApiTags('interview')
@Controller('offers')
export class OfferController {
  constructor(private readonly offers: OfferService) {}

  @Roles('STUDENT')
  @Post(':id/accept')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: OfferAnswerResponseDto })
  accept(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto, @Body() body: RowVersionBodyDto): Promise<OfferAnswerResponse> {
    return this.offers.accept(user, id, body);
  }

  @Roles('STUDENT')
  @Post(':id/decline')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: OfferAnswerResponseDto })
  decline(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto, @Body() body: RowVersionBodyDto): Promise<OfferAnswerResponse> {
    return this.offers.decline(user, id, body);
  }
}
