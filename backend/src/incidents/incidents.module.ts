import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module.js';

import { Incident } from '../database/entities/incident.entity.js';
import { IncidentType } from '../database/entities/incident-type.entity.js';
import { User } from '../database/entities/user.entity.js';
import { IncidentLog } from '../database/entities/incident-log.entity.js';

import { IncidentsController } from './incidents.controller.js';
import { IncidentsService } from './incidents.service.js';

@Module({
  imports: [
    AuthModule,

    TypeOrmModule.forFeature([Incident, IncidentType, User, IncidentLog]),
  ],
  controllers: [IncidentsController],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
