import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { ExamBlueprintView } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { BlueprintService } from '../application/blueprint.service.js';
import { ExamBlueprintViewDto, LockQuestionBankRequestDto } from './dto.js';

/**
 * A question bank by its own id (US-4.2 AC-6, CONTEXT D50): CENTER only; HR and students get 403.
 * Locking answers with the blueprint view of the bank, as `GET /api/jds/{id}/exam-blueprint` does.
 */
@ApiTags('assessment')
@Controller('question-banks')
export class QuestionBankController {
  constructor(private readonly blueprints: BlueprintService) {}

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
