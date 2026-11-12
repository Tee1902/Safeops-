import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationDto } from '../users/dto/pagination.dto.js';
export class AssignmentNoteDto {
  @ApiPropertyOptional({ type: String, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
export class CreateAssignmentDto extends AssignmentNoteDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  securityUserId: string;
}
export class AssignmentQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  @ApiPropertyOptional({
    type: String,
    enum: ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  })
  status?: string;
}
