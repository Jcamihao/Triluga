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
});
