import { TestBed } from '@angular/core/testing';
import { VehicleCardItem } from '../../core/models/domain.models';
import { RENTAL_DISCLAIMER } from '../../shared/utils/rental-pricing.util';
import { ComparePageBase } from './compare-page.base';

class TestComparePage extends ComparePageBase {
  week(v: VehicleCardItem) {
    return this.weekEstimate(v);
  }
  month(v: VehicleCardItem) {
    return this.monthEstimate(v);
  }
  min(v: VehicleCardItem) {
    return this.minRentalText(v);
  }
  text() {
    return this.disclaimer;
  }
}

describe('ComparePageBase (preço por diária)', () => {
  let page: TestComparePage;
  const vehicle = (dailyRate: number, minRentalDays: number | null) =>
    ({ dailyRate, minRentalDays }) as VehicleCardItem;

  beforeEach(() => {
    page = TestBed.runInInjectionContext(() => new TestComparePage());
  });

  it('estima 7 e 30 dias a partir da diária', () => {
    expect(page.week(vehicle(100, null))).toBe(700);
    expect(page.month(vehicle(100, null))).toBe(3000);
    expect(page.week(vehicle(99.86, null))).toBe(699.02);
  });

  it('rotula o tempo mínimo e usa "Sem tempo mínimo" quando nulo', () => {
    expect(page.min(vehicle(100, 30))).toBe('1 mês');
    expect(page.min(vehicle(100, null))).toBe('Sem tempo mínimo');
  });

  it('expõe o aviso exato', () => {
    expect(page.text()).toBe(RENTAL_DISCLAIMER);
  });
});
