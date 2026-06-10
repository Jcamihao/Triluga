export const FEATURED_PLANS = [
  { id: '7d', name: '7 dias', durationDays: 7, price: 29.9 },
  { id: '15d', name: '15 dias', durationDays: 15, price: 49.9 },
  { id: '30d', name: '30 dias', durationDays: 30, price: 89.9 },
] as const;

export type FeaturedPlanId = (typeof FEATURED_PLANS)[number]['id'];
