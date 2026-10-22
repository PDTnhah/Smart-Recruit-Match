import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { JdRequirementsView } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { JdRequirementsService } from '../application/jd-requirements.service.js';
import { JdRequirementsViewDto, SaveJdRequirementsRequestDto } from './dto.js';

/**
 * Normalised requirements of a JD (FR-10, US-2.3, ARCHITECTURE › API architecture). HR of the
 * company edits and confirms; the center reads, and versions an approved JD (BR-18). HR of another
 * company gets 404 (BR-11), students 403.
 */
@ApiTags('job-descriptions')
@Controller('jds')
export class JdRequirementsController {
  constructor(private readonly requirements: JdRequirementsService) {}

  @Roles('HR', 'CENTER')
  @Get(':id/requirements')
  @ZodResponse({ status: 200, type: JdRequirementsViewDto })
  get(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto): Promise<JdRequirementsView> {
    return this.requirements.get(user, id);
  }

  /** Saves without confirming: in place before confirmation, as version + 1 once approved (AC-11). */
  @Roles('HR', 'CENTER')
  @Put(':id/requirements')
  @ZodResponse({ status: 200, type: JdRequirementsViewDto })
  save(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: SaveJdRequirementsRequestDto,
  ): Promise<JdRequirementsView> {
    return this.requirements.save(user, id, body);
  }

  /** AC-8: HR confirms; the JD moves to PENDING_APPROVAL. The center cannot confirm for HR (AC-9). */
  @Roles('HR')
  @Put(':id/requirements/confirm')
  @ZodResponse({ status: 200, type: JdRequirementsViewDto })
  confirm(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: SaveJdRequirementsRequestDto,
  ): Promise<JdRequirementsView> {
    return this.requirements.confirm(user, id, body);
  }
}
