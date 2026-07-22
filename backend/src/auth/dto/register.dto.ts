import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@triluga.local' })
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'User123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, {
    message:
      'A senha deve conter pelo menos uma letra, um número e um caractere especial.',
  })
  password: string;

  @ApiProperty({ example: '12345678909', description: 'CPF (11 dígitos) ou CNPJ (14 dígitos), somente números.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(11, { message: 'CPF ou CNPJ inválido.' })
  @MaxLength(14, { message: 'CPF ou CNPJ inválido.' })
  @Matches(/^\d{11}$|^\d{14}$/, { message: 'Documento deve ter 11 dígitos (CPF) ou 14 dígitos (CNPJ).' })
  documentNumber: string;

  @ApiProperty({ example: 'Lucas Almeida' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Nome completo deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ example: '+55 11 99999-9999' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^[\d\s\-()+]+$/, { message: 'Telefone com formato inválido.' })
  phone: string;

  @ApiProperty({ example: '13010-111' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{5}-?\d{3}$/, {
    message: 'CEP deve estar no formato 00000-000.',
  })
  zipCode: string;

  @ApiProperty({ example: 'Rua Conceição' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  addressLine: string;

  @ApiProperty({ example: 'Apto 42' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  addressComplement: string;

  @ApiProperty({ example: 'Campinas' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  city: string;

  @ApiProperty({ example: 'SP' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Estado deve ter exatamente 2 letras.' })
  @MaxLength(2, { message: 'Estado deve ter exatamente 2 letras.' })
  state: string;
}
