import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrivacyRequestStatus, Role } from '@prisma/client';
import {
  AnalyticsPeriod,
  AnalyticsService,
} from '../analytics/analytics.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ReportsService } from '../reports/reports.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly vehiclesService: VehiclesService,
    private readonly reportsService: ReportsService,
    private readonly analyticsService: AnalyticsService,
    private readonly auditService: AuditService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Resumo administrativo básico do sistema' })
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('overview')
  @ApiOperation({ summary: 'Visão geral do app — analytics + audit log' })
  async getOverview(@Query('period') period?: AnalyticsPeriod) {
    const [
      analytics,
      audit,
      openReports,
      recentVehicles,
      recentUsers,
      pendingFeatured,
    ] = await Promise.all([
      this.analyticsService.getSummary(period ?? '7d'),
      this.auditService.getLogs(1, 30),
      this.reportsService.getOpenReportsCount(),
      this.adminService.getRecentVehicles(5),
      this.adminService.getRecentUsers(5),
      this.adminService.getPendingFeaturedCount(),
    ]);

    return {
      analytics,
      audit,
      openReports,
      recentVehicles,
      recentUsers,
      pendingFeatured,
    };
  }

  @Get('users')
  @ApiOperation({ summary: 'Lista usuários da plataforma' })
  getUsers(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.getUsers(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('vehicles')
  @ApiOperation({ summary: 'Lista veículos da plataforma' })
  getVehicles(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.getVehicles(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('users/:id/verification-file')
  @ApiOperation({
    summary: 'Gera uma URL temporária para o documento ou CNH de um usuário',
  })
  getUserVerificationFileUrl(
    @Param('id') userId: string,
    @Query('type') type: 'document' | 'driverLicense' | 'selfie',
  ) {
    return this.adminService.getUserVerificationFileUrl(userId, type);
  }

  @Get('privacy/requests')
  @ApiOperation({
    summary: 'Lista solicitações LGPD para tratamento administrativo',
  })
  getPrivacyRequests() {
    return this.adminService.getPrivacyRequests();
  }

  @Patch('privacy/requests/:id')
  @ApiOperation({ summary: 'Atualiza o status de uma solicitação LGPD' })
  updatePrivacyRequest(
    @Param('id') requestId: string,
    @Body()
    dto: {
      status: PrivacyRequestStatus;
      resolutionNotes?: string;
    },
  ) {
    return this.adminService.updatePrivacyRequest(
      requestId,
      dto.status,
      dto.resolutionNotes,
    );
  }

  @Patch('users/:id/block')
  @ApiOperation({ summary: 'Bloqueia um usuário' })
  async blockUser(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') userId: string,
  ) {
    const result = await this.adminService.blockUser(userId);
    await this.auditService.log(admin.sub, 'user_blocked', 'User', userId);
    return result;
  }

  @Delete('users/:id')
  @ApiOperation({
    summary: 'Exclui permanentemente um usuário e todos os seus dados',
  })
  async deleteUser(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') userId: string,
  ) {
    if (userId === admin.sub) {
      throw new BadRequestException(
        'Não é possível excluir a própria conta pelo painel.',
      );
    }
    const result = await this.adminService.deleteUser(userId);
    await this.auditService.log(admin.sub, 'user_deleted', 'User', userId);
    return result;
  }

  @Patch('users/:id/document/approve')
  @ApiOperation({ summary: 'Aprova o documento enviado pelo usuário' })
  async approveUserDocument(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') userId: string,
  ) {
    const result = await this.adminService.approveUserDocument(userId);
    await this.auditService.log(admin.sub, 'document_approved', 'User', userId);
    return result;
  }

  @Patch('users/:id/document/reject')
  @ApiOperation({ summary: 'Recusa o documento enviado pelo usuário' })
  async rejectUserDocument(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') userId: string,
  ) {
    const result = await this.adminService.rejectUserDocument(userId);
    await this.auditService.log(admin.sub, 'document_rejected', 'User', userId);
    return result;
  }

  @Patch('users/:id/driver-license/approve')
  @ApiOperation({ summary: 'Aprova a CNH enviada pelo usuário' })
  async approveUserDriverLicense(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') userId: string,
  ) {
    const result = await this.adminService.approveUserDriverLicense(userId);
    await this.auditService.log(
      admin.sub,
      'driver_license_approved',
      'User',
      userId,
    );
    return result;
  }

  @Patch('users/:id/driver-license/reject')
  @ApiOperation({ summary: 'Recusa a CNH enviada pelo usuário' })
  async rejectUserDriverLicense(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') userId: string,
  ) {
    const result = await this.adminService.rejectUserDriverLicense(userId);
    await this.auditService.log(
      admin.sub,
      'driver_license_rejected',
      'User',
      userId,
    );
    return result;
  }

  @Patch('vehicles/:id/deactivate')
  @ApiOperation({ summary: 'Desativa um veículo' })
  async deactivateVehicle(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') vehicleId: string,
  ) {
    const result = await this.adminService.deactivateVehicle(vehicleId);
    await this.auditService.log(
      admin.sub,
      'vehicle_deactivated',
      'Vehicle',
      vehicleId,
    );
    return result;
  }

  @Delete('vehicles/:id')
  @ApiOperation({ summary: 'Exclui permanentemente um veículo' })
  async deleteVehicle(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') vehicleId: string,
  ) {
    const result = await this.adminService.deleteVehicle(vehicleId);
    await this.auditService.log(
      admin.sub,
      'vehicle_deleted',
      'Vehicle',
      vehicleId,
    );
    return result;
  }

  @Patch('vehicles/:id/feature')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Define destaque de um veículo' })
  featureVehicle(
    @Param('id') vehicleId: string,
    @Body() body: { featured: boolean; daysCount?: number },
  ) {
    return this.vehiclesService.setFeatured(
      vehicleId,
      body.featured,
      body.daysCount,
    );
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Lista paginada do log de auditoria' })
  getAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.getLogs(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('featured-orders')
  @ApiOperation({ summary: 'Lista pedidos de destaque' })
  getFeaturedOrders(@Query('status') status?: string) {
    return this.adminService.getFeaturedOrders(status);
  }

  @Patch('featured-orders/:id/activate')
  @ApiOperation({ summary: 'Ativa manualmente um pedido de destaque pendente' })
  activateFeaturedOrder(@Param('id') orderId: string) {
    return this.adminService.activateFeaturedOrder(orderId);
  }

  @Get('reports')
  @ApiOperation({ summary: 'Lista reports de anúncios' })
  getReports(@Query('status') status?: string, @Query('page') page?: string) {
    return this.reportsService.getAdminReports(
      status,
      page ? parseInt(page, 10) : 1,
    );
  }

  @Get('reports/count')
  @ApiOperation({ summary: 'Conta reports abertos/em revisão' })
  getOpenReportsCount() {
    return this.reportsService.getOpenReportsCount();
  }

  @Patch('reports/:id/resolve')
  @ApiOperation({ summary: 'Resolve ou descarta um report' })
  resolveReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') reportId: string,
    @Body() body: { action: 'DISMISS' | 'RESOLVE'; adminNotes?: string },
  ) {
    return this.reportsService.resolveReport(
      user.sub,
      reportId,
      body.action,
      body.adminNotes,
    );
  }
}
