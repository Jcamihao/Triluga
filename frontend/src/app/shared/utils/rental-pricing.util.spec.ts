import {
  MIN_RENTAL_OPTIONS,
  RENTAL_DISCLAIMER,
  dailyFromLegacyWeekly,
  minPeriodTotal,
  minRentalLabel,
  monthlyEstimate,
  weeklyEstimate,
} from './rental-pricing.util';

describe('rental-pricing.util', () => {
  it('estima a semana (diária x 7) com 2 casas', () => {
    expect(weeklyEstimate(100)).toBe(700);
    expect(weeklyEstimate(99.86)).toBe(699.02);
  });

  it('estima o mês (diária x 30)', () => {
    expect(monthlyEstimate(100)).toBe(3000);
  });

  it('calcula o total do período mínimo', () => {
    expect(minPeriodTotal(100, 30)).toBe(3000);
    expect(minPeriodTotal(100, null)).toBeNull();
    expect(minPeriodTotal(100, undefined)).toBeNull();
  });

  it('rotula o tempo mínimo', () => {
    expect(minRentalLabel(7)).toBe('1 semana');
    expect(minRentalLabel(90)).toBe('3 meses');
    expect(minRentalLabel(null)).toBe('Sem tempo mínimo');
    expect(minRentalLabel(undefined)).toBe('Sem tempo mínimo');
  });

  it('oferece 6 opções de tempo mínimo, a primeira sem mínimo', () => {
    expect(MIN_RENTAL_OPTIONS.length).toBe(6);
    expect(MIN_RENTAL_OPTIONS[0]).toEqual({ value: null, label: 'Sem tempo mínimo' });
  });

  it('converte semanal legado em diária', () => {
    expect(dailyFromLegacyWeekly(699)).toBe(99.86);
  });

  it('mantém o aviso exato', () => {
    expect(RENTAL_DISCLAIMER).toBe(
      'Valores estimados a partir da diária. O pagamento e as condições são combinados e feitos diretamente entre você e o anunciante; o Triluga não participa nem intermedeia.',
    );
  });
});
