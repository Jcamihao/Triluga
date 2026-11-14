import { NO_ERRORS_SCHEMA, Type } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { BillingApiService } from '../../../core/services/billing-api.service';
import { BillingMe, BillingPlansResponse } from '../../../core/models/domain.models';
import { PlanPageDesktopComponent } from './plan-page-desktop.component';
import { PlanPageMobileComponent } from './plan-page-mobile.component';

const PLANS_ON: BillingPlansResponse = {
  enabled: true,
  plans: [
    { id: 'FREE', label: 'Grátis', adLimit: 3, sellable: false, prices: null },
    { id: 'PROFESSIONAL', label: 'Profissional', adLimit: 10, sellable: true, prices: { MONTHLY: 49.9, YEARLY: 499 } },
    { id: 'FLEET', label: 'Frota', adLimit: null, sellable: true, prices: { MONTHLY: 129.9, YEARLY: 1299 } },
  ],
};
const PLANS_OFF: BillingPlansResponse = { ...PLANS_ON, enabled: false };
const ME: BillingMe = {
  enabled: false,
  plan: 'FREE',
  status: null,
  source: null,
  interval: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  latestInvoiceUrl: null,
  usage: { enforced: false, plan: 'FREE', ads: { used: 0, limit: 3 } },
};

describe('Plan page templates', () => {
  let api: jasmine.SpyObj<BillingApiService>;

  function setup(plans: BillingPlansResponse) {
    api = jasmine.createSpyObj<BillingApiService>('BillingApiService', ['getPlans', 'getMe', 'checkout', 'sync', 'cancel']);
    api.getPlans.and.returnValue(of(plans));
    api.getMe.and.returnValue(of(ME));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: BillingApiService, useValue: api },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    });
  }

  function render<T>(component: Type<T>): ComponentFixture<T> {
    TestBed.overrideComponent(component, {
      set: { imports: [CommonModule], schemas: [NO_ERRORS_SCHEMA] },
    });
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    return fixture;
  }

  const buttonTexts = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');

  for (const [name, component] of [
    ['desktop', PlanPageDesktopComponent],
    ['mobile', PlanPageMobileComponent],
  ] as const) {
    describe(name, () => {
      it('com flag desligada mostra aviso e nenhum botão Assinar', () => {
        setup(PLANS_OFF);
        const fixture = render(component);
        const el: HTMLElement = fixture.nativeElement;
        expect(el.textContent).toContain('Planos ainda não disponíveis');
        expect(buttonTexts(el)).not.toContain('Assinar');
      });

      it('com flag ligada mostra os planos vendáveis e botão Assinar', () => {
        setup(PLANS_ON);
        const fixture = render(component);
        const el: HTMLElement = fixture.nativeElement;
        expect(el.textContent).not.toContain('Planos ainda não disponíveis');
        expect(el.textContent).toContain('Profissional');
        expect(el.textContent).toContain('Frota');
        expect(buttonTexts(el)).toContain('Assinar');
      });
    });
  }
});
