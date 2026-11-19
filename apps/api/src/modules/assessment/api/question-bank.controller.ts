import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { BankQuestionList, ExamBlueprintView } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { BankQuestionsService } from '../application/bank-questions.service.js';
import { BlueprintService } from '../application/blueprint.service.js';
import { BankQuestionListDto, ExamBlueprintViewDto, LockQuestionBankRequestDto } from './dto.js';

/**
 * A question bank by its own id (US-4.2 AC-6, US-4.11 AC-1, CONTEXT D50, D60): CENTER only; HR and
 * students get 403. Locking answers with the blueprint view of the bank, as `GET
 * /api/jds/{id}/exam-blueprint` does. The question list carries answer keys and rubrics, so no
 * student route returns it (AGENTS › Invariant 8).
 */
@ApiTags('assessment')
@Controller('question-banks')
export class QuestionBankController {
  constructor(
    private readonly blueprints: BlueprintService,
    private readonly questions: BankQuestionsService,
  ) {}

  /** Every question of the bank, in every status. */
  @Roles('CENTER')
  @Get(':id/questions')
  @ZodResponse({ status: 200, type: BankQuestionListDto })
  listQuestions(@Param() { id }: IdParamDto): Promise<BankQuestionList> {
    return this.questions.list(id);
  }

  /** 409 when the bank cannot be locked now; the body's `code` says why. */
  @Roles('CENTER')
  @Post(':id/lock')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: ExamBlueprintViewDto })
  lock(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: LockQuestionBankRequestDto,
  ): Promise<ExamBlueprintView> {
    return this.blueprints.lock(user, id, body);
  }
}
