import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { VehicleCardItem } from '../../core/models/domain.models';
import { AuthService } from '../../core/services/auth.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { RecentlyViewedService } from '../../core/services/recently-viewed.service';
import { UiStateService } from '../../core/services/ui-state.service';
import { VehiclesApiService } from '../../core/services/vehicles-api.service';
import { VehicleCardComponent } from '../../shared/components/vehicle-card/vehicle-card.component';
import { WebHeaderComponent } from '../../shared/components/web-header/web-header.component';

type QuickShortcut = {
  label: string;
  icon: string;
  params: Record<string, string>;
};

type CategoryCard = {
  label: string;
  params: Record<string, string>;
  image: string;
};

type CollectionCard = {
  label: string;
  count: string;
  icon: string;
  params: Record<string, string>;
  fallbackImage: string;
};

type TrustCard = {
  title: string;
  description: string;
  icon: string;
};

const QUICK_SHORTCUTS: QuickShortcut[] = [
  { label: 'Elétricos', icon: 'electric_car', params: { fuelType: 'ELECTRIC' } },
  { label: 'Híbridos', icon: 'eco', params: { fuelType: 'HYBRID' } },
  { label: 'Econômicos', icon: 'savings', params: { category: 'ECONOMY' } },
  { label: 'Carros', icon: 'directions_car', params: { vehicleType: 'CAR' } },
  { label: 'Motos', icon: 'two_wheeler', params: { vehicleType: 'MOTORCYCLE' } },
];

const FEATURED_CATEGORY_CARDS: CategoryCard[] = [
  {
    label: 'Elétricos',
    params: { fuelType: 'ELECTRIC' },
    image: 'assets/categories/electric.png',
  },
  {
    label: 'Econômicos',
    params: { category: 'ECONOMY' },
    image: 'assets/categories/economy.png',
  },
  {
    label: 'Sedans',
    params: { category: 'SEDAN' },
    image: 'assets/categories/luxury_exec.png',
  },
  {
    label: 'SUVs & Pickups',
    params: { category: 'SUV' },
    image: 'assets/categories/suv.png',
  },
];

const COLLECTIONS: CollectionCard[] = [
  {
    label: 'Elétricos',
    count: '',
    icon: 'electric_car',
    params: { fuelType: 'ELECTRIC' },
    fallbackImage: 'assets/categories/electric.png',
  },
  {
    label: 'Econômicos',
    count: '',
    icon: 'savings',
    params: { category: 'ECONOMY' },
    fallbackImage: 'assets/categories/economy.png',
  },
  {
    label: 'Sedans',
    count: '',
    icon: 'directions_car',
    params: { category: 'SEDAN' },
    fallbackImage: 'assets/categories/luxury_exec.png',
  },
  {
    label: 'SUVs & Pickups',
    count: '',
    icon: 'airport_shuttle',
    params: { category: 'SUV' },
    fallbackImage: 'assets/categories/suv.png',
  },
];

const TRUST_CARDS: TrustCard[] = [
  {
    title: 'Contato direto sem intermediários',
    description:
      'Fale diretamente com o proprietário ou interessado e alinhe todos os detalhes de forma rápida e simples.',
    icon: 'verified_user',
  },
  {
    title: 'Negocie do seu jeito',
    description:
      'Defina valores, prazos e condições diretamente com a outra pessoa, de forma clara e transparente.',
    icon: 'account_balance',
  },
  {
    title: 'Simples de usar',
    description:
      'Anuncie ou encontre veículos rapidamente, com uma experiência prática e sem complicação.',
    icon: 'support_agent',
  },
  {
    title: 'Mais clareza nas negociações',
    description:
      'Acesse informações do anúncio e converse diretamente para tomar decisões com mais segurança.',
    icon: 'handshake',
  },
];

export const HOME_IMPORTS = [
  CommonModule,
  RouterLink,
  DecimalPipe,
  VehicleCardComponent,
  WebHeaderComponent,
];

@Component({ template: '' })
export abstract class HomePageBase {
  private readonly router = inject(Router);
  private readonly vehiclesApiService = inject(VehiclesApiService);
  protected readonly authService = inject(AuthService);
  protected readonly favoritesService = inject(FavoritesService);
  protected readonly uiStateService = inject(UiStateService);
  private readonly recentlyViewedService = inject(RecentlyViewedService);

  protected readonly quickShortcuts = QUICK_SHORTCUTS;
  protected readonly featuredCategoryCards = FEATURED_CATEGORY_CARDS;
  protected readonly cities$ = this.vehiclesApiService.cities$;
  protected collections = [...COLLECTIONS];
  protected readonly trustCards = TRUST_CARDS;
  protected readonly heroImage = '/assets/branding/hero-car.png';
  protected readonly avatarFallback =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' rx='60' fill='%23edf4ff'/%3E%3Ccircle cx='60' cy='48' r='20' fill='%23bbcbbb'/%3E%3Cpath d='M27 100c6-24 24-37 33-37s27 13 33 37' fill='%23bbcbbb'/%3E%3C/svg%3E";
  protected readonly vehicleFallback =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='280' viewBox='0 0 400 280'%3E%3Crect width='400' height='280' fill='%23f1f5f9'/%3E%3Cpath d='M60 180 L80 145 L110 108 L290 108 L320 145 L340 180 L340 196 L60 196Z' fill='%23cbd5e1'/%3E%3Cpath d='M115 108 L135 72 L265 72 L285 108Z' fill='%2394a3b8'/%3E%3Cpath d='M140 74 L154 74 L154 102 L130 102Z' fill='%23e2e8f0'/%3E%3Cpath d='M162 70 L238 70 L248 102 L152 102Z' fill='%23e2e8f0'/%3E%3Cpath d='M246 74 L260 74 L270 102 L246 102Z' fill='%23e2e8f0'/%3E%3Ccircle cx='115' cy='196' r='28' fill='%2364748b'/%3E%3Ccircle cx='115' cy='196' r='16' fill='%2394a3b8'/%3E%3Ccircle cx='285' cy='196' r='28' fill='%2364748b'/%3E%3Ccircle cx='285' cy='196' r='16' fill='%2394a3b8'/%3E%3C/svg%3E";

  protected featuredVehicles: VehicleCardItem[] = [];
  protected featuredLoading = true;
  protected carList: VehicleCardItem[] = [];
  protected carsLoading = true;
  protected hasMoreCars = true;
  private currentPage = 1;

  protected get recentlyViewed(): VehicleCardItem[] {
    return this.recentlyViewedService.getAll();
  }

  constructor() {
    this.loadFeaturedVehicles();
    this.loadMoreCars();
    this.loadCollectionStats();
  }

  protected goToSearch(params: Record<string, string | undefined>) {
    this.router.navigate(['/search'], { queryParams: params });
  }

  protected toggleMenu() {
    this.uiStateService.toggleMenu();
  }

  protected toggleNotifications() {
    this.uiStateService.toggleNotifications();
  }

  protected submitSearch(model: string, city: string) {
    this.goToSearch({
      q: model.trim() || undefined,
      city: city.trim() || undefined,
    });
  }

  protected openProtected(path: string) {
    if (!this.authService.hasSession()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    this.router.navigate([path]);
  }

  protected trackByVehicleId(_index: number, vehicle: VehicleCardItem) {
    return vehicle.id;
  }

  protected vehicleSubtitle(vehicle: VehicleCardItem) {
    const descriptors = [
      vehicle.year,
      this.transmissionLabel(vehicle.transmission),
      this.fuelTypeLabel(vehicle.fuelType),
    ]
      .filter(Boolean)
      .join(' • ');

    return descriptors || `${vehicle.brand} ${vehicle.model}`;
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

  protected toggleFavorite(event: Event, vehicle: VehicleCardItem) {
    event.preventDefault();
    event.stopPropagation();
    this.favoritesService.toggleFavorite(vehicle);
  }

  protected get avatarUrl() {
    return (
      this.authService.currentUser()?.profile?.avatarUrl || this.avatarFallback
    );
  }

  protected loadMoreCars() {
    if (!this.hasMoreCars) return;
    this.carsLoading = true;
    this.vehiclesApiService
      .search({ page: this.currentPage, limit: 20 })
      .subscribe({
        next: (response) => {
          this.carList = [...this.carList, ...response.items];
          this.hasMoreCars = response.meta.hasNextPage;
          this.currentPage++;
          this.carsLoading = false;
        },
        error: () => {
          this.carsLoading = false;
        },
      });
  }

  private loadFeaturedVehicles() {
    this.featuredLoading = true;
    this.vehiclesApiService.search({ limit: 15 }).subscribe({
      next: (response) => {
        this.featuredVehicles = response.items;
        this.featuredLoading = false;
      },
      error: () => {
        this.featuredVehicles = [];
        this.featuredLoading = false;
      },
    });
  }

  private loadCollectionStats() {
    this.vehiclesApiService.getStats().subscribe({
      next: (stats) => {
        const counts = [stats.electric, stats.economy, stats.sedan, stats.suvPickup];
        counts.forEach((n, i) => {
          this.collections[i].count =
            n === 0 ? 'Em breve' : `${n} ${n === 1 ? 'veículo' : 'veículos'}`;
        });
      },
    });
  }
}
