import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SearchAlertsController } from './search-alerts.controller';
import { SearchAlertsService } from './search-alerts.service';

@Module({
  imports: [NotificationsModule],
  controllers: [SearchAlertsController],
  providers: [SearchAlertsService],
  exports: [SearchAlertsService],
})
export class SearchAlertsModule {}
