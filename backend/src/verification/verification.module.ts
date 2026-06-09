import { Module } from '@nestjs/common';
import { AiVerificationService } from './ai-verification.service';
import { OcrService } from './ocr.service';

@Module({
  providers: [OcrService, AiVerificationService],
  exports: [OcrService, AiVerificationService],
})
export class VerificationModule {}
