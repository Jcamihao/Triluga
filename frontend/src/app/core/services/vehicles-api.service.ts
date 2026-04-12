import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateVehiclePayload,
  OwnerVehicleItem,
  UpdateVehiclePayload,
  VehicleImage,
  VehicleDetail,
  VehicleSearchResponse,
} from '../models/domain.models';
import { normalizeApiPayloadUrls } from '../utils/network-url.util';

@Injectable({ providedIn: 'root' })
export class VehiclesApiService {
  private readonly http = inject(HttpClient);

  search(params: Record<string, string | number | undefined>) {
    let httpParams = new HttpParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    });

    return this.http
      .get<VehicleSearchResponse>(`${environment.apiBaseUrl}/vehicles`, {
        params: httpParams,
      })
      .pipe(map((response) => normalizeApiPayloadUrls(response)));
  }

  getById(vehicleId: string) {
    return this.http
      .get<VehicleDetail>(`${environment.apiBaseUrl}/vehicles/${vehicleId}`)
      .pipe(map((vehicle) => normalizeApiPayloadUrls(vehicle)));
  }

  getMine() {
    return this.http
      .get<OwnerVehicleItem[]>(`${environment.apiBaseUrl}/vehicles/me`)
      .pipe(map((vehicles) => normalizeApiPayloadUrls(vehicles)));
  }

  create(payload: CreateVehiclePayload) {
    return this.http
      .post<VehicleDetail>(`${environment.apiBaseUrl}/vehicles`, payload)
      .pipe(map((vehicle) => normalizeApiPayloadUrls(vehicle)));
  }

  update(vehicleId: string, payload: UpdateVehiclePayload) {
    return this.http
      .patch<VehicleDetail>(`${environment.apiBaseUrl}/vehicles/${vehicleId}`, payload)
      .pipe(map((vehicle) => normalizeApiPayloadUrls(vehicle)));
  }

  remove(vehicleId: string) {
    return this.http.delete<{ message: string; vehicleId: string }>(
      `${environment.apiBaseUrl}/vehicles/${vehicleId}`,
    );
  }

  uploadImages(vehicleId: string, files: File[]) {
    const formData = new FormData();

    files.forEach((file) => {
      formData.append('files', file);
    });

    return this.http
      .post<VehicleImage[]>(
        `${environment.apiBaseUrl}/vehicles/${vehicleId}/images`,
        formData,
      )
      .pipe(map((images) => normalizeApiPayloadUrls(images)));
  }

  removeImage(vehicleId: string, imageId: string) {
    return this.http.delete<{ message: string }>(
      `${environment.apiBaseUrl}/vehicles/${vehicleId}/images/${imageId}`,
    );
  }
}
