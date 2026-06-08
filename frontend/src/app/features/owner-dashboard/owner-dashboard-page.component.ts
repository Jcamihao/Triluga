import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { OwnerDashboardDesktopComponent } from './owner-dashboard-desktop.component';
import { OwnerDashboardMobileComponent } from './owner-dashboard-mobile.component';

@Component({
  selector: 'app-owner-dashboard-page',
  standalone: true,
  imports: [CommonModule, OwnerDashboardMobileComponent, OwnerDashboardDesktopComponent],
  template: `
    <app-owner-dashboard-mobile *ngIf="isMobile"></app-owner-dashboard-mobile>
    <app-owner-dashboard-desktop *ngIf="!isMobile"></app-owner-dashboard-desktop>
  `,
})
export class OwnerDashboardPageComponent implements OnDestroy {
  protected isMobile = this.detectMobile();
  private mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)') : null;
  private mqListener = (e: MediaQueryListEvent) => { this.isMobile = e.matches; };
  constructor() { this.mq?.addEventListener('change', this.mqListener); }
  ngOnDestroy() { this.mq?.removeEventListener('change', this.mqListener); }
  private detectMobile(): boolean {
    return typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false;
  }
}
