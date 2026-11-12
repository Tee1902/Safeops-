import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { PaginationDto } from '../../users/dto/pagination.dto.js';
import { INCIDENT_STATUSES, SEVERITIES } from '../../common/workflow.js';
export class IncidentQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: [...INCIDENT_STATUSES] })
  @IsOptional()
  @IsIn(INCIDENT_STATUSES)
  status?: string;
  @ApiPropertyOptional({ enum: [...SEVERITIES] })
  @IsOptional()
  @IsIn(SEVERITIES)
  severity?: string;
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 2147483647 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  incidentTypeId?: number;
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  reporterId?: string;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(200)
  @ApiPropertyOptional({ type: String, maxLength: 200 })
  search?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
