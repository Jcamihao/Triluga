// Espelha backend/src/vehicles/rental-pricing.ts: mesmas regras e arredondamento.
export const DAYS_PER_WEEK = 7;
export const DAYS_PER_MONTH = 30;

export const MIN_RENTAL_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Sem tempo mínimo' },
  { value: 3, label: '3 dias' },
  { value: 7, label: '1 semana' },
  { value: 14, label: '2 semanas' },
  { value: 30, label: '1 mês' },
  { value: 90, label: '3 meses' },
];

export const RENTAL_DISCLAIMER =
  'Valores estimados a partir da diária. O pagamento e as condições são combinados e feitos diretamente entre você e o anunciante; o Triluga não participa nem intermedeia.';

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function weeklyEstimate(daily: number): number {
  return round2(daily * DAYS_PER_WEEK);
}

export function monthlyEstimate(daily: number): number {
  return round2(daily * DAYS_PER_MONTH);
}

export function minPeriodTotal(
  daily: number,
  days: number | null | undefined,
): number | null {
  return days ? round2(daily * days) : null;
}

export function minRentalLabel(days: number | null | undefined): string {
  return (
    MIN_RENTAL_OPTIONS.find((option) => option.value === (days ?? null))?.label ??
    `${days} dias`
  );
}

export function dailyFromLegacyWeekly(weekly: number): number {
  return round2(weekly / DAYS_PER_WEEK);
}
