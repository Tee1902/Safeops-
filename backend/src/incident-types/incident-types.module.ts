import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { IncidentTypesController } from './incident-types.controller.js';
import { IncidentTypesService } from './incident-types.service.js';
@Module({
  imports: [AuthModule],
  controllers: [IncidentTypesController],
  providers: [IncidentTypesService],
})
export class IncidentTypesModule {}
