import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { SearchDesktopComponent } from './search-desktop.component';
import { SearchMobileComponent } from './search-mobile.component';

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [CommonModule, SearchMobileComponent, SearchDesktopComponent],
  template: `
    <app-search-mobile *ngIf="isMobile"></app-search-mobile>
    <app-search-desktop *ngIf="!isMobile"></app-search-desktop>
  `,
})
export class SearchPageComponent implements OnDestroy {
  protected isMobile = this.detectMobile();
  private mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)') : null;
  private mqListener = (e: MediaQueryListEvent) => { this.isMobile = e.matches; };
  constructor() { this.mq?.addEventListener('change', this.mqListener); }
  ngOnDestroy() { this.mq?.removeEventListener('change', this.mqListener); }
  private detectMobile(): boolean {
    return typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false;
  }
}
