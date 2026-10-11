import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
export class FeaturedService {
  private readonly logger = new Logger(FeaturedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasClient,
    private readonly config: ConfigService,
  ) {}

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

  private async doActivateOrder(orderId: string) {
    const activatedAt = new Date();
    const order = await this.prisma.featuredOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const expiresAt = new Date(activatedAt);
    expiresAt.setDate(expiresAt.getDate() + order.durationDays);

    const [updatedOrder] = await this.prisma.$transaction([
      this.prisma.featuredOrder.update({
        where: { id: orderId },
        data: { status: 'ACTIVE', activatedAt, expiresAt },
      }),
      this.prisma.vehicle.update({
        where: { id: order.vehicleId },
        data: { isFeatured: true, featuredUntil: expiresAt },
      }),
    ]);

    return updatedOrder;
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
