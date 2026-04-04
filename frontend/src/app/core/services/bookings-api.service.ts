import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Booking, BookingChecklistType } from '../models/domain.models';
import { normalizeApiPayloadUrls } from '../utils/network-url.util';

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
    return this.http
      .post<Booking>(`${environment.apiBaseUrl}/bookings`, payload)
      .pipe(map((booking) => normalizeApiPayloadUrls(booking)));
  }

  getMine() {
    return this.http
      .get<Booking[]>(`${environment.apiBaseUrl}/bookings/my`)
      .pipe(map((bookings) => normalizeApiPayloadUrls(bookings)));
  }

  getOwnerBookings() {
    return this.http
      .get<Booking[]>(`${environment.apiBaseUrl}/bookings/owner`)
      .pipe(map((bookings) => normalizeApiPayloadUrls(bookings)));
  }

  approve(bookingId: string, reason?: string) {
    return this.http
      .patch<Booking>(`${environment.apiBaseUrl}/bookings/${bookingId}/approve`, {
        reason,
      })
      .pipe(map((booking) => normalizeApiPayloadUrls(booking)));
  }

  reject(bookingId: string, reason?: string) {
    return this.http
      .patch<Booking>(`${environment.apiBaseUrl}/bookings/${bookingId}/reject`, {
        reason,
      })
      .pipe(map((booking) => normalizeApiPayloadUrls(booking)));
  }

  cancel(bookingId: string) {
    return this.http
      .patch<Booking>(`${environment.apiBaseUrl}/bookings/${bookingId}/cancel`, {})
      .pipe(map((booking) => normalizeApiPayloadUrls(booking)));
  }

  updateChecklist(
    bookingId: string,
    type: BookingChecklistType,
    payload: {
      items: string[];
      notes?: string;
      markComplete?: boolean;
    },
    files: File[] = [],
  ) {
    const formData = new FormData();
    formData.append('items', JSON.stringify(payload.items));
    formData.append('notes', payload.notes ?? '');
    formData.append('markComplete', String(!!payload.markComplete));

    files.forEach((file) => {
      formData.append('files', file);
    });

    return this.http
      .patch<Booking>(
        `${environment.apiBaseUrl}/bookings/${bookingId}/checklists/${type}`,
        formData,
      )
      .pipe(map((booking) => normalizeApiPayloadUrls(booking)));
  }
}
