import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { FipeApiService, FipePriceResult } from '../../core/services/fipe-api.service';
import { VehiclesApiService } from '../../core/services/vehicles-api.service';
import { AuthService } from '../../core/services/auth.service';
import { UiStateService } from '../../core/services/ui-state.service';
import { FeaturedApiService } from '../../core/services/featured-api.service';
import { PlateApiService } from '../../core/services/plate-api.service';
import { GeocodeApiService } from '../../core/services/geocode-api.service';
import { OwnerDashboardPageBase } from './owner-dashboard-page.base';

class TestOwnerPage extends OwnerDashboardPageBase {
  get draft(): any {
    return this.vehicleDraft;
  }
  set draft(value: any) {
    this.vehicleDraft = value;
  }
  payload(): any {
    return (this as any).normalizeVehicleDraft();
  }
  missing(): string[] {
    return (this as any).collectMissingVehicleFields();
  }
  errorText(): string {
    return (this as any).formatMissingVehicleFieldsError(this.missing());
  }
  useFipe(price: Partial<FipePriceResult>) {
    this.fipePrice = price as FipePriceResult;
    this.useFipePrice();
  }
  setFipe(price: Partial<FipePriceResult>) {
    this.fipePrice = price as FipePriceResult;
  }
  get fipeMin() {
    return this.fipeSuggestedDailyMin;
  }
  get fipeMax() {
    return this.fipeSuggestedDailyMax;
  }
  get monthlyRevenue() {
    return this.estimatedDraftMonthlyRevenue;
  }
}

describe('OwnerDashboardPageBase (preço por diária)', () => {
  let page: TestOwnerPage;

  beforeEach(() => {
    const vehiclesApi = jasmine.createSpyObj('VehiclesApiService', ['listMine', 'listMyVehicles', 'create', 'update']);
    vehiclesApi.listMine.and.returnValue(of([]));
    vehiclesApi.listMyVehicles.and.returnValue(of([]));
    TestBed.configureTestingModule({
      providers: [
        { provide: VehiclesApiService, useValue: new Proxy(vehiclesApi, { get: (t, k) => t[k] ?? (() => of([])) }) },
        { provide: AuthService, useValue: { currentUser: () => ({ profile: { city: 'Goiânia', state: 'GO', addressLine: 'Rua A' } }) } },
        { provide: UiStateService, useValue: {} },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } }, queryParamMap: of({ get: () => null }) } },
        { provide: FeaturedApiService, useValue: new Proxy({}, { get: () => () => of([]) }) },
        { provide: PlateApiService, useValue: {} },
        { provide: GeocodeApiService, useValue: {} },
        { provide: FipeApiService, useValue: {} },
      ],
    });
    page = TestBed.runInInjectionContext(() => new TestOwnerPage());
    page.draft = {
      ...page.draft,
      brand: 'Fiat',
      model: 'Argo',
      plate: 'abc1d23',
      description: 'Carro ótimo',
      dailyRate: 100,
      minRentalDays: 30,
    };
  });

  it('payload leva dailyRate e minRentalDays e nunca weeklyRate', () => {
    const payload = page.payload();
    expect(payload.dailyRate).toBe(100);
    expect(payload.minRentalDays).toBe(30);
    expect('weeklyRate' in payload).toBeFalse();
  });

  it('"Sem tempo mínimo" envia minRentalDays null (chave presente)', () => {
    page.draft.minRentalDays = null;
    const payload = page.payload();
    expect(payload.minRentalDays).toBeNull();
    expect('minRentalDays' in payload).toBeTrue();
  });

  it('rascunho inicial não tem mínimo e usa dailyRate', () => {
    const fresh = TestBed.runInInjectionContext(() => new TestOwnerPage());
    expect(fresh.draft.minRentalDays).toBeNull();
    expect(fresh.draft.dailyRate).toBeGreaterThan(0);
    expect('weeklyRate' in fresh.draft).toBeFalse();
  });

  for (const invalid of [null, undefined, '', 0, -5, 0.5]) {
    it(`diária inválida (${JSON.stringify(invalid)}) impede publicar com mensagem em pt-BR`, () => {
      page.draft.dailyRate = invalid;
      expect(page.payload()).toBeNull();
      expect(page.missing()).toContain('valor da diária');
      expect(page.errorText()).toContain('valor da diária');
      expect(page.errorText()).not.toContain('semana');
    });
  }

  it('receita estimada é monthlyEstimate(diária), 0 se inválida', () => {
    expect(page.monthlyRevenue).toBe(3000);
    page.draft.dailyRate = null;
    expect(page.monthlyRevenue).toBe(0);
  });

  it('"Usar valor sugerido" usa suggestedDailyRateMin quando existe', () => {
    page.useFipe({ suggestedDailyRateMin: 80, suggestedWeeklyRateMin: 700 });
    expect(page.draft.dailyRate).toBe(80);
  });

  it('"Usar valor sugerido" deriva da sugestão semanal legada em respostas antigas', () => {
    page.useFipe({ suggestedWeeklyRateMin: 699 });
    expect(page.draft.dailyRate).toBe(99.86);
  });

  it('payload arredonda a diária para 2 casas (backend rejeita mais)', () => {
    page.draft.dailyRate = 99.999;
    expect(page.payload().dailyRate).toBe(100);
    page.draft.dailyRate = '99.866';
    expect(page.payload().dailyRate).toBe(99.87);
  });

  it('FIPE sem sugestão diária nem semanal não vira NaN: retorna null', () => {
    page.setFipe({});
    expect(page.fipeMin).toBeNull();
    expect(page.fipeMax).toBeNull();
  });

  it('"Usar valor sugerido" sem sugestão não altera a diária', () => {
    page.useFipe({});
    expect(page.draft.dailyRate).toBe(100);
  });
});
