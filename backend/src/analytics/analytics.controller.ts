import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ANALYTICS_THROTTLE } from '../common/constants/throttle-limits.constants';
import { AnalyticsPeriod, AnalyticsService } from './analytics.service';
import { GetMostViewedVehiclesQueryDto } from './dto/get-most-viewed-vehicles-query.dto';
import { TrackSiteVisitDto } from './dto/track-site-visit.dto';
import { TrackVehicleViewDto } from './dto/track-vehicle-view.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Public()
  @Post('visits')
  @Throttle(ANALYTICS_THROTTLE)
  trackVisit(
    @Body() dto: TrackSiteVisitDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.analyticsService.trackSiteVisit(dto, userAgent);
  }

  @Public()
  @Post('vehicle-views')
  @Throttle(ANALYTICS_THROTTLE)
  trackVehicleView(
    @Body() dto: TrackVehicleViewDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.analyticsService.trackVehicleView(dto, userAgent);
  }

  @Public()
  @Get('vehicles/most-viewed')
  getMostViewedVehicles(@Query() query: GetMostViewedVehiclesQueryDto) {
    return this.analyticsService.getMostViewedVehicles({
      period: query.period ?? '30d',
      limit: query.limit ?? 8,
    });
  }

  @Roles(Role.ADMIN)
  @Get('summary')
  getSummary(@Query('period') period?: AnalyticsPeriod) {
    return this.analyticsService.getSummary(period ?? 'all');
  }
}
