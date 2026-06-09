import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

export type FipeBrand = {
  code: string;
  name: string;
};

export type FipeModel = {
  code: string;
  name: string;
};

export type FipeYear = {
  code: string;
  name: string;
};

export type FipePriceResult = {
  fipeCode: string;
  brand: string;
  model: string;
  modelYear: number;
  fuel: string;
  referenceMonth: string;
  priceValue: number;
  priceFormatted: string;
  suggestedWeeklyRateMin: number;
  suggestedWeeklyRateMax: number;
};

@Injectable({ providedIn: 'root' })
export class FipeApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/lookups/fipe`;

  getBrands(type: 'cars' | 'motorcycles') {
    return this.http
      .get<FipeBrand[]>(`${this.base}/${type}/brands`)
      .pipe(catchError(() => of(null)));
  }

  getModels(type: 'cars' | 'motorcycles', brandCode: string) {
    return this.http
      .get<FipeModel[]>(`${this.base}/${type}/brands/${brandCode}/models`)
      .pipe(catchError(() => of(null)));
  }

  getYears(
    type: 'cars' | 'motorcycles',
    brandCode: string,
    modelCode: string,
  ) {
    return this.http
      .get<FipeYear[]>(
        `${this.base}/${type}/brands/${brandCode}/models/${modelCode}/years`,
      )
      .pipe(catchError(() => of(null)));
  }

  getPrice(
    type: 'cars' | 'motorcycles',
    brandCode: string,
    modelCode: string,
    yearCode: string,
  ) {
    return this.http
      .get<FipePriceResult>(
        `${this.base}/${type}/brands/${brandCode}/models/${modelCode}/years/${yearCode}`,
      )
      .pipe(catchError(() => of(null)));
  }
}
