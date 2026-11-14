import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { BillingApiService } from './billing-api.service';

describe('BillingApiService', () => {
  let service: BillingApiService;
  let http: HttpTestingController;
  const base = environment.apiBaseUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(BillingApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getPlans faz GET /billing/plans', () => {
    service.getPlans().subscribe();
    const req = http.expectOne(`${base}/billing/plans`);
    expect(req.request.method).toBe('GET');
    req.flush({ enabled: true, plans: [] });
  });

  it('getMe faz GET /billing/me', () => {
    service.getMe().subscribe();
    const req = http.expectOne(`${base}/billing/me`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('checkout faz POST /billing/checkout com { plan, interval }', () => {
    let link = '';
    service.checkout('PROFESSIONAL', 'YEARLY').subscribe((r) => (link = r.link));
    const req = http.expectOne(`${base}/billing/checkout`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ plan: 'PROFESSIONAL', interval: 'YEARLY' });
    req.flush({ link: 'https://pay' });
    expect(link).toBe('https://pay');
  });

  it('sync faz POST /billing/sync sem corpo', () => {
    service.sync().subscribe();
    const req = http.expectOne(`${base}/billing/sync`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeNull();
    req.flush(null);
  });

  it('cancel faz POST /billing/cancel sem corpo', () => {
    service.cancel().subscribe();
    const req = http.expectOne(`${base}/billing/cancel`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeNull();
    req.flush(null);
  });

  it('listGrants faz GET /billing/admin/grants', () => {
    service.listGrants().subscribe();
    const req = http.expectOne(`${base}/billing/admin/grants`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createGrant faz POST /billing/admin/grants com o corpo recebido', () => {
    const body = { email: 'a@b.com', plan: 'FLEET' as const, endsAt: '2027-01-01T00:00:00.000Z' };
    service.createGrant(body).subscribe();
    const req = http.expectOne(`${base}/billing/admin/grants`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('revokeGrant faz DELETE /billing/admin/grants/:id', () => {
    service.revokeGrant('abc').subscribe();
    const req = http.expectOne(`${base}/billing/admin/grants/abc`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
