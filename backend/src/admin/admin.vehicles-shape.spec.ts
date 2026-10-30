import { CacheQueueService } from '../cache-queue/cache-queue.service';
import { EmailService } from '../email/email.service';
import { PrivacyService } from '../privacy/privacy.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

describe('AdminService.getVehicles (campos de preço)', () => {
  // Entidade como o Prisma devolve: diária em string (Decimal), sem weeklyRate.
  const entity = (minRentalDays: number | null) => ({
    id: 'vehicle-1',
    title: 'Gol 1.0',
    dailyRate: '100.00',
    minRentalDays,
    owner: { id: 'owner-1', profile: null },
    images: [],
  });

  const build = (items: unknown[]) => {
    const prisma = {
      vehicle: {
        count: jest.fn().mockResolvedValue(items.length),
        findMany: jest.fn().mockResolvedValue(items),
      },
    };
    return new AdminService(
      prisma as unknown as PrismaService,
      {} as CacheQueueService,
      {} as PrivacyService,
      {} as EmailService,
    );
  };

  it('devolve o bloco de preço e mantém os demais campos', async () => {
    const result = await build([entity(30), entity(null)]).getVehicles();

    expect(result.total).toBe(2);
    expect(result.items[0]).toMatchObject({
      id: 'vehicle-1',
      title: 'Gol 1.0',
      owner: { id: 'owner-1', profile: null },
      images: [],
      dailyRate: 100,
      weeklyRate: 700,
      weeklyEstimate: 700,
      monthlyEstimate: 3000,
      minRentalDays: 30,
      minPeriodTotal: 3000,
    });
    expect(result.items[1]).toMatchObject({
      dailyRate: 100,
      weeklyEstimate: 700,
      minRentalDays: null,
      minPeriodTotal: null,
    });
  });
});
