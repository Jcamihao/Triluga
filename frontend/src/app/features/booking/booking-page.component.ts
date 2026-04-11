import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { AvailabilityApiService } from '../../core/services/availability-api.service';
import { AuthService } from '../../core/services/auth.service';
import { BookingsApiService } from '../../core/services/bookings-api.service';
import { VehiclesApiService } from '../../core/services/vehicles-api.service';
import {
  AppliedPromotion,
  VehicleAddon,
  VehicleAvailabilityResponse,
  VehicleDetail,
  VehiclePricingPreview,
} from '../../core/models/domain.models';

@Component({
  selector: 'app-booking-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe],
  templateUrl: './booking-page.component.html',
  styleUrls: ['./booking-page.component.scss'],
})
export class BookingPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly availabilityApiService = inject(AvailabilityApiService);
  private readonly vehiclesApiService = inject(VehiclesApiService);
  private readonly bookingsApiService = inject(BookingsApiService);

  protected vehicle?: VehicleDetail;
  protected availability?: VehicleAvailabilityResponse;
  protected pricingPreview?: VehiclePricingPreview | null;
  protected readonly fallbackImage =
    'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80';
  protected readonly today = new Date().toISOString().slice(0, 10);
  protected startDate = '';
  protected endDate = '';
  protected notes = '';
  protected couponCode = '';
  protected selectedAddonIds = new Set<string>();
  protected feedback = '';
  protected availabilityError = '';
  protected availabilityLoading = false;
  protected pricingError = '';
  protected pricingLoading = false;
  protected submitting = false;
  protected hasPreviousBookings = false;

  constructor() {
    const vehicleId = this.route.snapshot.paramMap.get('vehicleId');

    if (vehicleId) {
      this.availabilityLoading = true;

      forkJoin({
        vehicle: this.vehiclesApiService.getById(vehicleId),
        availability: this.availabilityApiService.getVehicleAvailability(vehicleId),
        myBookings: this.authService.isAuthenticated()
          ? this.bookingsApiService.getMine().pipe(catchError(() => of([])))
          : of([]),
      }).subscribe({
        next: ({ vehicle, availability, myBookings }) => {
          this.vehicle = vehicle;
          this.availability = availability;
          this.hasPreviousBookings = myBookings.some(
            (booking) =>
              booking.status !== 'REJECTED' && booking.status !== 'CANCELLED',
          );
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

  protected get hasPromotionOffer() {
    return !!this.vehicle && (
      this.vehicle.firstBookingDiscountPercent > 0 ||
      this.vehicle.weeklyDiscountPercent > 0 ||
      (!!this.vehicle.couponCode && this.vehicle.couponDiscountPercent > 0)
    );
  }

  protected get isFirstBookingEligible() {
    return !this.hasPreviousBookings;
  }

  protected get baseRentalAmount() {
    return this.pricingPreview?.adjustedRentalAmount ?? this.staticRentalAmount;
  }

  protected get staticRentalAmount() {
    return this.vehicle ? this.totalDays * this.vehicle.dailyRate : 0;
  }

  protected get subtotal() {
    return this.baseRentalAmount + this.addonsAmount;
  }

  protected get pricingAdjustments() {
    return this.pricingPreview?.adjustments ?? [];
  }

  protected get appliedPromotionPreview(): AppliedPromotion[] {
    if (!this.vehicle) {
      return [];
    }

    const preview: AppliedPromotion[] = [];
    const baseAmount = this.baseRentalAmount;
    const addPromotion = (
      code: AppliedPromotion['code'],
      label: string,
      percent: number,
    ) => {
      if (percent <= 0 || baseAmount <= 0) {
        return;
      }

      const usedAmount = preview.reduce((total, promotion) => total + promotion.amount, 0);
      const remainingAmount = Math.max(0, baseAmount - usedAmount);
      const amount = Math.min(baseAmount * (percent / 100), remainingAmount);

      if (amount <= 0) {
        return;
      }

      preview.push({
        code,
        label,
        amount,
      });
    };

    if (this.vehicle.firstBookingDiscountPercent > 0 && this.isFirstBookingEligible) {
      addPromotion(
        'FIRST_BOOKING',
        'Primeira reserva',
        this.vehicle.firstBookingDiscountPercent,
      );
    }

    if (this.totalDays >= 7 && this.vehicle.weeklyDiscountPercent > 0) {
      addPromotion(
        'WEEKLY_PACKAGE',
        'Pacote semanal',
        this.vehicle.weeklyDiscountPercent,
      );
    }

    if (this.isCouponPreviewValid && this.vehicle.couponDiscountPercent > 0) {
      addPromotion(
        'COUPON',
        `Cupom ${this.normalizedCouponCode}`,
        this.vehicle.couponDiscountPercent,
      );
    }

    return preview.map((promotion) => ({
      ...promotion,
      amount: Number(promotion.amount.toFixed(2)),
    }));
  }

  protected get normalizedCouponCode() {
    return this.couponCode.trim().toUpperCase();
  }

  protected get isCouponPreviewValid() {
    return (
      !!this.vehicle?.couponCode &&
      !!this.normalizedCouponCode &&
      this.vehicle.couponCode.toUpperCase() === this.normalizedCouponCode
    );
  }

  protected get discountsAmount() {
    return this.appliedPromotionPreview.reduce(
      (total, promotion) => total + promotion.amount,
      0,
    );
  }

  protected get discountedSubtotal() {
    return Math.max(0, this.subtotal - this.discountsAmount);
  }

  protected get platformFee() {
    return this.discountedSubtotal * 0.12;
  }

  protected get totalAmount() {
    return this.discountedSubtotal + this.platformFee;
  }

  protected get activeAddons(): VehicleAddon[] {
    return (this.vehicle?.addons ?? []).filter((addon) => addon.enabled !== false);
  }

  protected get selectedAddons() {
    return this.activeAddons.filter((addon) => this.selectedAddonIds.has(addon.id));
  }

  protected get addonsAmount() {
    return this.selectedAddons.reduce((total, addon) => total + addon.price, 0);
  }

  protected get submitLabel() {
    if (!this.vehicle) {
      return 'Solicitar reserva';
    }

    return this.vehicle.bookingApprovalMode === 'INSTANT'
      ? 'Reservar agora'
      : 'Solicitar reserva';
  }

  protected isAddonSelected(addonId: string) {
    return this.selectedAddonIds.has(addonId);
  }

  protected toggleAddon(addonId: string) {
    const next = new Set(this.selectedAddonIds);

    if (next.has(addonId)) {
      next.delete(addonId);
    } else {
      next.add(addonId);
    }

    this.selectedAddonIds = next;
  }

  protected cancellationPolicyLabel(policy: VehicleDetail['cancellationPolicy']) {
    const labels = {
      FLEXIBLE: 'Flexível',
      MODERATE: 'Moderada',
      STRICT: 'Rígida',
    } as const;

    return labels[policy] || policy;
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
        selectedAddonIds: [...this.selectedAddonIds],
        couponCode: this.normalizedCouponCode || undefined,
      })
      .subscribe({
        next: (booking) => {
          this.feedback =
            booking.status === 'APPROVED'
              ? 'Reserva confirmada instantaneamente.'
              : 'Solicitação enviada. Agora o proprietário pode aprovar ou recusar.';
          this.submitting = false;
          setTimeout(() => this.router.navigate(['/profile']), 900);
        },
        error: (error) => {
          this.feedback =
            error?.error?.message || 'Não foi possível criar a reserva.';
          this.submitting = false;
        },
      });
  }

  protected refreshPricingPreview() {
    if (!this.vehicle || !this.startDate || !this.endDate || this.totalDays <= 0) {
      this.pricingPreview = null;
      this.pricingError = '';
      return;
    }

    this.pricingLoading = true;
    this.pricingError = '';

    this.vehiclesApiService
      .getPricingPreview(this.vehicle.id, this.startDate, this.endDate)
      .subscribe({
        next: (preview) => {
          this.pricingPreview = preview;
          this.pricingLoading = false;
        },
        error: (error) => {
          this.pricingPreview = null;
          this.pricingLoading = false;
          this.pricingError =
            error?.error?.message || 'Não foi possível calcular o preço dinâmico.';
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
