import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { VehicleAvailabilityResponse } from '../models/domain.models';

@Injectable({ providedIn: 'root' })
export class AvailabilityApiService {
  private readonly http = inject(HttpClient);

  getVehicleAvailability(vehicleId: string) {
    return this.http.get<VehicleAvailabilityResponse>(
      `${environment.apiBaseUrl}/vehicles/${vehicleId}/availability`,
    );
  }

  blockDates(
    vehicleId: string,
    payload: { startDate: string; endDate: string; reason?: string },
  ) {
    return this.http.post(
      `${environment.apiBaseUrl}/vehicles/${vehicleId}/blocked-dates`,
      payload,
    );
  }
}
