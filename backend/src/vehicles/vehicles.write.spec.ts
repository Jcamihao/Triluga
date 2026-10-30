import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { MIN_RENTAL_DAYS_OPTIONS } from './rental-pricing';
import { VehiclesService } from './vehicles.service';

const OWNER_ID = 'owner-1';
const VEHICLE_ID = 'vehicle-1';

const baseDto = {
  title: 'Gol 1.0',
  brand: 'VW',
  model: 'Gol',
  year: 2020,
  plate: 'ABC1D23',
  city: 'Goiânia',
  state: 'go',
  category: 'ECONOMY',
  transmission: 'MANUAL',
  fuelType: 'FLEX',
  seats: 5,
  description: 'Carro em ótimo estado.',
};

/** Prisma falso: guarda o `data` recebido por vehicle.create/update. */
function buildService() {
  const captured: { create?: any; update?: any } = {};

  const prisma = {
    vehicle: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: VEHICLE_ID, ownerId: OWNER_ID }),
      create: jest.fn(async ({ data }: any) => {
        captured.create = data;
        return fakeVehicle(data);
      }),
      update: jest.fn(async ({ data }: any) => {
        captured.update = data;
        return fakeVehicle(data);
      }),
    },
  };
  const cache = {
    del: jest.fn().mockResolvedValue(undefined),
    invalidateByPrefix: jest.fn().mockResolvedValue(undefined),
  };
  const alerts = {
    notifyMatchingUsers: jest.fn().mockResolvedValue(undefined),
  };

  const service = new VehiclesService(
    prisma as any,
    cache as any,
    alerts as any,
  );
  return { service, captured };
}

function fakeVehicle(data: any) {
  return {
    id: VEHICLE_ID,
    dailyRate: 100,
    isActive: true,
    isPublished: true,
    ratingAverage: 0,
    reviewsCount: 0,
    ...data,
    images: [],
    owner: { id: OWNER_ID, profile: null, userReviewsReceived: [] },
  };
}

async function errorsFor(
  overrides: Record<string, unknown>,
  omit: string[] = [],
) {
  const plain: Record<string, unknown> = { ...baseDto, ...overrides };
  for (const key of omit) delete plain[key];
  const errors = await validate(plainToInstance(CreateVehicleDto, plain));
  return errors.map((e) => e.property);
}

describe('VehiclesService.create (preço por diária)', () => {
  it('dailyRate novo grava dailyRate e minRentalDays', async () => {
    const { service, captured } = buildService();
    await service.create(OWNER_ID, {
      ...baseDto,
      dailyRate: 120,
      minRentalDays: 30,
    } as any);

    expect(captured.create.dailyRate).toBe(120);
    expect(captured.create.minRentalDays).toBe(30);
    expect(captured.create).not.toHaveProperty('weeklyRate');
  });

  it('cliente legado com weeklyRate 700 e dailyRate 700 grava dailyRate 100', async () => {
    const { service, captured } = buildService();
    await service.create(OWNER_ID, {
      ...baseDto,
      weeklyRate: 700,
      dailyRate: 700,
    } as any);

    expect(captured.create.dailyRate).toBe(100);
    expect(captured.create).not.toHaveProperty('weeklyRate');
  });

  it('cliente legado só com weeklyRate grava weeklyRate ÷ 7', async () => {
    const { service, captured } = buildService();
    await service.create(OWNER_ID, { ...baseDto, weeklyRate: 699 } as any);

    expect(captured.create.dailyRate).toBe(99.86);
  });

  it('sem tempo mínimo grava minRentalDays null', async () => {
    const { service, captured } = buildService();
    await service.create(OWNER_ID, { ...baseDto, dailyRate: 120 } as any);

    expect(captured.create.minRentalDays).toBeNull();
  });

  it('sem dailyRate e sem weeklyRate lança BadRequestException', async () => {
    const { service } = buildService();
    await expect(
      service.create(OWNER_ID, { ...baseDto } as any),
    ).rejects.toThrow('dailyRate');
  });
});

describe('VehiclesService.update (preço por diária)', () => {
  it('nunca envia weeklyRate ao Prisma e converte ÷ 7', async () => {
    const { service, captured } = buildService();
    await service.update(OWNER_ID, VEHICLE_ID, {
      weeklyRate: 700,
      dailyRate: 700,
    } as any);

    expect(captured.update).not.toHaveProperty('weeklyRate');
    expect(captured.update.dailyRate).toBe(100);
  });

  it('dailyRate novo é gravado', async () => {
    const { service, captured } = buildService();
    await service.update(OWNER_ID, VEHICLE_ID, { dailyRate: 150 } as any);

    expect(captured.update.dailyRate).toBe(150);
    expect(captured.update).not.toHaveProperty('weeklyRate');
  });

  it('minRentalDays null remove o tempo mínimo', async () => {
    const { service, captured } = buildService();
    await service.update(OWNER_ID, VEHICLE_ID, { minRentalDays: null });

    expect(captured.update).toHaveProperty('minRentalDays', null);
  });

  it('minRentalDays informado é gravado', async () => {
    const { service, captured } = buildService();
    await service.update(OWNER_ID, VEHICLE_ID, { minRentalDays: 14 });

    expect(captured.update.minRentalDays).toBe(14);
  });

  it('update vazio não altera dailyRate nem minRentalDays', async () => {
    const { service, captured } = buildService();
    await service.update(OWNER_ID, VEHICLE_ID, {});

    expect(captured.update).not.toHaveProperty('dailyRate');
    expect(captured.update).not.toHaveProperty('minRentalDays');
    expect(captured.update).not.toHaveProperty('weeklyRate');
  });
});

describe('CreateVehicleDto (validação de preço)', () => {
  it.each([5, 0, -1, '30', 1.5])('minRentalDays %p é inválido', async (v) => {
    expect(await errorsFor({ dailyRate: 100, minRentalDays: v })).toContain(
      'minRentalDays',
    );
  });

  it.each([...MIN_RENTAL_DAYS_OPTIONS, null])(
    'minRentalDays %p é válido',
    async (v) => {
      expect(await errorsFor({ dailyRate: 100, minRentalDays: v })).toEqual([]);
    },
  );

  it('minRentalDays ausente é válido', async () => {
    expect(await errorsFor({ dailyRate: 100 })).toEqual([]);
  });

  it('sem dailyRate e sem weeklyRate é inválido', async () => {
    expect(await errorsFor({})).toContain('dailyRate');
  });

  it('dailyRate 0.5 é inválido (mínimo 1)', async () => {
    expect(await errorsFor({ dailyRate: 0.5 })).toContain('dailyRate');
  });

  it('dailyRate com 3 casas decimais é inválido', async () => {
    expect(await errorsFor({ dailyRate: 10.123 })).toContain('dailyRate');
  });

  it('só weeklyRate (legado) é válido', async () => {
    expect(await errorsFor({ weeklyRate: 700 })).toEqual([]);
  });

  it('weeklyRate 0.5 é inválido (mínimo 1)', async () => {
    expect(await errorsFor({ weeklyRate: 0.5 })).toContain('weeklyRate');
  });

  it('UpdateVehicleDto vazio é válido', async () => {
    const errors = await validate(plainToInstance(UpdateVehicleDto, {}));
    expect(errors).toEqual([]);
  });
});
