import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';
import { EntitlementsService, EntitlementsUsage } from './entitlements.service';

const NOW = new Date('2026-11-13T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const USAGE: EntitlementsUsage = {
  enforced: true,
  plan: 'FREE',
  ads: { used: 2, limit: 3 },
};

function build(
  opts: {
    enabled?: boolean;
    subs?: Record<string, unknown>[];
    usage?: EntitlementsUsage;
    user?: { id: string; email: string; name: string } | null;
    grant?: Record<string, unknown> | null;
  } = {},
) {
  const prisma = {
    subscription: {
      findMany: jest.fn().mockResolvedValue(opts.subs ?? []),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(opts.grant ?? null),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(opts.user ?? null),
    },
  };
  const entitlements = {
    getUsage: jest.fn().mockResolvedValue(opts.usage ?? USAGE),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'billing.enabled' ? (opts.enabled ?? true) : undefined,
    ),
  };
  const service = new BillingService(
    prisma as any,
    entitlements as unknown as EntitlementsService,
    config as unknown as ConfigService,
  );
  return { prisma, entitlements, config, service };
}

function sub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    ownerUserId: 'user-1',
    plan: 'PROFESSIONAL',
    status: 'ACTIVE',
    source: 'ASAAS',
    interval: 'MONTHLY',
    currentPeriodEnd: new Date(NOW.getTime() + 20 * DAY),
    cancelAtPeriodEnd: false,
    latestInvoiceUrl: null,
    createdAt: NOW,
    owner: { email: 'dono@exemplo.com', name: 'Dono' },
    ...overrides,
  };
}

describe('BillingService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getPlans', () => {
    it('espelha a flag billing.enabled', () => {
      expect(build({ enabled: true }).service.getPlans().enabled).toBe(true);
      expect(build({ enabled: false }).service.getPlans().enabled).toBe(false);
    });

    it('lista FREE, PROFESSIONAL e FLEET; FREE não tem preço nem é vendável', () => {
      const { plans } = build().service.getPlans();

      expect(plans.map((p) => p.id)).toEqual(['FREE', 'PROFESSIONAL', 'FLEET']);
      expect(plans[0]).toEqual({
        id: 'FREE',
        label: 'Grátis',
        adLimit: 3,
        sellable: false,
        prices: null,
      });
      expect(plans[1]).toMatchObject({
        id: 'PROFESSIONAL',
        adLimit: 10,
        sellable: true,
        prices: { MONTHLY: 29.9, YEARLY: 299 },
      });
      expect(plans[2]).toMatchObject({
        id: 'FLEET',
        adLimit: null,
        sellable: true,
        prices: { MONTHLY: 79.9, YEARLY: 799 },
      });
    });
  });

  describe('getMe', () => {
    it('sem assinatura: plano FREE e status, source, interval e fim nulos', async () => {
      const { service, prisma } = build({ subs: [] });

      const me = await service.getMe('user-1');

      expect(prisma.subscription.findMany).toHaveBeenCalledWith({
        where: { ownerUserId: 'user-1' },
      });
      expect(me).toEqual({
        enabled: true,
        plan: 'FREE',
        status: null,
        source: null,
        interval: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        latestInvoiceUrl: null,
        usage: USAGE,
      });
    });

    it('concessão GRANT sem fim: plano da concessão e currentPeriodEnd null', async () => {
      const { service } = build({
        subs: [
          sub({
            plan: 'FLEET',
            source: 'GRANT',
            interval: null,
            currentPeriodEnd: null,
          }),
        ],
      });

      const me = await service.getMe('user-1');

      expect(me).toMatchObject({
        plan: 'FLEET',
        status: 'ACTIVE',
        source: 'GRANT',
        interval: null,
        currentPeriodEnd: null,
      });
    });

    it('CANCELED com fim futuro: plano pago e cancelAtPeriodEnd true', async () => {
      const end = new Date(NOW.getTime() + 5 * DAY);
      const { service } = build({
        subs: [
          sub({
            status: 'CANCELED',
            cancelAtPeriodEnd: true,
            currentPeriodEnd: end,
          }),
        ],
      });

      const me = await service.getMe('user-1');

      expect(me).toMatchObject({
        plan: 'PROFESSIONAL',
        status: 'CANCELED',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: end.toISOString(),
      });
    });

    it('CANCELED já vencido não dá plano', async () => {
      const { service } = build({
        subs: [
          sub({
            status: 'CANCELED',
            currentPeriodEnd: new Date(NOW.getTime() - DAY),
          }),
        ],
      });

      const me = await service.getMe('user-1');

      expect(me.plan).toBe('FREE');
      expect(me.status).toBeNull();
    });

    it('PENDING e EXPIRED nunca dão plano', async () => {
      const { service } = build({
        subs: [
          sub({ status: 'PENDING' }),
          sub({ id: 'sub-2', status: 'EXPIRED' }),
        ],
      });

      const me = await service.getMe('user-1');

      expect(me.plan).toBe('FREE');
      expect(me.status).toBeNull();
    });

    it('PAST_DUE de assinatura ASAAS dentro da tolerância segue dando plano', async () => {
      const { service } = build({
        subs: [
          sub({
            status: 'PAST_DUE',
            currentPeriodEnd: new Date(NOW.getTime() - 2 * DAY),
            latestInvoiceUrl: 'https://asaas.example/fatura',
          }),
        ],
      });

      const me = await service.getMe('user-1');

      expect(me).toMatchObject({
        plan: 'PROFESSIONAL',
        status: 'PAST_DUE',
        latestInvoiceUrl: 'https://asaas.example/fatura',
      });
    });

    it('a assinatura exibida é a que sustenta o plano efetivo', async () => {
      const grantEnd = new Date(NOW.getTime() + 3 * DAY);
      const { service } = build({
        subs: [
          sub({ id: 'sub-asaas', plan: 'PROFESSIONAL', interval: 'YEARLY' }),
          sub({
            id: 'sub-grant',
            plan: 'FLEET',
            source: 'GRANT',
            interval: null,
            currentPeriodEnd: grantEnd,
          }),
        ],
      });

      const me = await service.getMe('user-1');

      expect(me).toMatchObject({
        plan: 'FLEET',
        source: 'GRANT',
        interval: null,
        currentPeriodEnd: grantEnd.toISOString(),
      });
    });

    it('repassa interval da assinatura ASAAS que dá o plano', async () => {
      const { service } = build({
        subs: [sub({ interval: 'YEARLY' })],
      });

      const me = await service.getMe('user-1');

      expect(me).toMatchObject({ source: 'ASAAS', interval: 'YEARLY' });
    });

    it('com a flag desligada responde normalmente e usage.enforced é false', async () => {
      const { service } = build({
        enabled: false,
        subs: [],
        usage: { enforced: false, plan: 'FREE', ads: { used: 5, limit: 3 } },
      });

      const me = await service.getMe('user-1');

      expect(me.enabled).toBe(false);
      expect(me.plan).toBe('FREE');
      expect(me.usage.enforced).toBe(false);
    });

    it('consulta só as assinaturas do userId informado', async () => {
      const { service, prisma, entitlements } = build();

      await service.getMe('user-42');

      expect(prisma.subscription.findMany).toHaveBeenCalledWith({
        where: { ownerUserId: 'user-42' },
      });
      expect(entitlements.getUsage).toHaveBeenCalledWith('user-42');
    });
  });

  describe('listGrants', () => {
    it('lista só concessões GRANT na forma { id, email, plan, currentPeriodEnd, status, createdAt }', async () => {
      const end = new Date(NOW.getTime() + 10 * DAY);
      const { service, prisma } = build();
      prisma.subscription.findMany.mockResolvedValue([
        sub({
          id: 'g1',
          source: 'GRANT',
          plan: 'FLEET',
          currentPeriodEnd: end,
        }),
      ]);

      const grants = await service.listGrants();

      expect(prisma.subscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { source: 'GRANT' },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(grants).toEqual([
        {
          id: 'g1',
          email: 'dono@exemplo.com',
          plan: 'FLEET',
          currentPeriodEnd: end.toISOString(),
          status: 'ACTIVE',
          createdAt: NOW.toISOString(),
        },
      ]);
    });
  });

  describe('createGrant', () => {
    const ADMIN_ID = 'admin-1';
    const USER = { id: 'user-9', email: 'pessoa@exemplo.com', name: 'Pessoa' };

    it('e-mail inexistente: NotFoundException e nada gravado', async () => {
      const { service, prisma } = build({ user: null });

      await expect(
        service.createGrant(ADMIN_ID, {
          email: 'ninguem@exemplo.com',
          plan: 'FLEET',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.subscription.create).not.toHaveBeenCalled();
    });

    it('normaliza o e-mail antes de buscar o usuário', async () => {
      const { service, prisma } = build({ user: USER });
      prisma.subscription.create.mockResolvedValue(
        sub({
          ownerUserId: USER.id,
          source: 'GRANT',
          plan: 'FLEET',
          currentPeriodEnd: null,
        }),
      );

      await service.createGrant(ADMIN_ID, {
        email: '  Pessoa@Exemplo.com ',
        plan: 'FLEET',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'pessoa@exemplo.com' } }),
      );
    });

    it('sem endsAt: grava GRANT, ACTIVE, grantedByUserId = admin e currentPeriodEnd null', async () => {
      const { service, prisma } = build({ user: USER });
      prisma.subscription.create.mockResolvedValue(
        sub({
          ownerUserId: USER.id,
          source: 'GRANT',
          plan: 'PROFESSIONAL',
          currentPeriodEnd: null,
        }),
      );

      await service.createGrant(ADMIN_ID, {
        email: USER.email,
        plan: 'PROFESSIONAL',
      });

      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: {
          ownerUserId: USER.id,
          plan: 'PROFESSIONAL',
          source: 'GRANT',
          status: 'ACTIVE',
          currentPeriodEnd: null,
          grantedByUserId: ADMIN_ID,
        },
      });
    });

    it('com endsAt futuro: currentPeriodEnd = endsAt', async () => {
      const endsAt = new Date(NOW.getTime() + 30 * DAY).toISOString();
      const { service, prisma } = build({ user: USER });
      prisma.subscription.create.mockResolvedValue(
        sub({
          ownerUserId: USER.id,
          source: 'GRANT',
          plan: 'FLEET',
          currentPeriodEnd: new Date(endsAt),
        }),
      );

      const view = await service.createGrant(ADMIN_ID, {
        email: USER.email,
        plan: 'FLEET',
        endsAt,
      });

      expect(prisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentPeriodEnd: new Date(endsAt) }),
        }),
      );
      expect(view.currentPeriodEnd).toBe(endsAt);
    });

    it('endsAt no passado: BadRequestException e nada gravado', async () => {
      const { service, prisma } = build({ user: USER });

      await expect(
        service.createGrant(ADMIN_ID, {
          email: USER.email,
          plan: 'FLEET',
          endsAt: new Date(NOW.getTime() - DAY).toISOString(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.subscription.create).not.toHaveBeenCalled();
    });

    it('já tem concessão ativa do mesmo plano: BadRequestException', async () => {
      const { service, prisma } = build({ user: USER });
      prisma.subscription.findFirst.mockResolvedValue(sub({ source: 'GRANT' }));

      await expect(
        service.createGrant(ADMIN_ID, { email: USER.email, plan: 'FLEET' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.subscription.create).not.toHaveBeenCalled();
    });
  });

  describe('revokeGrant', () => {
    it('id inexistente: NotFoundException', async () => {
      const { service, prisma } = build({ grant: null });

      await expect(service.revokeGrant('nada')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });

    it('assinatura ASAAS: BadRequestException e nada alterado', async () => {
      const { service, prisma } = build({ grant: sub({ source: 'ASAAS' }) });

      await expect(service.revokeGrant('sub-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });

    it('concessão: marca EXPIRED sem apagar a linha', async () => {
      const { service, prisma } = build({
        grant: sub({ id: 'g1', source: 'GRANT' }),
      });
      prisma.subscription.update.mockResolvedValue(
        sub({ id: 'g1', source: 'GRANT', status: 'EXPIRED' }),
      );

      const view = await service.revokeGrant('g1');

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'g1' },
          data: { status: 'EXPIRED' },
        }),
      );
      expect(view.status).toBe('EXPIRED');
    });
  });
});
