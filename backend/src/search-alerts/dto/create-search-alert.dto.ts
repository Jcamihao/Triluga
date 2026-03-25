import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSearchAlertDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @ApiProperty({
    example: {
      city: 'São Paulo',
      vehicleType: 'MOTORCYCLE',
      minPrice: '80',
      maxPrice: '180',
    },
  })
  @IsObject()
  filters: Record<string, unknown>;
}
