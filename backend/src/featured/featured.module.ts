import { Module } from '@nestjs/common';
import { AsaasModule } from '../asaas/asaas.module';
import { FeaturedController } from './featured.controller';
import { FeaturedService } from './featured.service';

@Module({
  imports: [AsaasModule],
  controllers: [FeaturedController],
  providers: [FeaturedService],
  exports: [FeaturedService],
})
export class FeaturedModule {}
