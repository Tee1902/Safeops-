import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  IsByteLength,
} from 'class-validator';
export class RegisterDto {
  @ApiProperty({ example: 'Nguyễn Văn A', minLength: 2, maxLength: 150 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName: string;
  @ApiProperty({ example: 'reporter@example.com', format: 'email' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  email: string;
  @ApiProperty({
    minLength: 8,
    maxLength: 72,
    format: 'password',
    writeOnly: true,
  })
  @IsString()
  @MinLength(8)
  @IsByteLength(8, 72)
  password: string;
  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
