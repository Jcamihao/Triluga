import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'owner@carbnb.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Owner123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, {
    message:
      'A senha deve conter pelo menos uma letra, um número e um caractere especial.',
  })
  password: string;

  @ApiProperty({ enum: [Role.OWNER, Role.RENTER], example: Role.RENTER })
  @IsEnum(Role)
  role: Role;

  @ApiProperty({ example: 'Lucas Almeida' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ example: '+55 11 99999-9999' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;

  @ApiProperty({ example: 'Campinas' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  city: string;

  @ApiProperty({ example: 'SP' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2)
  state: string;
}
