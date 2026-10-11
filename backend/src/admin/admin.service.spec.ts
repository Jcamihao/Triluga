import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CacheQueueService } from '../cache-queue/cache-queue.service';
import { EmailService } from '../email/email.service';
import { PrivacyService } from '../privacy/privacy.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

describe('AdminService.activateFeaturedOrder', () => {
  const order = (status: string) => ({
    id: 'order-1',
    vehicleId: 'vehicle-1',
    durationDays: 7,
    status,
    vehicle: { id: 'vehicle-1', title: 'Civic' },
    user: { email: 'a@b.c', profile: { fullName: 'Ana' } },
  });

  const build = (found: unknown) => {
    const prisma = {
      featuredOrder: {
        findUnique: jest.fn().mockResolvedValue(found),
        update: jest.fn().mockReturnValue('order-update'),
      },
      vehicle: { update: jest.fn().mockReturnValue('vehicle-update') },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const email = {
      sendFeaturedOrderActivated: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminService(
      prisma as unknown as PrismaService,
      {} as CacheQueueService,
      {} as PrivacyService,
      email as unknown as EmailService,
    );
    return { service, prisma, email };
  };

  it('activates a PENDING order, updates the vehicle and sends the email', async () => {
    const { service, prisma, email } = build(order('PENDING'));

    const result = await service.activateFeaturedOrder('order-1');

    expect(result.success).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.featuredOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
    expect(prisma.vehicle.update).toHaveBeenCalledTimes(1);
    expect(email.sendFeaturedOrderActivated).toHaveBeenCalledTimes(1);
  });

  it.each(['ACTIVE', 'EXPIRED', 'CANCELLED'])(
    'rejects a %s order with 400 and changes nothing',
    async (status) => {
      const { service, prisma, email } = build(order(status));

      await expect(service.activateFeaturedOrder('order-1')).rejects.toThrow(
        new BadRequestException(
          'Somente pedidos pendentes podem ser ativados.',
        ),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(email.sendFeaturedOrderActivated).not.toHaveBeenCalled();
    },
  );

  it('returns 404 for an unknown order', async () => {
    const { service } = build(null);
    await expect(service.activateFeaturedOrder('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
