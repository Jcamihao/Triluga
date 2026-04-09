import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, tap, catchError, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AppLoggerService } from './app-logger.service';
import { PrivacyPreferencesService } from './privacy-preferences.service';

interface PopularVehicle {
  vehicleId: string;
  visitCount: number;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsTrackingService {
  private readonly http = inject(HttpClient);
  private readonly logger = inject(AppLoggerService);
  private readonly privacyPreferencesService = inject(PrivacyPreferencesService);
  private readonly storage = globalThis.localStorage;
  private readonly sessionStorageRef = globalThis.sessionStorage;

  private readonly visitorIdKey = 'triluga.analytics.visitorId';
  private readonly sessionTrackedKey = 'triluga.analytics.sessionTracked';

  readonly popularVehicleIds = signal<string[]>([]);

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

  trackVehicleView(vehicleId: string) {
    if (!this.privacyPreferencesService.analyticsConsentGranted()) {
      return;
    }

    const visitorId = this.getOrCreateVisitorId();

    this.http
      .post(`${environment.apiBaseUrl}/analytics/vehicle-views`, {
        visitorId,
        vehicleId,
      })
      .subscribe({
        next: () =>
          this.logger.debug('analytics', 'vehicle_view_tracked', { vehicleId }),
        error: () => undefined,
      });
  }

  loadPopularVehicleIds(limit = 6): Observable<string[]> {
    return this.http
      .get<PopularVehicle[]>(
        `${environment.apiBaseUrl}/analytics/popular-vehicles`,
        { params: { limit: String(limit) } },
      )
      .pipe(
        map((items) => items.map((item) => item.vehicleId)),
        tap((ids) => this.popularVehicleIds.set(ids)),
        catchError((error) => {
          this.logger.warn('analytics', 'popular_vehicles_load_failed', {
            message: error?.message ?? 'Erro desconhecido',
          });
          return of([]);
        }),
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
