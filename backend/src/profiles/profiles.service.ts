import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UserStatus, VerificationStatus } from '@prisma/client';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AiVerificationService } from '../verification/ai-verification.service';
import { OcrService } from '../verification/ocr.service';
import * as http from 'node:http';
import * as https from 'node:https';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly ocrService: OcrService,
    private readonly aiVerification: AiVerificationService,
    private readonly emailService: EmailService,
  ) {}

  async getMyProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });

    return this.mapPrivateProfile(profile);
  }

  async getPublicProfile(userId: string) {
    const [
      user,
      reviewsAggregate,
      reviews,
      vehicles,
      averageResponseTimeLabel,
    ] = await Promise.all([
      this.prisma.user.findFirst({
        where: {
          id: userId,
          status: {
            not: UserStatus.BLOCKED,
          },
        },
        include: {
          profile: true,
        },
      }),
      this.prisma.userReview.aggregate({
        where: {
          targetUserId: userId,
        },
        _avg: {
          rating: true,
        },
        _count: {
          rating: true,
        },
      }),
      this.prisma.userReview.findMany({
        where: {
          targetUserId: userId,
        },
        include: {
          author: {
            include: {
              profile: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 12,
      }),
      this.prisma.vehicle.findMany({
        where: {
          ownerId: userId,
          isActive: true,
          isPublished: true,
        },
        include: {
          images: {
            orderBy: {
              position: 'asc',
            },
            take: 1,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.resolveAverageChatResponseTimeLabel(userId),
    ]);

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const documentStatus =
      user.profile?.documentVerificationStatus ??
      VerificationStatus.NOT_SUBMITTED;
    const driverLicenseStatus =
      user.profile?.driverLicenseVerification ??
      VerificationStatus.NOT_SUBMITTED;
    const ratingAverage = Number(
      (reviewsAggregate._avg.rating ?? 0).toFixed(1),
    );

    return {
      id: user.id,
      role: user.role,
      memberSince: user.createdAt,
      fullName:
        user.profile?.fullName?.trim() || user.email.split('@')[0] || 'Usuário',
      avatarUrl: user.profile?.avatarUrl ?? null,
      bio: user.profile?.bio ?? null,
      city: user.profile?.city ?? null,
      state: user.profile?.state ?? null,
      ratingAverage,
      reviewsCount: reviewsAggregate._count.rating,
      activeListingsCount: vehicles.length,
      responseTimeLabel: averageResponseTimeLabel,
      trustMetrics: {
        activeListingsCount: vehicles.length,
        reviewsCount: reviewsAggregate._count.rating,
        averageRating: ratingAverage,
      },
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment ?? null,
        createdAt: review.createdAt,
        author: {
          id: review.author.id,
          fullName: review.author.profile?.fullName?.trim() || 'Usuário',
          avatarUrl: review.author.profile?.avatarUrl ?? null,
          city: review.author.profile?.city ?? null,
          state: review.author.profile?.state ?? null,
        },
      })),
      verification: {
        documentStatus,
        driverLicenseStatus,
        profileStatus: this.resolveProfileVerificationStatus(
          documentStatus,
          driverLicenseStatus,
        ),
      },
      vehicles: vehicles.map((vehicle) => ({
        id: vehicle.id,
        title: vehicle.title,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        city: vehicle.city,
        state: vehicle.state,
        vehicleType: vehicle.vehicleType,
        category: vehicle.category,
        seats: vehicle.seats,
        transmission: vehicle.transmission,
        fuelType: vehicle.fuelType,
        dailyRate: Number(vehicle.dailyRate),
        weeklyRate: vehicle.weeklyRate ? Number(vehicle.weeklyRate) : null,
        motorcycleStyle: vehicle.motorcycleStyle,
        engineCc: vehicle.engineCc,
        hasAbs: vehicle.hasAbs,
        hasTopCase: vehicle.hasTopCase,
        latitude: vehicle.latitude ? Number(vehicle.latitude) : null,
        longitude: vehicle.longitude ? Number(vehicle.longitude) : null,
        ratingAverage: Number(vehicle.ratingAverage),
        reviewsCount: vehicle.reviewsCount,
        coverImage: vehicle.images[0]?.url ?? null,
        owner: {
          id: user.id,
          fullName: user.profile?.fullName ?? null,
          avatarUrl: user.profile?.avatarUrl ?? null,
          city: user.profile?.city ?? null,
          state: user.profile?.state ?? null,
          ratingAverage,
          reviewsCount: reviewsAggregate._count.rating,
        },
      })),
    };
  }

  async updateMyProfile(userId: string, dto: UpdateProfileDto) {
    const profile = await this.prisma.profile.upsert({
      where: { userId },
      update: dto,
      create: {
        userId,
        fullName: dto.fullName ?? '',
        phone: dto.phone ?? '',
        zipCode: dto.zipCode,
        addressLine: dto.addressLine,
        addressComplement: dto.addressComplement,
        city: dto.city ?? '',
        state: dto.state ?? '',
        bio: dto.bio,
        avatarUrl: dto.avatarUrl,
        documentNumber: dto.documentNumber,
        driverLicenseNumber: dto.driverLicenseNumber,
      },
    });

    return this.mapPrivateProfile(profile);
  }

  async uploadMyAvatar(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Selecione uma foto de perfil.');
    }

    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Envie um arquivo de imagem válido.');
    }

    const currentProfile = await this.prisma.profile.findUnique({
      where: { userId },
      select: {
        avatarUrl: true,
      },
    });

    const uploadedFile = await this.storageService.uploadPublicFile(
      file,
      'users',
    );

    const updatedProfile = await this.prisma.profile.upsert({
      where: { userId },
      update: {
        avatarUrl: uploadedFile.url,
      },
      create: {
        userId,
        fullName: '',
        phone: '',
        zipCode: null,
        addressLine: null,
        addressComplement: null,
        city: '',
        state: '',
        avatarUrl: uploadedFile.url,
      },
    });

    if (
      currentProfile?.avatarUrl &&
      currentProfile.avatarUrl !== uploadedFile.url
    ) {
      this.storageService
        .deletePublicFileByUrl(currentProfile.avatarUrl)
        .catch((error) => {
          this.logger.warn(
            `profile_avatar_cleanup_failed userId=${userId} message=${
              error instanceof Error ? error.message : 'Erro desconhecido'
            }`,
          );
        });
    }

    return this.mapPrivateProfile(updatedProfile);
  }

  async uploadMyDocument(userId: string, file: Express.Multer.File) {
    return this.uploadVerificationDocument(userId, file, 'document');
  }

  async uploadMyDriverLicense(userId: string, file: Express.Multer.File) {
    return this.uploadVerificationDocument(userId, file, 'driverLicense');
  }

  async getVerificationFileUrl(
    userId: string,
    type: 'document' | 'driverLicense' | 'selfie',
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: {
        documentImageUrl: true,
        driverLicenseImageUrl: true,
        selfieImageUrl: true,
      },
    });

    const storedValue =
      type === 'document'
        ? profile?.documentImageUrl
        : type === 'driverLicense'
          ? profile?.driverLicenseImageUrl
          : profile?.selfieImageUrl;

    if (!storedValue) {
      throw new NotFoundException('Arquivo de verificação não encontrado.');
    }

    const url = await this.storageService.getPrivateFileUrl(storedValue);

    return {
      url,
      generatedAt: new Date().toISOString(),
    };
  }

  private async resolveAverageChatResponseTimeLabel(
    userId: string,
  ): Promise<string | null> {
    const conversations = await this.prisma.chatConversation.findMany({
      where: {
        participants: {
          some: {
            userId,
          },
        },
        messages: {
          some: {
            senderId: {
              not: userId,
            },
          },
        },
      },
      select: {
        messages: {
          select: {
            senderId: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    const responseTimesMs: number[] = [];

    conversations.forEach((conversation) => {
      let pendingIncomingAt: Date | null = null;

      conversation.messages.forEach((message) => {
        if (message.senderId === userId) {
          if (!pendingIncomingAt) {
            return;
          }

          const responseTimeMs =
            message.createdAt.getTime() - pendingIncomingAt.getTime();

          if (responseTimeMs > 0) {
            responseTimesMs.push(responseTimeMs);
          }

          pendingIncomingAt = null;
          return;
        }

        pendingIncomingAt ??= message.createdAt;
      });
    });

    if (!responseTimesMs.length) {
      return null;
    }

    const averageMs =
      responseTimesMs.reduce((total, time) => total + time, 0) /
      responseTimesMs.length;

    return this.formatResponseTimeLabel(averageMs);
  }

  private formatResponseTimeLabel(milliseconds: number): string {
    const minuteMs = 1000 * 60;
    const hourMs = minuteMs * 60;
    const dayMs = hourMs * 24;

    if (milliseconds < minuteMs) {
      return 'menos de 1 minuto';
    }

    if (milliseconds < hourMs) {
      const minutes = Math.max(1, Math.round(milliseconds / minuteMs));
      return `~${minutes} minuto${minutes > 1 ? 's' : ''}`;
    }

    if (milliseconds < dayMs) {
      const hours = Math.max(1, Math.round(milliseconds / hourMs));
      return `~${hours} hora${hours > 1 ? 's' : ''}`;
    }

    const days = Math.max(1, Math.round(milliseconds / dayMs));
    return `~${days} dia${days > 1 ? 's' : ''}`;
  }

  private resolveProfileVerificationStatus(
    documentStatus: VerificationStatus,
    driverLicenseStatus: VerificationStatus,
  ) {
    if (
      documentStatus === VerificationStatus.APPROVED &&
      driverLicenseStatus === VerificationStatus.APPROVED
    ) {
      return VerificationStatus.APPROVED;
    }

    if (
      documentStatus === VerificationStatus.PENDING ||
      driverLicenseStatus === VerificationStatus.PENDING
    ) {
      return VerificationStatus.PENDING;
    }

    if (
      documentStatus === VerificationStatus.REJECTED ||
      driverLicenseStatus === VerificationStatus.REJECTED
    ) {
      return VerificationStatus.REJECTED;
    }

    return VerificationStatus.NOT_SUBMITTED;
  }

  private async uploadVerificationDocument(
    userId: string,
    file: Express.Multer.File,
    type: 'document' | 'driverLicense',
  ) {
    if (!file) {
      throw new BadRequestException('Selecione um arquivo para upload.');
    }

    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException(
        'Envie uma imagem válida para verificação.',
      );
    }

    const currentProfile = await this.prisma.profile.findUnique({
      where: { userId },
      select: {
        documentImageUrl: true,
        driverLicenseImageUrl: true,
      },
    });

    const uploadedFile = await this.storageService.uploadPrivateFile(
      file,
      'documents',
    );

    const previousFileUrl =
      type === 'document'
        ? currentProfile?.documentImageUrl
        : currentProfile?.driverLicenseImageUrl;

    if (previousFileUrl) {
      await this.storageService.deletePrivateFileByStoredValue(previousFileUrl);
    }

    const profile = await this.prisma.profile.upsert({
      where: { userId },
      update:
        type === 'document'
          ? {
              documentImageUrl: uploadedFile.key,
              documentVerificationStatus: VerificationStatus.PENDING,
            }
          : {
              driverLicenseImageUrl: uploadedFile.key,
              driverLicenseVerification: VerificationStatus.PENDING,
            },
      create:
        type === 'document'
          ? {
              userId,
              fullName: '',
              phone: '',
              zipCode: null,
              addressLine: null,
              addressComplement: null,
              city: '',
              state: '',
              documentImageUrl: uploadedFile.key,
              documentVerificationStatus: VerificationStatus.PENDING,
            }
          : {
              userId,
              fullName: '',
              phone: '',
              zipCode: null,
              addressLine: null,
              addressComplement: null,
              city: '',
              state: '',
              driverLicenseImageUrl: uploadedFile.key,
              driverLicenseVerification: VerificationStatus.PENDING,
            },
    });

    // Disparar OCR de forma não-blocking — falha não afeta a resposta
    this.runOcrForProfile(userId, uploadedFile.key, type).catch(() => {});

    return this.mapPrivateProfile(profile);
  }

  async uploadMySelfie(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Selecione uma imagem para a selfie.');
    }

    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Envie uma imagem válida.');
    }

    const currentProfile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { selfieImageUrl: true },
    });

    const uploaded = await this.storageService.uploadPrivateFile(
      file,
      'documents',
    );

    if (currentProfile?.selfieImageUrl) {
      await this.storageService
        .deletePrivateFileByStoredValue(currentProfile.selfieImageUrl)
        .catch(() => {});
    }

    await this.prisma.profile.upsert({
      where: { userId },
      update: { selfieImageUrl: uploaded.key },
      create: {
        userId,
        fullName: '',
        phone: '',
        city: '',
        state: '',
        selfieImageUrl: uploaded.key,
      },
    });

    // Após selfie, tenta verificação por IA se todos os documentos estiverem presentes
    this.runAiVerification(userId).catch((err) =>
      this.logger.error(
        `ai_verification_failed userId=${userId} error=${err?.message}`,
      ),
    );

    return { submitted: true };
  }

  async getMySelfieUrl(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { selfieImageUrl: true },
    });

    if (!profile?.selfieImageUrl) {
      throw new NotFoundException('Selfie não encontrada.');
    }

    const url = await this.storageService.getPrivateFileUrl(
      profile.selfieImageUrl,
    );

    return { url: typeof url === 'string' ? url : url };
  }

  private async runAiVerification(userId: string) {
    if (!this.aiVerification.isEnabled) return;

    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: {
        fullName: true,
        documentImageUrl: true,
        driverLicenseImageUrl: true,
        selfieImageUrl: true,
      },
    });

    if (
      !profile?.documentImageUrl ||
      !profile?.driverLicenseImageUrl ||
      !profile?.selfieImageUrl
    ) {
      return;
    }

    this.logger.log(`ai_verification_started userId=${userId}`);

    const [docUrl, cnhUrl, selfieUrl] = await Promise.all([
      this.storageService.getPrivateFileUrl(profile.documentImageUrl),
      this.storageService.getPrivateFileUrl(profile.driverLicenseImageUrl),
      this.storageService.getPrivateFileUrl(profile.selfieImageUrl),
    ]);

    const [docBuffer, cnhBuffer, selfieBuffer] = await Promise.all([
      this.downloadBuffer(String(docUrl)),
      this.downloadBuffer(String(cnhUrl)),
      this.downloadBuffer(String(selfieUrl)),
    ]);

    const result = await this.aiVerification.verifyKyc({
      documentBuffer: docBuffer,
      cnhBuffer: cnhBuffer,
      selfieBuffer: selfieBuffer,
      fullName: profile.fullName ?? '',
    });

    this.logger.log(
      `ai_verification_result userId=${userId} doc=${result.documentApproved} cnh=${result.cnhApproved} face=${result.faceMatch} reason="${result.reason}"`,
    );

    const docStatus =
      result.documentApproved && result.faceMatch
        ? VerificationStatus.APPROVED
        : VerificationStatus.REJECTED;

    const cnhStatus =
      result.cnhApproved && result.faceMatch
        ? VerificationStatus.APPROVED
        : VerificationStatus.REJECTED;

    await this.prisma.profile.update({
      where: { userId },
      data: {
        documentVerificationStatus: docStatus,
        driverLicenseVerification: cnhStatus,
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (user?.email) {
      const fullName = profile.fullName ?? 'Usuário';

      await Promise.allSettled([
        docStatus === VerificationStatus.APPROVED
          ? this.emailService.sendDocumentApproved(
              user.email,
              fullName,
              'document',
            )
          : this.emailService.sendDocumentRejected(
              user.email,
              fullName,
              'document',
              result.reason,
            ),
        cnhStatus === VerificationStatus.APPROVED
          ? this.emailService.sendDocumentApproved(
              user.email,
              fullName,
              'driver-license',
            )
          : this.emailService.sendDocumentRejected(
              user.email,
              fullName,
              'driver-license',
              result.reason,
            ),
      ]);
    }
  }

  private async runOcrForProfile(
    userId: string,
    fileKey: string,
    type: 'document' | 'driverLicense',
  ) {
    const tempUrlResult = await this.storageService.getPrivateFileUrl(fileKey);
    const tempUrl =
      typeof tempUrlResult === 'string' ? tempUrlResult : String(tempUrlResult);
    const buffer = await this.downloadBuffer(tempUrl);
    const text = await this.ocrService.extractText(buffer);

    await this.prisma.profile.update({
      where: { userId },
      data:
        type === 'document' ? { documentOcrText: text } : { cnhOcrText: text },
    });
  }

  private downloadBuffer(url: string): Promise<Buffer> {
    const lib = url.startsWith('https://') ? https : http;
    return new Promise((resolve, reject) => {
      const req = lib.request(url, (res: import('http').IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.on('error', reject);
      req.setTimeout(10000, () => req.destroy(new Error('timeout')));
      req.end();
    });
  }

  private mapPrivateProfile(
    profile: {
      fullName: string;
      phone: string;
      zipCode?: string | null;
      addressLine?: string | null;
      addressComplement?: string | null;
      city: string;
      state: string;
      bio?: string | null;
      avatarUrl?: string | null;
      documentNumber?: string | null;
      driverLicenseNumber?: string | null;
      documentImageUrl?: string | null;
      driverLicenseImageUrl?: string | null;
      documentVerificationStatus?: VerificationStatus;
      driverLicenseVerification?: VerificationStatus;
    } | null,
  ) {
    if (!profile) {
      return null;
    }

    return {
      fullName: profile.fullName,
      phone: profile.phone,
      zipCode: profile.zipCode ?? null,
      addressLine: profile.addressLine ?? null,
      addressComplement: profile.addressComplement ?? null,
      city: profile.city,
      state: profile.state,
      bio: profile.bio ?? null,
      avatarUrl: profile.avatarUrl ?? null,
      documentNumber: profile.documentNumber ?? null,
      driverLicenseNumber: profile.driverLicenseNumber ?? null,
      hasDocumentImage: !!profile.documentImageUrl,
      hasDriverLicenseImage: !!profile.driverLicenseImageUrl,
      documentVerificationStatus:
        profile.documentVerificationStatus ?? VerificationStatus.NOT_SUBMITTED,
      driverLicenseVerification:
        profile.driverLicenseVerification ?? VerificationStatus.NOT_SUBMITTED,
    };
  }
}
