import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { QuestionReviewSample } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { ReviewSampleService } from '../application/review-sample.service.js';
import { QuestionReviewSampleDto, SubmitQuestionReviewRequestDto } from './dto.js';

/**
 * Sample review of a JD's question bank (FR-19, US-4.9 AC-1–AC-3): HR of the JD's company and
 * CENTER. HR of another company gets 404 (BR-11); STUDENT and ADMIN 403. The sample carries answer
 * keys and rubrics, so no student route returns it (AGENTS › Invariant 8).
 */
@ApiTags('assessment')
@Controller('jds')
export class ReviewSampleController {
  constructor(private readonly samples: ReviewSampleService) {}

  @Roles('HR', 'CENTER')
  @Get(':id/question-bank/sample')
  @ZodResponse({ status: 200, type: QuestionReviewSampleDto })
  get(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto): Promise<QuestionReviewSample> {
    return this.samples.get(user, id);
  }

  /** One verdict; an ERROR retires the question. Answers with the sample as it is now. */
  @Roles('HR', 'CENTER')
  @Post(':id/question-bank/sample/reviews')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: QuestionReviewSampleDto })
  review(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: SubmitQuestionReviewRequestDto,
  ): Promise<QuestionReviewSample> {
    return this.samples.review(user, id, body);
  }
}
