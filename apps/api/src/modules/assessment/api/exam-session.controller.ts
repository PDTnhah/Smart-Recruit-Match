import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { ExamPaper, ExamResult, ExamSubmission, MyExamsResponse, SaveExamAnswersResult } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { RateLimit } from '../../../common/rate-limit/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { ExamResultService } from '../application/exam-result.service.js';
import { ExamSessionService } from '../application/exam-session.service.js';
import {
  ExamPaperDto,
  ExamResultDto,
  ExamSubmissionDto,
  MyExamsResponseDto,
  SaveExamAnswersRequestDto,
  SaveExamAnswersResultDto,
} from './dto.js';

/**
 * The exam room (FR-20, US-4.3, CONTEXT D51): students only, each on their own preferences and
 * sessions (another student's answers 404, BR-11). Every route is rate-limited per user and minute
 * (AC-12); the client's autosave stays well under its limit.
 */
@ApiTags('exams')
@Controller()
export class ExamSessionController {
  constructor(
    private readonly exams: ExamSessionService,
    private readonly results: ExamResultService,
  ) {}

  /** AC-14: the tests of the caller's preferences in their latest campaign. */
  @Roles('STUDENT')
  @RateLimit('exam.overview', 30)
  @Get('me/exams')
  @ZodResponse({ status: 200, type: MyExamsResponseDto })
  overview(@CurrentUser() user: AuthUser): Promise<MyExamsResponse> {
    return this.exams.overview(user);
  }

  /** AC-1, AC-4: starts the test of a preference, or returns the session already open. */
  @Roles('STUDENT')
  @RateLimit('exam.start', 10)
  @Post('preferences/:id/exam/start')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: ExamPaperDto })
  start(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto): Promise<ExamPaper> {
    return this.exams.start(user, id);
  }

  /** AC-7: the paper again, with the answers saved so far and the same deadline. */
  @Roles('STUDENT')
  @RateLimit('exam.get', 30)
  @Get('exam-sessions/:id')
  @ZodResponse({ status: 200, type: ExamPaperDto })
  get(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto): Promise<ExamPaper> {
    return this.exams.get(user, id);
  }

  /** AC-6: autosave; 409 EXAM_CLOSED once closed or past the deadline and its grace. */
  @Roles('STUDENT')
  @RateLimit('exam.answers', 120)
  @Put('exam-sessions/:id/answers')
  @ZodResponse({ status: 200, type: SaveExamAnswersResultDto })
  saveAnswers(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: SaveExamAnswersRequestDto,
  ): Promise<SaveExamAnswersResult> {
    return this.exams.saveAnswers(user, id, body);
  }

  /**
   * US-4.4 AC-12: the results of the caller's closed session, GRADING until published; 409
   * EXAM_NOT_CLOSED while it is open.
   */
  @Roles('STUDENT')
  @RateLimit('exam.result', 30)
  @Get('exam-sessions/:id/result')
  @ZodResponse({ status: 200, type: ExamResultDto })
  result(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto): Promise<ExamResult> {
    return this.results.resultOf(user, id);
  }

  /** AC-8: submits; the same answer when sent again. */
  @Roles('STUDENT')
  @RateLimit('exam.submit', 10)
  @Post('exam-sessions/:id/submit')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: ExamSubmissionDto })
  submit(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto): Promise<ExamSubmission> {
    return this.exams.submit(user, id);
  }
}
