import { IsString, MinLength, IsByteLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class ChangePasswordDto {
  @ApiProperty({ format: 'password', writeOnly: true })
  @IsString()
  @MinLength(1)
  @IsByteLength(1, 72)
  currentPassword: string;
  @ApiProperty({
    minLength: 8,
    maxLength: 72,
    format: 'password',
    writeOnly: true,
  })
  @IsString()
  @MinLength(8)
  @IsByteLength(8, 72)
  newPassword: string;
  @ApiProperty({ format: 'password', writeOnly: true })
  @IsString()
  @MinLength(8)
  @IsByteLength(8, 72)
  confirmPassword: string;
}
