import { CommonModule, DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Booking,
  BookingChecklist,
  BookingChecklistType,
} from '../../core/models/domain.models';
import { BookingsApiService } from '../../core/services/bookings-api.service';

type ChecklistDraft = {
  items: string[];
  notes: string;
  files: File[];
  markComplete: boolean;
};

@Component({
  selector: 'app-booking-checklist-card',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <section class="booking-checklists" *ngIf="visibleChecklistTypes.length">
      <article
        class="booking-checklist"
        *ngFor="let type of visibleChecklistTypes; trackBy: trackByType"
      >
        <div class="booking-checklist__head">
          <div>
            <strong>{{ typeTitle(type) }}</strong>
            <p>{{ typeDescription(type) }}</p>
          </div>

          <span
            class="booking-checklist__status"
            [class.booking-checklist__status--done]="checklistFor(type)?.completedAt"
          >
            {{
              checklistFor(type)?.completedAt ? 'Concluído' : 'Em andamento'
            }}
          </span>
        </div>

        <p class="booking-checklist__meta" *ngIf="checklistFor(type)?.completedAt">
          Última confirmação em
          {{ checklistFor(type)?.completedAt | date: 'dd/MM/yyyy HH:mm' }}
        </p>

        <div class="booking-checklist__items">
          <label
            class="booking-checklist__item"
            *ngFor="let item of checklistItems(type); trackBy: trackByString"
          >
            <input
              type="checkbox"
              [checked]="isChecked(type, item)"
              [disabled]="!canEdit(type) || isSubmitting(type)"
              (change)="toggleItem(type, item, $any($event.target).checked)"
            />
            <span>{{ item }}</span>
          </label>
        </div>

        <label class="booking-checklist__field">
          <span>Observações</span>
          <textarea
            rows="3"
            [disabled]="!canEdit(type) || isSubmitting(type)"
            [ngModel]="draftFor(type).notes"
            (ngModelChange)="updateNotes(type, $event)"
            placeholder="Anote combustível, pequenos sinais, entrega de chave ou algo relevante."
          ></textarea>
        </label>

        <div
          class="booking-checklist__photos"
          *ngIf="checklistFor(type)?.photos?.length"
        >
          <a
            class="booking-checklist__photo"
            *ngFor="let photo of checklistFor(type)?.photos || []; trackBy: trackByPhoto"
            [href]="photo.url"
            target="_blank"
            rel="noreferrer"
          >
            <img [src]="photo.url" alt="Foto do checklist" />
          </a>
        </div>

        <div class="booking-checklist__pending-files" *ngIf="draftFor(type).files.length">
          <strong>{{ draftFor(type).files.length }} foto(s) pronta(s) para envio</strong>
          <p>{{ pendingFileNames(type) }}</p>
        </div>

        <label class="booking-checklist__upload" *ngIf="canEdit(type)">
          <input
            type="file"
            accept="image/*"
            multiple
            [disabled]="isSubmitting(type)"
            (change)="selectFiles(type, $event)"
          />
          <span>Adicionar fotos</span>
          <small>Até 6 imagens por atualização.</small>
        </label>

        <label class="booking-checklist__complete" *ngIf="canEdit(type)">
          <input
            type="checkbox"
            [checked]="draftFor(type).markComplete"
            [disabled]="isSubmitting(type)"
            (change)="setMarkComplete(type, $any($event.target).checked)"
          />
          <span>Marcar esse checklist como concluído</span>
        </label>

        <p class="feedback" *ngIf="feedbackByType[type]">{{ feedbackByType[type] }}</p>
        <p class="feedback feedback--error" *ngIf="errorByType[type]">
          {{ errorByType[type] }}
        </p>

        <button
          type="button"
          class="btn btn-secondary"
          *ngIf="canEdit(type)"
          [disabled]="isSubmitting(type)"
          (click)="save(type)"
        >
          {{ isSubmitting(type) ? 'Salvando checklist...' : 'Salvar checklist' }}
        </button>
      </article>
    </section>
  `,
  styles: [
    `
      .booking-checklists {
        display: grid;
        gap: 12px;
      }

      .booking-checklist {
        display: grid;
        gap: 12px;
        padding: 14px;
        border-radius: 18px;
        background: rgba(88, 181, 158, 0.06);
        border: 1px solid rgba(88, 181, 158, 0.12);
      }

      .booking-checklist__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }

      .booking-checklist__head strong,
      .booking-checklist__head p,
      .booking-checklist__meta,
      .booking-checklist__pending-files p,
      .booking-checklist__pending-files strong {
        margin: 0;
      }

      .booking-checklist__head p,
      .booking-checklist__meta,
      .booking-checklist__pending-files p {
        color: var(--text-secondary);
      }

      .booking-checklist__status {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 0 12px;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.12);
        color: var(--text-secondary);
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
      }

      .booking-checklist__status--done {
        background: rgba(34, 197, 94, 0.12);
        color: var(--success);
      }

      .booking-checklist__items {
        display: grid;
        gap: 8px;
      }

      .booking-checklist__item {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 42px;
        padding: 0 12px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.84);
        border: 1px solid rgba(88, 181, 158, 0.12);
      }

      .booking-checklist__field {
        display: grid;
        gap: 8px;
      }

      .booking-checklist__field span,
      .booking-checklist__complete span,
      .booking-checklist__pending-files strong {
        font-size: 13px;
        font-weight: 700;
      }

      .booking-checklist__field textarea {
        width: 100%;
        min-width: 0;
        border: 1px solid var(--glass-border-soft);
        border-radius: 14px;
        padding: 12px 14px;
        font: inherit;
        background: rgba(255, 255, 255, 0.92);
        resize: vertical;
      }

      .booking-checklist__photos {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
        gap: 8px;
      }

      .booking-checklist__photo,
      .booking-checklist__photo img {
        display: block;
        width: 100%;
        border-radius: 14px;
      }

      .booking-checklist__photo img {
        height: 88px;
        object-fit: cover;
      }

      .booking-checklist__pending-files {
        display: grid;
        gap: 4px;
        padding: 12px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.72);
        border: 1px dashed rgba(88, 181, 158, 0.2);
      }

      .booking-checklist__upload {
        display: grid;
        gap: 4px;
        width: fit-content;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.84);
        border: 1px dashed rgba(88, 181, 158, 0.2);
        cursor: pointer;
      }

      .booking-checklist__upload input {
        display: none;
      }

      .booking-checklist__upload span {
        color: var(--text-primary);
        font-weight: 700;
      }

      .booking-checklist__upload small {
        color: var(--text-secondary);
      }

      .booking-checklist__complete {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }

      .feedback {
        margin: 0;
        color: var(--success);
        font-weight: 600;
      }

      .feedback--error {
        color: var(--error);
      }
    `,
  ],
})
export class BookingChecklistCardComponent {
  private readonly bookingsApiService = inject(BookingsApiService);
  private bookingState!: Booking;
  private drafts: Partial<Record<BookingChecklistType, ChecklistDraft>> = {};

  @Input({ required: true })
  set booking(value: Booking) {
    this.bookingState = value;
    this.drafts = {};
  }

  get booking() {
    return this.bookingState;
  }

  @Input() viewerRole: 'RENTER' | 'OWNER' = 'RENTER';
  @Output() bookingChange = new EventEmitter<Booking>();

  protected readonly checklistTypes: BookingChecklistType[] = ['PICKUP', 'RETURN'];
  protected readonly feedbackByType: Partial<Record<BookingChecklistType, string>> = {};
  protected readonly errorByType: Partial<Record<BookingChecklistType, string>> = {};
  protected readonly submittingByType: Partial<Record<BookingChecklistType, boolean>> = {};

  protected get visibleChecklistTypes() {
    return this.checklistTypes.filter((type) => this.canView(type));
  }

  protected checklistFor(type: BookingChecklistType) {
    return this.booking.checklists.find((checklist) => checklist.type === type) ?? null;
  }

  protected checklistItems(type: BookingChecklistType) {
    const sharedItems: Record<BookingChecklistType, string[]> = {
      PICKUP: [
        'Fotos iniciais registradas',
        'Combustível conferido',
        'Quilometragem anotada',
        'Chave e documentos entregues',
        'Itens extras confirmados',
      ],
      RETURN: [
        'Fotos finais registradas',
        'Combustível conferido na devolução',
        'Quilometragem final anotada',
        'Chave devolvida',
        'Itens extras devolvidos',
      ],
    };

    return sharedItems[type];
  }

  protected typeTitle(type: BookingChecklistType) {
    return type === 'PICKUP' ? 'Checklist de retirada' : 'Checklist de devolução';
  }

  protected typeDescription(type: BookingChecklistType) {
    const counterpart =
      this.viewerRole === 'OWNER' ? 'locatário' : 'anunciante';

    return type === 'PICKUP'
      ? `Confirme com o ${counterpart} o estado inicial do veículo antes da saída.`
      : `Registre com o ${counterpart} como o veículo voltou ao final da locação.`;
  }

  protected draftFor(type: BookingChecklistType) {
    if (!this.drafts[type]) {
      const checklist = this.checklistFor(type);
      this.drafts[type] = {
        items: [...(checklist?.items ?? [])],
        notes: checklist?.notes ?? '',
        files: [],
        markComplete: !!checklist?.completedAt,
      };
    }

    return this.drafts[type] as ChecklistDraft;
  }

  protected isChecked(type: BookingChecklistType, item: string) {
    return this.draftFor(type).items.includes(item);
  }

  protected toggleItem(
    type: BookingChecklistType,
    item: string,
    checked: boolean,
  ) {
    const draft = this.draftFor(type);
    draft.items = checked
      ? Array.from(new Set([...draft.items, item]))
      : draft.items.filter((currentItem) => currentItem !== item);
  }

  protected updateNotes(type: BookingChecklistType, notes: string) {
    this.draftFor(type).notes = notes;
  }

  protected selectFiles(type: BookingChecklistType, event: Event) {
    const input = event.target as HTMLInputElement;
    this.draftFor(type).files = Array.from(input.files ?? []).slice(0, 6);
    input.value = '';
  }

  protected pendingFileNames(type: BookingChecklistType) {
    return this.draftFor(type).files.map((file) => file.name).join(', ');
  }

  protected setMarkComplete(type: BookingChecklistType, value: boolean) {
    this.draftFor(type).markComplete = value;
  }

  protected canView(type: BookingChecklistType) {
    const status = this.booking.status;

    if (type === 'PICKUP') {
      return ['APPROVED', 'IN_PROGRESS', 'COMPLETED'].includes(status);
    }

    return ['IN_PROGRESS', 'COMPLETED'].includes(status);
  }

  protected canEdit(type: BookingChecklistType) {
    return this.canView(type);
  }

  protected isSubmitting(type: BookingChecklistType) {
    return !!this.submittingByType[type];
  }

  protected save(type: BookingChecklistType) {
    const draft = this.draftFor(type);
    this.feedbackByType[type] = '';
    this.errorByType[type] = '';
    this.submittingByType[type] = true;

    this.bookingsApiService
      .updateChecklist(
        this.booking.id,
        type,
        {
          items: draft.items,
          notes: draft.notes.trim(),
          markComplete: draft.markComplete,
        },
        draft.files,
      )
      .subscribe({
        next: (booking) => {
          this.bookingState = booking;
          this.drafts = {};
          this.feedbackByType[type] = 'Checklist salvo com sucesso.';
          this.submittingByType[type] = false;
          this.bookingChange.emit(booking);
        },
        error: (error) => {
          this.errorByType[type] =
            error?.error?.message || 'Não foi possível salvar o checklist.';
          this.submittingByType[type] = false;
        },
      });
  }

  protected trackByType(_index: number, type: BookingChecklistType) {
    return type;
  }

  protected trackByString(_index: number, value: string) {
    return value;
  }

  protected trackByPhoto(_index: number, photo: { url: string }) {
    return photo.url;
  }
}
