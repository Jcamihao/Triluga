const bcrypt = require('bcryptjs');
const Redis = require('ioredis');
const {
  PrismaClient,
  Role,
  VehicleCategory,
  FuelType,
  Transmission,
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  NotificationType,
} = require('@prisma/client');

const prisma = new PrismaClient();

async function invalidateVehicleCache() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return;
  }

  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  try {
    const keys = await redis.keys('vehicles:*');

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.warn('Não foi possível invalidar o cache Redis durante o seed.');
  } finally {
    await redis.quit();
  }
}

async function createUserWithProfile({
  email,
  password,
  role,
  fullName,
  phone,
  city,
  state,
}) {
  const passwordHash = await bcrypt.hash(password, 10);

  return prisma.user.upsert({
    where: { email },
    update: {
      role,
      status: 'ACTIVE',
      passwordHash,
      profile: {
        upsert: {
          update: { fullName, phone, city, state },
          create: { fullName, phone, city, state },
        },
      },
    },
    create: {
      email,
      passwordHash,
      role,
      profile: {
        create: { fullName, phone, city, state },
      },
    },
    include: {
      profile: true,
    },
  });
}

async function main() {
  const [admin, owner, renter] = await Promise.all([
    createUserWithProfile({
      email: 'admin@carbnb.local',
      password: 'Admin123!',
      role: Role.ADMIN,
      fullName: 'CarBnB Admin',
      phone: '+55 11 90000-0001',
      city: 'Sao Paulo',
      state: 'SP',
    }),
    createUserWithProfile({
      email: 'owner@carbnb.local',
      password: 'Owner123!',
      role: Role.OWNER,
      fullName: 'Mariana Costa',
      phone: '+55 11 90000-0002',
      city: 'Sao Paulo',
      state: 'SP',
    }),
    createUserWithProfile({
      email: 'renter@carbnb.local',
      password: 'Renter123!',
      role: Role.RENTER,
      fullName: 'Lucas Almeida',
      phone: '+55 11 90000-0003',
      city: 'Campinas',
      state: 'SP',
    }),
  ]);

  await prisma.review.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.bookingStatusHistory.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.vehicleImage.deleteMany();
  await prisma.vehicleAvailability.deleteMany();
  await prisma.vehicleBlockedDate.deleteMany();
  await prisma.vehicle.deleteMany({
    where: { ownerId: owner.id },
  });
  await prisma.notification.deleteMany();

  const vehicles = await prisma.$transaction([
    prisma.vehicle.create({
      data: {
        ownerId: owner.id,
        title: 'Jeep Renegade Longitude 2022',
        brand: 'Jeep',
        model: 'Renegade',
        year: 2022,
        plate: 'CAR2B22',
        city: 'Sao Paulo',
        state: 'SP',
        category: VehicleCategory.SUV,
        transmission: Transmission.AUTOMATIC,
        fuelType: FuelType.FLEX,
        seats: 5,
        dailyRate: 289.9,
        description:
          'SUV confortável para viagens curtas e uso urbano com multimídia, câmera de ré e ar digital.',
        images: {
          create: [
            {
              url: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1200&q=80',
              key: 'seed/vehicles/renegade-cover.jpg',
              alt: 'Jeep Renegade na rua',
              position: 0,
            },
          ],
        },
      },
    }),
    prisma.vehicle.create({
      data: {
        ownerId: owner.id,
        title: 'Chevrolet Onix LT 2023',
        brand: 'Chevrolet',
        model: 'Onix',
        year: 2023,
        plate: 'CAR3B23',
        city: 'Campinas',
        state: 'SP',
        category: VehicleCategory.HATCH,
        transmission: Transmission.AUTOMATIC,
        fuelType: FuelType.FLEX,
        seats: 5,
        dailyRate: 179.9,
        description:
          'Hatch econômico, ótimo para cidade, com direção elétrica, central multimídia e seguro simplificado.',
        images: {
          create: [
            {
              url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80',
              key: 'seed/vehicles/onix-cover.jpg',
              alt: 'Chevrolet Onix branco',
              position: 0,
            },
          ],
        },
      },
    }),
  ]);

  const completedBooking = await prisma.booking.create({
    data: {
      vehicleId: vehicles[1].id,
      ownerId: owner.id,
      renterId: renter.id,
      startDate: new Date('2026-03-01T10:00:00.000Z'),
      endDate: new Date('2026-03-04T10:00:00.000Z'),
      totalDays: 3,
      dailyRate: 179.9,
      subtotal: 539.7,
      platformFee: 64.76,
      totalAmount: 604.46,
      status: BookingStatus.COMPLETED,
      approvedAt: new Date('2026-02-26T15:00:00.000Z'),
      completedAt: new Date('2026-03-04T12:00:00.000Z'),
      statusHistory: {
        create: [
          { toStatus: BookingStatus.PENDING, changedById: renter.id },
          {
            fromStatus: BookingStatus.PENDING,
            toStatus: BookingStatus.APPROVED,
            changedById: owner.id,
          },
          {
            fromStatus: BookingStatus.APPROVED,
            toStatus: BookingStatus.COMPLETED,
            changedById: owner.id,
          },
        ],
      },
      payment: {
        create: {
          amount: 604.46,
          platformFee: 64.76,
          ownerAmount: 539.7,
          method: PaymentMethod.PIX,
          status: PaymentStatus.PAID,
          transactionId: 'mock_tx_seed_001',
          checkoutReference: 'mock_ref_seed_001',
          paidAt: new Date('2026-02-27T09:00:00.000Z'),
        },
      },
      review: {
        create: {
          vehicleId: vehicles[1].id,
          authorId: renter.id,
          ownerId: owner.id,
          rating: 5,
          comment:
            'Carro impecável e entrega super tranquila. Repetiria a locação com certeza.',
        },
      },
    },
  });

  await prisma.vehicle.update({
    where: { id: vehicles[1].id },
    data: {
      ratingAverage: 5,
      reviewsCount: 1,
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: owner.id,
        type: NotificationType.BOOKING_COMPLETED,
        title: 'Locação concluída',
        message: `A reserva ${completedBooking.id} foi concluída com sucesso.`,
      },
      {
        userId: renter.id,
        type: NotificationType.REVIEW_CREATED,
        title: 'Avaliação registrada',
        message: 'Sua avaliação foi registrada e já aparece no anúncio.',
      },
      {
        userId: admin.id,
        type: NotificationType.SYSTEM_ALERT,
        title: 'Seed carregado',
        message: 'O ambiente local do CarBnB foi populado com dados iniciais.',
      },
    ],
  });

  await invalidateVehicleCache();

  console.log('Seed concluído com usuários e dados do MVP.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
