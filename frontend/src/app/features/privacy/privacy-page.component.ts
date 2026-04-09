import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { PrivacyPolicySummary } from '../../core/models/domain.models';
import { PrivacyApiService } from '../../core/services/privacy-api.service';

@Component({
  selector: 'app-privacy-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './privacy-page.component.html',
  styleUrls: ['./privacy-page.component.scss'],
})
export class PrivacyPageComponent {
  protected readonly authService = inject(AuthService);
  private readonly privacyApiService = inject(PrivacyApiService);
  protected policy: PrivacyPolicySummary | null = null;
  protected loading = true;

  constructor() {
    this.privacyApiService.getPolicy().subscribe({
      next: (policy) => {
        this.policy = policy;
        this.loading = false;
      },
      error: () => {
        this.policy = {
          version: '2026-03-27',
          contactEmail: 'privacidade@triluga.local',
          sections: [
            {
              title: 'Dados coletados',
              summary:
                'Cadastro, autenticação, perfil, anúncios, reservas, suporte, notificações e preferências de privacidade.',
            },
            {
              title: 'Finalidades',
              summary:
                'Operar o marketplace, cumprir obrigações regulatórias, prevenir fraude, atender suporte e executar reservas.',
            },
          ],
        };
        this.loading = false;
      },
    });
  }
}
