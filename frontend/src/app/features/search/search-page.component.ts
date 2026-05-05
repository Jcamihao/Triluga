import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FilterModalComponent } from '../../shared/components/filter-modal/filter-modal.component';
import { VehicleCardItem, VehicleType } from '../../core/models/domain.models';
import { AuthService } from '../../core/services/auth.service';
import { SearchAlertsApiService } from '../../core/services/search-alerts-api.service';
import { UiStateService } from '../../core/services/ui-state.service';
import { VehiclesApiService } from '../../core/services/vehicles-api.service';
import { WebHeaderComponent } from '../../shared/components/web-header/web-header.component';
import { VehicleCardComponent } from '../../shared/components/vehicle-card/vehicle-card.component';

type SearchQuery = {
  q: string;
  city: string;
  vehicleType: VehicleType | '';
  category: string;
  motorcycleStyle: string;
  minEngineCc: string;
  maxEngineCc: string;
  minPrice: string;
  maxPrice: string;
  latitude: string;
  longitude: string;
  radiusKm: string;
  sort: string;
  transmission: string;
  fuelType: string;
  minYear: string;
  maxYear: string;
};

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FilterModalComponent,
    WebHeaderComponent,
    VehicleCardComponent,
  ],
  templateUrl: './search-page.component.html',
  styleUrls: ['./search-page.component.scss'],
})
export class SearchPageComponent implements AfterViewInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly vehiclesApiService = inject(VehiclesApiService);
  protected readonly uiStateService = inject(UiStateService);
  private readonly authService = inject(AuthService);
  private readonly searchAlertsApiService = inject(SearchAlertsApiService);

  private sentinelRef?: ElementRef<HTMLDivElement>;
  private sentinelObservationQueued = false;

  @ViewChild('sentinel')
  set sentinelElementRef(value: ElementRef<HTMLDivElement> | undefined) {
    this.sentinelRef = value;

    if (value) {
      this.observeSentinel();
    }
  }

  protected vehicles: VehicleCardItem[] = [];
  protected loading = false;
  protected hasNextPage = false;
  protected totalItems = 0;
  protected filtersOpen = false;
  protected alertFeedback = '';
  protected savingAlert = false;
  protected accordions: Record<string, boolean> = {
    year: false,
    fuel: false,
  };
  protected query: SearchQuery = {
    q: '',
    city: '',
    vehicleType: '',
    category: '',
    motorcycleStyle: '',
    minEngineCc: '',
    maxEngineCc: '',
    minPrice: '',
    maxPrice: '',
    latitude: '',
    longitude: '',
    radiusKm: '',
    sort: 'relevance',
    transmission: '',
    fuelType: '',
    minYear: '',
    maxYear: '',
  };

  protected currentPage = 1;
  private observer?: IntersectionObserver;

  protected get totalPages() {
    return Math.ceil(this.totalItems / 21);
  }

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.query = {
        q: params.get('q') || '',
        city: params.get('city') || '',
        vehicleType: (params.get('vehicleType') as VehicleType | '') || '',
        category: params.get('category') || '',
        motorcycleStyle: params.get('motorcycleStyle') || '',
        minEngineCc: params.get('minEngineCc') || '',
        maxEngineCc: params.get('maxEngineCc') || '',
        minPrice: params.get('minPrice') || '',
        maxPrice: params.get('maxPrice') || '',
        latitude: params.get('latitude') || '',
        longitude: params.get('longitude') || '',
        radiusKm: params.get('radiusKm') || '',
        sort: params.get('sort') || 'relevance',
        transmission: params.get('transmission') || '',
        fuelType: params.get('fuelType') || '',
        minYear: params.get('minYear') || '',
        maxYear: params.get('maxYear') || '',
      };
      this.currentPage = 1;
      this.vehicles = [];
      this.fetchVehicles();
    });
  }

  ngAfterViewInit() {
    this.observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;

        if (entry.isIntersecting && this.hasNextPage && !this.loading) {
          this.currentPage += 1;
          this.fetchVehicles();
        }
      },
      { rootMargin: '160px' },
    );

    queueMicrotask(() => this.observeSentinel());
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }

  protected onSearch(query: { q: string }) {
    this.router.navigate(['/search'], {
      queryParams: {
        ...this.query,
        ...query,
      },
    });
  }

  protected toggleMenu() {
    this.uiStateService.toggleMenu();
  }

  protected toggleNotifications() {
    this.uiStateService.toggleNotifications();
  }

  protected applyFilters(filters: any) {
    this.filtersOpen = false;
    this.router.navigate(['/search'], {
      queryParams: {
        ...this.query,
        ...filters,
      },
    });
  }

  protected useCurrentLocation() {
    if (!('geolocation' in navigator)) {
      globalThis.alert('Geolocalização não disponível neste navegador.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this.router.navigate(['/search'], {
          queryParams: {
            ...this.query,
            latitude: coords.latitude.toFixed(6),
            longitude: coords.longitude.toFixed(6),
            radiusKm: this.query.radiusKm || '20',
          },
        });
      },
      () => {
        globalThis.alert('Não foi possível obter sua localização agora.');
      },
      {
        enableHighAccuracy: true,
      },
    );
  }

  protected clearLocationFilter() {
    this.router.navigate(['/search'], {
      queryParams: {
        ...this.query,
        latitude: '',
        longitude: '',
        radiusKm: '',
      },
    });
  }

  protected showAllAds() {
    this.router.navigate(['/search'], {
      queryParams: {},
    });
  }

  protected browseCars() {
    this.router.navigate(['/search'], {
      queryParams: {
        ...this.query,
        vehicleType: 'CAR',
      },
    });
  }

  protected browseMotorcycles() {
    this.router.navigate(['/search'], {
      queryParams: {
        ...this.query,
        vehicleType: 'MOTORCYCLE',
      },
    });
  }

  protected toggleVehicleTypeFilter(type: VehicleType) {
    this.router.navigate(['/search'], {
      queryParams: {
        ...this.query,
        vehicleType: this.query.vehicleType === type ? '' : type,
      },
    });
  }

  protected goToPublish() {
    this.router.navigate(['/anunciar-carro']);
  }

  protected saveSearchAlert() {
    if (this.savingAlert) {
      return;
    }

    if (!this.authService.hasSession()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    const filters = this.buildSearchAlertFilters();

    if (!Object.keys(filters).length) {
      this.alertFeedback =
        'Aplique pelo menos um filtro antes de salvar o alerta.';
      return;
    }

    this.savingAlert = true;
    this.alertFeedback = '';
    this.searchAlertsApiService
      .create({
        title: this.buildSearchAlertTitle(filters),
        filters,
      })
      .subscribe({
        next: () => {
          this.savingAlert = false;
          this.alertFeedback = 'Alerta salvo.';
        },
        error: (error) => {
          this.savingAlert = false;
          this.alertFeedback =
            error?.error?.message || 'Não foi possível salvar o alerta.';
        },
      });
  }

  protected setWebPrice(changed: 'min' | 'max', value: string) {
    const normalizedValue = String(
      Math.max(0, Math.min(2000, Number(value) || 0)),
    );
    const currentMin = Number(this.query.minPrice || 0);
    const currentMax = Number(this.query.maxPrice || 2000);

    if (changed === 'min') {
      const nextMin = Math.min(Number(normalizedValue), currentMax);
      this.query.minPrice = nextMin > 0 ? String(nextMin) : '';
      return;
    }

    const nextMax = Math.max(Number(normalizedValue), currentMin);
    this.query.maxPrice = nextMax < 2000 ? String(nextMax) : '';
  }

  protected get webPriceTrackLeft() {
    return (Number(this.query.minPrice || 0) / 2000) * 100;
  }

  protected get webPriceTrackWidth() {
    const min = Number(this.query.minPrice || 0);
    const max = Number(this.query.maxPrice || 2000);
    return ((max - min) / 2000) * 100;
  }

  protected loadMore() {
    if (this.loading || !this.hasNextPage) return;
    this.currentPage += 1;
    this.fetchVehicles(true);
  }

  protected goToPage(page: number) {
    if (this.loading || page === this.currentPage) return;
    this.currentPage = page;
    this.vehicles = [];
    this.fetchVehicles(false);
  }

  private fetchVehicles(append = true) {
    this.loading = true;

    this.vehiclesApiService
      .search({
        ...this.query,
        page: this.currentPage,
        limit: 21,
        sort: this.query.sort,
        transmission: this.query.transmission,
        fuelType: this.query.fuelType,
        minYear: this.query.minYear ? Number(this.query.minYear) : undefined,
        maxYear: this.query.maxYear ? Number(this.query.maxYear) : undefined,
      })
      .subscribe({
        next: (response) => {
          this.vehicles = append
            ? [...this.vehicles, ...response.items]
            : response.items;
          this.hasNextPage = response.meta.hasNextPage;
          this.totalItems = response.meta.total;
          this.loading = false;
          this.observeSentinel();
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  private observeSentinel() {
    if (this.sentinelRef?.nativeElement) {
      this.sentinelObservationQueued = false;
      this.observer?.disconnect();
      this.observer?.observe(this.sentinelRef.nativeElement);
      return;
    }

    if (!this.sentinelObservationQueued) {
      this.sentinelObservationQueued = true;
      queueMicrotask(() => this.observeSentinel());
    }
  }

  protected get hasLocationFilter() {
    return !!this.query.latitude && !!this.query.longitude;
  }

  protected get activeSearchPills() {
    const pills: { key: string; label: string }[] = [];

    if (this.query.q) {
      pills.push({ key: 'q', label: `Termo: ${this.query.q}` });
    }

    if (this.query.city) {
      pills.push({ key: 'city', label: this.query.city });
    }

    if (this.query.vehicleType === 'CAR') {
      pills.push({ key: 'vehicleType', label: 'Carros' });
    }

    if (this.query.vehicleType === 'MOTORCYCLE') {
      pills.push({ key: 'vehicleType', label: 'Motos' });
    }

    if (this.query.maxPrice) {
      pills.push({ key: 'maxPrice', label: `Até R$ ${this.query.maxPrice}` });
    }

    if (this.hasLocationFilter) {
      pills.push({
        key: 'location',
        label: `Raio de ${this.query.radiusKm || '20'} km`,
      });
    }

    return pills;
  }

  protected removeFilter(key: string) {
    if (key === 'location') {
      this.clearLocationFilter();
      return;
    }

    this.router.navigate(['/search'], {
      queryParams: {
        ...this.query,
        [key]: '',
      },
    });
  }

  protected get searchOverviewTitle() {
    if (this.query.vehicleType === 'MOTORCYCLE') {
      return this.query.city
        ? `Motos em radar por ${this.query.city}`
        : 'Motos em radar';
    }

    if (this.query.vehicleType === 'CAR') {
      return this.query.city
        ? `Carros em radar por ${this.query.city}`
        : 'Carros em radar';
    }

    return this.query.city
      ? `Encontre seu carro ideal em ${this.query.city}`
      : 'Encontre seu carro ideal';
  }

  protected get webResultsTitle() {
    const city = this.query.city || 'São Paulo, SP';

    if (this.query.vehicleType === 'MOTORCYCLE') {
      return `Motos em ${city}`;
    }

    if (this.query.vehicleType === 'CAR') {
      return `Veículos em ${city}`;
    }

    return `Veículos em ${city}`;
  }

  protected get searchOverviewSubtitle() {
    if (this.hasLocationFilter) {
      return 'Use os filtros para encontrar anúncios perto de você e seguir direto para o contato com o anunciante.';
    }

    return 'Filtre por cidade, tipo de veículo e faixa de preço para encontrar seu carro ideal mais rápido.';
  }

  protected get searchTitle() {
    if (this.query.vehicleType === 'CAR') {
      return 'Buscar carros';
    }

    return this.query.vehicleType === 'MOTORCYCLE'
      ? 'Buscar motos'
      : 'Buscar veículos';
  }

  protected get searchSubtitle() {
    if (this.query.vehicleType === 'CAR') {
      return 'Filtre por modelo, cidade e preço para encontrar carros e seguir para o chat com quem anunciou.';
    }

    return this.query.vehicleType === 'MOTORCYCLE'
      ? 'Filtre por modelo, cidade e preço para encontrar motos e ir direto ao anúncio.'
      : 'Filtre por modelo, cidade e preço para encontrar seu carro ideal.';
  }

  protected get resultsLabel() {
    if (this.query.vehicleType === 'CAR') {
      return 'carros encontrados';
    }

    return this.query.vehicleType === 'MOTORCYCLE'
      ? 'motos encontradas'
      : 'veículos encontrados';
  }

  protected get emptyStateTitle() {
    if (this.query.vehicleType === 'CAR') {
      return 'Nenhum carro encontrado';
    }

    return this.query.vehicleType === 'MOTORCYCLE'
      ? 'Nenhuma moto encontrada'
      : 'Nenhum veículo encontrado';
  }

  protected get emptyStateDescription() {
    if (this.query.vehicleType === 'CAR') {
      return 'Tente mudar a cidade ou ampliar a faixa de preço para ver mais carros.';
    }

    return this.query.vehicleType === 'MOTORCYCLE'
      ? 'Tente mudar a cidade ou ampliar a faixa de preço para ver mais motos.'
      : 'Tente mudar a cidade, o tipo de veículo ou ampliar a faixa de preço.';
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

  private buildSearchAlertFilters() {
    const ignoredKeys = new Set(['sort']);

    return Object.fromEntries(
      Object.entries(this.query).filter(
        ([key, value]) => !ignoredKeys.has(key) && value !== '',
      ),
    );
  }

  private buildSearchAlertTitle(filters: Record<string, unknown>) {
    if (typeof filters['q'] === 'string') {
      return `Busca por ${filters['q']}`;
    }

    if (typeof filters['city'] === 'string') {
      return `Veículos em ${filters['city']}`;
    }

    if (filters['vehicleType'] === 'MOTORCYCLE') {
      return 'Alerta de motos';
    }

    return 'Alerta de veículos';
  }
}
