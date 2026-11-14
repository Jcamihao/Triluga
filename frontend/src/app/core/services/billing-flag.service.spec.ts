import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { BillingApiService } from './billing-api.service';
import { BillingFlagService } from './billing-flag.service';

describe('BillingFlagService', () => {
  let getPlans: jasmine.Spy;

  function setup(result: () => any) {
    getPlans = jasmine.createSpy('getPlans').and.callFake(result);
    TestBed.configureTestingModule({
      providers: [{ provide: BillingApiService, useValue: { getPlans } }],
    });
    return TestBed.inject(BillingFlagService);
  }

  it('carrega uma vez e enabled fica verdadeiro', () => {
    const service = setup(() => of({ enabled: true, plans: [] }));
    service.ensureLoaded();
    service.ensureLoaded();
    expect(getPlans).toHaveBeenCalledTimes(1);
    expect(service.enabled()).toBeTrue();
  });

  it('enabled falso quando o backend responde enabled false', () => {
    const service = setup(() => of({ enabled: false, plans: [] }));
    service.ensureLoaded();
    expect(service.enabled()).toBeFalse();
  });

  it('erro deixa enabled falso, não lança e permite nova tentativa', () => {
    let fail = true;
    const service = setup(() =>
      fail ? throwError(() => new Error('falhou')) : of({ enabled: true, plans: [] }),
    );
    expect(() => service.ensureLoaded()).not.toThrow();
    expect(service.enabled()).toBeFalse();

    fail = false;
    service.ensureLoaded();
    expect(getPlans).toHaveBeenCalledTimes(2);
    expect(service.enabled()).toBeTrue();
  });
});
