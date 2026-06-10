import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FeaturedOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ListingExpiryService {
  private readonly logger = new Logger(ListingExpiryService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async expireListings() {
    const result = await (this.prisma.vehicle as any).updateMany({
      where: {
        expiresAt: { lte: new Date() },
        isActive: true,
      },
      data: { isActive: false },
    });

    if (result.count > 0) {
      this.logger.log(`listings_expired count=${result.count}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async notifyExpiringListings() {
    const in3Days = new Date();
    in3Days.setDate(in3Days.getDate() + 3);

    const expiring: Array<{
      id: string;
      title: string;
      expiresAt: Date | null;
      ownerId: string;
    }> = await (this.prisma.vehicle as any).findMany({
      where: {
        expiresAt: { lte: in3Days, gt: new Date() },
        isActive: true,
        isPublished: true,
      },
      select: {
        id: true,
        title: true,
        expiresAt: true,
        ownerId: true,
      },
    });

    for (const vehicle of expiring) {
      const dateKey = vehicle.expiresAt?.toISOString().split('T')[0];
      await (this.prisma.notification as any).upsert({
        where: {
          id: `expiry-notif-${vehicle.id}-${dateKey}`,
        },
        create: {
          id: `expiry-notif-${vehicle.id}-${dateKey}`,
          userId: vehicle.ownerId,
          type: 'LISTING_EXPIRING',
          title: 'Seu anúncio está expirando',
          message: `"${vehicle.title}" expira em ${vehicle.expiresAt?.toLocaleDateString('pt-BR')}. Renove para continuar recebendo contatos.`,
          metadata: { vehicleId: vehicle.id },
        },
        update: {},
      });
    }

    if (expiring.length > 0) {
      this.logger.log(`listings_expiry_notified count=${expiring.length}`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cancelStalePendingOrders() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await this.prisma.featuredOrder.updateMany({
      where: {
        status: FeaturedOrderStatus.PENDING,
        createdAt: { lt: cutoff },
      },
      data: { status: FeaturedOrderStatus.CANCELLED },
    });

    if (result.count > 0) {
      this.logger.log(`featured_orders_cancelled_stale count=${result.count}`);
    }
  }
}
