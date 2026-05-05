import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface SearchAlertItem {
  id: string;
  title?: string | null;
  filters: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class SearchAlertsApiService {
  private readonly http = inject(HttpClient);

  create(payload: { title?: string; filters: Record<string, unknown> }) {
    return this.http.post<SearchAlertItem>(
      `${environment.apiBaseUrl}/search-alerts`,
      payload,
    );
  }

  listMine(includeInactive = false) {
    return this.http.get<SearchAlertItem[]>(
      `${environment.apiBaseUrl}/search-alerts/my`,
      {
        params: {
          includeInactive,
        },
      },
    );
  }

  remove(alertId: string) {
    return this.http.delete<{ message: string; alertId: string }>(
      `${environment.apiBaseUrl}/search-alerts/${alertId}`,
    );
  }
}
