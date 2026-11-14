import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsISO8601, IsOptional } from 'class-validator';

export class CreateGrantDto {
  @ApiProperty({ example: 'pessoa@exemplo.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: ['PROFESSIONAL', 'FLEET'] })
  @IsIn(['PROFESSIONAL', 'FLEET'])
  plan!: 'PROFESSIONAL' | 'FLEET';

  @ApiPropertyOptional({
    description: 'Fim da concessão (ISO 8601). Omitido = sem fim.',
  })
  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}
