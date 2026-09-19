import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  FuelType,
  KmPolicy,
  MechanicsCondition,
  MotorcycleStyle,
  Transmission,
  VehicleCategory,
  VehicleType,
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateVehicleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  brand: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  model: string;

  @ApiProperty()
  @IsInt()
  @Min(1990)
  @Max(2100)
  year: number;

  @ApiProperty({ example: 'ABC1234 or ABC1D23 (Mercosul)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/, {
    message:
      'Placa inválida. Use o formato ABC1234 (antigo) ou ABC1D23 (Mercosul).',
  })
  plate: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  city: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Estado deve ter exatamente 2 letras.' })
  @MaxLength(2, { message: 'Estado deve ter exatamente 2 letras.' })
  state: string;

  @ApiPropertyOptional({ enum: VehicleType, default: VehicleType.CAR })
  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

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

  @ApiPropertyOptional({
    example: 999.9,
    description:
      'Campo legado. Quando enviado, deve representar o valor semanal.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  dailyRate?: number;

  @ApiProperty({ example: 999.9 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  weeklyRate: number;

  @ApiPropertyOptional({ enum: KmPolicy, default: KmPolicy.FREE })
  @IsOptional()
  @IsEnum(KmPolicy)
  kmPolicy?: KmPolicy;

  @ApiPropertyOptional({ enum: MotorcycleStyle })
  @IsOptional()
  @IsEnum(MotorcycleStyle)
  motorcycleStyle?: MotorcycleStyle;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(2500)
  engineCc?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasAbs?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasTopCase?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasInsurance?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(MechanicsCondition)
  mechanicsCondition?: MechanicsCondition;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasDetranIssues?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2000)
  trunkSize?: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
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
