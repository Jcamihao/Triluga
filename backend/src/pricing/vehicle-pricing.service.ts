import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  isWeekend,
  startOfDay,
  startOfMonth,
} from 'date-fns';
import { PrismaService } from '../prisma/prisma.service';

type PricingVehicle = {
  id: string;
  dailyRate: Prisma.Decimal | number | string;
  weekendSurchargePercent?: number | null;
  holidaySurchargePercent?: number | null;
  highDemandSurchargePercent?: number | null;
  advanceBookingDiscountPercent?: number | null;
  advanceBookingDaysThreshold?: number | null;
  bookings?: Array<{
    startDate: Date | string;
    endDate: Date | string;
  }>;
};

@Injectable()
export class VehiclePricingService {
  constructor(private readonly prisma: PrismaService) {}

  async getPricingPreview(vehicleId: string, startDate: string, endDate: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        isActive: true,
        isPublished: true,
      },
      select: {
        id: true,
        dailyRate: true,
        weekendSurchargePercent: true,
        holidaySurchargePercent: true,
        highDemandSurchargePercent: true,
        advanceBookingDiscountPercent: true,
        advanceBookingDaysThreshold: true,
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

    if (!vehicle) {
      throw new NotFoundException('Veículo não encontrado.');
    }

    return this.buildPreviewFromVehicle(vehicle, startDate, endDate);
  }

  buildPreviewFromVehicle(
    vehicle: PricingVehicle,
    startDateInput: string | Date,
    endDateInput: string | Date,
  ) {
    const startDate = startOfDay(new Date(startDateInput));
    const endDate = startOfDay(new Date(endDateInput));
    const totalDays = differenceInCalendarDays(endDate, startDate);

    if (totalDays <= 0) {
      throw new BadRequestException(
        'A reserva precisa ter pelo menos uma diária válida.',
      );
    }

    const baseDailyRate = Number(vehicle.dailyRate);

    if (Number.isNaN(baseDailyRate) || baseDailyRate <= 0) {
      throw new BadRequestException('Veículo com diária inválida.');
    }

    const bookingLeadDays = Math.max(
      0,
      differenceInCalendarDays(startDate, startOfDay(new Date())),
    );
    const rentalDays = eachDayOfInterval({
      start: startDate,
      end: addDays(endDate, -1),
    });
    const monthlyDemandCache = new Map<string, boolean>();
    const adjustments = new Map<
      'WEEKEND' | 'HOLIDAY' | 'HIGH_DEMAND' | 'ADVANCE',
      number
    >();
    let adjustedRentalAmount = 0;

    for (const day of rentalDays) {
      let dayPercentDelta = 0;

      if (isWeekend(day) && (vehicle.weekendSurchargePercent ?? 0) > 0) {
        dayPercentDelta += vehicle.weekendSurchargePercent ?? 0;
        adjustments.set(
          'WEEKEND',
          (adjustments.get('WEEKEND') ?? 0) +
            baseDailyRate * ((vehicle.weekendSurchargePercent ?? 0) / 100),
        );
      }

      if (this.isNationalHoliday(day) && (vehicle.holidaySurchargePercent ?? 0) > 0) {
        dayPercentDelta += vehicle.holidaySurchargePercent ?? 0;
        adjustments.set(
          'HOLIDAY',
          (adjustments.get('HOLIDAY') ?? 0) +
            baseDailyRate * ((vehicle.holidaySurchargePercent ?? 0) / 100),
        );
      }

      if (
        (vehicle.highDemandSurchargePercent ?? 0) > 0 &&
        this.isHighDemandMonth(day, vehicle.bookings ?? [], monthlyDemandCache)
      ) {
        dayPercentDelta += vehicle.highDemandSurchargePercent ?? 0;
        adjustments.set(
          'HIGH_DEMAND',
          (adjustments.get('HIGH_DEMAND') ?? 0) +
            baseDailyRate * ((vehicle.highDemandSurchargePercent ?? 0) / 100),
        );
      }

      if (
        (vehicle.advanceBookingDiscountPercent ?? 0) > 0 &&
        bookingLeadDays >= (vehicle.advanceBookingDaysThreshold ?? 0)
      ) {
        dayPercentDelta -= vehicle.advanceBookingDiscountPercent ?? 0;
        adjustments.set(
          'ADVANCE',
          (adjustments.get('ADVANCE') ?? 0) -
            baseDailyRate * ((vehicle.advanceBookingDiscountPercent ?? 0) / 100),
        );
      }

      adjustedRentalAmount += Math.max(
        0,
        baseDailyRate * (1 + dayPercentDelta / 100),
      );
    }

    const baseRentalAmount = Number((baseDailyRate * totalDays).toFixed(2));
    const adjustedAmount = Number(adjustedRentalAmount.toFixed(2));
    const dynamicPricingAmount = Number(
      (adjustedAmount - baseRentalAmount).toFixed(2),
    );

    return {
      vehicleId: vehicle.id,
      startDate,
      endDate,
      totalDays,
      baseDailyRate,
      averageDailyRate: Number((adjustedAmount / totalDays).toFixed(2)),
      baseRentalAmount,
      adjustedRentalAmount: adjustedAmount,
      dynamicPricingAmount,
      adjustments: [
        {
          code: 'WEEKEND',
          label: 'Fim de semana',
          amount: Number((adjustments.get('WEEKEND') ?? 0).toFixed(2)),
        },
        {
          code: 'HOLIDAY',
          label: 'Feriado',
          amount: Number((adjustments.get('HOLIDAY') ?? 0).toFixed(2)),
        },
        {
          code: 'HIGH_DEMAND',
          label: 'Alta demanda',
          amount: Number((adjustments.get('HIGH_DEMAND') ?? 0).toFixed(2)),
        },
        {
          code: 'ADVANCE',
          label: 'Antecedência',
          amount: Number((adjustments.get('ADVANCE') ?? 0).toFixed(2)),
        },
      ].filter((adjustment) => adjustment.amount !== 0),
      ruleSummary: {
        weekendSurchargePercent: vehicle.weekendSurchargePercent ?? 0,
        holidaySurchargePercent: vehicle.holidaySurchargePercent ?? 0,
        highDemandSurchargePercent: vehicle.highDemandSurchargePercent ?? 0,
        advanceBookingDiscountPercent:
          vehicle.advanceBookingDiscountPercent ?? 0,
        advanceBookingDaysThreshold:
          vehicle.advanceBookingDaysThreshold ?? 0,
      },
    };
  }

  private isNationalHoliday(date: Date) {
    const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`;

    return new Set([
      '01-01',
      '04-21',
      '05-01',
      '09-07',
      '10-12',
      '11-02',
      '11-15',
      '11-20',
      '12-25',
    ]).has(monthDay);
  }

  private isHighDemandMonth(
    day: Date,
    bookings: Array<{ startDate: Date | string; endDate: Date | string }>,
    cache: Map<string, boolean>,
  ) {
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}`;

    if (cache.has(key)) {
      return cache.get(key) ?? false;
    }

    const monthStart = startOfMonth(day);
    const monthEnd = addDays(endOfMonth(day), 1);
    const daysInMonth = differenceInCalendarDays(monthEnd, monthStart);
    const bookedDays = bookings.reduce((total, booking) => {
      const bookingStart = startOfDay(new Date(booking.startDate));
      const bookingEnd = startOfDay(new Date(booking.endDate));
      const overlapStart = Math.max(bookingStart.getTime(), monthStart.getTime());
      const overlapEnd = Math.min(bookingEnd.getTime(), monthEnd.getTime());

      if (overlapEnd <= overlapStart) {
        return total;
      }

      return total + Math.round((overlapEnd - overlapStart) / 86400000);
    }, 0);
    const isHighDemand = daysInMonth > 0 && bookedDays / daysInMonth >= 0.6;

    cache.set(key, isHighDemand);
    return isHighDemand;
  }
}
