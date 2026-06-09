import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PlateInfo {
  plate: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  year: number | null;
  modelYear: number | null;
  city: string | null;
  state: string | null;
  stolen: boolean;
  occurrences: string | null;
}

@Injectable({ providedIn: 'root' })
export class PlateApiService {
  private readonly http = inject(HttpClient);

  lookup(plate: string) {
    const clean = plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return this.http
      .get<PlateInfo>(`${environment.apiBaseUrl}/lookups/plate/${clean}`)
      .pipe(catchError(() => of(null)));
  }
}
