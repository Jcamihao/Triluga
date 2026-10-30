import { LookupsService } from './lookups.service';

describe('FIPE: sugestão de preço', () => {
  const cache = {
    getJson: jest.fn().mockResolvedValue(null),
    setJson: jest.fn().mockResolvedValue(undefined),
  };

  function serviceWithPrice(price: string) {
    const service = new LookupsService(cache as never);
    jest.spyOn(service as any, 'fetchFipe').mockResolvedValue({
      statusCode: 200,
      payload: { price },
    });
    return service;
  }

  it('50000 -> diária 71..143 e semanal (arredondada a 10) inalterada', async () => {
    const result = await serviceWithPrice('R$ 50.000,00').getFipePrice(
      'cars',
      '1',
      '2',
      '3',
    );

    expect(result.suggestedDailyRateMin).toBe(71);
    expect(result.suggestedDailyRateMax).toBe(143);
    expect(result.suggestedWeeklyRateMin).toBe(500);
    expect(result.suggestedWeeklyRateMax).toBe(1000);
  });

  it('diária mínima nunca é menor que 1', async () => {
    const result = await serviceWithPrice('R$ 100,00').getFipePrice(
      'cars',
      '1',
      '2',
      '3',
    );

    expect(result.suggestedDailyRateMin).toBe(1);
  });

  it('diária máxima nunca é menor que a mínima (preço 100: min 1, max 1)', async () => {
    const result = await serviceWithPrice('R$ 100,00').getFipePrice(
      'cars',
      '1',
      '2',
      '3',
    );

    expect(result.suggestedDailyRateMin).toBe(1);
    expect(result.suggestedDailyRateMax).toBeGreaterThanOrEqual(
      result.suggestedDailyRateMin,
    );
  });

  describe('cache', () => {
    beforeEach(() => {
      cache.getJson.mockReset().mockResolvedValue(null);
      cache.setJson.mockReset().mockResolvedValue(undefined);
    });

    it('entrada antiga (sem diária sugerida) em fipe:... não é lida: chave versionada', async () => {
      const legacyKey = 'fipe:cars:brands:1:models:2:years:3';
      const staleEntry = { priceValue: 50000, suggestedWeeklyRateMin: 500 };
      cache.getJson.mockImplementation(async (key: string) =>
        key === legacyKey ? staleEntry : null,
      );

      const result = await serviceWithPrice('R$ 50.000,00').getFipePrice(
        'cars',
        '1',
        '2',
        '3',
      );

      expect(result.suggestedDailyRateMin).toBe(71);
      expect(cache.getJson).toHaveBeenCalledWith(
        expect.stringMatching(/^fipe:v2:/),
      );
      expect(cache.getJson).not.toHaveBeenCalledWith(legacyKey);
      expect(cache.setJson).toHaveBeenCalledWith(
        expect.stringMatching(/^fipe:v2:/),
        expect.objectContaining({ suggestedDailyRateMax: 143 }),
        86400,
      );
    });
  });
});
