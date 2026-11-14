import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Subscription } from '@prisma/client';
import { AsaasClient } from '../asaas/asaas.client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { getCatalog, PLAN_RANK } from './plans.catalog';

// Mesma janela do checkout RECURRENT do Asaas: depois disso o link expira do lado deles
// e nao pode mais ser reaproveitado.
const CHECKOUT_MINUTES_TO_EXPIRE = 60;

@Injectable()
export class BillingPaymentsService {
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
        await this.asaasClient.deleteSubscription(local.asaasSubscriptionId);
      }

      // currentPeriodEnd não muda: o acesso segue até o fim do período já pago.
      await this.prisma.subscription.update({
        where: { id: local.id },
        data: { status: 'CANCELED', cancelAtPeriodEnd: true },
      });
    }
  }

  /**
   * Deriva o estado local apenas de `deleted` e `nextDueDate`. Webhook e `sync` usam esta
   * mesma função, então os dois caminhos não podem divergir.
   */
  async reconcileSubscription(local: Subscription): Promise<void> {
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
      await this.prisma.subscription.update({
        where: { id: local.id },
        data: {
          status: 'ACTIVE',
          currentPeriodEnd: nextDueDate,
          pastDueSince: null,
        },
      });
      return;
    }

    await this.prisma.subscription.update({
      where: { id: local.id },
      data: {
        status: 'PAST_DUE',
        pastDueSince: local.pastDueSince ?? new Date(),
      },
    });
  }
}
