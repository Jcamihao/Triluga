import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of, switchMap } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { CepLookupService } from '../../core/services/cep-lookup.service';
import { ChatInboxService } from '../../core/services/chat-inbox.service';
import { UiStateService } from '../../core/services/ui-state.service';
import { ProfileApiService } from '../../core/services/profile-api.service';
import { Profile } from '../../core/models/domain.models';
import { WebHeaderComponent } from '../../shared/components/web-header/web-header.component';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, WebHeaderComponent],
  templateUrl: './profile-page.component.html',
  styleUrls: ['./profile-page.component.scss'],
})
export class ProfilePageComponent implements OnDestroy {
  protected readonly authService = inject(AuthService);
  protected readonly chatInboxService = inject(ChatInboxService);
  private readonly cepLookupService = inject(CepLookupService);
  private readonly profileApiService = inject(ProfileApiService);
  private readonly uiStateService = inject(UiStateService);
  private readonly router = inject(Router);
  protected profile: Profile = {
    fullName: '',
    phone: '',
    zipCode: '',
    addressLine: '',
    addressComplement: '',
    city: '',
    state: '',
    bio: '',
  };
  protected loading = true;
  protected saving = false;
  protected feedback = '';
  protected errorMessage = '';
  protected pendingAvatarFile: File | null = null;
  protected pendingDocumentFile: File | null = null;
  protected pendingDriverLicenseFile: File | null = null;
  protected openingDocument = false;
  protected openingDriverLicense = false;
  protected zipCodeHint = '';
  protected zipCodeError = '';
  private avatarPreviewUrl: string | null = null;
  private lastRequestedZipCode = '';

  constructor() {
    this.chatInboxService.ensureReady().subscribe();
    this.loadData();
  }

  ngOnDestroy() {
    this.revokeAvatarPreview();
  }

  protected toggleMenu() {
    this.uiStateService.toggleMenu();
  }

  protected logout() {
    this.authService.logout();
    this.router.navigate(['/']);
  }

  protected get resolvedAvatarUrl() {
    return (
      this.avatarPreviewUrl ||
      this.profile.avatarUrl ||
      this.authService.currentUser()?.profile?.avatarUrl ||
      null
    );
  }

  protected get avatarInitials() {
    const source =
      this.profile.fullName ||
      this.authService.currentUser()?.profile?.fullName ||
      this.authService.currentUser()?.email ||
      'U';

    return source
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  protected get displayName() {
    return (
      this.profile.fullName ||
      this.authService.currentUser()?.profile?.fullName ||
      'Meu perfil'
    );
  }

  protected get profileCompletion() {
    const checks = [
      this.profile.fullName,
      this.profile.phone,
      this.profile.city,
      this.profile.state,
      this.profile.bio,
      this.profile.avatarUrl || this.pendingAvatarFile,
      this.profile.documentNumber,
      this.profile.driverLicenseNumber,
      this.profile.hasDocumentImage || this.pendingDocumentFile,
      this.profile.hasDriverLicenseImage || this.pendingDriverLicenseFile,
    ];

    return Math.round(
      (checks.filter(Boolean).length / checks.length) * 100,
    );
  }

  protected get memberSinceLabel() {
    const currentUser = this.authService.currentUser();
    const createdAt =
      currentUser && 'createdAt' in currentUser ? currentUser.createdAt : null;

    if (!createdAt) {
      return 'Membro Triluga';
    }

    const date = new Date(createdAt);

    if (Number.isNaN(date.getTime())) {
      return 'Membro Triluga';
    }

    return `Membro desde ${date.getFullYear()}`;
  }

  protected get locationLabel() {
    const parts = [this.profile.city, this.profile.state].filter(Boolean);
    return parts.length ? parts.join(', ') : 'Localização não informada';
  }

  protected get verificationRows() {
    return [
      {
        title: 'Email Verificado',
        description: this.authService.currentUser()?.email || 'Email da conta',
        status: 'approved',
        icon: 'check_circle',
      },
      {
        title: 'Documento',
        description: this.verificationStatusLabel(
          this.profile.documentVerificationStatus,
        ),
        status:
          this.profile.documentVerificationStatus === 'APPROVED'
            ? 'approved'
            : 'pending',
        icon:
          this.profile.documentVerificationStatus === 'APPROVED'
            ? 'check_circle'
            : 'error',
      },
      {
        title: 'CNH',
        description: this.verificationStatusLabel(
          this.profile.driverLicenseVerification,
        ),
        status:
          this.profile.driverLicenseVerification === 'APPROVED'
            ? 'approved'
            : 'pending',
        icon:
          this.profile.driverLicenseVerification === 'APPROVED'
            ? 'check_circle'
            : 'error',
      },
    ];
  }

  protected get unreadChatBadge() {
    const count = this.chatInboxService.unreadCount();
    return count > 99 ? '99+' : String(count);
  }

  protected save() {
    this.saving = true;
    this.feedback = '';
    this.errorMessage = '';
    const pendingAvatarFile = this.pendingAvatarFile;
    const pendingDocumentFile = this.pendingDocumentFile;
    const pendingDriverLicenseFile = this.pendingDriverLicenseFile;

    this.profileApiService
      .updateMyProfile(this.buildEditableProfile(this.profile))
      .pipe(
        switchMap((profile) => {
          const uploads = {
            profile: of(profile),
            avatar: pendingAvatarFile
              ? this.profileApiService.uploadMyAvatar(pendingAvatarFile)
              : of(null),
            document: pendingDocumentFile
              ? this.profileApiService.uploadMyDocument(pendingDocumentFile)
              : of(null),
            driverLicense: pendingDriverLicenseFile
              ? this.profileApiService.uploadMyDriverLicense(
                  pendingDriverLicenseFile,
                )
              : of(null),
          };

          return forkJoin(uploads);
        }),
      )
      .subscribe({
        next: ({ profile, avatar, document, driverLicense }) => {
          const normalizedProfile = this.buildEditableProfile({
            ...this.profile,
            ...profile,
            ...avatar,
            ...document,
            ...driverLicense,
          });

          this.profile = normalizedProfile;
          this.authService.syncProfile(normalizedProfile);
          this.pendingAvatarFile = null;
          this.pendingDocumentFile = null;
          this.pendingDriverLicenseFile = null;
          this.revokeAvatarPreview();
          this.feedback =
            pendingAvatarFile || pendingDocumentFile || pendingDriverLicenseFile
              ? 'Perfil e arquivos atualizados com sucesso.'
              : 'Perfil atualizado com sucesso.';
          this.saving = false;
        },
        error: (error) => {
          this.errorMessage = this.resolveErrorMessage(error);
          this.saving = false;
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
      this.errorMessage = 'Selecione uma imagem válida para a foto de perfil.';
      input.value = '';
      return;
    }

    this.errorMessage = '';
    this.pendingAvatarFile = file;
    this.setAvatarPreview(file);
    input.value = '';
  }

  protected onDocumentSelected(event: Event) {
    this.pendingDocumentFile = this.extractImageFile(
      event,
      'Selecione uma imagem válida para o documento.',
    );
  }

  protected onDriverLicenseSelected(event: Event) {
    this.pendingDriverLicenseFile = this.extractImageFile(
      event,
      'Selecione uma imagem válida para a CNH.',
    );
  }

  protected verificationStatusLabel(
    status?: Profile['documentVerificationStatus'],
  ) {
    const labels = {
      APPROVED: 'Aprovado',
      PENDING: 'Em análise',
      REJECTED: 'Recusado',
      NOT_SUBMITTED: 'Não enviado',
    } as const;

    return labels[status || 'NOT_SUBMITTED'] || 'Não enviado';
  }

  protected formatState(value: string) {
    return String(value ?? '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 2);
  }

  protected onZipCodeChange(value: string) {
    this.profile.zipCode = this.cepLookupService.formatZipCode(value);
    const zipCodeDigits = (this.profile.zipCode || '').replace(/\D/g, '');

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

    this.cepLookupService.lookup(this.profile.zipCode || '').subscribe({
      next: (address) => {
        if ((this.profile.zipCode || '').replace(/\D/g, '') !== zipCodeDigits) {
          return;
        }

        this.profile.zipCode = address.zipCode || this.profile.zipCode;
        this.profile.addressLine =
          address.addressLine || this.profile.addressLine;
        this.profile.city = address.city || this.profile.city;
        this.profile.state = address.state || this.profile.state;

        if (!this.profile.addressComplement?.trim() && address.addressComplement) {
          this.profile.addressComplement = address.addressComplement;
        }

        this.zipCodeHint =
          address.addressLine || address.city || address.state
            ? 'Endereço preenchido automaticamente.'
            : 'CEP encontrado. Complete os detalhes restantes manualmente.';
        this.zipCodeError = '';
      },
      error: () => {
        if ((this.profile.zipCode || '').replace(/\D/g, '') !== zipCodeDigits) {
          return;
        }

        this.zipCodeHint = '';
        this.zipCodeError =
          'Não foi possível localizar esse CEP. Você pode preencher o endereço manualmente.';
      },
    });
  }

  private loadData() {
    this.loading = true;
    this.errorMessage = '';

    this.profileApiService.getMyProfile().subscribe({
      next: (profile) => {
        this.profile = this.buildEditableProfile({
          ...this.profile,
          ...profile,
        });
        this.errorMessage = '';
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = this.resolveErrorMessage(
          error,
          'Não foi possível carregar seu perfil.',
        );
        this.loading = false;
      },
    });
  }

  private buildEditableProfile(profile: Partial<Profile>): Profile {
    return {
      fullName: profile.fullName ?? '',
      phone: profile.phone ?? '',
      zipCode: profile.zipCode ?? '',
      addressLine: profile.addressLine ?? '',
      addressComplement: profile.addressComplement ?? '',
      city: profile.city ?? '',
      state: this.formatState(profile.state ?? ''),
      bio: profile.bio ?? '',
      avatarUrl: profile.avatarUrl ?? null,
      documentNumber: profile.documentNumber ?? null,
      driverLicenseNumber: profile.driverLicenseNumber ?? null,
      documentImageUrl: profile.documentImageUrl ?? null,
      driverLicenseImageUrl: profile.driverLicenseImageUrl ?? null,
      hasDocumentImage: profile.hasDocumentImage ?? false,
      hasDriverLicenseImage: profile.hasDriverLicenseImage ?? false,
      documentVerificationStatus:
        profile.documentVerificationStatus ?? 'NOT_SUBMITTED',
      driverLicenseVerification:
        profile.driverLicenseVerification ?? 'NOT_SUBMITTED',
    };
  }

  protected openVerificationFile(type: 'document' | 'driverLicense') {
    const request$ =
      type === 'document'
        ? this.profileApiService.getMyDocumentUrl()
        : this.profileApiService.getMyDriverLicenseUrl();

    if (type === 'document') {
      this.openingDocument = true;
    } else {
      this.openingDriverLicense = true;
    }

    request$.subscribe({
      next: ({ url }) => {
        window.open(url, '_blank', 'noopener,noreferrer');
        this.openingDocument = false;
        this.openingDriverLicense = false;
      },
      error: (error) => {
        this.errorMessage = this.resolveErrorMessage(
          error,
          'Não foi possível abrir o arquivo solicitado.',
        );
        this.openingDocument = false;
        this.openingDriverLicense = false;
      },
    });
  }

  private resolveErrorMessage(
    error: unknown,
    fallback = 'Não foi possível salvar seu perfil.',
  ) {
    const message = (error as { error?: { message?: string | string[] } })
      ?.error?.message;

    if (Array.isArray(message)) {
      return message.join('. ');
    }

    return message || fallback;
  }

  private setAvatarPreview(file: File) {
    this.revokeAvatarPreview();
    this.avatarPreviewUrl = URL.createObjectURL(file);
  }

  private extractImageFile(event: Event, errorMessage: string) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      return null;
    }

    if (!file.type.startsWith('image/')) {
      this.errorMessage = errorMessage;
      input.value = '';
      return null;
    }

    this.errorMessage = '';
    input.value = '';
    return file;
  }

  private revokeAvatarPreview() {
    if (!this.avatarPreviewUrl) {
      return;
    }

    URL.revokeObjectURL(this.avatarPreviewUrl);
    this.avatarPreviewUrl = null;
  }
}
