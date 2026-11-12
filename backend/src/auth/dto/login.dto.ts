import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  IsByteLength,
} from 'class-validator';
export class LoginDto {
  @ApiProperty({ example: 'admin@example.com', format: 'email' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  email: string;
  @ApiProperty({ format: 'password', writeOnly: true })
  @IsString()
  @MinLength(1)
  @IsByteLength(1, 72)
  password: string;
}
