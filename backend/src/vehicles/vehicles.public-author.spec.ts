import { VehiclesService } from './vehicles.service';

/**
 * Autor completo da avaliação, como está no banco, com dados sensíveis reais.
 */
const FULL_AUTHOR = {
  id: 'user-author-1',
  email: 'autor-secreto@exemplo.com',
  passwordHash: 'PWHASH-SECRETO',
  refreshTokenHash: 'RT-SECRETO',
  emailVerificationToken: 'EVT-SECRETO',
  tokenVersion: 7,
  profile: {
    id: 'profile-1',
    userId: 'user-author-1',
    fullName: 'Maria Autora',
    phone: '62999990000',
    addressLine: 'Rua Secreta 1',
    city: 'Goiânia',
    state: 'GO',
    avatarUrl: 'https://cdn.exemplo.com/maria.png',
    documentNumber: '123.456.789-00',
    driverLicenseNumber: 'CNH-SECRETA',
  },
};

/** Simula o Prisma: devolve só os campos pedidos no `select` (aninhados incluídos). */
function pickSelect(source: any, select: any): any {
  if (source == null) return null;
  const out: any = {};
  for (const key of Object.keys(select)) {
    const rule = select[key];
    if (rule === true) {
      out[key] = source[key];
    } else if (rule && typeof rule === 'object' && rule.select) {
      out[key] = pickSelect(source[key], rule.select);
    }
  }
  return out;
}

function fakeVehicle() {
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
    minRentalDays: null,
    isActive: true,
    isPublished: true,
    isFeatured: false,
    latitude: null,
    longitude: null,
    ratingAverage: '4.5',
    reviewsCount: 1,
    images: [],
    reviews: [
      {
        id: 'review-1',
        rating: 5,
        comment: 'Ótimo',
        createdAt: new Date('2026-11-01T10:00:00Z'),
        author: FULL_AUTHOR,
      },
    ],
    _count: { views: 0 },
    owner: {
      id: 'owner-1',
      profile: null,
      userReviewsReceived: [],
    },
  };
}

function buildService() {
  const vehicle = fakeVehicle();
  const prisma = {
    vehicle: {
      findFirst: jest.fn(async (args: any) => {
        const reviewsArg = args.include.reviews;
        const reviews = vehicle.reviews.map((review) => ({
          ...review,
          author: pickSelect(review.author, reviewsArg.include.author.select),
        }));
        return { ...vehicle, reviews };
      }),
      update: jest.fn().mockResolvedValue(vehicle),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(1),
    },
    vehicleView: { groupBy: jest.fn().mockResolvedValue([]) },
    favorite: { groupBy: jest.fn().mockResolvedValue([]) },
    chatConversation: {
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const cache = {
    getJson: jest.fn().mockResolvedValue(null),
    setJson: jest.fn().mockResolvedValue(undefined),
  };
  const service = new VehiclesService(
    prisma as any,
    cache as any,
    {} as any,
    { assertCanPublish: jest.fn().mockResolvedValue(undefined) } as any,
  );
  return { service, prisma };
}

const SENSITIVE_KEYS = [
  'passwordHash',
  'refreshTokenHash',
  'emailVerificationToken',
  'tokenVersion',
  'documentNumber',
  'addressLine',
  'email',
  'phone',
  'driverLicenseNumber',
];

const SENSITIVE_VALUES = [
  'PWHASH-SECRETO',
  'RT-SECRETO',
  'EVT-SECRETO',
  '123.456.789-00',
  'Rua Secreta 1',
  'autor-secreto@exemplo.com',
  '62999990000',
  'CNH-SECRETA',
];

describe('VehiclesService.findOne (detalhe público)', () => {
  it('não pede o profile inteiro do autor da avaliação ao Prisma', async () => {
    const { service, prisma } = buildService();
    await service.findOne('gol-1');

    const args = prisma.vehicle.findFirst.mock.calls[0][0] as any;
    const authorArg = args.include.reviews.include.author;
    expect(authorArg.include).toBeUndefined();
    expect(authorArg.select.profile.select.documentNumber).toBeUndefined();
    expect(authorArg.select.passwordHash).toBeUndefined();
  });

  it('a resposta não contém nenhum dado sensível do autor da avaliação', async () => {
    const { service } = buildService();
    const result: any = await service.findOne('gol-1');
    // Escopo: seção de avaliações. O campo `owner.phone` é do dono do anúncio
    // (mapOwnerSummary, já existente), não do autor da avaliação.
    const reviewsJson = JSON.stringify(result.reviews);
    const json = JSON.stringify(result);

    for (const key of SENSITIVE_KEYS) {
      expect(reviewsJson).not.toContain(`"${key}"`);
    }
    for (const value of SENSITIVE_VALUES) {
      expect(json).not.toContain(value);
    }
  });

  it('mantém o nome do autor da avaliação na resposta', async () => {
    const { service } = buildService();
    const result: any = await service.findOne('gol-1');

    expect(result.reviews[0].author).toEqual({
      id: 'user-author-1',
      fullName: 'Maria Autora',
    });
  });
});
