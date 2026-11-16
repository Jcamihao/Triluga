import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodeCrypto from 'crypto';
import { AsaasClient, AsaasClientError } from '../asaas/asaas.client';
import { BillingPaymentsService } from './billing-payments.service';
import { getCatalog } from './plans.catalog';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const FRONT = 'https://triluga.test';

type Row = Record<string, any> & { id: string };

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'sub-x',
    ownerUserId: 'user-1',
    plan: 'PROFESSIONAL',
    status: 'PENDING',
    source: 'ASAAS',
    interval: 'MONTHLY',
    currentPeriodEnd: null,
    pastDueSince: null,
    cancelAtPeriodEnd: false,
    asaasCheckoutId: null,
    asaasCheckoutLink: null,
    asaasSubscriptionId: null,
    asaasCustomerId: null,
    latestInvoiceUrl: null,
    grantedByUserId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** Interpreta só os operadores usados pelo serviço; operador desconhecido quebra o teste. */
function matchCondition(actual: unknown, cond: unknown): boolean {
  if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
    const c = cond as Record<string, any>;
    if ('in' in c) return (c.in as unknown[]).includes(actual);
    if ('not' in c) {
      return c.not === null ? actual !== null : actual !== c.not;
    }
    if ('gt' in c) {
      return (actual as Date).getTime() > (c.gt as Date).getTime();
    }
    throw new Error(
      `operador nao suportado no fake: ${Object.keys(c).join(',')}`,
    );
  }
  return actual === cond;
}

function matchesWhere(r: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, cond]) =>
    matchCondition(r[key], cond),
  );
}

function newestFirst(rows: Row[]): Row[] {
  return [...rows].sort(
    (a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime(),
  );
}

/** Fake em memória de `prisma.subscription` com filtro real (não só retorno fixo). */
function fakePrisma(initial: Row[] = [], initialEvents: Row[] = []) {
  const rows: Row[] = initial.map((r) => ({ ...r }));
  const events: Row[] = initialEvents.map((e) => ({ ...e }));
  let seq = 0;
  let eventSeq = 0;
  const copy = (r: Row) => ({ ...r });

  return {
    rows,
    events,
    billingEvent: {
      create: jest.fn(async ({ data }: any) => {
        if (events.some((e) => e.externalEventId === data.externalEventId)) {
          throw Object.assign(new Error('Unique constraint failed'), {
            code: 'P2002',
          });
        }
        eventSeq += 1;
        const created: Row = {
          id: `evt-${eventSeq}`,
          processedAt: null,
          error: null,
          createdAt: new Date(),
          ...data,
        };
        events.push(created);
        return copy(created);
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const found = events.find(
          (e) => e.externalEventId === where.externalEventId,
        );
        return found ? copy(found) : null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const target = events.find((e) => e.id === where.id);
        if (!target) throw new Error(`evento ${where.id} nao encontrado`);
        Object.assign(target, data);
        return copy(target);
      }),
    },
    subscription: {
      findMany: jest.fn(async ({ where }: any = {}) =>
        rows.filter((r) => matchesWhere(r, where)).map(copy),
      ),
      findFirst: jest.fn(async ({ where, orderBy }: any = {}) => {
        const found = rows.filter((r) => matchesWhere(r, where));
        const ordered = orderBy ? newestFirst(found) : found;
        return ordered[0] ? copy(ordered[0]) : null;
      }),
      create: jest.fn(async ({ data }: any) => {
        seq += 1;
        const created = row({
          ...data,
          id: `sub-new-${seq}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        rows.push(created);
        return copy(created);
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const target = rows.find((r) => r.id === where.id);
        if (!target) throw new Error(`registro ${where.id} nao encontrado`);
        Object.assign(target, data);
        return copy(target);
      }),
    },
  };
}

function fakeAsaas() {
  let seq = 0;
  return {
    createCheckout: jest.fn(async () => {
      seq += 1;
      return { id: `chk-${seq}`, link: `https://asaas.test/c/${seq}` };
    }),
    getSubscription: jest.fn(),
    findSubscriptionByExternalReference: jest.fn(),
    findSubscriptionByCheckoutSession: jest.fn(),
    deleteSubscription: jest.fn(),
  };
}

function build(
  opts: {
    enabled?: boolean;
    rows?: Row[];
    events?: Row[];
    webhookToken?: string | undefined;
  } = {},
) {
  const prisma = fakePrisma(opts.rows ?? [], opts.events ?? []);
  const asaas = fakeAsaas();
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'billing.enabled') return opts.enabled ?? true;
      if (key === 'FRONTEND_URL') return FRONT;
      if (key === 'asaas.webhookToken') return opts.webhookToken;
      return undefined;
    }),
  };
  const service = new BillingPaymentsService(
    prisma as any,
    asaas as unknown as AsaasClient,
    config as unknown as ConfigService,
  );
  return { service, prisma, asaas, rows: prisma.rows, events: prisma.events };
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('BillingPaymentsService#checkout', () => {
  it('rejeita com flag desligada, sem tocar banco nem Asaas', async () => {
    const { service, prisma, asaas } = build({ enabled: false });

    await expect(
      service.checkout('user-1', { plan: 'PROFESSIONAL', interval: 'MONTHLY' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
    expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
    expect(prisma.subscription.create).not.toHaveBeenCalled();
    expect(asaas.createCheckout).not.toHaveBeenCalled();
  });

  it.each([
    ['plano nao vendavel (FREE)', { plan: 'FREE', interval: 'MONTHLY' }],
    ['intervalo sem preco', { plan: 'PROFESSIONAL', interval: 'WEEKLY' }],
  ])('rejeita %s sem tocar banco nem Asaas', async (_label, dto) => {
    const { service, prisma, asaas } = build();

    await expect(service.checkout('user-1', dto as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.subscription.create).not.toHaveBeenCalled();
    expect(asaas.createCheckout).not.toHaveBeenCalled();
  });

  it.each([
    [
      'ACTIVE PROFESSIONAL pedindo PROFESSIONAL',
      { plan: 'PROFESSIONAL', status: 'ACTIVE', source: 'ASAAS' },
      'PROFESSIONAL',
    ],
    [
      'PAST_DUE PROFESSIONAL pedindo PROFESSIONAL',
      { plan: 'PROFESSIONAL', status: 'PAST_DUE', source: 'ASAAS' },
      'PROFESSIONAL',
    ],
    [
      'ACTIVE FLEET pedindo PROFESSIONAL (downgrade)',
      { plan: 'FLEET', status: 'ACTIVE', source: 'ASAAS' },
      'PROFESSIONAL',
    ],
    [
      'GRANT ACTIVE FLEET pedindo PROFESSIONAL',
      { plan: 'FLEET', status: 'ACTIVE', source: 'GRANT' },
      'PROFESSIONAL',
    ],
    [
      'GRANT ACTIVE PROFESSIONAL pedindo PROFESSIONAL',
      { plan: 'PROFESSIONAL', status: 'ACTIVE', source: 'GRANT' },
      'PROFESSIONAL',
    ],
    [
      'ACTIVE FLEET pedindo FLEET',
      { plan: 'FLEET', status: 'ACTIVE', source: 'ASAAS' },
      'FLEET',
    ],
    [
      'GRANT PAST_DUE FLEET pedindo PROFESSIONAL',
      { plan: 'FLEET', status: 'PAST_DUE', source: 'GRANT' },
      'PROFESSIONAL',
    ],
  ])(
    'bloqueia quando ja existe assinatura de rank igual ou maior: %s',
    async (_label, existing, requested) => {
      const { service, prisma, asaas } = build({
        rows: [
          row({
            ...existing,
            id: 'sub-existing',
            currentPeriodEnd: new Date(NOW.getTime() + 30 * DAY),
          }),
        ],
      });

      await expect(
        service.checkout('user-1', {
          plan: requested as 'PROFESSIONAL' | 'FLEET',
          interval: 'MONTHLY',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.subscription.create).not.toHaveBeenCalled();
      expect(asaas.createCheckout).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'ACTIVE PROFESSIONAL ao pedir FLEET (upgrade)',
      { plan: 'PROFESSIONAL', status: 'ACTIVE', source: 'ASAAS' },
      'FLEET',
    ],
    [
      'CANCELED FLEET ao pedir PROFESSIONAL',
      { plan: 'FLEET', status: 'CANCELED', source: 'ASAAS' },
      'PROFESSIONAL',
    ],
    [
      'PENDING PROFESSIONAL sem link ao pedir PROFESSIONAL',
      { plan: 'PROFESSIONAL', status: 'PENDING', source: 'ASAAS' },
      'PROFESSIONAL',
    ],
    [
      'GRANT ACTIVE PROFESSIONAL ao pedir FLEET (upgrade)',
      { plan: 'PROFESSIONAL', status: 'ACTIVE', source: 'GRANT' },
      'FLEET',
    ],
    // Intencional (spec: "Cancelar e assinar de novo"): so ACTIVE/PAST_DUE bloqueiam. CANCELED
    // com periodo futuro deixa reassinar o mesmo plano.
    [
      'CANCELED PROFESSIONAL com periodo futuro ao pedir PROFESSIONAL',
      {
        plan: 'PROFESSIONAL',
        status: 'CANCELED',
        source: 'ASAAS',
        currentPeriodEnd: new Date(NOW.getTime() + 10 * DAY),
      },
      'PROFESSIONAL',
    ],
  ])(
    'nao bloqueia assinatura de rank menor ou inativa: %s',
    async (_label, existing, requested) => {
      const { service, asaas } = build({
        rows: [row({ ...existing, id: 'sub-existing' })],
      });

      await service.checkout('user-1', {
        plan: requested as 'PROFESSIONAL' | 'FLEET',
        interval: 'MONTHLY',
      });
      expect(asaas.createCheckout).toHaveBeenCalledTimes(1);
    },
  );

  it('reaproveita link PENDING do mesmo plano e ciclo, sem Asaas e sem linha nova', async () => {
    const { service, prisma, asaas, rows } = build({
      rows: [
        row({
          id: 'sub-old',
          status: 'PENDING',
          source: 'ASAAS',
          plan: 'PROFESSIONAL',
          interval: 'MONTHLY',
          asaasCheckoutLink: 'https://asaas.test/c/old',
          createdAt: new Date(NOW.getTime() - 10 * MIN),
        }),
      ],
    });

    const result = await service.checkout('user-1', {
      plan: 'PROFESSIONAL',
      interval: 'MONTHLY',
    });

    expect(result).toEqual({ link: 'https://asaas.test/c/old' });
    expect(asaas.createCheckout).not.toHaveBeenCalled();
    expect(prisma.subscription.create).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
  });

  it('com dois checkouts validos devolve o mais recente', async () => {
    const { service, asaas } = build({
      rows: [
        row({
          id: 'sub-old',
          asaasCheckoutLink: 'https://asaas.test/c/old',
          createdAt: new Date(NOW.getTime() - 30 * MIN),
        }),
        row({
          id: 'sub-newer',
          asaasCheckoutLink: 'https://asaas.test/c/newer',
          createdAt: new Date(NOW.getTime() - 5 * MIN),
        }),
      ],
    });

    const result = await service.checkout('user-1', {
      plan: 'PROFESSIONAL',
      interval: 'MONTHLY',
    });

    expect(result).toEqual({ link: 'https://asaas.test/c/newer' });
    expect(asaas.createCheckout).not.toHaveBeenCalled();
  });

  it('linha orfa mais nova (sem link) nao esconde o link valido mais antigo', async () => {
    const { service, asaas } = build({
      rows: [
        row({
          id: 'sub-valid',
          asaasCheckoutLink: 'https://asaas.test/c/valid',
          createdAt: new Date(NOW.getTime() - 30 * MIN),
        }),
        row({
          id: 'sub-orphan',
          asaasCheckoutLink: null,
          createdAt: new Date(NOW.getTime() - 5 * MIN),
        }),
      ],
    });

    const result = await service.checkout('user-1', {
      plan: 'PROFESSIONAL',
      interval: 'MONTHLY',
    });

    expect(result).toEqual({ link: 'https://asaas.test/c/valid' });
    expect(asaas.createCheckout).not.toHaveBeenCalled();
  });

  it('nao reaproveita checkout nem sofre bloqueio de outro usuario', async () => {
    const { service, asaas, rows } = build({
      rows: [
        row({
          id: 'sub-other-pending',
          ownerUserId: 'user-2',
          asaasCheckoutLink: 'https://asaas.test/c/other',
          createdAt: new Date(NOW.getTime() - 5 * MIN),
        }),
        row({
          id: 'sub-other-active',
          ownerUserId: 'user-2',
          plan: 'FLEET',
          status: 'ACTIVE',
        }),
      ],
    });

    const result = await service.checkout('user-1', {
      plan: 'PROFESSIONAL',
      interval: 'MONTHLY',
    });

    expect(result).toEqual({ link: 'https://asaas.test/c/1' });
    expect(rows).toHaveLength(3);
    expect(asaas.createCheckout).toHaveBeenCalledTimes(1);
  });

  it('apos falha do Asaas, nova tentativa cria nova linha (a orfa nao tem link para reaproveitar)', async () => {
    const { service, asaas, rows } = build();
    asaas.createCheckout.mockRejectedValueOnce(new Error('Asaas indisponivel'));

    await expect(
      service.checkout('user-1', { plan: 'PROFESSIONAL', interval: 'MONTHLY' }),
    ).rejects.toThrow('Asaas indisponivel');
    const result = await service.checkout('user-1', {
      plan: 'PROFESSIONAL',
      interval: 'MONTHLY',
    });

    expect(result).toEqual({ link: 'https://asaas.test/c/1' });
    expect(rows).toHaveLength(2);
  });

  it('o filtro de reaproveitamento usa plan, interval, source, status, link e janela de 60 min', async () => {
    const { service, prisma } = build({
      rows: [
        row({
          id: 'sub-old',
          asaasCheckoutLink: 'https://asaas.test/c/old',
          createdAt: new Date(NOW.getTime() - 10 * MIN),
        }),
      ],
    });

    await service.checkout('user-1', {
      plan: 'PROFESSIONAL',
      interval: 'MONTHLY',
    });

    expect(prisma.subscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ownerUserId: 'user-1',
          source: 'ASAAS',
          status: 'PENDING',
          plan: 'PROFESSIONAL',
          interval: 'MONTHLY',
          asaasCheckoutLink: { not: null },
          createdAt: { gt: new Date(NOW.getTime() - 60 * MIN) },
        },
      }),
    );
  });

  it.each([
    ['PENDING de outro ciclo (anual)', { interval: 'YEARLY' }],
    ['PENDING de outro plano', { plan: 'FLEET' }],
    [
      'PENDING com mais de 60 min',
      { createdAt: new Date(NOW.getTime() - 61 * MIN) },
    ],
    ['PENDING sem link', { asaasCheckoutLink: null }],
    ['linha GRANT pendente com link', { source: 'GRANT' }],
    ['checkout EXPIRED com link', { status: 'EXPIRED' }],
  ])(
    'cria checkout novo quando o existente nao serve: %s',
    async (_label, override) => {
      const { service, asaas, rows } = build({
        rows: [
          row({
            id: 'sub-old',
            status: 'PENDING',
            source: 'ASAAS',
            plan: 'PROFESSIONAL',
            interval: 'MONTHLY',
            asaasCheckoutLink: 'https://asaas.test/c/old',
            createdAt: new Date(NOW.getTime() - 10 * MIN),
            ...override,
          }),
        ],
      });

      const result = await service.checkout('user-1', {
        plan: 'PROFESSIONAL',
        interval: 'MONTHLY',
      });

      expect(asaas.createCheckout).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ link: 'https://asaas.test/c/1' });
      expect(rows).toHaveLength(2);
    },
  );

  it('caso normal: cria PENDING, chama Asaas depois do create e grava checkout', async () => {
    const { service, prisma, asaas, rows } = build();

    const result = await service.checkout('user-1', {
      plan: 'FLEET',
      interval: 'YEARLY',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ownerUserId: 'user-1',
      plan: 'FLEET',
      status: 'PENDING',
      source: 'ASAAS',
      interval: 'YEARLY',
      asaasCheckoutId: 'chk-1',
      asaasCheckoutLink: 'https://asaas.test/c/1',
    });
    expect(asaas.createCheckout).toHaveBeenCalledWith({
      value: getCatalog()['FLEET'].prices!.YEARLY,
      cycle: 'YEARLY',
      itemName: 'Plano Frota do Triluga',
      itemDescription: 'Assinatura anual',
      externalReference: rows[0].id,
      successUrl: `${FRONT}/plano?checkout=sucesso`,
      cancelUrl: `${FRONT}/plano?checkout=cancelado`,
      expiredUrl: `${FRONT}/plano?checkout=expirado`,
      minutesToExpire: 60,
    });
    expect(prisma.subscription.create.mock.invocationCallOrder[0]).toBeLessThan(
      asaas.createCheckout.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({ link: 'https://asaas.test/c/1' });
  });

  it.each([
    ['PROFESSIONAL', 'MONTHLY', 'Assinatura mensal'],
    ['PROFESSIONAL', 'YEARLY', 'Assinatura anual'],
    ['FLEET', 'MONTHLY', 'Assinatura mensal'],
    ['FLEET', 'YEARLY', 'Assinatura anual'],
  ] as const)(
    'valor cobrado do catalogo para %s/%s',
    async (plan, interval, description) => {
      const { service, asaas } = build();

      await service.checkout('user-1', { plan, interval });

      const expected = getCatalog()[plan].prices![interval];
      expect(asaas.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          value: expected,
          cycle: interval,
          itemDescription: description,
          itemName: `Plano ${getCatalog()[plan].label} do Triluga`,
        }),
      );
    },
  );

  it('propaga erro do Asaas e deixa a linha PENDING sem link', async () => {
    const { service, asaas, rows } = build();
    asaas.createCheckout.mockRejectedValueOnce(new Error('Asaas indisponivel'));

    await expect(
      service.checkout('user-1', { plan: 'PROFESSIONAL', interval: 'MONTHLY' }),
    ).rejects.toThrow('Asaas indisponivel');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'PENDING',
      asaasCheckoutLink: null,
    });
  });
});

describe('BillingPaymentsService#reconcileSubscription', () => {
  // Periodo ja vencido em relacao a NOW (2026-11-14): cenarios de 'venceu'.
  const SUB_END = new Date('2026-11-01T00:00:00.000Z');

  function setup(overrides: Partial<Row> = {}) {
    const local = row({
      id: 'sub-1',
      status: 'ACTIVE',
      asaasSubscriptionId: 'asaas-sub-1',
      currentPeriodEnd: SUB_END,
      ...overrides,
    });
    const h = build({ rows: [local] });
    return { ...h, local };
  }

  it('sem asaasSubscriptionId nao chama Asaas nem grava', async () => {
    const { service, asaas, prisma, local } = setup({
      asaasSubscriptionId: null,
    });

    await service.reconcileSubscription(local as any);

    expect(asaas.getSubscription).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('remoto deleted vira CANCELED e so isso', async () => {
    const { service, asaas, prisma, local } = setup();
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-sub-1',
      deleted: true,
      nextDueDate: '2026-12-20',
      externalReference: null,
    });

    await service.reconcileSubscription(local as any);

    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { status: 'CANCELED' },
    });
  });

  it('nextDueDate maior que currentPeriodEnd vira ACTIVE com novo fim e pastDueSince nulo', async () => {
    const { service, asaas, prisma, local } = setup({
      status: 'PAST_DUE',
      pastDueSince: new Date('2026-11-05T00:00:00.000Z'),
    });
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-sub-1',
      deleted: false,
      nextDueDate: '2027-01-01',
      externalReference: null,
    });

    await service.reconcileSubscription(local as any);

    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: {
        status: 'ACTIVE',
        currentPeriodEnd: new Date('2027-01-01'),
        pastDueSince: null,
      },
    });
  });

  it('currentPeriodEnd nulo vira ACTIVE com nextDueDate como fim', async () => {
    const { service, asaas, prisma, local } = setup({
      status: 'PENDING',
      currentPeriodEnd: null,
    });
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-sub-1',
      deleted: false,
      nextDueDate: '2026-12-01',
      externalReference: null,
    });

    await service.reconcileSubscription(local as any);

    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: {
        status: 'ACTIVE',
        currentPeriodEnd: new Date('2026-12-01'),
        pastDueSince: null,
      },
    });
  });

  it('nextDueDate igual a currentPeriodEnd (borda) vencido vira PAST_DUE', async () => {
    const { service, asaas, prisma, local } = setup();
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-sub-1',
      deleted: false,
      nextDueDate: '2026-11-01',
      externalReference: null,
    });

    await service.reconcileSubscription(local as any);

    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { status: 'PAST_DUE', pastDueSince: new Date(NOW) },
    });
  });

  it('nextDueDate menor que currentPeriodEnd vencido vira PAST_DUE', async () => {
    const { service, asaas, prisma, local } = setup();
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-sub-1',
      deleted: false,
      nextDueDate: '2026-10-20',
      externalReference: null,
    });

    await service.reconcileSubscription(local as any);

    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { status: 'PAST_DUE', pastDueSince: new Date(NOW) },
    });
  });

  it('PAST_DUE preserva pastDueSince existente', async () => {
    const original = new Date('2026-11-05T00:00:00.000Z');
    const { service, asaas, prisma, local } = setup({
      status: 'PAST_DUE',
      pastDueSince: original,
    });
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-sub-1',
      deleted: false,
      nextDueDate: '2026-10-20',
      externalReference: null,
    });

    await service.reconcileSubscription(local as any);

    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { status: 'PAST_DUE', pastDueSince: original },
    });
  });
});

describe('BillingPaymentsService#reconcileSubscription (terminal, em dia e convivencia)', () => {
  const PERIOD_FUTURE = new Date(NOW.getTime() + 10 * DAY);
  const PERIOD_PAST = new Date('2026-11-01T00:00:00.000Z');

  function setup(overrides: Partial<Row> = {}) {
    const local = row({
      id: 'sub-1',
      status: 'ACTIVE',
      asaasSubscriptionId: 'asaas-sub-1',
      currentPeriodEnd: PERIOD_FUTURE,
      ...overrides,
    });
    const h = build({ rows: [local] });
    return { ...h, local };
  }

  // B1: EXPIRED (reembolso) e terminal: evento tardio nao pode ressuscitar a assinatura.
  it('EXPIRED retorna sem consultar o Asaas e sem alterar a linha', async () => {
    const { service, asaas, prisma, local } = setup({
      status: 'EXPIRED',
      currentPeriodEnd: new Date(NOW),
    });

    await service.reconcileSubscription(local as any);

    expect(asaas.getSubscription).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  // B2: periodo ainda pago e mesmo nextDueDate (2o webhook) nao rebaixa o ACTIVE.
  it('ACTIVE com periodo futuro e mesmo nextDueDate nao altera nada', async () => {
    const { service, asaas, prisma, local } = setup();
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-sub-1',
      deleted: false,
      nextDueDate: PERIOD_FUTURE.toISOString().slice(0, 10),
      externalReference: null,
    });

    await service.reconcileSubscription(local as any);

    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('ACTIVE com periodo vencido e mesmo nextDueDate vira PAST_DUE com pastDueSince agora', async () => {
    const { service, asaas, prisma, local } = setup({
      currentPeriodEnd: PERIOD_PAST,
    });
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-sub-1',
      deleted: false,
      nextDueDate: '2026-11-01',
      externalReference: null,
    });

    await service.reconcileSubscription(local as any);

    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { status: 'PAST_DUE', pastDueSince: new Date(NOW) },
    });
  });

  it('PAST_DUE com periodo futuro e nextDueDate igual nao muda nada', async () => {
    const { service, asaas, prisma, local } = setup({
      status: 'PAST_DUE',
      currentPeriodEnd: PERIOD_FUTURE,
      pastDueSince: new Date('2026-11-05T00:00:00.000Z'),
    });
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-sub-1',
      deleted: false,
      nextDueDate: PERIOD_FUTURE.toISOString().slice(0, 10),
      externalReference: null,
    });

    await service.reconcileSubscription(local as any);

    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });
});

describe('BillingPaymentsService#sync', () => {
  it('sem linha ASAAS em aberto nao chama Asaas', async () => {
    const { service, asaas } = build({ rows: [] });

    await service.sync('user-1');

    expect(asaas.getSubscription).not.toHaveBeenCalled();
    expect(asaas.findSubscriptionByExternalReference).not.toHaveBeenCalled();
  });

  it('ignora concessao GRANT em aberto', async () => {
    const { service, asaas } = build({
      rows: [
        row({
          status: 'ACTIVE',
          source: 'GRANT',
          asaasSubscriptionId: 'asaas-sub-x',
          currentPeriodEnd: null,
        }),
      ],
    });

    await service.sync('user-1');

    expect(asaas.getSubscription).not.toHaveBeenCalled();
  });

  it('ACTIVE com currentPeriodEnd futuro nao chama Asaas e nao muda status', async () => {
    const { service, asaas, prisma, rows } = build({
      rows: [
        row({
          status: 'ACTIVE',
          asaasSubscriptionId: 'asaas-sub-1',
          currentPeriodEnd: new Date(NOW.getTime() + 20 * DAY),
        }),
      ],
    });

    await service.sync('user-1');

    expect(asaas.getSubscription).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(rows[0].status).toBe('ACTIVE');
  });

  it('ACTIVE com currentPeriodEnd exatamente agora (borda) ainda esta em dia: nao consulta o Asaas', async () => {
    const { service, asaas, prisma } = build({
      rows: [
        row({
          status: 'ACTIVE',
          asaasSubscriptionId: 'asaas-sub-1',
          currentPeriodEnd: new Date(NOW),
        }),
      ],
    });

    await service.sync('user-1');

    expect(asaas.getSubscription).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('nao sincroniza assinatura de outro usuario', async () => {
    const { service, asaas, prisma } = build({
      rows: [
        row({
          ownerUserId: 'user-2',
          status: 'PAST_DUE',
          asaasSubscriptionId: 'asaas-sub-2',
        }),
      ],
    });

    await service.sync('user-1');

    expect(asaas.getSubscription).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('ACTIVE com currentPeriodEnd vencido reconcilia', async () => {
    const { service, asaas, rows } = build({
      rows: [
        row({
          status: 'ACTIVE',
          asaasSubscriptionId: 'asaas-sub-1',
          currentPeriodEnd: new Date('2026-11-10T00:00:00.000Z'),
        }),
      ],
    });
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-sub-1',
      deleted: false,
      nextDueDate: '2026-11-10',
      externalReference: null,
    });

    await service.sync('user-1');

    expect(asaas.getSubscription).toHaveBeenCalledWith('asaas-sub-1');
    expect(rows[0].status).toBe('PAST_DUE');
  });

  it('ACTIVE com currentPeriodEnd nulo reconcilia', async () => {
    const { service, asaas, rows } = build({
      rows: [
        row({
          status: 'ACTIVE',
          asaasSubscriptionId: 'asaas-sub-1',
          currentPeriodEnd: null,
        }),
      ],
    });
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-sub-1',
      deleted: false,
      nextDueDate: '2026-12-01',
      externalReference: null,
    });

    await service.sync('user-1');

    expect(asaas.getSubscription).toHaveBeenCalledWith('asaas-sub-1');
    expect(rows[0].currentPeriodEnd).toEqual(new Date('2026-12-01'));
  });

  it('PAST_DUE sempre reconsulta, mesmo com currentPeriodEnd futuro', async () => {
    const { service, asaas, rows } = build({
      rows: [
        row({
          status: 'PAST_DUE',
          asaasSubscriptionId: 'asaas-sub-1',
          currentPeriodEnd: new Date(NOW.getTime() + 5 * DAY),
        }),
      ],
    });
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-sub-1',
      deleted: false,
      nextDueDate: '2026-12-20',
      externalReference: null,
    });

    await service.sync('user-1');

    expect(asaas.getSubscription).toHaveBeenCalledWith('asaas-sub-1');
    expect(rows[0].status).toBe('ACTIVE');
  });

  it('PENDING com asaasSubscriptionId reconcilia', async () => {
    const { service, asaas, rows } = build({
      rows: [row({ status: 'PENDING', asaasSubscriptionId: 'asaas-sub-1' })],
    });
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-sub-1',
      deleted: false,
      nextDueDate: '2026-12-01',
      externalReference: null,
    });

    await service.sync('user-1');

    expect(asaas.getSubscription).toHaveBeenCalledWith('asaas-sub-1');
    expect(rows[0].status).toBe('ACTIVE');
  });

  it('PENDING sem asaasSubscriptionId acha pelo externalReference, grava o id e reconcilia', async () => {
    const { service, asaas, rows } = build({
      rows: [
        row({ id: 'sub-1', status: 'PENDING', asaasSubscriptionId: null }),
      ],
    });
    asaas.findSubscriptionByExternalReference.mockResolvedValue({
      id: 'asaas-sub-9',
      deleted: false,
      nextDueDate: '2026-12-01',
      externalReference: 'sub-1',
    });
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-sub-9',
      deleted: false,
      nextDueDate: '2026-12-01',
      externalReference: 'sub-1',
    });

    await service.sync('user-1');

    expect(asaas.findSubscriptionByExternalReference).toHaveBeenCalledWith(
      'sub-1',
    );
    expect(rows[0].asaasSubscriptionId).toBe('asaas-sub-9');
    expect(asaas.getSubscription).toHaveBeenCalledWith('asaas-sub-9');
    expect(rows[0].status).toBe('ACTIVE');
  });

  it('sem achado por externalReference, acha pelo checkoutSession (checkout hospedado nao herda o externalReference)', async () => {
    const { service, asaas, rows } = build({
      rows: [
        row({
          id: 'sub-1',
          status: 'PENDING',
          asaasSubscriptionId: null,
          asaasCheckoutId: 'chk-1',
        }),
      ],
    });
    asaas.findSubscriptionByExternalReference.mockResolvedValue(null);
    asaas.findSubscriptionByCheckoutSession.mockResolvedValue({
      id: 'asaas-sub-9',
      deleted: false,
      nextDueDate: '2026-12-01',
      externalReference: null,
    });
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-sub-9',
      deleted: false,
      nextDueDate: '2026-12-01',
      externalReference: null,
    });

    await service.sync('user-1');

    expect(asaas.findSubscriptionByCheckoutSession).toHaveBeenCalledWith(
      'chk-1',
    );
    expect(rows[0].asaasSubscriptionId).toBe('asaas-sub-9');
    expect(rows[0].status).toBe('ACTIVE');
  });

  it('sync: assinatura achada pelo checkoutSession que ja pertence a outra linha (P2002) nao relanca nem altera', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { service, asaas, prisma, rows } = build({
      rows: [
        row({
          id: 'sub-1',
          status: 'PENDING',
          asaasSubscriptionId: null,
          asaasCheckoutId: 'chk-1',
        }),
      ],
    });
    asaas.findSubscriptionByExternalReference.mockResolvedValue(null);
    asaas.findSubscriptionByCheckoutSession.mockResolvedValue({
      id: 'asaas-sub-9',
      deleted: false,
      nextDueDate: '2026-12-01',
      externalReference: null,
    });
    prisma.subscription.update.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
    });

    await expect(service.sync('user-1')).resolves.toBeUndefined();

    expect(asaas.getSubscription).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({
      status: 'PENDING',
      asaasSubscriptionId: null,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('asaas-sub-9'),
    );
    warnSpy.mockRestore();
  });

  it('sync: erro de banco que nao e P2002 ao ligar a assinatura continua relancando', async () => {
    const { service, asaas, prisma } = build({
      rows: [
        row({
          id: 'sub-1',
          status: 'PENDING',
          asaasSubscriptionId: null,
          asaasCheckoutId: 'chk-1',
        }),
      ],
    });
    asaas.findSubscriptionByExternalReference.mockResolvedValue(null);
    asaas.findSubscriptionByCheckoutSession.mockResolvedValue({
      id: 'asaas-sub-9',
      deleted: false,
      nextDueDate: '2026-12-01',
      externalReference: null,
    });
    prisma.subscription.update.mockImplementationOnce(async () => {
      throw new Error('banco fora');
    });

    await expect(service.sync('user-1')).rejects.toThrow('banco fora');
  });

  it('achado por externalReference nao consulta o checkoutSession', async () => {
    const { service, asaas } = build({
      rows: [
        row({
          id: 'sub-1',
          status: 'PENDING',
          asaasSubscriptionId: null,
          asaasCheckoutId: 'chk-1',
        }),
      ],
    });
    asaas.findSubscriptionByExternalReference.mockResolvedValue({
      id: 'asaas-sub-9',
      deleted: false,
      nextDueDate: '2026-12-01',
      externalReference: 'sub-1',
    });
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-sub-9',
      deleted: false,
      nextDueDate: '2026-12-01',
      externalReference: 'sub-1',
    });

    await service.sync('user-1');

    expect(asaas.findSubscriptionByCheckoutSession).not.toHaveBeenCalled();
  });

  it('sem asaasCheckoutId nao consulta o checkoutSession', async () => {
    const { service, asaas, rows } = build({
      rows: [
        row({ id: 'sub-1', status: 'PENDING', asaasSubscriptionId: null }),
      ],
    });
    asaas.findSubscriptionByExternalReference.mockResolvedValue(null);

    await service.sync('user-1');

    expect(asaas.findSubscriptionByCheckoutSession).not.toHaveBeenCalled();
    expect(rows[0].asaasSubscriptionId).toBeNull();
  });

  it('sem asaasSubscriptionId e sem achado no Asaas nao altera a linha', async () => {
    const { service, asaas, prisma, rows } = build({
      rows: [
        row({ id: 'sub-1', status: 'PENDING', asaasSubscriptionId: null }),
      ],
    });
    asaas.findSubscriptionByExternalReference.mockResolvedValue(null);

    await service.sync('user-1');

    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(asaas.getSubscription).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({
      status: 'PENDING',
      asaasSubscriptionId: null,
    });
  });

  it('usa a linha ASAAS em aberto mais recente', async () => {
    const { service, asaas } = build({
      rows: [
        row({
          id: 'sub-old',
          status: 'PENDING',
          asaasSubscriptionId: 'asaas-old',
          createdAt: new Date(NOW.getTime() - 2 * DAY),
        }),
        row({
          id: 'sub-new',
          status: 'PENDING',
          asaasSubscriptionId: 'asaas-new',
          createdAt: new Date(NOW.getTime() - 1 * DAY),
        }),
      ],
    });
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-new',
      deleted: false,
      nextDueDate: '2026-12-01',
      externalReference: null,
    });

    await service.sync('user-1');

    expect(asaas.getSubscription).toHaveBeenCalledTimes(1);
    expect(asaas.getSubscription).toHaveBeenCalledWith('asaas-new');
  });
});

describe('BillingPaymentsService#cancel', () => {
  it('sem assinatura ASAAS lanca NotFound, sem Asaas', async () => {
    const { service, asaas } = build({ rows: [] });

    await expect(service.cancel('user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(asaas.deleteSubscription).not.toHaveBeenCalled();
  });

  it('concessao GRANT nunca e tocada e o where filtra source ASAAS', async () => {
    const { service, asaas, prisma, rows } = build({
      rows: [
        row({
          id: 'grant-1',
          source: 'GRANT',
          plan: 'FLEET',
          status: 'ACTIVE',
          currentPeriodEnd: null,
        }),
      ],
    });

    await expect(service.cancel('user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.subscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: 'ASAAS' }),
      }),
    );
    expect(asaas.deleteSubscription).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(rows[0].status).toBe('ACTIVE');
  });

  it('CANCELED e idempotente: sem Asaas e sem update', async () => {
    const { service, asaas, prisma } = build({
      rows: [row({ status: 'CANCELED', asaasSubscriptionId: 'asaas-sub-1' })],
    });

    await service.cancel('user-1');

    expect(asaas.deleteSubscription).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('Asaas responde 404 ao deletar (já removida): trata como sucesso e grava CANCELED', async () => {
    const end = new Date(NOW.getTime() + 10 * DAY);
    const { service, asaas, rows } = build({
      rows: [
        row({
          status: 'ACTIVE',
          asaasSubscriptionId: 'asaas-sub-1',
          currentPeriodEnd: end,
        }),
      ],
    });
    asaas.deleteSubscription.mockRejectedValueOnce(
      new AsaasClientError('Asaas respondeu 404', 404),
    );

    await expect(service.cancel('user-1')).resolves.toBeUndefined();

    expect(rows[0]).toMatchObject({
      status: 'CANCELED',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: end,
    });
  });

  it.each([
    ['AsaasClientError 500', new AsaasClientError('Asaas respondeu 500', 500)],
    ['AsaasClientError sem status (rede)', new AsaasClientError('rede')],
    [
      'Error comum com statusCode 404',
      Object.assign(new Error('x'), { statusCode: 404 }),
    ],
  ])('delete com %s propaga e não grava CANCELED', async (_l, error) => {
    const { service, asaas, rows } = build({
      rows: [
        row({
          status: 'ACTIVE',
          asaasSubscriptionId: 'asaas-sub-1',
          currentPeriodEnd: new Date(NOW.getTime() + 10 * DAY),
        }),
      ],
    });
    asaas.deleteSubscription.mockRejectedValueOnce(error);

    await expect(service.cancel('user-1')).rejects.toBe(error);
    expect(rows[0].status).toBe('ACTIVE');
  });

  it.each(['ACTIVE', 'PAST_DUE'] as const)(
    'cancela %s no Asaas e marca CANCELED sem mexer em currentPeriodEnd',
    async (status) => {
      const end = new Date(NOW.getTime() + 10 * DAY);
      const { service, asaas, prisma, rows } = build({
        rows: [
          row({
            status,
            asaasSubscriptionId: 'asaas-sub-1',
            currentPeriodEnd: end,
          }),
        ],
      });

      await service.cancel('user-1');

      expect(asaas.deleteSubscription).toHaveBeenCalledWith('asaas-sub-1');
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-x' },
        data: { status: 'CANCELED', cancelAtPeriodEnd: true },
      });
      expect(rows[0].status).toBe('CANCELED');
      expect(rows[0].currentPeriodEnd).toEqual(end);
    },
  );

  it('falha no deleteSubscription propaga e nao atualiza a linha', async () => {
    const { service, asaas, prisma, rows } = build({
      rows: [row({ status: 'ACTIVE', asaasSubscriptionId: 'asaas-sub-1' })],
    });
    asaas.deleteSubscription.mockRejectedValueOnce(new Error('Asaas 500'));

    await expect(service.cancel('user-1')).rejects.toThrow('Asaas 500');
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(rows[0].status).toBe('ACTIVE');
  });

  it('sem asaasSubscriptionId cancela so localmente', async () => {
    const { service, asaas, rows } = build({
      rows: [row({ status: 'ACTIVE', asaasSubscriptionId: null })],
    });

    await service.cancel('user-1');

    expect(asaas.deleteSubscription).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({
      status: 'CANCELED',
      cancelAtPeriodEnd: true,
    });
  });

  it('nao toca na GRANT ao cancelar a ASAAS do mesmo usuario', async () => {
    const { service, rows } = build({
      rows: [
        row({
          id: 'grant-1',
          source: 'GRANT',
          plan: 'FLEET',
          status: 'ACTIVE',
        }),
        row({
          id: 'asaas-1',
          source: 'ASAAS',
          plan: 'PROFESSIONAL',
          status: 'ACTIVE',
          asaasSubscriptionId: 'asaas-sub-1',
        }),
      ],
    });

    await service.cancel('user-1');

    expect(rows.find((r) => r.id === 'grant-1')?.status).toBe('ACTIVE');
    expect(rows.find((r) => r.id === 'asaas-1')?.status).toBe('CANCELED');
  });

  // Upgrade permitido (PROFESSIONAL ACTIVE -> FLEET): as duas ficam ACTIVE e cobrando.
  // Cancelar so a mais recente deixaria a outra cobrando sem como cancelar.
  it('apos upgrade cancela TODAS as ASAAS em cobranca (ACTIVE ou PAST_DUE)', async () => {
    const end = new Date(NOW.getTime() + 10 * DAY);
    const { service, asaas, prisma, rows } = build({
      rows: [
        row({
          id: 'prof',
          plan: 'PROFESSIONAL',
          status: 'ACTIVE',
          asaasSubscriptionId: 'asaas-prof',
          currentPeriodEnd: end,
          createdAt: new Date(NOW.getTime() - 20 * DAY),
        }),
        row({
          id: 'fleet',
          plan: 'FLEET',
          status: 'ACTIVE',
          asaasSubscriptionId: 'asaas-fleet',
          currentPeriodEnd: end,
          createdAt: new Date(NOW.getTime() - 1 * DAY),
        }),
      ],
    });

    await service.cancel('user-1');

    expect(asaas.deleteSubscription).toHaveBeenCalledWith('asaas-prof');
    expect(asaas.deleteSubscription).toHaveBeenCalledWith('asaas-fleet');
    expect(rows.map((r) => r.status)).toEqual(['CANCELED', 'CANCELED']);
    expect(rows.every((r) => r.cancelAtPeriodEnd === true)).toBe(true);
    expect(rows.every((r) => r.currentPeriodEnd === end)).toBe(true);
    expect(prisma.subscription.update).toHaveBeenCalledTimes(2);
  });

  it('ACTIVE mais antiga com CANCELED mais nova: cancela a ACTIVE (nao para na CANCELED)', async () => {
    const { service, asaas, rows } = build({
      rows: [
        row({
          id: 'old-active',
          status: 'ACTIVE',
          asaasSubscriptionId: 'asaas-old',
          createdAt: new Date(NOW.getTime() - 20 * DAY),
        }),
        row({
          id: 'new-canceled',
          plan: 'FLEET',
          status: 'CANCELED',
          asaasSubscriptionId: 'asaas-new',
          createdAt: new Date(NOW.getTime() - 1 * DAY),
        }),
      ],
    });

    await service.cancel('user-1');

    expect(asaas.deleteSubscription).toHaveBeenCalledTimes(1);
    expect(asaas.deleteSubscription).toHaveBeenCalledWith('asaas-old');
    expect(rows.find((r) => r.id === 'old-active')?.status).toBe('CANCELED');
  });

  it('falha no Asaas da segunda nao desfaz a primeira e nova chamada cancela so o que restou', async () => {
    const { service, asaas, rows } = build({
      rows: [
        row({
          id: 'a',
          status: 'ACTIVE',
          asaasSubscriptionId: 'asaas-a',
          createdAt: new Date(NOW.getTime() - 2 * DAY),
        }),
        row({
          id: 'b',
          status: 'ACTIVE',
          asaasSubscriptionId: 'asaas-b',
          createdAt: new Date(NOW.getTime() - 1 * DAY),
        }),
      ],
    });
    asaas.deleteSubscription
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Asaas 500'));

    await expect(service.cancel('user-1')).rejects.toThrow('Asaas 500');
    expect(rows.map((r) => r.status)).toEqual(['CANCELED', 'ACTIVE']);

    asaas.deleteSubscription.mockClear();
    asaas.deleteSubscription.mockResolvedValue(undefined);
    await service.cancel('user-1');

    expect(asaas.deleteSubscription).toHaveBeenCalledTimes(1);
    expect(asaas.deleteSubscription).toHaveBeenCalledWith('asaas-b');
    expect(rows.map((r) => r.status)).toEqual(['CANCELED', 'CANCELED']);
  });

  it('nao cancela assinatura de outro usuario', async () => {
    const { service, asaas, rows } = build({
      rows: [
        row({
          ownerUserId: 'user-2',
          status: 'ACTIVE',
          asaasSubscriptionId: 'asaas-other',
        }),
      ],
    });

    await expect(service.cancel('user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(asaas.deleteSubscription).not.toHaveBeenCalled();
    expect(rows[0].status).toBe('ACTIVE');
  });

  it('CANCELED de outro usuario nao torna o cancelamento idempotente: NotFound', async () => {
    const { service, asaas } = build({
      rows: [
        row({
          ownerUserId: 'user-2',
          status: 'CANCELED',
          asaasSubscriptionId: 'asaas-other',
        }),
      ],
    });

    await expect(service.cancel('user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(asaas.deleteSubscription).not.toHaveBeenCalled();
  });

  it('PENDING sozinha nao e assinatura para cancelar', async () => {
    const { service, asaas } = build({
      rows: [row({ status: 'PENDING', asaasSubscriptionId: null })],
    });

    await expect(service.cancel('user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(asaas.deleteSubscription).not.toHaveBeenCalled();
  });
});

describe('BillingPaymentsService#processWebhookEvent', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const TOKEN = 'whsec-teste-123';
  const PERIOD_END = new Date('2026-11-10T00:00:00.000Z');
  const FUTURE_DUE = '2026-12-14';

  function setup(
    opts: {
      rows?: Row[];
      events?: Row[];
      webhookToken?: string | undefined;
    } = {},
  ) {
    const h = build({ webhookToken: TOKEN, ...opts });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    return h;
  }

  const dbCalls = (prisma: any) => [
    ...prisma.billingEvent.create.mock.calls,
    ...prisma.billingEvent.findUnique.mock.calls,
    ...prisma.billingEvent.update.mock.calls,
    ...prisma.subscription.findMany.mock.calls,
    ...prisma.subscription.findFirst.mock.calls,
    ...prisma.subscription.create.mock.calls,
    ...prisma.subscription.update.mock.calls,
  ];

  // Modelo de payload do Asaas para os eventos de pagamento de assinatura.
  const paymentEvent = (
    event: string,
    payment: Record<string, unknown> = {},
    extra: Record<string, unknown> = {},
  ) => ({
    id: `evt_${event}_1`,
    event,
    payment: {
      id: 'pay_1',
      subscription: 'asaas-sub-1',
      value: 49.9,
      externalReference: null,
      ...payment,
    },
    ...extra,
  });

  describe('token (fail closed, antes de qualquer acesso ao banco)', () => {
    it.each([
      ['ausente', undefined],
      ['errado', 'whsec-teste-999'],
      ['de tamanho diferente', 'whsec-teste-123-extra'],
      ['curto', 'x'],
      ['vazio', ''],
    ])(
      'recusa token %s com Forbidden e sem tocar banco nem Asaas',
      async (_l, token) => {
        const { service, prisma, asaas } = setup({
          rows: [row({ status: 'ACTIVE', asaasSubscriptionId: 'asaas-sub-1' })],
        });

        await expect(
          service.processWebhookEvent(token, paymentEvent('PAYMENT_CONFIRMED')),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(dbCalls(prisma)).toHaveLength(0);
        expect(asaas.getSubscription).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['sem asaas.webhookToken configurado', undefined],
      ['com asaas.webhookToken vazio', ''],
    ])(
      'recusa TUDO %s, inclusive token vazio recebido',
      async (_l, configured) => {
        const { service, prisma } = setup({ webhookToken: configured });

        await expect(
          service.processWebhookEvent('', paymentEvent('PAYMENT_CONFIRMED')),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
          service.processWebhookEvent(
            undefined,
            paymentEvent('PAYMENT_CONFIRMED'),
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
          service.processWebhookEvent(
            'qualquer',
            paymentEvent('PAYMENT_CONFIRMED'),
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(dbCalls(prisma)).toHaveLength(0);
      },
    );

    it('token invalido vence payload invalido (Forbidden, nao BadRequest)', async () => {
      const { service, prisma } = setup();

      await expect(
        service.processWebhookEvent('errado', { event: 1 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(dbCalls(prisma)).toHaveLength(0);
    });
  });

  describe('payload minimo', () => {
    it.each([
      ['id ausente', { event: 'PAYMENT_CONFIRMED' }],
      ['id numerico', { id: 12, event: 'PAYMENT_CONFIRMED' }],
      ['event ausente', { id: 'evt_1' }],
      ['event nao string', { id: 'evt_1', event: 7 }],
    ])(
      'com token certo e %s lanca BadRequest sem tocar banco',
      async (_l, payload) => {
        const { service, prisma } = setup();

        await expect(
          service.processWebhookEvent(TOKEN, payload as any),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(dbCalls(prisma)).toHaveLength(0);
      },
    );
  });

  describe('pagamento avulso (PIX do destaque no mesmo Asaas)', () => {
    it.each([
      [
        'sem payment.subscription',
        {
          id: 'evt_a',
          event: 'PAYMENT_CONFIRMED',
          payment: { id: 'pay_9', value: 29.9 },
        },
      ],
      [
        'payment.subscription vazio',
        paymentEvent('PAYMENT_RECEIVED', { subscription: '' }),
      ],
      [
        'payment.subscription null',
        paymentEvent('PAYMENT_OVERDUE', { subscription: null }),
      ],
      [
        'payment.subscription numerico',
        paymentEvent('PAYMENT_CONFIRMED', { subscription: 5 }),
      ],
      ['sem objeto payment', { id: 'evt_b', event: 'PAYMENT_REFUNDED' }],
    ])(
      'ignora %s: ok sem gravar BillingEvent e sem warn',
      async (_l, payload) => {
        const { service, prisma } = setup();
        const warnSpy = Logger.prototype.warn as unknown as jest.SpyInstance;

        await expect(
          service.processWebhookEvent(TOKEN, payload as any),
        ).resolves.toEqual({ ok: true });
        expect(prisma.billingEvent.create).not.toHaveBeenCalled();
        expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
      },
    );
  });

  describe('sanitizacao do payload gravado', () => {
    it('remove chaves pessoais e de cartao recursivamente, mantendo o resto', async () => {
      const { service, events } = setup();
      const payload = {
        id: 'evt_san',
        event: 'PAYMENT_OVERDUE',
        payment: {
          id: 'pay_1',
          subscription: 'asaas-sub-1',
          value: 49.9,
          cpfCnpj: '12345678909',
          email: 'a@b.com',
          phone: '1199',
          mobilePhone: '11988',
          phoneNumber: '1133',
          postalCode: '01000000',
          address: 'Rua X',
          addressNumber: '10',
          creditCard: { creditCardNumber: '4111' },
          creditCardHolderInfo: { name: 'Fulano' },
          creditCardToken: 'tok_1',
          creditCardNumber: '4111',
          creditCardBrand: 'VISA',
          creditCardCustom: 'x',
          invoiceUrl: 'https://asaas.test/i/1',
          nested: [{ email: 'lista@b.com', keep: 1 }],
        },
        customer: { cpfCnpj: '999', name: 'Nome' },
      };

      await service.processWebhookEvent(TOKEN, payload as any);

      expect(events).toHaveLength(1);
      const stored = JSON.stringify(events[0].payload);
      for (const key of [
        'cpfCnpj',
        'email',
        'phone',
        'mobilePhone',
        'phoneNumber',
        'postalCode',
        'address',
        'addressNumber',
        'creditCard',
        'creditCardHolderInfo',
        'creditCardToken',
        'creditCardNumber',
        'creditCardBrand',
        'creditCardCustom',
      ]) {
        expect(stored).not.toContain(`"${key}"`);
      }
      expect(events[0]).toMatchObject({
        externalEventId: 'evt_san',
        type: 'PAYMENT_OVERDUE',
      });
      expect(events[0].payload).toMatchObject({
        id: 'evt_san',
        event: 'PAYMENT_OVERDUE',
        payment: {
          value: 49.9,
          invoiceUrl: 'https://asaas.test/i/1',
          subscription: 'asaas-sub-1',
        },
        customer: { name: 'Nome' },
      });
      expect((events[0].payload as any).payment.nested).toEqual([{ keep: 1 }]);
    });
  });

  describe('idempotencia', () => {
    it('mesmo id duas vezes: a segunda retorna ok sem reprocessar', async () => {
      const { service, prisma, asaas } = setup({
        rows: [row({ status: 'PENDING', asaasSubscriptionId: 'asaas-sub-1' })],
      });
      asaas.getSubscription.mockResolvedValue({
        id: 'asaas-sub-1',
        deleted: false,
        nextDueDate: FUTURE_DUE,
        externalReference: null,
      });

      await service.processWebhookEvent(
        TOKEN,
        paymentEvent('PAYMENT_CONFIRMED'),
      );
      expect(asaas.getSubscription).toHaveBeenCalledTimes(1);
      prisma.subscription.findFirst.mockClear();

      await expect(
        service.processWebhookEvent(TOKEN, paymentEvent('PAYMENT_CONFIRMED')),
      ).resolves.toEqual({ ok: true });
      expect(asaas.getSubscription).toHaveBeenCalledTimes(1);
      expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
      expect(prisma.billingEvent.update).toHaveBeenCalledTimes(1);
    });

    it('evento existente sem processedAt (retry do Asaas) e reprocessado', async () => {
      const { service, asaas, events, rows } = setup({
        rows: [row({ status: 'PENDING', asaasSubscriptionId: 'asaas-sub-1' })],
        events: [
          {
            id: 'evt-old',
            externalEventId: 'evt_PAYMENT_CONFIRMED_1',
            type: 'PAYMENT_CONFIRMED',
            payload: {},
            processedAt: null,
            error: 'antigo',
          },
        ],
      });
      asaas.getSubscription.mockResolvedValue({
        id: 'asaas-sub-1',
        deleted: false,
        nextDueDate: FUTURE_DUE,
        externalReference: null,
      });

      await service.processWebhookEvent(
        TOKEN,
        paymentEvent('PAYMENT_CONFIRMED'),
      );

      expect(asaas.getSubscription).toHaveBeenCalledTimes(1);
      expect(rows[0].status).toBe('ACTIVE');
      expect(events).toHaveLength(1);
      expect(events[0].processedAt).toBeInstanceOf(Date);
      expect(events[0].error).toBeNull();
    });

    it('erro de banco que nao e unicidade relanca e nao dispara o dispatch', async () => {
      const { service, prisma, asaas } = setup({
        rows: [row({ asaasSubscriptionId: 'asaas-sub-1' })],
      });
      prisma.billingEvent.create.mockRejectedValueOnce(
        new Error('conexao caiu'),
      );

      await expect(
        service.processWebhookEvent(TOKEN, paymentEvent('PAYMENT_CONFIRMED')),
      ).rejects.toThrow('conexao caiu');
      expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
      expect(asaas.getSubscription).not.toHaveBeenCalled();
    });
  });

  describe('CHECKOUT_PAID', () => {
    const checkoutEvent = (checkout: Record<string, unknown>) => ({
      id: 'evt_checkout_1',
      event: 'CHECKOUT_PAID',
      checkout,
    });

    it('acha pela asaasCheckoutId, grava asaasSubscriptionId/customer e reconcilia', async () => {
      const { service, rows, asaas } = setup({
        rows: [
          row({ id: 'local-1', status: 'PENDING', asaasCheckoutId: 'chk-1' }),
        ],
      });
      asaas.getSubscription.mockResolvedValue({
        id: 'asaas-sub-9',
        deleted: false,
        nextDueDate: FUTURE_DUE,
        externalReference: null,
      });

      await service.processWebhookEvent(
        TOKEN,
        checkoutEvent({
          id: 'chk-1',
          subscription: 'asaas-sub-9',
          customer: 'cus-1',
        }),
      );

      expect(asaas.getSubscription).toHaveBeenCalledWith('asaas-sub-9');
      expect(rows[0]).toMatchObject({
        asaasSubscriptionId: 'asaas-sub-9',
        asaasCustomerId: 'cus-1',
        status: 'ACTIVE',
      });
    });

    it('CHECKOUT_PAID sem checkout.subscription liga pela busca por checkoutSession e reconcilia', async () => {
      const { service, rows, asaas } = setup({
        rows: [
          row({ id: 'local-1', status: 'PENDING', asaasCheckoutId: 'chk-1' }),
        ],
      });
      asaas.findSubscriptionByCheckoutSession.mockResolvedValue({
        id: 'asaas-sub-9',
        deleted: false,
        nextDueDate: FUTURE_DUE,
        externalReference: null,
      });
      asaas.getSubscription.mockResolvedValue({
        id: 'asaas-sub-9',
        deleted: false,
        nextDueDate: FUTURE_DUE,
        externalReference: null,
      });

      await service.processWebhookEvent(TOKEN, checkoutEvent({ id: 'chk-1' }));

      expect(asaas.findSubscriptionByCheckoutSession).toHaveBeenCalledWith(
        'chk-1',
      );
      expect(rows[0]).toMatchObject({
        asaasSubscriptionId: 'asaas-sub-9',
        status: 'ACTIVE',
      });
    });

    it('CHECKOUT_PAID sem checkout.subscription e sem achado remoto nao altera nada', async () => {
      const { service, rows, asaas } = setup({
        rows: [
          row({ id: 'local-1', status: 'PENDING', asaasCheckoutId: 'chk-1' }),
        ],
      });
      asaas.findSubscriptionByCheckoutSession.mockResolvedValue(null);

      await service.processWebhookEvent(TOKEN, checkoutEvent({ id: 'chk-1' }));

      expect(asaas.getSubscription).not.toHaveBeenCalled();
      expect(rows[0]).toMatchObject({
        asaasSubscriptionId: null,
        status: 'PENDING',
      });
    });

    it('CHECKOUT_PAID com checkout.subscription nao varre o Asaas', async () => {
      const { service, asaas } = setup({
        rows: [
          row({ id: 'local-1', status: 'PENDING', asaasCheckoutId: 'chk-1' }),
        ],
      });
      asaas.getSubscription.mockResolvedValue({
        id: 'asaas-sub-9',
        deleted: false,
        nextDueDate: FUTURE_DUE,
        externalReference: null,
      });

      await service.processWebhookEvent(
        TOKEN,
        checkoutEvent({ id: 'chk-1', subscription: 'asaas-sub-9' }),
      );

      expect(asaas.findSubscriptionByCheckoutSession).not.toHaveBeenCalled();
    });

    it('CHECKOUT_PAID: assinatura remota que ja pertence a outra linha (P2002) nao relanca nem altera', async () => {
      const { service, rows, asaas, prisma } = setup({
        rows: [
          row({ id: 'local-1', status: 'PENDING', asaasCheckoutId: 'chk-1' }),
        ],
      });
      asaas.findSubscriptionByCheckoutSession.mockResolvedValue({
        id: 'asaas-sub-9',
        deleted: false,
        nextDueDate: FUTURE_DUE,
        externalReference: null,
      });
      // A 1ª gravação (customer) passa; a ligação por checkoutSession bate na unicidade.
      prisma.subscription.update.mockImplementationOnce(
        async ({ where, data }: any) => {
          Object.assign(rows.find((r) => r.id === where.id)!, data);
          return { ...rows.find((r) => r.id === where.id)! };
        },
      );
      prisma.subscription.update.mockImplementationOnce(async () => {
        throw Object.assign(new Error('Unique constraint failed'), {
          code: 'P2002',
        });
      });

      await expect(
        service.processWebhookEvent(TOKEN, checkoutEvent({ id: 'chk-1' })),
      ).resolves.toEqual({ ok: true });

      expect(asaas.getSubscription).not.toHaveBeenCalled();
      expect(rows[0].asaasSubscriptionId).toBeNull();
    });

    it('sem achar pelo checkout, acha por externalReference (source ASAAS)', async () => {
      const { service, rows, asaas } = setup({
        rows: [
          row({ id: 'local-2', status: 'PENDING', asaasCheckoutId: null }),
        ],
      });
      asaas.getSubscription.mockResolvedValue({
        id: 'asaas-sub-7',
        deleted: false,
        nextDueDate: FUTURE_DUE,
        externalReference: null,
      });

      await service.processWebhookEvent(
        TOKEN,
        checkoutEvent({
          id: 'chk-x',
          externalReference: 'local-2',
          subscription: 'asaas-sub-7',
        }),
      );

      expect(rows[0].asaasSubscriptionId).toBe('asaas-sub-7');
      expect(rows[0].status).toBe('ACTIVE');
    });

    it('externalReference nao casa com linha de outra source (GRANT): nada e alterado', async () => {
      const { service, rows, asaas } = setup({
        rows: [row({ id: 'grant-1', source: 'GRANT', status: 'ACTIVE' })],
      });

      await expect(
        service.processWebhookEvent(
          TOKEN,
          checkoutEvent({
            id: 'chk-y',
            externalReference: 'grant-1',
            subscription: 'asaas-sub-3',
          }),
        ),
      ).resolves.toEqual({ ok: true });
      expect(rows[0].asaasSubscriptionId).toBeNull();
      expect(asaas.getSubscription).not.toHaveBeenCalled();
    });

    it('nao apaga asaasSubscriptionId existente quando o checkout nao traz subscription', async () => {
      const { service, rows, asaas } = setup({
        rows: [
          row({
            id: 'local-3',
            status: 'PENDING',
            asaasCheckoutId: 'chk-3',
            asaasSubscriptionId: 'asaas-old',
            asaasCustomerId: 'cus-old',
          }),
        ],
      });
      asaas.getSubscription.mockResolvedValue({
        id: 'asaas-old',
        deleted: false,
        nextDueDate: FUTURE_DUE,
        externalReference: null,
      });

      await service.processWebhookEvent(TOKEN, checkoutEvent({ id: 'chk-3' }));

      expect(rows[0]).toMatchObject({
        asaasSubscriptionId: 'asaas-old',
        asaasCustomerId: 'cus-old',
      });
    });

    it('sem checkout.id ou sem linha local: ok e nada gravado', async () => {
      const { service, rows, asaas } = setup({
        rows: [row({ id: 'local-4', asaasCheckoutId: 'chk-4' })],
      });

      await expect(
        service.processWebhookEvent(
          TOKEN,
          checkoutEvent({ subscription: 'asaas-z' }),
        ),
      ).resolves.toEqual({ ok: true });
      await expect(
        service.processWebhookEvent(TOKEN, {
          id: 'evt_c2',
          event: 'CHECKOUT_PAID',
          checkout: { id: 'chk-nao-existe' },
        }),
      ).resolves.toEqual({ ok: true });
      expect(rows[0].asaasSubscriptionId).toBeNull();
      expect(asaas.getSubscription).not.toHaveBeenCalled();
    });

    it('sem checkout.id nem consulta o banco (where com undefined no Prisma casaria qualquer linha)', async () => {
      const { service, prisma } = setup({
        rows: [row({ id: 'local-5', asaasCheckoutId: 'chk-5' })],
      });

      await service.processWebhookEvent(
        TOKEN,
        checkoutEvent({
          subscription: 'asaas-z',
          externalReference: 'local-5',
        }),
      );

      expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });
  });

  describe('PAYMENT_CONFIRMED / PAYMENT_RECEIVED / PAYMENT_OVERDUE', () => {
    it.each(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'])(
      '%s reconcilia a assinatura achada por payment.subscription',
      async (event) => {
        const { service, rows, asaas } = setup({
          rows: [
            row({
              id: 'sub-1',
              status: 'PENDING',
              asaasSubscriptionId: 'asaas-sub-1',
            }),
          ],
        });
        asaas.getSubscription.mockResolvedValue({
          id: 'asaas-sub-1',
          deleted: false,
          nextDueDate: FUTURE_DUE,
          externalReference: null,
        });

        await service.processWebhookEvent(TOKEN, paymentEvent(event));

        expect(asaas.getSubscription).toHaveBeenCalledWith('asaas-sub-1');
        expect(rows[0]).toMatchObject({
          status: 'ACTIVE',
          currentPeriodEnd: new Date(FUTURE_DUE),
        });
      },
    );

    it('casa por payment.subscription e NUNCA por payment.externalReference', async () => {
      const { service, rows, asaas } = setup({
        rows: [
          row({
            id: 'local-A',
            asaasSubscriptionId: 'asaas-outra',
            status: 'ACTIVE',
            currentPeriodEnd: PERIOD_END,
          }),
          row({
            id: 'local-B',
            asaasSubscriptionId: 'asaas-sub-1',
            status: 'PENDING',
          }),
        ],
      });
      asaas.getSubscription.mockResolvedValue({
        id: 'asaas-sub-1',
        deleted: false,
        nextDueDate: FUTURE_DUE,
        externalReference: null,
      });

      await service.processWebhookEvent(
        TOKEN,
        paymentEvent('PAYMENT_CONFIRMED', { externalReference: 'local-A' }),
      );

      expect(asaas.getSubscription).toHaveBeenCalledTimes(1);
      expect(asaas.getSubscription).toHaveBeenCalledWith('asaas-sub-1');
      expect(rows[0]).toMatchObject({
        id: 'local-A',
        status: 'ACTIVE',
        currentPeriodEnd: PERIOD_END,
      });
      expect(rows[1].status).toBe('ACTIVE');
    });

    it('payment.subscription sem linha local: ok sem consultar o Asaas', async () => {
      const { service, asaas } = setup({
        rows: [row({ asaasSubscriptionId: 'asaas-outra' })],
      });

      await expect(
        service.processWebhookEvent(
          TOKEN,
          paymentEvent('PAYMENT_CONFIRMED', {
            subscription: 'asaas-desconhecida',
          }),
        ),
      ).resolves.toEqual({ ok: true });
      expect(asaas.getSubscription).not.toHaveBeenCalled();
    });

    it('payment.subscription sem linha local (nem por checkoutSession) registra warn com o id e nao consulta o Asaas', async () => {
      const { service, asaas } = setup({
        rows: [
          row({
            id: 'local-1',
            status: 'PENDING',
            asaasCheckoutId: 'chk-1',
            asaasSubscriptionId: null,
          }),
        ],
      });
      const warnSpy = Logger.prototype.warn as unknown as jest.SpyInstance;
      warnSpy.mockClear();

      await service.processWebhookEvent(
        TOKEN,
        paymentEvent('PAYMENT_OVERDUE', {
          subscription: 'asaas-desconhecida',
          checkoutSession: 'chk-de-outro',
        }),
      );

      expect(asaas.getSubscription).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('asaas-desconhecida'),
      );
    });

    it('payment.checkoutSession liga a linha do checkout que ainda nao tinha assinatura e reconcilia', async () => {
      const { service, rows, asaas } = setup({
        rows: [
          row({
            id: 'local-1',
            status: 'PENDING',
            asaasCheckoutId: 'chk-1',
            asaasSubscriptionId: null,
          }),
        ],
      });
      asaas.getSubscription.mockResolvedValue({
        id: 'asaas-sub-1',
        deleted: false,
        nextDueDate: FUTURE_DUE,
        externalReference: null,
      });

      await service.processWebhookEvent(
        TOKEN,
        paymentEvent('PAYMENT_CONFIRMED', { checkoutSession: 'chk-1' }),
      );

      expect(rows[0]).toMatchObject({
        asaasSubscriptionId: 'asaas-sub-1',
        status: 'ACTIVE',
      });
    });

    it('payment.checkoutSession nao religa linha que ja aponta para outra assinatura', async () => {
      const { service, rows, asaas } = setup({
        rows: [
          row({
            id: 'local-1',
            status: 'ACTIVE',
            asaasCheckoutId: 'chk-1',
            asaasSubscriptionId: 'asaas-outra',
          }),
        ],
      });

      await service.processWebhookEvent(
        TOKEN,
        paymentEvent('PAYMENT_CONFIRMED', { checkoutSession: 'chk-1' }),
      );

      expect(asaas.getSubscription).not.toHaveBeenCalled();
      expect(rows[0].asaasSubscriptionId).toBe('asaas-outra');
    });

    it('payment.checkoutSession so liga linha ASAAS (nunca GRANT)', async () => {
      const { service, rows, asaas } = setup({
        rows: [
          row({
            id: 'local-1',
            source: 'GRANT',
            status: 'ACTIVE',
            asaasCheckoutId: 'chk-1',
            asaasSubscriptionId: null,
          }),
        ],
      });

      await service.processWebhookEvent(
        TOKEN,
        paymentEvent('PAYMENT_CONFIRMED', { checkoutSession: 'chk-1' }),
      );

      expect(asaas.getSubscription).not.toHaveBeenCalled();
      expect(rows[0].asaasSubscriptionId).toBeNull();
    });

    it.each([
      ['ausente', undefined],
      ['objeto (filtro do Prisma)', { not: null }],
      ['numero', 123],
      ['string vazia', ''],
    ])(
      'payment.checkoutSession %s nao liga nem consulta linha alguma',
      async (_label, checkoutSession) => {
        const { service, rows, asaas, prisma } = setup({
          rows: [
            row({
              id: 'local-1',
              status: 'PENDING',
              asaasCheckoutId: 'chk-1',
              asaasSubscriptionId: null,
            }),
          ],
        });

        await service.processWebhookEvent(
          TOKEN,
          paymentEvent('PAYMENT_CONFIRMED', { checkoutSession }),
        );

        // So a busca por asaasSubscriptionId; nenhuma por asaasCheckoutId.
        expect(prisma.subscription.findFirst).toHaveBeenCalledTimes(1);
        expect(asaas.getSubscription).not.toHaveBeenCalled();
        expect(rows[0]).toMatchObject({
          asaasSubscriptionId: null,
          status: 'PENDING',
        });
      },
    );

    it('falha do Asaas depois de ligar por checkoutSession: 5xx, linha fica ligada e PENDING, reenvio conclui', async () => {
      const { service, rows, asaas, events } = setup({
        rows: [
          row({
            id: 'local-1',
            status: 'PENDING',
            asaasCheckoutId: 'chk-1',
            asaasSubscriptionId: null,
          }),
        ],
      });
      asaas.getSubscription.mockRejectedValueOnce(new Error('asaas fora'));
      asaas.getSubscription.mockResolvedValue({
        id: 'asaas-sub-1',
        deleted: false,
        nextDueDate: FUTURE_DUE,
        externalReference: null,
      });
      const event = paymentEvent('PAYMENT_CONFIRMED', {
        checkoutSession: 'chk-1',
      });

      await expect(service.processWebhookEvent(TOKEN, event)).rejects.toThrow(
        'asaas fora',
      );
      expect(rows[0]).toMatchObject({
        asaasSubscriptionId: 'asaas-sub-1',
        status: 'PENDING',
      });
      expect(events[0].processedAt).toBeNull();

      await service.processWebhookEvent(TOKEN, event);
      expect(rows[0]).toMatchObject({
        asaasSubscriptionId: 'asaas-sub-1',
        status: 'ACTIVE',
      });
      expect(events[0].processedAt).not.toBeNull();
    });

    it('PAYMENT_REFUNDED por checkoutSession liga a linha ainda sem assinatura e expira, sem dar acesso', async () => {
      const { service, rows, asaas } = setup({
        rows: [
          row({
            id: 'local-1',
            status: 'PENDING',
            asaasCheckoutId: 'chk-1',
            asaasSubscriptionId: null,
          }),
        ],
      });

      await service.processWebhookEvent(
        TOKEN,
        paymentEvent('PAYMENT_REFUNDED', { checkoutSession: 'chk-1' }),
      );

      expect(asaas.getSubscription).not.toHaveBeenCalled();
      expect(rows[0]).toMatchObject({
        asaasSubscriptionId: 'asaas-sub-1',
        status: 'EXPIRED',
        currentPeriodEnd: new Date(NOW),
      });
    });

    it('linha EXPIRED ligada nao volta a ACTIVE por PAYMENT_CONFIRMED nem por checkoutSession', async () => {
      const { service, rows, asaas } = setup({
        rows: [
          row({
            id: 'local-1',
            status: 'EXPIRED',
            asaasCheckoutId: 'chk-1',
            asaasSubscriptionId: 'asaas-sub-1',
            currentPeriodEnd: new Date(NOW),
          }),
        ],
      });

      await service.processWebhookEvent(
        TOKEN,
        paymentEvent('PAYMENT_CONFIRMED', { checkoutSession: 'chk-1' }),
      );

      expect(asaas.getSubscription).not.toHaveBeenCalled();
      expect(rows[0].status).toBe('EXPIRED');
    });

    it('PAYMENT_OVERDUE com checkoutSession de outro cliente nao liga a linha do usuario', async () => {
      const { service, rows, asaas } = setup({
        rows: [
          row({
            id: 'local-1',
            status: 'PENDING',
            asaasCheckoutId: 'chk-1',
            asaasSubscriptionId: null,
          }),
        ],
      });

      await service.processWebhookEvent(
        TOKEN,
        paymentEvent('PAYMENT_OVERDUE', { checkoutSession: 'chk-de-outro' }),
      );

      expect(asaas.getSubscription).not.toHaveBeenCalled();
      expect(rows[0].asaasSubscriptionId).toBeNull();
    });

    it('PAYMENT_OVERDUE com periodo vencido vira PAST_DUE e grava latestInvoiceUrl', async () => {
      const { service, rows, asaas } = setup({
        rows: [
          row({
            id: 'sub-1',
            status: 'ACTIVE',
            asaasSubscriptionId: 'asaas-sub-1',
            currentPeriodEnd: PERIOD_END,
          }),
        ],
      });
      asaas.getSubscription.mockResolvedValue({
        id: 'asaas-sub-1',
        deleted: false,
        nextDueDate: '2026-11-10',
        externalReference: null,
      });

      await service.processWebhookEvent(
        TOKEN,
        paymentEvent('PAYMENT_OVERDUE', {
          invoiceUrl: 'https://asaas.test/i/77',
        }),
      );

      expect(rows[0]).toMatchObject({
        status: 'PAST_DUE',
        pastDueSince: new Date(NOW),
        latestInvoiceUrl: 'https://asaas.test/i/77',
      });
    });
  });

  describe('PAYMENT_REFUNDED', () => {
    it('encerra na hora como EXPIRED com fim = agora, sem consultar o Asaas', async () => {
      const { service, rows, asaas } = setup({
        rows: [
          row({
            id: 'sub-1',
            status: 'ACTIVE',
            asaasSubscriptionId: 'asaas-sub-1',
            currentPeriodEnd: PERIOD_END,
          }),
        ],
      });

      await service.processWebhookEvent(
        TOKEN,
        paymentEvent('PAYMENT_REFUNDED'),
      );

      expect(asaas.getSubscription).not.toHaveBeenCalled();
      expect(rows[0]).toMatchObject({
        status: 'EXPIRED',
        currentPeriodEnd: new Date(NOW),
      });
    });

    it('reembolso sem linha local: ok', async () => {
      const { service, rows } = setup({
        rows: [row({ asaasSubscriptionId: 'asaas-outra', status: 'ACTIVE' })],
      });

      await expect(
        service.processWebhookEvent(
          TOKEN,
          paymentEvent('PAYMENT_REFUNDED', {
            subscription: 'asaas-nao-existe',
          }),
        ),
      ).resolves.toEqual({ ok: true });
      expect(rows[0].status).toBe('ACTIVE');
    });
  });

  describe('SUBSCRIPTION_DELETED / SUBSCRIPTION_INACTIVATED', () => {
    it.each(['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'])(
      '%s acha por subscription.id e reconcilia (deleted: true vira CANCELED)',
      async (event) => {
        const { service, rows, asaas } = setup({
          rows: [
            row({
              id: 'sub-1',
              status: 'ACTIVE',
              asaasSubscriptionId: 'asaas-sub-1',
              currentPeriodEnd: PERIOD_END,
            }),
          ],
        });
        asaas.getSubscription.mockResolvedValue({
          id: 'asaas-sub-1',
          deleted: true,
          nextDueDate: FUTURE_DUE,
          externalReference: null,
        });

        await service.processWebhookEvent(TOKEN, {
          id: `evt_${event}`,
          event,
          subscription: { id: 'asaas-sub-1' },
        });

        expect(asaas.getSubscription).toHaveBeenCalledWith('asaas-sub-1');
        expect(rows[0].status).toBe('CANCELED');
      },
    );
  });

  describe('evento desconhecido', () => {
    it('e registrado, marcado como processado, so em debug (sem warn) e nao altera assinatura', async () => {
      const { service, prisma, events, rows, asaas } = setup({
        rows: [row({ asaasSubscriptionId: 'asaas-sub-1', status: 'ACTIVE' })],
      });
      const warnSpy = Logger.prototype.warn as unknown as jest.SpyInstance;
      const debugSpy = Logger.prototype.debug as unknown as jest.SpyInstance;

      await expect(
        service.processWebhookEvent(TOKEN, {
          id: 'evt_u',
          event: 'PLAN_UPDATED',
        }),
      ).resolves.toEqual({ ok: true });

      expect(prisma.billingEvent.create).toHaveBeenCalledTimes(1);
      expect(events[0].processedAt).toBeInstanceOf(Date);
      expect(debugSpy).toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(rows[0].status).toBe('ACTIVE');
      expect(asaas.getSubscription).not.toHaveBeenCalled();
    });

    it.each(['PAYMENT_CREATED', 'PAYMENT_UPDATED'])(
      '%s com payment.subscription (chega todo ciclo): registra, processa, sem warn e sem tocar a assinatura',
      async (event) => {
        const { service, events, rows, asaas } = setup({
          rows: [row({ asaasSubscriptionId: 'asaas-sub-1', status: 'ACTIVE' })],
        });
        const warnSpy = Logger.prototype.warn as unknown as jest.SpyInstance;

        await expect(
          service.processWebhookEvent(TOKEN, paymentEvent(event)),
        ).resolves.toEqual({ ok: true });

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe(event);
        expect(events[0].processedAt).toBeInstanceOf(Date);
        expect(warnSpy).not.toHaveBeenCalled();
        expect(rows[0].status).toBe('ACTIVE');
        expect(asaas.getSubscription).not.toHaveBeenCalled();
      },
    );
  });

  describe('falha no dispatch', () => {
    it('grava error, nao grava processedAt e relanca o erro original', async () => {
      const { service, prisma, events } = setup({
        rows: [row({ asaasSubscriptionId: 'asaas-sub-1' })],
      });
      prisma.subscription.findFirst.mockRejectedValueOnce(
        new Error('banco caiu'),
      );

      await expect(
        service.processWebhookEvent(TOKEN, paymentEvent('PAYMENT_CONFIRMED')),
      ).rejects.toThrow('banco caiu');
      expect(events[0].error).toBe('banco caiu');
      expect(events[0].processedAt).toBeNull();
    });

    it('trunca a mensagem gravada em 500 caracteres', async () => {
      const { service, prisma, events } = setup({
        rows: [row({ asaasSubscriptionId: 'asaas-sub-1' })],
      });
      prisma.subscription.findFirst.mockRejectedValueOnce(
        new Error('e'.repeat(800)),
      );

      await expect(
        service.processWebhookEvent(TOKEN, paymentEvent('PAYMENT_CONFIRMED')),
      ).rejects.toThrow();
      expect(String(events[0].error)).toHaveLength(500);
    });

    it('se gravar o erro tambem falhar, ainda relanca o erro original e registra o segundo', async () => {
      const { service, prisma, events } = setup({
        rows: [row({ asaasSubscriptionId: 'asaas-sub-1' })],
      });
      prisma.subscription.findFirst.mockRejectedValueOnce(
        new Error('erro original'),
      );
      prisma.billingEvent.update.mockRejectedValueOnce(
        new Error('disco cheio'),
      );
      const errorSpy = Logger.prototype.error as unknown as jest.SpyInstance;

      await expect(
        service.processWebhookEvent(TOKEN, paymentEvent('PAYMENT_CONFIRMED')),
      ).rejects.toThrow('erro original');
      expect(errorSpy).toHaveBeenCalled();
      expect(events[0].processedAt).toBeNull();
    });

    it('retry depois da falha reprocessa e marca processedAt', async () => {
      const { service, prisma, events, rows, asaas } = setup({
        rows: [
          row({
            id: 'sub-1',
            status: 'PENDING',
            asaasSubscriptionId: 'asaas-sub-1',
          }),
        ],
      });
      asaas.getSubscription.mockResolvedValue({
        id: 'asaas-sub-1',
        deleted: false,
        nextDueDate: FUTURE_DUE,
        externalReference: null,
      });
      prisma.subscription.findFirst.mockRejectedValueOnce(
        new Error('falha transitoria'),
      );

      await expect(
        service.processWebhookEvent(TOKEN, paymentEvent('PAYMENT_CONFIRMED')),
      ).rejects.toThrow();
      await expect(
        service.processWebhookEvent(TOKEN, paymentEvent('PAYMENT_CONFIRMED')),
      ).resolves.toEqual({ ok: true });

      expect(events).toHaveLength(1);
      expect(events[0].processedAt).toBeInstanceOf(Date);
      expect(rows[0].status).toBe('ACTIVE');
    });
  });

  describe('token: comparação em tempo constante', () => {
    it('usa crypto.timingSafeEqual quando os tamanhos batem', async () => {
      const { service } = setup();
      const spy = jest.spyOn(nodeCrypto, 'timingSafeEqual');

      await service.processWebhookEvent(TOKEN, {
        id: 'evt_t1',
        event: 'PLAN_UPDATED',
      });

      expect(spy).toHaveBeenCalledTimes(1);
      const [a, b] = spy.mock.calls[0] as unknown as [Buffer, Buffer];
      expect(a.toString()).toBe(TOKEN);
      expect(b.toString()).toBe(TOKEN);
    });

    it('token de tamanho diferente recusa sem chamar timingSafeEqual (que lançaria RangeError)', async () => {
      const { service } = setup();
      const spy = jest.spyOn(nodeCrypto, 'timingSafeEqual');

      await expect(
        service.processWebhookEvent(`${TOKEN}-x`, {
          id: 'evt_t2',
          event: 'PLAN_UPDATED',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('idempotência: bordas', () => {
    it('P2002 sem registro achado relança o erro original (não engole)', async () => {
      const { service, prisma, asaas } = setup({
        rows: [row({ asaasSubscriptionId: 'asaas-sub-1' })],
      });
      const p2002 = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
      prisma.billingEvent.create.mockRejectedValueOnce(p2002);

      await expect(
        service.processWebhookEvent(TOKEN, paymentEvent('PAYMENT_CONFIRMED')),
      ).rejects.toBe(p2002);
      expect(prisma.billingEvent.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.billingEvent.update).not.toHaveBeenCalled();
      expect(asaas.getSubscription).not.toHaveBeenCalled();
    });

    it('retry reaproveita o mesmo registro: não cria outro e grava processedAt nele', async () => {
      const { service, prisma, events } = setup({
        rows: [row({ asaasSubscriptionId: 'asaas-sub-1', status: 'ACTIVE' })],
        events: [
          {
            id: 'evt-old',
            externalEventId: 'evt_PLAN_UPDATED_1',
            type: 'PLAN_UPDATED',
            payload: {},
            processedAt: null,
            error: 'antigo',
          },
        ],
      });

      await service.processWebhookEvent(TOKEN, {
        id: 'evt_PLAN_UPDATED_1',
        event: 'PLAN_UPDATED',
      });

      expect(events).toHaveLength(1);
      expect(prisma.billingEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-old' },
        data: { processedAt: expect.any(Date), error: null },
      });
    });

    it('processedAt só é gravado depois do dispatch', async () => {
      const { service, prisma, asaas } = setup({
        rows: [
          row({
            status: 'PENDING',
            asaasSubscriptionId: 'asaas-sub-1',
          }),
        ],
      });
      asaas.getSubscription.mockResolvedValue({
        id: 'asaas-sub-1',
        deleted: false,
        nextDueDate: FUTURE_DUE,
        externalReference: null,
      });

      await service.processWebhookEvent(
        TOKEN,
        paymentEvent('PAYMENT_CONFIRMED'),
      );

      const processedCall = prisma.billingEvent.update.mock.calls.findIndex(
        (c: any[]) => c[0].data.processedAt instanceof Date,
      );
      expect(asaas.getSubscription.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.billingEvent.update.mock.invocationCallOrder[processedCall],
      );
    });

    it('erro não-Error no dispatch é gravado como texto e relançado', async () => {
      const { service, prisma, events } = setup({
        rows: [row({ asaasSubscriptionId: 'asaas-sub-1' })],
      });
      prisma.subscription.findFirst.mockRejectedValueOnce('texto puro');

      await expect(
        service.processWebhookEvent(TOKEN, paymentEvent('PAYMENT_CONFIRMED')),
      ).rejects.toBe('texto puro');
      expect(events[0].error).toBe('texto puro');
    });
  });

  describe('CHECKOUT_PAID: ids já ligados (P1)', () => {
    const checkoutEvent = (checkout: Record<string, unknown>) => ({
      id: 'evt_checkout_p1',
      event: 'CHECKOUT_PAID',
      checkout,
    });

    it('linha já ligada a OUTRA assinatura do Asaas: não sobrescreve, avisa e não reconcilia', async () => {
      const { service, rows, asaas, prisma, events } = setup({
        rows: [
          row({
            id: 'local-1',
            status: 'ACTIVE',
            asaasCheckoutId: 'chk-1',
            asaasSubscriptionId: 'asaas-original',
            asaasCustomerId: 'cus-original',
            currentPeriodEnd: PERIOD_END,
          }),
        ],
      });
      const warnSpy = Logger.prototype.warn as unknown as jest.SpyInstance;

      await expect(
        service.processWebhookEvent(
          TOKEN,
          checkoutEvent({
            id: 'chk-1',
            subscription: 'asaas-estranha',
            customer: 'cus-estranho',
          }),
        ),
      ).resolves.toEqual({ ok: true });

      expect(rows[0]).toMatchObject({
        asaasSubscriptionId: 'asaas-original',
        asaasCustomerId: 'cus-original',
        status: 'ACTIVE',
      });
      expect(prisma.subscription.update).not.toHaveBeenCalled();
      expect(asaas.getSubscription).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      expect(events[0].processedAt).toBeInstanceOf(Date);
    });

    it('mesmo id de assinatura já gravado (reentrega): segue e reconcilia', async () => {
      const { service, rows, asaas } = setup({
        rows: [
          row({
            id: 'local-1',
            status: 'PENDING',
            asaasCheckoutId: 'chk-1',
            asaasSubscriptionId: 'asaas-sub-9',
          }),
        ],
      });
      asaas.getSubscription.mockResolvedValue({
        id: 'asaas-sub-9',
        deleted: false,
        nextDueDate: FUTURE_DUE,
        externalReference: null,
      });

      await service.processWebhookEvent(
        TOKEN,
        checkoutEvent({ id: 'chk-1', subscription: 'asaas-sub-9' }),
      );

      expect(asaas.getSubscription).toHaveBeenCalledWith('asaas-sub-9');
      expect(rows[0].status).toBe('ACTIVE');
    });

    it('P2002 no update (outra linha já tem o id): avisa, não relança e marca processado', async () => {
      const { service, prisma, events, asaas } = setup({
        rows: [
          row({ id: 'local-1', status: 'PENDING', asaasCheckoutId: 'chk-1' }),
        ],
      });
      prisma.subscription.update.mockRejectedValueOnce(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );
      const warnSpy = Logger.prototype.warn as unknown as jest.SpyInstance;

      await expect(
        service.processWebhookEvent(
          TOKEN,
          checkoutEvent({ id: 'chk-1', subscription: 'asaas-duplicada' }),
        ),
      ).resolves.toEqual({ ok: true });

      expect(warnSpy).toHaveBeenCalled();
      expect(asaas.getSubscription).not.toHaveBeenCalled();
      expect(events[0].processedAt).toBeInstanceOf(Date);
      expect(events[0].error).toBeNull();
    });

    it('erro do update que não é P2002 continua relançando (5xx para o Asaas reenviar)', async () => {
      const { service, prisma, events } = setup({
        rows: [
          row({ id: 'local-1', status: 'PENDING', asaasCheckoutId: 'chk-1' }),
        ],
      });
      prisma.subscription.update.mockRejectedValueOnce(new Error('banco caiu'));

      await expect(
        service.processWebhookEvent(
          TOKEN,
          checkoutEvent({ id: 'chk-1', subscription: 'asaas-sub-1' }),
        ),
      ).rejects.toThrow('banco caiu');
      expect(events[0].processedAt).toBeNull();
    });

    it('reconcilia a linha ATUALIZADA (com o asaasSubscriptionId recém-gravado)', async () => {
      const { service, asaas } = setup({
        rows: [
          row({ id: 'local-1', status: 'PENDING', asaasCheckoutId: 'chk-1' }),
        ],
      });
      const reconcileSpy = jest.spyOn(service, 'reconcileSubscription');
      asaas.getSubscription.mockResolvedValue({
        id: 'asaas-sub-5',
        deleted: false,
        nextDueDate: FUTURE_DUE,
        externalReference: null,
      });

      await service.processWebhookEvent(
        TOKEN,
        checkoutEvent({
          id: 'chk-1',
          subscription: 'asaas-sub-5',
          customer: 'cus-5',
        }),
      );

      expect(reconcileSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'local-1',
          asaasSubscriptionId: 'asaas-sub-5',
          asaasCustomerId: 'cus-5',
        }),
      );
    });
  });

  describe('PAYMENT_*: latestInvoiceUrl e ordem real (P4, P5)', () => {
    const remote = (nextDueDate: string) => ({
      id: 'asaas-sub-1',
      deleted: false,
      nextDueDate,
      externalReference: null,
    });

    it('invoiceUrl ausente ou não string: não grava latestInvoiceUrl', async () => {
      const { service, rows, asaas } = setup({
        rows: [
          row({
            status: 'PENDING',
            asaasSubscriptionId: 'asaas-sub-1',
            latestInvoiceUrl: 'https://asaas.test/i/antiga',
          }),
        ],
      });
      asaas.getSubscription.mockResolvedValue(remote(FUTURE_DUE));

      await service.processWebhookEvent(
        TOKEN,
        paymentEvent('PAYMENT_CONFIRMED', { invoiceUrl: 123 }),
      );

      expect(rows[0].latestInvoiceUrl).toBe('https://asaas.test/i/antiga');
    });

    it('com invoiceUrl: grava e reconcilia a linha devolvida pelo update', async () => {
      const { service, rows, asaas, prisma } = setup({
        rows: [row({ status: 'PENDING', asaasSubscriptionId: 'asaas-sub-1' })],
      });
      const reconcileSpy = jest.spyOn(service, 'reconcileSubscription');
      asaas.getSubscription.mockResolvedValue(remote(FUTURE_DUE));

      await service.processWebhookEvent(
        TOKEN,
        paymentEvent('PAYMENT_CONFIRMED', {
          invoiceUrl: 'https://asaas.test/i/9',
        }),
      );

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-x' },
        data: { latestInvoiceUrl: 'https://asaas.test/i/9' },
      });
      expect(reconcileSpy).toHaveBeenCalledWith(
        expect.objectContaining({ latestInvoiceUrl: 'https://asaas.test/i/9' }),
      );
      expect(rows[0]).toMatchObject({
        status: 'ACTIVE',
        latestInvoiceUrl: 'https://asaas.test/i/9',
      });
    });

    it('PAYMENT_OVERDUE com período futuro não rebaixa (decisão do dono) mas grava latestInvoiceUrl', async () => {
      const future = new Date(NOW.getTime() + 10 * DAY);
      const { service, rows, asaas } = setup({
        rows: [
          row({
            status: 'ACTIVE',
            asaasSubscriptionId: 'asaas-sub-1',
            currentPeriodEnd: future,
          }),
        ],
      });
      asaas.getSubscription.mockResolvedValue(
        remote(future.toISOString().slice(0, 10)),
      );

      await service.processWebhookEvent(
        TOKEN,
        paymentEvent('PAYMENT_OVERDUE', {
          invoiceUrl: 'https://asaas.test/i/10',
        }),
      );

      expect(rows[0]).toMatchObject({
        status: 'ACTIVE',
        currentPeriodEnd: future,
        latestInvoiceUrl: 'https://asaas.test/i/10',
      });
    });

    // RISCO CONHECIDO (Task 12, sandbox real): documenta o comportamento atual, NÃO é regra desejada.
    // Se o Asaas ainda devolver nextDueDate = hoje no CHECKOUT_PAID, o período fica "hoje 00:00 UTC"
    // (já passado); o PAYMENT_CONFIRMED seguinte, com o mesmo nextDueDate, cai em "não avançou"
    // com período vencido e rebaixa para PAST_DUE. Só o Asaas real confirma se isso acontece.
    it('RISCO documentado: CHECKOUT_PAID com nextDueDate = hoje e depois PAYMENT_CONFIRMED igual rebaixa para PAST_DUE', async () => {
      const today = NOW.toISOString().slice(0, 10);
      const { service, rows, asaas } = setup({
        rows: [
          row({
            id: 'local-1',
            status: 'PENDING',
            asaasCheckoutId: 'chk-1',
          }),
        ],
      });
      asaas.getSubscription.mockResolvedValue(remote(today));

      await service.processWebhookEvent(TOKEN, {
        id: 'evt_checkout_risk',
        event: 'CHECKOUT_PAID',
        checkout: { id: 'chk-1', subscription: 'asaas-sub-1' },
      });
      expect(rows[0]).toMatchObject({
        status: 'ACTIVE',
        currentPeriodEnd: new Date(`${today}T00:00:00.000Z`),
      });

      await service.processWebhookEvent(
        TOKEN,
        paymentEvent('PAYMENT_CONFIRMED'),
      );
      expect(rows[0].status).toBe('PAST_DUE');
    });
  });

  describe('SUBSCRIPTION_*: casa só por subscription.id', () => {
    it('com duas linhas, cancela só a do id recebido', async () => {
      const { service, rows, asaas } = setup({
        rows: [
          row({
            id: 'local-A',
            status: 'ACTIVE',
            asaasSubscriptionId: 'asaas-A',
            currentPeriodEnd: PERIOD_END,
          }),
          row({
            id: 'local-B',
            status: 'ACTIVE',
            asaasSubscriptionId: 'asaas-B',
            currentPeriodEnd: PERIOD_END,
          }),
        ],
      });
      asaas.getSubscription.mockResolvedValue({
        id: 'asaas-B',
        deleted: true,
        nextDueDate: FUTURE_DUE,
        externalReference: 'local-A',
      });

      await service.processWebhookEvent(TOKEN, {
        id: 'evt_sd',
        event: 'SUBSCRIPTION_DELETED',
        subscription: { id: 'asaas-B', externalReference: 'local-A' },
      });

      expect(asaas.getSubscription).toHaveBeenCalledWith('asaas-B');
      expect(rows.find((r) => r.id === 'local-A')?.status).toBe('ACTIVE');
      expect(rows.find((r) => r.id === 'local-B')?.status).toBe('CANCELED');
    });

    it.each([
      ['sem subscription.id', { id: 'evt_s1', event: 'SUBSCRIPTION_DELETED' }],
      [
        'sem linha local',
        {
          id: 'evt_s2',
          event: 'SUBSCRIPTION_INACTIVATED',
          subscription: { id: 'asaas-nao-existe' },
        },
      ],
    ])(
      '%s: ok, evento processado e Asaas não consultado',
      async (_l, payload) => {
        const { service, asaas, events } = setup({
          rows: [row({ status: 'ACTIVE', asaasSubscriptionId: 'asaas-sub-1' })],
        });

        await expect(
          service.processWebhookEvent(TOKEN, payload),
        ).resolves.toEqual({ ok: true });
        expect(asaas.getSubscription).not.toHaveBeenCalled();
        expect(events[0].processedAt).toBeInstanceOf(Date);
      },
    );
  });

  describe('reconcile: bordas de período e superseded em PAST_DUE', () => {
    it('período termina exatamente agora e nextDueDate igual: vence (PAST_DUE), não é "futuro"', async () => {
      const { service, rows, asaas } = setup({
        rows: [
          row({
            status: 'ACTIVE',
            asaasSubscriptionId: 'asaas-sub-1',
            currentPeriodEnd: new Date(NOW),
          }),
        ],
      });
      asaas.getSubscription.mockResolvedValue({
        id: 'asaas-sub-1',
        deleted: false,
        nextDueDate: NOW.toISOString(),
        externalReference: null,
      });

      await service.processWebhookEvent(
        TOKEN,
        paymentEvent('PAYMENT_CONFIRMED'),
      );

      expect(rows[0].status).toBe('PAST_DUE');
    });

    it('PAST_DUE com período futuro e nextDueDate igual NÃO cancela assinaturas menores (só ACTIVE dispara)', async () => {
      const future = new Date(NOW.getTime() + 10 * DAY);
      const { service, rows, asaas } = setup({
        rows: [
          row({
            id: 'new-fleet',
            plan: 'FLEET',
            status: 'PAST_DUE',
            asaasSubscriptionId: 'asaas-sub-1',
            currentPeriodEnd: future,
            pastDueSince: new Date('2026-11-05T00:00:00.000Z'),
          }),
          row({
            id: 'old-prof',
            plan: 'PROFESSIONAL',
            status: 'ACTIVE',
            asaasSubscriptionId: 'asaas-old',
            currentPeriodEnd: future,
          }),
        ],
      });
      asaas.getSubscription.mockResolvedValue({
        id: 'asaas-sub-1',
        deleted: false,
        nextDueDate: future.toISOString().slice(0, 10),
        externalReference: null,
      });

      await service.processWebhookEvent(TOKEN, paymentEvent('PAYMENT_OVERDUE'));

      expect(asaas.deleteSubscription).not.toHaveBeenCalled();
      expect(rows.find((r) => r.id === 'old-prof')?.status).toBe('ACTIVE');
      expect(rows.find((r) => r.id === 'new-fleet')?.status).toBe('PAST_DUE');
    });
  });
});

describe('BillingPaymentsService#cancelSupersededSubscriptions (via reconcile, opcao A)', () => {
  const PERIOD_FUTURE = new Date(NOW.getTime() + 10 * DAY);
  const DUE = new Date(NOW.getTime() + 20 * DAY).toISOString().slice(0, 10);

  function newActive(
    rows: Row[],
    id = 'new-fleet',
    plan: 'FLEET' | 'PROFESSIONAL' = 'FLEET',
  ) {
    const h = build({
      rows: [
        ...rows,
        row({
          id,
          plan,
          status: 'PENDING',
          asaasSubscriptionId: `asaas-${id}`,
          createdAt: new Date(NOW.getTime() - 1000),
        }),
      ],
    });
    const local = h.rows.find((r) => r.id === id)!;
    h.asaas.getSubscription.mockResolvedValue({
      id: `asaas-${id}`,
      deleted: false,
      nextDueDate: DUE,
      externalReference: null,
    });
    return { ...h, local: { ...local } };
  }

  const old = (overrides: Partial<Row> = {}) =>
    row({
      id: 'old-prof',
      plan: 'PROFESSIONAL',
      status: 'ACTIVE',
      asaasSubscriptionId: 'asaas-old-prof',
      currentPeriodEnd: PERIOD_FUTURE,
      createdAt: new Date(NOW.getTime() - 20 * DAY),
      ...overrides,
    });

  it('upgrade PROFESSIONAL ACTIVE -> FLEET ACTIVE: cancela a antiga, deleta no Asaas ANTES de gravar', async () => {
    const { service, asaas, prisma, rows, local } = newActive([old()]);

    await service.reconcileSubscription(local as any);

    expect(asaas.deleteSubscription).toHaveBeenCalledWith('asaas-old-prof');
    const deleteOrder = asaas.deleteSubscription.mock.invocationCallOrder[0];
    const oldUpdateIdx = prisma.subscription.update.mock.calls.findIndex(
      (c: any[]) => c[0].where.id === 'old-prof',
    );
    expect(oldUpdateIdx).toBeGreaterThanOrEqual(0);
    expect(deleteOrder).toBeLessThan(
      prisma.subscription.update.mock.invocationCallOrder[oldUpdateIdx],
    );
    expect(rows.find((r) => r.id === 'old-prof')).toMatchObject({
      status: 'CANCELED',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: PERIOD_FUTURE,
    });
    expect(rows.find((r) => r.id === 'new-fleet')?.status).toBe('ACTIVE');
  });

  it('PAST_DUE antiga de plano menor tambem e cancelada', async () => {
    const { service, asaas, rows, local } = newActive([
      old({ status: 'PAST_DUE' }),
    ]);

    await service.reconcileSubscription(local as any);

    expect(asaas.deleteSubscription).toHaveBeenCalledWith('asaas-old-prof');
    expect(rows.find((r) => r.id === 'old-prof')?.status).toBe('CANCELED');
  });

  it('FLEET ativa + PROFESSIONAL nova ativa (downgrade/convivencia): NAO cancela a FLEET', async () => {
    const { service, asaas, rows, local } = newActive(
      [
        old({
          id: 'fleet-old',
          plan: 'FLEET',
          asaasSubscriptionId: 'asaas-fleet-old',
        }),
      ],
      'new-prof',
      'PROFESSIONAL',
    );

    await service.reconcileSubscription(local as any);

    expect(asaas.deleteSubscription).not.toHaveBeenCalled();
    expect(rows.find((r) => r.id === 'fleet-old')?.status).toBe('ACTIVE');
  });

  it('mesmo plano nao e cancelado', async () => {
    const { service, asaas, rows, local } = newActive(
      [
        old({
          id: 'same-old',
          plan: 'FLEET',
          asaasSubscriptionId: 'asaas-same-old',
        }),
      ],
      'new-fleet',
      'FLEET',
    );

    await service.reconcileSubscription(local as any);

    expect(asaas.deleteSubscription).not.toHaveBeenCalled();
    expect(rows.find((r) => r.id === 'same-old')?.status).toBe('ACTIVE');
  });

  it('GRANT de plano menor nunca e tocada', async () => {
    const { service, asaas, rows, local } = newActive([
      old({
        id: 'grant-prof',
        source: 'GRANT',
        asaasSubscriptionId: null,
        currentPeriodEnd: null,
      }),
    ]);

    await service.reconcileSubscription(local as any);

    expect(asaas.deleteSubscription).not.toHaveBeenCalled();
    expect(rows.find((r) => r.id === 'grant-prof')?.status).toBe('ACTIVE');
  });

  it('assinatura de outro usuario nao e tocada', async () => {
    const { service, asaas, rows, local } = newActive([
      old({ id: 'other', ownerUserId: 'user-2' }),
    ]);

    await service.reconcileSubscription(local as any);

    expect(asaas.deleteSubscription).not.toHaveBeenCalled();
    expect(rows.find((r) => r.id === 'other')?.status).toBe('ACTIVE');
  });

  it.each(['PENDING', 'CANCELED', 'EXPIRED'])(
    'linha %s de plano menor nao e tocada',
    async (status) => {
      const { service, asaas, rows, local } = newActive([
        old({ id: 'other-status', status: status as any }),
      ]);

      await service.reconcileSubscription(local as any);

      expect(asaas.deleteSubscription).not.toHaveBeenCalled();
      expect(rows.find((r) => r.id === 'other-status')?.status).toBe(status);
    },
  );

  it('falha no delete no Asaas propaga e nao grava a antiga', async () => {
    const { service, asaas, rows, local } = newActive([old()]);
    asaas.deleteSubscription.mockRejectedValueOnce(new Error('Asaas 503'));

    await expect(service.reconcileSubscription(local as any)).rejects.toThrow(
      'Asaas 503',
    );
    expect(rows.find((r) => r.id === 'old-prof')?.status).toBe('ACTIVE');
  });

  it('retry: a reexecucao (ramo em dia, ACTIVE) cancela o que faltou', async () => {
    const { service, asaas, rows, local } = newActive([old()]);
    asaas.deleteSubscription.mockRejectedValueOnce(new Error('Asaas 503'));

    await expect(service.reconcileSubscription(local as any)).rejects.toThrow();
    expect(rows.find((r) => r.id === 'old-prof')?.status).toBe('ACTIVE');

    // Segundo webhook: a nova ja esta ACTIVE e em dia (ramo B2).
    const newRow = rows.find((r) => r.id === 'new-fleet')!;
    asaas.deleteSubscription.mockClear();
    await service.reconcileSubscription(newRow as any);

    expect(asaas.deleteSubscription).toHaveBeenCalledWith('asaas-old-prof');
    expect(rows.find((r) => r.id === 'old-prof')?.status).toBe('CANCELED');
  });

  it('resultado CANCELED (deleted) nao dispara cancelamento de outras', async () => {
    const { service, asaas, rows, local } = newActive([old()]);
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-new-fleet',
      deleted: true,
      nextDueDate: DUE,
      externalReference: null,
    });

    await service.reconcileSubscription(local as any);

    expect(asaas.deleteSubscription).not.toHaveBeenCalled();
    expect(rows.find((r) => r.id === 'old-prof')?.status).toBe('ACTIVE');
  });

  it('resultado PAST_DUE nao dispara cancelamento de outras', async () => {
    const { service, asaas, rows, local } = newActive([old()]);
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-new-fleet',
      deleted: false,
      nextDueDate: '2026-11-01',
      externalReference: null,
    });

    // Periodo ja vencido: nao e "avancou" nem "em dia", vira PAST_DUE.
    await service.reconcileSubscription({
      ...local,
      currentPeriodEnd: new Date('2026-11-01T00:00:00.000Z'),
    } as any);

    expect(rows.find((r) => r.id === 'new-fleet')?.status).toBe('PAST_DUE');
    expect(asaas.deleteSubscription).not.toHaveBeenCalled();
    expect(rows.find((r) => r.id === 'old-prof')?.status).toBe('ACTIVE');
  });

  it('Asaas responde 404 ao deletar a antiga (já removida): trata como sucesso e grava CANCELED', async () => {
    const { service, asaas, rows, local } = newActive([old()]);
    asaas.deleteSubscription.mockRejectedValueOnce(
      new AsaasClientError('Asaas respondeu 404', 404),
    );

    await service.reconcileSubscription(local as any);

    expect(asaas.deleteSubscription).toHaveBeenCalledWith('asaas-old-prof');
    expect(rows.find((r) => r.id === 'old-prof')).toMatchObject({
      status: 'CANCELED',
      cancelAtPeriodEnd: true,
    });
    expect(rows.find((r) => r.id === 'new-fleet')?.status).toBe('ACTIVE');
  });

  it.each([
    ['AsaasClientError 500', new AsaasClientError('Asaas respondeu 500', 500)],
    ['AsaasClientError 403', new AsaasClientError('Asaas respondeu 403', 403)],
    ['AsaasClientError sem status (rede)', new AsaasClientError('rede')],
    [
      'Error comum com statusCode 404',
      Object.assign(new Error('x'), { statusCode: 404 }),
    ],
  ])('delete com %s propaga e não grava a antiga', async (_l, error) => {
    const { service, asaas, rows, local } = newActive([old()]);
    asaas.deleteSubscription.mockRejectedValueOnce(error);

    await expect(service.reconcileSubscription(local as any)).rejects.toBe(
      error,
    );
    expect(rows.find((r) => r.id === 'old-prof')?.status).toBe('ACTIVE');
  });
});
