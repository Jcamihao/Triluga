import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { VehicleCardItem } from '../../core/models/domain.models';
import { AuthService } from '../../core/services/auth.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { UiStateService } from '../../core/services/ui-state.service';
import { VehiclesApiService } from '../../core/services/vehicles-api.service';
import { VehicleCardComponent } from '../../shared/components/vehicle-card/vehicle-card.component';
import { WebHeaderComponent } from '../../shared/components/web-header/web-header.component';

type QuickShortcut = {
  label: string;
  icon: string;
  filterValue: string;
};

type CategoryCard = {
  label: string;
  value: string;
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
  { label: 'Carros', icon: 'directions_car', filterValue: 'CAR' },
  { label: 'Motos', icon: 'two_wheeler', filterValue: 'MOTORCYCLE' },
  { label: 'Híbridos', icon: 'eco', filterValue: 'HYBRID' },
  { label: 'SUVs', icon: 'airport_shuttle', filterValue: 'SUV' },
  { label: 'Luxo', icon: 'workspace_premium', filterValue: 'LUXURY' },
];

const FEATURED_CATEGORY_CARDS: CategoryCard[] = [
  {
    label: 'Luxo & Executivos',
    value: 'LUXURY',
    image: 'assets/categories/luxury_exec.png',
  },
  {
    label: 'Econômicos',
    value: 'ECONOMY',
    image: 'assets/categories/economy.png',
  },
  {
    label: 'Para Viagem',
    value: 'TRAVEL',
    image: 'assets/categories/travel.png',
  },
  {
    label: 'Clássicos',
    value: 'CLASSIC',
    image: 'assets/categories/classic.png',
  },
];

const COLLECTIONS: CollectionCard[] = [
  {
    label: 'Esportivos',
    count: '420 veículos',
    icon: 'directions_car',
    params: { category: 'LUXURY' },
    fallbackImage: 'assets/categories/luxury.png',
  },
  {
    label: 'Elétricos',
    count: '185 veículos',
    icon: 'electric_car',
    params: { fuelType: 'ELECTRIC' },
    fallbackImage: 'assets/categories/electric.png',
  },
  {
    label: 'Motos Premium',
    count: '310 veículos',
    icon: 'two_wheeler',
    params: { vehicleType: 'MOTORCYCLE' },
    fallbackImage: 'assets/categories/motorcycle.png',
  },
  {
    label: 'SUVs & Pickups',
    count: '890 veículos',
    icon: 'airport_shuttle',
    params: { category: 'SUV' },
    fallbackImage: 'assets/categories/suv.png',
  },
];

const TRUST_CARDS: TrustCard[] = [
  {
    title: 'Vistoria Cautelar Inclusa',
    description:
      'Todos os veículos premium passam por uma análise estrutural e documental rigorosa antes de entrar no catálogo.',
    icon: 'verified_user',
  },
  {
    title: 'Pagamento Seguro',
    description:
      'Seu dinheiro fica protegido até que a experiência seja confirmada entre as partes.',
    icon: 'account_balance',
  },
  {
    title: 'Concierge Dedicado',
    description:
      'Especialistas acompanham toda a jornada, da negociação inicial até a entrega das chaves.',
    icon: 'support_agent',
  },
  {
    title: 'Comunidade Curada',
    description:
      'Perfil verificado para locadores e motoristas, criando um ambiente exclusivo e confiável.',
    icon: 'handshake',
  },
];

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    DecimalPipe,
    VehicleCardComponent,
    WebHeaderComponent,
  ],
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.scss'],
})
export class HomePageComponent {
  private readonly router = inject(Router);
  private readonly vehiclesApiService = inject(VehiclesApiService);
  protected readonly authService = inject(AuthService);
  protected readonly favoritesService = inject(FavoritesService);
  protected readonly uiStateService = inject(UiStateService);

  protected readonly quickShortcuts = QUICK_SHORTCUTS;
  protected readonly featuredCategoryCards = FEATURED_CATEGORY_CARDS;
  protected collections = [...COLLECTIONS];
  protected readonly trustCards = TRUST_CARDS;
  protected readonly heroImage =
    'https://lh3.googleusercontent.com/aida-public/AB6AXuCgWEXo-PCnbATRalSZAC7Zj9P8GnKTtyRSE8rWW8yQotJ2qZeVm_fzauK3EygoN6IMFvAN8yf-AR-m3cnNlVPGp3LvCSm9ku71aX59NmmyHm9wp4OGXl7cS308DeNKHIj6Va5KV37-S-TBxL_5Nhg5qElOj7Iw8vce_julRHCAqjO_ZSar6vorrD06NnlwoWA3N4zsqUBPpv_28-zK4bBwYP7w8idQ3OzJZcHijUBZl5VggASi9SavL4Bxp7acvNbvCRSvCX1N9NMK';
  protected readonly avatarFallback =
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDVVPsQebFXSU8SAlguZUvq2_i2z1jIfEJqpAThFnCSc2ft_oNkdEoNzAIYc0rX3hHIb8cYJe4JAwzItbHvpYpzYRddssJLYqPLOXXxIH2AIsyANlVZXBdEzpM45Hlm3-2SzIm3G6rhbcRAv7fUDnaZqDPy6A90YSb8PEg0vb6DyZOw0UTiBKcVBUos-ycRHw0iJ_yJHffmCZfHjUTODmg4V6ZaRIgOKeFUwUsURc-JAzRR9PQwPZYXfwLNxSVks59Du_yrwoaAU6a1';
  protected readonly vehicleFallback =
    'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80';

  protected featuredVehicles: VehicleCardItem[] = [];
  protected featuredLoading = true;
  protected carList: VehicleCardItem[] = [];
  protected carsLoading = true;
  protected hasMoreCars = true;
  private currentPage = 1;

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
      .search({ page: this.currentPage, limit: 12 })
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
    this.vehiclesApiService.search({ limit: 3 }).subscribe({
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
        this.collections[0].count = `${stats.luxury} veículos`;
        this.collections[1].count = `${stats.electric} veículos`;
        this.collections[2].count = `${stats.motorcycle} veículos`;
        this.collections[3].count = `${stats.suvPickup} veículos`;
      },
    });
  }
}
