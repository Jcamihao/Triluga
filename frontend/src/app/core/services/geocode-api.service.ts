import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  displayName: string;
};

@Injectable({ providedIn: 'root' })
export class GeocodeApiService {
  private readonly http = inject(HttpClient);

  lookup(address: string) {
    return this.http.get<GeocodeResult>(`${environment.apiBaseUrl}/lookups/geocode`, {
      params: { address },
    });
  }
}
