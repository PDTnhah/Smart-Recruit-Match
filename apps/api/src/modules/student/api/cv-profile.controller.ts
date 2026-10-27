import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { CvProfileView } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { CvProfileService } from '../application/cv-profile.service.js';
import { CvProfileQueryDto, CvProfileViewDto, ReopenCvProfileRequestDto, SaveCvProfileRequestDto } from './dto.js';

/**
 * The student's review of their CV profile (FR-11, US-2.6, CONTEXT D40). Students only; the
 * student comes from the token and the body names the CV version on screen, never a student.
 */
@ApiTags('cvs')
@Controller('cvs/me/profile')
export class CvProfileController {
  constructor(private readonly profiles: CvProfileService) {}

  /** AC-1, AC-10: the active version in the campaign; 404 when the student has none. */
  @Roles('STUDENT')
  @Get()
  @ZodResponse({ status: 200, type: CvProfileViewDto })
  get(@CurrentUser() user: AuthUser, @Query() query: CvProfileQueryDto): Promise<CvProfileView> {
    return this.profiles.get(user, query.campaignId);
  }

  /** AC-4: "Lưu nháp". */
  @Roles('STUDENT')
  @Put()
  @ZodResponse({ status: 200, type: CvProfileViewDto })
  save(@CurrentUser() user: AuthUser, @Body() body: SaveCvProfileRequestDto): Promise<CvProfileView> {
    return this.profiles.save(user, body);
  }

  /** AC-5: "Xác nhận"; the CV becomes CONFIRMED and counts for matching. */
  @Roles('STUDENT')
  @Put('confirm')
  @ZodResponse({ status: 200, type: CvProfileViewDto })
  confirm(@CurrentUser() user: AuthUser, @Body() body: SaveCvProfileRequestDto): Promise<CvProfileView> {
    return this.profiles.confirm(user, body);
  }

  /** AC-12: "Sửa lại"; answers with the new version, awaiting confirmation. */
  @Roles('STUDENT')
  @Post('reopen')
  @ZodResponse({ status: 201, type: CvProfileViewDto })
  reopen(@CurrentUser() user: AuthUser, @Body() body: ReopenCvProfileRequestDto): Promise<CvProfileView> {
    return this.profiles.reopen(user, body);
  }
}
