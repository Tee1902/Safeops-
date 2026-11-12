import { Roles } from '../auth/decorators/roles.decorator.js';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { NotificationQueryDto } from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';
@ApiBearerAuth()
@ApiTags('Notifications')
@Roles('ADMIN', 'OPERATOR', 'SECURITY', 'REPORTER')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get()
  list(
    @Query() query: NotificationQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.list(user.id, query);
  }
  @Patch('read-all')
  readAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.readAll(user.id);
  }
  @Patch(':id/read')
  read(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.read(user.id, id);
  }
}
