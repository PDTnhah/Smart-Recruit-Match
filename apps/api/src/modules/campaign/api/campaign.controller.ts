import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type Campaign, type CampaignList, ROLES } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { CampaignService } from '../application/campaign.service.js';
import {
  CampaignDto,
  CampaignListDto,
  CreateCampaignRequestDto,
  OpenCampaignRequestDto,
  UpdateCampaignRequestDto,
} from './dto.js';

/**
 * Campaign setup (FR-2, US-1.4). Only CENTER writes; every role reads the campaigns it takes part
 * in, and a campaign outside that scope answers 404 (CONTEXT D27).
 */
@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignController {
  constructor(private readonly campaigns: CampaignService) {}

  @Roles('CENTER')
  @Post()
  @ZodResponse({ status: 201, type: CampaignDto })
  create(@CurrentUser() user: AuthUser, @Body() body: CreateCampaignRequestDto): Promise<Campaign> {
    return this.campaigns.create(user, body);
  }

  @Roles(...ROLES)
  @Get()
  @ZodResponse({ status: 200, type: CampaignListDto })
  list(@CurrentUser() user: AuthUser): Promise<CampaignList> {
    return this.campaigns.list(user);
  }

  @Roles(...ROLES)
  @Get(':id')
  @ZodResponse({ status: 200, type: CampaignDto })
  get(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto): Promise<Campaign> {
    return this.campaigns.get(user, id);
  }

  @Roles('CENTER')
  @Patch(':id')
  @ZodResponse({ status: 200, type: CampaignDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: UpdateCampaignRequestDto,
  ): Promise<Campaign> {
    return this.campaigns.update(user, id, body);
  }

  @Roles('CENTER')
  @Post(':id/open')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: CampaignDto })
  open(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: OpenCampaignRequestDto,
  ): Promise<Campaign> {
    return this.campaigns.open(user, id, body.rowVersion);
  }
}
