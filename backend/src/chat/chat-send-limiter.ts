import { CHAT_MESSAGE_THROTTLE } from '../common/constants/throttle-limits.constants';

export interface ChatSendLimiterOptions {
  /** Mensagens permitidas por janela. Padrão: CHAT_MESSAGE_THROTTLE. */
  limit?: number;
  /** Tamanho da janela deslizante em ms. Padrão: CHAT_MESSAGE_THROTTLE. */
  windowMs?: number;
  /** Relógio injetável (ms). Padrão: Date.now. Usado nos testes. */
  now?: () => number;
}

/**
 * Janela deslizante por usuário para `chat:send` (WebSocket).
 *
 * Por que existe: o ThrottlerGuard global não roda nos handlers de gateway
 * (ver comentário em chat.gateway.ts), então o WebSocket precisa de limite próprio.
 *
 * Memória: entradas de usuários sem envio recente são removidas numa varredura
 * feita no máximo uma vez por janela. Assim o Map não cresce sem limite.
 *
 * Não é registrado como provider com classe porque o construtor recebe opções
 * (valores primitivos o Nest não injeta). O ChatModule usa factory.
 */
export class ChatSendLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly hits = new Map<string, number[]>();
  private lastSweep: number;

  constructor(options: ChatSendLimiterOptions = {}) {
    this.limit = options.limit ?? CHAT_MESSAGE_THROTTLE.default.limit;
    this.windowMs = options.windowMs ?? CHAT_MESSAGE_THROTTLE.default.ttl;
    this.now = options.now ?? (() => Date.now());
    this.lastSweep = this.now();
  }

  /** Devolve true se a mensagem pode passar e a registra. false = recusada (não conta). */
  consume(userId: string): boolean {
    const now = this.now();
    this.sweepIfDue(now);

    const windowStart = now - this.windowMs;
    const recent = (this.hits.get(userId) ?? []).filter((t) => t > windowStart);

    if (recent.length >= this.limit) {
      this.hits.set(userId, recent);
      return false;
    }

    recent.push(now);
    this.hits.set(userId, recent);
    return true;
  }

  private sweepIfDue(now: number): void {
    if (now - this.lastSweep < this.windowMs) {
      return;
    }

    this.lastSweep = now;
    const windowStart = now - this.windowMs;

    for (const [userId, times] of this.hits) {
      const recent = times.filter((t) => t > windowStart);
      if (recent.length === 0) {
        this.hits.delete(userId);
      } else {
        this.hits.set(userId, recent);
      }
    }
  }
}
