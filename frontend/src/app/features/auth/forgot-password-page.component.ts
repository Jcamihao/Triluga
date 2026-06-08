import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { ForgotPasswordDesktopComponent } from './forgot-password-desktop.component';
import { ForgotPasswordMobileComponent } from './forgot-password-mobile.component';

@Component({
  selector: 'app-forgot-password-page',
  standalone: true,
  imports: [CommonModule, ForgotPasswordMobileComponent, ForgotPasswordDesktopComponent],
  template: `
    <app-forgot-password-mobile *ngIf="isMobile"></app-forgot-password-mobile>
    <app-forgot-password-desktop *ngIf="!isMobile"></app-forgot-password-desktop>
  `,
})
export class ForgotPasswordPageComponent implements OnDestroy {
  protected isMobile = this.detectMobile();
  private mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)') : null;
  private mqListener = (e: MediaQueryListEvent) => { this.isMobile = e.matches; };
  constructor() { this.mq?.addEventListener('change', this.mqListener); }
  ngOnDestroy() { this.mq?.removeEventListener('change', this.mqListener); }
  private detectMobile(): boolean {
    return typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false;
  }
}
