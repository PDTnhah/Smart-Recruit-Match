import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { UserList, UserSummary } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { Roles } from '../../../common/auth/index.js';
import { AdminUsersService } from '../application/admin-users.service.js';
import { CreateUserRequestDto, ListUsersQueryDto, UserListDto, UserSummaryDto } from './dto.js';

/** Account administration (US-1.3 AC-7). Personas: only ADMIN manages accounts. */
@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Post()
  @ZodResponse({ status: 201, type: UserSummaryDto })
  create(@Body() body: CreateUserRequestDto): Promise<UserSummary> {
    return this.adminUsers.create(body);
  }

  @Get()
  @ZodResponse({ type: UserListDto })
  list(@Query() query: ListUsersQueryDto): Promise<UserList> {
    return this.adminUsers.list(query);
  }
}
