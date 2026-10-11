import { Module } from '@nestjs/common';
import { AsaasClient } from './asaas.client';
import { FeaturedController } from './featured.controller';
import { FeaturedService } from './featured.service';

@Module({
  controllers: [FeaturedController],
  providers: [FeaturedService, AsaasClient],
  exports: [FeaturedService],
})
export class FeaturedModule {}
