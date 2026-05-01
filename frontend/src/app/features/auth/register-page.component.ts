import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { CepLookupService } from '../../core/services/cep-lookup.service';
import { ProfileApiService } from '../../core/services/profile-api.service';
import { WebHeaderComponent } from '../../shared/components/web-header/web-header.component';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, WebHeaderComponent],
  templateUrl: './register-page.component.html',
  styleUrls: ['./register-page.component.scss'],
})
export class RegisterPageComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly profileApiService = inject(ProfileApiService);
  private readonly cepLookupService = inject(CepLookupService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected fullName = '';
  protected phone = '';
  protected zipCode = '';
  protected addressLine = '';
  protected addressComplement = '';
  protected city = 'São Paulo';
  protected state = 'SP';
  protected cpf = '';
  protected birthDate = '';
  protected email = '';
  protected password = '';
  protected confirmPassword = '';
  protected showPassword = false;
  protected showConfirmPassword = false;
  protected emailTouched = false;
  protected cpfTouched = false;
  protected phoneTouched = false;
  protected zipCodeTouched = false;
  protected birthDateTouched = false;
  protected passwordTouched = false;
  protected loading = false;
  protected feedback = '';
  protected zipCodeHint = '';
  protected zipCodeError = '';
  protected acceptedTerms = false;
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

  protected get passwordStrengthChecklist() {
    return [
      {
        label: 'Mínimo de 8 caracteres',
        valid: this.password.length >= 8,
      },
      {
        label: 'Letra maiúscula',
        valid: /[A-ZÀ-Ý]/.test(this.password),
      },
      {
        label: 'Número',
        valid: /\d/.test(this.password),
      },
      {
        label: 'Caractere especial',
        valid: /[^A-Za-zÀ-ÿ0-9]/.test(this.password),
      },
    ];
  }

  protected get passwordStrengthCount() {
    return this.passwordStrengthChecklist.filter((item) => item.valid).length;
  }

  protected get passwordStrengthPercent() {
    return `${Math.round((this.passwordStrengthCount / 4) * 100)}%`;
  }

  protected get passwordStrengthLabel() {
    if (!this.password) {
      return 'Informe uma senha';
    }

    if (this.passwordStrengthCount === 4) {
      return 'Senha forte';
    }

    if (this.passwordStrengthCount >= 2) {
      return 'Senha média';
    }

    return 'Senha fraca';
  }

  protected get passwordStrengthBarClass() {
    if (this.passwordStrengthCount === 4) {
      return 'bg-gradient-to-r from-primary to-primary-container';
    }

    if (this.passwordStrengthCount >= 2) {
      return 'bg-[#f59e0b]';
    }

    return 'bg-error';
  }

  protected get passwordStrengthTextClass() {
    if (this.passwordStrengthCount === 4) {
      return 'text-primary';
    }

    if (this.passwordStrengthCount >= 2) {
      return 'text-[#f59e0b]';
    }

    return 'text-error';
  }

  protected get confirmPasswordTouched() {
    return !!this.confirmPassword;
  }

  protected get emailIsValid() {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(this.email.trim());
  }

  protected get shouldShowEmailValidation() {
    return this.emailTouched && !!this.email.trim();
  }

  protected get cpfIsValid() {
    const digits = this.cpf.replace(/\D/g, '');

    if (!digits) {
      return false;
    }

    if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) {
      return false;
    }

    const numbers = digits.split('').map(Number);
    const firstDigit = this.calculateCpfDigit(numbers.slice(0, 9));
    const secondDigit = this.calculateCpfDigit([
      ...numbers.slice(0, 9),
      firstDigit,
    ]);

    return firstDigit === numbers[9] && secondDigit === numbers[10];
  }

  protected get shouldShowCpfValidation() {
    return this.cpfTouched && !!this.cpf.trim();
  }

  protected get phoneIsValid() {
    const digits = this.phone.replace(/\D/g, '');
    const normalized = digits.startsWith('55') ? digits.slice(2) : digits;

    return normalized.length === 10 || normalized.length === 11;
  }

  protected get shouldShowPhoneValidation() {
    return this.phoneTouched && !!this.phone.trim();
  }

  protected get zipCodeIsValid() {
    const digits = this.zipCode.replace(/\D/g, '');

    return (
      digits.length === 8 &&
      !this.zipCodeError &&
      this.lastRequestedZipCode === digits &&
      this.zipCodeHint !== 'Buscando endereço pelo CEP...'
    );
  }

  protected get shouldShowZipCodeValidation() {
    return this.zipCodeTouched && !!this.zipCode.trim();
  }

  protected get birthDateIsValid() {
    const birthDate = this.parseBirthDate(this.birthDate);

    if (!birthDate) {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (birthDate > today) {
      return false;
    }

    const minimumDate = new Date(
      today.getFullYear() - 18,
      today.getMonth(),
      today.getDate(),
    );

    return birthDate <= minimumDate;
  }

  protected get shouldShowBirthDateValidation() {
    return this.birthDateTouched && !!this.birthDate.trim();
  }

  protected get passwordsMatch() {
    return !!this.confirmPassword && this.password === this.confirmPassword;
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
    return value
      .replace(/[^A-Za-z]/g, '')
      .toUpperCase()
      .slice(0, 2);
  }

  protected formatCpf(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    const parts = [
      digits.slice(0, 3),
      digits.slice(3, 6),
      digits.slice(6, 9),
      digits.slice(9, 11),
    ].filter(Boolean);

    if (parts.length <= 1) {
      return parts[0] ?? '';
    }

    return `${parts.slice(0, 3).join('.')}${parts[3] ? `-${parts[3]}` : ''}`;
  }

  private calculateCpfDigit(numbers: number[]) {
    const factorStart = numbers.length + 1;
    const sum = numbers.reduce(
      (total, number, index) => total + number * (factorStart - index),
      0,
    );
    const rest = (sum * 10) % 11;

    return rest === 10 ? 0 : rest;
  }

  private parseBirthDate(value: string) {
    const normalized = value.trim();
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
    const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(normalized);

    const parts = isoMatch
      ? {
          year: Number(isoMatch[1]),
          month: Number(isoMatch[2]),
          day: Number(isoMatch[3]),
        }
      : brMatch
        ? {
            year: Number(brMatch[3]),
            month: Number(brMatch[2]),
            day: Number(brMatch[1]),
          }
        : null;

    if (!parts) {
      return null;
    }

    const date = new Date(parts.year, parts.month - 1, parts.day);
    date.setHours(0, 0, 0, 0);

    if (
      date.getFullYear() !== parts.year ||
      date.getMonth() !== parts.month - 1 ||
      date.getDate() !== parts.day
    ) {
      return null;
    }

    return date;
  }

  protected register() {
    const normalizedFullName = this.fullName.trim();
    const normalizedAddressLine = this.addressLine.trim();
    const normalizedCity = this.city.trim();
    const normalizedState = this.formatState(this.state);
    const normalizedEmail = this.email.trim();
    const normalizedCpf = this.cpf.replace(/\D/g, '');
    const normalizedAddressComplement = this.addressComplement.trim();

    if (
      !normalizedFullName ||
      !this.pendingAvatarFile ||
      !normalizedCpf ||
      !this.phone ||
      !this.birthDate ||
      !this.zipCode ||
      !normalizedAddressLine ||
      !normalizedAddressComplement ||
      !normalizedCity ||
      !normalizedState ||
      !normalizedEmail
    ) {
      this.feedback = 'Preencha os campos obrigatórios para criar sua conta.';
      return;
    }

    if (!this.emailIsValid) {
      this.feedback = 'Digite um e-mail válido.';
      this.emailTouched = true;
      return;
    }

    if (!this.cpfIsValid) {
      this.feedback = 'Digite um CPF válido.';
      this.cpfTouched = true;
      return;
    }

    if (!this.phoneIsValid) {
      this.feedback = 'Digite um telefone válido.';
      this.phoneTouched = true;
      return;
    }

    if (!this.zipCodeIsValid) {
      this.feedback = 'Digite um CEP válido.';
      this.zipCodeTouched = true;
      return;
    }

    if (!this.birthDateIsValid) {
      this.feedback =
        'Informe uma data de nascimento válida. Você precisa ter pelo menos 18 anos.';
      this.birthDateTouched = true;
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.feedback =
        'A confirmação de senha precisa ser igual à senha digitada.';
      return;
    }

    if (this.passwordStrengthCount < 4) {
      this.feedback =
        'A senha precisa ter no mínimo 8 caracteres, letra maiúscula, número e caractere especial.';
      return;
    }

    if (!this.acceptedTerms) {
      this.feedback =
        'Aceite os termos de uso e a política LGPD para continuar.';
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
        documentNumber: normalizedCpf,
        zipCode: this.zipCode,
        addressLine: normalizedAddressLine,
        addressComplement: normalizedAddressComplement,
        city: normalizedCity,
        state: normalizedState,
        email: normalizedEmail,
        password: this.password,
      })
      .pipe(
        switchMap(() => {
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
          this.feedback =
            error?.error?.message || 'Não foi possível criar a conta.';
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
