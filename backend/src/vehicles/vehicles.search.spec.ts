import { buildDailyRateOrderBy, buildDailyRateWhere } from './rental-pricing';

describe('busca por diária', () => {
  describe('buildDailyRateWhere', () => {
    it('parâmetros novos viram gte/lte', () => {
      expect(
        buildDailyRateWhere({ minDailyRate: 50, maxDailyRate: 200 }),
      ).toEqual({ dailyRate: { gte: 50, lte: 200 } });
    });

    it('legado semanal é dividido por 7', () => {
      expect(buildDailyRateWhere({ minPrice: 700, maxPrice: 1400 })).toEqual({
        dailyRate: { gte: 100, lte: 200 },
      });
    });

    it('novos e legados juntos: os novos vencem por lado', () => {
      expect(
        buildDailyRateWhere({
          minDailyRate: 50,
          minPrice: 700,
          maxPrice: 1400,
        }),
      ).toEqual({ dailyRate: { gte: 50, lte: 200 } });
      expect(
        buildDailyRateWhere({
          minDailyRate: 50,
          maxDailyRate: 80,
          minPrice: 700,
          maxPrice: 1400,
        }),
      ).toEqual({ dailyRate: { gte: 50, lte: 80 } });
    });

    it('zero é limite válido, não é ignorado', () => {
      expect(buildDailyRateWhere({ minPrice: 0 })).toEqual({
        dailyRate: { gte: 0 },
      });
      expect(buildDailyRateWhere({ maxDailyRate: 0 })).toEqual({
        dailyRate: { lte: 0 },
      });
    });

    it('sem filtros: nenhuma cláusula', () => {
      expect(buildDailyRateWhere({})).toBeUndefined();
    });
  });

  describe('buildDailyRateOrderBy', () => {
    it('price_asc e price_desc ordenam por dailyRate', () => {
      expect(buildDailyRateOrderBy('price_asc')).toEqual({ dailyRate: 'asc' });
      expect(buildDailyRateOrderBy('price_desc')).toEqual({
        dailyRate: 'desc',
      });
    });

    it('outras ordenações: undefined', () => {
      expect(buildDailyRateOrderBy('newest')).toBeUndefined();
      expect(buildDailyRateOrderBy(undefined)).toBeUndefined();
    });
  });
});
