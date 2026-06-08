import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { WebHeaderComponent } from '../../shared/components/web-header/web-header.component';

export const FORGOT_PASSWORD_IMPORTS = [CommonModule, FormsModule, RouterLink, WebHeaderComponent];

@Component({ template: '' })
export abstract class ForgotPasswordPageBase {
  private readonly authService = inject(AuthService);
  protected readonly router = inject(Router);

  protected email = '';
  protected loading = false;
  protected feedback = '';
  protected feedbackType: 'error' | 'success' = 'error';
  protected submitted = false;

  protected submit() {
    if (!this.email.trim()) return;

    this.loading = true;
    this.feedback = '';

    this.authService.forgotPassword(this.email.trim()).subscribe({
      next: () => {
        this.loading = false;
        this.submitted = true;
        this.feedbackType = 'success';
        this.feedback = `Se existe uma conta com ${this.email}, você receberá um e-mail com as instruções em breve.`;
      },
      error: () => {
        this.loading = false;
        this.feedbackType = 'error';
        this.feedback = 'Não foi possível processar sua solicitação. Tente novamente.';
      },
    });
  }
}
