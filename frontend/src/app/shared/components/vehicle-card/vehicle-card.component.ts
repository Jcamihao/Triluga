import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, Input, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { VehicleCardItem } from '../../../core/models/domain.models';
import { CompareService } from '../../../core/services/compare.service';
import { ContactedVehiclesService } from '../../../core/services/contacted-vehicles.service';
import { FavoritesService } from '../../../core/services/favorites.service';

@Component({
  selector: 'app-vehicle-card',
  standalone: true,
  imports: [CommonModule, RouterLink, CurrencyPipe],
  templateUrl: './vehicle-card.component.html',
  styleUrls: ['./vehicle-card.component.scss'],
})
export class VehicleCardComponent {
  private readonly favoritesService = inject(FavoritesService);
  private readonly compareService = inject(CompareService);
  private readonly contactedVehiclesService = inject(ContactedVehiclesService);
  private readonly router = inject(Router);
  @Input({ required: true }) vehicle!: VehicleCardItem;
  @Input() hideOwner = false;

  protected readonly fallbackImage =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='280' viewBox='0 0 400 280'%3E%3Crect width='400' height='280' fill='%23f1f5f9'/%3E%3Cpath d='M60 180 L80 145 L110 108 L290 108 L320 145 L340 180 L340 196 L60 196Z' fill='%23cbd5e1'/%3E%3Cpath d='M115 108 L135 72 L265 72 L285 108Z' fill='%2394a3b8'/%3E%3Cpath d='M140 74 L154 74 L154 102 L130 102Z' fill='%23e2e8f0'/%3E%3Cpath d='M162 70 L238 70 L248 102 L152 102Z' fill='%23e2e8f0'/%3E%3Cpath d='M246 74 L260 74 L270 102 L246 102Z' fill='%23e2e8f0'/%3E%3Ccircle cx='115' cy='196' r='28' fill='%2364748b'/%3E%3Ccircle cx='115' cy='196' r='16' fill='%2394a3b8'/%3E%3Ccircle cx='285' cy='196' r='28' fill='%2364748b'/%3E%3Ccircle cx='285' cy='196' r='16' fill='%2394a3b8'/%3E%3C/svg%3E";

  protected categoryLabel(category: string) {
    const labels: Record<string, string> = {
      ECONOMY: 'Econômico',
      HATCH: 'Hatch',
      SEDAN: 'Sedan',
      SUV: 'SUV',
      PICKUP: 'Pickup',
      VAN: 'Van',
      LUXURY: 'Premium',
      TRAVEL: 'Viagem',
      CLASSIC: 'Clássico',
    };

    return labels[category] || category;
  }

  protected badgeLabel() {
    return this.vehicle.vehicleType === 'MOTORCYCLE'
      ? 'Moto'
      : this.categoryLabel(this.vehicle.category);
  }

  protected transmissionLabel(transmission: string) {
    const labels: Record<string, string> = {
      AUTOMATIC: 'Automático',
      MANUAL: 'Manual',
      CVT: 'CVT',
    };

    return labels[transmission] || transmission;
  }

  protected fuelTypeLabel(fuelType: string) {
    const labels: Record<string, string> = {
      FLEX: 'Flex',
      GASOLINE: 'Gasolina',
      ETHANOL: 'Etanol',
      DIESEL: 'Diesel',
      ELECTRIC: 'Elétrico',
      HYBRID: 'Híbrido',
    };
    return labels[fuelType] || fuelType;
  }

  protected get ownerName() {
    return this.vehicle.owner?.fullName || 'Usuário Triluga';
  }

  protected get ownerInitials() {
    return this.ownerName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  protected get ownerRatingLabel() {
    const reviewsCount = this.vehicle.owner?.reviewsCount ?? 0;
    const ratingAverage = this.vehicle.owner?.ratingAverage ?? 0;

    if (!reviewsCount) {
      return 'Novo';
    }

    return `${ratingAverage.toFixed(1)}`;
  }

  protected readonly currentSlide = signal(0);

  protected get previewImages(): string[] {
    const imgs = this.vehicle.previewImages ?? [];
    return imgs.length > 0 ? imgs : (this.vehicle.coverImage ? [this.vehicle.coverImage] : []);
  }

  protected onSwipeScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (el.clientWidth > 0) {
      this.currentSlide.set(Math.round(el.scrollLeft / el.clientWidth));
    }
  }

  protected get isContacted() {
    return this.contactedVehiclesService.isContacted(this.vehicle.id);
  }

  protected get isFavorite() {
    return this.favoritesService.isFavorite(this.vehicle.id);
  }

  protected get isFavoritePending() {
    return this.favoritesService.isPending(this.vehicle.id);
  }

  protected get isCompared() {
    return this.compareService.isSelected(this.vehicle.id);
  }

  protected get compareDisabled() {
    return !this.isCompared && this.compareService.isFull();
  }

  protected toggleFavorite(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.favoritesService.toggleFavorite(this.vehicle);
  }

  protected toggleCompare(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.compareService.toggle(this.vehicle);
  }

  protected shareVehicle(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    const url = `${globalThis.location?.origin ?? ''}/vehicles/${this.vehicle.slug}`;
    const text = `${this.vehicle.title} — R$${Math.round(this.vehicle.weeklyRate ?? this.vehicle.dailyRate)}/semana`;
    if (navigator.share) {
      navigator.share({ title: this.vehicle.title, text, url }).catch(() => {});
    } else {
      const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
      globalThis.open(whatsapp, '_blank', 'noopener,noreferrer');
    }
  }
}
