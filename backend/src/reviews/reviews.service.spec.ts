import { ReviewsService } from './reviews.service';

/**
 * Autor completo como está no banco (User + Profile), com dados sensíveis reais.
 * Qualquer campo abaixo que aparecer numa resposta pública é vazamento.
 */
const FULL_AUTHOR = {
  id: 'user-author-1',
  email: 'autor-secreto@exemplo.com',
  passwordHash: 'PWHASH-SECRETO',
  refreshTokenHash: 'RT-SECRETO',
  emailVerificationToken: 'EVT-SECRETO',
  tokenVersion: 7,
  role: 'USER',
  status: 'ACTIVE',
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

/** Simula o Prisma: devolve só os campos pedidos no `select` do autor. */
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

function buildService(reviewRows: any[]) {
  const prisma = {
    review: {
      findMany: jest.fn(async (args: any) =>
        reviewRows.map((row) => {
          const authorArg = args.include.author;
          const author = authorArg.select
            ? pickSelect(row.author, authorArg.select)
            : row.author;
          return { ...row, author };
        }),
      ),
    },
  };
  const service = new ReviewsService(prisma as any, {} as any);
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

describe('ReviewsService.listByVehicle (público)', () => {
  const rows = [
    {
      id: 'review-1',
      vehicleId: 'vehicle-1',
      authorId: 'user-author-1',
      ownerId: 'owner-1',
      rating: 5,
      comment: 'Ótimo',
      createdAt: new Date('2026-11-01T10:00:00Z'),
      author: FULL_AUTHOR,
    },
  ];

  it('não pede o profile inteiro nem o User inteiro ao Prisma', async () => {
    const { service, prisma } = buildService(rows);
    await service.listByVehicle('vehicle-1');

    const args = prisma.review.findMany.mock.calls[0][0] as any;
    expect(args.include.author.include).toBeUndefined();
    expect(args.include.author.select).toBeDefined();
    expect(
      args.include.author.select.profile.select.documentNumber,
    ).toBeUndefined();
    expect(
      args.include.author.select.profile.select.addressLine,
    ).toBeUndefined();
    expect(args.include.author.select.passwordHash).toBeUndefined();
  });

  it('a resposta não contém nenhum dado sensível do autor', async () => {
    const { service } = buildService(rows);
    const result = await service.listByVehicle('vehicle-1');
    const json = JSON.stringify(result);

    for (const key of SENSITIVE_KEYS) {
      expect(json).not.toContain(`"${key}"`);
    }
    for (const value of SENSITIVE_VALUES) {
      expect(json).not.toContain(value);
    }
  });

  it('mantém nome e avatar do autor na resposta', async () => {
    const { service } = buildService(rows);
    const [review] = (await service.listByVehicle('vehicle-1')) as any[];

    expect(review.author).toEqual({
      id: 'user-author-1',
      profile: {
        fullName: 'Maria Autora',
        avatarUrl: 'https://cdn.exemplo.com/maria.png',
      },
    });
  });
});
