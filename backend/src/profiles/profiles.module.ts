import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { VerificationModule } from '../verification/verification.module';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  imports: [StorageModule, VerificationModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
