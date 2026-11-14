import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class CreateCheckoutDto {
  @ApiProperty({ enum: ['PROFESSIONAL', 'FLEET'] })
  @IsIn(['PROFESSIONAL', 'FLEET'])
  plan!: 'PROFESSIONAL' | 'FLEET';

  @ApiProperty({ enum: ['MONTHLY', 'YEARLY'] })
  @IsIn(['MONTHLY', 'YEARLY'])
  interval!: 'MONTHLY' | 'YEARLY';
}
