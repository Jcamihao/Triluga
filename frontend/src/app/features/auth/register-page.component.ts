import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { CepLookupService } from '../../core/services/cep-lookup.service';
import { ProfileApiService } from '../../core/services/profile-api.service';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register-page.component.html',
  styleUrls: ['./register-page.component.scss'],
})
export class RegisterPageComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly profileApiService = inject(ProfileApiService);
  private readonly cepLookupService = inject(CepLookupService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected fullName = 'Novo Usuário';
  protected phone = '';
  protected zipCode = '';
  protected addressLine = '';
  protected addressComplement = '';
  protected city = 'São Paulo';
  protected state = 'SP';
  protected email = '';
  protected password = '';
  protected confirmPassword = '';
  protected showPassword = false;
  protected showConfirmPassword = false;
  protected loading = false;
  protected feedback = '';
  protected zipCodeHint = '';
  protected zipCodeError = '';
  protected pendingAvatarFile: File | null = null;
  private avatarPreviewUrl: string | null = null;
  private lastRequestedZipCode = '';

  ngOnDestroy() {
    this.revokeAvatarPreview();
  }

  protected get resolvedAvatarUrl() {
    return this.avatarPreviewUrl;
  }

  protected get avatarInitials() {
    const source = this.fullName.trim() || 'U';

    return source
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  protected onZipCodeChange(value: string) {
    this.zipCode = this.cepLookupService.formatZipCode(value);
    const zipCodeDigits = this.zipCode.replace(/\D/g, '');

    if (zipCodeDigits.length < 8) {
      this.lastRequestedZipCode = '';
      this.zipCodeHint = '';
      this.zipCodeError = '';
      return;
    }

    if (zipCodeDigits === this.lastRequestedZipCode) {
      return;
    }

    this.lastRequestedZipCode = zipCodeDigits;
    this.zipCodeHint = 'Buscando endereço pelo CEP...';
    this.zipCodeError = '';

    this.cepLookupService
      .lookup(this.zipCode)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (address) => {
          if (this.zipCode.replace(/\D/g, '') !== zipCodeDigits) {
            return;
          }

          this.zipCode = address.zipCode || this.zipCode;
          this.addressLine = address.addressLine || this.addressLine;
          this.city = address.city || this.city;
          this.state = address.state || this.state;

          if (!this.addressComplement.trim() && address.addressComplement) {
            this.addressComplement = address.addressComplement;
          }

          this.zipCodeHint =
            address.addressLine || address.city || address.state
              ? 'Endereço preenchido automaticamente.'
              : 'CEP encontrado. Complete os detalhes restantes manualmente.';
          this.zipCodeError = '';
        },
        error: () => {
          if (this.zipCode.replace(/\D/g, '') !== zipCodeDigits) {
            return;
          }

          this.zipCodeHint = '';
          this.zipCodeError =
            'Não foi possível localizar esse CEP. Você pode preencher o endereço manualmente.';
        },
      });
  }

  protected formatPhone(value: string) {
    const digits = value.replace(/\D/g, '');
    const hasCountryCodePrefix = value.trim().startsWith('+55');
    const normalized = (
      hasCountryCodePrefix || (digits.length > 11 && digits.startsWith('55'))
        ? digits.slice(2)
        : digits
    ).slice(0, 11);

    if (!normalized) {
      return '';
    }

    const areaCode = normalized.slice(0, 2);
    const subscriberNumber = normalized.slice(2);
    const prefixLength = subscriberNumber.length > 8 ? 5 : 4;
    const prefix = subscriberNumber.slice(0, prefixLength);
    const suffix = subscriberNumber.slice(prefixLength, prefixLength + 4);

    let formatted = '+55';

    if (areaCode) {
      formatted += ` (${areaCode}`;

      if (areaCode.length === 2) {
        formatted += ')';
      }
    }

    if (prefix) {
      formatted += ` ${prefix}`;
    }

    if (suffix) {
      formatted += `-${suffix}`;
    }

    return formatted;
  }

  protected formatState(value: string) {
    return value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2);
  }

  protected register() {
    const normalizedFullName = this.fullName.trim();
    const normalizedAddressLine = this.addressLine.trim();
    const normalizedCity = this.city.trim();
    const normalizedState = this.formatState(this.state);
    const normalizedEmail = this.email.trim();

    if (
      !normalizedFullName ||
      !this.phone ||
      !this.zipCode ||
      !normalizedAddressLine ||
      !normalizedCity ||
      !normalizedState ||
      !normalizedEmail
    ) {
      this.feedback = 'Preencha os campos obrigatórios para criar sua conta.';
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.feedback = 'A confirmação de senha precisa ser igual à senha digitada.';
      return;
    }

    this.loading = true;
    this.feedback = '';
    const pendingAvatarFile = this.pendingAvatarFile;
    const redirectPath = '/anunciar-carro';

    this.authService
      .register({
        fullName: normalizedFullName,
        phone: this.phone,
        zipCode: this.zipCode,
        addressLine: normalizedAddressLine,
        addressComplement: this.addressComplement.trim() || undefined,
        city: normalizedCity,
        state: normalizedState,
        email: normalizedEmail,
        password: this.password,
      })
      .pipe(
        switchMap(() => {
          if (!pendingAvatarFile) {
            return of(null);
          }

          return this.profileApiService.uploadMyAvatar(pendingAvatarFile).pipe(
            tap((profile) => {
              this.authService.syncProfile(profile);
            }),
            catchError(() => of(null)),
          );
        }),
      )
      .subscribe({
        next: () => {
          this.loading = false;
          this.pendingAvatarFile = null;
          this.revokeAvatarPreview();
          this.router.navigate([redirectPath]);
        },
        error: (error) => {
          this.loading = false;
          this.feedback = error?.error?.message || 'Não foi possível criar a conta.';
        },
      });
  }

  protected onAvatarSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.feedback = 'Selecione uma imagem válida para a foto de perfil.';
      input.value = '';
      return;
    }

    this.feedback = '';
    this.pendingAvatarFile = file;
    this.setAvatarPreview(file);
    input.value = '';
  }

  private setAvatarPreview(file: File) {
    this.revokeAvatarPreview();
    this.avatarPreviewUrl = URL.createObjectURL(file);
  }

  private revokeAvatarPreview() {
    if (!this.avatarPreviewUrl) {
      return;
    }

    URL.revokeObjectURL(this.avatarPreviewUrl);
    this.avatarPreviewUrl = null;
  }
}
