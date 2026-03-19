import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FavoritesService } from '../../core/services/favorites.service';
import { VehicleCardComponent } from '../../shared/components/vehicle-card.component';

@Component({
  selector: 'app-favorites-page',
  standalone: true,
  imports: [CommonModule, RouterLink, VehicleCardComponent],
  template: `
    <main class="page favorites-page">
      <section class="favorites-card">
        <span class="eyebrow">Favoritos</span>
        <h1>Seus carros salvos</h1>
        <p>Continue acompanhando os anúncios que chamaram sua atenção.</p>
      </section>

      <section class="favorites-list" *ngIf="favoriteItems.length; else emptyState">
        <app-vehicle-card
          *ngFor="let vehicle of favoriteItems"
          [vehicle]="vehicle"
        />
      </section>

      <ng-template #emptyState>
        <section class="empty-card">
          <strong>Nenhum favorito salvo ainda</strong>
          <p>Explore os anúncios e toque no coração para montar sua lista.</p>
          <a routerLink="/search" class="btn btn-primary">Buscar carros</a>
        </section>
      </ng-template>
    </main>
  `,
  styles: [
    `
      .favorites-page {
        display: grid;
        gap: 18px;
        padding: 20px 16px 32px;
      }

      .favorites-card,
      .empty-card {
        display: grid;
        gap: 12px;
        padding: 22px;
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid var(--glass-border);
        box-shadow: var(--shadow-soft);
      }

      .favorites-list {
        display: grid;
        gap: 10px;
      }

      .eyebrow {
        color: var(--primary);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }

      h1,
      p,
      strong {
        margin: 0;
      }

      p {
        color: var(--text-secondary);
      }

      .empty-card .btn {
        width: fit-content;
        text-decoration: none;
      }
    `,
  ],
})
export class FavoritesPageComponent {
  protected readonly favoritesService = inject(FavoritesService);

  constructor() {
    this.favoritesService.refresh();
  }

  protected get favoriteItems() {
    return this.favoritesService.items();
  }
}
