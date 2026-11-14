import { ConfigService } from '@nestjs/config';
import { EntitlementsService } from './entitlements.service';
import { PlanLimitException } from './plan-limit.exception';

const NOW = new Date('2026-11-13T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function makePrisma() {
  return {
    subscription: { findMany: jest.fn().mockResolvedValue([]) },
    vehicle: { count: jest.fn().mockResolvedValue(0) },
  };
}

function build(enabled: boolean) {
  const prisma = makePrisma();
  const config = {
    get: jest.fn((key: string) =>
      key === 'billing.enabled' ? enabled : undefined,
    ),
  };
  const service = new EntitlementsService(
    prisma as any,
    config as unknown as ConfigService,
  );
  return { prisma, config, service };
}

function paidSub(overrides: Record<string, unknown> = {}) {
  return {
    plan: 'PROFESSIONAL',
    status: 'ACTIVE',
    source: 'ASAAS',
    currentPeriodEnd: new Date(NOW.getTime() + 20 * DAY),
    ...overrides,
  };
}

async function limitError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (e) {
    return e as PlanLimitException;
  }
  throw new Error('esperava PlanLimitException');
}

describe('EntitlementsService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('isEnforced', () => {
    it('reflete a flag billing.enabled', () => {
      expect(build(true).service.isEnforced()).toBe(true);
      expect(build(false).service.isEnforced()).toBe(false);
    });
  });

  describe('interruptor desligado', () => {
    it('assertCanPublish nunca lança, mesmo com 50 anúncios', async () => {
      const { prisma, service } = build(false);
      prisma.vehicle.count.mockResolvedValue(50);
      await expect(service.assertCanPublish('u1')).resolves.toBeUndefined();
    });

    it('assertCanPublish não toca no banco', async () => {
      const { prisma, service } = build(false);
      await service.assertCanPublish('u1');
      expect(prisma.vehicle.count).not.toHaveBeenCalled();
      expect(prisma.subscription.findMany).not.toHaveBeenCalled();
    });

    it('resolvePlan continua devolvendo o plano real', async () => {
      const { prisma, service } = build(false);
      prisma.subscription.findMany.mockResolvedValue([paidSub()]);
      await expect(service.resolvePlan('u1')).resolves.toBe('PROFESSIONAL');
    });
  });

  describe('assertCanPublish (ligado)', () => {
    it('FREE com 2 anúncios contados passa', async () => {
      const { prisma, service } = build(true);
      prisma.vehicle.count.mockResolvedValue(2);
      await expect(service.assertCanPublish('u1')).resolves.toBeUndefined();
    });

    it('FREE com 3 anúncios contados lança PlanLimitException', async () => {
      const { prisma, service } = build(true);
      prisma.vehicle.count.mockResolvedValue(3);
      const err = await limitError(service.assertCanPublish('u1'));
      expect(err).toBeInstanceOf(PlanLimitException);
      expect(err.getResponse()).toMatchObject({
        statusCode: 403,
        error: 'Forbidden',
        code: 'PLAN_LIMIT',
        limit: 3,
        used: 3,
        plan: 'FREE',
      });
    });

    it('FREE com 40 anúncios (excedente) também lança', async () => {
      const { prisma, service } = build(true);
      prisma.vehicle.count.mockResolvedValue(40);
      const err = await limitError(service.assertCanPublish('u1'));
      expect(err.getResponse()).toMatchObject({
        code: 'PLAN_LIMIT',
        limit: 3,
        used: 40,
        plan: 'FREE',
      });
    });

    it('mensagem cita o limite e o nome do plano', async () => {
      const { prisma, service } = build(true);
      prisma.vehicle.count.mockResolvedValue(3);
      const err = await limitError(service.assertCanPublish('u1'));
      expect(err.getResponse()).toMatchObject({
        message:
          'Você atingiu o limite de 3 anúncios do plano Grátis. Veja os planos em Plano.',
      });
    });

    it('conta anúncios filtrando dono, ativos e publicados', async () => {
      const { prisma, service } = build(true);
      await service.assertCanPublish('u1');
      expect(prisma.vehicle.count).toHaveBeenCalledWith({
        where: { ownerId: 'u1', isActive: true, isPublished: true },
      });
    });

    it('PROFESSIONAL com 9 passa e com 10 lança', async () => {
      const { prisma, service } = build(true);
      prisma.subscription.findMany.mockResolvedValue([paidSub()]);
      prisma.vehicle.count.mockResolvedValue(9);
      await expect(service.assertCanPublish('u1')).resolves.toBeUndefined();

      prisma.vehicle.count.mockResolvedValue(10);
      const err = await limitError(service.assertCanPublish('u1'));
      expect(err.getResponse()).toMatchObject({
        limit: 10,
        used: 10,
        plan: 'PROFESSIONAL',
      });
    });

    it('FLEET nunca lança, mesmo com 500 anúncios', async () => {
      const { prisma, service } = build(true);
      prisma.subscription.findMany.mockResolvedValue([
        paidSub({ plan: 'FLEET' }),
      ]);
      prisma.vehicle.count.mockResolvedValue(500);
      await expect(service.assertCanPublish('u1')).resolves.toBeUndefined();
    });

    it('concessão vencida há 2 dias cai no limite FREE', async () => {
      const { prisma, service } = build(true);
      prisma.subscription.findMany.mockResolvedValue([
        paidSub({
          plan: 'FLEET',
          source: 'GRANT',
          currentPeriodEnd: new Date(NOW.getTime() - 2 * DAY),
        }),
      ]);
      prisma.vehicle.count.mockResolvedValue(3);
      const err = await limitError(service.assertCanPublish('u1'));
      expect(err.getResponse()).toMatchObject({ plan: 'FREE', limit: 3 });
    });

    it('assinatura PENDING não concede acesso (continua FREE)', async () => {
      const { prisma, service } = build(true);
      prisma.subscription.findMany.mockResolvedValue([
        paidSub({ status: 'PENDING' }),
      ]);
      prisma.vehicle.count.mockResolvedValue(3);
      const err = await limitError(service.assertCanPublish('u1'));
      expect(err.getResponse()).toMatchObject({ plan: 'FREE' });
    });
  });

  describe('resolvePlan', () => {
    it('busca só assinaturas do próprio userId', async () => {
      const { prisma, service } = build(true);
      await service.resolvePlan('u1');
      expect(prisma.subscription.findMany).toHaveBeenCalledWith({
        where: { ownerUserId: 'u1' },
      });
    });

    it('sem assinatura devolve FREE', async () => {
      const { service } = build(true);
      await expect(service.resolvePlan('u1')).resolves.toBe('FREE');
    });
  });

  describe('getUsage', () => {
    it('devolve enforced, plano e uso de anúncios', async () => {
      const { prisma, service } = build(true);
      prisma.vehicle.count.mockResolvedValue(2);
      await expect(service.getUsage('u1')).resolves.toEqual({
        enforced: true,
        plan: 'FREE',
        ads: { used: 2, limit: 3 },
      });
    });

    it('enforced reflete a flag desligada', async () => {
      const { service } = build(false);
      await expect(service.getUsage('u1')).resolves.toMatchObject({
        enforced: false,
      });
    });

    it('FLEET devolve limit null', async () => {
      const { prisma, service } = build(true);
      prisma.subscription.findMany.mockResolvedValue([
        paidSub({ plan: 'FLEET' }),
      ]);
      prisma.vehicle.count.mockResolvedValue(42);
      await expect(service.getUsage('u1')).resolves.toEqual({
        enforced: true,
        plan: 'FLEET',
        ads: { used: 42, limit: null },
      });
    });
  });
});
