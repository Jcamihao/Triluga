import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'owner@velo.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Owner123!' })
  @IsString()
  @MinLength(8)
  password: string;
}
