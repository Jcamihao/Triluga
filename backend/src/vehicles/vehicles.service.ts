import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FuelType,
  MotorcycleStyle,
  Prisma,
  Role,
  Transmission,
  VehicleCategory,
  VehicleType,
} from '@prisma/client';
import { CacheQueueService } from '../cache-queue/cache-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchAlertsService } from '../search-alerts/search-alerts.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { ListVehiclesQueryDto } from './dto/list-vehicles-query.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheQueueService: CacheQueueService,
    private readonly searchAlertsService: SearchAlertsService,
  ) {}

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async generateUniqueSlug(brand: string, model: string, year: number, city: string): Promise<string> {
    const base = this.slugify(`${brand} ${model} ${year} ${city}`);
    let slug = base;
    let counter = 2;
    while (await this.prisma.vehicle.findUnique({ where: { slug } })) {
      slug = `${base}-${counter++}`;
    }
    return slug;
  }

  private resolveSlugOrId(slugOrId: string) {
    return { OR: [{ slug: slugOrId }, { id: slugOrId }] };
  }

  async findAll(query: ListVehiclesQueryDto) {
    const cacheKey = `vehicles:list:${JSON.stringify(query)}`;
    const cached = await this.cacheQueueService.getJson(cacheKey);

    if (cached) {
      return cached;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

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

    if (query.transmission) {
      andFilters.push({
        transmission: query.transmission as Transmission,
      });
    }

    if (query.fuelType) {
      andFilters.push({
        fuelType: query.fuelType as FuelType,
      });
    }

    if (query.minYear) {
      andFilters.push({
        year: { gte: query.minYear },
      });
    }

    if (query.maxYear) {
      andFilters.push({
        year: { lte: query.maxYear },
      });
    }

    if (query.vehicleType) {
      andFilters.push({
        vehicleType: query.vehicleType as VehicleType,
      });
    }

    if (query.motorcycleStyle) {
      andFilters.push({
        motorcycleStyle: query.motorcycleStyle as MotorcycleStyle,
      });
    }

    if (query.minEngineCc || query.maxEngineCc) {
      andFilters.push({
        engineCc: {
          gte: query.minEngineCc,
          lte: query.maxEngineCc,
        },
      });
    }

    if (query.minPrice || query.maxPrice) {
      andFilters.push({
        weeklyRate: {
          gte: query.minPrice,
          lte: query.maxPrice,
        },
      });
    }

    if (query.latitude !== undefined && query.longitude !== undefined) {
      const radiusKm = query.radiusKm ?? 25;
      const latitudeDelta = radiusKm / 111;
      const longitudeDelta =
        radiusKm /
        (111 * Math.max(Math.cos((query.latitude * Math.PI) / 180), 0.2));

      const bboxClause: Prisma.VehicleWhereInput = {
        latitude: {
          not: null,
          gte: query.latitude - latitudeDelta,
          lte: query.latitude + latitudeDelta,
        },
        longitude: {
          not: null,
          gte: query.longitude - longitudeDelta,
          lte: query.longitude + longitudeDelta,
        },
      };

      // When city is also provided, include vehicles in the same city that
      // don't have coordinates stored — they appear alongside geo-filtered results.
      andFilters.push(
        query.city
          ? { OR: [bboxClause, { latitude: null }] }
          : bboxClause,
      );
    }

    const where: Prisma.VehicleWhereInput = {
      isActive: true,
      isPublished: true,
      AND: andFilters,
    };

    // Featured sempre aparecem primeiro quando sort=featured
    if (query.sort === 'featured') {
      const [featuredItems, regularItems, total] = await this.prisma.$transaction([
        this.prisma.vehicle.findMany({
          where: { ...where, isFeatured: true } as any,
          include: { images: { orderBy: { position: 'asc' }, take: 1 }, owner: { include: { profile: true, userReviewsReceived: { select: { rating: true } } } } },
          orderBy: { featuredUntil: 'desc' } as any,
          take: limit,
        }),
        this.prisma.vehicle.findMany({
          where: { ...where, isFeatured: false } as any,
          include: { images: { orderBy: { position: 'asc' }, take: 1 }, owner: { include: { profile: true, userReviewsReceived: { select: { rating: true } } } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.vehicle.count({ where }),
      ]);
      const merged = [...featuredItems, ...regularItems].slice(0, limit);
      const payload = {
        items: merged.map((v) => this.mapVehicleSummary(v)),
        meta: { total, page, limit, hasNextPage: skip + limit < total },
      };
      await this.cacheQueueService.setJson(cacheKey, payload);
      return payload;
    }

    let orderBy: Prisma.VehicleOrderByWithRelationInput = {
      createdAt: 'desc',
    };

    if (query.sort === 'price_asc') {
      orderBy = { weeklyRate: 'asc' };
    } else if (query.sort === 'price_desc') {
      orderBy = { weeklyRate: 'desc' };
    } else if (query.sort === 'oldest') {
      orderBy = { createdAt: 'asc' };
    } else if (query.sort === 'relevance') {
      orderBy = { viewsCount: 'desc' };
    } else if (query.sort === 'newest') {
      orderBy = { createdAt: 'desc' };
    }

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
              userReviewsReceived: {
                select: {
                  rating: true,
                },
              },
            },
          },
        },
        orderBy,
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
        isActive: true,
      },
      include: {
        images: {
          orderBy: {
            position: 'asc',
          },
        },
        _count: {
          select: {
            views: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    const vehicleIds = vehicles.map((vehicle) => vehicle.id);
    const recentViewsSince = new Date();
    recentViewsSince.setDate(recentViewsSince.getDate() - 30);
    const recentViewCounts = vehicleIds.length
      ? await this.prisma.vehicleView.groupBy({
          by: ['vehicleId'],
          where: {
            vehicleId: {
              in: vehicleIds,
            },
            createdAt: {
              gte: recentViewsSince,
            },
          },
          _count: {
            vehicleId: true,
          },
        })
      : [];
    const recentViewCountsByVehicleId = new Map(
      recentViewCounts.map((item) => [item.vehicleId, item._count.vehicleId]),
    );

    return vehicles.map((vehicle) => ({
      id: vehicle.id,
      title: vehicle.title,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      plate: vehicle.plate,
      city: vehicle.city,
      state: vehicle.state,
      vehicleType: vehicle.vehicleType,
      category: vehicle.category,
      transmission: vehicle.transmission,
      fuelType: vehicle.fuelType,
      seats: vehicle.seats,
      dailyRate: Number(vehicle.dailyRate),
      weeklyRate: vehicle.weeklyRate ? Number(vehicle.weeklyRate) : null,
      kmPolicy: vehicle.kmPolicy,
      motorcycleStyle: vehicle.motorcycleStyle,
      engineCc: vehicle.engineCc,
      hasAbs: vehicle.hasAbs,
      hasTopCase: vehicle.hasTopCase,
      hasInsurance: vehicle.hasInsurance,
      mechanicsCondition: vehicle.mechanicsCondition,
      hasDetranIssues: vehicle.hasDetranIssues,
      trunkSize: vehicle.trunkSize,
      latitude: vehicle.latitude ? Number(vehicle.latitude) : null,
      longitude: vehicle.longitude ? Number(vehicle.longitude) : null,
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
      viewsCount: vehicle._count.views,
      isFeatured: vehicle.isFeatured,
      featuredUntil: vehicle.featuredUntil?.toISOString() ?? null,
      viewsLast30Days: recentViewCountsByVehicleId.get(vehicle.id) ?? 0,
    }));
  }

  async findPublicSummariesByIds(vehicleIds: string[]) {
    if (!vehicleIds.length) {
      return [];
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        id: {
          in: vehicleIds,
        },
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
        owner: {
          include: {
            profile: true,
            userReviewsReceived: {
              select: {
                rating: true,
              },
            },
          },
        },
      },
    });

    const summariesById = new Map(
      vehicles.map((vehicle) => [vehicle.id, this.mapVehicleSummary(vehicle)]),
    );

    return vehicleIds
      .map((vehicleId) => summariesById.get(vehicleId))
      .filter((vehicle): vehicle is NonNullable<typeof vehicle> => !!vehicle);
  }

  async findOne(slugOrId: string) {
    const cacheKey = `vehicles:detail:${slugOrId}`;
    const cached = await this.cacheQueueService.getJson(cacheKey);

    if (cached) {
      return cached;
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        ...this.resolveSlugOrId(slugOrId),
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
            userReviewsReceived: {
              select: {
                rating: true,
              },
            },
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

    // Increment views async
    this.prisma.vehicle
      .update({
        where: { id: vehicle.id },
        data: { viewsCount: { increment: 1 } },
      })
      .catch((err) => this.logger.error(`vehicle_views_increment_failed vehicleId=${vehicle.id} error=${err?.message}`));

    const payload = this.mapVehicleDetail(vehicle);
    await this.cacheQueueService.setJson(cacheKey, payload);

    return payload;
  }

  async create(ownerId: string, dto: CreateVehicleDto) {
    try {
      const slug = await this.generateUniqueSlug(dto.brand, dto.model, dto.year, dto.city);
      const vehicle = await this.prisma.vehicle.create({
        data: {
          ownerId,
          slug,
          title: dto.title,
          brand: dto.brand,
          model: dto.model,
          year: dto.year,
          plate: dto.plate.toUpperCase(),
          city: dto.city,
          state: dto.state.toUpperCase(),
          vehicleType: dto.vehicleType ?? VehicleType.CAR,
          category: dto.category,
          transmission: dto.transmission,
          fuelType: dto.fuelType,
          seats: dto.seats,
          dailyRate: dto.dailyRate ?? dto.weeklyRate,
          weeklyRate: dto.weeklyRate,
          kmPolicy: dto.kmPolicy,
          motorcycleStyle: dto.motorcycleStyle,
          engineCc: dto.engineCc,
          hasAbs: dto.hasAbs,
          hasTopCase: dto.hasTopCase,
          hasInsurance: dto.hasInsurance,
          mechanicsCondition: dto.mechanicsCondition,
          hasDetranIssues: dto.hasDetranIssues,
          trunkSize: dto.trunkSize,
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
              userReviewsReceived: {
                select: {
                  rating: true,
                },
              },
            },
          },
        },
      });

      await this.cacheQueueService.invalidateByPrefix('vehicles:list:');
      if (vehicle.isActive && vehicle.isPublished) {
        await this.searchAlertsService.notifyMatchingUsers(vehicle.id);
      }
      return this.mapVehicleDetail(vehicle);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Já existe um veículo cadastrado com esta placa.',
        );
      }
      throw error;
    }
  }

  async update(ownerId: string, vehicleId: string, dto: UpdateVehicleDto) {
    await this.ensureVehicleOwnership(ownerId, vehicleId);
    try {
      const vehicle = await this.prisma.vehicle.update({
        where: { id: vehicleId },
        data: {
          ...dto,
          dailyRate: dto.dailyRate ?? dto.weeklyRate,
          weeklyRate: dto.weeklyRate,
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
              userReviewsReceived: {
                select: {
                  rating: true,
                },
              },
            },
          },
        },
      });

      await this.invalidateVehicleCache(vehicleId);
      if (vehicle.isActive && vehicle.isPublished) {
        await this.searchAlertsService.notifyMatchingUsers(vehicle.id);
      }
      return this.mapVehicleDetail(vehicle);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Já existe um veículo cadastrado com esta placa.',
        );
      }
      throw error;
    }
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
    const vehicle = await this.prisma.vehicle.findFirst({
      where: this.resolveSlugOrId(vehicleId),
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
    const vehicle = await this.prisma.vehicle.findFirst({
      where: this.resolveSlugOrId(vehicleId),
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

  private mapVehicleSummary(vehicle: any) {
    return {
      id: vehicle.id,
      slug: vehicle.slug,
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
      kmPolicy: vehicle.kmPolicy,
      motorcycleStyle: vehicle.motorcycleStyle,
      engineCc: vehicle.engineCc,
      hasAbs: vehicle.hasAbs,
      hasTopCase: vehicle.hasTopCase,
      hasInsurance: vehicle.hasInsurance,
      mechanicsCondition: vehicle.mechanicsCondition,
      hasDetranIssues: vehicle.hasDetranIssues,
      trunkSize: vehicle.trunkSize,
      latitude: vehicle.latitude ? Number(vehicle.latitude) : null,
      longitude: vehicle.longitude ? Number(vehicle.longitude) : null,
      ratingAverage: Number(vehicle.ratingAverage),
      reviewsCount: vehicle.reviewsCount,
      isFeatured: vehicle.isFeatured ?? false,
      coverImage: vehicle.images[0]?.url ?? null,
      owner: {
        ...this.mapOwnerSummary(vehicle.owner),
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

  async getOwnerMetrics(ownerId: string, slugOrId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { ...this.resolveSlugOrId(slugOrId) } as any,
      select: { id: true, ownerId: true, viewsCount: true, favoritesCount: true, title: true, createdAt: true } as any,
    });
    if (!vehicle) throw new NotFoundException('Veículo não encontrado.');
    const vehicleId = (vehicle as any).id;
    if ((vehicle as any).ownerId !== ownerId) throw new ForbiddenException();

    // Views dos últimos 30 dias por dia
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentViews = await this.prisma.vehicleView.groupBy({
      by: ['createdAt'],
      where: { vehicleId, createdAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
    });

    // Contatos (conversas de chat)
    const contactsCount = await this.prisma.chatConversation.count({
      where: { vehicleId },
    });

    return {
      vehicleId,
      title: (vehicle as any).title,
      totalViews: (vehicle as any).viewsCount,
      favoritesCount: (vehicle as any).favoritesCount ?? 0,
      contactsCount,
      createdAt: (vehicle as any).createdAt,
      recentViewsCount: recentViews.reduce((sum, g) => sum + g._count.id, 0),
    };
  }

  async findSimilar(slugOrId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: this.resolveSlugOrId(slugOrId),
      select: { id: true, brand: true, vehicleType: true, category: true, city: true, state: true },
    });
    if (!vehicle) return [];

    const similar = await this.prisma.vehicle.findMany({
      where: {
        id: { not: vehicle.id },
        isActive: true,
        isPublished: true,
        OR: [
          { brand: vehicle.brand, vehicleType: vehicle.vehicleType },
          { category: vehicle.category, city: vehicle.city },
        ],
      },
      include: {
        images: { orderBy: { position: 'asc' }, take: 1 },
        owner: { include: { profile: true, userReviewsReceived: { select: { rating: true } } } },
      },
      orderBy: { viewsCount: 'desc' },
      take: 6,
    });

    return similar.map((v) => this.mapVehicleSummary(v));
  }

  async setFeatured(vehicleId: string, featured: boolean, daysCount = 30) {
    const featuredUntil = featured
      ? new Date(Date.now() + daysCount * 24 * 60 * 60 * 1000)
      : null;
    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { isFeatured: featured, featuredUntil } as any,
      select: { id: true, isFeatured: true, featuredUntil: true } as any,
    });
  }

  async getHomeStats() {
    const [sportCount, electricCount, motorcycleCount, suvPickupCount] =
      await Promise.all([
        this.prisma.vehicle.count({
          where: { category: 'SPORT', isActive: true, isPublished: true },
        }),

        this.prisma.vehicle.count({
          where: { fuelType: 'ELECTRIC', isActive: true, isPublished: true },
        }),

        this.prisma.vehicle.count({
          where: {
            vehicleType: 'MOTORCYCLE',
            isActive: true,
            isPublished: true,
          },
        }),
        this.prisma.vehicle.count({
          where: {
            category: { in: ['SUV', 'PICKUP'] },
            isActive: true,
            isPublished: true,
          },
        }),
      ]);

    return {
      sport: sportCount,
      electric: electricCount,
      motorcycle: motorcycleCount,
      suvPickup: suvPickupCount,
    };
  }

  private mapOwnerSummary(owner: {
    id: string;
    profile?: {
      fullName?: string | null;
      avatarUrl?: string | null;
      city?: string | null;
      state?: string | null;
      phone?: string | null;
      documentVerificationStatus?: string | null;
      driverLicenseVerification?: string | null;
    } | null;
    userReviewsReceived?: Array<{ rating: number }>;
  }) {
    const reviews = Array.isArray(owner.userReviewsReceived)
      ? owner.userReviewsReceived
      : [];
    const reviewsCount = reviews.length;
    const ratingAverage = reviewsCount
      ? Number(
          (
            reviews.reduce(
              (total, review) => total + Number(review.rating ?? 0),
              0,
            ) / reviewsCount
          ).toFixed(1),
        )
      : 0;

    const isVerified =
      owner.profile?.documentVerificationStatus === 'APPROVED' &&
      owner.profile?.driverLicenseVerification === 'APPROVED';

    return {
      id: owner.id,
      fullName: owner.profile?.fullName ?? null,
      avatarUrl: owner.profile?.avatarUrl ?? null,
      city: owner.profile?.city ?? null,
      state: owner.profile?.state ?? null,
      phone: owner.profile?.phone ?? null,
      ratingAverage,
      reviewsCount,
      isVerified,
    };
  }
}
