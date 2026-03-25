import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingApprovalMode,
  BookingStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { differenceInCalendarDays } from 'date-fns';
import { NotificationsService } from '../notifications/notifications.service';
import { VehiclePricingService } from '../pricing/vehicle-pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingDecisionDto } from './dto/booking-decision.dto';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly vehiclePricingService: VehiclePricingService,
  ) {}

  async create(renterId: string, dto: CreateBookingDto) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: dto.vehicleId },
      include: {
        owner: {
          include: { profile: true },
        },
        bookings: {
          where: {
            status: {
              in: [BookingStatus.APPROVED, BookingStatus.IN_PROGRESS],
            },
          },
          select: {
            startDate: true,
            endDate: true,
          },
        },
      },
    });

    if (!vehicle || !vehicle.isActive || !vehicle.isPublished) {
      throw new NotFoundException('Veículo não disponível para reserva.');
    }

    if (vehicle.ownerId === renterId) {
      throw new BadRequestException(
        'Você não pode reservar um veículo do próprio anúncio.',
      );
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    const totalDays = differenceInCalendarDays(endDate, startDate);

    if (totalDays <= 0) {
      throw new BadRequestException(
        'A reserva precisa ter pelo menos uma diária válida.',
      );
    }

    await this.ensureNoBlockingConflicts(dto.vehicleId, startDate, endDate);

    const platformFeeRate = this.configService.get<number>(
      'app.platformFeeRate',
      0.12,
    );
    const selectedAddons = this.selectBookingAddons(
      vehicle.addons,
      dto.selectedAddonIds,
    );
    const addonsAmount = Number(
      selectedAddons.reduce((total, addon) => total + addon.price, 0).toFixed(2),
    );
    const pricingPreview = this.vehiclePricingService.buildPreviewFromVehicle(
      vehicle,
      startDate,
      endDate,
    );
    const dailyRate = pricingPreview.averageDailyRate;
    const rentalAmount = pricingPreview.adjustedRentalAmount;
    const { appliedPromotions, couponCode } =
      await this.resolveAppliedPromotions({
        renterId,
        vehicle,
        totalDays,
        rentalAmount,
        couponCode: dto.couponCode,
      });
    const discountsAmount = Number(
      appliedPromotions
        .reduce((total, promotion) => total + promotion.amount, 0)
        .toFixed(2),
    );
    const bookingStatus =
      vehicle.bookingApprovalMode === BookingApprovalMode.INSTANT
        ? BookingStatus.APPROVED
        : BookingStatus.PENDING;
    const subtotal = Number((rentalAmount + addonsAmount).toFixed(2));
    const discountedSubtotal = Number(
      Math.max(0, subtotal - discountsAmount).toFixed(2),
    );
    const platformFee = Number(
      (discountedSubtotal * platformFeeRate).toFixed(2),
    );
    const totalAmount = Number((discountedSubtotal + platformFee).toFixed(2));
    const approvedAt =
      bookingStatus === BookingStatus.APPROVED ? new Date() : undefined;

    const booking = await this.prisma.booking.create({
      data: {
        vehicleId: vehicle.id,
        ownerId: vehicle.ownerId,
        renterId,
        startDate,
        endDate,
        totalDays,
        dailyRate,
        subtotal,
        platformFee,
        totalAmount,
        addonsAmount,
        discountsAmount,
        selectedAddons,
        appliedPromotions,
        couponCode,
        notes: dto.notes,
        status: bookingStatus,
        approvedAt,
        statusHistory: {
          create:
            bookingStatus === BookingStatus.APPROVED
              ? [
                  {
                    toStatus: BookingStatus.PENDING,
                    changedById: renterId,
                  },
                  {
                    fromStatus: BookingStatus.PENDING,
                    toStatus: BookingStatus.APPROVED,
                    changedById: vehicle.ownerId,
                    reason: 'Reserva instantânea',
                  },
                ]
              : {
                  toStatus: BookingStatus.PENDING,
                  changedById: renterId,
                },
        },
      },
      include: this.bookingInclude,
    });

    if (bookingStatus === BookingStatus.APPROVED) {
      await Promise.all([
        this.notificationsService.create({
          userId: vehicle.ownerId,
          type: NotificationType.BOOKING_APPROVED,
          title: 'Reserva instantânea confirmada',
          message: `${vehicle.title} foi reservado instantaneamente para ${dto.startDate} até ${dto.endDate}.`,
          metadata: { bookingId: booking.id, vehicleId: vehicle.id },
        }),
        this.notificationsService.create({
          userId: renterId,
          type: NotificationType.BOOKING_APPROVED,
          title: 'Reserva confirmada',
          message: `Sua reserva para ${vehicle.title} foi confirmada instantaneamente.`,
          metadata: { bookingId: booking.id, vehicleId: vehicle.id },
        }),
      ]);
    } else {
      await this.notificationsService.create({
        userId: vehicle.ownerId,
        type: NotificationType.BOOKING_REQUEST,
        title: 'Nova solicitação de reserva',
        message: `Você recebeu um pedido para ${vehicle.title} entre ${dto.startDate} e ${dto.endDate}.`,
        metadata: { bookingId: booking.id, vehicleId: vehicle.id },
      });
    }

    return this.mapBooking(booking);
  }

  async getMyBookings(renterId: string) {
    await this.syncLifecycleStatuses();

    const bookings = await this.prisma.booking.findMany({
      where: { renterId },
      include: this.bookingInclude,
      orderBy: { createdAt: 'desc' },
    });

    return bookings.map((booking) => this.mapBooking(booking));
  }

  async getOwnerBookings(ownerId: string) {
    await this.syncLifecycleStatuses();

    const bookings = await this.prisma.booking.findMany({
      where: { ownerId },
      include: this.bookingInclude,
      orderBy: { createdAt: 'desc' },
    });

    return bookings.map((booking) => this.mapBooking(booking));
  }

  async approve(ownerId: string, bookingId: string, dto: BookingDecisionDto) {
    const booking = await this.getOwnerBookingOrFail(ownerId, bookingId);

    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(
        'Apenas reservas pendentes podem ser aprovadas.',
      );
    }

    await this.ensureNoApprovalConflicts(
      booking.vehicleId,
      booking.id,
      booking.startDate,
      booking.endDate,
    );

    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.APPROVED,
        approvedAt: new Date(),
        statusHistory: {
          create: {
            fromStatus: booking.status,
            toStatus: BookingStatus.APPROVED,
            changedById: ownerId,
            reason: dto.reason,
          },
        },
      },
      include: this.bookingInclude,
    });

    await this.notificationsService.create({
      userId: booking.renterId,
      type: NotificationType.BOOKING_APPROVED,
      title: 'Reserva aprovada',
      message: `Sua reserva para ${booking.vehicle.title} foi aprovada.`,
      metadata: { bookingId: booking.id, vehicleId: booking.vehicleId },
    });

    return this.mapBooking(updatedBooking);
  }

  async reject(ownerId: string, bookingId: string, dto: BookingDecisionDto) {
    const booking = await this.getOwnerBookingOrFail(ownerId, bookingId);

    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(
        'Apenas reservas pendentes podem ser recusadas.',
      );
    }

    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.REJECTED,
        rejectedAt: new Date(),
        statusHistory: {
          create: {
            fromStatus: booking.status,
            toStatus: BookingStatus.REJECTED,
            changedById: ownerId,
            reason: dto.reason,
          },
        },
      },
      include: this.bookingInclude,
    });

    await this.notificationsService.create({
      userId: booking.renterId,
      type: NotificationType.BOOKING_REJECTED,
      title: 'Reserva recusada',
      message: `Sua solicitação para ${booking.vehicle.title} foi recusada.`,
      metadata: { bookingId: booking.id, vehicleId: booking.vehicleId },
    });

    return this.mapBooking(updatedBooking);
  }

  async cancel(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: this.bookingInclude,
    });

    if (!booking) {
      throw new NotFoundException('Reserva não encontrada.');
    }

    if (booking.ownerId !== userId && booking.renterId !== userId) {
      throw new ForbiddenException('Você não pode cancelar esta reserva.');
    }

    if (
      booking.status !== BookingStatus.PENDING &&
      booking.status !== BookingStatus.APPROVED
    ) {
      throw new BadRequestException(
        'Apenas reservas pendentes ou aprovadas podem ser canceladas.',
      );
    }

    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        statusHistory: {
          create: {
            fromStatus: booking.status,
            toStatus: BookingStatus.CANCELLED,
            changedById: userId,
          },
        },
      },
      include: this.bookingInclude,
    });

    const recipientUserId = booking.ownerId === userId ? booking.renterId : booking.ownerId;

    await this.notificationsService.create({
      userId: recipientUserId,
      type: NotificationType.BOOKING_CANCELLED,
      title: 'Reserva cancelada',
      message: `A reserva ${booking.id} foi cancelada.`,
      metadata: { bookingId: booking.id, vehicleId: booking.vehicleId },
    });

    return this.mapBooking(updatedBooking);
  }

  async syncLifecycleStatuses() {
    const now = new Date();

    const startedBookings = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.APPROVED,
        startDate: {
          lte: now,
        },
        endDate: {
          gt: now,
        },
      },
      select: {
        id: true,
      },
    });

    if (startedBookings.length > 0) {
      await this.prisma.$transaction([
        this.prisma.booking.updateMany({
          where: {
            id: {
              in: startedBookings.map((booking) => booking.id),
            },
          },
          data: {
            status: BookingStatus.IN_PROGRESS,
          },
        }),
        ...startedBookings.map((booking) =>
          this.prisma.bookingStatusHistory.create({
            data: {
              bookingId: booking.id,
              fromStatus: BookingStatus.APPROVED,
              toStatus: BookingStatus.IN_PROGRESS,
            },
          }),
        ),
      ]);
    }

    const completedBookings = await this.prisma.booking.findMany({
      where: {
        status: {
          in: [BookingStatus.APPROVED, BookingStatus.IN_PROGRESS],
        },
        endDate: {
          lte: now,
        },
      },
      select: {
        id: true,
        status: true,
        renterId: true,
        ownerId: true,
        vehicle: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (completedBookings.length === 0) {
      return;
    }

    await this.prisma.$transaction([
      this.prisma.booking.updateMany({
        where: {
          id: {
            in: completedBookings.map((booking) => booking.id),
          },
        },
        data: {
          status: BookingStatus.COMPLETED,
          completedAt: now,
        },
      }),
      ...completedBookings.map((booking) =>
        this.prisma.bookingStatusHistory.create({
          data: {
            bookingId: booking.id,
            fromStatus: booking.status,
            toStatus: BookingStatus.COMPLETED,
          },
        }),
      ),
    ]);

    await Promise.all(
      completedBookings.flatMap((booking) => [
        this.notificationsService.create({
          userId: booking.renterId,
          type: NotificationType.BOOKING_COMPLETED,
          title: 'Reserva concluída',
          message: `Sua locação de ${booking.vehicle.title} foi concluída.`,
          metadata: { bookingId: booking.id, vehicleId: booking.vehicle.id },
        }),
        this.notificationsService.create({
          userId: booking.ownerId,
          type: NotificationType.BOOKING_COMPLETED,
          title: 'Locação finalizada',
          message: `A reserva de ${booking.vehicle.title} foi finalizada com sucesso.`,
          metadata: { bookingId: booking.id, vehicleId: booking.vehicle.id },
        }),
      ]),
    );
  }

  private async ensureNoBlockingConflicts(
    vehicleId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const conflict = await this.prisma.booking.findFirst({
      where: {
        vehicleId,
        status: {
          in: [BookingStatus.APPROVED, BookingStatus.IN_PROGRESS],
        },
        startDate: {
          lt: endDate,
        },
        endDate: {
          gt: startDate,
        },
      },
    });

    if (conflict) {
      throw new BadRequestException(
        'Já existe uma reserva aprovada para este período.',
      );
    }

    const blockedDate = await this.prisma.vehicleBlockedDate.findFirst({
      where: {
        vehicleId,
        startDate: {
          lt: endDate,
        },
        endDate: {
          gt: startDate,
        },
      },
    });

    if (blockedDate) {
      throw new BadRequestException(
        'O veículo está indisponível para o período selecionado.',
      );
    }
  }

  private async ensureNoApprovalConflicts(
    vehicleId: string,
    bookingId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const conflict = await this.prisma.booking.findFirst({
      where: {
        vehicleId,
        id: {
          not: bookingId,
        },
        status: {
          in: [BookingStatus.APPROVED, BookingStatus.IN_PROGRESS],
        },
        startDate: {
          lt: endDate,
        },
        endDate: {
          gt: startDate,
        },
      },
    });

    if (conflict) {
      throw new BadRequestException(
        'Conflito de datas com outra reserva já aprovada.',
      );
    }

    const blockedDate = await this.prisma.vehicleBlockedDate.findFirst({
      where: {
        vehicleId,
        startDate: {
          lt: endDate,
        },
        endDate: {
          gt: startDate,
        },
      },
    });

    if (blockedDate) {
      throw new BadRequestException(
        'O período está bloqueado pelo proprietário.',
      );
    }
  }

  private async getOwnerBookingOrFail(ownerId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: this.bookingInclude,
    });

    if (!booking) {
      throw new NotFoundException('Reserva não encontrada.');
    }

    if (booking.ownerId !== ownerId) {
      throw new ForbiddenException(
        'Você não tem permissão para gerenciar esta reserva.',
      );
    }

    return booking;
  }

  private mapBooking(booking: any) {
    return {
      id: booking.id,
      status: booking.status,
      startDate: booking.startDate,
      endDate: booking.endDate,
      totalDays: booking.totalDays,
      dailyRate: Number(booking.dailyRate),
      subtotal: Number(booking.subtotal),
      platformFee: Number(booking.platformFee),
      totalAmount: Number(booking.totalAmount),
      addonsAmount: Number(booking.addonsAmount ?? 0),
      discountsAmount: Number(booking.discountsAmount ?? 0),
      couponCode: booking.couponCode ?? null,
      selectedAddons: Array.isArray(booking.selectedAddons)
        ? booking.selectedAddons
        : [],
      appliedPromotions: Array.isArray(booking.appliedPromotions)
        ? booking.appliedPromotions
        : [],
      notes: booking.notes,
      approvedAt: booking.approvedAt,
      rejectedAt: booking.rejectedAt,
      cancelledAt: booking.cancelledAt,
      completedAt: booking.completedAt,
      createdAt: booking.createdAt,
      vehicle: {
        id: booking.vehicle.id,
        title: booking.vehicle.title,
        city: booking.vehicle.city,
        state: booking.vehicle.state,
        dailyRate: Number(booking.vehicle.dailyRate),
        image: booking.vehicle.images[0]?.url ?? null,
      },
      renter: {
        id: booking.renter.id,
        email: booking.renter.email,
        fullName: booking.renter.profile?.fullName ?? null,
      },
      owner: {
        id: booking.owner.id,
        email: booking.owner.email,
        fullName: booking.owner.profile?.fullName ?? null,
      },
      payment: booking.payment
        ? {
            id: booking.payment.id,
            status: booking.payment.status,
            method: booking.payment.method,
            amount: Number(booking.payment.amount),
            ownerAmount: Number(booking.payment.ownerAmount),
            platformFee: Number(booking.payment.platformFee),
            transactionId: booking.payment.transactionId,
          }
        : null,
      statusHistory: booking.statusHistory,
      review: booking.review,
    };
  }

  private selectBookingAddons(
    addons: unknown,
    selectedAddonIds?: string[],
  ) {
    if (!Array.isArray(addons) || !selectedAddonIds?.length) {
      return [];
    }

    const selectedIds = new Set(selectedAddonIds);

    return addons
      .map((addon) => addon as Record<string, unknown>)
      .filter((addon) => addon.enabled !== false && selectedIds.has(String(addon.id ?? '')))
      .map((addon) => ({
        id: String(addon.id ?? ''),
        name: String(addon.name ?? ''),
        description: String(addon.description ?? ''),
        price: Number(Number(addon.price ?? 0).toFixed(2)),
      }))
      .filter((addon) => addon.id && addon.name && !Number.isNaN(addon.price));
  }

  private async resolveAppliedPromotions(params: {
    renterId: string;
    vehicle: {
      firstBookingDiscountPercent?: number | null;
      weeklyDiscountPercent?: number | null;
      couponCode?: string | null;
      couponDiscountPercent?: number | null;
    };
    totalDays: number;
    rentalAmount: number;
    couponCode?: string;
  }) {
    const appliedPromotions: Array<{
      code: 'FIRST_BOOKING' | 'WEEKLY_PACKAGE' | 'COUPON';
      label: string;
      amount: number;
    }> = [];
    const baseAmount = params.rentalAmount;

    const addPromotion = (
      code: 'FIRST_BOOKING' | 'WEEKLY_PACKAGE' | 'COUPON',
      label: string,
      percent: number | null | undefined,
    ) => {
      const normalizedPercent = Number(percent ?? 0);

      if (normalizedPercent <= 0 || baseAmount <= 0) {
        return;
      }

      const usedAmount = appliedPromotions.reduce(
        (total, promotion) => total + promotion.amount,
        0,
      );
      const remainingAmount = Math.max(0, baseAmount - usedAmount);
      const discountAmount = Number(
        Math.min(baseAmount * (normalizedPercent / 100), remainingAmount).toFixed(2),
      );

      if (discountAmount <= 0) {
        return;
      }

      appliedPromotions.push({
        code,
        label,
        amount: discountAmount,
      });
    };

    const normalizedCouponCode = this.normalizeCouponCode(params.couponCode);

    if ((params.vehicle.firstBookingDiscountPercent ?? 0) > 0) {
      const existingBookingCount = await this.prisma.booking.count({
        where: {
          renterId: params.renterId,
          status: {
            in: [
              BookingStatus.PENDING,
              BookingStatus.APPROVED,
              BookingStatus.IN_PROGRESS,
              BookingStatus.COMPLETED,
            ],
          },
        },
      });

      if (existingBookingCount === 0) {
        addPromotion(
          'FIRST_BOOKING',
          'Desconto de primeira reserva',
          params.vehicle.firstBookingDiscountPercent,
        );
      }
    }

    if (params.totalDays >= 7) {
      addPromotion(
        'WEEKLY_PACKAGE',
        'Pacote semanal',
        params.vehicle.weeklyDiscountPercent,
      );
    }

    if (normalizedCouponCode) {
      const vehicleCouponCode = this.normalizeCouponCode(params.vehicle.couponCode);

      if (!vehicleCouponCode || vehicleCouponCode !== normalizedCouponCode) {
        throw new BadRequestException('Cupom inválido para este anúncio.');
      }

      addPromotion(
        'COUPON',
        `Cupom ${normalizedCouponCode}`,
        params.vehicle.couponDiscountPercent,
      );
    }

    return {
      appliedPromotions,
      couponCode: normalizedCouponCode,
    };
  }

  private normalizeCouponCode(value: unknown) {
    const couponCode = String(value ?? '').trim().toUpperCase();
    return couponCode || null;
  }

  private readonly bookingInclude = {
    vehicle: {
      include: {
        images: {
          orderBy: {
            position: 'asc' as const,
          },
        },
      },
    },
    owner: {
      include: {
        profile: true,
      },
    },
    renter: {
      include: {
        profile: true,
      },
    },
    payment: true,
    review: true,
    statusHistory: {
      orderBy: {
        changedAt: 'asc' as const,
      },
    },
  } satisfies Prisma.BookingInclude;
}
