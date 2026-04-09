import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CompareService } from '../../core/services/compare.service';

@Component({
  selector: 'app-compare-page',
  standalone: true,
  imports: [CommonModule, RouterLink, CurrencyPipe],
  templateUrl: './compare-page.component.html',
  styleUrls: ['./compare-page.component.scss'],
})
export class ComparePageComponent {
  protected readonly compareService = inject(CompareService);
  protected readonly fallbackImage =
    'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80';

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

  protected approvalModeLabel(mode: string) {
    return mode === 'INSTANT' ? 'Instantânea' : 'Manual';
  }

  protected cancellationLabel(policy: string) {
    const labels: Record<string, string> = {
      FLEXIBLE: 'Flexível',
      MODERATE: 'Moderada',
      STRICT: 'Rígida',
    };

    return labels[policy] || policy;
  }

  protected ratingLabel(ratingAverage?: number, reviewsCount?: number) {
    if (!reviewsCount) {
      return 'Novo anunciante';
    }

    return `${(ratingAverage ?? 0).toFixed(1)} em ${reviewsCount} avaliação${
      reviewsCount > 1 ? 'ões' : ''
    }`;
  }
}
