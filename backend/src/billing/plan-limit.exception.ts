import { ForbiddenException } from '@nestjs/common';
import { PlanId, getPlan } from './plans.catalog';

export class PlanLimitException extends ForbiddenException {
  constructor(input: { limit: number; used: number; plan: PlanId }) {
    const label = getPlan(input.plan).label;
    super({
      statusCode: 403,
      error: 'Forbidden',
      code: 'PLAN_LIMIT',
      limit: input.limit,
      used: input.used,
      plan: input.plan,
      message: `Você atingiu o limite de ${input.limit} anúncios do plano ${label}. Veja os planos em Plano.`,
    });
  }
}
