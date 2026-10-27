import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AdminSkill, AdminSkillList } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { SkillReviewService } from '../application/skill-review.service.js';
import {
  AdminSkillDto,
  AdminSkillListDto,
  AdminSkillListQueryDto,
  ApproveSkillRequestDto,
  MergeSkillRequestDto,
  RejectSkillRequestDto,
} from './dto.js';

/**
 * Review of the skills the AI found outside the catalogue (FR-13, US-2.5 AC-7, AC-8). Personas:
 * only ADMIN manages the catalogue; other roles get 403.
 */
@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin/skills')
export class AdminSkillsController {
  constructor(private readonly review: SkillReviewService) {}

  @Get()
  @ZodResponse({ type: AdminSkillListDto })
  list(@Query() query: AdminSkillListQueryDto): Promise<AdminSkillList> {
    return this.review.list(query);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: AdminSkillDto })
  approve(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: ApproveSkillRequestDto,
  ): Promise<AdminSkill> {
    return this.review.approve(user, id, body);
  }

  @Post(':id/merge')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: AdminSkillDto })
  merge(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: MergeSkillRequestDto,
  ): Promise<AdminSkill> {
    return this.review.merge(user, id, body);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: AdminSkillDto })
  reject(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: RejectSkillRequestDto,
  ): Promise<AdminSkill> {
    return this.review.reject(user, id, body);
  }
}
