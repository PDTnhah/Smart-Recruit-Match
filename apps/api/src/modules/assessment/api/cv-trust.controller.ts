import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { CvTrustView } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { Roles } from '../../../common/auth/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { CvTrustService } from '../application/cv-trust.service.js';
import { CvTrustViewDto } from './dto.js';

/**
 * The CV trust index of a session's part C (FR-25, US-4.8 AC-7): CENTER only. HR, STUDENT and
 * ADMIN get 403; HR sees it with a nomination in US-5.3, a student never does.
 */
@ApiTags('grading')
@Controller()
export class CvTrustController {
  constructor(private readonly trust: CvTrustService) {}

  @Roles('CENTER')
  @Get('exam-sessions/:id/cv-trust')
  @ZodResponse({ status: 200, type: CvTrustViewDto })
  get(@Param() { id }: IdParamDto): Promise<CvTrustView> {
    return this.trust.getForSession(id);
  }
}
