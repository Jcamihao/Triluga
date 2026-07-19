import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EmailModule } from '../email/email.module';
import { ListingExpiryService } from './listing-expiry.service';

@Module({
  imports: [ScheduleModule.forRoot(), EmailModule],
  providers: [ListingExpiryService],
})
export class SchedulerModule {}
