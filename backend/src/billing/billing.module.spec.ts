import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AsaasClient } from '../asaas/asaas.client';
import { billingConfig } from '../config/billing.config';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { BillingModule } from './billing.module';
import { BillingPaymentsService } from './billing-payments.service';
import { EntitlementsService } from './entitlements.service';

describe('BillingModule (injeção de dependência)', () => {
  it('resolve EntitlementsService e BillingPaymentsService com Prisma, Asaas e ConfigService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [billingConfig],
        }),
        PrismaModule,
        BillingModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({ subscription: {}, vehicle: { count: jest.fn() } })
      .overrideProvider(AsaasClient)
      .useValue({})
      .compile();

    expect(moduleRef.get(EntitlementsService)).toBeInstanceOf(
      EntitlementsService,
    );
    expect(moduleRef.get(BillingPaymentsService)).toBeInstanceOf(
      BillingPaymentsService,
    );
    await moduleRef.close();
  });
});
