import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { WebHeaderComponent } from '../../shared/components/web-header/web-header.component';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, WebHeaderComponent],
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.scss'],
})
export class LoginPageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected email = '';
  protected password = '';
  protected loading = false;
  protected feedback = '';
  protected showPassword = false;
  protected rememberMe = false;

  protected showPasswordRecoveryMessage(event?: Event) {
    event?.preventDefault();
    this.feedback =
      'Recuperação de senha ainda não está disponível. Entre em contato com o suporte.';
  }

  protected showSocialLoginMessage(provider: string) {
    this.feedback = `Login com ${provider} ainda não está disponível. Use e-mail e senha.`;
  }

  protected login() {
    this.loading = true;
    this.feedback = '';

    this.authService
      .login({
        email: this.email,
        password: this.password,
        rememberMe: this.rememberMe,
      })
      .subscribe({
        next: () => {
          this.loading = false;
          this.router.navigate(['/']);
        },
        error: (error) => {
          this.loading = false;
          this.feedback = error?.error?.message || 'Falha ao autenticar.';
        },
      });
  }
}
