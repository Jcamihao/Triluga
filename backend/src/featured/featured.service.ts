import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AsaasClient, AsaasClientError } from './asaas.client';
import { CreateFeaturedOrderDto } from './dto/create-featured-order.dto';
import { FEATURED_PLANS } from './featured.constants';

const MISSING_DOCUMENT_MESSAGE =
  'Complete seu CPF/CNPJ no perfil para pagar o destaque.';
const INVALID_DOCUMENT_MESSAGE =
  'CPF/CNPJ inválido. Corrija no perfil e tente novamente.';
const PIX_FAILURE_MESSAGE =
  'Não foi possível gerar o PIX agora. Tente novamente em instantes.';
const CANCEL_FAILURE_MESSAGE =
  'Não foi possível cancelar agora. Tente novamente em instantes.';
const STALE_ORDER_MS = 24 * 60 * 60 * 1000;
const BRAZIL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const WEBHOOK_ACTIVATING_EVENTS = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'];
const WEBHOOK_REVERSAL_EVENTS = [
  'PAYMENT_REFUNDED',
  'PAYMENT_DELETED',
  'PAYMENT_REVERSED',
];
const isReversalEvent = (event: string) =>
  WEBHOOK_REVERSAL_EVENTS.includes(event) ||
  event.startsWith('PAYMENT_CHARGEBACK');

/** Texto vindo do payload (não confiável) seguro para log: sem controles, até 64 chars. */
function safeLog(value: unknown): string {
  // eslint-disable-next-line no-control-regex
  return String(value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .slice(0, 64);
}

export interface AsaasWebhookPayload {
  event?: string;
  payment?: {
    id?: string;
    value?: number;
    externalReference?: string | null;
  } | null;
}

const nonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0;

/** "Amanhã" no Brasil (UTC-3) como YYYY-MM-DD, independente do fuso do servidor. */
function tomorrowInBrazil(): string {
  return new Date(Date.now() - BRAZIL_UTC_OFFSET_MS + DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** 400-499 do Asaas atribuíveis ao dado do cliente (exclui nossa chave inválida e rate limit). */
function isCustomerDataError(err: unknown): boolean {
  if (!(err instanceof AsaasClientError) || err.statusCode === undefined)
    return false;
  return (
    err.statusCode >= 400 &&
    err.statusCode < 500 &&
    ![401, 403, 429].includes(err.statusCode)
  );
}

@Injectable()
export class FeaturedService implements OnModuleInit {
  private readonly logger = new Logger(FeaturedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasClient,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const apiKey: unknown = this.config.get('asaas.apiKey');
    const webhookToken: unknown = this.config.get('asaas.webhookToken');
    if (nonEmptyString(apiKey) && !nonEmptyString(webhookToken))
      this.logger.warn(
        'ASAAS_API_KEY definida mas ASAAS_WEBHOOK_TOKEN vazio: webhooks serão recusados com 403 e pedidos pagos não serão ativados',
      );
  }

  getPlans() {
    return FEATURED_PLANS;
  }

  async createOrder(userId: string, dto: CreateFeaturedOrderDto) {
    const plan = FEATURED_PLANS.find((p) => p.id === dto.planId);
    if (!plan) throw new BadRequestException('Plano inválido.');

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: dto.vehicleId },
      select: { ownerId: true, isActive: true, title: true },
    });
    if (!vehicle || !vehicle.isActive)
      throw new NotFoundException('Veículo não encontrado.');
    if (vehicle.ownerId !== userId)
      throw new ForbiddenException('Veículo não pertence ao usuário.');

    if (!this.asaas.isConfigured())
      throw new ServiceUnavailableException(PIX_FAILURE_MESSAGE);

    const owner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        profile: { select: { fullName: true, documentNumber: true } },
      },
    });
    const cpfCnpj = (owner?.profile?.documentNumber ?? '').replace(/\D/g, '');
    if (!owner || !cpfCnpj)
      throw new BadRequestException(MISSING_DOCUMENT_MESSAGE);

    const description = `Destaque Triluga — ${vehicle.title} (${plan.name})`;

    // Check + create sob lock por veículo: dois pedidos concorrentes serializam e
    // o segundo enxerga o PENDING do primeiro (evita cobrança dupla).
    const order = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.vehicleId}))`;

      const existing = await tx.featuredOrder.findFirst({
        where: {
          vehicleId: dto.vehicleId,
          status: { in: ['PENDING', 'ACTIVE'] },
        },
      });
      if (existing)
        throw new BadRequestException(
          'Este veículo já possui um destaque ativo ou pendente de pagamento.',
        );

      return tx.featuredOrder.create({
        data: {
          vehicleId: dto.vehicleId,
          userId,
          planId: plan.id,
          durationDays: plan.durationDays,
          price: plan.price,
        },
      });
    });

    let asaasPaymentId: string | null = null;
    let customerStep = true;
    try {
      const customer =
        (await this.asaas.findCustomerByExternalReference(userId)) ??
        (await this.asaas.createCustomer({
          name: owner.profile?.fullName ?? owner.email,
          cpfCnpj,
          email: owner.email,
          externalReference: userId,
        }));
      customerStep = false;

      const pixPayment = await this.asaas.createPixPayment({
        customer: customer.id,
        value: plan.price,
        dueDate: tomorrowInBrazil(),
        description,
        externalReference: order.id,
      });
      asaasPaymentId = pixPayment.id;

      const qr = await this.asaas.getPixQrCode(pixPayment.id);

      const updatedOrder = await this.prisma.featuredOrder.update({
        where: { id: order.id },
        data: { paymentId: pixPayment.id, pixCopiaECola: qr.payload },
      });

      return {
        order: updatedOrder,
        payment: {
          amount: plan.price,
          description,
          pixCopiaECola: qr.payload,
          qrCodeImage: !qr.encodedImage
            ? null
            : qr.encodedImage.startsWith('data:')
              ? qr.encodedImage
              : `data:image/png;base64,${qr.encodedImage}`,
          instructions:
            'Escaneie o QR Code ou copie o código PIX para efetuar o pagamento. O destaque será ativado automaticamente após a confirmação.',
        },
      };
    } catch (err) {
      this.logger.error(
        `Falha ao gerar PIX Asaas para o pedido ${order.id}: ${(err as Error).message}`,
      );
      await this.rollbackFailedOrder(order.id, asaasPaymentId);
      if (customerStep && isCustomerDataError(err))
        throw new BadRequestException(INVALID_DOCUMENT_MESSAGE);
      throw new ServiceUnavailableException(PIX_FAILURE_MESSAGE);
    }
  }

  /** Best-effort: apaga a cobrança (se existir) e cancela o pedido para não deixar PENDING órfão. */
  private async rollbackFailedOrder(
    orderId: string,
    asaasPaymentId: string | null,
  ) {
    if (asaasPaymentId) {
      try {
        await this.asaas.deletePayment(asaasPaymentId);
      } catch (err) {
        this.logger.warn(
          `Não foi possível apagar a cobrança Asaas ${asaasPaymentId} do pedido ${orderId}: ${(err as Error).message}`,
        );
      }
    }
    try {
      await this.prisma.featuredOrder.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      });
    } catch (err) {
      this.logger.error(
        `Não foi possível cancelar o pedido ${orderId} após falha no Asaas: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Ativa o pedido só se ele ainda estiver PENDING (update condicional dentro da
   * transação, junto com o veículo). Retorna false se outra operação (cancelamento
   * ou entrega duplicada do webhook) já mudou o pedido: nada é alterado.
   */
  private async doActivateOrder(order: {
    id: string;
    vehicleId: string;
    durationDays: number;
  }): Promise<boolean> {
    const activatedAt = new Date();
    const expiresAt = new Date(activatedAt);
    expiresAt.setDate(expiresAt.getDate() + order.durationDays);

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.featuredOrder.updateMany({
        where: { id: order.id, status: 'PENDING' },
        data: { status: 'ACTIVE', activatedAt, expiresAt },
      });
      if (result.count === 0) return false;

      // Nunca encurta um período já existente (ex.: extensão do admin).
      const vehicle = await tx.vehicle.findUnique({
        where: { id: order.vehicleId },
        select: { featuredUntil: true },
      });
      const current = vehicle?.featuredUntil ?? null;
      const featuredUntil =
        current && current.getTime() > expiresAt.getTime()
          ? current
          : expiresAt;

      await tx.vehicle.update({
        where: { id: order.vehicleId },
        data: { isFeatured: true, featuredUntil },
      });
      return true;
    });
  }

  /** Comparação em tempo constante; token vazio/ausente nunca autoriza. */
  private isValidWebhookToken(received: unknown): boolean {
    const expected: unknown = this.config.get('asaas.webhookToken');
    if (!nonEmptyString(expected) || !nonEmptyString(received)) return false;
    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Webhook do Asaas (público). Token primeiro, antes de olhar payload ou banco.
   * Problemas de payload/estado do pedido respondem 200 (o Asaas não deve
   * reenviar); falha transitória (banco) propaga como 5xx para o Asaas reenviar.
   */
  async handleAsaasWebhook(
    token: string,
    payload: AsaasWebhookPayload | null | undefined,
  ): Promise<{ ok: true; activated: number }> {
    if (!this.isValidWebhookToken(token))
      throw new ForbiddenException('Invalid webhook token');

    const noop = { ok: true as const, activated: 0 };
    if (!payload || typeof payload !== 'object') return noop;
    const event = payload.event;
    if (!nonEmptyString(event)) return noop;
    const isActivation = WEBHOOK_ACTIVATING_EVENTS.includes(event);
    const isReversal = isReversalEvent(event);
    if (!isActivation && !isReversal) return noop;
    const payment = payload.payment;
    if (!payment || typeof payment !== 'object') return noop;

    const externalReference = nonEmptyString(payment.externalReference)
      ? payment.externalReference
      : null;
    const paymentId = nonEmptyString(payment.id) ? payment.id : null;
    if (!externalReference && !paymentId) return noop;

    const refLog = safeLog(externalReference);
    const payLog = safeLog(paymentId);
    const eventLog = safeLog(event);

    try {
      const order =
        (externalReference
          ? await this.prisma.featuredOrder.findUnique({
              where: { id: externalReference },
            })
          : null) ??
        (paymentId
          ? await this.prisma.featuredOrder.findUnique({ where: { paymentId } })
          : null);

      if (!order) {
        this.logger.warn(
          `Webhook Asaas ${eventLog}: pedido não encontrado (externalReference=${refLog}, paymentId=${payLog})`,
        );
        return noop;
      }

      if (isReversal) {
        // Nossos cancelamentos apagam a cobrança no Asaas, que emite PAYMENT_DELETED:
        // em pedido não ativo isso é esperado e não exige reconciliação.
        if (event === 'PAYMENT_DELETED' && order.status !== 'ACTIVE') {
          this.logger.log(
            `Webhook Asaas ${eventLog}: cobrança removida; nada a fazer (orderId=${order.id} status=${order.status} paymentId=${payLog})`,
          );
          return noop;
        }
        this.logger.error(
          `Webhook Asaas ${eventLog} (estorno/cancelamento): orderId=${order.id} paymentId=${payLog}. Nenhum estado alterado; reconciliar manualmente.`,
        );
        return noop;
      }

      if (paymentId && order.paymentId && paymentId !== order.paymentId) {
        this.logger.error(
          `Webhook Asaas com cobrança diferente da do pedido: orderId=${order.id} paymentId esperado=${order.paymentId} recebido=${payLog}. Pedido não ativado.`,
        );
        return noop;
      }

      const paidValue = Number(payment.value);
      const orderPrice = Number(order.price);

      if (order.status === 'CANCELLED') {
        this.logger.error(
          `Pagamento recebido para pedido CANCELLED: orderId=${order.id} paymentId=${payLog} value=${paidValue}. Não ativado; reconciliar manualmente (estorno ou ativação pelo admin).`,
        );
        return noop;
      }
      if (order.status !== 'PENDING') {
        this.logger.log(
          `Webhook Asaas ${eventLog}: pedido ${order.id} já está ${order.status}; nada a fazer`,
        );
        return noop;
      }
      if (Math.round(paidValue * 100) !== Math.round(orderPrice * 100)) {
        this.logger.error(
          `Webhook Asaas com valor divergente: orderId=${order.id} paymentId=${payLog} pago=${paidValue} esperado=${orderPrice}. Pedido não ativado.`,
        );
        return noop;
      }

      const activated = await this.doActivateOrder(order);
      if (!activated) {
        this.logger.log(
          `Webhook Asaas: pedido ${order.id} deixou de ser PENDING durante a ativação; nada alterado`,
        );
        return noop;
      }
      this.logger.log(
        `Pedido ${order.id} ativado via webhook Asaas (paymentId=${payLog})`,
      );
      return { ok: true, activated: 1 };
    } catch (err) {
      this.logger.error(
        `Falha ao processar webhook Asaas (externalReference=${refLog}, paymentId=${payLog}); respondendo 5xx para o Asaas reenviar: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * Encerra destaques vencidos numa transação: pedidos ACTIVE vencidos viram
   * EXPIRED e veículos com featuredUntil vencido perdem o destaque. Veículos com
   * isFeatured e featuredUntil nulo (destaque manual do admin) não são tocados.
   */
  async expireFeaturedListings(
    now = new Date(),
  ): Promise<{ orders: number; vehicles: number }> {
    return this.prisma.$transaction(async (tx) => {
      const orders = await tx.featuredOrder.updateMany({
        where: { status: 'ACTIVE', expiresAt: { lt: now } },
        data: { status: 'EXPIRED' },
      });
      const vehicles = await tx.vehicle.updateMany({
        where: {
          isFeatured: true,
          featuredUntil: { not: null, lt: now },
        },
        data: { isFeatured: false, featuredUntil: null },
      });
      return { orders: orders.count, vehicles: vehicles.count };
    });
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await this.prisma.featuredOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.userId !== userId) throw new ForbiddenException();
    if (order.status !== 'PENDING')
      throw new BadRequestException(
        'Somente pedidos pendentes podem ser cancelados.',
      );

    const count = await this.cancelPendingOrderGuarded(order);
    if (count === null)
      throw new ServiceUnavailableException(CANCEL_FAILURE_MESSAGE);
    if (count === 0)
      throw new BadRequestException(
        'Somente pedidos pendentes podem ser cancelados.',
      );

    return this.prisma.featuredOrder.findUnique({ where: { id: orderId } });
  }

  /** Cancela pedidos PENDING com mais de 24h (cron). Retorna quantos foram cancelados. */
  async cancelStalePendingOrders(): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_ORDER_MS);
    const stale = await this.prisma.featuredOrder.findMany({
      where: { status: 'PENDING', createdAt: { lt: cutoff } },
      select: { id: true, paymentId: true },
    });

    let cancelled = 0;
    for (const order of stale) {
      try {
        const count = await this.cancelPendingOrderGuarded(order);
        if (count === null) continue; // cobrança não apagada: tenta na próxima hora
        cancelled += count;
      } catch (err) {
        this.logger.error(
          `Falha ao cancelar pedido vencido ${order.id}: ${(err as Error).message}`,
        );
      }
    }
    return cancelled;
  }

  /**
   * Apaga a cobrança Asaas (se houver) e só então cancela o pedido, com guarda
   * `status = PENDING` (o webhook pode ter ativado no meio). Só 404 do Asaas é
   * ignorado (cobrança já inexistente). Retorna null se a cobrança não pôde ser
   * apagada (pedido segue PENDING), senão o número de pedidos cancelados (0 = já
   * não estava PENDING).
   */
  private async cancelPendingOrderGuarded(order: {
    id: string;
    paymentId: string | null;
  }): Promise<number | null> {
    if (order.paymentId) {
      try {
        await this.asaas.deletePayment(order.paymentId);
      } catch (err) {
        if (!(err instanceof AsaasClientError && err.statusCode === 404)) {
          this.logger.warn(
            `Não foi possível apagar a cobrança Asaas ${order.paymentId} do pedido ${order.id}; pedido segue PENDING: ${(err as Error).message}`,
          );
          return null;
        }
      }
    }
    const result = await this.prisma.featuredOrder.updateMany({
      where: { id: order.id, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    return result.count;
  }

  async getMyOrders(userId: string) {
    return this.prisma.featuredOrder.findMany({
      where: { userId },
      include: {
        vehicle: {
          select: { id: true, title: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
