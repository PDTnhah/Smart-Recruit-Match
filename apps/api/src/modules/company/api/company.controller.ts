import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Company, CompanyList, HrAccountList, HrInvitation } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { CompanyService } from '../application/company.service.js';
import {
  CompanyDto,
  CompanyListDto,
  CreateCompanyRequestDto,
  HrAccountListDto,
  HrInvitationDto,
  InviteHrRequestDto,
  UpdateCompanyRequestDto,
} from './dto.js';

/** Companies and HR invitations (FR-3, US-1.5 AC-1, AC-2). The center only. */
@ApiTags('companies')
@Roles('CENTER')
@Controller('companies')
export class CompanyController {
  constructor(private readonly companies: CompanyService) {}

  @Post()
  @ZodResponse({ status: 201, type: CompanyDto })
  create(@CurrentUser() user: AuthUser, @Body() body: CreateCompanyRequestDto): Promise<Company> {
    return this.companies.create(user, body);
  }

  @Get()
  @ZodResponse({ status: 200, type: CompanyListDto })
  list(): Promise<CompanyList> {
    return this.companies.list();
  }

  @Get(':id')
  @ZodResponse({ status: 200, type: CompanyDto })
  get(@Param() { id }: IdParamDto): Promise<Company> {
    return this.companies.get(id);
  }

  @Patch(':id')
  @ZodResponse({ status: 200, type: CompanyDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: UpdateCompanyRequestDto,
  ): Promise<Company> {
    return this.companies.update(user, id, body);
  }

  /** The response carries the link to send by hand until email exists (US-1.7). */
  @Post(':id/hr-invitations')
  @ZodResponse({ status: 201, type: HrInvitationDto })
  inviteHr(
    @CurrentUser() user: AuthUser,
    @Param() { id }: IdParamDto,
    @Body() body: InviteHrRequestDto,
  ): Promise<HrInvitation> {
    return this.companies.inviteHr(user, id, body);
  }

  @Get(':id/hr-accounts')
  @ZodResponse({ status: 200, type: HrAccountListDto })
  listHrAccounts(@Param() { id }: IdParamDto): Promise<HrAccountList> {
    return this.companies.listHrAccounts(id);
  }
}
