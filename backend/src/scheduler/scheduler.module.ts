import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ListingExpiryService } from './listing-expiry.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [ListingExpiryService],
})
export class SchedulerModule {}
