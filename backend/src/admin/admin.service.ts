import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PrivacyRequestStatus,
  UserStatus,
  VerificationStatus,
} from '@prisma/client';
import { CacheQueueService } from '../cache-queue/cache-queue.service';
import { PrivacyService } from '../privacy/privacy.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheQueueService: CacheQueueService,
    private readonly profilesService: ProfilesService,
    private readonly privacyService: PrivacyService,
  ) {}

  async getDashboard() {
    const [users, vehicles, privacyRequests] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.vehicle.count(),
      this.prisma.privacyRequest.count(),
    ]);

    return {
      totals: {
        users,
        vehicles,
        privacyRequests,
      },
    };
  }

  async getUsers(page = 1, limit = 50) {
    const safeLimit = Math.min(limit, 100);
    const [total, users] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        include: {
          profile: {
            select: {
              fullName: true,
              city: true,
              state: true,
              avatarUrl: true,
              documentVerificationStatus: true,
              driverLicenseVerification: true,
              documentImageUrl: true,
              driverLicenseImageUrl: true,
              selfieImageUrl: true,
              documentOcrText: true,
              cnhOcrText: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * safeLimit,
        take: safeLimit,
      }),
    ]);

    return {
      total,
      page,
      limit: safeLimit,
      items: users.map((user) => ({
        ...user,
        profile: user.profile
          ? {
              fullName: user.profile.fullName,
              city: user.profile.city,
              state: user.profile.state,
              avatarUrl: user.profile.avatarUrl,
              documentVerificationStatus: user.profile.documentVerificationStatus,
              driverLicenseVerification: user.profile.driverLicenseVerification,
              hasDocumentImage: !!user.profile.documentImageUrl,
              hasDriverLicenseImage: !!user.profile.driverLicenseImageUrl,
              hasSelfieImage: !!user.profile.selfieImageUrl,
              documentOcrText: user.profile.documentOcrText ?? null,
              cnhOcrText: user.profile.cnhOcrText ?? null,
            }
          : null,
      })),
    };
  }

  async getVehicles(page = 1, limit = 50) {
    const safeLimit = Math.min(limit, 100);
    const [total, items] = await Promise.all([
      this.prisma.vehicle.count(),
      this.prisma.vehicle.findMany({
        include: {
          owner: { include: { profile: true } },
          images: { orderBy: { position: 'asc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * safeLimit,
        take: safeLimit,
      }),
    ]);

    return { total, page, limit: safeLimit, items };
  }

  async blockUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.BLOCKED },
      include: { profile: true },
    });
  }

  async deleteUser(userId: string) {
    await this.cacheQueueService.invalidateByPrefix('vehicles:list:');
    return this.prisma.user.delete({ where: { id: userId } });
  }

  async approveUserDocument(userId: string) {
    return this.updateVerificationStatus(
      userId,
      'documentVerificationStatus',
      VerificationStatus.APPROVED,
    );
  }

  async rejectUserDocument(userId: string) {
    return this.updateVerificationStatus(
      userId,
      'documentVerificationStatus',
      VerificationStatus.REJECTED,
    );
  }

  async approveUserDriverLicense(userId: string) {
    return this.updateVerificationStatus(
      userId,
      'driverLicenseVerification',
      VerificationStatus.APPROVED,
    );
  }

  async rejectUserDriverLicense(userId: string) {
    return this.updateVerificationStatus(
      userId,
      'driverLicenseVerification',
      VerificationStatus.REJECTED,
    );
  }

  async deactivateVehicle(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        isActive: false,
        isPublished: false,
      },
    });

    await this.cacheQueueService.del(`vehicles:detail:${vehicleId}`);
    await this.cacheQueueService.invalidateByPrefix('vehicles:list:');

    return vehicle;
  }

  async deleteVehicle(vehicleId: string) {
    await this.cacheQueueService.del(`vehicles:detail:${vehicleId}`);
    await this.cacheQueueService.invalidateByPrefix('vehicles:list:');
    return this.prisma.vehicle.delete({ where: { id: vehicleId } });
  }

  async getUserVerificationFileUrl(
    userId: string,
    type: 'document' | 'driverLicense' | 'selfie',
  ) {
    return this.profilesService.getVerificationFileUrl(userId, type);
  }

  async getPrivacyRequests() {
    return this.privacyService.getAdminRequests();
  }

  async updatePrivacyRequest(
    requestId: string,
    status: PrivacyRequestStatus,
    resolutionNotes?: string,
  ) {
    return this.privacyService.updateRequestStatus({
      requestId,
      status,
      resolutionNotes,
    });
  }

  private async updateVerificationStatus(
    userId: string,
    field: 'documentVerificationStatus' | 'driverLicenseVerification',
    status: VerificationStatus,
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Perfil do usuário não encontrado.');
    }

    return this.prisma.profile.update({
      where: { userId },
      data: {
        [field]: status,
      },
    });
  }

  async getFeaturedOrders(status?: string) {
    return this.prisma.featuredOrder.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        vehicle: { select: { id: true, title: true } },
        user: { select: { id: true, email: true } },
      },
    });
  }

  async activateFeaturedOrder(orderId: string) {
    const order = await this.prisma.featuredOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const expiresAt = new Date(
      Date.now() + order.durationDays * 24 * 60 * 60 * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.featuredOrder.update({
        where: { id: orderId },
        data: { status: 'ACTIVE', activatedAt: new Date(), expiresAt },
      }),
      this.prisma.vehicle.update({
        where: { id: order.vehicleId },
        data: { isFeatured: true, featuredUntil: expiresAt } as any,
      }),
    ]);

    return { success: true, expiresAt };
  }

  async getRecentVehicles(limit = 5) {
    return this.prisma.vehicle.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, title: true, brand: true, model: true, year: true,
        city: true, state: true, isActive: true, isPublished: true, createdAt: true,
        owner: { select: { id: true, email: true, profile: { select: { fullName: true } } } },
      },
    });
  }

  async getRecentUsers(limit = 5) {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, email: true, role: true, status: true, createdAt: true,
        profile: { select: { fullName: true, city: true, state: true } },
      },
    });
  }

  async getPendingFeaturedCount() {
    return this.prisma.featuredOrder.count({ where: { status: 'PENDING' } });
  }
}
