import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { SearchAlertsModule } from '../search-alerts/search-alerts.module';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';

@Module({
  imports: [SearchAlertsModule, BillingModule],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
