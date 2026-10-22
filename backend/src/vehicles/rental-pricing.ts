/**
 * Núcleo de preço por diária. Funções puras, sem Nest/Prisma.
 *
 * Validação (NaN, negativo, minRentalDays fora da lista) é responsabilidade
 * do chamador (DTOs); aqui nada lança exceção.
 */

/** Opções aceitas de tempo mínimo de aluguel, em dias. */
export const MIN_RENTAL_DAYS_OPTIONS = [3, 7, 14, 30, 90] as const;

export const DAYS_PER_WEEK = 7;
export const DAYS_PER_MONTH = 30;

/** Arredonda a 2 casas. Dividir o inteiro por 100 devolve o double mais próximo (sem 699.0200000000001). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function weeklyEstimate(dailyRate: number): number {
  return round2(dailyRate * DAYS_PER_WEEK);
}

export function monthlyEstimate(dailyRate: number): number {
  return round2(dailyRate * DAYS_PER_MONTH);
}

/** Total do período mínimo; `null` quando não há tempo mínimo. */
export function minPeriodTotal(
  dailyRate: number,
  minRentalDays: number | null | undefined,
): number | null {
  if (minRentalDays === null || minRentalDays === undefined) {
    return null;
  }
  return round2(dailyRate * minRentalDays);
}

/** Cliente legado enviava valor semanal: diária = semanal ÷ 7. */
export function dailyFromLegacyWeekly(weekly: number): number {
  return round2(weekly / DAYS_PER_WEEK);
}

/**
 * Diária a gravar numa criação/edição. `weeklyRate` presente (cliente legado)
 * vale ÷ 7 e ignora `dailyRate`; senão `dailyRate`; senão `undefined`.
 */
export function resolveWriteDailyRate(input: {
  dailyRate?: number | null;
  weeklyRate?: number | null;
}): number | undefined {
  if (input.weeklyRate !== null && input.weeklyRate !== undefined) {
    return dailyFromLegacyWeekly(input.weeklyRate);
  }
  if (input.dailyRate !== null && input.dailyRate !== undefined) {
    return input.dailyRate;
  }
  return undefined;
}

/**
 * Limites de diária da busca. Parâmetros novos vencem os legados (`minPrice`/
 * `maxPrice`, semanais) por lado; zero é valor válido.
 */
export function resolveDailyRateBounds(q: {
  minDailyRate?: number;
  maxDailyRate?: number;
  minPrice?: number;
  maxPrice?: number;
}): { min?: number; max?: number } {
  const bounds: { min?: number; max?: number } = {};

  if (q.minDailyRate !== undefined) {
    bounds.min = q.minDailyRate;
  } else if (q.minPrice !== undefined) {
    bounds.min = dailyFromLegacyWeekly(q.minPrice);
  }

  if (q.maxDailyRate !== undefined) {
    bounds.max = q.maxDailyRate;
  } else if (q.maxPrice !== undefined) {
    bounds.max = dailyFromLegacyWeekly(q.maxPrice);
  }

  return bounds;
}

export interface VehiclePricing {
  dailyRate: number;
  /** Compatibilidade por uma versão: igual a `weeklyEstimate`, nunca null. */
  weeklyRate: number;
  weeklyEstimate: number;
  monthlyEstimate: number;
  minRentalDays: number | null;
  minPeriodTotal: number | null;
}

/**
 * Campos de preço de uma resposta de anúncio. `dailyRate` pode vir como number,
 * string numérica ou Decimal-like (Prisma.Decimal): `Number()` cobre os três.
 */
export function buildPricing(vehicle: {
  dailyRate: unknown;
  minRentalDays?: number | null;
}): VehiclePricing {
  const dailyRate = Number(vehicle.dailyRate);
  const minRentalDays = vehicle.minRentalDays ?? null;
  const weekly = weeklyEstimate(dailyRate);

  return {
    dailyRate,
    weeklyRate: weekly,
    weeklyEstimate: weekly,
    monthlyEstimate: monthlyEstimate(dailyRate),
    minRentalDays,
    minPeriodTotal: minPeriodTotal(dailyRate, minRentalDays),
  };
}
