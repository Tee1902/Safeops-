import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardQueryDto } from './dashboard-query.dto.js';
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
  @Get('statistics')
  @ApiOperation({
    summary:
      'Statistics by status, severity, type and local calendar period; average processing times in seconds',
  })
  statistics(
    @Query() query: DashboardQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.dashboard.statistics(query, actor);
  }
}
