import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { ResetPasswordDesktopComponent } from './reset-password-desktop.component';
import { ResetPasswordMobileComponent } from './reset-password-mobile.component';

@Component({
  selector: 'app-reset-password-page',
  standalone: true,
  imports: [CommonModule, ResetPasswordMobileComponent, ResetPasswordDesktopComponent],
  template: `
    <app-reset-password-mobile *ngIf="isMobile"></app-reset-password-mobile>
    <app-reset-password-desktop *ngIf="!isMobile"></app-reset-password-desktop>
  `,
})
export class ResetPasswordPageComponent implements OnDestroy {
  protected isMobile = this.detectMobile();
  private mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)') : null;
  private mqListener = (e: MediaQueryListEvent) => { this.isMobile = e.matches; };
  constructor() { this.mq?.addEventListener('change', this.mqListener); }
  ngOnDestroy() { this.mq?.removeEventListener('change', this.mqListener); }
  private detectMobile(): boolean {
    return typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false;
  }
}
