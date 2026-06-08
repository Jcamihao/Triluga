import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { HomeDesktopComponent } from './home-desktop.component';
import { HomeMobileComponent } from './home-mobile.component';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, HomeMobileComponent, HomeDesktopComponent],
  template: `
    <app-home-mobile *ngIf="isMobile"></app-home-mobile>
    <app-home-desktop *ngIf="!isMobile"></app-home-desktop>
  `,
})
export class HomePageComponent implements OnDestroy {
  protected isMobile = this.detectMobile();
  private mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)') : null;
  private mqListener = (e: MediaQueryListEvent) => { this.isMobile = e.matches; };
  constructor() { this.mq?.addEventListener('change', this.mqListener); }
  ngOnDestroy() { this.mq?.removeEventListener('change', this.mqListener); }
  private detectMobile(): boolean {
    return typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false;
  }
}
