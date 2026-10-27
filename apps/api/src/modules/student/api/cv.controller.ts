import { Body, Controller, Get, Post, Query, UploadedFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { CenterCvList, Cv, CvList } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { requireFile, SingleFileUpload, type UploadedFileLike } from '../../../common/storage/index.js';
import { CvService } from '../application/cv.service.js';
import { CenterCvListDto, CenterCvListQueryDto, CvDto, CvListDto, CvListQueryDto, SubmitCvFieldsDto } from './dto.js';

/**
 * CV submission by students (FR-6, US-1.6) and the center's list of CVs (US-2.4 AC-11). The
 * student comes from the token; CV files are read through `GET /api/files/cv:{id}/url`.
 */
@ApiTags('cvs')
@Controller('cvs')
export class CvController {
  constructor(private readonly cvs: CvService) {}

  /**
   * AC-3: multipart with `file` (PDF or DOCX, ≤ 5 MB) and `campaignId`. Each call stores a new
   * version awaiting analysis, hence 202 Accepted (ARCHITECTURE › Luồng nộp và phân tích CV).
   */
  @Roles('STUDENT')
  @Post()
  @SingleFileUpload({ campaignId: { type: 'integer' } })
  @ZodResponse({ status: 202, type: CvDto })
  submit(
    @CurrentUser() user: AuthUser,
    @Body() body: SubmitCvFieldsDto,
    @UploadedFile() file: UploadedFileLike | undefined,
  ): Promise<Cv> {
    return this.cvs.submit(user, body.campaignId, requireFile(file));
  }

  /**
   * US-2.4 AC-11: the CV that counts of each student, for center staff; `attention=true` keeps
   * those whose analysis failed or whose file hid text ("CV cần xử lý"). HR and students get 403.
   */
  @Roles('CENTER', 'ADMIN')
  @Get()
  @ZodResponse({ status: 200, type: CenterCvListDto })
  listForCenter(@Query() query: CenterCvListQueryDto): Promise<CenterCvList> {
    return this.cvs.listForCenter(query);
  }

  @Roles('STUDENT')
  @Get('me')
  @ZodResponse({ status: 200, type: CvListDto })
  listMine(@CurrentUser() user: AuthUser, @Query() query: CvListQueryDto): Promise<CvList> {
    return this.cvs.listMine(user, query);
  }
}
