import { TestBed, discardPeriodicTasks, fakeAsync, tick, flush } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { BillingApiService } from '../../../core/services/billing-api.service';
import { BillingMe, BillingPlansResponse } from '../../../core/models/domain.models';
import { PlanPageBase } from './plan-page.base';

class TestPlanPage extends PlanPageBase {
  navigated: string[] = [];
  protected override navigateExternal(link: string) {
    this.navigated.push(link);
  }
}

const PLANS: BillingPlansResponse = {
  enabled: true,
  plans: [
    { id: 'FREE', label: 'Grátis', adLimit: 3, sellable: false, prices: null },
    { id: 'PROFESSIONAL', label: 'Profissional', adLimit: 10, sellable: true, prices: { MONTHLY: 49.9, YEARLY: 499 } },
    { id: 'FLEET', label: 'Frota', adLimit: null, sellable: true, prices: { MONTHLY: 129.9, YEARLY: 1299 } },
  ],
};

function makeMe(over: Partial<BillingMe> = {}): BillingMe {
  return {
    enabled: true,
    plan: 'FREE',
    status: null,
    source: null,
    interval: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    latestInvoiceUrl: null,
    usage: { enforced: true, plan: 'FREE', ads: { used: 2, limit: 3 } },
    ...over,
  };
}

describe('PlanPageBase', () => {
  let api: jasmine.SpyObj<BillingApiService>;
  let router: { navigate: jasmine.Spy };

  function createPage(checkout: string | null = null, me: BillingMe = makeMe(), plans = PLANS): TestPlanPage {
    api = jasmine.createSpyObj<BillingApiService>('BillingApiService', [
      'getPlans', 'getMe', 'checkout', 'sync', 'cancel',
    ]);
    api.getPlans.and.returnValue(of(plans));
    api.getMe.and.returnValue(of(me));
    api.checkout.and.returnValue(of({ link: 'https://pay.test/abc' }));
    api.sync.and.returnValue(of(undefined));
    api.cancel.and.returnValue(of(undefined));
    router = { navigate: jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true)) };
    const params: Record<string, string> = checkout ? { checkout } : {};
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: BillingApiService, useValue: api },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(params) } } },
      ],
    });
    return TestBed.runInInjectionContext(() => new TestPlanPage());
  }

  describe('subscribe', () => {
    it('chama checkout com plano e intervalo e navega para o link', () => {
      const page = createPage();
      page.subscribe('PROFESSIONAL', 'YEARLY');
      expect(api.checkout).toHaveBeenCalledWith('PROFESSIONAL', 'YEARLY');
      expect(page.navigated).toEqual(['https://pay.test/abc']);
    });

    it('falha do checkout libera busy e mostra a mensagem do servidor', () => {
      const page = createPage();
      api.checkout.and.returnValue(throwError(() => ({ status: 400, error: { message: 'Você já tem este plano.' } })));
      page.subscribe('PROFESSIONAL', 'MONTHLY');
      expect(page.busy).toBeFalse();
      expect(page.error).toBe('Você já tem este plano.');
      expect(page.navigated).toEqual([]);
    });

    it('falha sem mensagem do servidor usa texto padrão', () => {
      const page = createPage();
      api.checkout.and.returnValue(throwError(() => ({ status: 500 })));
      page.subscribe('FLEET', 'MONTHLY');
      expect(page.error).toBe('Não foi possível iniciar a assinatura agora.');
    });
  });

  describe('retorno do checkout', () => {
    it('?checkout=sucesso: entra em confirming e consulta getMe a cada 3 s', fakeAsync(() => {
      const page = createPage('sucesso');
      tick(0);
      expect(page.confirming).toBeTrue();
      const before = api.getMe.calls.count();
      tick(3000);
      expect(api.getMe.calls.count()).toBe(before + 1);
      tick(3000);
      expect(api.getMe.calls.count()).toBe(before + 2);
      page.ngOnDestroy();
      flush();
    }));

    it('sucesso: para quando status vira ACTIVE e mostra aviso de sucesso', fakeAsync(() => {
      const page = createPage('sucesso');
      api.getMe.and.returnValue(of(makeMe({ status: 'ACTIVE', plan: 'PROFESSIONAL', source: 'ASAAS' })));
      tick(3000);
      expect(page.confirming).toBeFalse();
      expect(page.notice).toBe('Plano ativado! Obrigado por assinar.');
      const calls = api.getMe.calls.count();
      tick(30000);
      expect(api.getMe.calls.count()).toBe(calls);
      flush();
    }));

    it('sucesso: sem ACTIVE, para em 60 s com mensagem de espera e sem timers', fakeAsync(() => {
      const page = createPage('sucesso');
      api.getMe.and.returnValue(of(makeMe({ status: 'PENDING' })));
      tick(60000);
      expect(page.confirming).toBeFalse();
      expect(page.notice).toBe(
        'Ainda estamos confirmando seu pagamento. Pode levar alguns minutos; use "Verificar pagamento agora".',
      );
      const calls = api.getMe.calls.count();
      tick(30000);
      expect(api.getMe.calls.count()).toBe(calls);
      flush();
    }));

    it('sucesso: limpa o query param', fakeAsync(() => {
      createPage('sucesso');
      tick(0);
      expect(router.navigate).toHaveBeenCalledWith([], { queryParams: {}, replaceUrl: true });
      discardPeriodicTasks();
    }));

    it('?checkout=cancelado mostra aviso sem polling', fakeAsync(() => {
      const page = createPage('cancelado');
      const calls = api.getMe.calls.count();
      tick(10000);
      expect(api.getMe.calls.count()).toBe(calls);
      expect(page.confirming).toBeFalse();
      expect(page.notice).toBe('Assinatura não concluída. Você pode tentar de novo quando quiser.');
    }));

    it('?checkout=expirado mostra aviso sem polling', fakeAsync(() => {
      const page = createPage('expirado');
      const calls = api.getMe.calls.count();
      tick(10000);
      expect(api.getMe.calls.count()).toBe(calls);
      expect(page.notice).toBe('O link de pagamento expirou. Gere um novo clicando em Assinar.');
    }));

    it('ngOnDestroy cancela o polling', fakeAsync(() => {
      const page = createPage('sucesso');
      const calls = api.getMe.calls.count();
      page.ngOnDestroy();
      tick(60000);
      expect(api.getMe.calls.count()).toBe(calls);
    }));
  });

  describe('cancelamento', () => {
    it('cancel() sem requestCancel() não chama a API', () => {
      const page = createPage();
      page.cancel();
      expect(api.cancel).not.toHaveBeenCalled();
    });

    it('requestCancel() + cancel() chama cancel e recarrega getMe', () => {
      const page = createPage();
      const calls = api.getMe.calls.count();
      page.requestCancel();
      expect(page.cancelPrompt).toBeTrue();
      page.cancel();
      expect(api.cancel).toHaveBeenCalledTimes(1);
      expect(api.getMe.calls.count()).toBe(calls + 1);
      expect(page.cancelPrompt).toBeFalse();
    });

    it('dismissCancel() desliga o prompt', () => {
      const page = createPage();
      page.requestCancel();
      page.dismissCancel();
      expect(page.cancelPrompt).toBeFalse();
    });

    it('erro no cancel vira error', () => {
      const page = createPage();
      api.cancel.and.returnValue(throwError(() => ({ error: { message: 'Sem assinatura ativa.' } })));
      page.requestCancel();
      page.cancel();
      expect(page.error).toBe('Sem assinatura ativa.');
    });

    it('canCancel falso para GRANT', () => {
      const page = createPage(null, makeMe({ source: 'GRANT', status: 'ACTIVE', plan: 'FLEET' }));
      expect(page.isGrant).toBeTrue();
      expect(page.canCancel).toBeFalse();
    });

    it('canCancel verdadeiro para ASAAS ACTIVE e PAST_DUE', () => {
      expect(createPage(null, makeMe({ source: 'ASAAS', status: 'ACTIVE' })).canCancel).toBeTrue();
      expect(createPage(null, makeMe({ source: 'ASAAS', status: 'PAST_DUE' })).canCancel).toBeTrue();
    });
  });

  describe('sync', () => {
    it('chama sync e recarrega getMe', () => {
      const page = createPage();
      const calls = api.getMe.calls.count();
      page.sync();
      expect(api.sync).toHaveBeenCalled();
      expect(api.getMe.calls.count()).toBe(calls + 1);
    });
  });

  describe('getters', () => {
    it('invoiceUrl só com PAST_DUE', () => {
      expect(createPage(null, makeMe({ status: 'PAST_DUE', latestInvoiceUrl: 'https://fatura' })).invoiceUrl).toBe('https://fatura');
      expect(createPage(null, makeMe({ status: 'ACTIVE', latestInvoiceUrl: 'https://fatura' })).invoiceUrl).toBeNull();
    });

    it('enabled false -> canSubscribe falso para todos', () => {
      const page = createPage(null, makeMe(), { ...PLANS, enabled: false });
      expect(page.enabled).toBeFalse();
      expect(page.canSubscribe('PROFESSIONAL')).toBeFalse();
      expect(page.canSubscribe('FLEET')).toBeFalse();
    });

    it('canSubscribe falso para PROFESSIONAL com ACTIVE PROFESSIONAL ou FLEET', () => {
      expect(createPage(null, makeMe({ status: 'ACTIVE', plan: 'PROFESSIONAL', source: 'ASAAS' })).canSubscribe('PROFESSIONAL')).toBeFalse();
      expect(createPage(null, makeMe({ status: 'ACTIVE', plan: 'FLEET', source: 'ASAAS' })).canSubscribe('PROFESSIONAL')).toBeFalse();
    });

    it('canSubscribe verdadeiro para FLEET com ACTIVE PROFESSIONAL (upgrade)', () => {
      expect(createPage(null, makeMe({ status: 'ACTIVE', plan: 'PROFESSIONAL', source: 'ASAAS' })).canSubscribe('FLEET')).toBeTrue();
    });

    it('canSubscribe verdadeiro com PENDING', () => {
      expect(createPage(null, makeMe({ status: 'PENDING', plan: 'PROFESSIONAL', source: 'ASAAS' })).canSubscribe('PROFESSIONAL')).toBeTrue();
    });

    it('usageLabel: limite e ilimitado; vazio sem enforced', () => {
      expect(createPage(null, makeMe({ usage: { enforced: true, plan: 'FREE', ads: { used: 2, limit: 3 } } })).usageLabel).toBe('2 de 3 anúncios');
      expect(createPage(null, makeMe({ usage: { enforced: true, plan: 'FLEET', ads: { used: 5, limit: null } } })).usageLabel).toBe('5 anúncios (ilimitado)');
      expect(createPage(null, makeMe({ usage: { enforced: false, plan: 'FREE', ads: { used: 2, limit: 3 } } })).usageLabel).toBe('');
    });

    it('priceLabel mensal e anual', () => {
      const page = createPage();
      const pro = PLANS.plans[1];
      expect(page.priceLabel(pro)).toContain('49,90');
      expect(page.priceLabel(pro)).toContain('/mês');
      page.interval = 'YEARLY';
      expect(page.priceLabel(pro)).toContain('499,00');
      expect(page.priceLabel(pro)).toContain('/ano');
    });

    it('accessUntilLabel sem voltar um dia', () => {
      const page = createPage(null, makeMe({
        status: 'CANCELED', source: 'ASAAS', currentPeriodEnd: '2026-11-14T00:00:00.000Z',
      }));
      expect(page.accessUntilLabel).toBe('14/11/2026');
    });

    it('accessUntilLabel também com cancelAtPeriodEnd', () => {
      const page = createPage(null, makeMe({
        status: 'ACTIVE', source: 'ASAAS', cancelAtPeriodEnd: true, currentPeriodEnd: '2026-11-14',
      }));
      expect(page.accessUntilLabel).toBe('14/11/2026');
    });
  });
});
