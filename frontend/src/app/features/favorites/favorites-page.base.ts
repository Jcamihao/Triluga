import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VehicleCardItem } from '../../core/models/domain.models';
import { CompareService } from '../../core/services/compare.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { UiStateService } from '../../core/services/ui-state.service';
import { minRentalLabel } from '../../shared/utils/rental-pricing.util';
import { WebHeaderComponent } from '../../shared/components/web-header/web-header.component';
import { VehicleCardComponent } from '../../shared/components/vehicle-card/vehicle-card.component';

export const FAVORITES_IMPORTS = [
  CommonModule,
  RouterLink,
  VehicleCardComponent,
  WebHeaderComponent,
];

@Component({ template: '' })
export abstract class FavoritesPageBase {
  protected readonly favoritesService = inject(FavoritesService);
  protected readonly compareService = inject(CompareService);
  protected readonly uiStateService = inject(UiStateService);
  protected readonly fallbackImage =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='280' viewBox='0 0 400 280'%3E%3Crect width='400' height='280' fill='%23f1f5f9'/%3E%3Cpath d='M60 180 L80 145 L110 108 L290 108 L320 145 L340 180 L340 196 L60 196Z' fill='%23cbd5e1'/%3E%3Cpath d='M115 108 L135 72 L265 72 L285 108Z' fill='%2394a3b8'/%3E%3Cpath d='M140 74 L154 74 L154 102 L130 102Z' fill='%23e2e8f0'/%3E%3Cpath d='M162 70 L238 70 L248 102 L152 102Z' fill='%23e2e8f0'/%3E%3Cpath d='M246 74 L260 74 L270 102 L246 102Z' fill='%23e2e8f0'/%3E%3Ccircle cx='115' cy='196' r='28' fill='%2364748b'/%3E%3Ccircle cx='115' cy='196' r='16' fill='%2394a3b8'/%3E%3Ccircle cx='285' cy='196' r='28' fill='%2364748b'/%3E%3Ccircle cx='285' cy='196' r='16' fill='%2394a3b8'/%3E%3C/svg%3E";
  protected sortMode: 'recent' | 'priceAsc' | 'priceDesc' = 'recent';

  protected toggleMenu() {
    this.uiStateService.toggleMenu();
  }

  protected toggleNotifications() {
    this.uiStateService.toggleNotifications();
  }

  constructor() {
    this.favoritesService.refresh();
  }

  protected get favoriteItems() {
    return this.favoritesService.items();
  }

  protected get sortedFavoriteItems() {
    const items = [...this.favoriteItems];

    if (this.sortMode === 'priceAsc') {
      return items.sort((a, b) => this.dailyPrice(a) - this.dailyPrice(b));
    }

    if (this.sortMode === 'priceDesc') {
      return items.sort((a, b) => this.dailyPrice(b) - this.dailyPrice(a));
    }

    return items;
  }

  protected get compareFavoritesCount() {
    return Math.min(this.favoriteItems.length, 4);
  }

  protected get selectedCompareVehicles() {
    const favoriteIds = new Set(
      this.favoriteItems.map((vehicle) => vehicle.id),
    );
    return this.compareService
      .items()
      .filter((vehicle) => favoriteIds.has(vehicle.id))
      .slice(0, 3);
  }

  protected get compareEmptySlots() {
    return Array.from(
      { length: Math.max(0, 3 - this.selectedCompareVehicles.length) },
      (_, index) => index,
    );
  }

  protected cycleSortMode() {
    const nextMode: Record<typeof this.sortMode, typeof this.sortMode> = {
      recent: 'priceAsc',
      priceAsc: 'priceDesc',
      priceDesc: 'recent',
    };

    this.sortMode = nextMode[this.sortMode];
  }

  protected sortLabel() {
    const labels: Record<typeof this.sortMode, string> = {
      recent: 'Ordenar',
      priceAsc: 'Menor preço',
      priceDesc: 'Maior preço',
    };

    return labels[this.sortMode];
  }

  protected compareFavorites() {
    const selected = this.favoriteItems.slice(0, 4);

    this.compareService.clear();
    selected.forEach((vehicle) => this.compareService.toggle(vehicle));
  }

  protected toggleFavoriteCompare(vehicle: VehicleCardItem) {
    if (
      !this.compareService.isSelected(vehicle.id) &&
      this.selectedCompareVehicles.length >= 3
    ) {
      return;
    }

    this.compareService.toggle(vehicle);
  }

  protected isCompareDisabled(vehicle: VehicleCardItem) {
    return (
      !this.compareService.isSelected(vehicle.id) &&
      this.selectedCompareVehicles.length >= 3
    );
  }

  protected removeFavorite(vehicle: VehicleCardItem) {
    this.favoritesService.toggleFavorite(vehicle);
    if (this.compareService.isSelected(vehicle.id)) {
      this.compareService.remove(vehicle.id);
    }
  }

  protected trackById(_index: number, vehicle: VehicleCardItem) {
    return vehicle.id;
  }

  protected trackByIndex(index: number) {
    return index;
  }

  protected categoryLabel(vehicle: VehicleCardItem) {
    if (vehicle.vehicleType === 'MOTORCYCLE') {
      return 'Moto';
    }

    const labels: Record<string, string> = {
      ECONOMY: 'Econômico',
      HATCH: 'Hatch',
      SEDAN: 'Sedan',
      SUV: 'SUV',
      PICKUP: 'Pickup',
      VAN: 'Van',
      LUXURY: 'Premium',
    };

    return labels[vehicle.category] || vehicle.category;
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

  protected rangeLabel(vehicle: VehicleCardItem) {
    if (vehicle.fuelType === 'ELECTRIC') {
      return vehicle.vehicleType === 'MOTORCYCLE' ? 'Elétrica' : 'Elétrico';
    }

    if (vehicle.vehicleType === 'MOTORCYCLE' && vehicle.engineCc) {
      return `${vehicle.engineCc} cc`;
    }

    return vehicle.kmPolicy === 'FREE' ? 'Km livre' : '200 km/dia';
  }

  protected readonly minRentalLabel = minRentalLabel;

  protected dailyPrice(vehicle: VehicleCardItem) {
    return vehicle.dailyRate;
  }
}
