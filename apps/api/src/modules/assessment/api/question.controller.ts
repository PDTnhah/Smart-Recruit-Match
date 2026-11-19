import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { RejectQuestionResult } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { BankQuestionsService } from '../application/bank-questions.service.js';
import { RejectQuestionRequestDto, RejectQuestionResultDto } from './dto.js';

/**
 * A question of a bank by its own id (US-4.11 AC-3, CONTEXT D60): CENTER rejects a wrong one by hand;
 * HR and students get 403. 409 when the question is no longer usable, a run is RUNNING, or its
 * `rowVersion` changed; the body's `code` says which.
 */
@ApiTags('assessment')
@Controller('questions')
export class QuestionController {
  constructor(private readonly questions: BankQuestionsService) {}

  @Roles('CENTER')
  @Post(':id/reject')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: RejectQuestionResultDto })
  reject(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: RejectQuestionRequestDto,
  ): Promise<RejectQuestionResult> {
    return this.questions.reject(user, id, body);
  }
}
