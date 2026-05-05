import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class UiStateService {
  readonly menuOpen = signal(false);
  readonly notificationsOpen = signal(false);

  toggleMenu() {
    this.menuOpen.update((open) => !open);
  }

  closeMenu() {
    this.menuOpen.set(false);
  }

  openMenu() {
    this.menuOpen.set(true);
  }

  toggleNotifications() {
    this.notificationsOpen.update((open) => !open);
  }

  closeNotifications() {
    this.notificationsOpen.set(false);
  }
}
