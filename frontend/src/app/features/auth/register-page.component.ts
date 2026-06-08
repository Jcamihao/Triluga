import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { RegisterDesktopComponent } from './register-desktop.component';
import { RegisterMobileComponent } from './register-mobile.component';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, RegisterMobileComponent, RegisterDesktopComponent],
  template: `
    <app-register-mobile *ngIf="isMobile"></app-register-mobile>
    <app-register-desktop *ngIf="!isMobile"></app-register-desktop>
  `,
})
export class RegisterPageComponent implements OnDestroy {
  protected isMobile = this.detectMobile();
  private mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)') : null;
  private mqListener = (e: MediaQueryListEvent) => { this.isMobile = e.matches; };
  constructor() { this.mq?.addEventListener('change', this.mqListener); }
  ngOnDestroy() { this.mq?.removeEventListener('change', this.mqListener); }
  private detectMobile(): boolean {
    return typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false;
  }
}
