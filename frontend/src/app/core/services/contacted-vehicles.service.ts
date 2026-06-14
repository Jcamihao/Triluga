import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'triluga_contacted_vehicles';

@Injectable({ providedIn: 'root' })
export class ContactedVehiclesService {
  private readonly _ids = signal<Set<string>>(this.loadFromStorage());

  isContacted(vehicleId: string): boolean {
    return this._ids().has(vehicleId);
  }

  markAsContacted(vehicleId: string): void {
    this._ids.update((current) => {
      const next = new Set(current);
      next.add(vehicleId);
      this.saveToStorage(next);
      return next;
    });
  }

  private loadFromStorage(): Set<string> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  }

  private saveToStorage(ids: Set<string>): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    } catch {
      // quota exceeded — ignore silently
    }
  }
}
