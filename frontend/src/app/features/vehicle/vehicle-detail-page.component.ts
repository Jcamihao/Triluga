import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { VehicleDetailDesktopComponent } from './vehicle-detail-desktop.component';
import { VehicleDetailMobileComponent } from './vehicle-detail-mobile.component';

@Component({
  selector: 'app-vehicle-detail-page',
  standalone: true,
  imports: [CommonModule, VehicleDetailMobileComponent, VehicleDetailDesktopComponent],
  template: `
    <app-vehicle-detail-mobile *ngIf="isMobile"></app-vehicle-detail-mobile>
    <app-vehicle-detail-desktop *ngIf="!isMobile"></app-vehicle-detail-desktop>
  `,
})
export class VehicleDetailPageComponent implements OnDestroy {
  protected isMobile = this.detectMobile();
  private mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)') : null;
  private mqListener = (e: MediaQueryListEvent) => { this.isMobile = e.matches; };
  constructor() { this.mq?.addEventListener('change', this.mqListener); }
  ngOnDestroy() { this.mq?.removeEventListener('change', this.mqListener); }
  private detectMobile(): boolean {
    return typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false;
  }
}
