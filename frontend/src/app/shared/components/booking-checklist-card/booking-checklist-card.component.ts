import { CommonModule, DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Booking,
  BookingChecklist,
  BookingChecklistType,
} from '../../../core/models/domain.models';
import { BookingsApiService } from '../../../core/services/bookings-api.service';

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
  templateUrl: './booking-checklist-card.component.html',
  styleUrls: ['./booking-checklist-card.component.scss'],
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
