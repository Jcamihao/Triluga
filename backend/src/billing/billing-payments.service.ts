import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Subscription } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { AsaasClient, AsaasClientError } from '../asaas/asaas.client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { getCatalog, PLAN_RANK } from './plans.catalog';

// Mesma janela do checkout RECURRENT do Asaas: depois disso o link expira do lado deles
// e nao pode mais ser reaproveitado.
const CHECKOUT_MINUTES_TO_EXPIRE = 60;

// Chaves que nunca podem ir para o banco (CPF, contato, endereço e dado de cartão).
// O Asaas pode enriquecer o payload no futuro; a sanitização protege.
const SENSITIVE_PAYLOAD_KEYS = new Set([
  'cpfCnpj',
  'email',
  'phone',
  'mobilePhone',
  'phoneNumber',
  'postalCode',
  'address',
  'addressNumber',
]);

// Tudo que começa com `creditCard` (creditCard, creditCardHolderInfo, creditCardToken,
// creditCardNumber, creditCardBrand...) também fica de fora.
const SENSITIVE_PAYLOAD_PREFIX = 'creditCard';
const MAX_ERROR_LENGTH = 500;

function sanitizeWebhookPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeWebhookPayload(item));
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (
        SENSITIVE_PAYLOAD_KEYS.has(key) ||
        key.startsWith(SENSITIVE_PAYLOAD_PREFIX)
      ) {
        continue;
      }
      result[key] = sanitizeWebhookPayload(val);
    }
    return result;
  }
  return value;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;

/** Violação do índice único (`BillingEvent.externalEventId`): evento já gravado antes. */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

@Injectable()
export class BillingPaymentsService {
  private readonly logger = new Logger(BillingPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asaasClient: AsaasClient,
    private readonly configService: ConfigService,
  ) {}

  private isEnabled(): boolean {
    return this.configService.get<boolean>('billing.enabled') === true;
  }

  private frontendUrl(): string {
    return (
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:4200'
    );
  }

  async checkout(
    userId: string,
    dto: CreateCheckoutDto,
  ): Promise<{ link: string }> {
    if (!this.isEnabled()) {
      throw new BadRequestException('A cobrança está desativada no momento.');
    }

    const planDefinition = getCatalog()[dto.plan];
    if (!planDefinition.sellable) {
      throw new BadRequestException(
        'Esse plano não está disponível para assinatura.',
      );
    }

    const price = planDefinition.prices?.[dto.interval];
    if (price === undefined) {
      throw new BadRequestException(
        'Preço indisponível para esse plano e intervalo.',
      );
    }

    // 1) Assinatura (Asaas ou concessão) ativa com rank igual ou maior bloqueia.
    // Rank menor ativo não bloqueia: é upgrade.
    const blocking = await this.prisma.subscription.findMany({
      where: { ownerUserId: userId, status: { in: ['ACTIVE', 'PAST_DUE'] } },
    });
    if (blocking.some((sub) => PLAN_RANK[sub.plan] >= PLAN_RANK[dto.plan])) {
      throw new BadRequestException(
        'Você já tem uma assinatura ativa; cancele antes de trocar.',
      );
    }

    // 2) Reaproveita checkout PENDING do mesmo plano e ciclo, ainda dentro da janela.
    const cutoff = new Date(Date.now() - CHECKOUT_MINUTES_TO_EXPIRE * 60_000);
    const reusable = await this.prisma.subscription.findFirst({
      where: {
        ownerUserId: userId,
        source: 'ASAAS',
        status: 'PENDING',
        plan: dto.plan,
        interval: dto.interval,
        asaasCheckoutLink: { not: null },
        createdAt: { gt: cutoff },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (reusable?.asaasCheckoutLink) {
      return { link: reusable.asaasCheckoutLink };
    }

    // 3) Cria a linha PENDING antes (o id vira externalReference) e só então chama o Asaas.
    const created = await this.prisma.subscription.create({
      data: {
        ownerUserId: userId,
        plan: dto.plan,
        status: 'PENDING',
        source: 'ASAAS',
        interval: dto.interval,
      },
    });

    const frontendUrl = this.frontendUrl();
    const checkout = await this.asaasClient.createCheckout({
      value: price,
      cycle: dto.interval,
      itemName: `Plano ${planDefinition.label} do Triluga`,
      itemDescription:
        dto.interval === 'YEARLY' ? 'Assinatura anual' : 'Assinatura mensal',
      externalReference: created.id,
      successUrl: `${frontendUrl}/plano?checkout=sucesso`,
      cancelUrl: `${frontendUrl}/plano?checkout=cancelado`,
      expiredUrl: `${frontendUrl}/plano?checkout=expirado`,
      minutesToExpire: CHECKOUT_MINUTES_TO_EXPIRE,
    });

    await this.prisma.subscription.update({
      where: { id: created.id },
      data: {
        asaasCheckoutId: checkout.id,
        asaasCheckoutLink: checkout.link,
      },
    });

    return { link: checkout.link };
  }

  /**
   * Rede de segurança contra webhook perdido. Reconcilia a assinatura ASAAS em aberto
   * do usuário com o Asaas. Assinatura ACTIVE com período ainda válido não é consultada:
   * um clique em "sincronizar" no meio do ciclo não pode rebaixar quem está em dia.
   */
  async sync(userId: string): Promise<void> {
    const local = await this.prisma.subscription.findFirst({
      where: {
        ownerUserId: userId,
        source: 'ASAAS',
        status: { in: ['PENDING', 'ACTIVE', 'PAST_DUE'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!local) {
      return;
    }

    if (!local.asaasSubscriptionId) {
      // Webhook CHECKOUT_PAID pode ter se perdido: procura a assinatura pelo externalReference.
      const remote = await this.asaasClient.findSubscriptionByExternalReference(
        local.id,
      );
      if (!remote) {
        return;
      }
      const updated = await this.prisma.subscription.update({
        where: { id: local.id },
        data: { asaasSubscriptionId: remote.id },
      });
      await this.reconcileSubscription(updated);
      return;
    }

    if (
      local.status === 'ACTIVE' &&
      local.currentPeriodEnd !== null &&
      new Date() <= local.currentPeriodEnd
    ) {
      return;
    }

    await this.reconcileSubscription(local);
  }

  /**
   * Cancela toda assinatura ASAAS em cobrança (ACTIVE/PAST_DUE). Upgrade deixa a antiga
   * ACTIVE ao lado da nova; cancelar só a mais recente deixaria a outra cobrando sem como
   * cancelar. Sem nenhuma em cobrança mas com alguma já CANCELED: não faz nada (idempotente).
   * Concessão (GRANT) nunca é tocada.
   */
  async cancel(userId: string): Promise<void> {
    const open = await this.prisma.subscription.findMany({
      where: {
        ownerUserId: userId,
        source: 'ASAAS',
        status: { in: ['ACTIVE', 'PAST_DUE'] },
      },
    });

    if (open.length === 0) {
      const alreadyCanceled = await this.prisma.subscription.findFirst({
        where: { ownerUserId: userId, source: 'ASAAS', status: 'CANCELED' },
      });
      if (!alreadyCanceled) {
        throw new NotFoundException(
          'Você não tem uma assinatura para cancelar.',
        );
      }
      return;
    }

    for (const local of open) {
      // Remove no Asaas antes de gravar: se falhar, nada muda e o usuário pode tentar de novo.
      if (local.asaasSubscriptionId) {
        await this.deleteAsaasSubscription(local.asaasSubscriptionId);
      }

      // currentPeriodEnd não muda: o acesso segue até o fim do período já pago.
      await this.prisma.subscription.update({
        where: { id: local.id },
        data: { status: 'CANCELED', cancelAtPeriodEnd: true },
      });
    }
  }

  /**
   * Recebe um evento de webhook do Asaas: token, sanitização, idempotência e dispatch.
   * Token inválido (ou servidor sem token configurado) recusa antes de tocar no banco.
   * Pagamento avulso (sem `payment.subscription`, como o PIX do destaque) é ignorado.
   * Falha no dispatch relança o erro (5xx) para o Asaas reenviar; sem `processedAt`.
   */
  async processWebhookEvent(
    token: string | undefined,
    payload: Record<string, unknown>,
  ): Promise<{ ok: true }> {
    if (!this.isValidWebhookToken(token)) {
      throw new ForbiddenException('Token de webhook inválido.');
    }

    const externalEventId = payload.id;
    const eventType = payload.event;
    if (!isNonEmptyString(externalEventId) || !isNonEmptyString(eventType)) {
      throw new BadRequestException('Payload de webhook inválido.');
    }

    // Pagamento sem assinatura é de outro fluxo (destaque): não grava nem avisa.
    const payment = asRecord(payload.payment);
    if (
      eventType.startsWith('PAYMENT_') &&
      !isNonEmptyString(payment?.subscription)
    ) {
      this.logger.debug(
        `Webhook ${eventType} sem assinatura: pagamento avulso, ignorado.`,
      );
      return { ok: true };
    }

    const sanitized = sanitizeWebhookPayload(payload) as Record<
      string,
      unknown
    >;

    let eventId: string;
    try {
      const created = await this.prisma.billingEvent.create({
        data: {
          externalEventId,
          type: eventType,
          payload: sanitized as Prisma.InputJsonValue,
        },
      });
      eventId = created.id;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const existing = await this.prisma.billingEvent.findUnique({
        where: { externalEventId },
      });
      if (!existing) {
        throw error;
      }
      if (existing.processedAt) {
        return { ok: true };
      }
      // Retry do Asaas após falha anterior: reprocessa o mesmo registro.
      eventId = existing.id;
    }

    try {
      await this.dispatchWebhookEvent(eventType, sanitized);
    } catch (error) {
      await this.recordWebhookError(eventId, error);
      throw error;
    }

    await this.prisma.billingEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date(), error: null },
    });
    return { ok: true };
  }

  /** Grava o erro do dispatch; se a própria gravação falhar, loga e segue para relançar o original. */
  private async recordWebhookError(
    eventId: string,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await this.prisma.billingEvent.update({
        where: { id: eventId },
        data: { error: message.slice(0, MAX_ERROR_LENGTH) },
      });
    } catch (recordError) {
      this.logger.error(
        `Falha ao gravar o erro do evento de webhook ${eventId}: ${
          recordError instanceof Error
            ? recordError.message
            : String(recordError)
        }`,
      );
    }
  }

  /** Comparação em tempo constante; servidor sem token configurado recusa tudo (fail closed). */
  private isValidWebhookToken(token: string | undefined): boolean {
    const configured = this.configService.get<string>('asaas.webhookToken');
    if (!isNonEmptyString(configured) || !isNonEmptyString(token)) {
      return false;
    }
    const expected = Buffer.from(configured);
    const received = Buffer.from(token);
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }

  private async dispatchWebhookEvent(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    switch (eventType) {
      case 'CHECKOUT_PAID':
        await this.handleCheckoutPaid(payload);
        return;
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_OVERDUE':
        await this.handlePaymentStatusEvent(payload);
        return;
      case 'PAYMENT_REFUNDED':
        await this.handlePaymentRefunded(payload);
        return;
      case 'SUBSCRIPTION_DELETED':
      case 'SUBSCRIPTION_INACTIVATED':
        await this.handleSubscriptionRemoved(payload);
        return;
      default:
        // PAYMENT_CREATED/UPDATED e afins chegam a cada ciclo: não é anomalia, só registro.
        this.logger.debug(
          `Evento de webhook do Asaas não tratado: ${eventType}`,
        );
    }
  }

  private async handleCheckoutPaid(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const checkout = asRecord(payload.checkout);
    const checkoutId = isNonEmptyString(checkout?.id) ? checkout.id : undefined;
    if (!checkoutId) {
      this.logger.warn('Webhook CHECKOUT_PAID sem checkout.id.');
      return;
    }

    // Primeiro pelo id do checkout; sem achar, pelo externalReference (id local, só ASAAS).
    let local = await this.prisma.subscription.findFirst({
      where: { asaasCheckoutId: checkoutId },
    });
    if (!local && isNonEmptyString(checkout?.externalReference)) {
      local = await this.prisma.subscription.findFirst({
        where: { id: checkout.externalReference, source: 'ASAAS' },
      });
    }
    if (!local) {
      this.logger.warn(
        `Webhook CHECKOUT_PAID sem Subscription local para o checkout ${checkoutId}.`,
      );
      return;
    }

    // Linha já ligada a OUTRA assinatura do Asaas: não sobrescreve (evento estranho ou
    // fallback por externalReference casando linha errada). Segue sem reconciliar.
    if (
      isNonEmptyString(checkout?.subscription) &&
      local.asaasSubscriptionId !== null &&
      local.asaasSubscriptionId !== checkout.subscription
    ) {
      this.logger.warn(
        `Webhook CHECKOUT_PAID: a Subscription local ${local.id} já está ligada a outra assinatura do Asaas; nada alterado.`,
      );
      return;
    }

    const asaasSubscriptionId = isNonEmptyString(checkout?.subscription)
      ? checkout.subscription
      : local.asaasSubscriptionId;
    const asaasCustomerId = isNonEmptyString(checkout?.customer)
      ? checkout.customer
      : local.asaasCustomerId;

    let updated: Subscription;
    try {
      updated = await this.prisma.subscription.update({
        where: { id: local.id },
        data: { asaasSubscriptionId, asaasCustomerId },
      });
    } catch (error) {
      // asaasSubscriptionId é único: outra linha já tem esse id. Repetir não resolve,
      // então não relança (evitaria 5xx eterno); fica registrado para análise.
      if (isUniqueViolation(error)) {
        this.logger.warn(
          `Webhook CHECKOUT_PAID: a assinatura do Asaas já pertence a outra Subscription local; ${local.id} não foi alterada.`,
        );
        return;
      }
      throw error;
    }

    await this.reconcileSubscription(updated);
  }

  /**
   * Remove a assinatura no Asaas. 404 = já removida (ex.: retry depois de falha ao gravar
   * o status local): conta como sucesso para o cancelamento local poder terminar.
   */
  private async deleteAsaasSubscription(asaasSubscriptionId: string) {
    try {
      await this.asaasClient.deleteSubscription(asaasSubscriptionId);
    } catch (error) {
      if (error instanceof AsaasClientError && error.statusCode === 404) {
        return;
      }
      throw error;
    }
  }

  /**
   * PAYMENT_CONFIRMED/RECEIVED/OVERDUE: casa a linha por `payment.subscription`
   * (nunca por externalReference), grava `latestInvoiceUrl` quando houver e reconcilia.
   */
  private async handlePaymentStatusEvent(
    payload: Record<string, unknown>,
  ): Promise<void> {
    let local = await this.findLocalByPaymentSubscription(payload);
    if (!local) {
      return;
    }

    const invoiceUrl = asRecord(payload.payment)?.invoiceUrl;
    if (typeof invoiceUrl === 'string') {
      local = await this.prisma.subscription.update({
        where: { id: local.id },
        data: { latestInvoiceUrl: invoiceUrl },
      });
    }

    await this.reconcileSubscription(local);
  }

  /** PAYMENT_REFUNDED: encerra na hora como EXPIRED, sem consultar o Asaas (é terminal). */
  private async handlePaymentRefunded(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const local = await this.findLocalByPaymentSubscription(payload);
    if (!local) {
      return;
    }

    await this.prisma.subscription.update({
      where: { id: local.id },
      data: { status: 'EXPIRED', currentPeriodEnd: new Date() },
    });
  }

  /** SUBSCRIPTION_DELETED/INACTIVATED: acha por `subscription.id` e reconcilia (deleted vira CANCELED). */
  private async handleSubscriptionRemoved(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const asaasSubscriptionId = asRecord(payload.subscription)?.id;
    if (!isNonEmptyString(asaasSubscriptionId)) {
      this.logger.warn('Webhook de assinatura removida sem subscription.id.');
      return;
    }

    const local = await this.prisma.subscription.findFirst({
      where: { asaasSubscriptionId },
    });
    if (!local) {
      this.logger.warn(
        `Webhook de assinatura removida sem Subscription local para ${asaasSubscriptionId}.`,
      );
      return;
    }

    await this.reconcileSubscription(local);
  }

  private async findLocalByPaymentSubscription(
    payload: Record<string, unknown>,
  ): Promise<Subscription | null> {
    const asaasSubscriptionId = asRecord(payload.payment)?.subscription;
    if (!isNonEmptyString(asaasSubscriptionId)) {
      this.logger.warn('Webhook de pagamento sem payment.subscription.');
      return null;
    }

    const local = await this.prisma.subscription.findFirst({
      where: { asaasSubscriptionId },
    });
    if (!local) {
      this.logger.warn(
        `Webhook de pagamento sem Subscription local para ${asaasSubscriptionId}.`,
      );
      return null;
    }
    return local;
  }

  /**
   * Deriva o estado local apenas de `deleted` e `nextDueDate`. Webhook e `sync` usam esta
   * mesma função, então os dois caminhos não podem divergir.
   */
  async reconcileSubscription(local: Subscription): Promise<void> {
    // EXPIRED (reembolso) é terminal: evento tardio não pode ressuscitar a assinatura.
    if (local.status === 'EXPIRED') {
      return;
    }
    if (!local.asaasSubscriptionId) {
      return;
    }

    const remote = await this.asaasClient.getSubscription(
      local.asaasSubscriptionId,
    );

    if (remote.deleted) {
      await this.prisma.subscription.update({
        where: { id: local.id },
        data: { status: 'CANCELED' },
      });
      return;
    }

    const nextDueDate = new Date(remote.nextDueDate);
    const advanced =
      local.currentPeriodEnd === null || nextDueDate > local.currentPeriodEnd;

    if (advanced) {
      const updated = await this.prisma.subscription.update({
        where: { id: local.id },
        data: {
          status: 'ACTIVE',
          currentPeriodEnd: nextDueDate,
          pastDueSince: null,
        },
      });
      await this.cancelSupersededSubscriptions(updated);
      return;
    }

    // Não avançou: período ainda pago não é rebaixado (ex.: 2º webhook com o mesmo nextDueDate).
    const now = new Date();
    if (local.currentPeriodEnd !== null && local.currentPeriodEnd > now) {
      if (local.status === 'ACTIVE') {
        await this.cancelSupersededSubscriptions(local);
      }
      return;
    }

    await this.prisma.subscription.update({
      where: { id: local.id },
      data: {
        status: 'PAST_DUE',
        pastDueSince: local.pastDueSince ?? now,
      },
    });
  }

  /**
   * Upgrade cancela a assinatura anterior do mesmo usuário (opção A do dono).
   * Só ASAAS em cobrança de plano estritamente menor. GRANT, outro usuário, plano igual ou
   * maior e linhas PENDING/CANCELED/EXPIRED nunca são tocadas. Roda também no ramo "em dia"
   * para que um retry do webhook complete o que falhou. Falha no Asaas propaga (5xx).
   */
  private async cancelSupersededSubscriptions(
    active: Subscription,
  ): Promise<void> {
    const others = await this.prisma.subscription.findMany({
      where: {
        ownerUserId: active.ownerUserId,
        source: 'ASAAS',
        status: { in: ['ACTIVE', 'PAST_DUE'] },
        id: { not: active.id },
      },
    });

    for (const other of others) {
      if (PLAN_RANK[other.plan] >= PLAN_RANK[active.plan]) {
        continue;
      }
      // Remove no Asaas antes de gravar: se falhar, nada muda e o retry tenta de novo.
      if (other.asaasSubscriptionId) {
        await this.deleteAsaasSubscription(other.asaasSubscriptionId);
      }
      await this.prisma.subscription.update({
        where: { id: other.id },
        data: { status: 'CANCELED', cancelAtPeriodEnd: true },
      });
    }
  }
}
