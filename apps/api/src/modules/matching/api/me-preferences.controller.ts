import { Body, Controller, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { PreferenceList } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { PreferencesService } from '../application/preferences.service.js';
import { PreferenceListDto, ReplacePreferencesRequestDto } from './dto.js';

/** The caller's preference list (FR-16, BR-04, US-3.3 AC-5–AC-9). Students only (BR-11). */
@ApiTags('preferences')
@Controller('me/preferences')
export class MePreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  /** Replaces the whole list; an empty list clears it unless the campaign requires a full one. */
  @Roles('STUDENT')
  @Put()
  @ZodResponse({ status: 200, type: PreferenceListDto })
  replace(@CurrentUser() user: AuthUser, @Body() body: ReplacePreferencesRequestDto): Promise<PreferenceList> {
    return this.preferences.replace(user, body);
  }
}
