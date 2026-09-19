import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApiService } from '../../core/services/admin-api.service';
import { WebHeaderComponent } from '../../shared/components/web-header/web-header.component';

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule, WebHeaderComponent],
  templateUrl: './admin-page.component.html',
  styleUrls: ['./admin-page.component.scss'],
})
export class AdminPageComponent {
  private readonly adminApiService = inject(AdminApiService);

  protected activeTab: 'overview' | 'manage' | 'audit' = 'overview';

  protected dashboard?: {
    totals: { users: number; vehicles: number; privacyRequests: number };
  };
  protected users: any[] = [];
  protected vehicles: any[] = [];
  protected privacyRequests: any[] = [];

  protected userSearch = '';
  protected deletingUserId: string | null = null;
  protected deleteUserConfirmId: string | null = null;

  protected vehicleSearch = '';
  protected vehicleStatusFilter: 'all' | 'active' | 'inactive' = 'all';
  protected deletingVehicleId: string | null = null;
  protected deleteConfirmId: string | null = null;

  protected get filteredUsers(): any[] {
    const q = this.userSearch.toLowerCase().trim();
    if (!q) return this.users;
    return this.users.filter((u) =>
      u.profile?.fullName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.profile?.city?.toLowerCase().includes(q),
    );
  }

  protected get filteredVehicles(): any[] {
    const q = this.vehicleSearch.toLowerCase().trim();
    return this.vehicles.filter((v) => {
      const matchesSearch = !q ||
        v.title?.toLowerCase().includes(q) ||
        v.city?.toLowerCase().includes(q) ||
        v.owner?.profile?.fullName?.toLowerCase().includes(q) ||
        v.owner?.email?.toLowerCase().includes(q);
      const matchesStatus =
        this.vehicleStatusFilter === 'all' ||
        (this.vehicleStatusFilter === 'active' && v.isActive && v.isPublished) ||
        (this.vehicleStatusFilter === 'inactive' && (!v.isActive || !v.isPublished));
      return matchesSearch && matchesStatus;
    });
  }
  protected featuredOrders: any[] = [];
  protected activatingOrderId: string | null = null;
  protected featuredFilter: 'ALL' | 'PENDING' | 'ACTIVE' | 'EXPIRED' = 'ALL';

  protected overview: any = null;
  protected overviewPeriod: 'today' | '7d' | '30d' | 'all' = '7d';

  protected reports: any[] = [];
  protected reportsTotal = 0;
  protected reportsPage = 1;
  protected openReportsCount = 0;
  protected reportFilter = '';
  protected resolvingReportId: string | null = null;
  protected reportNotesMap: Record<string, string> = {};

  protected auditLogs: any[] = [];
  protected auditLogsTotal = 0;
  protected auditLogsPage = 1;
  protected auditLogsLoading = false;

  constructor() {
    this.loadData();
  }

  protected blockUser(userId: string) {
    this.adminApiService.blockUser(userId).subscribe(() => this.loadData());
  }

  protected confirmDeleteUser(userId: string) {
    this.deleteUserConfirmId = userId;
  }

  protected cancelDeleteUser() {
    this.deleteUserConfirmId = null;
  }

  protected deleteUser(userId: string) {
    if (this.deletingUserId) return;
    this.deletingUserId = userId;
    this.deleteUserConfirmId = null;
    this.adminApiService.deleteUser(userId).subscribe({
      next: () => {
        this.deletingUserId = null;
        this.loadData();
      },
      error: () => { this.deletingUserId = null; },
    });
  }

  protected deactivateVehicle(vehicleId: string) {
    this.adminApiService
      .deactivateVehicle(vehicleId)
      .subscribe(() => this.loadData());
  }

  protected confirmDelete(vehicleId: string) {
    this.deleteConfirmId = vehicleId;
  }

  protected cancelDelete() {
    this.deleteConfirmId = null;
  }

  protected deleteVehicle(vehicleId: string) {
    if (this.deletingVehicleId) return;
    this.deletingVehicleId = vehicleId;
    this.deleteConfirmId = null;
    this.adminApiService.deleteVehicle(vehicleId).subscribe({
      next: () => {
        this.deletingVehicleId = null;
        this.loadData();
      },
      error: () => { this.deletingVehicleId = null; },
    });
  }

  protected updatePrivacyRequest(requestId: string, status: string) {
    this.adminApiService
      .updatePrivacyRequest(requestId, status)
      .subscribe(() => this.loadData());
  }

  protected privacyRequestTypeLabel(type: string) {
    const labels: Record<string, string> = {
      ACCESS: 'Acesso',
      PORTABILITY: 'Portabilidade',
      DELETION: 'Exclusão',
      CORRECTION: 'Correção',
      RESTRICTION: 'Restrição',
      OBJECTION: 'Oposição',
      ANONYMIZATION: 'Anonimização',
      REVOCATION: 'Revogação',
    };

    return labels[type] || type;
  }

  protected privacyRequestStatusLabel(status: string) {
    const labels: Record<string, string> = {
      OPEN: 'Aberta',
      IN_REVIEW: 'Em análise',
      COMPLETED: 'Concluída',
      REJECTED: 'Recusada',
      CANCELLED: 'Cancelada',
    };

    return labels[status] || status;
  }

  protected activateFeaturedOrder(orderId: string) {
    if (this.activatingOrderId) return;
    this.activatingOrderId = orderId;
    this.adminApiService.activateFeaturedOrder(orderId).subscribe({
      next: () => {
        this.activatingOrderId = null;
        this.loadFeaturedOrders();
      },
      error: () => { this.activatingOrderId = null; },
    });
  }

  protected setFeaturedFilter(f: 'ALL' | 'PENDING' | 'ACTIVE' | 'EXPIRED') {
    this.featuredFilter = f;
    this.loadFeaturedOrders();
  }

  protected featuredStatusLabel(status: string) {
    const map: Record<string, string> = {
      PENDING: 'Pendente', ACTIVE: 'Ativo', EXPIRED: 'Expirado', CANCELLED: 'Cancelado',
    };
    return map[status] ?? status;
  }

  protected featuredStatusClass(status: string) {
    const map: Record<string, string> = {
      PENDING: 'bg-amber-100 text-amber-700',
      ACTIVE: 'bg-emerald-100 text-emerald-700',
      EXPIRED: 'bg-surface-container-high text-on-surface-variant',
      CANCELLED: 'bg-error/10 text-error',
    };
    return map[status] ?? '';
  }

  private loadFeaturedOrders() {
    const status = this.featuredFilter === 'ALL' ? undefined : this.featuredFilter;
    this.adminApiService.getFeaturedOrders(status).subscribe((orders) => {
      this.featuredOrders = orders;
    });
  }

  protected setOverviewPeriod(period: 'today' | '7d' | '30d' | 'all') {
    this.overviewPeriod = period;
    this.loadOverview();
  }

  protected auditActionLabel(action: string) {
    const map: Record<string, string> = {
      user_blocked: 'Usuário bloqueado',
      user_deleted: 'Usuário excluído',
      document_approved: 'Documento aprovado',
      document_rejected: 'Documento recusado',
      driver_license_approved: 'CNH aprovada',
      driver_license_rejected: 'CNH recusada',
      vehicle_deactivated: 'Veículo desativado',
      vehicle_deleted: 'Veículo excluído',
    };
    return map[action] ?? action.replace(/_/g, ' ');
  }

  protected auditActionClass(action: string) {
    if (action.includes('deleted') || action.includes('rejected')) {
      return 'bg-red-100 text-red-700';
    }
    if (action.includes('blocked') || action.includes('deactivated')) {
      return 'bg-amber-100 text-amber-700';
    }
    if (action.includes('approved')) {
      return 'bg-emerald-100 text-emerald-700';
    }
    return 'bg-surface-container-high text-on-surface-variant';
  }

  protected loadAuditLogs(page = 1) {
    this.auditLogsPage = page;
    this.auditLogsLoading = true;
    this.adminApiService.getAuditLogs(page).subscribe({
      next: (res) => {
        this.auditLogs = res.items;
        this.auditLogsTotal = res.total;
        this.auditLogsLoading = false;
      },
      error: () => { this.auditLogsLoading = false; },
    });
  }

  protected get auditLogsTotalPages() {
    return Math.ceil(this.auditLogsTotal / 50);
  }

  protected setReportFilter(status: string) {
    this.reportFilter = status;
    this.reportsPage = 1;
    this.loadReports();
  }

  protected resolveReport(reportId: string, action: 'DISMISS' | 'RESOLVE') {
    if (this.resolvingReportId) return;
    this.resolvingReportId = reportId;
    const notes = this.reportNotesMap[reportId];
    this.adminApiService.resolveReport(reportId, action, notes).subscribe({
      next: () => {
        this.resolvingReportId = null;
        this.loadReports();
        this.loadOpenReportsCount();
      },
      error: () => { this.resolvingReportId = null; },
    });
  }

  protected reportStatusLabel(status: string) {
    const map: Record<string, string> = {
      OPEN: 'Aberto', REVIEWING: 'Em revisão', RESOLVED: 'Resolvido', DISMISSED: 'Descartado',
    };
    return map[status] ?? status;
  }

  protected reportStatusClass(status: string) {
    const map: Record<string, string> = {
      OPEN: 'bg-red-100 text-red-700',
      REVIEWING: 'bg-amber-100 text-amber-700',
      RESOLVED: 'bg-emerald-100 text-emerald-700',
      DISMISSED: 'bg-surface-container-high text-on-surface-variant',
    };
    return map[status] ?? '';
  }

  protected reportReasonLabel(reason: string) {
    const map: Record<string, string> = {
      FRAUD: 'Fraude', INAPPROPRIATE: 'Conteúdo inadequado', WRONG_INFO: 'Informação incorreta',
      DUPLICATE: 'Anúncio duplicado', OTHER: 'Outro',
    };
    return map[reason] ?? reason;
  }

  private loadReports() {
    const status = this.reportFilter || undefined;
    this.adminApiService.getReports(status, this.reportsPage).subscribe((res) => {
      this.reports = res.items;
      this.reportsTotal = res.total;
    });
  }

  private loadOpenReportsCount() {
    this.adminApiService.getOpenReportsCount().subscribe((count) => {
      this.openReportsCount = count;
    });
  }

  private loadOverview() {
    this.adminApiService.getOverview(this.overviewPeriod).subscribe((data) => {
      this.overview = data;
      this.openReportsCount = data.openReports ?? 0;
    });
  }

  private extractList(res: unknown): any[] {
    if (Array.isArray(res)) return res;
    if (res && typeof res === 'object') {
      const paged = res as any;
      if (Array.isArray(paged.items)) return paged.items;
    }
    return [];
  }

  private loadData() {
    this.adminApiService.getDashboard().subscribe({
      next: (d) => { this.dashboard = d; },
      error: () => {},
    });
    this.adminApiService.getUsers().subscribe({
      next: (res) => { this.users = this.extractList(res); },
      error: () => {},
    });
    this.adminApiService.getVehicles().subscribe({
      next: (res) => { this.vehicles = this.extractList(res); },
      error: () => {},
    });
    this.adminApiService.getPrivacyRequests().subscribe({
      next: (res) => { this.privacyRequests = this.extractList(res); },
      error: () => {},
    });
    this.loadFeaturedOrders();
    this.loadReports();
    this.loadOverview();
    this.loadAuditLogs();
  }
}
