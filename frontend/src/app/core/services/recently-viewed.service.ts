import { Injectable } from '@angular/core';
import { VehicleCardItem } from '../models/domain.models';

// v2: snapshots antigos não têm minRentalDays/estimativas nem a diária atual.
const KEY = 'triluga.recentlyViewed.v2';
const LEGACY_KEY = 'triluga.recentlyViewed';
const MAX = 10;

@Injectable({ providedIn: 'root' })
export class RecentlyViewedService {
  private items: VehicleCardItem[] = this.load();

  track(vehicle: VehicleCardItem) {
    this.items = [vehicle, ...this.items.filter((v) => v.id !== vehicle.id)].slice(0, MAX);
    try {
      localStorage.setItem(KEY, JSON.stringify(this.items));
    } catch {}
  }

  getAll(): VehicleCardItem[] {
    return this.items;
  }

  private load(): VehicleCardItem[] {
    try {
      localStorage.removeItem(LEGACY_KEY);
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as VehicleCardItem[]) : [];
    } catch {
      return [];
    }
  }
}
