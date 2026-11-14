import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PlanLimitException } from '../billing/plan-limit.exception';
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
function buildService(
  current: Record<string, unknown> = {
    id: VEHICLE_ID,
    ownerId: OWNER_ID,
    isPublished: true,
    isActive: true,
  },
) {
  const captured: { create?: any; update?: any } = {};

  const prisma = {
    vehicle: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(current),
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

  const entitlements = {
    assertCanPublish: jest.fn().mockResolvedValue(undefined),
  };

  const service = new VehiclesService(
    prisma as any,
    cache as any,
    alerts as any,
    entitlements as any,
  );
  return { service, captured, prisma, entitlements };
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
  // Mesmas opções do ValidationPipe global (main.ts).
  const errors = await validate(
    plainToInstance(CreateVehicleDto, plain, {
      enableImplicitConversion: true,
    }),
    { whitelist: true, forbidNonWhitelisted: true },
  );
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

  it.each([
    { dailyRate: null },
    { weeklyRate: null },
    { dailyRate: null, weeklyRate: null },
  ])(
    'preço null sem outro valor válido (%j) lança BadRequestException',
    async (dto) => {
      const { service, captured } = buildService();

      await expect(
        service.update(OWNER_ID, VEHICLE_ID, dto as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update(OWNER_ID, VEHICLE_ID, dto as any),
      ).rejects.toThrow('Informe um valor de diária válido.');
      expect(captured.update).toBeUndefined();
    },
  );

  it('dailyRate null com weeklyRate válido (legado) é aceito', async () => {
    const { service, captured } = buildService();
    await service.update(OWNER_ID, VEHICLE_ID, {
      dailyRate: null,
      weeklyRate: 700,
    } as any);

    expect(captured.update.dailyRate).toBe(100);
  });

  it('update vazio não altera dailyRate nem minRentalDays', async () => {
    const { service, captured } = buildService();
    await service.update(OWNER_ID, VEHICLE_ID, {});

    expect(captured.update).not.toHaveProperty('dailyRate');
    expect(captured.update).not.toHaveProperty('minRentalDays');
    expect(captured.update).not.toHaveProperty('weeklyRate');
  });
});

describe('VehiclesService (limite de anúncios do plano)', () => {
  const limitError = () =>
    new PlanLimitException({ limit: 3, used: 3, plan: 'FREE' });
  const createDto = () => ({ ...baseDto, dailyRate: 100 }) as any;

  describe('create', () => {
    it('isPublished omitido chama assertCanPublish antes de prisma.vehicle.create', async () => {
      const { service, prisma, entitlements } = buildService();
      await service.create(OWNER_ID, createDto());

      expect(entitlements.assertCanPublish).toHaveBeenCalledWith(OWNER_ID);
      expect(
        entitlements.assertCanPublish.mock.invocationCallOrder[0],
      ).toBeLessThan(prisma.vehicle.create.mock.invocationCallOrder[0]);
    });

    it('isPublished false (rascunho) não chama assertCanPublish', async () => {
      const { service, prisma, entitlements } = buildService();
      await service.create(OWNER_ID, { ...createDto(), isPublished: false });

      expect(entitlements.assertCanPublish).not.toHaveBeenCalled();
      expect(prisma.vehicle.create).toHaveBeenCalled();
    });

    it('rejeição de assertCanPublish impede prisma.vehicle.create', async () => {
      const { service, prisma, entitlements } = buildService();
      entitlements.assertCanPublish.mockRejectedValueOnce(limitError());

      await expect(service.create(OWNER_ID, createDto())).rejects.toThrow(
        PlanLimitException,
      );
      expect(prisma.vehicle.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const unpublishedActive = {
      id: VEHICLE_ID,
      ownerId: OWNER_ID,
      isPublished: false,
      isActive: true,
    };

    it('isPublished true em anúncio despublicado e ativo chama assertCanPublish antes de prisma.vehicle.update', async () => {
      const { service, prisma, entitlements } = buildService(unpublishedActive);
      await service.update(OWNER_ID, VEHICLE_ID, { isPublished: true } as any);

      expect(entitlements.assertCanPublish).toHaveBeenCalledWith(OWNER_ID);
      expect(
        entitlements.assertCanPublish.mock.invocationCallOrder[0],
      ).toBeLessThan(prisma.vehicle.update.mock.invocationCallOrder[0]);
    });

    it('editar anúncio já publicado não chama assertCanPublish', async () => {
      const { service, entitlements } = buildService({
        id: VEHICLE_ID,
        ownerId: OWNER_ID,
        isPublished: true,
        isActive: true,
      });
      await service.update(OWNER_ID, VEHICLE_ID, {
        isPublished: true,
        title: 'Novo título',
      } as any);

      expect(entitlements.assertCanPublish).not.toHaveBeenCalled();
    });

    it('isPublished true em anúncio despublicado e inativo não chama assertCanPublish', async () => {
      const { service, entitlements } = buildService({
        ...unpublishedActive,
        isActive: false,
      });
      await service.update(OWNER_ID, VEHICLE_ID, { isPublished: true } as any);

      expect(entitlements.assertCanPublish).not.toHaveBeenCalled();
    });

    it('update sem isPublished não chama assertCanPublish', async () => {
      const { service, entitlements } = buildService(unpublishedActive);
      await service.update(OWNER_ID, VEHICLE_ID, { title: 'X' } as any);

      expect(entitlements.assertCanPublish).not.toHaveBeenCalled();
    });

    it('isPublished false (despublicar) não chama assertCanPublish', async () => {
      const { service, entitlements } = buildService({
        id: VEHICLE_ID,
        ownerId: OWNER_ID,
        isPublished: true,
        isActive: true,
      });
      await service.update(OWNER_ID, VEHICLE_ID, {
        isPublished: false,
      } as any);

      expect(entitlements.assertCanPublish).not.toHaveBeenCalled();
    });

    it('rejeição de assertCanPublish impede prisma.vehicle.update', async () => {
      const { service, prisma, entitlements } = buildService(unpublishedActive);
      entitlements.assertCanPublish.mockRejectedValueOnce(limitError());

      await expect(
        service.update(OWNER_ID, VEHICLE_ID, { isPublished: true } as any),
      ).rejects.toThrow(PlanLimitException);
      expect(prisma.vehicle.update).not.toHaveBeenCalled();
    });
  });
});

describe('CreateVehicleDto (validação de preço)', () => {
  // '30' (string) não entra: com enableImplicitConversion do pipe real vira 30.
  it.each([5, 0, -1, 1.5])('minRentalDays %p é inválido', async (v) => {
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

  it('weeklyRate 0.5 é inválido (mínimo 7)', async () => {
    expect(await errorsFor({ weeklyRate: 0.5 })).toContain('weeklyRate');
  });

  it.each([2, 6.99])(
    'weeklyRate %p é inválido (diária ficaria abaixo de 1)',
    async (v) => {
      expect(await errorsFor({ weeklyRate: v })).toContain('weeklyRate');
    },
  );

  it('weeklyRate 7 é válido (diária 1)', async () => {
    expect(await errorsFor({ weeklyRate: 7 })).toEqual([]);
  });

  it('UpdateVehicleDto vazio é válido', async () => {
    const errors = await validate(plainToInstance(UpdateVehicleDto, {}));
    expect(errors).toEqual([]);
  });
});
