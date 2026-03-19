import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  Prisma,
  Role,
  VehicleCategory,
} from '@prisma/client';
import { CacheQueueService } from '../cache-queue/cache-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { ListVehiclesQueryDto } from './dto/list-vehicles-query.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheQueueService: CacheQueueService,
  ) {}

  async findAll(query: ListVehiclesQueryDto) {
    this.validateDateRange(query.startDate, query.endDate);

    const cacheKey = `vehicles:list:${JSON.stringify(query)}`;
    const cached = await this.cacheQueueService.getJson(cacheKey);

    if (cached) {
      return cached;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    const andFilters: Prisma.VehicleWhereInput[] = [];

    if (query.q) {
      andFilters.push({
        OR: [
          {
            title: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
          {
            brand: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
          {
            model: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
          {
            city: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
          {
            state: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    if (query.city) {
      andFilters.push({
        city: {
          contains: query.city,
          mode: 'insensitive',
        },
      });
    }

    if (query.category) {
      andFilters.push({
        category: query.category as VehicleCategory,
      });
    }

    if (query.minPrice || query.maxPrice) {
      andFilters.push({
        dailyRate: {
          gte: query.minPrice,
          lte: query.maxPrice,
        },
      });
    }

    if (startDate && endDate) {
      andFilters.push(
        {
          bookings: {
            none: {
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
          },
        },
        {
          blockedDates: {
            none: {
              startDate: {
                lt: endDate,
              },
              endDate: {
                gt: startDate,
              },
            },
          },
        },
      );
    }

    const where: Prisma.VehicleWhereInput = {
      isActive: true,
      isPublished: true,
      AND: andFilters,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        where,
        include: {
          images: {
            orderBy: {
              position: 'asc',
            },
            take: 1,
          },
          owner: {
            include: {
              profile: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    const payload = {
      items: items.map((vehicle) => this.mapVehicleSummary(vehicle)),
      meta: {
        total,
        page,
        limit,
        hasNextPage: skip + limit < total,
      },
    };

    await this.cacheQueueService.setJson(cacheKey, payload);
    return payload;
  }

  async findMine(ownerId: string) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        ownerId,
      },
      include: {
        images: {
          orderBy: {
            position: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return vehicles.map((vehicle) => ({
      id: vehicle.id,
      title: vehicle.title,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      plate: vehicle.plate,
      city: vehicle.city,
      state: vehicle.state,
      category: vehicle.category,
      transmission: vehicle.transmission,
      fuelType: vehicle.fuelType,
      seats: vehicle.seats,
      dailyRate: Number(vehicle.dailyRate),
      description: vehicle.description,
      addressLine: vehicle.addressLine,
      isActive: vehicle.isActive,
      isPublished: vehicle.isPublished,
      coverImage: vehicle.images[0]?.url ?? null,
      images: vehicle.images.map((image) => ({
        id: image.id,
        url: image.url,
        alt: image.alt,
        position: image.position,
      })),
      ratingAverage: Number(vehicle.ratingAverage),
      reviewsCount: vehicle.reviewsCount,
    }));
  }

  async findOne(vehicleId: string) {
    const cacheKey = `vehicles:detail:${vehicleId}`;
    const cached = await this.cacheQueueService.getJson(cacheKey);

    if (cached) {
      return cached;
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        isActive: true,
      },
      include: {
        images: {
          orderBy: {
            position: 'asc',
          },
        },
        owner: {
          include: {
            profile: true,
          },
        },
        reviews: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 10,
          include: {
            author: {
              include: {
                profile: true,
              },
            },
          },
        },
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Veículo não encontrado.');
    }

    const payload = this.mapVehicleDetail(vehicle);
    await this.cacheQueueService.setJson(cacheKey, payload);

    return payload;
  }

  async create(ownerId: string, dto: CreateVehicleDto) {
    const vehicle = await this.prisma.vehicle.create({
      data: {
        ownerId,
        title: dto.title,
        brand: dto.brand,
        model: dto.model,
        year: dto.year,
        plate: dto.plate.toUpperCase(),
        city: dto.city,
        state: dto.state.toUpperCase(),
        category: dto.category,
        transmission: dto.transmission,
        fuelType: dto.fuelType,
        seats: dto.seats,
        dailyRate: dto.dailyRate,
        description: dto.description,
        addressLine: dto.addressLine,
        latitude: dto.latitude,
        longitude: dto.longitude,
        isPublished: dto.isPublished ?? true,
      },
      include: {
        images: true,
        owner: {
          include: {
            profile: true,
          },
        },
      },
    });

    await this.cacheQueueService.invalidateByPrefix('vehicles:list:');
    return this.mapVehicleDetail(vehicle);
  }

  async update(ownerId: string, vehicleId: string, dto: UpdateVehicleDto) {
    await this.ensureVehicleOwnership(ownerId, vehicleId);

    const vehicle = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        ...dto,
        plate: dto.plate ? dto.plate.toUpperCase() : undefined,
        state: dto.state ? dto.state.toUpperCase() : undefined,
      },
      include: {
        images: {
          orderBy: {
            position: 'asc',
          },
        },
        owner: {
          include: {
            profile: true,
          },
        },
      },
    });

    await this.invalidateVehicleCache(vehicleId);
    return this.mapVehicleDetail(vehicle);
  }

  async remove(ownerId: string, vehicleId: string) {
    await this.ensureVehicleOwnership(ownerId, vehicleId);

    const vehicle = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        isActive: false,
        isPublished: false,
      },
    });

    await this.invalidateVehicleCache(vehicleId);
    return {
      message: 'Veículo desativado com sucesso.',
      vehicleId: vehicle.id,
    };
  }

  async ensureVehicleOwnership(ownerId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Veículo não encontrado.');
    }

    if (vehicle.ownerId !== ownerId) {
      throw new ForbiddenException(
        'Você não tem permissão para alterar este veículo.',
      );
    }

    return vehicle;
  }

  async ensureVehicleExists(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle || !vehicle.isActive) {
      throw new NotFoundException('Veículo não encontrado.');
    }

    return vehicle;
  }

  async invalidateVehicleCache(vehicleId: string) {
    await Promise.all([
      this.cacheQueueService.del(`vehicles:detail:${vehicleId}`),
      this.cacheQueueService.invalidateByPrefix('vehicles:list:'),
    ]);
  }

  private validateDateRange(startDate?: string, endDate?: string) {
    if (!startDate || !endDate) {
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end <= start) {
      throw new BadRequestException(
        'O período de busca precisa ter data final maior que a inicial.',
      );
    }
  }

  private mapVehicleSummary(vehicle: any) {
    return {
      id: vehicle.id,
      title: vehicle.title,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      city: vehicle.city,
      state: vehicle.state,
      category: vehicle.category,
      seats: vehicle.seats,
      transmission: vehicle.transmission,
      fuelType: vehicle.fuelType,
      dailyRate: Number(vehicle.dailyRate),
      ratingAverage: Number(vehicle.ratingAverage),
      reviewsCount: vehicle.reviewsCount,
      coverImage: vehicle.images[0]?.url ?? null,
      owner: {
        id: vehicle.owner.id,
        fullName: vehicle.owner.profile?.fullName ?? null,
        city: vehicle.owner.profile?.city ?? null,
        state: vehicle.owner.profile?.state ?? null,
      },
    };
  }

  private mapVehicleDetail(vehicle: any) {
    return {
      ...this.mapVehicleSummary({
        ...vehicle,
        images: vehicle.images,
      }),
      description: vehicle.description,
      addressLine: vehicle.addressLine,
      latitude: vehicle.latitude ? Number(vehicle.latitude) : null,
      longitude: vehicle.longitude ? Number(vehicle.longitude) : null,
      isPublished: vehicle.isPublished,
      images: vehicle.images.map((image: any) => ({
        id: image.id,
        url: image.url,
        alt: image.alt,
        position: image.position,
      })),
      reviews: (vehicle.reviews ?? []).map((review: any) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        author: {
          id: review.author.id,
          fullName: review.author.profile?.fullName ?? null,
        },
      })),
    };
  }
}
