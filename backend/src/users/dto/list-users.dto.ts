import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from './pagination.dto.js';
import { ROLE_CODES, type RoleCode } from '../../auth/roles.js';

export class ListUsersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ROLE_CODES })
  @IsOptional()
  @IsIn(ROLE_CODES)
  role?: RoleCode;
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isActive?: boolean;
}
