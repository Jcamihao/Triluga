import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { VehicleCardItem } from '../../../core/models/domain.models';
import { CompareService } from '../../../core/services/compare.service';
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
  private readonly router = inject(Router);

  @Input({ required: true }) vehicle!: VehicleCardItem;

  protected readonly fallbackImage =
    'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80';

  protected categoryLabel(category: string) {
    const labels: Record<string, string> = {
      ECONOMY: 'Econ.',
      HATCH: 'Hatch',
      SEDAN: 'Sedan',
      SUV: 'SUV',
      PICKUP: 'Pickup',
      VAN: 'Van',
      LUXURY: 'Luxo',
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
      AUTOMATIC: 'Auto',
      MANUAL: 'Manual',
      CVT: 'CVT',
    };

    return labels[transmission] || transmission;
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
}
