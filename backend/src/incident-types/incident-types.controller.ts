import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  CreateIncidentTypeDto,
  IncidentTypeQueryDto,
  UpdateIncidentTypeDto,
} from './incident-types.dto.js';
import { IncidentTypesService } from './incident-types.service.js';
import { PositiveIntPipe } from '../common/positive-int.pipe.js';
@ApiBearerAuth()
@ApiTags('Incident types')
@Roles('ADMIN', 'OPERATOR', 'SECURITY', 'REPORTER')
@Controller('incident-types')
export class IncidentTypesController {
  constructor(private readonly service: IncidentTypesService) {}
  @Get()
  list(
    @Query() query: IncidentTypeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.list(query, user);
  }
  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateIncidentTypeDto) {
    return this.service.save(dto);
  }
  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id', PositiveIntPipe) id: number,
    @Body() dto: UpdateIncidentTypeDto,
  ) {
    return this.service.save(dto, id);
  }
}
