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

/** Consulta de CEP, geocodificação e FIPE: 30 por minuto por cliente. */
export const LOOKUPS_THROTTLE = {
  default: { ttl: 60000, limit: 30 },
};

/** Denúncia (POST /reports): 5 por hora por usuário. */
export const REPORT_CREATE_THROTTLE = {
  default: { ttl: 3600000, limit: 5 },
};

/** Mensagem de chat, REST (POST /chats/:id/messages) e WebSocket (chat:send): 30 por minuto por usuário. */
export const CHAT_MESSAGE_THROTTLE = {
  default: { ttl: 60000, limit: 30 },
};

/**
 * PROVISÓRIO: 60 por minuto por cliente nos POST de analytics.
 * Proposta ainda NÃO confirmada pelo dono. Ajustar aqui quando ele decidir.
 */
export const ANALYTICS_THROTTLE = {
  default: { ttl: 60000, limit: 60 },
};
