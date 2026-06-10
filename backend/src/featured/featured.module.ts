import { Module } from '@nestjs/common';
import { FeaturedController } from './featured.controller';
import { FeaturedService } from './featured.service';
import { EfipayService } from './efipay.service';

@Module({
  controllers: [FeaturedController],
  providers: [FeaturedService, EfipayService],
  exports: [FeaturedService],
})
export class FeaturedModule {}
