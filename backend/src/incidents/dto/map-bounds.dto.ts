import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import type { SelectQueryBuilder } from 'typeorm';
import type { Incident } from '../../database/entities/incident.entity.js';

const coordinate = ({ value }: { value: unknown }) =>
  typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN;

export class MapBoundsDto {
  @ApiPropertyOptional({
    minimum: -90,
    maximum: 90,
    description:
      'Supply all four bounds together; inclusive. west > east crosses the antimeridian.',
  })
  @IsOptional()
  @Transform(coordinate)
  @IsNumber()
  @Min(-90)
  @Max(90)
  south?: number;
  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @IsOptional()
  @Transform(coordinate)
  @IsNumber()
  @Min(-90)
  @Max(90)
  north?: number;
  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional()
  @Transform(coordinate)
  @IsNumber()
  @Min(-180)
  @Max(180)
  west?: number;
  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional()
  @Transform(coordinate)
  @IsNumber()
  @Min(-180)
  @Max(180)
  east?: number;
}

export function applyMapBounds(
  qb: SelectQueryBuilder<Incident>,
  bounds: MapBoundsDto,
) {
  const values = [bounds.south, bounds.north, bounds.west, bounds.east];
  if (values.every((value) => value === undefined)) return;
  if (
    values.some((value) => value === undefined) ||
    bounds.south! > bounds.north!
  )
    throw new BadRequestException(
      'Supply south, north, west and east together, with south <= north.',
    );
  qb.andWhere('incident.latitude BETWEEN :south AND :north', {
    south: bounds.south,
    north: bounds.north,
  });
  qb.andWhere(
    bounds.west! > bounds.east!
      ? '(incident.longitude >= :west OR incident.longitude <= :east)'
      : 'incident.longitude BETWEEN :west AND :east',
    { west: bounds.west, east: bounds.east },
  );
}
