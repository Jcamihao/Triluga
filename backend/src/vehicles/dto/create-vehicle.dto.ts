import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  FuelType,
  Transmission,
  VehicleCategory,
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateVehicleDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  title: string;

  @ApiProperty()
  @IsString()
  @MaxLength(60)
  brand: string;

  @ApiProperty()
  @IsString()
  @MaxLength(60)
  model: string;

  @ApiProperty()
  @IsInt()
  @Min(1990)
  @Max(2100)
  year: number;

  @ApiProperty()
  @IsString()
  @MaxLength(16)
  plate: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  city: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2)
  state: string;

  @ApiProperty({ enum: VehicleCategory })
  @IsEnum(VehicleCategory)
  category: VehicleCategory;

  @ApiProperty({ enum: Transmission })
  @IsEnum(Transmission)
  transmission: Transmission;

  @ApiProperty({ enum: FuelType })
  @IsEnum(FuelType)
  fuelType: FuelType;

  @ApiProperty()
  @IsInt()
  @Min(2)
  @Max(12)
  seats: number;

  @ApiProperty({ example: 189.9 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  dailyRate: number;

  @ApiProperty()
  @IsString()
  @MaxLength(1200)
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  addressLine?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  longitude?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
