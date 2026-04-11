import { CommonModule, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  PrivacyCenterOverview,
  PrivacyRequestItem,
  PrivacyRequestType,
} from '../../core/models/domain.models';
import { PrivacyApiService } from '../../core/services/privacy-api.service';
import { PrivacyPreferencesService } from '../../core/services/privacy-preferences.service';

@Component({
  selector: 'app-privacy-center-page',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './privacy-center-page.component.html',
  styleUrls: ['./privacy-center-page.component.scss'],
})
export class PrivacyCenterPageComponent {
  private readonly privacyApiService = inject(PrivacyApiService);
  protected readonly privacyPreferencesService = inject(PrivacyPreferencesService);
  protected overview: PrivacyCenterOverview | null = null;
  protected readonly requestTypeOptions: PrivacyRequestType[] = [
    'ACCESS',
    'PORTABILITY',
    'CORRECTION',
    'DELETION',
    'ANONYMIZATION',
    'RESTRICTION',
    'OBJECTION',
    'REVOCATION',
  ];
  protected selectedRequestType: PrivacyRequestType = 'ACCESS';
  protected requestNotes = '';
  protected loading = true;
  protected savingPreferences = false;
  protected exporting = false;
  protected submittingRequest = false;
  protected feedback = '';
  protected errorMessage = '';

  constructor() {
    this.loadData();
  }

  protected setAnalyticsConsent(granted: boolean) {
    this.savingPreferences = true;
    this.feedback = '';
    this.errorMessage = '';

    this.privacyApiService.updateMyPreferences(granted).subscribe({
      next: (preferences) => {
        this.privacyPreferencesService.hydrateAnalyticsConsent(
          preferences.analyticsConsentGranted,
        );
        if (this.overview) {
          this.overview = {
            ...this.overview,
            preferences,
          };
        }
        this.feedback = 'Preferências de privacidade atualizadas com sucesso.';
        this.savingPreferences = false;
      },
      error: (error) => {
        this.errorMessage =
          error?.error?.message || 'Não foi possível atualizar suas preferências.';
        this.savingPreferences = false;
      },
    });
  }

  protected exportMyData() {
    this.exporting = true;
    this.feedback = '';
    this.errorMessage = '';

    this.privacyApiService.exportMyData().subscribe({
      next: (payload) => {
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `triluga-privacy-export-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        this.feedback = 'Exportação gerada com sucesso.';
        this.exporting = false;
      },
      error: (error) => {
        this.errorMessage =
          error?.error?.message || 'Não foi possível exportar seus dados.';
        this.exporting = false;
      },
    });
  }

  protected submitRequest() {
    this.submittingRequest = true;
    this.feedback = '';
    this.errorMessage = '';

    this.privacyApiService
      .createRequest(this.selectedRequestType, this.requestNotes.trim() || undefined)
      .subscribe({
        next: (request) => {
          this.overview = this.prependRequest(request, this.overview);
          this.requestNotes = '';
          this.feedback = 'Solicitação registrada com sucesso.';
          this.submittingRequest = false;
        },
        error: (error) => {
          this.errorMessage =
            error?.error?.message || 'Não foi possível registrar sua solicitação.';
          this.submittingRequest = false;
        },
      });
  }

  protected requestTypeLabel(type: PrivacyRequestType) {
    const labels: Record<PrivacyRequestType, string> = {
      ACCESS: 'Acesso aos dados',
      PORTABILITY: 'Portabilidade',
      DELETION: 'Exclusão',
      CORRECTION: 'Correção',
      RESTRICTION: 'Restrição de tratamento',
      OBJECTION: 'Oposição',
      ANONYMIZATION: 'Anonimização',
      REVOCATION: 'Revogação de consentimento',
    };

    return labels[type] || type;
  }

  protected requestStatusLabel(status: PrivacyRequestItem['status']) {
    const labels = {
      OPEN: 'Aberta',
      IN_REVIEW: 'Em análise',
      COMPLETED: 'Concluída',
      REJECTED: 'Recusada',
      CANCELLED: 'Cancelada',
    } as const;

    return labels[status] || status;
  }

  private loadData() {
    this.loading = true;
    this.privacyApiService.getMyPrivacyCenter().subscribe({
      next: (overview) => {
        this.overview = overview;
        this.privacyPreferencesService.hydrateAnalyticsConsent(
          overview.preferences.analyticsConsentGranted,
        );
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage =
          error?.error?.message || 'Não foi possível carregar sua central de privacidade.';
        this.loading = false;
      },
    });
  }

  private prependRequest(
    request: PrivacyRequestItem,
    overview: PrivacyCenterOverview | null,
  ) {
    if (!overview) {
      return overview;
    }

    return {
      ...overview,
      requests: [request, ...overview.requests],
    };
  }
}
