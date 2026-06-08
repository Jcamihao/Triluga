import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { CompareDesktopComponent } from './compare-desktop.component';
import { CompareMobileComponent } from './compare-mobile.component';

@Component({
  selector: 'app-compare-page',
  standalone: true,
  imports: [CommonModule, CompareMobileComponent, CompareDesktopComponent],
  template: `
    <app-compare-mobile *ngIf="isMobile"></app-compare-mobile>
    <app-compare-desktop *ngIf="!isMobile"></app-compare-desktop>
  `,
})
export class ComparePageComponent implements OnDestroy {
  protected isMobile = this.detectMobile();
  private mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)') : null;
  private mqListener = (e: MediaQueryListEvent) => { this.isMobile = e.matches; };
  constructor() { this.mq?.addEventListener('change', this.mqListener); }
  ngOnDestroy() { this.mq?.removeEventListener('change', this.mqListener); }
  private detectMobile(): boolean {
    return typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false;
  }
}
