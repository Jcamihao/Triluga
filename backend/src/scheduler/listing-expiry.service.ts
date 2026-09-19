import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FeaturedOrderStatus } from '@prisma/client';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ListingExpiryService {
  private readonly logger = new Logger(ListingExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

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
      owner: { email: string; profile: { fullName: string } | null } | null;
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
        owner: {
          select: {
            email: true,
            profile: { select: { fullName: true } },
          },
        },
      },
    });

    let emailsSent = 0;

    for (const vehicle of expiring) {
      const dateKey = vehicle.expiresAt?.toISOString().split('T')[0];
      const notifId = `expiry-notif-${vehicle.id}-${dateKey}`;

      // Verifica se a notificação já foi enviada hoje para não duplicar e-mail
      const existing = await (this.prisma.notification as any).findUnique({
        where: { id: notifId },
        select: { id: true },
      });

      await (this.prisma.notification as any).upsert({
        where: { id: notifId },
        create: {
          id: notifId,
          userId: vehicle.ownerId,
          type: 'LISTING_EXPIRING',
          title: 'Seu anúncio está expirando',
          message: `"${vehicle.title}" expira em ${vehicle.expiresAt?.toLocaleDateString('pt-BR')}. Renove para continuar recebendo contatos.`,
          metadata: { vehicleId: vehicle.id },
        },
        update: {},
      });

      // Só envia e-mail quando a notificação foi criada agora (não já existia)
      if (!existing && vehicle.expiresAt && vehicle.owner?.profile?.fullName) {
        this.emailService
          .sendListingExpiring(
            vehicle.owner.email,
            vehicle.owner.profile.fullName,
            vehicle.title,
            vehicle.expiresAt,
          )
          .catch((err: Error) =>
            this.logger.error(
              `listing_expiry_email_failed vehicleId=${vehicle.id} error=${err.message}`,
            ),
          );
        emailsSent++;
      }
    }

    if (expiring.length > 0) {
      this.logger.log(
        `listings_expiry_notified count=${expiring.length} emails_sent=${emailsSent}`,
      );
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
