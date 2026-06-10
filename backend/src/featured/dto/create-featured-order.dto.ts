import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { FEATURED_PLANS } from '../featured.constants';

const planIds = FEATURED_PLANS.map((p) => p.id) as [string, ...string[]];

export class CreateFeaturedOrderDto {
  @ApiProperty({ description: 'ID do veículo a ser destacado' })
  @IsString()
  vehicleId: string;

  @ApiProperty({ enum: planIds, description: 'ID do plano: 7d, 15d ou 30d' })
  @IsIn(planIds)
  planId: string;
}
