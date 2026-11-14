import { Module } from '@nestjs/common';
import { AsaasClient } from './asaas.client';

@Module({
  providers: [AsaasClient],
  exports: [AsaasClient],
})
export class AsaasModule {}
