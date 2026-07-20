import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { FeaturedController } from './featured.controller';
import { FeaturedService } from './featured.service';
import { EfipayService } from './efipay.service';

@Module({
  imports: [EmailModule],
  controllers: [FeaturedController],
  providers: [FeaturedService, EfipayService],
  exports: [FeaturedService],
})
export class FeaturedModule {}
