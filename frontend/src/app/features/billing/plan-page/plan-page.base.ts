import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import { formatDateOnly } from '../../../core/utils/date-only.util';
import {
  BillingIntervalId,
  BillingMe,
  BillingPlanId,
  BillingPlansResponse,
  BillingPlanView,
  BillingSellablePlanId,
} from '../../../core/models/domain.models';
import { BillingApiService } from '../../../core/services/billing-api.service';
import { UiStateService } from '../../../core/services/ui-state.service';

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20; // 20 x 3 s = 60 s

const PLAN_RANK: Record<BillingPlanId, number> = { FREE: 0, PROFESSIONAL: 1, FLEET: 2 };
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const PLAN_PAGE_IMPORTS = [CommonModule, RouterLink];

function serverMessage(error: unknown): string {
  const message = (error as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === 'string' ? message : '';
}

@Component({ template: '' })
export abstract class PlanPageBase implements OnDestroy {
  protected readonly billingApi = inject(BillingApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly uiStateService = inject(UiStateService);
  private readonly subs = new Subscription();
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private pollAttempts = 0;

  me: BillingMe | null = null;
  plans: BillingPlansResponse | null = null;
  busy = false;
  error = '';
  notice = '';
  confirming = false;
  interval: BillingIntervalId = 'MONTHLY';
  loading = false;
  cancelPrompt = false;

  constructor() {
    this.load();
    const checkout = this.route.snapshot.queryParamMap.get('checkout');
    if (checkout === 'sucesso') {
      this.startConfirmation();
    } else if (checkout === 'cancelado') {
      this.notice = 'Assinatura não concluída. Você pode tentar de novo quando quiser.';
    } else if (checkout === 'expirado') {
      this.notice = 'O link de pagamento expirou. Gere um novo clicando em Assinar.';
    }
  }

  protected toggleMenu() {
    this.uiStateService.toggleMenu();
  }

  protected toggleNotifications() {
    this.uiStateService.toggleNotifications();
  }

  ngOnDestroy() {
    this.stopPolling();
    this.subs.unsubscribe();
  }

  get enabled(): boolean {
    return this.plans?.enabled ?? false;
  }

  get sellablePlans(): BillingPlanView[] {
    return this.plans?.plans.filter((plan) => plan.sellable) ?? [];
  }

  get currentPlanId(): BillingPlanId | null {
    return this.me?.plan ?? null;
  }

  get isPending(): boolean {
    return this.me?.status === 'PENDING';
  }

  get isPastDue(): boolean {
    return this.me?.status === 'PAST_DUE';
  }

  get isCanceled(): boolean {
    return this.me?.status === 'CANCELED' || !!this.me?.cancelAtPeriodEnd;
  }

  get currentPlanLabel(): string {
    const id = this.currentPlanId;
    if (!id) return '';
    return this.plans?.plans.find((plan) => plan.id === id)?.label ?? id;
  }

  get usageLabel(): string {
    const usage = this.me?.usage;
    if (!usage?.enforced) return '';
    const { used, limit } = usage.ads;
    return limit === null ? `${used} anúncios (ilimitado)` : `${used} de ${limit} anúncios`;
  }

  get invoiceUrl(): string | null {
    return this.me?.status === 'PAST_DUE' ? this.me.latestInvoiceUrl : null;
  }

  get periodEndLabel(): string {
    return formatDateOnly(this.me?.currentPeriodEnd);
  }

  get accessUntilLabel(): string {
    return this.isCanceled ? formatDateOnly(this.me?.currentPeriodEnd) : '';
  }

  get isGrant(): boolean {
    return this.me?.source === 'GRANT';
  }

  get canCancel(): boolean {
    return (
      this.me?.source === 'ASAAS' &&
      (this.me.status === 'ACTIVE' || this.me.status === 'PAST_DUE') &&
      !this.me.cancelAtPeriodEnd
    );
  }

  isCurrentPlan(planId: BillingPlanId): boolean {
    return this.me?.plan === planId && (this.me.status === 'ACTIVE' || this.me.status === 'PAST_DUE');
  }

  get statusLine(): string {
    if (!this.me) return '';
    if (this.isGrant) {
      return this.periodEndLabel
        ? `Plano concedido pela equipe · até ${this.periodEndLabel}`
        : 'Plano concedido pela equipe';
    }
    if (this.isCanceled) return `Assinatura cancelada. Acesso até ${this.accessUntilLabel}`;
    if (this.isPending) return 'Aguardando confirmação do pagamento';
    if (this.me.status === 'ACTIVE' && this.periodEndLabel) return `Renova em ${this.periodEndLabel}`;
    return '';
  }

  get freeLimitLabel(): string {
    const free = this.plans?.plans.find((plan) => plan.id === 'FREE');
    if (!free || free.adLimit === null) return '';
    return `Grátis: até ${free.adLimit} anúncios`;
  }

  limitLabel(plan: BillingPlanView): string {
    return plan.adLimit === null ? 'Anúncios ilimitados' : `Até ${plan.adLimit} anúncios`;
  }

  canSubscribe(planId: BillingPlanId): boolean {
    if (!this.enabled) return false;
    const plan = this.plans?.plans.find((p) => p.id === planId);
    if (!plan?.sellable) return false;
    if (this.me && (this.me.status === 'ACTIVE' || this.me.status === 'PAST_DUE')) {
      if (PLAN_RANK[this.me.plan] >= PLAN_RANK[planId]) return false;
    }
    return true;
  }

  priceLabel(plan: BillingPlanView): string {
    if (!plan.prices) return '';
    const suffix = this.interval === 'YEARLY' ? '/ano' : '/mês';
    return `${BRL.format(plan.prices[this.interval])}${suffix}`;
  }

  selectInterval(interval: BillingIntervalId) {
    this.interval = interval;
  }

  load() {
    this.loading = true;
    this.subs.add(
      forkJoin({ plans: this.billingApi.getPlans(), me: this.billingApi.getMe() }).subscribe({
        next: ({ plans, me }) => {
          this.plans = plans;
          this.me = me;
          this.loading = false;
          this.checkConfirmed();
        },
        error: (err) => {
          this.loading = false;
          this.error = serverMessage(err) || 'Não foi possível carregar seus planos agora.';
        },
      }),
    );
  }

  subscribePlan(plan: BillingPlanView) {
    if (plan.id === 'FREE') return;
    this.subscribe(plan.id, this.interval);
  }

  subscribe(plan: BillingSellablePlanId, interval: BillingIntervalId) {
    this.busy = true;
    this.error = '';
    this.subs.add(
      this.billingApi.checkout(plan, interval).subscribe({
        next: ({ link }) => this.navigateExternal(link),
        error: (err) => {
          this.busy = false;
          this.error = serverMessage(err) || 'Não foi possível iniciar a assinatura agora.';
        },
      }),
    );
  }

  requestCancel() {
    this.cancelPrompt = true;
  }

  dismissCancel() {
    this.cancelPrompt = false;
  }

  cancel() {
    if (!this.cancelPrompt) return;
    this.busy = true;
    this.error = '';
    this.subs.add(
      this.billingApi.cancel().subscribe({
        next: () => {
          this.busy = false;
          this.cancelPrompt = false;
          this.refreshMe();
        },
        error: (err) => {
          this.busy = false;
          this.error = serverMessage(err) || 'Não foi possível cancelar a assinatura agora.';
        },
      }),
    );
  }

  sync() {
    this.error = '';
    this.subs.add(
      this.billingApi.sync().subscribe({
        next: () => this.refreshMe(),
        error: (err) => {
          this.error = serverMessage(err) || 'Não foi possível verificar o pagamento agora.';
        },
      }),
    );
  }

  protected navigateExternal(link: string) {
    window.location.assign(link);
  }

  private refreshMe() {
    this.subs.add(
      this.billingApi.getMe().subscribe({
        next: (me) => {
          this.me = me;
          this.checkConfirmed();
        },
      }),
    );
  }

  private startConfirmation() {
    this.confirming = true;
    this.pollAttempts = 0;
    this.stopPolling();
    this.pollTimer = setInterval(() => this.pollOnce(), POLL_INTERVAL_MS);
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  private pollOnce() {
    this.pollAttempts++;
    const last = this.pollAttempts >= POLL_MAX_ATTEMPTS;
    if (last) this.stopPolling();
    this.subs.add(
      this.billingApi.getMe().subscribe({
        next: (me) => {
          this.me = me;
          if (this.checkConfirmed()) return;
          if (last) this.finishConfirmation(false);
        },
        error: () => {
          if (last) this.finishConfirmation(false);
        },
      }),
    );
  }

  /** Se a confirmação está em curso e o plano já está ativo, encerra com sucesso. */
  private checkConfirmed(): boolean {
    if (this.confirming && this.me?.status === 'ACTIVE') {
      this.finishConfirmation(true);
      return true;
    }
    return false;
  }

  private finishConfirmation(success: boolean) {
    this.stopPolling();
    this.confirming = false;
    this.notice = success
      ? 'Plano ativado! Obrigado por assinar.'
      : 'Ainda estamos confirmando seu pagamento. Pode levar alguns minutos; use "Verificar pagamento agora".';
  }

  private stopPolling() {
    if (this.pollTimer !== undefined) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }
}
