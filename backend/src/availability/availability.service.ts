import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { CacheQueueService } from '../cache-queue/cache-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { SetBlockedDatesDto } from './dto/set-blocked-dates.dto';
import { SetWeeklyAvailabilityDto } from './dto/set-weekly-availability.dto';

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheQueueService: CacheQueueService,
  ) {}

  async getVehicleAvailability(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        availability: {
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        },
        blockedDates: {
          orderBy: { startDate: 'asc' },
        },
        bookings: {
          where: {
            status: {
              in: [BookingStatus.APPROVED, BookingStatus.IN_PROGRESS],
            },
          },
          orderBy: { startDate: 'asc' },
        },
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Veículo não encontrado.');
    }

    return {
      vehicleId: vehicle.id,
      weeklyAvailability: vehicle.availability,
      blockedDates: vehicle.blockedDates,
      approvedBookings: vehicle.bookings,
    };
  }

  async setWeeklyAvailability(
    ownerId: string,
    vehicleId: string,
    dto: SetWeeklyAvailabilityDto,
  ) {
    await this.ensureOwner(ownerId, vehicleId);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.vehicleAvailability.deleteMany({
        where: { vehicleId },
      });

      if (dto.slots.length === 0) {
        return [];
      }

      await tx.vehicleAvailability.createMany({
        data: dto.slots.map((slot) => ({
          vehicleId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isAvailable: slot.isAvailable,
        })),
      });

      return tx.vehicleAvailability.findMany({
        where: { vehicleId },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      });
    });

    await this.cacheQueueService.invalidateByPrefix('vehicles:list:');
    await this.cacheQueueService.del(`vehicles:detail:${vehicleId}`);

    return result;
  }

  async blockDates(ownerId: string, vehicleId: string, dto: SetBlockedDatesDto) {
    await this.ensureOwner(ownerId, vehicleId);

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (endDate <= startDate) {
      throw new BadRequestException(
        'O bloqueio deve ter data final maior que a data inicial.',
      );
    }

    const blockedDate = await this.prisma.vehicleBlockedDate.create({
      data: {
        vehicleId,
        startDate,
        endDate,
        reason: dto.reason,
      },
    });

    await this.cacheQueueService.invalidateByPrefix('vehicles:list:');
    await this.cacheQueueService.del(`vehicles:detail:${vehicleId}`);

    return blockedDate;
  }

  private async ensureOwner(ownerId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Veículo não encontrado.');
    }

    if (vehicle.ownerId !== ownerId) {
      throw new BadRequestException(
        'Apenas o proprietário pode alterar a disponibilidade do veículo.',
      );
    }

    return vehicle;
  }
}
