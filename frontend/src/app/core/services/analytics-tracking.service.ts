import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MostViewedVehiclesResponse } from '../models/domain.models';
import { normalizeApiPayloadUrls } from '../utils/network-url.util';
import { AppLoggerService } from './app-logger.service';
import { PrivacyPreferencesService } from './privacy-preferences.service';

@Injectable({ providedIn: 'root' })
export class AnalyticsTrackingService {
  private readonly http = inject(HttpClient);
  private readonly logger = inject(AppLoggerService);
  private readonly privacyPreferencesService = inject(PrivacyPreferencesService);
  private readonly storage = globalThis.localStorage;
  private readonly sessionStorageRef = globalThis.sessionStorage;

  private readonly visitorIdKey = 'triluga.analytics.visitorId';
  private readonly sessionTrackedKey = 'triluga.analytics.sessionTracked';
  private readonly vehicleViewTrackedKeyPrefix = 'triluga.analytics.vehicleView.';

  trackCurrentSession(path: string) {
    if (!this.privacyPreferencesService.analyticsConsentGranted()) {
      this.logger.debug('analytics', 'visit_skipped_without_consent', { path });
      return;
    }

    if (this.sessionStorageRef.getItem(this.sessionTrackedKey)) {
      return;
    }

    const visitorId = this.getOrCreateVisitorId();

    this.http
      .post(`${environment.apiBaseUrl}/analytics/visits`, {
        visitorId,
        path,
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      })
      .subscribe({
        next: () => {
          this.sessionStorageRef.setItem(this.sessionTrackedKey, '1');
          this.logger.debug('analytics', 'visit_tracked', { path });
        },
        error: (error) => {
          this.logger.warn('analytics', 'visit_track_failed', {
            path,
            message: error?.message ?? 'Erro desconhecido',
          });
        },
      });
  }

  trackVehicleView(vehicleId: string, path: string) {
    if (!this.privacyPreferencesService.analyticsConsentGranted()) {
      this.logger.debug('analytics', 'vehicle_view_skipped_without_consent', {
        vehicleId,
        path,
      });
      return;
    }

    const sessionKey = `${this.vehicleViewTrackedKeyPrefix}${vehicleId}`;

    if (this.sessionStorageRef.getItem(sessionKey)) {
      return;
    }

    const visitorId = this.getOrCreateVisitorId();

    this.http
      .post(`${environment.apiBaseUrl}/analytics/vehicle-views`, {
        vehicleId,
        visitorId,
        path,
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      })
      .subscribe({
        next: () => {
          this.sessionStorageRef.setItem(sessionKey, '1');
          this.logger.debug('analytics', 'vehicle_view_tracked', {
            vehicleId,
            path,
          });
        },
        error: (error) => {
          this.logger.warn('analytics', 'vehicle_view_track_failed', {
            vehicleId,
            path,
            message: error?.message ?? 'Erro desconhecido',
          });
        },
      });
  }

  getMostViewedVehicles(limit = 8, period: 'all' | '30d' | '7d' | 'today' = '30d') {
    return this.http
      .get<MostViewedVehiclesResponse>(
        `${environment.apiBaseUrl}/analytics/vehicles/most-viewed`,
        {
          params: {
            limit,
            period,
          },
        },
      )
      .pipe(
        map((response) => normalizeApiPayloadUrls(response)),
      );
  }

  private getOrCreateVisitorId() {
    const existingVisitorId = this.storage.getItem(this.visitorIdKey);

    if (existingVisitorId) {
      return existingVisitorId;
    }

    const visitorId = crypto.randomUUID();
    this.storage.setItem(this.visitorIdKey, visitorId);

    return visitorId;
  }
}
