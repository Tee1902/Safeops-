import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { PaginationDto } from '../users/dto/pagination.dto.js';
import { CreateIncidentDto } from './dto/create-incident.dto.js';
import { IncidentQueryDto } from './dto/incident-query.dto.js';
import { RejectIncidentDto } from './dto/review-incident.dto.js';
import { UpdateIncidentDto } from './dto/update-incident.dto.js';
import { IncidentsService } from './incidents.service.js';
import { AssignmentNoteDto } from '../assignments/assignments.dto.js';
import { PublicProjection } from '../common/response-serializer.interceptor.js';
@ApiBearerAuth()
@ApiTags('Incidents')
@Roles('ADMIN', 'OPERATOR', 'SECURITY', 'REPORTER')
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly service: IncidentsService) {}
  @Post()
  async create(
    @Body() dto: CreateIncidentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      message: 'Tạo báo cáo sự cố thành công.',
      incident: await this.service.create(dto, user.id),
    };
  }
  @Get()
  // The list service returns an explicit public projection, with no User entity.
  @PublicProjection()
  list(
    @Query() query: IncidentQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(query, user);
  }
  @Get(':id')
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findOne(id, user);
  }
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user);
  }
  @Patch(':id/verify')
  @Roles('OPERATOR', 'ADMIN')
  verify(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.review(id, user);
  }
  @Patch(':id/reject')
  @Roles('OPERATOR', 'ADMIN')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectIncidentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.review(id, user, dto.reason);
  }
  @Get(':id/logs')
  logs(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.logs(id, user, query);
  }
  @Patch(':id/close')
  @Roles('OPERATOR', 'ADMIN')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignmentNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.close(id, user, dto.note);
  }
}
