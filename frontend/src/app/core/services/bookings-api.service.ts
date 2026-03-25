import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Booking } from '../models/domain.models';

@Injectable({ providedIn: 'root' })
export class BookingsApiService {
  private readonly http = inject(HttpClient);

  create(payload: {
    vehicleId: string;
    startDate: string;
    endDate: string;
    notes?: string;
    selectedAddonIds?: string[];
    couponCode?: string;
  }) {
    return this.http.post<Booking>(
      `${environment.apiBaseUrl}/bookings`,
      payload,
    );
  }

  getMine() {
    return this.http.get<Booking[]>(`${environment.apiBaseUrl}/bookings/my`);
  }

  getOwnerBookings() {
    return this.http.get<Booking[]>(`${environment.apiBaseUrl}/bookings/owner`);
  }

  approve(bookingId: string, reason?: string) {
    return this.http.patch<Booking>(
      `${environment.apiBaseUrl}/bookings/${bookingId}/approve`,
      { reason },
    );
  }

  reject(bookingId: string, reason?: string) {
    return this.http.patch<Booking>(
      `${environment.apiBaseUrl}/bookings/${bookingId}/reject`,
      { reason },
    );
  }

  cancel(bookingId: string) {
    return this.http.patch<Booking>(
      `${environment.apiBaseUrl}/bookings/${bookingId}/cancel`,
      {},
    );
  }
}
