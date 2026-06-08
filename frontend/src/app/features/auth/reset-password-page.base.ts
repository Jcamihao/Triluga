import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { WebHeaderComponent } from '../../shared/components/web-header/web-header.component';

export const RESET_PASSWORD_IMPORTS = [CommonModule, FormsModule, RouterLink, WebHeaderComponent];

@Component({ template: '' })
export abstract class ResetPasswordPageBase implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  protected readonly router = inject(Router);

  protected token = '';
  protected newPassword = '';
  protected confirmPassword = '';
  protected showPassword = false;
  protected loading = false;
  protected feedback = '';
  protected feedbackType: 'error' | 'success' = 'error';
  protected submitted = false;
  protected tokenMissing = false;

  ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.tokenMissing = true;
    }
  }

  get passwordsMatch(): boolean {
    return !this.confirmPassword || this.newPassword === this.confirmPassword;
  }

  get isFormValid(): boolean {
    return (
      this.newPassword.length >= 8 &&
      this.newPassword === this.confirmPassword &&
      !!this.token
    );
  }

  protected submit() {
    if (!this.isFormValid) return;

    this.loading = true;
    this.feedback = '';

    this.authService.resetPassword(this.token, this.newPassword).subscribe({
      next: () => {
        this.loading = false;
        this.submitted = true;
        this.feedbackType = 'success';
        this.feedback = 'Senha redefinida com sucesso! Você já pode fazer login com a nova senha.';
      },
      error: (err) => {
        this.loading = false;
        this.feedbackType = 'error';
        const msg = err?.error?.message ?? '';
        this.feedback = msg.includes('inválido') || msg.includes('expirado')
          ? 'Este link expirou ou já foi utilizado. Solicite um novo.'
          : 'Não foi possível redefinir sua senha. Tente novamente.';
      },
    });
  }
}
