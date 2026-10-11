import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  FeaturedOrder,
  FeaturedOrderResult,
  FeaturedPlan,
} from '../models/domain.models';

@Injectable({ providedIn: 'root' })
export class FeaturedApiService {
  private readonly http = inject(HttpClient);

  getPlans() {
    return this.http.get<FeaturedPlan[]>(`${environment.apiBaseUrl}/featured/plans`);
  }

  createOrder(vehicleId: string, planId: string) {
    return this.http.post<FeaturedOrderResult>(
      `${environment.apiBaseUrl}/featured/orders`,
      { vehicleId, planId },
    );
  }

  cancelOrder(orderId: string) {
    return this.http.delete<FeaturedOrder>(
      `${environment.apiBaseUrl}/featured/orders/${orderId}`,
    );
  }

  getMyOrders() {
    return this.http.get<FeaturedOrder[]>(`${environment.apiBaseUrl}/featured/orders/mine`);
  }
}
