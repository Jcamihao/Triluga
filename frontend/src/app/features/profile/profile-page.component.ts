import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { of, switchMap } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ProfileApiService } from '../../core/services/profile-api.service';
import { Profile } from '../../core/models/domain.models';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="page profile-page">
      <section class="profile-card">
        <div class="profile-card__hero">
          <div class="avatar-preview avatar-preview--large" [class.avatar-preview--filled]="resolvedAvatarUrl">
            <img *ngIf="resolvedAvatarUrl; else profileInitialsAvatar" [src]="resolvedAvatarUrl" alt="Foto de perfil" />

            <ng-template #profileInitialsAvatar>
              <span>{{ avatarInitials }}</span>
            </ng-template>
          </div>

          <div>
            <span class="eyebrow">Perfil</span>
            <h1>{{ authService.currentUser()?.profile?.fullName || 'Meu perfil' }}</h1>
            <p>{{ authService.currentUser()?.email }}</p>
          </div>
        </div>
      </section>

      <section class="loading-card" *ngIf="loading">
        <strong>Carregando seu perfil...</strong>
        <p>Estamos buscando seus dados da conta.</p>
      </section>

      <section class="profile-form" *ngIf="!loading">
        <div class="avatar-section">
          <div>
            <strong>Foto de perfil</strong>
            <p>Ela aparece no chat e ajuda a deixar sua conta mais confiável.</p>
          </div>

          <label class="upload-trigger">
            <input type="file" accept="image/*" (change)="onAvatarSelected($event)" />
            <span class="material-icons" aria-hidden="true">photo_camera</span>
            <span>{{ pendingAvatarFile ? 'Trocar foto' : 'Adicionar foto' }}</span>
          </label>
        </div>

        <p class="file-hint" *ngIf="pendingAvatarFile">
          Nova foto selecionada: {{ pendingAvatarFile.name }}
        </p>

        <label><span>Nome completo</span><input [(ngModel)]="profile.fullName" /></label>
        <label><span>Telefone</span><input [(ngModel)]="profile.phone" /></label>
        <label><span>Bio</span><textarea [(ngModel)]="profile.bio" rows="4"></textarea></label>
        <button type="button" class="btn btn-primary" (click)="save()" [disabled]="saving">
          {{ saving ? 'Salvando...' : 'Salvar perfil' }}
        </button>
        <p class="feedback" *ngIf="feedback">{{ feedback }}</p>
        <p class="feedback feedback--error" *ngIf="errorMessage">{{ errorMessage }}</p>
      </section>
    </main>
  `,
  styles: [
    `
      .profile-page {
        display: grid;
        gap: 18px;
        padding: 20px 16px 32px;
      }

      .profile-card,
      .loading-card,
      .profile-form {
        display: grid;
        gap: 14px;
        min-width: 0;
        padding: 20px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid var(--glass-border);
        box-shadow: var(--shadow-soft);
      }

      .profile-card__hero,
      .avatar-section {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      }

      .eyebrow {
        color: var(--primary);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }

      h1,
      p,
      strong {
        margin: 0;
      }

      h1 {
        overflow-wrap: anywhere;
      }

      p {
        color: var(--text-secondary);
      }

      label {
        display: grid;
        gap: 8px;
      }

      .avatar-preview {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        border-radius: 50%;
        background: linear-gradient(180deg, rgba(31, 140, 255, 0.18) 0%, rgba(31, 140, 255, 0.08) 100%);
        color: var(--primary);
        font-weight: 800;
        box-shadow: inset 0 0 0 1px rgba(31, 140, 255, 0.16);
      }

      .avatar-preview--large {
        width: 92px;
        height: 92px;
        font-size: 28px;
      }

      .avatar-preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .upload-trigger {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 46px;
        padding: 0 16px;
        border-radius: 16px;
        border: 1px solid rgba(31, 140, 255, 0.18);
        background: rgba(31, 140, 255, 0.08);
        color: var(--primary);
        font-weight: 700;
        cursor: pointer;
      }

      .upload-trigger input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }

      .upload-trigger .material-icons {
        font-size: 18px;
      }

      .file-hint {
        margin: 0;
        color: var(--text-secondary);
        font-size: 13px;
      }

      input,
      textarea {
        width: 100%;
        min-width: 0;
        border: 1px solid var(--glass-border-soft);
        border-radius: 14px;
        padding: 12px 14px;
        font: inherit;
        background: var(--surface-muted);
      }

      .feedback {
        margin: 0;
      }

      .feedback {
        color: var(--success);
        font-weight: 600;
      }

      .feedback--error {
        color: var(--error);
      }

      @media (max-width: 480px) {
        .profile-page {
          padding: 16px 12px 24px;
        }

        .profile-card,
        .loading-card,
        .profile-form {
          padding: 18px 16px;
          border-radius: 20px;
        }

        .profile-card__hero,
        .avatar-section {
          align-items: flex-start;
        }
      }
    `,
  ],
})
export class ProfilePageComponent implements OnDestroy {
  protected readonly authService = inject(AuthService);
  private readonly profileApiService = inject(ProfileApiService);
  protected profile: Profile = {
    fullName: '',
    phone: '',
    city: '',
    state: '',
    bio: '',
  };
  protected loading = true;
  protected saving = false;
  protected feedback = '';
  protected errorMessage = '';
  protected pendingAvatarFile: File | null = null;
  private avatarPreviewUrl: string | null = null;

  constructor() {
    this.loadData();
  }

  ngOnDestroy() {
    this.revokeAvatarPreview();
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

  protected save() {
    this.saving = true;
    this.feedback = '';
    this.errorMessage = '';
    const pendingAvatarFile = this.pendingAvatarFile;

    this.profileApiService
      .updateMyProfile(this.buildEditableProfile(this.profile))
      .pipe(
        switchMap((profile) => {
          if (!pendingAvatarFile) {
            return of(profile);
          }

          return this.profileApiService.uploadMyAvatar(pendingAvatarFile);
        }),
      )
      .subscribe({
        next: (profile) => {
          const normalizedProfile = this.buildEditableProfile({
            ...this.profile,
            ...profile,
          });

          this.profile = normalizedProfile;
          this.authService.syncProfile(normalizedProfile);
          this.pendingAvatarFile = null;
          this.revokeAvatarPreview();
          this.feedback = pendingAvatarFile
            ? 'Perfil e foto atualizados com sucesso.'
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
        this.errorMessage = this.resolveErrorMessage(error, 'Não foi possível carregar seu perfil.');
        this.loading = false;
      },
    });
  }

  private buildEditableProfile(profile: Partial<Profile>): Profile {
    return {
      fullName: profile.fullName ?? '',
      phone: profile.phone ?? '',
      city: profile.city ?? '',
      state: profile.state ?? '',
      bio: profile.bio ?? '',
      avatarUrl: profile.avatarUrl ?? null,
      documentNumber: profile.documentNumber ?? null,
      driverLicenseNumber: profile.driverLicenseNumber ?? null,
    };
  }

  private resolveErrorMessage(
    error: unknown,
    fallback = 'Não foi possível salvar seu perfil.',
  ) {
    const message = (error as { error?: { message?: string | string[] } })?.error
      ?.message;

    if (Array.isArray(message)) {
      return message.join('. ');
    }

    return message || fallback;
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
