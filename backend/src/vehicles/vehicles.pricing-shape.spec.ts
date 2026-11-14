import { ChatService } from '../chat/chat.service';
import { FavoritesService } from '../favorites/favorites.service';
import { ProfilesService } from '../profiles/profiles.service';
import { VehiclesService } from './vehicles.service';

/**
 * Todo anúncio devolvido pela API traz exatamente os campos de VehiclePricing.
 * Cada serviço roda pelo método PÚBLICO com Prisma falso (mapeadores privados).
 */

const WITH_MIN = {
  dailyRate: 100,
  weeklyRate: 700,
  weeklyEstimate: 700,
  monthlyEstimate: 3000,
  minRentalDays: 30,
  minPeriodTotal: 3000,
};

const WITHOUT_MIN = {
  ...WITH_MIN,
  minRentalDays: null,
  minPeriodTotal: null,
};

/** Entidade como o Prisma devolve: diária em string (Decimal), sem coluna weeklyRate. */
function fakeEntity(minRentalDays: number | null) {
  return {
    id: 'vehicle-1',
    slug: 'gol-1',
    ownerId: 'owner-1',
    title: 'Gol 1.0',
    brand: 'VW',
    model: 'Gol',
    year: 2020,
    city: 'Goiânia',
    state: 'GO',
    seats: 5,
    dailyRate: '100.00',
    minRentalDays,
    isActive: true,
    isPublished: true,
    isFeatured: false,
    latitude: null,
    longitude: null,
    ratingAverage: '0',
    reviewsCount: 0,
    images: [],
    reviews: [],
    _count: { views: 0 },
    owner: {
      id: 'owner-1',
      profile: null,
      userReviewsReceived: [],
    },
  };
}

function expectPricing(vehicle: any, expected: typeof WITH_MIN) {
  expect(vehicle).toMatchObject(expected);
  // weeklyRate legado nunca é null e coincide com weeklyEstimate
  expect(vehicle.weeklyRate).toBe(vehicle.weeklyEstimate);
}

const CASES: Array<[string, number | null, typeof WITH_MIN]> = [
  ['com tempo mínimo', 30, WITH_MIN],
  ['sem tempo mínimo', null, WITHOUT_MIN],
];

describe.each(CASES)('preço nas respostas (%s)', (_label, min, expected) => {
  describe('VehiclesService', () => {
    function build(entity: any) {
      const prisma = {
        vehicle: {
          findMany: jest.fn().mockResolvedValue([entity]),
          findFirst: jest.fn().mockResolvedValue(entity),
          count: jest.fn().mockResolvedValue(1),
          update: jest.fn().mockResolvedValue(entity),
        },
        $transaction: jest.fn(async (ops: Promise<unknown>[]) =>
          Promise.all(ops),
        ),
        vehicleView: { groupBy: jest.fn().mockResolvedValue([]) },
        favorite: { groupBy: jest.fn().mockResolvedValue([]) },
        chatConversation: {
          groupBy: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      const cache = {
        getJson: jest.fn().mockResolvedValue(null),
        setJson: jest.fn().mockResolvedValue(undefined),
      };
      return new VehiclesService(
        prisma as any,
        cache as any,
        {} as any,
        { assertCanPublish: jest.fn().mockResolvedValue(undefined) } as any,
      );
    }

    it('findAll (resumo)', async () => {
      const result: any = await build(fakeEntity(min)).findAll({} as any);
      expectPricing(result.items[0], expected);
    });

    it('findOne (detalhe)', async () => {
      const result: any = await build(fakeEntity(min)).findOne('gol-1');
      expectPricing(result, expected);
    });

    it('findPublicSummariesByIds', async () => {
      const [vehicle]: any[] = await build(
        fakeEntity(min),
      ).findPublicSummariesByIds(['vehicle-1']);
      expectPricing(vehicle, expected);
    });

    it('findMine (anúncios do dono)', async () => {
      const [vehicle]: any[] = await build(fakeEntity(min)).findMine('owner-1');
      expectPricing(vehicle, expected);
    });
  });

  it('FavoritesService.listMyFavorites', async () => {
    const prisma = {
      favorite: {
        findMany: jest.fn().mockResolvedValue([{ vehicle: fakeEntity(min) }]),
      },
    };
    const [vehicle]: any[] = await new FavoritesService(
      prisma as any,
    ).listMyFavorites('user-1');
    expectPricing(vehicle, expected);
  });

  it('ChatService.getMyConversations', async () => {
    const conversation = {
      id: 'conv-1',
      vehicle: fakeEntity(min),
      participants: [],
      messages: [],
      updatedAt: new Date(),
      lastMessageAt: null,
    };
    const prisma = {
      chatConversation: {
        findMany: jest.fn().mockResolvedValue([conversation]),
      },
      chatParticipant: { findMany: jest.fn().mockResolvedValue([]) },
      chatMessage: { count: jest.fn().mockResolvedValue(0) },
    };
    const presence = { isUserOnline: jest.fn().mockReturnValue(false) };
    const [summary]: any[] = await new ChatService(
      prisma as any,
      {} as any,
      presence as any,
    ).getMyConversations('user-1');
    expectPricing(summary.vehicle, expected);
  });

  it('ProfilesService.getPublicProfile', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'owner-1',
          role: 'USER',
          email: 'dono@example.com',
          createdAt: new Date(),
          profile: null,
        }),
      },
      userReview: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _avg: { rating: null }, _count: { rating: 0 } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      vehicle: { findMany: jest.fn().mockResolvedValue([fakeEntity(min)]) },
      chatConversation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const result: any = await new ProfilesService(
      prisma as any,
      {} as any,
    ).getPublicProfile('owner-1');
    expectPricing(result.vehicles[0], expected);
  });
});
