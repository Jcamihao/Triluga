import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { minRentalLabel } from '../../../shared/utils/rental-pricing.util';
import { WebHeaderComponent } from '../../../shared/components/web-header/web-header.component';

type VehicleFilter = 'all' | 'published' | 'draft';

@Component({
  selector: 'app-owner-dashboard-list',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, RouterLink, WebHeaderComponent],
  templateUrl: './owner-dashboard-list.component.html',
})
export class OwnerDashboardListComponent {
  @Input({ required: true }) owner!: any;

  readonly minRentalLabel = minRentalLabel;

  activeFilter: VehicleFilter = 'all';

  get filteredVehicles(): any[] {
    const all: any[] = this.owner?.vehicles ?? [];
    if (this.activeFilter === 'published') return all.filter((v) => v.isPublished);
    if (this.activeFilter === 'draft') return all.filter((v) => !v.isPublished);
    return all;
  }

  setFilter(filter: VehicleFilter): void {
    this.activeFilter = filter;
  }
}
