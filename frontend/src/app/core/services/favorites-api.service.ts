import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { VehicleCardItem } from '../models/domain.models';

@Injectable({ providedIn: 'root' })
export class FavoritesApiService {
  private readonly http = inject(HttpClient);

  getMyFavorites() {
    return this.http.get<VehicleCardItem[]>(`${environment.apiBaseUrl}/favorites/my`);
  }

  addFavorite(vehicleId: string) {
    return this.http.post<{ message: string; vehicle: VehicleCardItem }>(
      `${environment.apiBaseUrl}/favorites/${vehicleId}`,
      {},
    );
  }

  removeFavorite(vehicleId: string) {
    return this.http.delete<{ message: string; vehicleId: string }>(
      `${environment.apiBaseUrl}/favorites/${vehicleId}`,
    );
  }
}
