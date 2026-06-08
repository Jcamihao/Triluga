import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { ChatDesktopComponent } from './chat-desktop.component';
import { ChatMobileComponent } from './chat-mobile.component';

@Component({
  selector: 'app-chat-page',
  standalone: true,
  imports: [CommonModule, ChatMobileComponent, ChatDesktopComponent],
  template: `
    <app-chat-mobile *ngIf="isMobile"></app-chat-mobile>
    <app-chat-desktop *ngIf="!isMobile"></app-chat-desktop>
  `,
})
export class ChatPageComponent implements OnDestroy {
  protected isMobile = this.detectMobile();
  private mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)') : null;
  private mqListener = (e: MediaQueryListEvent) => { this.isMobile = e.matches; };
  constructor() { this.mq?.addEventListener('change', this.mqListener); }
  ngOnDestroy() { this.mq?.removeEventListener('change', this.mqListener); }
  private detectMobile(): boolean {
    return typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false;
  }
}
