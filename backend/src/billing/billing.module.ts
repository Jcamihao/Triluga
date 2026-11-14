import { Module } from '@nestjs/common';
import { AsaasModule } from '../asaas/asaas.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingController } from './billing.controller';
import { BillingPaymentsService } from './billing-payments.service';
import { BillingService } from './billing.service';
import { EntitlementsService } from './entitlements.service';

@Module({
  imports: [PrismaModule, AsaasModule],
  controllers: [BillingController],
  providers: [EntitlementsService, BillingService, BillingPaymentsService],
  exports: [EntitlementsService, BillingService, BillingPaymentsService],
})
export class BillingModule {}
