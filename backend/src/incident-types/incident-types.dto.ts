import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationDto } from '../users/dto/pagination.dto.js';
export class CreateIncidentTypeDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  @MaxLength(50)
  @ApiProperty({ type: String, maxLength: 50 })
  code: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiProperty({ type: String, maxLength: 100 })
  name: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  @ApiPropertyOptional({ type: String, maxLength: 2000 })
  description?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(100)
  @ApiPropertyOptional({ type: String, maxLength: 100 })
  icon?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  @ApiPropertyOptional({ type: Boolean })
  isActive?: boolean;
}
export class UpdateIncidentTypeDto extends PartialType(CreateIncidentTypeDto, {
  skipNullProperties: false,
}) {}
export class IncidentTypeQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  includeInactive?: string;
}
