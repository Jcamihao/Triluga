import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { PlanPageDesktopComponent } from './plan-page-desktop.component';
import { PlanPageMobileComponent } from './plan-page-mobile.component';

@Component({
  selector: 'app-plan-page',
  standalone: true,
  imports: [CommonModule, PlanPageMobileComponent, PlanPageDesktopComponent],
  template: `
    <app-plan-page-mobile *ngIf="isMobile"></app-plan-page-mobile>
    <app-plan-page-desktop *ngIf="!isMobile"></app-plan-page-desktop>
  `,
})
export class PlanPageComponent implements OnDestroy {
  protected isMobile = this.detectMobile();
  private mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)') : null;
  private mqListener = (e: MediaQueryListEvent) => { this.isMobile = e.matches; };
  constructor() { this.mq?.addEventListener('change', this.mqListener); }
  ngOnDestroy() { this.mq?.removeEventListener('change', this.mqListener); }
  private detectMobile(): boolean {
    return typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false;
  }
}
