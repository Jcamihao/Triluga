import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { pickEffectivePlan } from './access.util';
import { PlanLimitException } from './plan-limit.exception';
import { getPlan, PlanId } from './plans.catalog';

export interface AdsUsage {
  used: number;
  limit: number | null;
}

export interface EntitlementsUsage {
  enforced: boolean;
  plan: PlanId;
  ads: AdsUsage;
}

@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  isEnforced(): boolean {
    return this.configService.get<boolean>('billing.enabled') === true;
  }

  async resolvePlan(userId: string): Promise<PlanId> {
    // Linhas inteiras (com `source`): concessão não tem tolerância de atraso.
    const subscriptions = await this.prisma.subscription.findMany({
      where: { ownerUserId: userId },
    });
    return pickEffectivePlan(subscriptions, new Date());
  }

  async getUsage(userId: string): Promise<EntitlementsUsage> {
    const plan = await this.resolvePlan(userId);
    const used = await this.countPublishedAds(userId);
    return {
      enforced: this.isEnforced(),
      plan,
      ads: { used, limit: getPlan(plan).adLimit },
    };
  }

  /**
   * Bloqueia a publicação de um anúncio que passa a contar (ativo e publicado)
   * quando o plano efetivo já atingiu o limite. Com a flag desligada nunca lança.
   * Verificar-e-publicar não é atômico: sob criações concorrentes o limite pode
   * ser excedido em 1, o que é aceito.
   */
  async assertCanPublish(userId: string): Promise<void> {
    if (!this.isEnforced()) return;

    const plan = await this.resolvePlan(userId);
    const limit = getPlan(plan).adLimit;
    if (limit === null) return;

    const used = await this.countPublishedAds(userId);
    if (used >= limit) {
      throw new PlanLimitException({ limit, used, plan });
    }
  }

  private countPublishedAds(userId: string): Promise<number> {
    return this.prisma.vehicle.count({
      where: { ownerId: userId, isActive: true, isPublished: true },
    });
  }
}
