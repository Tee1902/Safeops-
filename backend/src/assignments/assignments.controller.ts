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
import {
  AssignmentNoteDto,
  AssignmentQueryDto,
  CreateAssignmentDto,
} from './assignments.dto.js';
import { AssignmentsService } from './assignments.service.js';
@ApiBearerAuth()
@ApiTags('Assignments')
@Roles('ADMIN', 'OPERATOR', 'SECURITY', 'REPORTER')
@Controller()
export class AssignmentsController {
  constructor(private readonly service: AssignmentsService) {}
  @Get('assignments/security-users')
  @Roles('OPERATOR', 'ADMIN')
  securityUsers(@Query() query: PaginationDto) {
    return this.service.securityUsers(query);
  }
  @Post('incidents/:id/assignments')
  @Roles('OPERATOR', 'ADMIN')
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAssignmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(id, dto, user);
  }
  @Get('assignments/me')
  @Roles('SECURITY')
  mine(
    @Query() query: AssignmentQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.mine(user, query);
  }
  @Get('incidents/:id/assignments')
  forIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.forIncident(id, user, query);
  }
  @Patch('assignments/:id/accept')
  @Roles('SECURITY')
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignmentNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.transition(id, 'accept', user, dto.note);
  }
  @Patch('assignments/:id/start')
  @Roles('SECURITY')
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignmentNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.transition(id, 'start', user, dto.note);
  }
  @Patch('assignments/:id/complete')
  @Roles('SECURITY')
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignmentNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.transition(id, 'complete', user, dto.note);
  }
  @Patch('assignments/:id/cancel')
  @Roles('OPERATOR', 'ADMIN')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignmentNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.transition(id, 'cancel', user, dto.note);
  }
}
