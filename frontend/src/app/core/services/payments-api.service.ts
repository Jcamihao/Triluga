import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { PaymentMethod } from '../models/domain.models';

@Injectable({ providedIn: 'root' })
export class PaymentsApiService {
  private readonly http = inject(HttpClient);

  checkout(payload: { bookingId: string; method: PaymentMethod }) {
    return this.http.post(
      `${environment.apiBaseUrl}/payments/checkout`,
      payload,
    );
  }
}
