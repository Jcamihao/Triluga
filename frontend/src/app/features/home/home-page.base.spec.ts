import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BillingPlanView, BillingPlansResponse } from '../../core/models/domain.models';
import { AuthService } from '../../core/services/auth.service';
import { BillingFlagService } from '../../core/services/billing-flag.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { RecentlyViewedService } from '../../core/services/recently-viewed.service';
import { UiStateService } from '../../core/services/ui-state.service';
import { VehiclesApiService } from '../../core/services/vehicles-api.service';
import { HomePageBase } from './home-page.base';

const PLANS: BillingPlanView[] = [
  { id: 'FREE', label: 'Gratuito', adLimit: 3, sellable: false, prices: null },
  { id: 'PROFESSIONAL', label: 'Profissional', adLimit: 10, sellable: true, prices: { MONTHLY: 29.9, YEARLY: 299 } },
  { id: 'FLEET', label: 'Frota', adLimit: null, sellable: true, prices: { MONTHLY: 99.9, YEARLY: 999 } },
];

@Component({ template: '', standalone: true })
class TestHomeComponent extends HomePageBase {}

describe('HomePageBase: faixa de preços', () => {
  let component: TestHomeComponent;
  let enabled: ReturnType<typeof signal<boolean>>;
  let plans: ReturnType<typeof signal<BillingPlansResponse | null>>;
  let ensureLoaded: jasmine.Spy;

  function setup(flagEnabled: boolean) {
    enabled = signal(flagEnabled);
    plans = signal<BillingPlansResponse | null>({ enabled: flagEnabled, plans: PLANS });
    ensureLoaded = jasmine.createSpy('ensureLoaded');

    TestBed.configureTestingModule({
      imports: [TestHomeComponent],
      providers: [
        provideRouter([]),
        { provide: BillingFlagService, useValue: { enabled, plans, ensureLoaded } },
        { provide: VehiclesApiService, useValue: { cities$: of([]), search: () => of({ items: [], meta: { hasNextPage: false } }), getStats: () => of({ electric: 0, economy: 0, sedan: 0, suvPickup: 0 }) } },
        { provide: AuthService, useValue: { hasSession: () => false, currentUser: () => null } },
        { provide: FavoritesService, useValue: {} },
        { provide: UiStateService, useValue: {} },
        { provide: RecentlyViewedService, useValue: { getAll: () => [] } },
      ],
    });

    component = TestBed.createComponent(TestHomeComponent).componentInstance;
  }

  it('chama ensureLoaded no construtor', () => {
    setup(false);
    expect(ensureLoaded).toHaveBeenCalled();
  });

  it('pricingPlans vazio com enabled false', () => {
    setup(false);
    expect(component['pricingPlans']).toEqual([]);
  });

  it('pricingPlans traz Profissional e Frota, sem o FREE, com enabled true', () => {
    setup(true);
    const ids = component['pricingPlans'].map((p) => p.id);
    expect(ids).toEqual(['PROFESSIONAL', 'FLEET']);
  });

  it('monthlyPriceLabel formata 29.9 como R$ 29,90/mês', () => {
    setup(true);
    expect(component['monthlyPriceLabel'](PLANS[1])).toBe('R$ 29,90/mês');
  });

  it('adLimitLabel mostra limite ou ilimitado', () => {
    setup(true);
    expect(component['adLimitLabel'](PLANS[1])).toBe('Até 10 anúncios');
    expect(component['adLimitLabel'](PLANS[2])).toBe('Anúncios ilimitados');
  });
});
