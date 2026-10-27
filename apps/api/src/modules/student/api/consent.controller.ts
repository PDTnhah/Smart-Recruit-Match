import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Consent, ConsentList } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { ConsentService } from '../application/consent.service.js';
import { AcceptConsentRequestDto, ConsentDto, ConsentListDto } from './dto.js';

/** The caller's consents to the data-processing terms (NFR-2, US-1.6 AC-1). Students only. */
@ApiTags('consents')
@Controller('me/consents')
export class ConsentController {
  constructor(private readonly consents: ConsentService) {}

  @Roles('STUDENT')
  @Get()
  @ZodResponse({ status: 200, type: ConsentListDto })
  list(@CurrentUser() user: AuthUser): Promise<ConsentList> {
    return this.consents.list(user);
  }

  /** Accepts the current terms for a campaign in INTAKE; accepting again returns the same record. */
  @Roles('STUDENT')
  @Post()
  @HttpCode(200)
  @ZodResponse({ status: 200, type: ConsentDto })
  accept(@CurrentUser() user: AuthUser, @Body() body: AcceptConsentRequestDto): Promise<Consent> {
    return this.consents.accept(user, body);
  }
}
