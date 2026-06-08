import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { FavoritesDesktopComponent } from './favorites-desktop.component';
import { FavoritesMobileComponent } from './favorites-mobile.component';

@Component({
  selector: 'app-favorites-page',
  standalone: true,
  imports: [CommonModule, FavoritesMobileComponent, FavoritesDesktopComponent],
  template: `
    <app-favorites-mobile *ngIf="isMobile"></app-favorites-mobile>
    <app-favorites-desktop *ngIf="!isMobile"></app-favorites-desktop>
  `,
})
export class FavoritesPageComponent implements OnDestroy {
  protected isMobile = this.detectMobile();
  private mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)') : null;
  private mqListener = (e: MediaQueryListEvent) => { this.isMobile = e.matches; };
  constructor() { this.mq?.addEventListener('change', this.mqListener); }
  ngOnDestroy() { this.mq?.removeEventListener('change', this.mqListener); }
  private detectMobile(): boolean {
    return typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false;
  }
}
