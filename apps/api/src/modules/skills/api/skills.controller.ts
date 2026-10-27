import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { CatalogSkillList } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { Roles } from '../../../common/auth/index.js';
import { SkillCatalogService } from '../application/skill-catalog.service.js';
import { CatalogSkillListDto, SkillSearchQueryDto } from './dto.js';

/**
 * The approved skill catalogue, for the skill fields of the student profile and the JD form
 * (US-2.5 AC-8, US-2.6). Every signed-in role reads it; skills awaiting review never show.
 */
@ApiTags('skills')
@Roles('STUDENT', 'HR', 'CENTER', 'ADMIN')
@Controller('skills')
export class SkillsController {
  constructor(private readonly catalog: SkillCatalogService) {}

  @Get()
  @ZodResponse({ type: CatalogSkillListDto })
  async search(@Query() query: SkillSearchQueryDto): Promise<CatalogSkillList> {
    return { items: await this.catalog.search(query.query, query.limit) };
  }
}
