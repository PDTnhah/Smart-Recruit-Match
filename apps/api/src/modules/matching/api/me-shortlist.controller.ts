import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { ShortlistResponse } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { ShortlistService } from '../application/shortlist.service.js';
import { ShortlistResponseDto } from './dto.js';

/** The caller's shortlist with its explanation (FR-15, NFR-4, US-3.3 AC-1–AC-4). Students only (BR-11). */
@ApiTags('preferences')
@Controller('me/shortlist')
export class MeShortlistController {
  constructor(private readonly shortlists: ShortlistService) {}

  @Roles('STUDENT')
  @Get()
  @ZodResponse({ status: 200, type: ShortlistResponseDto })
  get(@CurrentUser() user: AuthUser): Promise<ShortlistResponse> {
    return this.shortlists.forStudent(user);
  }
}
