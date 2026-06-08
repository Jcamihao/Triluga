import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { LoginDesktopComponent } from './login-desktop.component';
import { LoginMobileComponent } from './login-mobile.component';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, LoginMobileComponent, LoginDesktopComponent],
  template: `
    <app-login-mobile *ngIf="isMobile"></app-login-mobile>
    <app-login-desktop *ngIf="!isMobile"></app-login-desktop>
  `,
})
export class LoginPageComponent implements OnDestroy {
  protected isMobile = this.detectMobile();
  private mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)') : null;
  private mqListener = (e: MediaQueryListEvent) => { this.isMobile = e.matches; };
  constructor() { this.mq?.addEventListener('change', this.mqListener); }
  ngOnDestroy() { this.mq?.removeEventListener('change', this.mqListener); }
  private detectMobile(): boolean {
    return typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false;
  }
}
