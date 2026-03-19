import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FilterModalComponent } from '../../shared/components/filter-modal.component';
import { SearchHeaderComponent } from '../../shared/components/search-header.component';
import { VehicleCardItem } from '../../core/models/domain.models';
import { FavoritesService } from '../../core/services/favorites.service';
import { VehiclesApiService } from '../../core/services/vehicles-api.service';

type SearchQuery = {
  q: string;
  city: string;
  startDate: string;
  endDate: string;
  category: string;
  minPrice: string;
  maxPrice: string;
};

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [
    CommonModule,
    SearchHeaderComponent,
    FilterModalComponent,
  ],
  template: `
    <main class="page search-page">
      <app-search-header
        [title]="'Search Cars'"
        [subtitle]="'Escolha o modelo, ajuste o período e encontre opções premium e econômicas.'"
        [query]="query.q"
        [startDate]="query.startDate"
        [endDate]="query.endDate"
        (search)="onSearch($event)"
        (filters)="filtersOpen = true"
      />

      <section class="search-page__quick-filters">
        <button type="button" class="search-page__quick-card" (click)="filtersOpen = true">
          <span class="material-icons" aria-hidden="true">event_available</span>
          <div>
            <strong>{{ pickupLabel }}</strong>
            <small>{{ pickupHint }}</small>
          </div>
        </button>

        <button type="button" class="search-page__quick-card" (click)="filtersOpen = true">
          <span class="material-icons" aria-hidden="true">event_busy</span>
          <div>
            <strong>{{ returnLabel }}</strong>
            <small>{{ returnHint }}</small>
          </div>
        </button>
      </section>

      <section class="search-page__section" *ngIf="premiumVehicles.length">
        <div class="search-page__section-head">
          <h2>Premium Cars</h2>
          <button type="button" class="search-page__icon-button" (click)="filtersOpen = true">
            <span class="material-icons" aria-hidden="true">tune</span>
          </button>
        </div>

        <div class="search-page__premium-rail">
          <article
            *ngFor="let vehicle of premiumVehicles"
            class="search-page__premium-card"
            tabindex="0"
            role="button"
            (click)="goToVehicle(vehicle.id)"
            (keydown.enter)="goToVehicle(vehicle.id)"
          >
            <div class="search-page__premium-media">
              <button
                type="button"
                class="search-page__favorite"
                [class.search-page__favorite--active]="isFavorite(vehicle.id)"
                [disabled]="isFavoritePending(vehicle.id)"
                [attr.aria-label]="
                  isFavorite(vehicle.id) ? 'Remover dos favoritos' : 'Salvar nos favoritos'
                "
                (click)="toggleFavorite(vehicle, $event)"
              >
                <span class="material-icons" aria-hidden="true">{{
                  isFavorite(vehicle.id) ? 'favorite' : 'favorite_border'
                }}</span>
              </button>
              <img [src]="vehicle.coverImage || fallbackImage" [alt]="vehicle.title" />
            </div>
            <strong>{{ vehicle.dailyRate | currency: 'BRL' : 'symbol' : '1.0-0' }}</strong>
            <span>{{ shortTitle(vehicle.title) }}</span>
          </article>
        </div>
      </section>

      <section class="search-page__section">
        <div class="search-page__section-head">
          <h2>Budget Cars</h2>
          <span>Found: {{ totalItems }} cars</span>
        </div>

        <section class="search-page__budget-grid" *ngIf="displayBudgetVehicles.length">
          <article
            *ngFor="let vehicle of displayBudgetVehicles"
            class="search-page__budget-card"
            tabindex="0"
            role="button"
            (click)="goToVehicle(vehicle.id)"
            (keydown.enter)="goToVehicle(vehicle.id)"
          >
            <div class="search-page__budget-media">
              <button
                type="button"
                class="search-page__favorite"
                [class.search-page__favorite--active]="isFavorite(vehicle.id)"
                [disabled]="isFavoritePending(vehicle.id)"
                [attr.aria-label]="
                  isFavorite(vehicle.id) ? 'Remover dos favoritos' : 'Salvar nos favoritos'
                "
                (click)="toggleFavorite(vehicle, $event)"
              >
                <span class="material-icons" aria-hidden="true">{{
                  isFavorite(vehicle.id) ? 'favorite' : 'favorite_border'
                }}</span>
              </button>
              <img [src]="vehicle.coverImage || fallbackImage" [alt]="vehicle.title" />
            </div>

            <div class="search-page__budget-copy">
              <div class="search-page__budget-top">
                <h3>{{ vehicle.title }}</h3>
                <strong>{{ vehicle.dailyRate | currency: 'BRL' : 'symbol' : '1.0-0' }}</strong>
              </div>

              <div class="search-page__budget-specs">
                <span>
                  <span class="material-icons" aria-hidden="true">tune</span>
                  {{ transmissionLabel(vehicle.transmission) }}
                </span>
                <span>
                  <span class="material-icons" aria-hidden="true">event_seat</span>
                  {{ vehicle.seats }}/{{ vehicle.seats + 2 }}
                </span>
              </div>

              <p>{{ vehicle.city }}, {{ vehicle.state }}</p>
            </div>
          </article>
        </section>

        <p class="loading" *ngIf="loading">Carregando resultados...</p>

        <section class="empty-state" *ngIf="!loading && vehicles.length === 0">
          <h2>Nenhum carro encontrado</h2>
          <p>Tente mudar a cidade ou ampliar a faixa de preço.</p>
        </section>
      </section>

      <div #sentinel class="sentinel" *ngIf="hasNextPage && vehicles.length"></div>

      <app-filter-modal
        [open]="filtersOpen"
        [filters]="query"
        (close)="filtersOpen = false"
        (apply)="applyFilters($event)"
      />
    </main>
  `,
  styles: [
    `
      .search-page {
        display: grid;
        gap: 16px;
        width: min(100%, 440px);
        margin: 0 auto;
        padding: 20px 16px 32px;
      }

      .search-page__quick-filters {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .search-page__quick-card {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        gap: 12px;
        padding: 14px 12px;
        border: 1px solid var(--glass-border);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.98);
        text-align: left;
        box-shadow: var(--shadow-soft);
      }

      .search-page__quick-card .material-icons {
        color: var(--primary);
        font-size: 18px;
      }

      .search-page__quick-card strong,
      .search-page__quick-card small,
      .search-page__section-head h2,
      .search-page__section-head span {
        margin: 0;
      }

      .search-page__quick-card strong {
        display: block;
        color: var(--text-primary);
        font-size: 13px;
      }

      .search-page__quick-card small {
        color: var(--text-secondary);
        font-size: 12px;
      }

      .search-page__section {
        display: grid;
        gap: 14px;
        padding: 18px 16px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid var(--glass-border);
        box-shadow: var(--shadow-soft);
      }

      .search-page__section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .search-page__section-head h2 {
        color: var(--text-primary);
        font-size: 18px;
        font-weight: 700;
      }

      .search-page__section-head span {
        color: var(--text-secondary);
        font-size: 13px;
      }

      .search-page__icon-button {
        display: inline-grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border: 0;
        border-radius: 999px;
        background: var(--surface-muted);
        color: var(--text-secondary);
      }

      .search-page__premium-rail {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(146px, 1fr);
        gap: 12px;
        overflow-x: auto;
      }

      .search-page__premium-card,
      .search-page__budget-card {
        min-width: 0;
        border: 0;
        text-align: left;
        color: inherit;
        cursor: pointer;
      }

      .search-page__premium-card {
        display: grid;
        gap: 10px;
        padding: 0;
        background: transparent;
      }

      .search-page__premium-media {
        position: relative;
        min-height: 112px;
        border-radius: 16px;
        overflow: hidden;
        background: linear-gradient(180deg, #fffdfd 0%, #f5efef 100%);
        border: 1px solid var(--glass-border-soft);
      }

      .search-page__premium-media img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .search-page__favorite {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border: 0;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.94);
        color: var(--text-secondary);
        box-shadow: 0 8px 18px rgba(28, 17, 18, 0.08);
      }

      .search-page__favorite--active {
        color: var(--primary);
      }

      .search-page__premium-card strong {
        color: var(--primary);
        font-size: 16px;
        font-weight: 800;
      }

      .search-page__premium-card span {
        color: var(--text-primary);
        font-size: 14px;
        line-height: 1.2;
      }

      .search-page__budget-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .search-page__budget-card {
        display: grid;
        gap: 10px;
        padding: 12px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid var(--glass-border-soft);
        box-shadow: 0 12px 24px rgba(28, 17, 18, 0.08);
      }

      .search-page__budget-media {
        position: relative;
        min-height: 118px;
        border-radius: 14px;
        overflow: hidden;
        background: linear-gradient(180deg, #fffdfd 0%, #f5efef 100%);
      }

      .search-page__budget-media img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .search-page__budget-copy {
        display: grid;
        gap: 8px;
      }

      .search-page__budget-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }

      .search-page__budget-top h3,
      .search-page__budget-copy p {
        margin: 0;
      }

      .search-page__budget-top h3 {
        font-size: 15px;
        line-height: 1.2;
        color: var(--text-primary);
      }

      .search-page__budget-top strong {
        color: var(--primary);
        font-size: 18px;
        font-weight: 800;
        letter-spacing: -0.03em;
      }

      .search-page__budget-specs {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        color: var(--text-secondary);
        font-size: 12px;
        font-weight: 600;
      }

      .search-page__budget-specs span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .search-page__budget-specs .material-icons {
        font-size: 15px;
      }

      .search-page__budget-copy p {
        color: var(--text-secondary);
        font-size: 12px;
      }

      .empty-state,
      .loading {
        padding: 18px;
        border-radius: 22px;
        background: var(--surface-muted);
        border: 1px solid var(--glass-border-soft);
        text-align: center;
        color: var(--text-secondary);
      }

      .empty-state h2 {
        margin-top: 0;
        color: var(--text-primary);
      }

      .sentinel {
        height: 1px;
      }

      @media (max-width: 420px) {
        .search-page__quick-filters,
        .search-page__budget-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      @media (max-width: 380px) {
        .search-page__premium-rail {
          grid-auto-columns: minmax(136px, 1fr);
        }
      }
    `,
  ],
})
export class SearchPageComponent implements AfterViewInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly favoritesService = inject(FavoritesService);
  private readonly vehiclesApiService = inject(VehiclesApiService);

  @ViewChild('sentinel') sentinelRef?: ElementRef<HTMLDivElement>;

  protected vehicles: VehicleCardItem[] = [];
  protected loading = false;
  protected hasNextPage = false;
  protected totalItems = 0;
  protected filtersOpen = false;
  protected readonly fallbackImage =
    'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80';
  protected query: SearchQuery = {
    q: '',
    city: '',
    startDate: '',
    endDate: '',
    category: '',
    minPrice: '',
    maxPrice: '',
  };

  private currentPage = 1;
  private observer?: IntersectionObserver;

  protected get premiumVehicles() {
    return this.vehicles.slice(0, 3);
  }

  protected get displayBudgetVehicles() {
    const budgetVehicles = this.vehicles.slice(3);
    return budgetVehicles.length ? budgetVehicles : this.vehicles;
  }

  protected get pickupLabel() {
    return this.query.startDate ? this.formatShortDate(this.query.startDate) : 'Retirada';
  }

  protected get pickupHint() {
    return this.query.startDate ? 'Data selecionada' : 'Escolha o dia';
  }

  protected get returnLabel() {
    return this.query.endDate ? this.formatShortDate(this.query.endDate) : 'Devolução';
  }

  protected get returnHint() {
    return this.query.endDate ? 'Fim da reserva' : 'Defina o retorno';
  }

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.query = {
          q: params.get('q') || '',
          city: params.get('city') || '',
          startDate: params.get('startDate') || '',
          endDate: params.get('endDate') || '',
          category: params.get('category') || '',
          minPrice: params.get('minPrice') || '',
          maxPrice: params.get('maxPrice') || '',
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

  protected applyFilters(filters: Record<string, string>) {
    this.filtersOpen = false;
    this.router.navigate(['/search'], {
      queryParams: {
        ...this.query,
        ...filters,
      },
    });
  }

  protected goToVehicle(vehicleId: string) {
    this.router.navigate(['/vehicles', vehicleId]);
  }

  protected isFavorite(vehicleId: string) {
    return this.favoritesService.isFavorite(vehicleId);
  }

  protected isFavoritePending(vehicleId: string) {
    return this.favoritesService.isPending(vehicleId);
  }

  protected toggleFavorite(vehicle: VehicleCardItem, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.favoritesService.toggleFavorite(vehicle);
  }

  private fetchVehicles() {
    this.loading = true;

    this.vehiclesApiService
      .search({
        ...this.query,
        page: this.currentPage,
        limit: 8,
      })
      .subscribe({
        next: (response) => {
          this.vehicles = [...this.vehicles, ...response.items];
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
      this.observer?.disconnect();
      this.observer?.observe(this.sentinelRef.nativeElement);
    }
  }

  private formatShortDate(date: string) {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
    }).format(new Date(`${date}T12:00:00`));
  }

  protected shortTitle(title: string) {
    return title.length > 18 ? `${title.slice(0, 18)}...` : title;
  }

  protected transmissionLabel(transmission: string) {
    const labels: Record<string, string> = {
      AUTOMATIC: 'Auto',
      MANUAL: 'Manual',
      CVT: 'CVT',
    };

    return labels[transmission] || transmission;
  }
}
