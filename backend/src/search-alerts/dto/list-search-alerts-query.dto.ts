import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsOptional } from 'class-validator';

export class ListSearchAlertsQueryDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBooleanString()
  includeInactive?: string;
}
