import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { IncidentQueryDto } from '../incidents/dto/incident-query.dto.js';

export class DashboardQueryDto extends PickType(IncidentQueryDto, [
  'status',
  'severity',
  'incidentTypeId',
  'from',
  'to',
] as const) {
  @ApiPropertyOptional({
    enum: ['day', 'month'],
    default: 'day',
    description: 'Calendar buckets in Asia/Saigon. Empty periods are omitted.',
  })
  @IsOptional()
  @IsIn(['day', 'month'])
  granularity: 'day' | 'month' = 'day';
}
