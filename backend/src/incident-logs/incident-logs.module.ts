import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncidentLog } from '../database/entities/incident-log.entity.js';
@Module({
  imports: [TypeOrmModule.forFeature([IncidentLog])],
  exports: [TypeOrmModule],
})
export class IncidentLogsModule {}
