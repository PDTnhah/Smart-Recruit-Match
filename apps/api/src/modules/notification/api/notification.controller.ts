import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { MarkAllReadResult, NotificationList } from '@srm/shared';
import { ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../../../common/auth/index.js';
import { IdParamDto } from '../../../common/validation/id-param.dto.js';
import { NotificationService } from '../application/notification.service.js';
import { MarkAllReadResultDto, NotificationListDto, NotificationListQueryDto } from './dto.js';

/**
 * The caller's in-app notifications (FR-8, US-1.7 AC-2). Every role has them; the user always
 * comes from the token, so nobody reads or marks another user's notification (Invariant 7).
 */
@ApiTags('notifications')
@Roles('STUDENT', 'HR', 'CENTER', 'ADMIN')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  /** Newest first; `before` pages back, `unreadCount` covers every page. */
  @Get()
  @ZodResponse({ status: 200, type: NotificationListDto })
  list(@CurrentUser() user: AuthUser, @Query() query: NotificationListQueryDto): Promise<NotificationList> {
    return this.notifications.list(user, query);
  }

  /** Sets `read_at` (kept if already set). Another user's notification: 404. */
  @Post(':id/read')
  @HttpCode(204)
  markRead(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<void> {
    return this.notifications.markRead(user, params.id);
  }

  @Post('read-all')
  @ZodResponse({ status: 200, type: MarkAllReadResultDto })
  markAllRead(@CurrentUser() user: AuthUser): Promise<MarkAllReadResult> {
    return this.notifications.markAllRead(user);
  }
}
