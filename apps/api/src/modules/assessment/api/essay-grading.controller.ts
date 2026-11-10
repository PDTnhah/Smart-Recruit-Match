import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { EssayGradingDispatch } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { CampaignService } from '../../campaign/index.js';
import { EssayGradingService } from '../application/essay-grading.service.js';
import { EssayGradingDispatchDto } from './dto.js';

/** Phases in which CENTER may send the closed sessions' essays to the Grader (CONTEXT D53). */
const DISPATCH_PHASES = ['TESTING', 'ALLOCATION_REVIEW'] as const;

/**
 * Essay grading of a campaign (US-4.4 AC-2, CONTEXT D53): CENTER sends the closed sessions'
 * essays to the Grader before the sweep would, from the campaign page. HR and STUDENT get 403.
 */
@ApiTags('grading')
@Controller()
export class EssayGradingController {
  constructor(
    private readonly essays: EssayGradingService,
    private readonly campaigns: CampaignService,
  ) {}

  /** Sends what is not sent yet; called again, it sends nothing twice. */
  @Roles('CENTER')
  @Post('campaigns/:id/essay-grading')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: EssayGradingDispatchDto })
  async dispatch(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto): Promise<EssayGradingDispatch> {
    await this.campaigns.assertPhase(id, DISPATCH_PHASES);
    return this.essays.dispatchForCampaign(id, { kind: 'USER', userId: user.userId });
  }
}
