import { PLAN_RANK, PlanId } from './plans.catalog';

export const GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionLike {
  plan: 'PROFESSIONAL' | 'FLEET';
  status: 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
  currentPeriodEnd: Date | null;
  source: 'ASAAS' | 'GRANT';
}

export function subscriptionGrantsAccess(
  sub: SubscriptionLike,
  now: Date,
): boolean {
  const end = sub.currentPeriodEnd?.getTime() ?? null;
  const t = now.getTime();
  switch (sub.status) {
    case 'ACTIVE':
    case 'PAST_DUE': {
      // Tolerância de atraso só vale para pagamento (Asaas); concessão acaba no fim.
      const graceMs = sub.source === 'GRANT' ? 0 : GRACE_DAYS * DAY_MS;
      return end === null || t <= end + graceMs;
    }
    case 'CANCELED':
      return end !== null && t <= end;
    default:
      return false;
  }
}

export function pickEffectivePlan(subs: SubscriptionLike[], now: Date): PlanId {
  let best: PlanId = 'FREE';
  for (const sub of subs) {
    if (
      subscriptionGrantsAccess(sub, now) &&
      PLAN_RANK[sub.plan] > PLAN_RANK[best]
    ) {
      best = sub.plan;
    }
  }
  return best;
}
