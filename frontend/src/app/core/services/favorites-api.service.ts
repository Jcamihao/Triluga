import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { VehicleCardItem } from '../models/domain.models';
import { normalizeApiPayloadUrls } from '../utils/network-url.util';

@Injectable({ providedIn: 'root' })
export class FavoritesApiService {
  private readonly http = inject(HttpClient);

  getMyFavorites() {
    return this.http
      .get<VehicleCardItem[]>(`${environment.apiBaseUrl}/favorites/my`)
      .pipe(map((vehicles) => normalizeApiPayloadUrls(vehicles)));
  }

  addFavorite(vehicleId: string) {
    return this.http
      .post<{
        message: string;
        vehicle: VehicleCardItem;
      }>(`${environment.apiBaseUrl}/favorites/${vehicleId}`, {})
      .pipe(map((response) => normalizeApiPayloadUrls(response)));
  }

  removeFavorite(vehicleId: string) {
    return this.http.delete<{ message: string; vehicleId: string }>(
      `${environment.apiBaseUrl}/favorites/${vehicleId}`,
    );
  }
}
