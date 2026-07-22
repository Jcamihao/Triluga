import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateProfileDto {
  // Non-nullable DB columns: skip validators when absent (undefined) but
  // reject when explicitly null or empty — preventing accidental data erasure.
  @ApiPropertyOptional()
  @ValidateIf((o) => o.fullName !== undefined)
  @IsNotEmpty({ message: 'Nome completo não pode ser vazio.' })
  @IsString()
  @MinLength(2, { message: 'Nome completo deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ example: '+55 11 99999-9999' })
  @ValidateIf((o) => o.phone !== undefined)
  @IsNotEmpty({ message: 'Telefone não pode ser vazio.' })
  @IsString()
  @MaxLength(20)
  @Matches(/^[\d\s\-()+]+$/, { message: 'Telefone com formato inválido.' })
  phone?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.city !== undefined)
  @IsNotEmpty({ message: 'Cidade não pode ser vazia.' })
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.state !== undefined)
  @IsNotEmpty({ message: 'Estado não pode ser vazio.' })
  @IsString()
  @MaxLength(2)
  @MinLength(2, { message: 'Estado deve ter exatamente 2 letras.' })
  state?: string;

  // Nullable DB columns: @IsOptional() allows null to clear the field.
  @ApiPropertyOptional({ example: '13010-111' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, {
    message: 'CEP deve estar no formato 00000-000.',
  })
  zipCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  addressLine?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  addressComplement?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  driverLicenseNumber?: string;
}
