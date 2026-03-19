import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AvailabilityApiService } from '../../core/services/availability-api.service';
import { BookingsApiService } from '../../core/services/bookings-api.service';
import { VehiclesApiService } from '../../core/services/vehicles-api.service';
import {
  VehicleAvailabilityResponse,
  VehicleDetail,
} from '../../core/models/domain.models';

@Component({
  selector: 'app-booking-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe],
  template: `
    <main class="page booking-page" *ngIf="vehicle">
      <section class="booking-card">
        <div class="booking-card__copy">
          <span class="eyebrow">Reserva</span>
          <h1>{{ vehicle.title }}</h1>
          <p>{{ vehicle.city }}, {{ vehicle.state }}</p>
          <strong>{{ vehicle.dailyRate | currency: 'BRL' : 'symbol' : '1.0-0' }} / diária</strong>
        </div>

        <img
          class="booking-card__image"
          [src]="vehicle.coverImage || fallbackImage"
          [alt]="vehicle.title"
        />
      </section>

      <section class="booking-form">
        <label>
          <span>Data de retirada</span>
          <input [(ngModel)]="startDate" type="date" [min]="today" />
        </label>

        <label>
          <span>Data de devolução</span>
          <input [(ngModel)]="endDate" type="date" [min]="startDate || today" />
        </label>

        <label>
          <span>Observações</span>
          <textarea [(ngModel)]="notes" rows="4" placeholder="Combine detalhes com o proprietário"></textarea>
        </label>

        <p class="hint" *ngIf="availabilityLoading">Consultando datas indisponíveis...</p>
        <p class="feedback feedback--error" *ngIf="availabilityError">{{ availabilityError }}</p>
      </section>

      <section class="availability-card" *ngIf="availability">
        <div class="availability-card__head">
          <div>
            <span class="eyebrow eyebrow--soft">Disponibilidade</span>
            <h2>Calendário da reserva</h2>
          </div>
          <span class="availability-status" [class.availability-status--error]="selectedRangeHasConflict">
            {{ selectedRangeHasConflict ? 'Período indisponível' : 'Pronto para reservar' }}
          </span>
        </div>

        <p class="availability-description">
          O sistema já impede conflito com reservas aprovadas e bloqueios feitos pelo proprietário.
        </p>

        <div class="date-list" *ngIf="nextUnavailablePeriods.length">
          <article class="date-pill" *ngFor="let period of nextUnavailablePeriods">
            <strong>{{ period.label }}</strong>
            <span>{{ period.reason }}</span>
          </article>
        </div>

        <p class="hint" *ngIf="!nextUnavailablePeriods.length">
          Nenhum bloqueio próximo encontrado. Escolha as datas e siga com a solicitação.
        </p>
      </section>

      <section class="booking-summary">
        <div><span>Diárias</span><strong>{{ totalDays }}</strong></div>
        <div>
          <span>Subtotal</span>
          <strong>{{ subtotal | currency: 'BRL' : 'symbol' : '1.2-2' }}</strong>
        </div>
        <div>
          <span>Taxa da plataforma</span>
          <strong>{{ platformFee | currency: 'BRL' : 'symbol' : '1.2-2' }}</strong>
        </div>
        <div class="booking-summary__total">
          <span>Total</span>
          <strong>{{ totalAmount | currency: 'BRL' : 'symbol' : '1.2-2' }}</strong>
        </div>
        <p class="feedback feedback--error" *ngIf="selectedRangeHasConflict">
          O período selecionado conflita com uma reserva já aprovada ou um bloqueio manual.
        </p>
      </section>

      <button
        type="button"
        class="btn btn-primary"
        (click)="submit()"
        [disabled]="submitting || availabilityLoading || selectedRangeHasConflict"
      >
        {{ submitting ? 'Enviando...' : 'Solicitar reserva' }}
      </button>

      <p class="feedback" *ngIf="feedback">{{ feedback }}</p>
    </main>
  `,
  styles: [
    `
      .booking-page {
        display: grid;
        gap: 18px;
        padding: 20px 16px 32px;
      }

      .booking-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding: 20px;
        border-radius: 30px;
        background: rgba(255, 255, 255, 0.98);
        color: var(--text-primary);
        border: 1px solid var(--glass-border);
        box-shadow: var(--shadow-strong);
      }

      .booking-form,
      .booking-summary,
      .availability-card {
        display: grid;
        gap: 14px;
        padding: 20px;
        border-radius: 26px;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid var(--glass-border);
        box-shadow: var(--shadow-soft);
      }

      .booking-card__copy {
        display: grid;
        gap: 8px;
      }

      .booking-card__image {
        width: min(44%, 220px);
        object-fit: contain;
        filter: drop-shadow(0 18px 26px rgba(90, 115, 145, 0.16));
      }

      .eyebrow {
        color: var(--primary);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }

      .eyebrow--soft {
        color: var(--text-secondary);
      }

      h1,
      h2,
      p,
      strong {
        margin: 0;
      }

      p {
        color: var(--text-secondary);
      }

      label {
        display: grid;
        gap: 8px;
        color: var(--text-secondary);
        font-size: 12px;
        font-weight: 600;
      }

      input,
      textarea {
        width: 100%;
        min-width: 0;
        border: 1px solid var(--glass-border-soft);
        border-radius: 18px;
        padding: 12px 14px;
        font: inherit;
        background: var(--surface-muted);
      }

      .booking-summary div {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .availability-card__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .availability-status {
        display: inline-flex;
        align-items: center;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(34, 197, 94, 0.12);
        color: var(--success);
        font-size: 12px;
        font-weight: 700;
      }

      .availability-status--error {
        background: rgba(239, 68, 68, 0.12);
        color: var(--error);
      }

      .availability-description,
      .hint {
        color: var(--text-secondary);
      }

      .date-list {
        display: grid;
        gap: 10px;
      }

      .date-pill {
        display: grid;
        gap: 4px;
        padding: 14px;
        border-radius: 18px;
        background: var(--surface-muted);
        border: 1px solid var(--glass-border-soft);
      }

      .booking-summary__total {
        padding-top: 14px;
        border-top: 1px solid var(--border);
        font-size: 18px;
      }

      .feedback {
        text-align: center;
        color: var(--primary);
        font-weight: 600;
      }

      .feedback--error {
        color: var(--error);
      }

      @media (max-width: 640px) {
        .booking-card {
          flex-direction: column;
          align-items: flex-start;
        }

        .booking-card__image {
          width: 100%;
          max-height: 180px;
        }
      }
    `,
  ],
})
export class BookingPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly availabilityApiService = inject(AvailabilityApiService);
  private readonly vehiclesApiService = inject(VehiclesApiService);
  private readonly bookingsApiService = inject(BookingsApiService);

  protected vehicle?: VehicleDetail;
  protected availability?: VehicleAvailabilityResponse;
  protected readonly fallbackImage =
    'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80';
  protected readonly today = new Date().toISOString().slice(0, 10);
  protected startDate = '';
  protected endDate = '';
  protected notes = '';
  protected feedback = '';
  protected availabilityError = '';
  protected availabilityLoading = false;
  protected submitting = false;

  constructor() {
    const vehicleId = this.route.snapshot.paramMap.get('vehicleId');

    if (vehicleId) {
      this.availabilityLoading = true;

      forkJoin({
        vehicle: this.vehiclesApiService.getById(vehicleId),
        availability: this.availabilityApiService.getVehicleAvailability(vehicleId),
      }).subscribe({
        next: ({ vehicle, availability }) => {
          this.vehicle = vehicle;
          this.availability = availability;
          this.availabilityLoading = false;
        },
        error: (error) => {
          this.availabilityError =
            error?.error?.message || 'Não foi possível carregar a disponibilidade.';
          this.availabilityLoading = false;
        },
      });
    }
  }

  protected get selectedRangeHasConflict() {
    if (!this.startDate || !this.endDate || !this.availability) {
      return false;
    }

    return this.hasDateConflict(this.startDate, this.endDate);
  }

  protected get nextUnavailablePeriods() {
    if (!this.availability) {
      return [];
    }

    const periods = [
      ...this.availability.blockedDates.map((period) => ({
        startDate: period.startDate,
        endDate: period.endDate,
        reason: period.reason || 'Bloqueado pelo proprietário',
      })),
      ...this.availability.approvedBookings.map((period) => ({
        startDate: period.startDate,
        endDate: period.endDate,
        reason: 'Reserva aprovada',
      })),
    ]
      .sort((left, right) => left.startDate.localeCompare(right.startDate))
      .slice(0, 4);

    return periods.map((period) => ({
      label: `${this.formatDate(period.startDate)} até ${this.formatDate(period.endDate)}`,
      reason: period.reason,
    }));
  }

  protected get totalDays() {
    if (!this.startDate || !this.endDate) {
      return 0;
    }

    const start = new Date(this.startDate);
    const end = new Date(this.endDate);
    const diffInMs = end.getTime() - start.getTime();

    return Math.max(0, Math.floor(diffInMs / (1000 * 60 * 60 * 24)));
  }

  protected get subtotal() {
    return this.vehicle ? this.totalDays * this.vehicle.dailyRate : 0;
  }

  protected get platformFee() {
    return this.subtotal * 0.12;
  }

  protected get totalAmount() {
    return this.subtotal + this.platformFee;
  }

  protected submit() {
    if (!this.vehicle || !this.startDate || !this.endDate) {
      this.feedback = 'Escolha o período da reserva antes de continuar.';
      return;
    }

    if (this.selectedRangeHasConflict) {
      this.feedback = 'Escolha outro período para evitar conflito com datas indisponíveis.';
      return;
    }

    this.submitting = true;
    this.feedback = '';

    this.bookingsApiService
      .create({
        vehicleId: this.vehicle.id,
        startDate: this.startDate,
        endDate: this.endDate,
        notes: this.notes,
      })
      .subscribe({
        next: () => {
          this.feedback = 'Solicitação enviada. Agora o proprietário pode aprovar ou recusar.';
          this.submitting = false;
          setTimeout(() => this.router.navigate(['/my-bookings']), 900);
        },
        error: (error) => {
          this.feedback =
            error?.error?.message || 'Não foi possível criar a reserva.';
          this.submitting = false;
        },
      });
  }

  private hasDateConflict(startDate: string, endDate: string) {
    if (!this.availability) {
      return false;
    }

    const overlaps = (periodStart: string, periodEnd: string) =>
      periodStart < endDate && periodEnd > startDate;

    return (
      this.availability.blockedDates.some((period) =>
        overlaps(period.startDate.slice(0, 10), period.endDate.slice(0, 10)),
      ) ||
      this.availability.approvedBookings.some((period) =>
        overlaps(period.startDate.slice(0, 10), period.endDate.slice(0, 10)),
      )
    );
  }

  private formatDate(value: string) {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(value));
  }
}
