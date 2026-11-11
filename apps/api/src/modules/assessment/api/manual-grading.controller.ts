import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { GradingQueue, ManualGradeResult, ManualGradingDetail } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { ManualGradingService } from '../application/manual-grading.service.js';
import {
  GradingQueueDto,
  GradingQueueQueryDto,
  ManualGradeRequestDto,
  ManualGradeResultDto,
  ManualGradingDetailDto,
} from './dto.js';

/**
 * Manual grading of the essays the Grader handed over (US-4.5, FR-23, CONTEXT D54): CENTER only, a
 * lecturer included through a CENTER account. HR, STUDENT and ADMIN get 403. Every response is a
 * whitelist without the student (BR-03). No phase check: the queue only holds answers that keep a
 * session's results back, and `finalizeIfReady` holds the publication until `testing_end`.
 */
@ApiTags('grading')
@Controller()
export class ManualGradingController {
  constructor(private readonly manual: ManualGradingService) {}

  /** AC-1: sessions with an essay waiting for a grader, paged by session. */
  @Roles('CENTER')
  @Get('campaigns/:id/grading-queue')
  @ZodResponse({ status: 200, type: GradingQueueDto })
  queue(@Param() { id }: IdParamDto, @Query() query: GradingQueueQueryDto): Promise<GradingQueue> {
    return this.manual.queue(id, query);
  }

  /** AC-2: the question, rubric, sample answer, answer and both passes of the Grader. */
  @Roles('CENTER')
  @Get('exam-answers/:id/manual-grading')
  @ZodResponse({ status: 200, type: ManualGradingDetailDto })
  detail(@Param() { id }: IdParamDto): Promise<ManualGradingDetail> {
    return this.manual.detail(id);
  }

  /** AC-3–AC-5: points per criterion; code adds them and publishes the session when it can. */
  @Roles('CENTER')
  @Put('exam-answers/:id/manual-grade')
  @ZodResponse({ status: 200, type: ManualGradeResultDto })
  grade(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: ManualGradeRequestDto,
  ): Promise<ManualGradeResult> {
    return this.manual.grade(id, body, user);
  }
}
