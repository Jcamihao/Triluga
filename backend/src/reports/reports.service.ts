import { BadRequestException, Injectable } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async createReport(reporterId: string, dto: CreateReportDto) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: dto.vehicleId },
      select: { id: true, ownerId: true, title: true },
    });
    if (!vehicle) throw new BadRequestException('Anúncio não encontrado.');
    if (vehicle.ownerId === reporterId)
      throw new BadRequestException('Você não pode denunciar seu próprio anúncio.');

    const existing = await this.prisma.report.findFirst({
      where: { vehicleId: dto.vehicleId, reporterId, status: { in: ['OPEN', 'REVIEWING'] } },
    });
    if (existing) throw new BadRequestException('Você já denunciou este anúncio.');

    const reporter = await this.prisma.user.findUnique({
      where: { id: reporterId },
      select: { email: true },
    });

    const report = await this.prisma.report.create({
      data: { vehicleId: dto.vehicleId, reporterId, reason: dto.reason, description: dto.description },
      select: { id: true, reason: true, status: true, createdAt: true },
    });

    this.email
      .sendNewReportAlert({
        vehicleTitle: vehicle.title,
        vehicleId: vehicle.id,
        reason: dto.reason,
        reporterEmail: reporter?.email ?? 'desconhecido',
      })
      .catch(() => {});

    return report;
  }

  async getAdminReports(status?: string, page = 1, limit = 20) {
    const where = status ? { status: status as any } : {};
    const [total, items] = await Promise.all([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, reason: true, description: true, status: true, adminNotes: true,
          createdAt: true, resolvedAt: true,
          vehicle: { select: { id: true, title: true, brand: true, model: true } },
          reporter: { select: { id: true, email: true, profile: { select: { fullName: true } } } },
          resolvedBy: { select: { id: true, email: true } },
        },
      }),
    ]);
    return { total, page, limit, items };
  }

  async getOpenReportsCount() {
    return this.prisma.report.count({ where: { status: { in: ['OPEN', 'REVIEWING'] } } });
  }

  async resolveReport(adminId: string, reportId: string, action: 'DISMISS' | 'RESOLVE', adminNotes?: string) {
    const report = await this.prisma.report.findUniqueOrThrow({ where: { id: reportId } });
    const newStatus = action === 'DISMISS' ? 'DISMISSED' : 'RESOLVED';

    await this.prisma.report.update({
      where: { id: reportId },
      data: { status: newStatus as any, resolvedById: adminId, resolvedAt: new Date(), adminNotes },
    });

    if (action === 'RESOLVE') {
      await this.prisma.vehicle.update({
        where: { id: report.vehicleId },
        data: { isActive: false, isPublished: false },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        adminId,
        action: `report_${action.toLowerCase()}`,
        targetType: 'Report',
        targetId: reportId,
        details: { vehicleId: report.vehicleId, adminNotes },
      },
    });

    return { success: true };
  }
}
