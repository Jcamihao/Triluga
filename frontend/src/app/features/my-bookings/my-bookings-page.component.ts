import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BookingsApiService } from '../../core/services/bookings-api.service';
import { Booking, PaymentMethod } from '../../core/models/domain.models';

@Component({
  selector: 'app-my-bookings-page',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, RouterLink],
  template: `
    <main class="page reservations-page">
      <section class="section-head">
        <span>Minhas reservas</span>
        <h1>Acompanhe seu histórico</h1>
      </section>

      <p class="feedback" *ngIf="feedback">{{ feedback }}</p>
      <p class="feedback feedback--error" *ngIf="errorMessage">{{ errorMessage }}</p>

      <section class="state-card" *ngIf="loading">
        <strong>Carregando reservas...</strong>
        <p>Estamos buscando suas solicitações mais recentes.</p>
      </section>

      <section class="state-card" *ngIf="!loading && !errorMessage && !bookings.length">
        <strong>Nenhuma reserva por enquanto</strong>
        <p>Quando você solicitar um carro, ele vai aparecer aqui com o status atualizado.</p>
        <a routerLink="/search" class="btn btn-primary">Buscar carros</a>
      </section>

      <section class="booking-list" *ngIf="!loading && bookings.length">
        <article class="booking-card" *ngFor="let booking of bookings">
          <img [src]="booking.vehicle.image || fallbackImage" [alt]="booking.vehicle.title" />

          <div class="booking-card__content">
            <div class="booking-card__top">
              <strong>{{ booking.vehicle.title }}</strong>
              <span class="status" [class]="'status status--' + booking.status.toLowerCase()">
                {{ booking.status }}
              </span>
            </div>

            <p>{{ booking.vehicle.city }}, {{ booking.vehicle.state }}</p>
            <p>
              {{ booking.startDate | date: 'dd/MM/yyyy' }} até
              {{ booking.endDate | date: 'dd/MM/yyyy' }}
            </p>
            <strong>{{ booking.totalAmount | currency: 'BRL' : 'symbol' : '1.2-2' }}</strong>

            <div class="booking-card__details">
              <span *ngIf="booking.approvedAt">Aprovada em {{ booking.approvedAt | date: 'dd/MM/yyyy' }}</span>
              <span *ngIf="booking.completedAt">Concluída em {{ booking.completedAt | date: 'dd/MM/yyyy' }}</span>
              <span *ngIf="booking.payment?.status === 'PAID'">
                Pagamento confirmado via {{ paymentMethodLabel(booking.payment?.method) }}
              </span>
            </div>

            <button
              *ngIf="booking.status === 'PENDING' || booking.status === 'APPROVED'"
              type="button"
              class="btn btn-secondary"
              [disabled]="cancellingBookingId === booking.id"
              (click)="cancel(booking.id)"
            >
              {{ cancellingBookingId === booking.id ? 'Cancelando...' : 'Cancelar' }}
            </button>
          </div>
        </article>
      </section>
    </main>
  `,
  styles: [
    `
      .reservations-page {
        display: grid;
        gap: 18px;
        padding: 18px 12px 132px;
      }

      .section-head span {
        color: var(--primary);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }

      .section-head h1,
      p,
      strong {
        margin: 0;
      }

      .booking-list {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 16px;
      }

      .state-card {
        display: grid;
        gap: 10px;
        padding: 20px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid var(--glass-border);
        box-shadow: var(--shadow-soft);
      }

      .booking-card {
        display: grid;
        grid-template-columns: 1fr;
        gap: 14px;
        padding: 12px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid var(--glass-border);
        box-shadow: var(--shadow-soft);
      }

      img {
        width: 100%;
        height: 196px;
        object-fit: cover;
        border-radius: 18px;
      }

      .booking-card__content {
        display: grid;
        gap: 8px;
      }

      .booking-card__details {
        display: grid;
        gap: 4px;
        color: var(--text-secondary);
        font-size: 12px;
      }

      .booking-card__top {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }

      .status {
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
      }

      .status--approved,
      .status--completed {
        background: rgba(34, 197, 94, 0.12);
        color: var(--success);
      }

      .status--pending {
        background: rgba(245, 158, 11, 0.14);
        color: var(--warning);
      }

      .status--cancelled,
      .status--rejected {
        background: rgba(239, 68, 68, 0.12);
        color: var(--error);
      }

      .feedback {
        margin: 0;
        color: var(--success);
        font-weight: 600;
      }

      .feedback--error {
        color: var(--error);
      }

      @media (min-width: 641px) {
        .reservations-page {
          padding: 20px 16px 132px;
        }

        .booking-list {
          grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
        }

        .booking-card {
          grid-template-columns: 112px 1fr;
        }

        img {
          height: 100%;
        }
      }

      @media (min-width: 1080px) {
        .reservations-page {
          gap: 20px;
          padding: 28px 20px 56px;
        }

        .booking-card {
          grid-template-columns: 128px 1fr;
          padding: 16px;
        }
      }
    `,
  ],
})
export class MyBookingsPageComponent {
  private readonly bookingsApiService = inject(BookingsApiService);
  protected readonly fallbackImage =
    'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80';
  protected bookings: Booking[] = [];
  protected loading = true;
  protected feedback = '';
  protected errorMessage = '';
  protected cancellingBookingId: string | null = null;

  constructor() {
    this.loadBookings();
  }

  protected cancel(bookingId: string) {
    this.cancellingBookingId = bookingId;
    this.feedback = '';
    this.errorMessage = '';

    this.bookingsApiService.cancel(bookingId).subscribe({
      next: () => {
        this.feedback = 'Reserva cancelada com sucesso.';
        this.cancellingBookingId = null;
        this.loadBookings();
      },
      error: (error) => {
        this.errorMessage =
          error?.error?.message || 'Não foi possível cancelar a reserva.';
        this.cancellingBookingId = null;
      },
    });
  }

  protected paymentMethodLabel(method?: PaymentMethod | null) {
    const labels: Record<PaymentMethod, string> = {
      PIX: 'PIX',
      CREDIT_CARD: 'Cartão',
      BOLETO: 'Boleto',
      BANK_TRANSFER: 'Transferência',
    };

    return method ? labels[method] : 'PIX';
  }

  private loadBookings() {
    this.loading = true;
    this.errorMessage = '';

    this.bookingsApiService
      .getMine()
      .subscribe({
        next: (bookings) => {
          this.bookings = bookings;
          this.errorMessage = '';
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage =
            error?.error?.message || 'Não foi possível carregar suas reservas.';
          this.loading = false;
        },
      });
  }
}
