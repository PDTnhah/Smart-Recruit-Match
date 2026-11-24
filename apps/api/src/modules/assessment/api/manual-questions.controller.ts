import { Body, Controller, Get, HttpCode, Param, Post, Query, StreamableFile, UploadedFile } from '@nestjs/common';
import { ApiProduces, ApiTags } from '@nestjs/swagger';
import type { ManualQuestionList, QuestionImportPreview, SaveManualQuestionsResult } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { ValidationFailedError } from '../../../common/errors/index.js';
import { contentDisposition } from '../../../common/storage/content-disposition.js';
import { SingleFileUpload, type UploadedFileLike } from '../../../common/storage/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { ManualQuestionsService } from '../application/manual-questions.service.js';
import {
  ManualQuestionListDto,
  QuestionImportPreviewDto,
  QuestionImportTemplateQueryDto,
  SaveManualQuestionsRequestDto,
  SaveManualQuestionsResultDto,
} from './dto.js';

/**
 * Questions CENTER and HR add by hand to a JD's bank (FR-42, US-4.13, CONTEXT D62): HR of the JD's
 * company and CENTER. HR of another company gets 404 (BR-11); STUDENT and ADMIN 403. The HR list
 * carries answer keys and rubrics, so no student route returns it (AGENTS › Invariant 8).
 */
@ApiTags('assessment')
@Controller('jds')
export class ManualQuestionsController {
  constructor(private readonly manual: ManualQuestionsService) {}

  /** AC-3: the import template, `.xlsx` (with the blueprint cells) or `.csv`. */
  @Roles('HR', 'CENTER')
  @Get(':id/question-bank/import-template')
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv')
  async template(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Query() { format }: QuestionImportTemplateQueryDto,
  ): Promise<StreamableFile> {
    const file = await this.manual.template(user, id, format);
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: contentDisposition(file.fileName).replace(/^inline/, 'attachment'),
      length: file.buffer.length,
    });
  }

  /** AC-4: every row of the file checked; nothing saved. */
  @Roles('HR', 'CENTER')
  @Post(':id/question-bank/import/preview')
  @HttpCode(200)
  @SingleFileUpload()
  @ZodResponse({ status: 200, type: QuestionImportPreviewDto })
  preview(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @UploadedFile() file: UploadedFileLike | undefined,
  ): Promise<QuestionImportPreview> {
    if (!file) throw new ValidationFailedError([{ path: 'file', message: 'Chọn một file .xlsx hoặc .csv' }]);
    return this.manual.preview(user, id, file);
  }

  /** AC-1, AC-5: one question from the form, or the rows of a previewed file; all or none. */
  @Roles('HR', 'CENTER')
  @Post(':id/question-bank/questions')
  @ZodResponse({ status: 201, type: SaveManualQuestionsResultDto })
  save(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: SaveManualQuestionsRequestDto,
  ): Promise<SaveManualQuestionsResult> {
    return this.manual.save(user, id, body);
  }

  /** AC-7: the questions HR of the JD's company added, with their status. */
  @Roles('HR', 'CENTER')
  @Get(':id/question-bank/manual-questions')
  @ZodResponse({ status: 200, type: ManualQuestionListDto })
  list(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto): Promise<ManualQuestionList> {
    return this.manual.listOfCompany(user, id);
  }
}
