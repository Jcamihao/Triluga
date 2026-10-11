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
import { AsaasClient } from './asaas.client';
import { CreateFeaturedOrderDto } from './dto/create-featured-order.dto';
import { FEATURED_PLANS } from './featured.constants';

const MISSING_DOCUMENT_MESSAGE =
  'Complete seu CPF/CNPJ no perfil para pagar o destaque.';
const PIX_FAILURE_MESSAGE =
  'Não foi possível gerar o PIX agora. Tente novamente em instantes.';

function tomorrowIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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

    const existing = await this.prisma.featuredOrder.findFirst({
      where: {
        vehicleId: dto.vehicleId,
        status: { in: ['PENDING', 'ACTIVE'] },
      },
    });
    if (existing)
      throw new BadRequestException(
        'Este veículo já possui um destaque ativo ou pendente de pagamento.',
      );

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

    const order = await this.prisma.featuredOrder.create({
      data: {
        vehicleId: dto.vehicleId,
        userId,
        planId: plan.id,
        durationDays: plan.durationDays,
        price: plan.price,
      },
    });

    let asaasPaymentId: string | null = null;
    try {
      const customer =
        (await this.asaas.findCustomerByExternalReference(userId)) ??
        (await this.asaas.createCustomer({
          name: owner.profile?.fullName ?? owner.email,
          cpfCnpj,
          email: owner.email,
          externalReference: userId,
        }));

      const pixPayment = await this.asaas.createPixPayment({
        customer: customer.id,
        value: plan.price,
        dueDate: tomorrowIsoDate(),
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
          qrCodeImage: qr.encodedImage
            ? `data:image/png;base64,${qr.encodedImage}`
            : null,
          instructions:
            'Escaneie o QR Code ou copie o código PIX para efetuar o pagamento. O destaque será ativado automaticamente após a confirmação.',
        },
      };
    } catch (err) {
      this.logger.error(
        `Falha ao gerar PIX Asaas para o pedido ${order.id}: ${(err as Error).message}`,
      );
      await this.rollbackFailedOrder(order.id, asaasPaymentId);
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

    if (order.paymentId) {
      try {
        await this.asaas.deletePayment(order.paymentId);
      } catch (err) {
        this.logger.warn(
          `Não foi possível apagar a cobrança Asaas ${order.paymentId} do pedido ${orderId}: ${(err as Error).message}`,
        );
      }
    }

    return this.prisma.featuredOrder.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    });
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
