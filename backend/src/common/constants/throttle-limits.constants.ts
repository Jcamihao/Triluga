/**
 * Limites do ThrottlerModule. Fonte única: app.module.ts e os decorators de rota
 * importam daqui, e throttle-limits.spec.ts lê os metadados dos controllers para
 * impedir remoção acidental.
 */

export interface ThrottleLimit {
  ttl: number;
  limit: number;
}

/**
 * Limite geral de cada cliente (usuário logado ou IP), por minuto.
 * Aprovado pelo dono: 120 req/min (antes 20).
 */
export const GLOBAL_THROTTLE: ThrottleLimit = { ttl: 60000, limit: 120 };
