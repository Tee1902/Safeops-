import { Transform } from 'class-transformer';
import { NumericInput } from '../../common/validation.js';

import {
  IsString,
  IsNotEmpty,
  ValidateIf,
  IsInt,
  IsNumber,
  IsIn,
  MaxLength,
  Min,
  Max,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateIncidentDto {
  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: 10 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  attachmentIds?: string[];

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @ApiProperty({ type: String, maxLength: 200 })
  title: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(5000)
  @ApiPropertyOptional({ type: String, maxLength: 5000 })
  description?: string;

  @NumericInput()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  @ApiProperty({ type: Number, minimum: 1, maximum: 2147483647 })
  incidentTypeId: number;

  @NumericInput()
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  @ApiProperty({ type: Number, minimum: -90, maximum: 90 })
  latitude: number;

  @NumericInput()
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  @ApiProperty({ type: Number, minimum: -180, maximum: 180 })
  longitude: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(500)
  @ApiPropertyOptional({ type: String, maxLength: 500 })
  address?: string;

  @IsString()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  @ApiProperty({ type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  severity: string;
}
