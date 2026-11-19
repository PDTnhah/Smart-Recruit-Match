import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { ExamBlueprintView, QuestionGenerationRun } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { userActor } from '../../audit/index.js';
import { BlueprintService } from '../application/blueprint.service.js';
import { QuestionBankService } from '../application/question-bank.service.js';
import { ExamBlueprintViewDto, QuestionGenerationRunDto, UpdateExamBlueprintRequestDto } from './dto.js';

/**
 * Exam blueprint and question bank of a JD (FR-18, BR-05, US-4.1 AC-3, US-4.10 AC-2, CONTEXT D49,
 * D60): CENTER only; HR and students get 403. Generation and AI checks run in the background; the
 * response is the run.
 */
@ApiTags('assessment')
@Controller('jds')
export class BlueprintController {
  constructor(
    private readonly blueprints: BlueprintService,
    private readonly questionBanks: QuestionBankService,
  ) {}

  @Roles('CENTER')
  @Get(':id/exam-blueprint')
  @ZodResponse({ status: 200, type: ExamBlueprintViewDto })
  get(@Param() { id }: IdParamDto): Promise<ExamBlueprintView> {
    return this.blueprints.get(id);
  }

  @Roles('CENTER')
  @Put(':id/exam-blueprint')
  @ZodResponse({ status: 200, type: ExamBlueprintViewDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: UpdateExamBlueprintRequestDto,
  ): Promise<ExamBlueprintView> {
    return this.blueprints.update(user, id, body);
  }

  /** "Sinh câu còn thiếu": the running run while there is one, else a new one. */
  @Roles('CENTER')
  @Post(':id/question-bank/generate')
  @HttpCode(202)
  @ZodResponse({ status: 202, type: QuestionGenerationRunDto })
  generate(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto): Promise<QuestionGenerationRun> {
    return this.questionBanks.generate(id, userActor(user));
  }

  /** "Kiểm câu bằng AI": a new AI check of the questions nobody has checked; 409 while any run is RUNNING. */
  @Roles('CENTER')
  @Post(':id/question-bank/validate')
  @HttpCode(202)
  @ZodResponse({ status: 202, type: QuestionGenerationRunDto })
  validate(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto): Promise<QuestionGenerationRun> {
    return this.questionBanks.validate(id, userActor(user));
  }
}
