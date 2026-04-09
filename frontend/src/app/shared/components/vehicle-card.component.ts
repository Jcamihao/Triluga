import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { VehicleCardItem } from '../../core/models/domain.models';
import { CompareService } from '../../core/services/compare.service';
import { FavoritesService } from '../../core/services/favorites.service';

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
  @Input() badgeLabelOverride?: string;
  @Input() cardVariant?: 'default' | 'featured';

  protected readonly fallbackImage =
    'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80';
  protected readonly fallbackAvatarImage =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='40' fill='%23f3eeee'/%3E%3Ccircle cx='80' cy='60' r='24' fill='%23b7aaac'/%3E%3Cpath d='M40 128c7-22 24-34 40-34s33 12 40 34' fill='%23b7aaac'/%3E%3C/svg%3E";

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
    if (this.badgeLabelOverride) {
      return this.badgeLabelOverride;
    }

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

  protected get isFavorite() {
    return this.favoritesService.isFavorite(this.vehicle.id);
  }

  protected get isFavoritePending() {
    return this.favoritesService.isPending(this.vehicle.id);
  }

  protected get ownerDisplayName() {
    return this.vehicle.owner?.fullName?.trim() || 'Anunciante Triluga';
  }

  protected get ownerRatingLabel() {
    const reviewsCount = this.vehicle.owner?.reviewsCount ?? 0;
    const ratingAverage = this.vehicle.owner?.ratingAverage ?? 0;

    if (!reviewsCount) {
      return 'Novo usuário';
    }

    return `${ratingAverage.toFixed(1)} de média`;
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

  protected openOwnerProfile(event: Event) {
    const ownerId = this.vehicle.owner?.id;

    if (!ownerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.router.navigate(['/users', ownerId]);
  }
}
