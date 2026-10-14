import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, UploadedFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { JdList, JobDescription } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { requireFile, SingleFileUpload, type UploadedFileLike } from '../../../common/storage/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { JdService } from '../application/jd.service.js';
import {
  CreateJdRequestDto,
  JdActionRequestDto,
  JdListDto,
  JdListQueryDto,
  JobDescriptionDto,
  UpdateJdRequestDto,
  UploadJdFileFieldsDto,
} from './dto.js';

/**
 * JD posting by HR and approval by the center (FR-4, FR-5, US-1.5). HR reaches only its company's
 * JDs (404 otherwise, BR-11); students have no access (403).
 */
@ApiTags('job-descriptions')
@Controller('jds')
export class JdController {
  constructor(private readonly jds: JdService) {}

  @Roles('HR')
  @Post()
  @ZodResponse({ status: 201, type: JobDescriptionDto })
  create(@CurrentUser() user: AuthUser, @Body() body: CreateJdRequestDto): Promise<JobDescription> {
    return this.jds.create(user, body);
  }

  @Roles('HR', 'CENTER')
  @Get()
  @ZodResponse({ status: 200, type: JdListDto })
  list(@CurrentUser() user: AuthUser, @Query() query: JdListQueryDto): Promise<JdList> {
    return this.jds.list(user, query);
  }

  @Roles('HR', 'CENTER')
  @Get(':id')
  @ZodResponse({ status: 200, type: JobDescriptionDto })
  get(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto): Promise<JobDescription> {
    return this.jds.get(user, id);
  }

  @Roles('HR')
  @Patch(':id')
  @ZodResponse({ status: 200, type: JobDescriptionDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: UpdateJdRequestDto,
  ): Promise<JobDescription> {
    return this.jds.update(user, id, body);
  }

  /** AC-5: multipart with `file` (PDF or DOCX, ≤ 5 MB) and `rowVersion`; replaces any earlier file. */
  @Roles('HR')
  @Put(':id/file')
  @SingleFileUpload({ rowVersion: { type: 'integer' } })
  @ZodResponse({ status: 200, type: JobDescriptionDto })
  attachFile(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: UploadJdFileFieldsDto,
    @UploadedFile() file: UploadedFileLike | undefined,
  ): Promise<JobDescription> {
    return this.jds.attachFile(user, id, body.rowVersion, requireFile(file));
  }

  @Roles('HR')
  @Post(':id/submit')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: JobDescriptionDto })
  submit(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: JdActionRequestDto,
  ): Promise<JobDescription> {
    return this.jds.submit(user, id, body.rowVersion);
  }

  @Roles('CENTER')
  @Post(':id/approve')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: JobDescriptionDto })
  approve(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: JdActionRequestDto,
  ): Promise<JobDescription> {
    return this.jds.approve(user, id, body.rowVersion);
  }
}
