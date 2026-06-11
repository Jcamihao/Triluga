import { Injectable } from '@angular/core';
import { VehicleCardItem } from '../models/domain.models';

const KEY = 'triluga.recentlyViewed';
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
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as VehicleCardItem[]) : [];
    } catch {
      return [];
    }
  }
}
