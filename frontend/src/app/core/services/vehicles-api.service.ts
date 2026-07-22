import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateVehiclePayload,
  OwnerVehicleItem,
  ReportReason,
  UpdateVehiclePayload,
  VehicleCardItem,
  VehicleDetail,
  VehicleImage,
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

  getStats() {
    return this.http.get<{
      luxury: number;
      sport: number;
      electric: number;
      motorcycle: number;
      suvPickup: number;
    }>(`${environment.apiBaseUrl}/vehicles/stats`);
  }

  create(payload: CreateVehiclePayload) {
    return this.http
      .post<VehicleDetail>(
        `${environment.apiBaseUrl}/vehicles`,
        this.toVehicleApiPayload(payload),
      )
      .pipe(map((vehicle) => normalizeApiPayloadUrls(vehicle)));
  }

  update(vehicleId: string, payload: UpdateVehiclePayload) {
    return this.http
      .patch<VehicleDetail>(
        `${environment.apiBaseUrl}/vehicles/${vehicleId}`,
        this.toVehicleApiPayload(payload),
      )
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
      .post<
        VehicleImage[]
      >(`${environment.apiBaseUrl}/vehicles/${vehicleId}/images`, formData)
      .pipe(map((images) => normalizeApiPayloadUrls(images)));
  }

  removeImage(vehicleId: string, imageId: string) {
    return this.http.delete<{ message: string }>(
      `${environment.apiBaseUrl}/vehicles/${vehicleId}/images/${imageId}`,
    );
  }

  getOwnerMetrics(vehicleId: string) {
    return this.http.get<{
      vehicleId: string;
      title: string;
      totalViews: number;
      favoritesCount: number;
      contactsCount: number;
      recentViewsCount: number;
      createdAt: string;
    }>(`${environment.apiBaseUrl}/vehicles/${vehicleId}/metrics`);
  }

  getSimilar(vehicleId: string) {
    return this.http
      .get<VehicleCardItem[]>(`${environment.apiBaseUrl}/vehicles/${vehicleId}/similar`)
      .pipe(map((vehicles) => normalizeApiPayloadUrls(vehicles)));
  }

  createReport(vehicleId: string, reason: ReportReason, description?: string) {
    return this.http.post<{ message: string }>(
      `${environment.apiBaseUrl}/reports`,
      { vehicleId, reason, description },
    );
  }

  private toVehicleApiPayload(
    payload: CreateVehiclePayload | UpdateVehiclePayload,
  ) {
    const allowedPayload: UpdateVehiclePayload = {
      title: payload.title,
      brand: payload.brand,
      model: payload.model,
      year: payload.year,
      plate: payload.plate,
      city: payload.city,
      state: payload.state,
      vehicleType: payload.vehicleType,
      category: payload.category,
      transmission: payload.transmission,
      fuelType: payload.fuelType,
      seats: payload.seats,
      weeklyRate: payload.weeklyRate,
      kmPolicy: payload.kmPolicy,
      motorcycleStyle: payload.motorcycleStyle,
      engineCc: payload.engineCc,
      hasAbs: payload.hasAbs,
      hasTopCase: payload.hasTopCase,
      hasInsurance: payload.hasInsurance,
      mechanicsCondition: payload.mechanicsCondition,
      hasDetranIssues: payload.hasDetranIssues,
      trunkSize: payload.trunkSize,
      description: payload.description,
      addressLine: payload.addressLine,
      latitude: payload.latitude,
      longitude: payload.longitude,
      isPublished: payload.isPublished,
    };

    return Object.fromEntries(
      Object.entries(allowedPayload).filter(([, value]) => value !== undefined),
    );
  }
}
