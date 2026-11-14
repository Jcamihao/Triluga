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
import { BillingApiService } from '../../core/services/billing-api.service';
import { BillingMe } from '../../core/models/domain.models';
import { throwError } from 'rxjs';
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
        { provide: BillingApiService, useValue: { getMe: () => of(null) } },
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

describe('OwnerDashboardPageBase (limite de planos)', () => {
  const limitError = { status: 403, error: { statusCode: 403, error: 'Forbidden', code: 'PLAN_LIMIT', limit: 3, used: 3, plan: 'FREE', message: 'Limite de 3 anúncios atingido.' } };
  const fullDraft = {
    title: 'Argo',
    brand: 'Fiat',
    model: 'Argo',
    year: 2020,
    plate: 'ABC1D23',
    city: 'Goiânia',
    state: 'GO',
    vehicleType: 'CAR',
    category: 'HATCH',
    transmission: 'MANUAL',
    fuelType: 'FLEX',
    seats: 5,
    dailyRate: 100,
    minRentalDays: 30,
    kmPolicy: 'FREE',
    description: 'Carro ótimo',
    addressLine: 'Rua A',
    isPublished: true,
  };

  function billingMe(overrides: Partial<BillingMe['usage']> = {}): BillingMe {
    return {
      enabled: true,
      plan: 'FREE',
      status: null,
      source: null,
      interval: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      latestInvoiceUrl: null,
      usage: { enforced: true, plan: 'FREE', ads: { used: 2, limit: 3 }, ...overrides },
    } as BillingMe;
  }

  let vehiclesApi: jasmine.SpyObj<VehiclesApiService>;
  let billingApi: jasmine.SpyObj<BillingApiService>;

  function build(me: BillingMe | null | 'error' = null): TestOwnerPage {
    vehiclesApi = jasmine.createSpyObj('VehiclesApiService', ['getMine', 'create', 'update', 'remove']);
    vehiclesApi.getMine.and.returnValue(of([]));
    billingApi = jasmine.createSpyObj('BillingApiService', ['getMe']);
    billingApi.getMe.and.returnValue(me === 'error' ? throwError(() => new Error('falhou')) : of(me as any));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: VehiclesApiService, useValue: new Proxy(vehiclesApi, { get: (t, k) => (t as any)[k] ?? (() => of([])) }) },
        { provide: AuthService, useValue: { currentUser: () => ({ profile: { city: 'Goiânia', state: 'GO', addressLine: 'Rua A' } }) } },
        { provide: UiStateService, useValue: {} },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } }, queryParamMap: of({ get: () => null }) } },
        { provide: FeaturedApiService, useValue: new Proxy({}, { get: () => () => of([]) }) },
        { provide: PlateApiService, useValue: {} },
        { provide: GeocodeApiService, useValue: {} },
        { provide: FipeApiService, useValue: {} },
        { provide: BillingApiService, useValue: billingApi },
      ],
    });
    return TestBed.runInInjectionContext(() => new TestOwnerPage());
  }

  function withDraft(p: TestOwnerPage) {
    p.draft = { ...p.draft, ...fullDraft };
    (p as any).pendingVehicleFiles = [1, 2, 3].map((i) => new File([''], `foto${i}.jpg`, { type: 'image/jpeg' }));
    return p;
  }

  it('create com PLAN_LIMIT: vehicleError vira a message do servidor e planLimitReached true', () => {
    const p = withDraft(build());
    vehiclesApi.create.and.returnValue(throwError(() => limitError));
    (p as any).saveVehicle();
    expect((p as any).vehicleError).toBe('Limite de 3 anúncios atingido.');
    expect((p as any).planLimitReached).toBeTrue();
  });

  it('create com 500 mantém planLimitReached false', () => {
    const p = withDraft(build());
    vehiclesApi.create.and.returnValue(throwError(() => ({ status: 500, error: { message: 'Erro interno' } })));
    (p as any).saveVehicle();
    expect((p as any).vehicleError).toBe('Erro interno');
    expect((p as any).planLimitReached).toBeFalse();
  });

  it('novo envio zera planLimitReached', () => {
    const p = withDraft(build());
    vehiclesApi.create.and.returnValue(throwError(() => limitError));
    (p as any).saveVehicle();
    expect((p as any).planLimitReached).toBeTrue();
    vehiclesApi.create.and.returnValue(throwError(() => ({ status: 500, error: {} })));
    (p as any).saveVehicle();
    expect((p as any).planLimitReached).toBeFalse();
  });

  it('saveVehicleAndFeatured com PLAN_LIMIT marca planLimitReached', () => {
    const p = withDraft(build());
    (p as any).wizardSelectedPlanId = 'plan-1';
    vehiclesApi.create.and.returnValue(throwError(() => limitError));
    (p as any).saveVehicleAndFeatured();
    expect((p as any).vehicleError).toBe('Limite de 3 anúncios atingido.');
    expect((p as any).planLimitReached).toBeTrue();
  });

  it('toggle de publicação com PLAN_LIMIT marca planLimitReached', () => {
    const p = build();
    vehiclesApi.update.and.returnValue(throwError(() => limitError));
    (p as any).toggleVehiclePublication({ id: 'v1', isPublished: false });
    expect((p as any).vehicleError).toBe('Limite de 3 anúncios atingido.');
    expect((p as any).planLimitReached).toBeTrue();
  });

  it('adUsageLabel é null sem billingMe', () => {
    const p = build(null);
    expect((p as any).adUsageLabel).toBeNull();
  });

  it('adUsageLabel é null quando usage.enforced é false', () => {
    const p = build(billingMe({ enforced: false }));
    expect((p as any).adUsageLabel).toBeNull();
  });

  it('adUsageLabel mostra "2 de 3 anúncios"', () => {
    const p = build(billingMe());
    expect((p as any).adUsageLabel).toBe('2 de 3 anúncios');
  });

  it('adUsageLabel com limite nulo mostra "5 anúncios (ilimitado)"', () => {
    const p = build(billingMe({ ads: { used: 5, limit: null } } as any));
    expect((p as any).adUsageLabel).toBe('5 anúncios (ilimitado)');
  });

  it('getMe falhando não quebra o carregamento: billingMe nulo e loading termina', () => {
    const p = build('error');
    expect((p as any).billingMe).toBeNull();
    expect((p as any).loading).toBeFalse();
  });
});
