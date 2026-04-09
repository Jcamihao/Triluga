import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TrackVehicleVisitDto {
  @IsString()
  @MaxLength(120)
  visitorId: string;

  @IsString()
  @MaxLength(255)
  path: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  referrer?: string;
}
