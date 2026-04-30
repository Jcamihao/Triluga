import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VehicleCardItem } from '../../core/models/domain.models';
import { CompareService } from '../../core/services/compare.service';
import { UiStateService } from '../../core/services/ui-state.service';
import { WebHeaderComponent } from '../../shared/components/web-header/web-header.component';

@Component({
  selector: 'app-compare-page',
  standalone: true,
  imports: [CommonModule, RouterLink, CurrencyPipe, WebHeaderComponent],
  templateUrl: './compare-page.component.html',
  styleUrls: ['./compare-page.component.scss'],
})
export class ComparePageComponent {
  protected readonly compareService = inject(CompareService);
  private readonly uiStateService = inject(UiStateService);
  protected readonly fallbackImage =
    'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80';

  protected toggleMenu() {
    this.uiStateService.toggleMenu();
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
    return vehicle.weeklyRate ?? vehicle.dailyRate * 7;
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
