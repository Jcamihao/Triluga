import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { forkJoin } from 'rxjs';
import { AdminApiService } from '../../core/services/admin-api.service';

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-page.component.html',
  styleUrls: ['./admin-page.component.scss'],
})
export class AdminPageComponent {
  private readonly adminApiService = inject(AdminApiService);

  protected dashboard?: { totals: { users: number; vehicles: number; privacyRequests: number } };
  protected users: any[] = [];
  protected vehicles: any[] = [];
  protected privacyRequests: any[] = [];

  constructor() {
    this.loadData();
  }

  protected blockUser(userId: string) {
    this.adminApiService.blockUser(userId).subscribe(() => this.loadData());
  }

  protected approveDocument(userId: string) {
    this.adminApiService.approveUserDocument(userId).subscribe(() => this.loadData());
  }

  protected rejectDocument(userId: string) {
    this.adminApiService.rejectUserDocument(userId).subscribe(() => this.loadData());
  }

  protected approveDriverLicense(userId: string) {
    this.adminApiService.approveUserDriverLicense(userId).subscribe(() => this.loadData());
  }

  protected rejectDriverLicense(userId: string) {
    this.adminApiService.rejectUserDriverLicense(userId).subscribe(() => this.loadData());
  }

  protected verificationLabel(status?: string) {
    const labels: Record<string, string> = {
      APPROVED: 'Aprovado',
      PENDING: 'Em análise',
      REJECTED: 'Recusado',
      NOT_SUBMITTED: 'Não enviado',
    };

    return labels[status || 'NOT_SUBMITTED'] || status || 'Não enviado';
  }

  protected deactivateVehicle(vehicleId: string) {
    this.adminApiService.deactivateVehicle(vehicleId).subscribe(() => this.loadData());
  }

  protected openVerificationFile(userId: string, type: 'document' | 'driverLicense') {
    this.adminApiService.getUserVerificationFileUrl(userId, type).subscribe({
      next: ({ url }) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      },
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

  private loadData() {
    forkJoin({
      dashboard: this.adminApiService.getDashboard(),
      users: this.adminApiService.getUsers(),
      vehicles: this.adminApiService.getVehicles(),
      privacyRequests: this.adminApiService.getPrivacyRequests(),
    }).subscribe(({ dashboard, users, vehicles, privacyRequests }) => {
      this.dashboard = dashboard;
      this.users = users as any[];
      this.vehicles = vehicles as any[];
      this.privacyRequests = privacyRequests as any[];
    });
  }
}
