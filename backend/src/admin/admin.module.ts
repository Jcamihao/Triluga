import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { PrivacyModule } from '../privacy/privacy.module';
import { ReportsModule } from '../reports/reports.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    PrivacyModule,
    VehiclesModule,
    ReportsModule,
    AnalyticsModule,
    AuditModule,
    EmailModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
