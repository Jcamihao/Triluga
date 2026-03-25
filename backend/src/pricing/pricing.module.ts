import { Module } from '@nestjs/common';
import { VehiclePricingService } from './vehicle-pricing.service';

@Module({
  providers: [VehiclePricingService],
  exports: [VehiclePricingService],
})
export class PricingModule {}
