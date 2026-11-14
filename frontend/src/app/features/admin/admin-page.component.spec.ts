import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { AdminApiService } from '../../core/services/admin-api.service';
import { BillingApiService } from '../../core/services/billing-api.service';
import { AdminPageComponent } from './admin-page.component';

const GRANTS = [
  { id: 'g1', email: 'pro@exemplo.com', plan: 'PROFESSIONAL', currentPeriodEnd: '2026-12-31T00:00:00.000Z', status: 'ACTIVE', createdAt: '2026-11-01T00:00:00.000Z' },
  { id: 'g2', email: 'frota@exemplo.com', plan: 'FLEET', currentPeriodEnd: null, status: 'ACTIVE', createdAt: '2026-11-02T00:00:00.000Z' },
];

describe('AdminPageComponent: planos concedidos', () => {
  let fixture: ComponentFixture<AdminPageComponent>;
  let component: AdminPageComponent;
  let billing: jasmine.SpyObj<BillingApiService>;
  let admin: jasmine.SpyObj<AdminApiService>;

  function setup(listGrants = () => of(GRANTS)) {
    admin = jasmine.createSpyObj<AdminApiService>('AdminApiService', [
      'getDashboard', 'getUsers', 'getVehicles', 'getPrivacyRequests',
      'getFeaturedOrders', 'getOverview', 'getReports', 'getOpenReportsCount', 'getAuditLogs',
    ]);
    admin.getDashboard.and.returnValue(of({ totals: { users: 0, vehicles: 0, privacyRequests: 0 } }) as any);
    admin.getUsers.and.returnValue(of([]) as any);
    admin.getVehicles.and.returnValue(of([]) as any);
    admin.getPrivacyRequests.and.returnValue(of([]) as any);
    admin.getFeaturedOrders.and.returnValue(of([]) as any);
    admin.getOverview.and.returnValue(of({}) as any);
    admin.getReports.and.returnValue(of({ items: [], total: 0 }) as any);
    admin.getOpenReportsCount.and.returnValue(of(0) as any);
    admin.getAuditLogs.and.returnValue(of({ items: [], total: 0, page: 1, limit: 50 }) as any);

    billing = jasmine.createSpyObj<BillingApiService>('BillingApiService', [
      'listGrants', 'createGrant', 'revokeGrant',
    ]);
    billing.listGrants.and.callFake(listGrants as any);
    billing.createGrant.and.returnValue(of(GRANTS[0]) as any);
    billing.revokeGrant.and.returnValue(of(undefined) as any);

    TestBed.configureTestingModule({
      imports: [AdminPageComponent],
      providers: [
        { provide: AdminApiService, useValue: admin },
        { provide: BillingApiService, useValue: billing },
      ],
    });
    TestBed.overrideComponent(AdminPageComponent, {
      set: { imports: [CommonModule, FormsModule], schemas: [NO_ERRORS_SCHEMA] },
    });

    fixture = TestBed.createComponent(AdminPageComponent);
    component = fixture.componentInstance;
    component['activeTab'] = 'manage';
    fixture.detectChanges();
  }

  function buttonByText(text: string): HTMLButtonElement | undefined {
    return (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
      .find((b) => b.textContent?.trim() === text);
  }

  it('lista as concessões', () => {
    setup();
    const text = fixture.nativeElement.textContent as string;
    expect(component['grants'].length).toBe(2);
    expect(text).toContain('pro@exemplo.com');
    expect(text).toContain('frota@exemplo.com');
    expect(text).toContain('sem fim');
    expect(text).toContain('até 31/12/2026');
  });

  it('conceder com data envia endsAt no fim do dia em -03:00 e recarrega a lista', () => {
    setup();
    billing.listGrants.calls.reset();
    component['grantEmail'] = ' pro@exemplo.com ';
    component['grantPlan'] = 'FLEET';
    component['grantEndsAt'] = '2026-12-31';

    component['createGrant']();

    expect(billing.createGrant).toHaveBeenCalledWith({
      email: 'pro@exemplo.com',
      plan: 'FLEET',
      endsAt: '2026-12-31T23:59:59-03:00',
    });
    expect(component['grantEmail']).toBe('');
    expect(component['grantEndsAt']).toBe('');
    expect(component['grantFeedback']).toBe('Plano concedido a pro@exemplo.com.');
    expect(billing.listGrants).toHaveBeenCalledTimes(1);
  });

  it('conceder sem data não envia a chave endsAt', () => {
    setup();
    component['grantEmail'] = 'pro@exemplo.com';
    component['grantEndsAt'] = '';

    component['createGrant']();

    const body = billing.createGrant.calls.mostRecent().args[0];
    expect('endsAt' in body).toBeFalse();
    expect(body).toEqual({ email: 'pro@exemplo.com', plan: 'PROFESSIONAL' });
  });

  it('erro 404 mostra a mensagem do backend e mantém o e-mail', () => {
    setup();
    billing.createGrant.and.returnValue(
      throwError(() => ({ status: 404, error: { message: 'Nenhum usuário encontrado com esse e-mail.' } })) as any,
    );
    component['grantEmail'] = 'ninguem@exemplo.com';

    component['createGrant']();
    fixture.detectChanges();

    expect(component['grantError']).toBe('Nenhum usuário encontrado com esse e-mail.');
    expect(component['grantEmail']).toBe('ninguem@exemplo.com');
    expect(fixture.nativeElement.textContent).toContain('Nenhum usuário encontrado com esse e-mail.');
  });

  it('revogar exige confirmação e chama revokeGrant só no segundo clique', () => {
    setup();
    billing.listGrants.calls.reset();

    buttonByText('Revogar')!.click();
    fixture.detectChanges();
    expect(billing.revokeGrant).not.toHaveBeenCalled();

    buttonByText('Confirmar revogação')!.click();
    fixture.detectChanges();
    expect(billing.revokeGrant).toHaveBeenCalledOnceWith('g1');
    expect(billing.listGrants).toHaveBeenCalledTimes(1);
  });

  it('cancelar a revogação não chama revokeGrant', () => {
    setup();
    buttonByText('Revogar')!.click();
    fixture.detectChanges();
    buttonByText('Cancelar')!.click();
    fixture.detectChanges();
    expect(billing.revokeGrant).not.toHaveBeenCalled();
  });

  it('falha em listGrants não impede o resto do painel', () => {
    setup(() => throwError(() => new Error('falhou')));
    expect(component['grantsLoadFailed']).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Não foi possível carregar as concessões.');
    expect(admin.getUsers).toHaveBeenCalled();
    expect(admin.getAuditLogs).toHaveBeenCalled();
    expect(admin.getReports).toHaveBeenCalled();
  });
});
