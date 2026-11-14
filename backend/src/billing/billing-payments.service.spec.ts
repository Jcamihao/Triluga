import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AsaasClient } from '../asaas/asaas.client';
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
function fakePrisma(initial: Row[] = []) {
  const rows: Row[] = initial.map((r) => ({ ...r }));
  let seq = 0;
  const copy = (r: Row) => ({ ...r });

  return {
    rows,
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
    deleteSubscription: jest.fn(),
  };
}

function build(opts: { enabled?: boolean; rows?: Row[] } = {}) {
  const prisma = fakePrisma(opts.rows ?? []);
  const asaas = fakeAsaas();
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'billing.enabled') return opts.enabled ?? true;
      if (key === 'FRONTEND_URL') return FRONT;
      return undefined;
    }),
  };
  const service = new BillingPaymentsService(
    prisma as any,
    asaas as unknown as AsaasClient,
    config as unknown as ConfigService,
  );
  return { service, prisma, asaas, rows: prisma.rows };
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
  const SUB_END = new Date('2026-12-01T00:00:00.000Z');

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

  it('nextDueDate igual a currentPeriodEnd (borda) vira PAST_DUE', async () => {
    const { service, asaas, prisma, local } = setup();
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-sub-1',
      deleted: false,
      nextDueDate: '2026-12-01',
      externalReference: null,
    });

    await service.reconcileSubscription(local as any);

    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { status: 'PAST_DUE', pastDueSince: new Date(NOW) },
    });
  });

  it('nextDueDate menor que currentPeriodEnd vira PAST_DUE', async () => {
    const { service, asaas, prisma, local } = setup();
    asaas.getSubscription.mockResolvedValue({
      id: 'asaas-sub-1',
      deleted: false,
      nextDueDate: '2026-11-20',
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
      nextDueDate: '2026-11-20',
      externalReference: null,
    });

    await service.reconcileSubscription(local as any);

    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { status: 'PAST_DUE', pastDueSince: original },
    });
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
