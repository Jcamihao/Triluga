import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import {
  DAYS_PER_MONTH,
  DAYS_PER_WEEK,
  RENTAL_DISCLAIMER,
  minPeriodTotal,
  minRentalLabel,
  monthlyEstimate,
  weeklyEstimate,
} from '../../utils/rental-pricing.util';

let nextId = 0;

@Component({
  selector: 'app-rental-estimate',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="block rounded-2xl bg-surface-container-low border border-outline-variant/15"
      [ngClass]="compact ? 'p-3 grid gap-2' : 'p-5 grid gap-3'"
      [attr.aria-labelledby]="headingId"
    >
      <h3
        [id]="headingId"
        class="text-on-surface font-bold tracking-tight !m-0"
        [ngClass]="compact ? 'text-sm' : 'text-base'"
      >
        Quanto você pagaria (estimativa)
      </h3>

      <dl
        class="grid !m-0 text-on-surface"
        [ngClass]="compact ? 'gap-1 text-xs' : 'gap-1.5 text-sm'"
      >
        <div class="flex items-baseline justify-between gap-3">
          <dt class="text-on-surface-variant">Diária</dt>
          <dd class="font-semibold !m-0">
            {{ dailyRate | currency: 'BRL' : 'symbol' : '1.2-2' }}
          </dd>
        </div>
        <div class="flex items-baseline justify-between gap-3">
          <dt class="text-on-surface-variant">{{ daysPerWeek }} dias</dt>
          <dd class="font-semibold !m-0">
            {{ weekly | currency: 'BRL' : 'symbol' : '1.2-2' }}
          </dd>
        </div>
        <div class="flex items-baseline justify-between gap-3">
          <dt class="text-on-surface-variant">{{ daysPerMonth }} dias</dt>
          <dd class="font-semibold !m-0">
            {{ monthly | currency: 'BRL' : 'symbol' : '1.2-2' }}
          </dd>
        </div>
        <div
          *ngIf="minTotal !== null"
          class="flex items-baseline justify-between gap-3 pt-1.5 border-t border-outline-variant/15"
        >
          <dt class="text-on-surface-variant">
            Período mínimo: {{ minLabel }}
          </dt>
          <dd class="font-bold !m-0">
            {{ minTotal | currency: 'BRL' : 'symbol' : '1.2-2' }}
          </dd>
        </div>
      </dl>

      <p
        class="text-on-surface-variant/80 leading-snug !m-0"
        [ngClass]="compact ? 'text-[10px]' : 'text-xs'"
      >
        {{ disclaimer }}
      </p>
    </section>
  `,
})
export class RentalEstimateComponent {
  @Input() dailyRate = 0;
  @Input() minRentalDays: number | null = null;
  @Input() compact = false;

  protected readonly headingId = `rental-estimate-${nextId++}`;
  protected readonly daysPerWeek = DAYS_PER_WEEK;
  protected readonly daysPerMonth = DAYS_PER_MONTH;
  protected readonly disclaimer = RENTAL_DISCLAIMER;

  protected get weekly() {
    return weeklyEstimate(this.dailyRate);
  }

  protected get monthly() {
    return monthlyEstimate(this.dailyRate);
  }

  protected get minTotal() {
    return minPeriodTotal(this.dailyRate, this.minRentalDays);
  }

  protected get minLabel() {
    return minRentalLabel(this.minRentalDays);
  }
}
