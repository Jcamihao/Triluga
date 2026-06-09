import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';

type State = 'loading' | 'success' | 'error' | 'already';

@Component({
  selector: 'app-verify-email-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-surface px-4">
      <div class="w-full max-w-md text-center">

        <p class="text-4xl font-black italic tracking-tight text-primary mb-8">Triluga</p>

        <div class="bg-white rounded-2xl shadow-sm p-10 space-y-6">

          <!-- Loading -->
          <ng-container *ngIf="state === 'loading'">
            <span class="material-symbols-outlined text-5xl text-primary animate-spin block">sync</span>
            <p class="text-on-surface-variant font-medium">Verificando seu email...</p>
          </ng-container>

          <!-- Success -->
          <ng-container *ngIf="state === 'success'">
            <span class="material-symbols-outlined text-6xl text-primary block"
              style="font-variation-settings:'FILL' 1">check_circle</span>
            <h1 class="text-2xl font-extrabold text-on-surface">Email confirmado!</h1>
            <p class="text-on-surface-variant">Sua conta está ativa. Agora você pode anunciar e usar todas as funcionalidades do Triluga.</p>
            <a routerLink="/"
              class="block w-full py-4 rounded-full bg-primary text-on-primary font-bold text-base text-center">
              Ir para o início
            </a>
          </ng-container>

          <!-- Already verified -->
          <ng-container *ngIf="state === 'already'">
            <span class="material-symbols-outlined text-6xl text-primary block"
              style="font-variation-settings:'FILL' 1">verified</span>
            <h1 class="text-2xl font-extrabold text-on-surface">Email já verificado</h1>
            <p class="text-on-surface-variant">Seu email já foi confirmado anteriormente. Tudo certo!</p>
            <a routerLink="/"
              class="block w-full py-4 rounded-full bg-primary text-on-primary font-bold text-base text-center">
              Ir para o início
            </a>
          </ng-container>

          <!-- Error -->
          <ng-container *ngIf="state === 'error'">
            <span class="material-symbols-outlined text-6xl text-error block"
              style="font-variation-settings:'FILL' 1">cancel</span>
            <h1 class="text-2xl font-extrabold text-on-surface">Link inválido ou expirado</h1>
            <p class="text-on-surface-variant">Este link de verificação não é mais válido. Solicite um novo na sua área de perfil.</p>
            <a routerLink="/profile"
              class="block w-full py-4 rounded-full bg-primary text-on-primary font-bold text-base text-center">
              Ir para meu perfil
            </a>
          </ng-container>

        </div>
      </div>
    </div>
  `,
})
export class VerifyEmailPageComponent implements OnInit {
  protected state: State = 'loading';

  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token) {
      this.state = 'error';
      return;
    }

    this.http
      .get<{ success: boolean; alreadyVerified: boolean }>(
        `${environment.apiBaseUrl}/auth/verify-email?token=${token}`,
      )
      .subscribe({
        next: (res) => {
          this.state = res.alreadyVerified ? 'already' : 'success';

          // Atualiza a sessão do frontend para refletir emailVerified: true localmente.
          // Isso evita requisições de refresh que podem ser canceladas se o usuário
          // fechar a aba rapidamente, causando um logout acidental.
          if (this.authService.isAuthenticated()) {
            this.authService.markEmailAsVerified();
          }
        },
        error: () => {
          this.state = 'error';
        },
      });
  }
}

