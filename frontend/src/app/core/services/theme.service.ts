import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'triluga.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly isDark = signal(this.loadPreference());

  constructor() {
    this.apply(this.isDark());
  }

  toggle() {
    this.isDark.update((v) => !v);
    this.apply(this.isDark());
    try {
      localStorage.setItem(STORAGE_KEY, this.isDark() ? 'dark' : 'light');
    } catch {}
  }

  private apply(dark: boolean) {
    document.documentElement.classList.toggle('dark', dark);
  }

  private loadPreference(): boolean {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return stored === 'dark';
    } catch {}
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }
}
