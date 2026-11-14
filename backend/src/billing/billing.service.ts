import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Subscription,
  SubscriptionSource,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { pickEffectivePlan, subscriptionGrantsAccess } from './access.util';
import { CreateGrantDto } from './dto/create-grant.dto';
import { EntitlementsService, EntitlementsUsage } from './entitlements.service';
import { getCatalog, PlanDefinition, PlanId } from './plans.catalog';

export interface PlanView {
  id: PlanId;
  label: string;
  adLimit: number | null;
  sellable: boolean;
  prices: PlanDefinition['prices'];
}

export interface BillingMeView {
  enabled: boolean;
  plan: PlanId;
  status: SubscriptionStatus | null;
  source: SubscriptionSource | null;
  interval: Subscription['interval'];
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  latestInvoiceUrl: string | null;
  usage: EntitlementsUsage;
}

export interface GrantView {
  id: string;
  email: string;
  plan: Subscription['plan'];
  currentPeriodEnd: string | null;
  status: SubscriptionStatus;
  createdAt: string;
}

interface GrantRow {
  id: string;
  plan: Subscription['plan'];
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  createdAt: Date;
  owner: { email: string };
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly configService: ConfigService,
  ) {}

  private isEnabled(): boolean {
    return this.configService.get<boolean>('billing.enabled') === true;
  }

  getPlans(): { enabled: boolean; plans: PlanView[] } {
    const catalog = getCatalog();
    return {
      enabled: this.isEnabled(),
      plans: (['FREE', 'PROFESSIONAL', 'FLEET'] as const).map((id) => {
        const p = catalog[id];
        return {
          id: p.id,
          label: p.label,
          adLimit: p.adLimit,
          sellable: p.sellable,
          prices: p.prices,
        };
      }),
    };
  }

  async getMe(userId: string): Promise<BillingMeView> {
    const now = new Date();
    // Linhas inteiras (com `source`): concessão não tem tolerância de atraso.
    const subscriptions = await this.prisma.subscription.findMany({
      where: { ownerUserId: userId },
    });
    const plan = pickEffectivePlan(subscriptions, now);

    // Assinatura que sustenta o plano efetivo (a de maior fim; sem fim conta como o maior).
    const effective = subscriptions
      .filter((s) => subscriptionGrantsAccess(s, now) && s.plan === plan)
      .sort(
        (a, b) =>
          (b.currentPeriodEnd?.getTime() ?? Infinity) -
          (a.currentPeriodEnd?.getTime() ?? Infinity),
      )[0];

    const usage = await this.entitlements.getUsage(userId);

    return {
      enabled: this.isEnabled(),
      plan,
      status: effective?.status ?? null,
      source: effective?.source ?? null,
      interval: effective?.interval ?? null,
      currentPeriodEnd: effective?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: effective?.cancelAtPeriodEnd ?? false,
      latestInvoiceUrl: effective?.latestInvoiceUrl ?? null,
      usage,
    };
  }

  async listGrants(): Promise<GrantView[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { source: 'GRANT' },
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { email: true } } },
    });
    return rows.map((row) => this.toGrantView(row));
  }

  async createGrant(
    adminUserId: string,
    dto: CreateGrantDto,
  ): Promise<GrantView> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    if (!user) {
      throw new NotFoundException('Nenhum usuário encontrado com esse e-mail.');
    }

    const now = new Date();
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (endsAt && endsAt.getTime() <= now.getTime()) {
      throw new BadRequestException(
        'A data de fim da concessão deve estar no futuro.',
      );
    }

    const existing = await this.prisma.subscription.findFirst({
      where: {
        ownerUserId: user.id,
        source: 'GRANT',
        plan: dto.plan,
        status: 'ACTIVE',
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
      },
    });
    if (existing) {
      throw new BadRequestException(
        'Esse usuário já tem uma concessão ativa desse plano.',
      );
    }

    const created = await this.prisma.subscription.create({
      data: {
        ownerUserId: user.id,
        plan: dto.plan,
        source: 'GRANT',
        status: 'ACTIVE',
        currentPeriodEnd: endsAt,
        grantedByUserId: adminUserId,
      },
    });
    return this.toGrantView({ ...created, owner: { email: user.email } });
  }

  async revokeGrant(grantId: string): Promise<GrantView> {
    const grant = await this.prisma.subscription.findUnique({
      where: { id: grantId },
      include: { owner: { select: { email: true } } },
    });
    if (!grant) {
      throw new NotFoundException('Concessão não encontrada.');
    }
    if (grant.source !== 'GRANT') {
      throw new BadRequestException(
        'Só concessões manuais podem ser revogadas aqui.',
      );
    }

    // Mantém a linha (histórico); status EXPIRED já não dá acesso.
    const updated = await this.prisma.subscription.update({
      where: { id: grantId },
      data: { status: 'EXPIRED' },
      include: { owner: { select: { email: true } } },
    });
    return this.toGrantView(updated);
  }

  private toGrantView(row: GrantRow): GrantView {
    return {
      id: row.id,
      email: row.owner.email,
      plan: row.plan,
      currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
