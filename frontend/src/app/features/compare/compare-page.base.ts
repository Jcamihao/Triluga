import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VehicleCardItem } from '../../core/models/domain.models';
import { CompareService } from '../../core/services/compare.service';
import { UiStateService } from '../../core/services/ui-state.service';
import { WebHeaderComponent } from '../../shared/components/web-header/web-header.component';

export const COMPARE_IMPORTS = [
  CommonModule,
  RouterLink,
  CurrencyPipe,
  WebHeaderComponent,
];

@Component({ template: '' })
export abstract class ComparePageBase {
  protected readonly compareService = inject(CompareService);
  private readonly uiStateService = inject(UiStateService);
  protected readonly fallbackImage =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='280' viewBox='0 0 400 280'%3E%3Crect width='400' height='280' fill='%23f1f5f9'/%3E%3Cpath d='M60 180 L80 145 L110 108 L290 108 L320 145 L340 180 L340 196 L60 196Z' fill='%23cbd5e1'/%3E%3Cpath d='M115 108 L135 72 L265 72 L285 108Z' fill='%2394a3b8'/%3E%3Cpath d='M140 74 L154 74 L154 102 L130 102Z' fill='%23e2e8f0'/%3E%3Cpath d='M162 70 L238 70 L248 102 L152 102Z' fill='%23e2e8f0'/%3E%3Cpath d='M246 74 L260 74 L270 102 L246 102Z' fill='%23e2e8f0'/%3E%3Ccircle cx='115' cy='196' r='28' fill='%2364748b'/%3E%3Ccircle cx='115' cy='196' r='16' fill='%2394a3b8'/%3E%3Ccircle cx='285' cy='196' r='28' fill='%2364748b'/%3E%3Ccircle cx='285' cy='196' r='16' fill='%2394a3b8'/%3E%3C/svg%3E";

  protected toggleMenu() {
    this.uiStateService.toggleMenu();
  }

  protected toggleNotifications() {
    this.uiStateService.toggleNotifications();
  }

  protected trackById(_index: number, item: { id: string }) {
    return item.id;
  }

  protected categoryLabel(category: string) {
    const labels: Record<string, string> = {
      ECONOMY: 'Econômico',
      HATCH: 'Hatch',
      SEDAN: 'Sedan',
      SUV: 'SUV',
      PICKUP: 'Pickup',
      VAN: 'Van',
      LUXURY: 'Luxo',
      SPORT: 'Esportivo',
      MOTORCYCLE: 'Moto',
    };

    return labels[category] || category;
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

  protected ratingLabel(ratingAverage?: number, reviewsCount?: number) {
    if (!reviewsCount) {
      return 'Novo anunciante';
    }

    return `${(ratingAverage ?? 0).toFixed(1)} em ${reviewsCount} avaliação${
      reviewsCount > 1 ? 'ões' : ''
    }`;
  }

  protected weeklyPrice(vehicle: VehicleCardItem) {
    return vehicle.weeklyRate ?? vehicle.dailyRate;
  }

  protected vehicleTypeLabel(vehicle: VehicleCardItem) {
    return vehicle.vehicleType === 'MOTORCYCLE' ? 'Moto' : 'Carro';
  }

  protected locationLabel(vehicle: VehicleCardItem) {
    return `${vehicle.city}, ${vehicle.state}`;
  }

  protected seatsLabel(vehicle: VehicleCardItem) {
    if (vehicle.vehicleType === 'MOTORCYCLE') {
      return vehicle.hasTopCase ? 'Baú incluso' : 'Sem baú';
    }

    return `${vehicle.seats} lugares`;
  }

  protected insuranceLabel(vehicle: VehicleCardItem) {
    if (vehicle.hasInsurance === null || vehicle.hasInsurance === undefined) {
      return 'Não informado';
    }

    return vehicle.hasInsurance ? 'Possui seguro' : 'Sem seguro informado';
  }

  protected mechanicsConditionLabel(vehicle: VehicleCardItem) {
    const labels: Record<string, string> = {
      REVIEW: 'Revisar',
      GOOD: 'Bom',
      EXCELLENT: 'Impecável',
    };

    return vehicle.mechanicsCondition
      ? labels[vehicle.mechanicsCondition] || vehicle.mechanicsCondition
      : 'Não informado';
  }

  protected detranStatusLabel(vehicle: VehicleCardItem) {
    if (
      vehicle.hasDetranIssues === null ||
      vehicle.hasDetranIssues === undefined
    ) {
      return 'Não informado';
    }

    return vehicle.hasDetranIssues ? 'Pendências informadas' : 'Regularizado';
  }

  protected kmPolicyLabel(vehicle: VehicleCardItem) {
    if (vehicle.kmPolicy === 'FREE') {
      return 'Km livre';
    }

    if (vehicle.kmPolicy === 'FIXED') {
      return 'Km fixo';
    }

    return 'Não informado';
  }

  protected ownerRatingValue(vehicle: VehicleCardItem) {
    return vehicle.owner?.reviewsCount
      ? (vehicle.owner.ratingAverage ?? 0).toFixed(1)
      : 'Novo';
  }

  protected ownerReviewsLabel(vehicle: VehicleCardItem) {
    const reviewsCount = vehicle.owner?.reviewsCount ?? 0;

    if (!reviewsCount) {
      return 'sem avaliações';
    }

    return `${reviewsCount} avaliação${reviewsCount > 1 ? 'ões' : ''}`;
  }
}
