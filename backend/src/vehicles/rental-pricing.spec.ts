import { Prisma } from '@prisma/client';
import {
  buildPricing,
  DAYS_PER_MONTH,
  DAYS_PER_WEEK,
  dailyFromLegacyWeekly,
  MIN_RENTAL_DAYS_OPTIONS,
  minPeriodTotal,
  monthlyEstimate,
  resolveDailyRateBounds,
  resolveWriteDailyRate,
  round2,
  weeklyEstimate,
} from './rental-pricing';

describe('rental-pricing', () => {
  describe('constantes', () => {
    it('expõe as opções de tempo mínimo e os fatores de período', () => {
      expect(MIN_RENTAL_DAYS_OPTIONS).toEqual([3, 7, 14, 30, 90]);
      expect(DAYS_PER_WEEK).toBe(7);
      expect(DAYS_PER_MONTH).toBe(30);
    });
  });

  describe('round2', () => {
    it('arredonda a 2 casas sem resíduo de ponto flutuante', () => {
      expect(round2(699.0200000000001)).toBe(699.02);
      expect(round2(0.1 + 0.2)).toBe(0.3);
      expect(round2(100 / 7)).toBe(14.29);
      expect(round2(99.86 * 7)).toBe(699.02);
      expect(round2(22.84 * 30)).toBe(685.2);
      expect(round2(0)).toBe(0);
    });
  });

  describe('round2 contra o decimal exato', () => {
    it('a multiplicação crua tem erro de ponto flutuante e round2 o remove', () => {
      expect(0.05 * 3).not.toBe(0.15);
      expect(minPeriodTotal(0.05, 3)).toBe(0.15);
      expect(0.03 * 30).not.toBe(0.9);
      expect(monthlyEstimate(0.03)).toBe(0.9);
    });

    it('varre diárias de R$ 0,01 a R$ 1.000,00: nunca difere do decimal exato', () => {
      const factors = [
        DAYS_PER_WEEK,
        DAYS_PER_MONTH,
        ...MIN_RENTAL_DAYS_OPTIONS,
      ];
      for (let cents = 1; cents <= 100000; cents++) {
        const daily = cents / 100;
        for (const factor of factors) {
          const exact = (cents * factor) / 100;
          if (round2(daily * factor) !== exact) {
            throw new Error(`diária ${daily} x ${factor}: esperado ${exact}`);
          }
        }
      }
    });
  });

  describe('weeklyEstimate e monthlyEstimate', () => {
    it('calcula semana (x7) e mês (x30) a partir da diária', () => {
      expect(weeklyEstimate(100)).toBe(700);
      expect(monthlyEstimate(100)).toBe(3000);
    });

    it('arredonda a 2 casas sem erro de ponto flutuante', () => {
      expect(weeklyEstimate(99.86)).toBe(699.02);
      expect(monthlyEstimate(22.84)).toBe(685.2);
    });
  });

  describe('dailyFromLegacyWeekly', () => {
    it('converte o valor semanal legado em diária (÷ 7, 2 casas)', () => {
      expect(dailyFromLegacyWeekly(700)).toBe(100);
      expect(dailyFromLegacyWeekly(699)).toBe(99.86);
      expect(dailyFromLegacyWeekly(1)).toBe(0.14);
    });
  });

  describe('minPeriodTotal', () => {
    it('multiplica a diária pelos dias mínimos', () => {
      expect(minPeriodTotal(100, 30)).toBe(3000);
      expect(minPeriodTotal(99.86, 3)).toBe(299.58);
    });

    it('devolve null sem tempo mínimo', () => {
      expect(minPeriodTotal(100, null)).toBeNull();
      expect(minPeriodTotal(100, undefined)).toBeNull();
    });
  });

  describe('resolveWriteDailyRate (cliente legado)', () => {
    it('weeklyRate presente vale ÷ 7', () => {
      expect(resolveWriteDailyRate({ weeklyRate: 700 })).toBe(100);
    });

    it('weeklyRate presente ignora o dailyRate enviado junto', () => {
      expect(resolveWriteDailyRate({ weeklyRate: 700, dailyRate: 700 })).toBe(
        100,
      );
    });

    it('sem weeklyRate usa o dailyRate', () => {
      expect(resolveWriteDailyRate({ dailyRate: 120 })).toBe(120);
    });

    it('sem nenhum dos dois devolve undefined', () => {
      expect(resolveWriteDailyRate({})).toBeUndefined();
      expect(
        resolveWriteDailyRate({ weeklyRate: null, dailyRate: null }),
      ).toBeUndefined();
    });

    it('weeklyRate null cai no dailyRate', () => {
      expect(resolveWriteDailyRate({ weeklyRate: null, dailyRate: 120 })).toBe(
        120,
      );
    });

    it('weeklyRate 0 conta como presente (zero é valor, não ausência)', () => {
      expect(resolveWriteDailyRate({ weeklyRate: 0, dailyRate: 120 })).toBe(0);
    });
  });

  describe('resolveDailyRateBounds (busca)', () => {
    it('converte os limites legados semanais em diários', () => {
      expect(resolveDailyRateBounds({ minPrice: 700, maxPrice: 1400 })).toEqual(
        {
          min: 100,
          max: 200,
        },
      );
    });

    it('os parâmetros novos vencem os legados, lado a lado', () => {
      expect(
        resolveDailyRateBounds({ minDailyRate: 50, minPrice: 700 }),
      ).toEqual({ min: 50 });
      expect(
        resolveDailyRateBounds({
          minDailyRate: 50,
          minPrice: 700,
          maxPrice: 1400,
        }),
      ).toEqual({ min: 50, max: 200 });
      expect(
        resolveDailyRateBounds({
          maxDailyRate: 90,
          minPrice: 700,
          maxPrice: 1400,
        }),
      ).toEqual({ min: 100, max: 90 });
    });

    it('zero é limite válido, não "falsy"', () => {
      expect(resolveDailyRateBounds({ minPrice: 0 })).toEqual({ min: 0 });
      expect(resolveDailyRateBounds({ maxPrice: 0 })).toEqual({ max: 0 });
      expect(
        resolveDailyRateBounds({ minDailyRate: 0, minPrice: 700 }),
      ).toEqual({ min: 0 });
      expect(resolveDailyRateBounds({ maxDailyRate: 0 })).toEqual({ max: 0 });
    });

    it('sem parâmetros devolve objeto vazio', () => {
      expect(resolveDailyRateBounds({})).toEqual({});
    });
  });

  describe('buildPricing', () => {
    const expected100 = {
      dailyRate: 100,
      weeklyRate: 700,
      weeklyEstimate: 700,
      monthlyEstimate: 3000,
      minRentalDays: 30,
      minPeriodTotal: 3000,
    };

    it('aceita number', () => {
      expect(buildPricing({ dailyRate: 100, minRentalDays: 30 })).toEqual(
        expected100,
      );
    });

    it('aceita string numérica', () => {
      expect(buildPricing({ dailyRate: '100.00', minRentalDays: 30 })).toEqual(
        expected100,
      );
    });

    it('aceita objeto Decimal-like (toString/valueOf)', () => {
      const decimalLike = {
        toString: () => '100.00',
        valueOf: () => '100.00',
      };
      expect(
        buildPricing({ dailyRate: decimalLike, minRentalDays: 30 }),
      ).toEqual(expected100);
    });

    it('aceita Prisma.Decimal real', () => {
      expect(
        buildPricing({
          dailyRate: new Prisma.Decimal('100.00'),
          minRentalDays: 30,
        }),
      ).toEqual(expected100);
      expect(
        buildPricing({ dailyRate: new Prisma.Decimal('99.86') }).weeklyEstimate,
      ).toBe(699.02);
    });

    it('sem tempo mínimo devolve minRentalDays e minPeriodTotal null', () => {
      const semMinimo = {
        ...expected100,
        minRentalDays: null,
        minPeriodTotal: null,
      };
      expect(buildPricing({ dailyRate: '100.00' })).toEqual(semMinimo);
      expect(buildPricing({ dailyRate: 100, minRentalDays: null })).toEqual(
        semMinimo,
      );
    });

    it('weeklyRate sempre igual a weeklyEstimate', () => {
      const pricing = buildPricing({ dailyRate: '99.86' });
      expect(pricing.weeklyRate).toBe(pricing.weeklyEstimate);
      expect(pricing.weeklyRate).toBe(699.02);
    });
  });

  describe('entradas inválidas (validação é do chamador)', () => {
    it('NaN e negativo não lançam exceção', () => {
      expect(() => weeklyEstimate(NaN)).not.toThrow();
      expect(weeklyEstimate(NaN)).toBeNaN();
      expect(() => monthlyEstimate(-10)).not.toThrow();
      expect(monthlyEstimate(-10)).toBe(-300);
      expect(() => minPeriodTotal(NaN, 3)).not.toThrow();
      expect(() => dailyFromLegacyWeekly(-7)).not.toThrow();
      expect(() => buildPricing({ dailyRate: 'abc' })).not.toThrow();
      expect(buildPricing({ dailyRate: 'abc' }).dailyRate).toBeNaN();
      expect(() => buildPricing({ dailyRate: null })).not.toThrow();
      expect(() => buildPricing({ dailyRate: undefined })).not.toThrow();
    });
  });
});
