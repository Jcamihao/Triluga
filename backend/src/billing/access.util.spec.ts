import {
  GRACE_DAYS,
  SubscriptionLike,
  pickEffectivePlan,
  subscriptionGrantsAccess,
} from './access.util';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-27T12:00:00.000Z');
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);
const sub = (
  status: SubscriptionLike['status'],
  currentPeriodEnd: Date | null,
  plan: SubscriptionLike['plan'] = 'PROFESSIONAL',
  source: SubscriptionLike['source'] = 'ASAAS',
): SubscriptionLike => ({ plan, status, currentPeriodEnd, source });
const grant = (
  status: SubscriptionLike['status'],
  currentPeriodEnd: Date | null,
  plan: SubscriptionLike['plan'] = 'FLEET',
) => sub(status, currentPeriodEnd, plan, 'GRANT');

describe('subscriptionGrantsAccess', () => {
  it('GRACE_DAYS e 7', () => {
    expect(GRACE_DAYS).toBe(7);
  });

  it.each(['ACTIVE', 'PAST_DUE'] as const)(
    '%s com fim futuro tem acesso',
    (status) => {
      expect(subscriptionGrantsAccess(sub(status, at(DAY)), now)).toBe(true);
      expect(subscriptionGrantsAccess(sub(status, now), now)).toBe(true);
    },
  );

  it.each(['ACTIVE', 'PAST_DUE'] as const)(
    '%s pago: 7 dias apos o fim ainda tem acesso, 7d + 1ms nao',
    (status) => {
      expect(subscriptionGrantsAccess(sub(status, at(-7 * DAY)), now)).toBe(
        true,
      );
      expect(subscriptionGrantsAccess(sub(status, at(-7 * DAY - 1)), now)).toBe(
        false,
      );
      expect(subscriptionGrantsAccess(sub(status, at(-30 * DAY)), now)).toBe(
        false,
      );
    },
  );

  it('assinatura paga (ASAAS) vencida ha 6 dias ainda tem acesso (tolerancia)', () => {
    expect(subscriptionGrantsAccess(sub('ACTIVE', at(-6 * DAY)), now)).toBe(
      true,
    );
  });

  it('assinatura paga (ASAAS) vencida ha 8 dias nao tem acesso', () => {
    expect(subscriptionGrantsAccess(sub('ACTIVE', at(-8 * DAY)), now)).toBe(
      false,
    );
  });

  it('ACTIVE/PAST_DUE com fim null sempre tem acesso', () => {
    expect(subscriptionGrantsAccess(grant('ACTIVE', null), now)).toBe(true);
    expect(subscriptionGrantsAccess(grant('PAST_DUE', null), now)).toBe(true);
    expect(subscriptionGrantsAccess(sub('ACTIVE', null), now)).toBe(true);
  });

  describe('concessao (GRANT) nao tem tolerancia de atraso', () => {
    it('vencida ha 1 dia nao da acesso', () => {
      expect(subscriptionGrantsAccess(grant('ACTIVE', at(-DAY)), now)).toBe(
        false,
      );
    });

    it('fim exatamente agora da acesso; 1ms antes nao', () => {
      expect(subscriptionGrantsAccess(grant('ACTIVE', now), now)).toBe(true);
      expect(subscriptionGrantsAccess(grant('ACTIVE', at(-1)), now)).toBe(
        false,
      );
    });

    it('fim no futuro da acesso', () => {
      expect(subscriptionGrantsAccess(grant('ACTIVE', at(DAY)), now)).toBe(
        true,
      );
    });
  });

  it('CANCELED ate o fim tem acesso, fim + 1ms nao', () => {
    expect(subscriptionGrantsAccess(sub('CANCELED', now), now)).toBe(true);
    expect(subscriptionGrantsAccess(sub('CANCELED', at(DAY)), now)).toBe(true);
    expect(subscriptionGrantsAccess(sub('CANCELED', at(-1)), now)).toBe(false);
  });

  it('CANCELED sem fim nao da acesso', () => {
    expect(subscriptionGrantsAccess(sub('CANCELED', null), now)).toBe(false);
  });

  it.each(['PENDING', 'EXPIRED'] as const)('%s nunca da acesso', (status) => {
    expect(subscriptionGrantsAccess(sub(status, at(30 * DAY)), now)).toBe(
      false,
    );
    expect(subscriptionGrantsAccess(sub(status, null), now)).toBe(false);
  });
});

describe('pickEffectivePlan', () => {
  it('sem assinaturas e FREE', () => {
    expect(pickEffectivePlan([], now)).toBe('FREE');
  });

  it('vence o maior plano com acesso', () => {
    const subs = [
      sub('ACTIVE', at(DAY), 'PROFESSIONAL'),
      sub('ACTIVE', at(DAY), 'FLEET'),
    ];
    expect(pickEffectivePlan(subs, now)).toBe('FLEET');
    expect(pickEffectivePlan([...subs].reverse(), now)).toBe('FLEET');
  });

  it('assinatura sem acesso e ignorada', () => {
    expect(pickEffectivePlan([sub('EXPIRED', at(DAY))], now)).toBe('FREE');
    expect(
      pickEffectivePlan(
        [
          sub('ACTIVE', at(DAY), 'PROFESSIONAL'),
          sub('EXPIRED', at(DAY), 'FLEET'),
        ],
        now,
      ),
    ).toBe('PROFESSIONAL');
  });

  it('concessao (fim null) da acesso; concessao vencida ha mais de 7d nao', () => {
    expect(pickEffectivePlan([grant('ACTIVE', null, 'FLEET')], now)).toBe(
      'FLEET',
    );
    expect(
      pickEffectivePlan([grant('ACTIVE', at(-8 * DAY), 'FLEET')], now),
    ).toBe('FREE');
  });

  it('concessao vencida e ignorada; paga ativa prevalece', () => {
    expect(
      pickEffectivePlan(
        [
          sub('ACTIVE', at(DAY), 'PROFESSIONAL'),
          grant('ACTIVE', at(-2 * DAY), 'FLEET'),
        ],
        now,
      ),
    ).toBe('PROFESSIONAL');
  });

  it('concessao valida maior que a paga vence', () => {
    expect(
      pickEffectivePlan(
        [
          grant('ACTIVE', at(DAY), 'FLEET'),
          sub('ACTIVE', at(DAY), 'PROFESSIONAL'),
        ],
        now,
      ),
    ).toBe('FLEET');
  });
});
