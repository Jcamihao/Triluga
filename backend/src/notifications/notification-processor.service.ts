import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { CacheQueueService } from '../cache-queue/cache-queue.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationProcessorService implements OnModuleInit {
  private readonly logger = new Logger(NotificationProcessorService.name);

  constructor(
    private readonly cacheQueue: CacheQueueService,
    private readonly email: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.cacheQueue.setNotificationProcessor(this.process.bind(this));
  }

  private async process(job: Job) {
    if (job.name !== 'notification.deliver') {
      return;
    }

    const { notificationId } = job.data as {
      notificationId: string;
      userId: string;
    };

    try {
      const notification = await this.prisma.notification.findUnique({
        where: { id: notificationId },
        include: { user: { include: { profile: true } } },
      });

      if (!notification?.user?.profile) {
        this.logger.warn(
          `notification_processor_skip notificationId=${notificationId} reason=no_user_profile`,
        );
        return;
      }

      const { user } = notification;
      const fullName = user.profile.fullName;
      const to = user.email;

      switch (notification.type) {
        case 'CHAT_MESSAGE': {
          const meta = notification.metadata as Record<string, string> | null;
          if (meta?.conversationId) {
            await this.email.sendChatNotification(
              to,
              fullName,
              notification.message,
              meta.conversationId,
            );
          }
          break;
        }

        case 'REVIEW_CREATED':
          break;

        case 'SYSTEM_ALERT': {
          const meta = notification.metadata as Record<string, string> | null;
          if (
            meta?.emailType === 'search_alert_match' &&
            meta.vehicleSlug &&
            meta.vehicleTitle &&
            meta.alertTitle
          ) {
            await this.email.sendSearchAlertMatch(
              to,
              fullName,
              meta.alertTitle,
              meta.vehicleTitle,
              meta.vehicleSlug,
            );
          }
          break;
        }

        default:
          this.logger.debug(
            `notification_processor_unhandled type=${notification.type}`,
          );
      }
    } catch (error) {
      this.logger.error(
        `notification_processor_error notificationId=${notificationId} error=${(error as Error).message}`,
      );
      throw error; // Re-throw para BullMQ marcar como failed e permitir retry
    }
  }
}
