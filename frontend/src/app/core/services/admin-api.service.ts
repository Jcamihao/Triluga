import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);

  getDashboard() {
    return this.http.get<{
      totals: { users: number; vehicles: number; privacyRequests: number };
    }>(`${environment.apiBaseUrl}/admin/dashboard`);
  }

  getUsers() {
    return this.http.get(`${environment.apiBaseUrl}/admin/users`);
  }

  getVehicles() {
    return this.http.get(`${environment.apiBaseUrl}/admin/vehicles`);
  }

  blockUser(userId: string) {
    return this.http.patch(
      `${environment.apiBaseUrl}/admin/users/${userId}/block`,
      {},
    );
  }

  deleteUser(userId: string) {
    return this.http.delete(`${environment.apiBaseUrl}/admin/users/${userId}`);
  }

  deactivateVehicle(vehicleId: string) {
    return this.http.patch(
      `${environment.apiBaseUrl}/admin/vehicles/${vehicleId}/deactivate`,
      {},
    );
  }

  deleteVehicle(vehicleId: string) {
    return this.http.delete(`${environment.apiBaseUrl}/admin/vehicles/${vehicleId}`);
  }

  getPrivacyRequests() {
    return this.http.get(`${environment.apiBaseUrl}/admin/privacy/requests`);
  }

  updatePrivacyRequest(
    requestId: string,
    status: string,
    resolutionNotes?: string,
  ) {
    return this.http.patch(
      `${environment.apiBaseUrl}/admin/privacy/requests/${requestId}`,
      { status, resolutionNotes },
    );
  }

  getFeaturedOrders(status?: string) {
    return this.http.get<any[]>(
      `${environment.apiBaseUrl}/admin/featured-orders`,
      status ? { params: { status } } : {},
    );
  }

  activateFeaturedOrder(orderId: string) {
    return this.http.patch(
      `${environment.apiBaseUrl}/admin/featured-orders/${orderId}/activate`,
      {},
    );
  }

  getOverview(period: 'today' | '7d' | '30d' | 'all' = '7d') {
    return this.http.get<any>(
      `${environment.apiBaseUrl}/admin/overview`,
      { params: { period } },
    );
  }

  getReports(status?: string, page = 1) {
    const params: Record<string, string> = { page: String(page) };
    if (status) params['status'] = status;
    return this.http.get<{ total: number; page: number; limit: number; items: any[] }>(
      `${environment.apiBaseUrl}/admin/reports`,
      { params },
    );
  }

  getOpenReportsCount() {
    return this.http.get<number>(`${environment.apiBaseUrl}/admin/reports/count`);
  }

  getAuditLogs(page = 1, limit = 50) {
    return this.http.get<{ total: number; page: number; limit: number; items: any[] }>(
      `${environment.apiBaseUrl}/admin/audit-logs`,
      { params: { page: String(page), limit: String(limit) } },
    );
  }

  resolveReport(reportId: string, action: 'DISMISS' | 'RESOLVE', adminNotes?: string) {
    return this.http.patch(
      `${environment.apiBaseUrl}/admin/reports/${reportId}/resolve`,
      { action, adminNotes },
    );
  }
}
