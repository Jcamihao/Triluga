import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  FuelType,
  MotorcycleStyle,
  Transmission,
  VehicleCategory,
  VehicleType,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

// `?maxPrice=` (string vazia) viraria 0 pela conversão implícita do pipe e
// filtraria tudo; o Transform roda depois do @Type, então olha o valor
// original (`obj`) e devolve undefined. '0' literal continua sendo 0.
const emptyToUndefined = ({
  value,
  obj,
  key,
}: {
  value: unknown;
  obj: Record<string, unknown>;
  key: string;
}) => (obj[key] === '' ? undefined : value);

export class ListVehiclesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ enum: VehicleType })
  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(VehicleCategory)
  category?: VehicleCategory;

  @ApiPropertyOptional({ enum: MotorcycleStyle })
  @IsOptional()
  @IsEnum(MotorcycleStyle)
  motorcycleStyle?: MotorcycleStyle;

  @ApiPropertyOptional({ enum: Transmission })
  @IsOptional()
  @IsEnum(Transmission)
  transmission?: Transmission;

  @ApiPropertyOptional({ enum: FuelType })
  @IsOptional()
  @IsEnum(FuelType)
  fuelType?: FuelType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  minEngineCc?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  maxEngineCc?: number;

  @ApiPropertyOptional({ description: 'Diária mínima.' })
  @IsOptional()
  @Type(() => Number)
  @Transform(emptyToUndefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  minDailyRate?: number;

  @ApiPropertyOptional({ description: 'Diária máxima.' })
  @IsOptional()
  @Type(() => Number)
  @Transform(emptyToUndefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  maxDailyRate?: number;

  @ApiPropertyOptional({ description: 'Legado: valor semanal (÷ 7).' })
  @IsOptional()
  @Type(() => Number)
  @Transform(emptyToUndefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Legado: valor semanal (÷ 7).' })
  @IsOptional()
  @Type(() => Number)
  @Transform(emptyToUndefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  maxPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  longitude?: number;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(1)
  @Max(200)
  radiusKm?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({
    enum: ['relevance', 'newest', 'oldest', 'price_asc', 'price_desc'],
  })
  @IsOptional()
  @IsString()
  sort?: string = 'relevance';
}
