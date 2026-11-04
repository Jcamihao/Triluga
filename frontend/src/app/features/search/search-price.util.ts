import { dailyFromLegacyWeekly } from '../../shared/utils/rental-pricing.util';

// Faixa do filtro de preço, em R$ por dia. O topo ("R$ 300+") significa sem teto.
export const PRICE_RANGE_MAX = 300;
export const PRICE_RANGE_STEP = 10;

export type DailyRateRange = { minDailyRate: string; maxDailyRate: string };

type ParamReader = { get(name: string): string | null };

function filled(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim() !== '';
}

// Número do filtro, ou o padrão quando vazio/inválido. Zero é um valor válido.
export function rateOr(value: string | null | undefined, fallback: number): number {
  if (!filled(value)) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Valor de preço aceito pelo backend: finito, >= 0 e no máximo 2 casas decimais.
function validRate(value: string | null): string {
  if (!filled(value)) return '';
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '';
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return '';
  return String(n);
}

// URLs antigas (favoritos, e-mails e push de alertas) trazem minPrice/maxPrice
// com valor SEMANAL. Convertemos para diária com 2 casas (como o backend).
function legacyWeeklyToDaily(value: string | null): string {
  if (!filled(value)) return '';
  const weekly = Number(value);
  if (!Number.isFinite(weekly) || weekly < 0) return '';
  return validRate(String(dailyFromLegacyWeekly(weekly)));
}

// Os parâmetros novos vencem os legados quando os dois pares vêm na URL.
export function readDailyRateParams(params: ParamReader): DailyRateRange {
  const minNew = params.get('minDailyRate');
  const maxNew = params.get('maxDailyRate');
  return {
    minDailyRate: filled(minNew)
      ? validRate(minNew)
      : legacyWeeklyToDaily(params.get('minPrice')),
    maxDailyRate: filled(maxNew)
      ? validRate(maxNew)
      : legacyWeeklyToDaily(params.get('maxPrice')),
  };
}

// Aplica o movimento de um dos dois controles. Mínimo 0 e máximo no topo
// ficam como '' (sem limite): nunca serializamos "300" como teto nem '0' como piso novo.
export function applyPriceChange(
  current: DailyRateRange,
  changed: 'min' | 'max',
  rawValue: string,
): DailyRateRange {
  const value = Math.max(0, Math.min(PRICE_RANGE_MAX, Number(rawValue) || 0));
  const currentMin = Number(current.minDailyRate || 0);
  const currentMax = Number(current.maxDailyRate || PRICE_RANGE_MAX);

  if (changed === 'min') {
    const next = Math.min(value, currentMax);
    return { ...current, minDailyRate: next > 0 ? String(next) : '' };
  }

  const next = Math.max(value, currentMin);
  return {
    ...current,
    maxDailyRate: next < PRICE_RANGE_MAX ? String(next) : '',
  };
}

export function priceTrackLeft(range: DailyRateRange): number {
  return (Number(range.minDailyRate || 0) / PRICE_RANGE_MAX) * 100;
}

export function priceTrackWidth(range: DailyRateRange): number {
  const min = Number(range.minDailyRate || 0);
  const max = Number(range.maxDailyRate || PRICE_RANGE_MAX);
  return ((max - min) / PRICE_RANGE_MAX) * 100;
}

// Corpo `filters` do alerta salvo: só chaves preenchidas, e só as novas de preço.
export function buildAlertFilters(query: {
  q: string;
  city: string;
  vehicleType: string;
  category: string;
  minDailyRate: string;
  maxDailyRate: string;
  transmission: string;
  fuelType: string;
  minYear: string;
  maxYear: string;
  latitude: string;
  longitude: string;
  radiusKm: string;
}): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  const keys = [
    'q',
    'city',
    'vehicleType',
    'category',
    'minDailyRate',
    'maxDailyRate',
    'transmission',
    'fuelType',
    'minYear',
    'maxYear',
    'latitude',
    'longitude',
    'radiusKm',
  ] as const;
  for (const key of keys) {
    if (query[key]) filters[key] = query[key];
  }
  return filters;
}

// Traduz a posição dos controles do modal para o filtro: piso 0 e teto no topo
// ("R$ 300+") viram '' (sem limite), nunca '0' nem '300'.
export function toPriceFilters<T extends DailyRateRange>(draft: T): T {
  const min = rateOr(draft.minDailyRate, 0);
  const max = rateOr(draft.maxDailyRate, PRICE_RANGE_MAX);
  return {
    ...draft,
    minDailyRate: min > 0 ? String(min) : '',
    maxDailyRate: max < PRICE_RANGE_MAX ? String(max) : '',
  };
}
