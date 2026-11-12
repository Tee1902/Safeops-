import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { DashboardService } from './dashboard.service.js';
@ApiTags('Dashboard')
@ApiBearerAuth()
@Roles('ADMIN', 'OPERATOR')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}
  @Get('summary')
  @ApiOperation({ summary: 'Tổng số sự cố theo trạng thái' })
  summary(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboard.summary(actor);
  }
}
