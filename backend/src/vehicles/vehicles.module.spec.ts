import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { BillingModule } from '../billing/billing.module';
import { EntitlementsService } from '../billing/entitlements.service';
import { CacheQueueModule } from '../cache-queue/cache-queue.module';
import { CacheQueueService } from '../cache-queue/cache-queue.service';
import { billingConfig } from '../config/billing.config';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { VehiclesModule } from './vehicles.module';
import { VehiclesService } from './vehicles.service';

describe('Injeção de dependência do limite de plano', () => {
  const prismaMock = { vehicle: { count: jest.fn() } };

  it('BillingModule resolve EntitlementsService com Prisma e ConfigService', async () => {
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
      .useValue(prismaMock)
      .compile();

    expect(moduleRef.get(EntitlementsService)).toBeInstanceOf(
      EntitlementsService,
    );
    await moduleRef.close();
  });

  it('VehiclesModule resolve VehiclesService com EntitlementsService injetado', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [billingConfig],
        }),
        PrismaModule,
        CacheQueueModule,
        VehiclesModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(CacheQueueService)
      .useValue({})
      .compile();

    expect(moduleRef.get(VehiclesService)).toBeInstanceOf(VehiclesService);
    expect(
      moduleRef.get(EntitlementsService, { strict: false }),
    ).toBeInstanceOf(EntitlementsService);
    await moduleRef.close();
  });
});
