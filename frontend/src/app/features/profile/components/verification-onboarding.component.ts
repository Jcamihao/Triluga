import {
  Component,
  EventEmitter,
  Output,
  inject,
  ElementRef,
  ViewChild,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { interval, Subscription, switchMap, take, takeWhile } from 'rxjs';
import { ProfileApiService } from '../../../core/services/profile-api.service';

type VerificationState = 'idle' | 'processing' | 'approved' | 'rejected' | 'pending-review';

@Component({
  selector: 'app-verification-onboarding',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-surface w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">

        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <div>
            <h1 class="text-base font-bold text-on-surface">Verificação de Identidade</h1>
            <p class="text-xs text-on-surface-variant">Passo {{ step }} de 3</p>
          </div>
          <button type="button" (click)="close()" class="p-2 rounded-full hover:bg-surface-container-low transition-colors active:scale-95">
            <span class="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>

        <!-- Progress bar -->
        <div class="bg-surface-container-low h-1">
          <div class="h-1 bg-primary transition-all duration-500" [style.width]="(step / 3 * 100) + '%'"></div>
        </div>

        <!-- Step 1: Documento -->
        <div *ngIf="step === 1" class="p-6 space-y-6">
          <div class="text-center space-y-2">
            <span class="material-symbols-outlined text-5xl text-primary">badge</span>
            <h2 class="text-xl font-bold text-on-surface">Documento de Identidade</h2>
            <p class="text-sm text-on-surface-variant">Envie uma foto clara do seu RG (frente) ou CNH como documento de identidade.</p>
          </div>

          <div *ngIf="!documentPreview" (click)="docInput.click()" class="border-2 border-dashed border-outline-variant/40 rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/50 hover:bg-surface-container-low transition-all">
            <span class="material-symbols-outlined text-4xl text-outline">add_photo_alternate</span>
            <span class="text-sm font-medium text-on-surface-variant">Clique para selecionar ou arraste a imagem</span>
            <span class="text-xs text-outline">PNG, JPG ou WEBP até 5MB</span>
          </div>

          <div *ngIf="documentPreview" class="relative rounded-xl overflow-hidden">
            <img [src]="documentPreview" class="w-full max-h-48 object-cover rounded-xl" alt="Preview do documento" />
            <button type="button" (click)="docInput.click()" class="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80">
              <span class="material-symbols-outlined text-base">edit</span>
            </button>
          </div>

          <input #docInput type="file" accept="image/*" class="sr-only" (change)="onDocumentSelected($event)" />

          <div *ngIf="error" class="flex items-center gap-2 p-3 rounded-lg bg-error-container/20">
            <span class="material-symbols-outlined text-sm text-error">error</span>
            <span class="text-xs text-error font-medium">{{ error }}</span>
          </div>

          <button type="button" [disabled]="!documentFile || uploading" (click)="uploadDocument()" class="w-full py-3 rounded-full bg-primary text-on-primary font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95">
            <span class="material-symbols-outlined text-base animate-spin" *ngIf="uploading">sync</span>
            <span>{{ uploading ? 'Enviando...' : 'Continuar' }}</span>
            <span class="material-symbols-outlined" *ngIf="!uploading">arrow_forward</span>
          </button>
        </div>

        <!-- Step 2: CNH -->
        <div *ngIf="step === 2" class="p-6 space-y-6">
          <div class="text-center space-y-2">
            <span class="material-symbols-outlined text-5xl text-primary">drive_eta</span>
            <h2 class="text-xl font-bold text-on-surface">Carteira de Habilitação (CNH)</h2>
            <p class="text-sm text-on-surface-variant">Envie a frente da sua CNH. Os dados serão verificados pela nossa equipe.</p>
          </div>

          <div *ngIf="!cnhPreview" (click)="cnhInput.click()" class="border-2 border-dashed border-outline-variant/40 rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/50 hover:bg-surface-container-low transition-all">
            <span class="material-symbols-outlined text-4xl text-outline">add_photo_alternate</span>
            <span class="text-sm font-medium text-on-surface-variant">Clique para selecionar ou arraste a imagem</span>
            <span class="text-xs text-outline">PNG, JPG ou WEBP até 5MB</span>
          </div>

          <div *ngIf="cnhPreview" class="relative rounded-xl overflow-hidden">
            <img [src]="cnhPreview" class="w-full max-h-48 object-cover rounded-xl" alt="Preview da CNH" />
            <button type="button" (click)="cnhInput.click()" class="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80">
              <span class="material-symbols-outlined text-base">edit</span>
            </button>
          </div>

          <input #cnhInput type="file" accept="image/*" class="sr-only" (change)="onCnhSelected($event)" />

          <div *ngIf="error" class="flex items-center gap-2 p-3 rounded-lg bg-error-container/20">
            <span class="material-symbols-outlined text-sm text-error">error</span>
            <span class="text-xs text-error font-medium">{{ error }}</span>
          </div>

          <button type="button" [disabled]="!cnhFile || uploading" (click)="uploadCnh()" class="w-full py-3 rounded-full bg-primary text-on-primary font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95">
            <span class="material-symbols-outlined text-base animate-spin" *ngIf="uploading">sync</span>
            <span>{{ uploading ? 'Enviando...' : 'Continuar' }}</span>
            <span class="material-symbols-outlined" *ngIf="!uploading">arrow_forward</span>
          </button>
        </div>

        <!-- Step 3: Selfie -->
        <div *ngIf="step === 3" class="p-6 space-y-4">
          <div class="text-center space-y-2">
            <span class="material-symbols-outlined text-5xl text-primary">face</span>
            <h2 class="text-xl font-bold text-on-surface">Verificação Facial</h2>
            <p class="text-sm text-on-surface-variant">Tire uma selfie com boa iluminação. Seu rosto deve estar centralizado e visível.</p>
          </div>

          <!-- Nenhuma selfie ainda -->
          <ng-container *ngIf="!selfiePreview">
            <!-- Preview da câmera -->
            <div *ngIf="!cameraError" class="relative rounded-xl overflow-hidden bg-black aspect-video">
              <video #videoEl autoplay playsinline muted class="w-full h-full object-cover"></video>
              <canvas #canvasEl class="sr-only"></canvas>
              <!-- Overlay guia facial -->
              <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div class="w-40 h-52 border-4 border-primary/60 rounded-full"></div>
              </div>
            </div>

            <!-- Erro câmera → fallback upload -->
            <div *ngIf="cameraError" class="p-4 rounded-xl bg-surface-container-low text-center space-y-3">
              <span class="material-symbols-outlined text-3xl text-outline">no_photography</span>
              <p class="text-xs text-on-surface-variant">{{ cameraError }}</p>
              <button type="button" (click)="selfieInput.click()" class="px-6 py-2 rounded-full bg-surface-container-high text-on-surface text-sm font-bold">Selecionar foto</button>
            </div>

            <!-- Botão capturar (só se câmera ativa) -->
            <button *ngIf="!cameraError" type="button" (click)="captureSelfie()" class="w-full py-3 rounded-full bg-primary text-on-primary font-bold flex items-center justify-center gap-2 active:scale-95 transition-all">
              <span class="material-symbols-outlined">camera</span>
              Capturar Selfie
            </button>

            <p *ngIf="!cameraError" class="text-center text-xs text-outline">
              Ou <button type="button" (click)="selfieInput.click()" class="underline text-primary">envie uma foto</button>
            </p>
          </ng-container>

          <!-- Preview da selfie capturada -->
          <ng-container *ngIf="selfiePreview">
            <div class="relative rounded-xl overflow-hidden">
              <img [src]="selfiePreview" class="w-full max-h-64 object-cover rounded-xl" alt="Preview da selfie" />
            </div>
            <button type="button" (click)="retakeSelfie()" class="w-full py-2 rounded-full border border-outline-variant/30 text-on-surface text-sm font-medium">Tirar novamente</button>
          </ng-container>

          <!-- Processando -->
          <div *ngIf="verificationState === 'processing'" class="flex items-center gap-3 p-4 rounded-xl bg-surface-container-low border border-outline-variant/30">
            <span class="material-symbols-outlined text-primary animate-spin">sync</span>
            <p class="text-sm font-medium text-on-surface-variant">Analisando seus documentos...</p>
          </div>

          <!-- Aprovado -->
          <div *ngIf="verificationState === 'approved'" class="flex items-center gap-3 p-4 rounded-xl" style="background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.2)">
            <span class="material-symbols-outlined" style="color: #166534; font-variation-settings: 'FILL' 1">verified</span>
            <div>
              <p class="text-sm font-bold" style="color: #166534">Identidade verificada!</p>
              <p class="text-xs" style="color: #166534; opacity: 0.8">Seus documentos foram aprovados com sucesso.</p>
            </div>
          </div>

          <!-- Rejeitado -->
          <div *ngIf="verificationState === 'rejected'" class="flex items-center gap-3 p-4 rounded-xl bg-error-container/20 border border-error-container/30">
            <span class="material-symbols-outlined text-error" style="font-variation-settings: 'FILL' 1">cancel</span>
            <div>
              <p class="text-sm font-bold text-error">Verificação não aprovada</p>
              <p class="text-xs text-error/80">Verifique se as fotos estão nítidas e tente novamente.</p>
            </div>
          </div>

          <!-- Pendente (IA indisponível, revisão manual) -->
          <div *ngIf="verificationState === 'pending-review'" class="flex items-center gap-3 p-4 rounded-xl bg-surface-container-low border border-outline-variant/30">
            <span class="material-symbols-outlined text-primary" style="font-variation-settings: 'FILL' 1">schedule</span>
            <div>
              <p class="text-sm font-bold text-on-surface">Em análise</p>
              <p class="text-xs text-on-surface-variant">Você será notificado por e-mail em até 24h.</p>
            </div>
          </div>

          <input #selfieInput type="file" accept="image/*" class="sr-only" (change)="onSelfieFileSelected($event)" />

          <div *ngIf="error" class="flex items-center gap-2 p-3 rounded-lg bg-error-container/20">
            <span class="material-symbols-outlined text-sm text-error">error</span>
            <span class="text-xs text-error font-medium">{{ error }}</span>
          </div>

          <button *ngIf="selfiePreview && verificationState === 'idle'" type="button" [disabled]="uploading" (click)="uploadSelfie()" class="w-full py-3 rounded-full bg-primary text-on-primary font-bold disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all">
            <span class="material-symbols-outlined text-base animate-spin" *ngIf="uploading">sync</span>
            <span>{{ uploading ? 'Enviando...' : 'Enviar Verificação' }}</span>
            <span class="material-symbols-outlined" *ngIf="!uploading">verified_user</span>
          </button>

          <button *ngIf="verificationState === 'approved' || verificationState === 'rejected' || verificationState === 'pending-review'" type="button" (click)="close()" class="w-full py-3 rounded-full bg-primary text-on-primary font-bold">Concluir</button>
        </div>

      </div>
    </div>
  `,
})
export class VerificationOnboardingComponent implements OnDestroy {
  @Output() closed = new EventEmitter<void>();
  @ViewChild('videoEl') videoEl?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasEl?: ElementRef<HTMLCanvasElement>;

  private readonly profileApi = inject(ProfileApiService);
  private pollSub: Subscription | null = null;

  protected step = 1;
  protected uploading = false;
  protected error = '';
  protected verificationState: VerificationState = 'idle';

  protected documentFile: File | null = null;
  protected documentPreview: string | null = null;
  protected cnhFile: File | null = null;
  protected cnhPreview: string | null = null;

  protected cameraStream: MediaStream | null = null;
  protected cameraError = '';
  protected selfieBlob: Blob | null = null;
  protected selfiePreview: string | null = null;

  ngOnDestroy() {
    this.stopCamera();
    this.pollSub?.unsubscribe();
  }

  protected onDocumentSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (!file || !file.type.startsWith('image/')) return;
    this.documentFile = file;
    this.documentPreview = URL.createObjectURL(file);
  }

  protected onCnhSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (!file || !file.type.startsWith('image/')) return;
    this.cnhFile = file;
    this.cnhPreview = URL.createObjectURL(file);
  }

  protected uploadDocument() {
    if (!this.documentFile) return;
    this.uploading = true;
    this.error = '';
    this.profileApi.uploadMyDocument(this.documentFile).subscribe({
      next: () => {
        this.uploading = false;
        this.step = 2;
      },
      error: () => {
        this.uploading = false;
        this.error = 'Erro ao enviar documento. Tente novamente.';
      },
    });
  }

  protected uploadCnh() {
    if (!this.cnhFile) return;
    this.uploading = true;
    this.error = '';
    this.profileApi.uploadMyDriverLicense(this.cnhFile).subscribe({
      next: () => {
        this.uploading = false;
        this.step = 3;
        this.startCamera();
      },
      error: () => {
        this.uploading = false;
        this.error = 'Erro ao enviar CNH. Tente novamente.';
      },
    });
  }

  protected async startCamera() {
    this.cameraError = '';
    this.selfieBlob = null;
    this.selfiePreview = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
      });
      this.cameraStream = stream;
      setTimeout(() => {
        if (this.videoEl?.nativeElement) {
          this.videoEl.nativeElement.srcObject = stream;
        }
      }, 100);
    } catch {
      this.cameraError =
        'Não foi possível acessar a câmera. Você pode enviar uma foto diretamente.';
    }
  }

  protected captureSelfie() {
    if (!this.videoEl?.nativeElement || !this.canvasEl?.nativeElement) return;
    const video = this.videoEl.nativeElement;
    const canvas = this.canvasEl.nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        this.selfieBlob = blob;
        this.selfiePreview = canvas.toDataURL('image/jpeg');
        this.stopCamera();
      },
      'image/jpeg',
      0.9,
    );
  }

  protected onSelfieFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (!file || !file.type.startsWith('image/')) return;
    this.selfieBlob = file;
    this.selfiePreview = URL.createObjectURL(file);
    this.stopCamera();
  }

  protected retakeSelfie() {
    this.selfieBlob = null;
    this.selfiePreview = null;
    this.startCamera();
  }

  protected uploadSelfie() {
    if (!this.selfieBlob) return;
    this.uploading = true;
    this.error = '';
    const file =
      this.selfieBlob instanceof File
        ? this.selfieBlob
        : new File([this.selfieBlob], 'selfie.jpg', { type: 'image/jpeg' });

    this.profileApi.uploadMySelfie(file).subscribe({
      next: () => {
        this.uploading = false;
        this.verificationState = 'processing';
        this.startPolling();
      },
      error: () => {
        this.uploading = false;
        this.error = 'Erro ao enviar selfie. Tente novamente.';
      },
    });
  }

  private startPolling() {
    const MAX_POLLS = 20; // 20 × 3s = 60s máximo
    let polls = 0;

    this.pollSub = interval(3_000)
      .pipe(
        take(MAX_POLLS),
        switchMap(() => this.profileApi.getMyVerificationStatus()),
        takeWhile((status) => {
          polls++;
          const done =
            status.overallStatus === 'APPROVED' ||
            status.overallStatus === 'REJECTED';
          return !done && polls < MAX_POLLS;
        }, true),
      )
      .subscribe({
        next: (status) => {
          if (status.overallStatus === 'APPROVED') {
            this.verificationState = 'approved';
            this.pollSub?.unsubscribe();
          } else if (status.overallStatus === 'REJECTED') {
            this.verificationState = 'rejected';
            this.pollSub?.unsubscribe();
          }
        },
        complete: () => {
          if (this.verificationState === 'processing') {
            this.verificationState = 'pending-review';
          }
        },
        error: () => {
          if (this.verificationState === 'processing') {
            this.verificationState = 'pending-review';
          }
        },
      });
  }

  protected stopCamera() {
    this.cameraStream?.getTracks().forEach((t) => t.stop());
    this.cameraStream = null;
  }

  protected close() {
    this.stopCamera();
    this.closed.emit();
  }
}
