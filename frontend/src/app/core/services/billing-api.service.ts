import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  BillingGrant,
  BillingIntervalId,
  BillingMe,
  BillingPlansResponse,
  BillingSellablePlanId,
} from '../models/domain.models';

@Injectable({ providedIn: 'root' })
export class BillingApiService {
  private readonly http = inject(HttpClient);

  getPlans() {
    return this.http.get<BillingPlansResponse>(`${environment.apiBaseUrl}/billing/plans`);
  }

  getMe() {
    return this.http.get<BillingMe>(`${environment.apiBaseUrl}/billing/me`);
  }

  checkout(plan: BillingSellablePlanId, interval: BillingIntervalId): Observable<{ link: string }> {
    return this.http.post<{ link: string }>(`${environment.apiBaseUrl}/billing/checkout`, {
      plan,
      interval,
    });
  }

  sync(): Observable<void> {
    return this.http.post<void>(`${environment.apiBaseUrl}/billing/sync`, null);
  }

  cancel(): Observable<void> {
    return this.http.post<void>(`${environment.apiBaseUrl}/billing/cancel`, null);
  }

  listGrants() {
    return this.http.get<BillingGrant[]>(`${environment.apiBaseUrl}/billing/admin/grants`);
  }

  createGrant(body: { email: string; plan: BillingSellablePlanId; endsAt?: string }) {
    return this.http.post<BillingGrant>(`${environment.apiBaseUrl}/billing/admin/grants`, body);
  }

  revokeGrant(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiBaseUrl}/billing/admin/grants/${id}`);
  }
}
