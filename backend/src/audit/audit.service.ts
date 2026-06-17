import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    adminId: string,
    action: string,
    targetType: string,
    targetId: string,
    details?: object,
  ) {
    return this.prisma.auditLog.create({
      data: { adminId, action, targetType, targetId, details: details ?? {} },
    });
  }

  async getLogs(page = 1, limit = 50) {
    const [total, items] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          details: true,
          createdAt: true,
          admin: { select: { id: true, email: true } },
        },
      }),
    ]);
    return { total, page, limit, items };
  }
}
