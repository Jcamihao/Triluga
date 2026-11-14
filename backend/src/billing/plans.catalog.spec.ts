import { getCatalog, getPlan, PLAN_RANK } from './plans.catalog';

describe('plans.catalog', () => {
  it('FREE tem limite de 3 anuncios e nao tem precos', () => {
    const p = getCatalog({}).FREE;
    expect(p.id).toBe('FREE');
    expect(p.label).toBe('Grátis');
    expect(p.adLimit).toBe(3);
    expect(p.sellable).toBe(false);
    expect(p.prices).toBeNull();
  });

  it('PROFESSIONAL limita a 10 anuncios e tem precos padrao', () => {
    const p = getCatalog({}).PROFESSIONAL;
    expect(p.label).toBe('Profissional');
    expect(p.adLimit).toBe(10);
    expect(p.sellable).toBe(true);
    expect(p.prices).toEqual({ MONTHLY: 29.9, YEARLY: 299 });
  });

  it('FLEET e ilimitado e tem precos padrao', () => {
    const p = getCatalog({}).FLEET;
    expect(p.label).toBe('Frota');
    expect(p.adLimit).toBeNull();
    expect(p.sellable).toBe(true);
    expect(p.prices).toEqual({ MONTHLY: 79.9, YEARLY: 799 });
  });

  it('PLAN_RANK ordena FREE < PROFESSIONAL < FLEET', () => {
    expect(PLAN_RANK.FREE).toBe(0);
    expect(PLAN_RANK.PROFESSIONAL).toBe(1);
    expect(PLAN_RANK.FLEET).toBe(2);
  });

  it('BILLING_PRICE_* sobrescreve o preco', () => {
    const env = {
      BILLING_PRICE_PROFESSIONAL_MONTHLY: '39.9',
      BILLING_PRICE_FLEET_YEARLY: '900',
    } as NodeJS.ProcessEnv;
    expect(getPlan('PROFESSIONAL', env).prices).toEqual({
      MONTHLY: 39.9,
      YEARLY: 299,
    });
    expect(getPlan('FLEET', env).prices).toEqual({
      MONTHLY: 79.9,
      YEARLY: 900,
    });
  });

  it.each(['abc', '', '0', '-5', 'NaN', 'Infinity', '  '])(
    'valor invalido "%s" e ignorado',
    (v) => {
      const env = {
        BILLING_PRICE_PROFESSIONAL_MONTHLY: v,
      } as NodeJS.ProcessEnv;
      expect(getPlan('PROFESSIONAL', env).prices?.MONTHLY).toBe(29.9);
    },
  );

  it('getCatalog devolve objeto novo a cada chamada', () => {
    const a = getCatalog({});
    (a.FREE as { adLimit: number | null }).adLimit = 99;
    expect(getCatalog({}).FREE.adLimit).toBe(3);
  });
});
