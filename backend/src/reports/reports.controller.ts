import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Role } from '@prisma/client';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  createReport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReportDto,
  ) {
    return this.reportsService.createReport(user.sub, dto);
  }

  @Get('admin')
  @Roles(Role.ADMIN)
  getAdminReports(
    @Query('status') status?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.reportsService.getAdminReports(status, +page, +limit);
  }

  @Patch('admin/:id/resolve')
  @Roles(Role.ADMIN)
  resolveReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { action: 'DISMISS' | 'RESOLVE'; adminNotes?: string },
  ) {
    return this.reportsService.resolveReport(
      user.sub,
      id,
      body.action,
      body.adminNotes,
    );
  }
}
