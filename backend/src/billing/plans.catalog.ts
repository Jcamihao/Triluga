export type PlanId = 'FREE' | 'PROFESSIONAL' | 'FLEET';
export type BillingIntervalId = 'MONTHLY' | 'YEARLY';

export interface PlanDefinition {
  id: PlanId;
  label: string;
  /** Anúncios contados (ativos e publicados) permitidos; null = ilimitado. */
  adLimit: number | null;
  sellable: boolean;
  prices: Record<BillingIntervalId, number> | null;
}

export const PLAN_RANK: Record<PlanId, number> = {
  FREE: 0,
  PROFESSIONAL: 1,
  FLEET: 2,
};

/** Preço vindo da env `BILLING_PRICE_<PLANO>_<MONTHLY|YEARLY>`; inválido (não numérico ou <= 0) é ignorado. */
function price(
  env: NodeJS.ProcessEnv,
  plan: 'PROFESSIONAL' | 'FLEET',
  interval: BillingIntervalId,
  fallback: number,
): number {
  const raw = env[`BILLING_PRICE_${plan}_${interval}`];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getCatalog(
  env: NodeJS.ProcessEnv = process.env,
): Record<PlanId, PlanDefinition> {
  return {
    FREE: {
      id: 'FREE',
      label: 'Grátis',
      adLimit: 3,
      sellable: false,
      prices: null,
    },
    PROFESSIONAL: {
      id: 'PROFESSIONAL',
      label: 'Profissional',
      adLimit: 10,
      sellable: true,
      prices: {
        MONTHLY: price(env, 'PROFESSIONAL', 'MONTHLY', 29.9),
        YEARLY: price(env, 'PROFESSIONAL', 'YEARLY', 299),
      },
    },
    FLEET: {
      id: 'FLEET',
      label: 'Frota',
      adLimit: null,
      sellable: true,
      prices: {
        MONTHLY: price(env, 'FLEET', 'MONTHLY', 79.9),
        YEARLY: price(env, 'FLEET', 'YEARLY', 799),
      },
    },
  };
}

export function getPlan(
  id: PlanId,
  env: NodeJS.ProcessEnv = process.env,
): PlanDefinition {
  return getCatalog(env)[id];
}
