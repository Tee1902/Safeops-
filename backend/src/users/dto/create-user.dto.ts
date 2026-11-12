import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { RegisterDto } from '../../auth/dto/register.dto.js';

export class CreateUserDto extends RegisterDto {
  @ApiProperty({ enum: ['OPERATOR', 'SECURITY'] })
  @IsIn(['OPERATOR', 'SECURITY'])
  role: 'OPERATOR' | 'SECURITY';
}
