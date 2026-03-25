import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AnalyticsPeriod, AnalyticsService } from './analytics.service';
import { TrackSiteVisitDto } from './dto/track-site-visit.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Public()
  @Post('visits')
  trackVisit(
    @Body() dto: TrackSiteVisitDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.analyticsService.trackSiteVisit(dto, userAgent);
  }

  @Roles(Role.ADMIN)
  @Get('summary')
  getSummary(@Query('period') period?: AnalyticsPeriod) {
    return this.analyticsService.getSummary(period ?? 'all');
  }
}
