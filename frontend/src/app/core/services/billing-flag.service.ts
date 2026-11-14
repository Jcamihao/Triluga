import { inject, Injectable, computed, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { BillingPlansResponse } from '../models/domain.models';
import { BillingApiService } from './billing-api.service';

/**
 * Flag de cobrança: carrega GET /billing/plans uma vez e expõe se a
 * cobrança está ligada. Erro deixa `enabled` falso e não lança; a próxima
 * chamada de ensureLoaded() tenta de novo.
 */
@Injectable({ providedIn: 'root' })
export class BillingFlagService {
  private readonly billingApi = inject(BillingApiService);

  readonly plans = signal<BillingPlansResponse | null>(null);
  readonly enabled = computed(() => this.plans()?.enabled === true);

  private loading = false;

  ensureLoaded(): void {
    if (this.plans() !== null || this.loading) {
      return;
    }

    this.loading = true;
    this.billingApi
      .getPlans()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => this.plans.set(response),
        error: () => undefined,
      });
  }
}
