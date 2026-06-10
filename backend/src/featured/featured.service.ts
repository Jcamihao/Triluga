import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeaturedOrderDto } from './dto/create-featured-order.dto';
import { FEATURED_PLANS } from './featured.constants';
import { EfipayService } from './efipay.service';

@Injectable()
export class FeaturedService {
  private readonly logger = new Logger(FeaturedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly efipay: EfipayService,
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

    const description = `Destaque Triluga — ${vehicle.title} (${plan.name})`;

    const pixCharge = await this.efipay.createPixCharge(plan.price, description);

    const order = await this.prisma.featuredOrder.create({
      data: {
        vehicleId: dto.vehicleId,
        userId,
        planId: plan.id,
        durationDays: plan.durationDays,
        price: plan.price,
        pixKey: pixCharge ? null : this.efipay.staticPixKey,
        txid: pixCharge?.txid ?? null,
        pixCopiaECola: pixCharge?.pixCopiaECola ?? null,
      },
    });

    return {
      order,
      payment: {
        pixKey: pixCharge ? null : this.efipay.staticPixKey,
        pixKeyType: pixCharge ? null : 'email',
        amount: plan.price,
        description,
        pixCopiaECola: pixCharge?.pixCopiaECola ?? null,
        qrCodeImage: pixCharge?.qrCodeImage ?? null,
        instructions: pixCharge
          ? 'Escaneie o QR Code ou copie o código PIX para efetuar o pagamento. O destaque será ativado automaticamente após a confirmação.'
          : 'Após o pagamento, aguarde a confirmação automática do destaque.',
      },
    };
  }

  private async doActivateOrder(orderId: string) {
    const activatedAt = new Date();
    const order = await this.prisma.featuredOrder.findUnique({ where: { id: orderId } });
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

  async handlePixWebhook(token: string, payload: any) {
    const expectedToken = this.config.get<string>('efipay.webhookToken');
    if (expectedToken && token !== expectedToken) {
      throw new ForbiddenException('Invalid webhook token');
    }

    const pixPayments: Array<{ txid?: string; status?: string }> = payload?.pix ?? [];

    let activated = 0;
    for (const pix of pixPayments) {
      if (!pix.txid || pix.status !== 'CONCLUIDA') continue;
      const order = await this.prisma.featuredOrder.findFirst({
        where: { txid: pix.txid, status: 'PENDING' },
      });
      if (!order) continue;

      try {
        await this.doActivateOrder(order.id);
        activated++;
        this.logger.log(`Order ${order.id} activated via Efipay webhook (txid: ${pix.txid})`);
      } catch (err) {
        this.logger.error(`Failed to activate order ${order.id}`, err);
      }
    }

    return { ok: true, activated };
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await this.prisma.featuredOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.userId !== userId) throw new ForbiddenException();
    if (order.status !== 'PENDING')
      throw new BadRequestException('Somente pedidos pendentes podem ser cancelados.');

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
