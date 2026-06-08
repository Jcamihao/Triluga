import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { NotificationProcessorService } from './notification-processor.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [EmailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationProcessorService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
